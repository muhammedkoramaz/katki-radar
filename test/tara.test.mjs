import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, publishReport, openPrRepos } from '../scripts/tara.mjs';

const config = {
  kullanici: 'me', konular: ['a11y'], diller: ['TypeScript'],
  yildiz: { min: 100, max: 30000, idealMin: 500, idealMax: 10000 },
  sonPushGun: 90, maksRepo: 80,
  kodEtiketleri: ['good first issue', 'help wanted'], dokumanEtiketleri: ['documentation', 'docs'],
  haftalikKota: { ceviri: 4, kod: 4, dokuman: 2 }, ceviriEksikEsik: 0.7, minDigerDil: 3,
};

function fakeClient({ openPrs = [] } = {}) {
  const repoApi = {
    full_name: 'o/r', html_url: 'https://github.com/o/r', default_branch: 'main', stargazers_count: 800,
    topics: ['a11y'], language: 'TypeScript', pushed_at: '2026-09-20T00:00:00Z', archived: false,
  };
  const banned = { ...repoApi, full_name: 'o/ban', html_url: 'https://github.com/o/ban' };
  const issue = {
    number: 7, title: 'Add alt text', html_url: 'https://github.com/o/r/issues/7', body: 'b',
    created_at: '2026-09-18T00:00:00Z', comments: 0, labels: [{ name: 'good first issue' }],
    repository_url: 'https://api.github.com/repos/o/r',
  };
  const calls = [];
  return {
    calls,
    stats: { requests: 0 },
    search: async (kind, q) => {
      if (kind === 'repositories') return [repoApi, banned];
      if (q.startsWith('is:pr')) return openPrs;
      if (q.includes('"good first issue"')) return [issue];
      return [];
    },
    request: async (p, opts = {}) => {
      calls.push([opts.method ?? 'GET', p]);
      if (p === '/repos/o/ban/contents/CONTRIBUTING.md') return 'We do not accept AI-generated code.';
      if (p.endsWith('/readme')) return 'readme';
      if (p.startsWith('/repos/o/r/pulls')) return [{ merged_at: 'x', author_association: 'CONTRIBUTOR' }];
      if (p.startsWith('/repos/o/r/git/trees/')) {
        return { tree: ['locales/en.json', 'locales/de.json', 'locales/fr.json', 'locales/es.json'].map((path) => ({ path, type: 'blob' })) };
      }
      if (p.includes('/labels/firsatlar')) return { name: 'firsatlar' };
      if (p.includes('/issues?labels=')) return [];
      if (opts.method === 'POST') return { number: 1 };
      return null;
    },
  };
}

test('run (dry-run) çeviri + kod fırsatlarını bulur, yasaklı repoyu eler', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'katki-'));
  const outputs = [];
  const { selected } = await run({
    client: fakeClient(), config, now: new Date('2026-09-23T00:00:00Z'), dryRun: true,
    seenPath: join(dir, 'gorulen.json'), log: () => {}, out: (s) => outputs.push(s),
  });
  assert.deepEqual(selected.map((o) => o.key).sort(), ['o/r#7', 'o/r:tr']);
  assert.match(outputs[0], /AI yasağı nedeniyle elenen: 1/);
  await assert.rejects(readFile(join(dir, 'gorulen.json'), 'utf8'));
});

test('run politika isteği hata verirse o repoyu eler ve başarısızlar listesine ekler', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'katki-'));
  const client = fakeClient();
  const baseRequest = client.request;
  client.request = async (p, opts) => {
    if (p === '/repos/o/r/contents/CONTRIBUTING.md') throw new Error('kapalı');
    return baseRequest(p, opts);
  };
  const { selected, body } = await run({
    client, config, now: new Date('2026-09-23T00:00:00Z'), dryRun: true,
    seenPath: join(dir, 'gorulen.json'), log: () => {}, out: () => {},
  });
  assert.equal(selected.some((o) => o.repo.fullName === 'o/r'), false);
  const failuresSection = body.slice(body.indexOf('Başarısız sorgular'));
  assert.match(failuresSection, /o\/r/);
});

