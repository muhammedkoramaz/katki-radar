export const CLAIM_PATTERNS = [
  'work on this', 'take this', 'pick this up', 'assign me', 'assign this to me',
  "i'll take", "i'd like to", 'can i work', 'i am working', "i'm working",
];
const MAINTAINER = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const DAY = 864e5;

export function buildIssueQueries(fullNames, labels, groupSize = 5) {
  const labelQuery = `label:${labels.map((l) => `"${l}"`).join(',')}`;
  const queries = [];
  for (let i = 0; i < fullNames.length; i += groupSize) {
    const repos = fullNames.slice(i, i + groupSize).map((n) => `repo:${n}`).join(' ');
    queries.push(`${repos} is:issue is:open no:assignee -linked:pr ${labelQuery}`);
  }
  return queries;
}

export function isClaimed(comments, now, days = 30) {
  const since = now.getTime() - days * DAY;
  return comments.some((c) => {
    if (new Date(c.created_at).getTime() < since) return false;
    const body = (c.body ?? '').toLowerCase().replace(/[‘’]/g, "'");
    return CLAIM_PATTERNS.some((p) => body.includes(p));
  });
}

export function hasMaintainerComment(comments) {
  return comments.some((c) => MAINTAINER.has(c.author_association));
}

const labelNames = (item) => item.labels.map((l) => (typeof l === 'string' ? l : l.name).toLowerCase());

export function issueType(item, config) {
  const labels = labelNames(item);
  if (config.dokumanEtiketleri.some((l) => labels.includes(l))) return 'dokuman';
  if (config.kodEtiketleri.some((l) => labels.includes(l))) return 'kod';
  return null;
}

export function repoFromIssue(item) {
  return item.repository_url.split('/').slice(-2).join('/');
}

export async function findIssueOpportunities({ client, repos, config, now, log = (m) => console.error(m) }) {
  const byName = new Map(repos.map((r) => [r.fullName.toLowerCase(), r]));
  const names = repos.map((r) => r.fullName);
  const opps = [];
  const failures = [];
  const handled = new Set();
  let claimed = 0;

  for (const labels of [config.kodEtiketleri, config.dokumanEtiketleri]) {
    for (const q of buildIssueQueries(names, labels)) {
      let items;
      try {
        items = await client.search('issues', q, { perPage: 50 });
      } catch (err) {
        failures.push(`issue araması: ${q.slice(0, 80)}… (${err.message})`);
        continue;
      }
      for (const item of items) {
        const fullName = repoFromIssue(item);
        const repo = byName.get(fullName.toLowerCase());
        const tur = issueType(item, config);
        const key = `${fullName}#${item.number}`;
        if (!repo || !tur || handled.has(key)) continue;
        handled.add(key);

        let comments = [];
        if (item.comments > 0) {
          try {
            comments = (await client.request(`/repos/${fullName}/issues/${item.number}/comments?per_page=100`)) ?? [];
          } catch (err) {
            log(`[issue] ${key} yorumları alınamadı: ${err.message}`);
            continue;
          }
        }
        if (isClaimed(comments, now)) { claimed++; continue; }

        const maintainerYorumu = hasMaintainerComment(comments);
        const gun = Math.floor((now.getTime() - new Date(item.created_at).getTime()) / DAY);
        opps.push({
          key, tur, repo,
          baslik: item.title,
          url: item.html_url,
          neden: `${gun} gün önce açıldı${maintainerYorumu ? ', maintainer ilgilenmiş' : ''}`,
          notlar: [],
          puan: 0,
          detay: {
            numara: item.number, govde: item.body ?? '', olusturma: item.created_at,
            maintainerYorumu, yorumSayisi: item.comments,
          },
        });
      }
    }
  }
  return { opps, failures, claimed };
}
