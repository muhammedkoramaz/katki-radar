import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../scripts/lib/github.mjs';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function setup(responses, { now } = {}) {
  const sleeps = [];
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  const client = createClient({
    token: 't', fetchImpl, sleep: async (ms) => { sleeps.push(ms); }, log: () => {}, searchIntervalMs: 0,
    ...(now ? { now } : {}),
  });
  return { client, sleeps, calls };
}

test('request başlıkları ekler ve JSON döndürür', async () => {
  const { client, calls } = setup([json({ ok: 1 })]);
  assert.deepEqual(await client.request('/x'), { ok: 1 });
  assert.equal(calls[0].url, 'https://api.github.com/x');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer t');
  assert.equal(calls[0].init.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(client.stats.requests, 1);
});

test('request POST gövdesini JSON olarak gönderir', async () => {
  const { client, calls } = setup([json({ number: 1 }, 201)]);
  await client.request('/y', { method: 'POST', body: { a: 1 } });
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, '{"a":1}');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
});

test('404 null döner', async () => {
  const { client } = setup([new Response('yok', { status: 404 })]);
  assert.equal(await client.request('/x'), null);
});

test('5xx sonrası üstel bekleme ile tekrar dener', async () => {
  const { client, sleeps } = setup([new Response('', { status: 502 }), new Response('', { status: 503 }), json([1])]);
  assert.deepEqual(await client.request('/x'), [1]);
  assert.deepEqual(sleeps, [2000, 4000]);
});

test('403 + retry-after başlığına uyar', async () => {
  const { client, sleeps } = setup([new Response('', { status: 403, headers: { 'retry-after': '5' } }), json({})]);
  await client.request('/x');
  assert.deepEqual(sleeps, [5000]);
});

test('sürekli hata 3 tekrardan sonra fırlatır', async () => {
  const { client, sleeps } = setup([502, 502, 502, 502].map((s) => new Response('kötü', { status: s })));
  await assert.rejects(client.request('/x'), /502/);
  assert.deepEqual(sleeps, [2000, 4000, 8000]);
});

test('403 secondary rate limit gövdesinde 60 sn bekleyip tekrar dener', async () => {
  const { client, sleeps } = setup([
    new Response('{"message":"You have exceeded a secondary rate limit."}', { status: 403 }),
    json({}),
  ]);
  await client.request('/x');
  assert.deepEqual(sleeps, [60000]);
});

test('403 izin hatası tekrar denenmez', async () => {
  const { client, sleeps } = setup([
    new Response('{"message":"Resource not accessible"}', { status: 403 }),
  ]);
  await assert.rejects(client.request('/x'), (err) => err.status === 403);
  assert.deepEqual(sleeps, []);
});

test('422 gibi istemci hataları tekrar denenmeden fırlatılır', async () => {
  const { client, sleeps } = setup([new Response('invalid', { status: 422 })]);
  await assert.rejects(client.request('/x'), (err) => err.status === 422);
  assert.deepEqual(sleeps, []);
});

test('ağ hatasında tekrar dener', async () => {
  const { client, sleeps } = setup([new TypeError('fetch failed'), json({ ok: true })]);
  assert.deepEqual(await client.request('/x'), { ok: true });
  assert.deepEqual(sleeps, [2000]);
});

test('raw metin döndürür ve raw Accept kullanır', async () => {
  const { client, calls } = setup([new Response('# Merhaba')]);
  assert.equal(await client.request('/r', { raw: true }), '# Merhaba');
  assert.equal(calls[0].init.headers.Accept, 'application/vnd.github.raw');
});

test('search sorguyu kodlar ve items döndürür', async () => {
  const { client, calls } = setup([json({ items: [{ id: 1 }] })]);
  assert.deepEqual(await client.search('issues', 'label:"a"', { perPage: 5 }), [{ id: 1 }]);
  assert.equal(calls[0].url, 'https://api.github.com/search/issues?q=label%3A%22a%22&per_page=5');
});

test('search sort parametresini ekler', async () => {
  const { client, calls } = setup([json({ items: [] })]);
  await client.search('repositories', 'x', { sort: 'updated' });
  assert.equal(calls[0].url, 'https://api.github.com/search/repositories?q=x&per_page=10&sort=updated&order=desc');
});

test('birincil hız sınırı: reset yakınsa bekleyip tekrar dener', async () => {
  const fixedNow = 1_700_000_000_000;
  const resetSeconds = fixedNow / 1000 + 120; // 2 dakika ileride
  const { client, sleeps } = setup([
    new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetSeconds) } }),
    json({ ok: 1 }),
  ], { now: () => fixedNow });
  assert.deepEqual(await client.request('/x'), { ok: 1 });
  assert.deepEqual(sleeps, [121000]);
});

test('birincil hız sınırı: reset çok uzaksa hemen fırlatır', async () => {
  const fixedNow = 1_700_000_000_000;
  const resetSeconds = fixedNow / 1000 + 1800; // 30 dakika ileride
  const { client, sleeps } = setup([
    new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetSeconds) } }),
  ], { now: () => fixedNow });
  await assert.rejects(client.request('/x'), (err) => err.status === 403);
  assert.deepEqual(sleeps, []);
});

test('stats.remaining normal yanıtın başlığından güncellenir', async () => {
  const { client } = setup([json({ ok: 1 }, 200, { 'x-ratelimit-remaining': '42' })]);
  assert.equal(client.stats.remaining, Infinity);
  await client.request('/x');
  assert.equal(client.stats.remaining, 42);
});