test('run keşif tamamen başarısız olursa yayınlamadan önce fırlatır', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'katki-'));
  const seenPath = join(dir, 'gorulen.json');
  const calls = [];
  const client = {
    calls,
    stats: { requests: 0 },
    search: async (kind) => {
      if (kind === 'repositories') throw new Error('boom');
      return [];
    },
    request: async (p, opts = {}) => { calls.push([opts.method ?? 'GET', p]); return null; },
  };
  await assert.rejects(
    run({
      client, config, now: new Date('2026-09-23T00:00:00Z'), dryRun: false, selfRepo: 'me/katki-radar',
      seenPath, log: () => {}, out: () => {},
    }),
    /Keşif başarısız/,
  );
  assert.equal(calls.some(([m]) => m === 'POST' || m === 'PATCH'), false);
  await assert.rejects(readFile(seenPath, 'utf8'));
});

test('run API bütçesi azaldığında kalan repoları atlar', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'katki-'));
  const client = fakeClient();
  client.stats.remaining = 10;
  const { body } = await run({
    client, config, now: new Date('2026-09-23T00:00:00Z'), dryRun: true,
    seenPath: join(dir, 'gorulen.json'), log: () => {}, out: () => {},
  });
  assert.equal(client.calls.length, 0);
  assert.match(body, /API bütçesi azaldı, kalan repolar atlandı/);
});

test('run açık PRı olan repoyu atlar', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'katki-'));
  const openPrs = [{ repository_url: 'https://api.github.com/repos/O/R' }];
  const { selected } = await run({
    client: fakeClient({ openPrs }), config, now: new Date('2026-09-23T00:00:00Z'), dryRun: true,
    seenPath: join(dir, 'gorulen.json'), log: () => {}, out: () => {},
  });
  assert.deepEqual(selected, []);
});

test('run (gerçek mod) issue açar ve gorulen.json yazar; ikinci çalıştırma tekrar göstermez', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'katki-'));
  const seenPath = join(dir, 'gorulen.json');
  const client = fakeClient();
  const args = { client, config, now: new Date('2026-09-23T00:00:00Z'), dryRun: false, selfRepo: 'me/katki-radar', seenPath, log: () => {}, out: () => {} };
  await run(args);
  assert.ok(client.calls.some(([m, p]) => m === 'POST' && p === '/repos/me/katki-radar/issues'));
  const seen = JSON.parse(await readFile(seenPath, 'utf8'));
  assert.deepEqual(Object.keys(seen).sort(), ['o/r#7', 'o/r:tr']);
  const second = await run(args);
  assert.deepEqual(second.selected, []);
  assert.match(second.body, /Daha önce gösterilen: 2/);
});

test('openPrRepos küçük harfli owner/repo kümesi döndürür', async () => {
  const client = { search: async (kind, q) => { assert.equal(q, 'is:pr is:open author:me'); return [{ repository_url: 'https://api.github.com/repos/O/R' }]; } };
  assert.deepEqual([...(await openPrRepos(client, 'me'))], ['o/r']);
});

test('publishReport etiketi oluşturur, eski issueları kapatır, yenisini açar', async () => {
  const calls = [];
  const client = {
    request: async (p, o = {}) => {
      calls.push([o.method ?? 'GET', p]);
      if (p.endsWith('/labels/firsatlar')) return null;
      if (p.includes('/issues?labels=')) return [{ number: 3 }];
      return { number: 9 };
    },
  };
  await publishReport(client, 'me/katki-radar', 'T', 'B');
  assert.deepEqual(calls, [
    ['GET', '/repos/me/katki-radar/labels/firsatlar'],
    ['POST', '/repos/me/katki-radar/labels'],
    ['GET', '/repos/me/katki-radar/issues?labels=firsatlar&state=open&per_page=100'],
    ['PATCH', '/repos/me/katki-radar/issues/3'],
    ['POST', '/repos/me/katki-radar/issues'],
  ]);
});
