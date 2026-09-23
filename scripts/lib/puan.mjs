const MAINTAINER = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const DAY = 864e5;

export function countMergedExternal(pulls) {
  return pulls.filter((p) => p.merged_at && !MAINTAINER.has(p.author_association)).length;
}

export function scoreMaintainer(mergedExternal) {
  return Math.min(mergedExternal, 10) * 3;
}

export function scoreClarity(opp) {
  if (opp.tur === 'ceviri') return 20;
  const body = opp.detay.govde ?? '';
  let score = 0;
  if (body.length >= 200) score += 8;
  if (/```|^\s*\d+\.\s/m.test(body)) score += 6;
  if (opp.detay.maintainerYorumu) score += 6;
  return score;
}

export function scoreTopicLang(repo, config) {
  let score = 0;
  if (repo.topics.some((t) => config.konular.includes(t))) score += 10;
  if (config.diller.includes(repo.language)) score += 10;
  return score;
}

export function scoreFreshness(opp, now) {
  const age = (iso) => (now.getTime() - new Date(iso).getTime()) / DAY;
  if (opp.tur === 'ceviri') return age(opp.repo.pushedAt) <= 30 ? 15 : 8;
  const days = age(opp.detay.olusturma);
  if (days <= 60) return 15;
  if (days > 365) return 0;
  return Math.round((15 * (365 - days)) / (365 - 60));
}

export function scoreSize(stars, config) {
  const y = config.yildiz;
  if (stars >= y.idealMin && stars <= y.idealMax) return 15;
  if (stars >= y.min && stars <= y.max) return 8;
  return 0;
}

export function scoreOpportunity(opp, config, now) {
  return scoreMaintainer(opp.repo.mergedExternal ?? 0)
    + scoreClarity(opp)
    + scoreTopicLang(opp.repo, config)
    + scoreFreshness(opp, now)
    + scoreSize(opp.repo.stars, config);
}

export function selectTop(opps, config, perRepo = 2) {
  const total = Object.values(config.haftalikKota).reduce((a, b) => a + b, 0);
  const sorted = [...opps].sort((a, b) => b.puan - a.puan || a.key.localeCompare(b.key));
  const chosen = [];
  const perRepoCount = new Map();
  const canTake = (o) => !chosen.includes(o) && (perRepoCount.get(o.repo.fullName) ?? 0) < perRepo;
  const take = (o) => {
    chosen.push(o);
    perRepoCount.set(o.repo.fullName, (perRepoCount.get(o.repo.fullName) ?? 0) + 1);
  };
  for (const [tur, kota] of Object.entries(config.haftalikKota)) {
    let n = 0;
    for (const o of sorted) {
      if (n >= kota) break;
      if (o.tur === tur && canTake(o)) { take(o); n++; }
    }
  }
  for (const o of sorted) {
    if (chosen.length >= total) break;
    if (canTake(o)) take(o);
  }
  return chosen.sort((a, b) => b.puan - a.puan);
}
