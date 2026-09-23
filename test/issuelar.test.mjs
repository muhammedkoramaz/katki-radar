import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIssueQueries, isClaimed, hasMaintainerComment, issueType, repoFromIssue, findIssueOpportunities,
} from '../scripts/lib/issuelar.mjs';

const now = new Date('2026-09-23T00:00:00Z');
const config = { kodEtiketleri: ['good first issue', 'help wanted'], dokumanEtiketleri: ['documentation', 'docs'] };

test('buildIssueQueries 5li gruplar ve etiket OR sorgusu üretir', () => {
  const qs = buildIssueQueries(['a/1', 'a/2', 'a/3', 'a/4', 'a/5', 'a/6'], ['good first issue', 'help wanted']);
  assert.equal(qs.length, 2);
  assert.equal(qs[0].startsWith('repo:a/1 repo:a/2 repo:a/3 repo:a/4 repo:a/5 is:issue'), true);
  assert.equal(qs[1], 'repo:a/6 is:issue is:open no:assignee -linked:pr label:"good first issue","help wanted"');
});

test('isClaimed son 30 gündeki sahiplenme yorumunu yakalar', () => {
  assert.equal(isClaimed([{ created_at: '2026-09-10T00:00:00Z', body: 'Hi, I’d like to work on this!' }], now), true);
  assert.equal(isClaimed([{ created_at: '2026-07-01T00:00:00Z', body: 'can I work on this?' }], now), false);
  assert.equal(isClaimed([{ created_at: '2026-09-10T00:00:00Z', body: 'Same bug here' }], now), false);
});

test('hasMaintainerComment OWNER/MEMBER/COLLABORATOR arar', () => {
  assert.equal(hasMaintainerComment([{ author_association: 'NONE' }, { author_association: 'COLLABORATOR' }]), true);
  assert.equal(hasMaintainerComment([{ author_association: 'CONTRIBUTOR' }]), false);
});

test('issueType doküman etiketine öncelik verir', () => {
  assert.equal(issueType({ labels: [{ name: 'Good First Issue' }] }, config), 'kod');
  assert.equal(issueType({ labels: [{ name: 'docs' }, { name: 'help wanted' }] }, config), 'dokuman');
  assert.equal(issueType({ labels: [{ name: 'bug' }] }, config), null);
});

test('repoFromIssue repository_url içinden owner/repo çıkarır', () => {
  assert.equal(repoFromIssue({ repository_url: 'https://api.github.com/repos/o/r' }), 'o/r');
});

test('findIssueOpportunities adayları toplar, dolu olanları eler, tekrarı önler', async () => {
  const repo = { fullName: 'o/r', htmlUrl: 'https://github.com/o/r' };
  const base = { body: 'x', created_at: '2026-09-13T00:00:00Z', repository_url: 'https://api.github.com/repos/o/r' };
  const items = [
    { ...base, number: 1, title: 'Fix a', html_url: 'https://github.com/o/r/issues/1', comments: 0, labels: [{ name: 'good first issue' }] },
    { ...base, number: 2, title: 'Fix b', html_url: 'https://github.com/o/r/issues/2', comments: 1, labels: [{ name: 'help wanted' }] },
    { ...base, number: 3, title: 'Docs', html_url: 'https://github.com/o/r/issues/3', comments: 1, labels: [{ name: 'documentation' }, { name: 'good first issue' }] },
  ];
  const client = {
    search: async (kind, q) => (q.includes('"documentation"') ? [items[2]] : items),
    request: async (p) => (p.includes('/issues/2/')
      ? [{ created_at: '2026-09-20T00:00:00Z', body: 'I am working on it', author_association: 'NONE' }]
      : [{ created_at: '2026-09-01T00:00:00Z', body: 'Confirmed', author_association: 'MEMBER' }]),
  };
  const { opps, failures, claimed } = await findIssueOpportunities({ client, repos: [repo], config, now, log: () => {} });
  assert.deepEqual(opps.map((o) => [o.key, o.tur]), [['o/r#1', 'kod'], ['o/r#3', 'dokuman']]);
  assert.equal(claimed, 1);
  assert.equal(opps[0].neden, '10 gün önce açıldı');
  assert.equal(opps[1].neden, '10 gün önce açıldı, maintainer ilgilenmiş');
  assert.equal(opps[1].detay.maintainerYorumu, true);
  assert.equal(opps[0].repo, repo);
  assert.deepEqual(failures, []);
});

test('findIssueOpportunities başarısız aramayı failures listesine ekler', async () => {
  const client = { search: async () => { throw new Error('boom'); }, request: async () => [] };
  const { opps, failures } = await findIssueOpportunities({ client, repos: [{ fullName: 'o/r' }], config, now, log: () => {} });
  assert.deepEqual(opps, []);
  assert.equal(failures.length, 2);
  assert.match(failures[0], /boom/);
});
