const DAY = 864e5;

export const isoDate = (d) => d.toISOString().slice(0, 10);

export function buildRepoQueries(config, now) {
  const since = isoDate(new Date(now.getTime() - config.sonPushGun * DAY));
  const queries = [];
  for (const konu of config.konular) {
    for (const dil of config.diller) {
      queries.push(`topic:${konu} language:${dil} stars:${config.yildiz.min}..${config.yildiz.max} pushed:>=${since} archived:false`);
    }
  }
  return queries;
}

export function normalizeRepo(r) {
  return {
    fullName: r.full_name,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    stars: r.stargazers_count,
    topics: r.topics ?? [],
    language: r.language,
    pushedAt: r.pushed_at,
    archived: r.archived,
  };
}

export async function discoverRepos({ client, config, now }) {
  const byName = new Map();
  const failures = [];
  for (const q of buildRepoQueries(config, now)) {
    try {
      const items = await client.search('repositories', q, { perPage: 10, sort: 'updated' });
      for (const item of items) if (!byName.has(item.full_name)) byName.set(item.full_name, normalizeRepo(item));
    } catch (err) {
      failures.push(`repo araması: ${q} (${err.message})`);
    }
  }
  const repos = [...byName.values()]
    .filter((r) => !r.archived)
    .sort((a, b) => b.pushedAt.localeCompare(a.pushedAt))
    .slice(0, config.maksRepo);
  return { repos, failures };
}
