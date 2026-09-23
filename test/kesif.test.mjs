import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoDate, buildRepoQueries, normalizeRepo, discoverRepos } from '../scripts/lib/kesif.mjs';

const now = new Date('2026-09-23T00:00:00Z');

test('isoDate YYYY-MM-DD döndürür', () => {
  assert.equal(isoDate(now), '2026-09-23');
});

test('buildRepoQueries konu × dil sorguları üretir', () => {
  const qs = buildRepoQueries(
    { konular: ['a11y', 'privacy'], diller: ['Python'], yildiz: { min: 100, max: 30000 }, sonPushGun: 90 }, now,
  );
  assert.deepEqual(qs, [
    'topic:a11y language:Python stars:100..30000 pushed:>=2026-06-25 archived:false',
    'topic:privacy language:Python stars:100..30000 pushed:>=2026-06-25 archived:false',
  ]);
});

const apiRepo = (name, pushed, archived = false) => ({
  full_name: name, html_url: `https://github.com/${name}`, default_branch: 'main', stargazers_count: 500,
  topics: ['a11y'], language: 'Python', pushed_at: pushed, archived,
});

test('normalizeRepo alanları eşler', () => {
  assert.deepEqual(normalizeRepo(apiRepo('o/a', '2026-09-01T00:00:00Z')), {
    fullName: 'o/a', htmlUrl: 'https://github.com/o/a', defaultBranch: 'main', stars: 500,
    topics: ['a11y'], language: 'Python', pushedAt: '2026-09-01T00:00:00Z', archived: false,
  });
});

test('discoverRepos tekilleştirir, arşivlenmişi atar, sıralar, sınırlar ve hataları toplar', async () => {
  let call = 0;
  const client = {
    search: async () => {
      call++;
      if (call === 1) return [apiRepo('o/a', '2026-09-01T00:00:00Z'), apiRepo('o/b', '2026-09-10T00:00:00Z'), apiRepo('o/z', '2026-09-15T00:00:00Z', true)];
      if (call === 2) throw new Error('boom');
      return [apiRepo('o/a', '2026-09-01T00:00:00Z'), apiRepo('o/c', '2026-09-05T00:00:00Z')];
    },
  };
  const config = { konular: ['a11y', 'privacy', 'edu'], diller: ['Python'], yildiz: { min: 100, max: 30000 }, sonPushGun: 90, maksRepo: 2 };
  const { repos, failures } = await discoverRepos({ client, config, now });
  assert.deepEqual(repos.map((r) => r.fullName), ['o/b', 'o/c']);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /boom/);
});
