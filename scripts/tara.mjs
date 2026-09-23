import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from './lib/github.mjs';
import { discoverRepos, isoDate } from './lib/kesif.mjs';
import { classifyAiPolicy, fetchPolicyTexts } from './lib/politika.mjs';
import { evaluateTranslation } from './lib/ceviri.mjs';
import { findIssueOpportunities, repoFromIssue } from './lib/issuelar.mjs';
import { countMergedExternal, scoreOpportunity, selectTop } from './lib/puan.mjs';
import { renderReport, reportTitle } from './lib/rapor.mjs';
import { pruneSeen, markSeen } from './lib/gorulen.mjs';

const ROOT = new URL('..', import.meta.url);
const LABEL = 'firsatlar';

export async function openPrRepos(client, user) {
  const items = await client.search('issues', `is:pr is:open author:${user}`, { perPage: 100 });
  return new Set(items.map((i) => repoFromIssue(i).toLowerCase()));
}

export async function publishReport(client, selfRepo, title, body) {
  const label = await client.request(`/repos/${selfRepo}/labels/${LABEL}`);
  if (!label) {
    await client.request(`/repos/${selfRepo}/labels`, {
      method: 'POST', body: { name: LABEL, color: '2ea44f', description: 'Haftalık katkı fırsatları' },
    });
  }
  const open = (await client.request(`/repos/${selfRepo}/issues?labels=${LABEL}&state=open&per_page=100`)) ?? [];
  for (const issue of open) {
    await client.request(`/repos/${selfRepo}/issues/${issue.number}`, { method: 'PATCH', body: { state: 'closed' } });
  }
  return client.request(`/repos/${selfRepo}/issues`, { method: 'POST', body: { title, body, labels: [LABEL] } });
}

async function readSeen(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

export async function run({
  client, config, now, dryRun, selfRepo, seenPath,
  log = (m) => console.error(m), out = (s) => console.log(s),
}) {
  const date = isoDate(now);
  const stats = {
    'Taranan repo': 0,
    'Açık PR nedeniyle atlanan': 0,
    'AI yasağı nedeniyle elenen': 0,
    'Başkasının aldığı issue': 0,
    'Daha önce gösterilen': 0,
    'Toplam aday': 0,
  };

  const { repos, failures } = await discoverRepos({ client, config, now });
  if (repos.length === 0 && failures.length > 0) {
    throw new Error('Keşif başarısız: ' + failures.join('; '));
  }
  stats['Taranan repo'] = repos.length;

  let openPr = new Set();
  try {
    openPr = await openPrRepos(client, config.kullanici);
  } catch (err) {
    failures.push(`açık PR araması (${err.message})`);
  }

  const eligible = [];
  const opps = [];
  for (const repo of repos) {
    if (client.stats.remaining !== undefined && client.stats.remaining < 60) {
      failures.push('API bütçesi azaldı, kalan repolar atlandı');
      break;
    }
    if (openPr.has(repo.fullName.toLowerCase())) { stats['Açık PR nedeniyle atlanan']++; continue; }
    try {
      const { text, readme } = await fetchPolicyTexts(client, repo.fullName);
      repo.aiPolicy = classifyAiPolicy(text);
      if (repo.aiPolicy === 'YASAK') { stats['AI yasağı nedeniyle elenen']++; continue; }
      const pulls = (await client.request(`/repos/${repo.fullName}/pulls?state=closed&per_page=30`)) ?? [];
      repo.mergedExternal = countMergedExternal(pulls);
      const tree = await client.request(`/repos/${repo.fullName}/git/trees/${encodeURIComponent(repo.defaultBranch)}?recursive=1`);
      const paths = (tree?.tree ?? []).filter((e) => e.type === 'blob').map((e) => e.path);
      const translation = await evaluateTranslation({ client, repo, paths, readme, config, log });
      if (translation) opps.push(translation);
      eligible.push(repo);
    } catch (err) {
      failures.push(`${repo.fullName} (${err.message})`);
    }
  }

  const issues = await findIssueOpportunities({ client, repos: eligible, config, now, log });
  opps.push(...issues.opps);
  failures.push(...issues.failures);
  stats['Başkasının aldığı issue'] = issues.claimed;

  const seen = pruneSeen(await readSeen(seenPath), now);
  const fresh = opps.filter((o) => !(o.key in seen));
  stats['Daha önce gösterilen'] = opps.length - fresh.length;
  stats['Toplam aday'] = fresh.length;

  for (const o of fresh) {
    o.puan = scoreOpportunity(o, config, now);
    if (o.repo.aiPolicy === 'ACIKLAMA') o.notlar.push('⚠ AI kullanımını belirt');
  }
  const selected = selectTop(fresh, config);
  stats['API isteği'] = client.stats.requests;

  const body = renderReport({ date, selected, stats, failures });
  if (dryRun) {
    out(body);
    return { selected, body };
  }
  await publishReport(client, selfRepo, reportTitle(date), body);
  const updated = markSeen(seen, selected.map((o) => o.key), date);
  await writeFile(seenPath, `${JSON.stringify(updated, null, 2)}\n`);
  return { selected, body };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const config = JSON.parse(await readFile(new URL('config.json', ROOT), 'utf8'));
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('GITHUB_TOKEN gerekli. Yerelde: GITHUB_TOKEN=$(gh auth token) node scripts/tara.mjs --dry-run');
    process.exit(1);
  }
  const selfRepo = process.env.GITHUB_REPOSITORY;
  if (!dryRun && !selfRepo) {
    console.error('GITHUB_REPOSITORY gerekli (Actions bunu otomatik verir). Yerelde --dry-run kullan.');
    process.exit(1);
  }
  await run({
    client: createClient({ token }),
    config,
    now: new Date(),
    dryRun,
    selfRepo,
    seenPath: fileURLToPath(new URL('data/gorulen.json', ROOT)),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
