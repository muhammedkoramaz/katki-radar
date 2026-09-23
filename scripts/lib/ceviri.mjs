import { detectFormat, readEntries, parsePo, poStats } from './formatlar.mjs';

export const LOCALE_DIRS = new Set(['locales', 'locale', 'i18n', 'lang', 'langs', 'translations', 'messages', 'l10n']);
const LANG_RE = /^[a-z]{2,3}(?:[-_][A-Za-z]{2,4})?$/;
const EXTS = new Set(['json', 'yml', 'yaml', 'po']);
const IGNORED = /(^|\/)(node_modules|vendor|dist|build)\//;
const PLATFORM_FILES = new Set(['crowdin.yml', 'crowdin.yaml', '.weblate', '.tx/config']);
const PLATFORM_LINKS = /weblate\.org|crowdin\.com|transifex\.com/i;
const MAX_FILES = 10;

const normLang = (l) => l.toLowerCase().replace('_', '-');
const isEn = (l) => l === 'en' || l.startsWith('en-');
const isTr = (l) => l === 'tr' || l.startsWith('tr-');

function classifyPath(path) {
  const parts = path.split('/');
  let i = -1;
  for (let k = parts.length - 2; k >= 0; k--) {
    if (LOCALE_DIRS.has(parts[k].toLowerCase())) { i = k; break; }
  }
  if (i < 0) return null;
  const dir = parts.slice(0, i + 1).join('/');
  const rest = parts.slice(i + 1);
  const file = rest.at(-1);
  const dot = file.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = file.slice(dot + 1).toLowerCase();
  if (!EXTS.has(ext)) return null;
  const base = file.slice(0, dot);
  if (rest.length === 1 && LANG_RE.test(base)) return { dir, style: 'file', lang: normLang(base), path };
  if (rest.length === 3 && rest[1] === 'LC_MESSAGES' && ext === 'po' && LANG_RE.test(rest[0])) {
    return { dir, style: 'gettext', lang: normLang(rest[0]), path };
  }
  if (rest.length === 2 && ext !== 'po' && LANG_RE.test(rest[0])) return { dir, style: 'folder', lang: normLang(rest[0]), path };
  return null;
}

export function findLocaleSets(paths) {
  const groups = new Map();
  for (const p of paths) {
    if (IGNORED.test(p)) continue;
    const c = classifyPath(p);
    if (!c) continue;
    const id = `${c.dir}|${c.style}`;
    if (!groups.has(id)) groups.set(id, { dir: c.dir, style: c.style, byLang: new Map() });
    const g = groups.get(id);
    if (!g.byLang.has(c.lang)) g.byLang.set(c.lang, []);
    g.byLang.get(c.lang).push(c.path);
  }
  const sets = [];
  for (const g of groups.values()) {
    const langs = [...g.byLang.keys()];
    const en = langs.includes('en') ? 'en' : langs.find(isEn);
    if (!en) continue;
    const tr = langs.includes('tr') ? 'tr' : langs.find(isTr);
    sets.push({
      dir: g.dir,
      style: g.style,
      sourceFiles: [...g.byLang.get(en)].sort(),
      trFiles: tr ? [...g.byLang.get(tr)].sort() : [],
      otherLangs: langs.filter((l) => !isEn(l) && !isTr(l)).sort(),
    });
  }
  return sets.sort((a, b) => b.otherLangs.length - a.otherLangs.length);
}

export function usesTranslationPlatform(paths, readme = '') {
  return paths.some((p) => PLATFORM_FILES.has(p)) || PLATFORM_LINKS.test(readme);
}

export function completionRatio(format, srcText, trText) {
  if (format === 'po') {
    const { total, translated } = poStats(parsePo(trText));
    return total ? translated / total : 1;
  }
  const src = readEntries(format, srcText);
  const tr = readEntries(format, trText);
  if (src.size === 0) return 1;
  let done = 0;
  for (const [key, value] of tr) if (src.has(key) && value !== '') done++;
  return done / src.size;
}

function pairFiles(set) {
  if (set.style === 'gettext') return [[null, set.trFiles[0]]];
  if (set.style === 'file') return [[set.sourceFiles[0], set.trFiles[0]]];
  return set.sourceFiles.slice(0, MAX_FILES).map((src) => {
    const name = src.split('/').pop();
    return [src, set.trFiles.find((t) => t.split('/').pop() === name) ?? null];
  });
}

function fetchRaw(client, repo, path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return client.request(
    `/repos/${repo.fullName}/contents/${encoded}?ref=${encodeURIComponent(repo.defaultBranch)}`,
    { raw: true },
  );
}

function makeOpportunity(repo, set, durum, oran) {
  const pct = Math.round(oran * 100);
  return {
    key: `${repo.fullName}:tr`,
    tur: 'ceviri',
    repo,
    baslik: durum === 'yok' ? 'Türkçe çeviri yok' : `Türkçe çeviri eksik (%${pct})`,
    url: `${repo.htmlUrl}/tree/${repo.defaultBranch}/${set.dir}`,
    neden: durum === 'yok'
      ? `${set.otherLangs.length} dile çevrilmiş, Türkçe yok`
      : `Türkçe dosya var, anahtarların %${pct}'i çevrili`,
    notlar: [],
    puan: 0,
    detay: {
      durum, oran, dir: set.dir, style: set.style,
      sourceFiles: set.sourceFiles.slice(0, MAX_FILES), trFiles: set.trFiles,
    },
  };
}

export async function evaluateTranslation({ client, repo, paths, readme, config, log = (m) => console.error(m) }) {
  if (usesTranslationPlatform(paths, readme)) return null;
  for (const set of findLocaleSets(paths)) {
    if (set.trFiles.length === 0) {
      if (set.otherLangs.length >= config.minDigerDil) return makeOpportunity(repo, set, 'yok', 0);
      continue;
    }
    try {
      const pairs = pairFiles(set);
      let sum = 0;
      for (const [src, tr] of pairs) {
        if (!tr) continue;
        const format = detectFormat(tr);
        const trText = await fetchRaw(client, repo, tr);
        const srcText = format === 'po' ? '' : await fetchRaw(client, repo, src);
        if (trText == null || srcText == null) throw new Error(`${tr} indirilemedi`);
        sum += completionRatio(format, srcText, trText);
      }
      const oran = sum / pairs.length;
      if (oran < config.ceviriEksikEsik) return makeOpportunity(repo, set, 'eksik', oran);
    } catch (err) {
      log(`[ceviri] ${repo.fullName} ${set.dir}: ${err.message}`);
    }
  }
  return null;
}
