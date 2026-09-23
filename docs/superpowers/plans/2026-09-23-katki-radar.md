# katki-radar Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Amaç:** Haftalık olarak açık kaynak katkı fırsatlarını (eksik Türkçe çeviri, kod ve doküman issue'ları) bulup GitHub issue'su olarak listeleyen bir tarayıcı ve bu listeden onaylı PR akışını yürüten `/katki` Claude Code komutu.

**Mimari:** `scripts/tara.mjs` GitHub Actions'ta haftalık çalışır; `scripts/lib/` altındaki tek sorumluluklu modüller (API istemcisi, keşif, politika, çeviri, issue, puan, rapor) saf fonksiyonlar + enjekte edilen bir `client` ile çalışır ve ağ olmadan test edilir. `/katki` komutu bir markdown komut dosyasıdır; Claude'a `gh` ile adım adım, onay kapılı akışı tarif eder.

**Teknoloji:** Node.js 22 (yerleşik `fetch`, `node:test`), ES modülleri (`.mjs`), bağımlılık yok; GitHub Actions; `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-09-23-katki-radar-design.md`

## Global Kısıtlar

- Node ≥ 22; npm bağımlılığı **yok** (yalnızca Node yerleşik modülleri).
- Tüm kaynak dosyaları ES modülü (`.mjs`), 2 boşluk girinti, tek tırnak, noktalı virgül.
- Testler `node --test` ile çalışır; testlerde gerçek ağ erişimi yok.
- GitHub API: `https://api.github.com`, başlıklar `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: katki-radar`.
- Yeniden deneme: 3 tekrar, bekleme 2 s / 4 s / 8 s; `retry-after` varsa ona uyulur.
- Arama API'si çağrıları arasında en az 2,1 s.
- Rapor issue başlığı `Fırsatlar – YYYY-MM-DD` (en dash `–`), etiket `firsatlar`.
- Veri bloğu: `<!-- katki-data: [...] -->`.
- `data/gorulen.json` anahtarları: kod/doküman `owner/repo#123`, çeviri `owner/repo:tr`; 180 gün saklama.
- Kullanıcı: `muhammedkoramaz`; yerel kök `C:\Users\muham\katki\`.
- PR hiçbir zaman otomatik açılmaz; `/katki` akışındaki ✋ adımları kullanıcı onayı ister.
- Her commit mesajı şu satırla biter: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Tüm komutlar `C:\Users\muham\katki\katki-radar` içinde, Git Bash ile çalıştırılır.

## Dosya Haritası

| Dosya | Sorumluluk |
|---|---|
| `package.json` | `type: module`, `npm test` |
| `scripts/lib/formatlar.mjs` | JSON/YAML(alt küme)/PO ayrıştırma, yaprak anahtar haritası |
| `scripts/lib/ceviri-kontrol.mjs` | Yer tutucu çıkarma, kaynak↔tr karşılaştırma, CLI |
| `scripts/lib/github.mjs` | REST istemcisi: yeniden deneme, raw içerik, arama kısıtlama |
| `scripts/lib/politika.mjs` | AI politikası sınıflandırma + politika dosyalarını çekme |
| `scripts/lib/ceviri.mjs` | Locale klasörü tespiti, platform tespiti, tamamlanma oranı, çeviri fırsatı |
| `scripts/lib/issuelar.mjs` | Issue arama sorguları, "dolu mu" kontrolü, kod/doküman fırsatları |
| `scripts/lib/puan.mjs` | Puanlama ve kota/repo sınırlı seçim |
| `scripts/lib/rapor.mjs` | Markdown rapor + veri bloğu üretme/okuma |
| `scripts/lib/gorulen.mjs` | Görülen fırsat kaydı (budama, işaretleme) |
| `scripts/lib/kesif.mjs` | Aday repo arama sorguları ve keşif |
| `scripts/tara.mjs` | Orkestrasyon (`run`), yayınlama (`publishReport`), CLI (`--dry-run`) |
| `config.json`, `data/gorulen.json`, `tr-sozluk.md` | Ayarlar, durum, sözlük |
| `.github/workflows/tara.yml` | Haftalık workflow |
| `komut/katki.md` | `/katki` komut dosyası (→ `~/.claude/commands/katki.md`) |
| `test/*.test.mjs` | Birim ve entegrasyon testleri |

## Ortak Veri Tipleri

```js
// Repo (kesif.normalizeRepo çıktısı; tara.run içinde mergedExternal ve aiPolicy eklenir)
{ fullName, htmlUrl, defaultBranch, stars, topics: string[], language, pushedAt, archived,
  mergedExternal?: number, aiPolicy?: 'YASAK'|'ACIKLAMA'|'YOK' }

// Opportunity (fırsat)
{ key: string, tur: 'ceviri'|'kod'|'dokuman', repo: Repo, baslik: string, url: string,
  neden: string, notlar: string[], puan: number,
  detay: // ceviri:
         { durum: 'yok'|'eksik', oran: number, dir, style, sourceFiles: string[], trFiles: string[] }
         // kod/dokuman:
         { numara: number, govde: string, olusturma: string, maintainerYorumu: boolean, yorumSayisi: number } }
```

---

### Task 1: İskelet + format ayrıştırıcıları

**Dosyalar:**
- Oluştur: `package.json`, `scripts/lib/formatlar.mjs`
- Test: `test/formatlar.test.mjs`

**Arayüzler:**
- Üretir: `detectFormat(path) -> 'json'|'yaml'|'po'|null`, `parseSimpleYaml(text) -> object`, `stripLangRoot(obj) -> object`, `leafEntries(obj) -> Map<string,string>`, `readEntries(format, text) -> Map<string,string>` (json/yaml), `parsePo(text) -> Array<{msgctxt, msgid, msgid_plural, msgstr: string[]}>`, `poStats(entries) -> {total, translated}`

- [ ] **Adım 1: package.json oluştur**

```json
{
  "name": "katki-radar",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test",
    "tara": "node scripts/tara.mjs",
    "tara:dry": "node scripts/tara.mjs --dry-run"
  }
}
```

- [ ] **Adım 2: Başarısız testi yaz** — `test/formatlar.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFormat, parseSimpleYaml, stripLangRoot, leafEntries, readEntries, parsePo, poStats,
} from '../scripts/lib/formatlar.mjs';

test('detectFormat uzantıya göre format döndürür', () => {
  assert.equal(detectFormat('a/en.json'), 'json');
  assert.equal(detectFormat('a/en.YML'), 'yaml');
  assert.equal(detectFormat('a/en.yaml'), 'yaml');
  assert.equal(detectFormat('a/tr.po'), 'po');
  assert.equal(detectFormat('a/en.ts'), null);
});

test('parseSimpleYaml iç içe haritaları, tırnakları ve yorumları okur', () => {
  const yaml = [
    '# yorum',
    'en:',
    '  greeting: "Hello: world"',
    "  name: 'It''s me'",
    '  nested:',
    '    deep: value # satır sonu yorumu',
    '  url: http://x.com',
    "  plain: It's fine",
  ].join('\n');
  assert.deepEqual(parseSimpleYaml(yaml), {
    en: {
      greeting: 'Hello: world',
      name: "It's me",
      nested: { deep: 'value' },
      url: 'http://x.com',
      plain: "It's fine",
    },
  });
});

test('parseSimpleYaml desteklenmeyen yapılarda hata fırlatır', () => {
  assert.throws(() => parseSimpleYaml('a:\n  - x\n'), /desteklenmeyen/);
  assert.throws(() => parseSimpleYaml('a: [1, 2]\n'), /desteklenmeyen/);
});

test('stripLangRoot yalnızca tek en/tr kökünü kaldırır', () => {
  assert.deepEqual(stripLangRoot({ en: { a: '1' } }), { a: '1' });
  assert.deepEqual(stripLangRoot({ 'tr-TR': { a: '1' } }), { a: '1' });
  assert.deepEqual(stripLangRoot({ ui: { a: '1' } }), { ui: { a: '1' } });
  assert.deepEqual(stripLangRoot({ en: 'x', b: 'y' }), { en: 'x', b: 'y' });
});

test('leafEntries düz anahtar-değer haritası üretir', () => {
  const m = leafEntries({ a: { b: 'x', c: ['y', 'z'] }, d: 1 });
  assert.deepEqual([...m], [['a.b', 'x'], ['a.c.0', 'y'], ['a.c.1', 'z'], ['d', '1']]);
});

test('readEntries json ve yaml okur', () => {
  assert.deepEqual([...readEntries('json', '\uFEFF{"a":{"b":"x"}}')], [['a.b', 'x']]);
  assert.deepEqual([...readEntries('yaml', 'tr:\n  a: b\n')], [['a', 'b']]);
});

const PO = [
  'msgid ""',
  'msgstr ""',
  '"Language: tr\\n"',
  '',
  '#: src/a.py:1',
  'msgid "Hello %(name)s"',
  'msgstr "Merhaba %(name)s"',
  '',
  'msgctxt "menu"',
  'msgid "Open"',
  'msgstr ""',
  '',
  'msgid "One file"',
  'msgid_plural "%d files"',
  'msgstr[0] "%d dosya"',
  'msgstr[1] ""',
  '',
  'msgid ""',
  '"Long "',
  '"text"',
  'msgstr "Uzun metin"',
].join('\n');

test('parsePo girdileri, bağlamı, çoğulları ve çok satırlı metni okur', () => {
  const entries = parsePo(PO);
  assert.equal(entries.length, 4);
  assert.deepEqual(entries[0], {
    msgctxt: undefined, msgid: 'Hello %(name)s', msgid_plural: undefined, msgstr: ['Merhaba %(name)s'],
  });
  assert.equal(entries[1].msgctxt, 'menu');
  assert.deepEqual(entries[2].msgstr, ['%d dosya', '']);
  assert.equal(entries[2].msgid_plural, '%d files');
  assert.equal(entries[3].msgid, 'Long text');
});

test('parsePo bozuk satırda hata fırlatır', () => {
  assert.throws(() => parsePo('msgid "a"\nbozuk satır\n'), /PO satır 2/);
});

test('poStats tamamen çevrilmiş girdileri sayar', () => {
  assert.deepEqual(poStats(parsePo(PO)), { total: 4, translated: 2 });
});
```

- [ ] **Adım 3: Testin başarısız olduğunu doğrula**

Çalıştır: `node --test test/formatlar.test.mjs`
Beklenen: FAIL — `Cannot find module '.../scripts/lib/formatlar.mjs'`

- [ ] **Adım 4: Uygulamayı yaz** — `scripts/lib/formatlar.mjs`

```js
import { extname } from 'node:path';

export function detectFormat(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.yml' || ext === '.yaml') return 'yaml';
  if (ext === '.po') return 'po';
  return null;
}

// Yalnızca i18n dosyalarında görülen YAML alt kümesi: iç içe haritalar ve skaler değerler.
// Liste, akış (flow) yapısı, çok satırlı metin, anchor/alias desteklenmez → hata.
export function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
    const line = stripComment(raw).replace(/\s+$/, '');
    if (!line.trim() || line.trim() === '---') return;
    const indent = line.match(/^ */)[0].length;
    const content = line.slice(indent);
    if (content.startsWith('\t')) throw new Error(`YAML satır ${i + 1}: sekme karakteri desteklenmeyen girinti`);
    if (content.startsWith('- ') || content === '-') throw new Error(`YAML satır ${i + 1}: liste desteklenmeyen yapı`);
    const m = content.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:]+?):(?:\s+(.*))?$/);
    if (!m) throw new Error(`YAML satır ${i + 1} ayrıştırılamadı`);
    while (stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).obj;
    const key = unquote(m[1].trim());
    const rest = (m[2] ?? '').trim();
    if (rest === '') {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else if (/^[|>&*!\[{]/.test(rest)) {
      throw new Error(`YAML satır ${i + 1}: desteklenmeyen yapı (${rest[0]})`);
    } else {
      parent[key] = unquote(rest);
    }
  });
  return root;
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (quote === '"' && c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    const opensValue = i === 0 || /[\s:]/.test(line[i - 1]);
    if ((c === '"' || c === "'") && opensValue) quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function unquote(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replaceAll("''", "'");
  return s;
}

export function stripLangRoot(obj) {
  const keys = Object.keys(obj);
  if (keys.length === 1 && /^(en|tr)([-_][a-z]{2})?$/i.test(keys[0])) {
    const inner = obj[keys[0]];
    if (inner !== null && typeof inner === 'object') return inner;
  }
  return obj;
}

export function leafEntries(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') leafEntries(v, key, out);
    else out.set(key, v === null ? '' : String(v));
  }
  return out;
}

export function readEntries(format, text) {
  const clean = text.replace(/^\uFEFF/, '');
  if (format === 'json') return leafEntries(JSON.parse(clean));
  if (format === 'yaml') return leafEntries(stripLangRoot(parseSimpleYaml(clean)));
  throw new Error(`desteklenmeyen format: ${format}`);
}

export function parsePo(text) {
  const entries = [];
  const fresh = () => ({ msgctxt: undefined, msgid: undefined, msgid_plural: undefined, msgstr: [] });
  let cur = null;
  let field = null;
  let index = 0;
  const flush = () => { if (cur && cur.msgid) entries.push(cur); };
  const write = (value, append) => {
    if (field === 'msgstr') cur.msgstr[index] = (append ? cur.msgstr[index] : '') + value;
    else cur[field] = (append ? cur[field] : '') + value;
  };
  const decode = (str, i) => {
    try { return JSON.parse(str); } catch { throw new Error(`PO satır ${i + 1}: geçersiz metin`); }
  };

  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = line.match(/^(msgctxt|msgid_plural|msgid|msgstr)(?:\[(\d+)\])?\s+(".*")$/);
    if (m) {
      const [, kw, idx, str] = m;
      const pendingContext = cur && cur.msgid === undefined && cur.msgctxt !== undefined;
      if (kw === 'msgctxt' || (kw === 'msgid' && !pendingContext)) { flush(); cur = fresh(); }
      if (!cur) throw new Error(`PO satır ${i + 1}: beklenmeyen ${kw}`);
      field = kw;
      index = idx ? Number(idx) : 0;
      write(decode(str, i), false);
      return;
    }
    if (line.startsWith('"') && cur && field) { write(decode(line, i), true); return; }
    throw new Error(`PO satır ${i + 1} ayrıştırılamadı`);
  });
  flush();
  return entries;
}

export function poStats(entries) {
  const translated = entries.filter((e) => e.msgstr.length > 0 && e.msgstr.every((s) => s)).length;
  return { total: entries.length, translated };
}
```

- [ ] **Adım 5: Testlerin geçtiğini doğrula**

Çalıştır: `node --test test/formatlar.test.mjs`
Beklenen: PASS (9 test)

- [ ] **Adım 6: Commit**

```bash
git add package.json scripts/lib/formatlar.mjs test/formatlar.test.mjs
git commit -m "feat: JSON/YAML/PO ayrıştırıcıları"
```

---

### Task 2: Çeviri doğrulayıcı (ceviri-kontrol)

**Dosyalar:**
- Oluştur: `scripts/lib/ceviri-kontrol.mjs`
- Test: `test/ceviri-kontrol.test.mjs`

**Arayüzler:**
- Tüketir: `detectFormat`, `readEntries`, `parsePo` (Task 1)
- Üretir: `extractPlaceholders(str) -> string[]` (sıralı, normalize), `compareFiles({ format, srcText, trText }) -> { errors: string[], total: number }`; CLI: `node scripts/lib/ceviri-kontrol.mjs <kaynak|-> <tr-dosyası>` (sorun yoksa çıkış kodu 0, varsa 1, kullanım hatasında 2)

- [ ] **Adım 1: Başarısız testi yaz** — `test/ceviri-kontrol.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPlaceholders, compareFiles } from '../scripts/lib/ceviri-kontrol.mjs';

const CLI = fileURLToPath(new URL('../scripts/lib/ceviri-kontrol.mjs', import.meta.url));

test('extractPlaceholders yaygın yer tutucuları bulur ve normalize eder', () => {
  const s = 'Hi {{ name }}, you have {count} %s <b>new</b> $t(common.x) %(user)s %1$d';
  assert.deepEqual(
    extractPlaceholders(s),
    ['$t(common.x)', '%(user)s', '%1$d', '%s', '</b>', '<b>', '{count}', '{{name}}'].sort(),
  );
});

test('ICU çoğul başlığı tek yer tutucu olarak sayılır', () => {
  assert.deepEqual(extractPlaceholders('{count, plural, one {# item} other {# items}}'), ['{count,plural']);
});

test('compareFiles eksik, fazla, boş ve uyuşmayan yer tutucuları raporlar', () => {
  const src = JSON.stringify({ a: 'Hello {name}', b: 'Bye', c: 'Menu' });
  const tr = JSON.stringify({ a: 'Merhaba', b: '', d: 'Fazla' });
  const { errors } = compareFiles({ format: 'json', srcText: src, trText: tr });
  assert.deepEqual(errors, [
    'a: yer tutucu uyuşmuyor (kaynak: {name} | tr: -)',
    'b: boş çeviri',
    'c: Türkçe dosyada eksik',
    'd: kaynakta olmayan fazla anahtar',
  ]);
});

test('compareFiles sorunsuz dosyada hata vermez', () => {
  const r = compareFiles({ format: 'json', srcText: '{"a":"Hi {n}"}', trText: '{"a":"Selam {n}"}' });
  assert.deepEqual(r, { errors: [], total: 1 });
});

test('compareFiles yaml dil kökünü yok sayar', () => {
  const r = compareFiles({ format: 'yaml', srcText: 'en:\n  a: Hi\n', trText: 'tr:\n  a: Selam\n' });
  assert.deepEqual(r, { errors: [], total: 1 });
});

test('compareFiles geçersiz JSON bildirir', () => {
  const r = compareFiles({ format: 'json', srcText: '{"a":"x"}', trText: '{"a":' });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /^Türkçe dosya geçersiz json:/);
});

test('compareFiles po dosyasında çevrilmemiş ve yer tutucu hatalarını bulur', () => {
  const tr = 'msgid "Hi %(n)s"\nmsgstr "Selam"\n\nmsgid "Bye"\nmsgstr ""\n';
  const { errors } = compareFiles({ format: 'po', srcText: null, trText: tr });
  assert.deepEqual(errors, ['Hi %(n)s: yer tutucu uyuşmuyor (kaynak: %(n)s | tr: -)', 'Bye: çevrilmemiş']);
});

test('compareFiles po çoğulunu msgid_plural ile karşılaştırır', () => {
  const tr = 'msgid "One file"\nmsgid_plural "%d files"\nmsgstr[0] "%d dosya"\n';
  assert.deepEqual(compareFiles({ format: 'po', srcText: null, trText: tr }).errors, []);
});

test('CLI sorun varsa 1, yoksa 0 ile çıkar', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kontrol-'));
  await writeFile(join(dir, 'en.json'), '{"a":"Hi {n}"}');
  await writeFile(join(dir, 'tr.json'), '{"a":"Selam {n}"}');
  await writeFile(join(dir, 'bad.json'), '{"a":"Selam"}');
  const ok = spawnSync(process.execPath, [CLI, join(dir, 'en.json'), join(dir, 'tr.json')], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /Sorun yok \(1 anahtar\)/);
  const bad = spawnSync(process.execPath, [CLI, join(dir, 'en.json'), join(dir, 'bad.json')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /yer tutucu uyuşmuyor/);
});
```

- [ ] **Adım 2: Testin başarısız olduğunu doğrula**

Çalıştır: `node --test test/ceviri-kontrol.test.mjs`
Beklenen: FAIL — modül bulunamadı

- [ ] **Adım 3: Uygulamayı yaz** — `scripts/lib/ceviri-kontrol.mjs`

```js
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { detectFormat, readEntries, parsePo } from './formatlar.mjs';

// Sıra önemli: eşleşen parça boşlukla silinir, böylece {{x}} ayrıca {x} olarak sayılmaz.
const PATTERNS = [
  /\{\{\s*[^{}]+?\s*\}\}/g,
  /\{\s*[\w.]+\s*,\s*(?:plural|select|selectordinal)\b/g,
  /\{[\w.]+\}/g,
  /%\(\w+\)[sdif]/g,
  /%\d+\$[sdif]/g,
  /%[sdif@]/g,
  /\$t\([^)]*\)/g,
  /<\/?[a-zA-Z][^>]*>/g,
];

export function extractPlaceholders(str) {
  let rest = String(str ?? '');
  const found = [];
  for (const re of PATTERNS) {
    rest = rest.replace(re, (m) => {
      found.push(m.replace(/\s+/g, ''));
      return ' '.repeat(m.length);
    });
  }
  return found.sort();
}

function placeholderDiff(source, translation) {
  const a = extractPlaceholders(source);
  const b = extractPlaceholders(translation);
  if (a.join('\u0000') === b.join('\u0000')) return null;
  const show = (list) => (list.length ? list.join(' ') : '-');
  return `yer tutucu uyuşmuyor (kaynak: ${show(a)} | tr: ${show(b)})`;
}

export function compareFiles({ format, srcText, trText }) {
  if (format === 'po') return comparePo(srcText, trText);
  let src;
  let tr;
  try { src = readEntries(format, srcText); } catch (e) {
    return { errors: [`Kaynak dosya geçersiz ${format}: ${e.message}`], total: 0 };
  }
  try { tr = readEntries(format, trText); } catch (e) {
    return { errors: [`Türkçe dosya geçersiz ${format}: ${e.message}`], total: src.size };
  }
  const errors = [];
  for (const [key, value] of src) {
    if (!tr.has(key)) { errors.push(`${key}: Türkçe dosyada eksik`); continue; }
    const t = tr.get(key);
    if (t === '' && value !== '') { errors.push(`${key}: boş çeviri`); continue; }
    const diff = placeholderDiff(value, t);
    if (diff) errors.push(`${key}: ${diff}`);
  }
  for (const key of tr.keys()) if (!src.has(key)) errors.push(`${key}: kaynakta olmayan fazla anahtar`);
  return { errors, total: src.size };
}

function comparePo(srcText, trText) {
  let tr;
  try { tr = parsePo(trText); } catch (e) {
    return { errors: [`Türkçe dosya geçersiz po: ${e.message}`], total: 0 };
  }
  const id = (e) => (e.msgctxt ? `${e.msgctxt}\u0004` : '') + e.msgid;
  const errors = [];
  for (const e of tr) {
    const label = e.msgctxt ? `[${e.msgctxt}] ${e.msgid}` : e.msgid;
    if (!(e.msgstr.length > 0 && e.msgstr.every((s) => s))) { errors.push(`${label}: çevrilmemiş`); continue; }
    const reference = e.msgid_plural ?? e.msgid;
    for (const s of e.msgstr) {
      const diff = placeholderDiff(reference, s);
      if (diff) errors.push(`${label}: ${diff}`);
    }
  }
  if (srcText) {
    let src;
    try { src = parsePo(srcText); } catch (e) {
      errors.push(`Kaynak dosya geçersiz po: ${e.message}`);
      return { errors, total: tr.length };
    }
    const have = new Set(tr.map(id));
    for (const e of src) if (!have.has(id(e))) errors.push(`${e.msgid}: Türkçe dosyada eksik`);
  }
  return { errors, total: tr.length };
}

async function main() {
  const [srcPath, trPath] = process.argv.slice(2);
  if (!trPath) {
    console.error('Kullanım: node ceviri-kontrol.mjs <kaynak-dosya | -> <tr-dosyası>');
    process.exit(2);
  }
  const format = detectFormat(trPath);
  if (!format) { console.error(`Desteklenmeyen dosya türü: ${trPath}`); process.exit(2); }
  const srcText = srcPath === '-' ? null : await readFile(srcPath, 'utf8');
  if (format !== 'po' && srcText == null) { console.error('JSON/YAML için kaynak dosya gerekli'); process.exit(2); }
  const trText = await readFile(trPath, 'utf8');
  const { errors, total } = compareFiles({ format, srcText, trText });
  if (errors.length === 0) { console.log(`✓ Sorun yok (${total} anahtar)`); return; }
  console.log(`✗ ${errors.length} sorun:`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(2); });
}
```

- [ ] **Adım 4: Testlerin geçtiğini doğrula**

Çalıştır: `node --test test/ceviri-kontrol.test.mjs`
Beklenen: PASS (9 test)

- [ ] **Adım 5: Commit**

```bash
git add scripts/lib/ceviri-kontrol.mjs test/ceviri-kontrol.test.mjs
git commit -m "feat: çeviri doğrulayıcı (yer tutucu, anahtar, format)"
```

---

### Task 3: GitHub API istemcisi

**Dosyalar:**
- Oluştur: `scripts/lib/github.mjs`
- Test: `test/github.test.mjs`

**Arayüzler:**
- Üretir: `createClient({ token, fetchImpl?, sleep?, log?, searchIntervalMs? }) -> { request(path, { method?, body?, raw? }) -> Promise<any|null>, search(kind, q, { perPage?, sort? }) -> Promise<object[]>, stats: { requests: number } }`; `class GitHubError { status }`. `request` 404'te `null` döner. `path` `/` ile başlar (API kökünün altı).

- [ ] **Adım 1: Başarısız testi yaz** — `test/github.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../scripts/lib/github.mjs';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function setup(responses) {
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
```

- [ ] **Adım 2: Testin başarısız olduğunu doğrula**

Çalıştır: `node --test test/github.test.mjs`
Beklenen: FAIL — modül bulunamadı

- [ ] **Adım 3: Uygulamayı yaz** — `scripts/lib/github.mjs`

```js
const API = 'https://api.github.com';
const RETRY_DELAYS = [2000, 4000, 8000];
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createClient({
  token,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  log = (m) => console.error(m),
  searchIntervalMs = 2100,
} = {}) {
  const stats = { requests: 0 };
  let lastSearch = 0;

  async function request(path, { method = 'GET', body, raw = false } = {}) {
    const url = path.startsWith('https://') ? path : API + path;
    const headers = {
      Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'katki-radar',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const init = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < RETRY_DELAYS.length;
      stats.requests++;
      let res;
      try {
        res = await fetchImpl(url, init);
      } catch (err) {
        if (!canRetry) throw err;
        log(`ağ hatası (${err.message}), tekrar denenecek: ${method} ${url}`);
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      if (res.status === 404) return null;
      const retryAfter = Number(res.headers.get('retry-after'));
      const limited = res.status === 429
        || (res.status === 403 && (retryAfter > 0 || res.headers.get('x-ratelimit-remaining') === '0'));
      if ((res.status >= 500 || limited) && canRetry) {
        log(`${res.status}, tekrar denenecek: ${method} ${url}`);
        await sleep(retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAYS[attempt]);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new GitHubError(res.status, `${method} ${url} → ${res.status}: ${text.slice(0, 200)}`);
      }
      if (res.status === 204) return null;
      return raw ? res.text() : res.json();
    }
  }

  async function search(kind, q, { perPage = 10, sort } = {}) {
    const wait = lastSearch + searchIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastSearch = Date.now();
    const params = `q=${encodeURIComponent(q)}&per_page=${perPage}` + (sort ? `&sort=${sort}&order=desc` : '');
    const data = await request(`/search/${kind}?${params}`);
    return data?.items ?? [];
  }

  return { request, search, stats };
}
```

- [ ] **Adım 4: Testlerin geçtiğini doğrula**

Çalıştır: `node --test test/github.test.mjs`
Beklenen: PASS (11 test)

- [ ] **Adım 5: Commit**

```bash
git add scripts/lib/github.mjs test/github.test.mjs
git commit -m "feat: yeniden denemeli GitHub API istemcisi"
```

---

### Task 4: AI politikası tespiti

**Dosyalar:**
- Oluştur: `scripts/lib/politika.mjs`
- Test: `test/politika.test.mjs`

**Arayüzler:**
- Tüketir: `client.request(path, { raw: true })` (Task 3)
- Üretir: `classifyAiPolicy(text) -> 'YASAK'|'ACIKLAMA'|'YOK'`, `fetchPolicyTexts(client, fullName) -> Promise<{ text: string, readme: string }>`

- [ ] **Adım 1: Başarısız testi yaz** — `test/politika.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAiPolicy, fetchPolicyTexts } from '../scripts/lib/politika.mjs';

test('yasak cümlesi YASAK döndürür', () => {
  assert.equal(classifyAiPolicy('# Contributing\n\nWe do not accept AI-generated pull requests. Thanks!'), 'YASAK');
  assert.equal(classifyAiPolicy('PRs created with LLMs will be closed.'), 'YASAK');
  assert.equal(classifyAiPolicy('Use of generative AI is prohibited in this project'), 'YASAK');
});

test('açıklama şartı ACIKLAMA döndürür', () => {
  assert.equal(classifyAiPolicy('If you used AI tools, please disclose it in the PR.'), 'ACIKLAMA');
});

test('yasak açıklamadan önceliklidir', () => {
  assert.equal(classifyAiPolicy('Disclose AI tools usage. AI-generated code will be rejected.'), 'YASAK');
});

test('ilgisiz metin YOK döndürür', () => {
  assert.equal(classifyAiPolicy('We ban nothing. Please add tests. See the banner component.'), 'YOK');
  assert.equal(classifyAiPolicy(''), 'YOK');
});

test('farklı cümlelerdeki terimler birleşmez', () => {
  assert.equal(classifyAiPolicy('Copilot users are welcome. Spam will be closed.'), 'YOK');
});

test('fetchPolicyTexts dosyaları birleştirir, README ayrıca döner', async () => {
  const files = {
    '/repos/o/r/contents/CONTRIBUTING.md': 'C',
    '/repos/o/r/contents/AI_POLICY.md': 'A',
    '/repos/o/r/readme': 'R',
  };
  const seen = [];
  const client = { request: async (p, opts) => { seen.push(opts?.raw); return files[p] ?? null; } };
  assert.deepEqual(await fetchPolicyTexts(client, 'o/r'), { text: 'C\n\nA\n\nR', readme: 'R' });
  assert.ok(seen.every((raw) => raw === true));
});

test('fetchPolicyTexts hataları yutar', async () => {
  const client = { request: async () => { throw new Error('x'); } };
  assert.deepEqual(await fetchPolicyTexts(client, 'o/r'), { text: '', readme: '' });
});
```

- [ ] **Adım 2: Testin başarısız olduğunu doğrula**

Çalıştır: `node --test test/politika.test.mjs`
Beklenen: FAIL — modül bulunamadı

- [ ] **Adım 3: Uygulamayı yaz** — `scripts/lib/politika.mjs`

```js
const AI_TERMS = [
  /\bai[- ]generated\b/, /\bllms?\b/, /\bchatgpt\b/, /\bcopilot\b/, /\bgenerative ai\b/,
  /\bai tools?\b/, /\bai[- ]assisted\b/, /\blanguage models?\b/,
];
const BAN_TERMS = [
  /\bnot accept/, /\bnot be accepted\b/, /\bprohibit/, /\bban(?:s|ned)?\b/, /\bforbidden\b/,
  /\bwill be closed\b/, /\bdo not submit\b/, /\bnot allowed\b/, /\breject/,
];
const DISCLOSE_TERMS = [/\bdisclos(?:e|ure)\b/, /\bmust mention\b/, /\bindicate\b/];

const POLICY_PATHS = ['contents/CONTRIBUTING.md', 'contents/.github/CONTRIBUTING.md', 'contents/AI_POLICY.md', 'readme'];

export function splitSentences(text) {
  return text.toLowerCase().split(/[.!?](?:\s|$)|\n\s*\n/).map((s) => s.trim()).filter(Boolean);
}

export function classifyAiPolicy(text) {
  let disclose = false;
  for (const sentence of splitSentences(text)) {
    if (!AI_TERMS.some((re) => re.test(sentence))) continue;
    if (BAN_TERMS.some((re) => re.test(sentence))) return 'YASAK';
    if (DISCLOSE_TERMS.some((re) => re.test(sentence))) disclose = true;
  }
  return disclose ? 'ACIKLAMA' : 'YOK';
}

export async function fetchPolicyTexts(client, fullName) {
  const parts = await Promise.all(POLICY_PATHS.map((p) =>
    client.request(`/repos/${fullName}/${p}`, { raw: true }).catch(() => null)));
  return { text: parts.filter(Boolean).join('\n\n'), readme: parts.at(-1) ?? '' };
}
```

- [ ] **Adım 4: Testlerin geçtiğini doğrula**

Çalıştır: `node --test test/politika.test.mjs`
Beklenen: PASS (7 test)

- [ ] **Adım 5: Commit**

```bash
git add scripts/lib/politika.mjs test/politika.test.mjs
git commit -m "feat: AI politikası tespiti"
```

---

### Task 5: Türkçe çeviri fırsatı tespiti

**Dosyalar:**
- Oluştur: `scripts/lib/ceviri.mjs`
- Test: `test/ceviri.test.mjs`

**Arayüzler:**
- Tüketir: `detectFormat`, `readEntries`, `parsePo`, `poStats` (Task 1); `client.request` (Task 3)
- Üretir: `findLocaleSets(paths) -> Array<{ dir, style: 'file'|'folder'|'gettext', sourceFiles, trFiles, otherLangs }>`, `usesTranslationPlatform(paths, readme) -> boolean`, `completionRatio(format, srcText, trText) -> number`, `evaluateTranslation({ client, repo, paths, readme, config, log? }) -> Promise<Opportunity|null>`

- [ ] **Adım 1: Başarısız testi yaz** — `test/ceviri.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findLocaleSets, usesTranslationPlatform, completionRatio, evaluateTranslation,
} from '../scripts/lib/ceviri.mjs';

const PATHS = [
  'README.md',
  'src/locales/en.json', 'src/locales/de.json', 'src/locales/fr.json', 'src/locales/es.json',
  'public/i18n/en/common.json', 'public/i18n/en/home.json', 'public/i18n/tr/common.json', 'public/i18n/de/common.json',
  'po/tr/LC_MESSAGES/app.po', 'po/en/LC_MESSAGES/app.po',
  'locale/tr/LC_MESSAGES/django.po', 'locale/en/LC_MESSAGES/django.po', 'locale/fr/LC_MESSAGES/django.po',
  'node_modules/x/locales/en.json',
];

test('findLocaleSets üç stili bulur ve diğer dil sayısına göre sıralar', () => {
  assert.deepEqual(findLocaleSets(PATHS), [
    { dir: 'src/locales', style: 'file', sourceFiles: ['src/locales/en.json'], trFiles: [], otherLangs: ['de', 'es', 'fr'] },
    {
      dir: 'public/i18n', style: 'folder',
      sourceFiles: ['public/i18n/en/common.json', 'public/i18n/en/home.json'],
      trFiles: ['public/i18n/tr/common.json'], otherLangs: ['de'],
    },
    {
      dir: 'locale', style: 'gettext',
      sourceFiles: ['locale/en/LC_MESSAGES/django.po'], trFiles: ['locale/tr/LC_MESSAGES/django.po'], otherLangs: ['fr'],
    },
  ]);
});

test('findLocaleSets en-US ve tr-TR gibi bölgesel kodları tanır', () => {
  const sets = findLocaleSets(['i18n/en-US.json', 'i18n/tr_TR.json', 'i18n/pt-BR.json']);
  assert.deepEqual(sets[0].sourceFiles, ['i18n/en-US.json']);
  assert.deepEqual(sets[0].trFiles, ['i18n/tr_TR.json']);
  assert.deepEqual(sets[0].otherLangs, ['pt-br']);
});

test('usesTranslationPlatform dosya veya README linkiyle tespit eder', () => {
  assert.equal(usesTranslationPlatform(['crowdin.yml'], ''), true);
  assert.equal(usesTranslationPlatform(['.tx/config'], ''), true);
  assert.equal(usesTranslationPlatform(['a.js'], 'Translate on https://hosted.weblate.org/x'), true);
  assert.equal(usesTranslationPlatform(['a.js'], 'hello'), false);
});

test('completionRatio json, yaml ve po için oran hesaplar', () => {
  assert.equal(completionRatio('json', '{"a":"1","b":"2","c":"3","d":"4"}', '{"a":"x","b":""}'), 0.25);
  assert.equal(completionRatio('yaml', 'en:\n  a: A\n  b: B\n', 'tr:\n  a: X\n'), 0.5);
  assert.equal(completionRatio('po', '', 'msgid "a"\nmsgstr "x"\n\nmsgid "b"\nmsgstr ""\n'), 0.5);
});

const repo = {
  fullName: 'o/r', htmlUrl: 'https://github.com/o/r', defaultBranch: 'main', stars: 1000,
  topics: [], language: 'TypeScript', pushedAt: '2026-09-20T00:00:00Z',
};
const config = { minDigerDil: 3, ceviriEksikEsik: 0.7 };

test('Türkçe yoksa "yok" fırsatı üretir', async () => {
  const client = { request: async () => { throw new Error('çağrılmamalı'); } };
  const opp = await evaluateTranslation({ client, repo, paths: PATHS.slice(0, 5), readme: '', config });
  assert.equal(opp.key, 'o/r:tr');
  assert.equal(opp.tur, 'ceviri');
  assert.equal(opp.detay.durum, 'yok');
  assert.equal(opp.baslik, 'Türkçe çeviri yok');
  assert.equal(opp.url, 'https://github.com/o/r/tree/main/src/locales');
  assert.equal(opp.neden, '3 dile çevrilmiş, Türkçe yok');
});

test('Türkçe eksikse oranı hesaplar (eşleşmeyen dosya 0 sayılır)', async () => {
  const files = {
    'public/i18n/en/common.json': '{"a":"1","b":"2"}',
    'public/i18n/tr/common.json': '{"a":"x"}',
    'public/i18n/en/home.json': '{"c":"3"}',
  };
  const client = {
    request: async (p) => files[decodeURIComponent(p.split('/contents/')[1].split('?')[0])] ?? null,
  };
  const opp = await evaluateTranslation({ client, repo, paths: PATHS.slice(5, 9), readme: '', config });
  assert.equal(opp.detay.durum, 'eksik');
  assert.equal(opp.detay.oran, 0.25);
  assert.equal(opp.baslik, 'Türkçe çeviri eksik (%25)');
});

test('Türkçe yeterince tamamsa fırsat yok', async () => {
  const client = { request: async () => '{"a":"x"}' };
  const paths = ['locales/en.json', 'locales/tr.json'];
  assert.equal(await evaluateTranslation({ client, repo, paths, readme: '', config }), null);
});

test('diğer dil sayısı azsa ve Türkçe yoksa fırsat yok', async () => {
  const client = { request: async () => null };
  assert.equal(await evaluateTranslation({ client, repo, paths: ['locales/en.json', 'locales/de.json'], readme: '', config }), null);
});

test('çeviri platformu kullanan repo atlanır', async () => {
  const client = { request: async () => null };
  const paths = ['crowdin.yml', ...PATHS.slice(0, 5)];
  assert.equal(await evaluateTranslation({ client, repo, paths, readme: '', config }), null);
});

test('ayrıştırılamayan dosya loglanır ve atlanır', async () => {
  const logs = [];
  const client = { request: async () => '{bozuk' };
  const paths = ['locales/en.json', 'locales/tr.json'];
  const opp = await evaluateTranslation({ client, repo, paths, readme: '', config, log: (m) => logs.push(m) });
  assert.equal(opp, null);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /o\/r locales/);
});
```

- [ ] **Adım 2: Testin başarısız olduğunu doğrula**

Çalıştır: `node --test test/ceviri.test.mjs`
Beklenen: FAIL — modül bulunamadı

- [ ] **Adım 3: Uygulamayı yaz** — `scripts/lib/ceviri.mjs`

```js
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
```

- [ ] **Adım 4: Testlerin geçtiğini doğrula**

Çalıştır: `node --test test/ceviri.test.mjs`
Beklenen: PASS (10 test)

- [ ] **Adım 5: Commit**

```bash
git add scripts/lib/ceviri.mjs test/ceviri.test.mjs
git commit -m "feat: Türkçe çeviri fırsatı tespiti"
```

---

### Task 6: Kod ve doküman issue fırsatları

**Dosyalar:**
- Oluştur: `scripts/lib/issuelar.mjs`
- Test: `test/issuelar.test.mjs`

**Arayüzler:**
- Tüketir: `client.search('issues', q, { perPage })`, `client.request` (Task 3)
- Üretir: `CLAIM_PATTERNS`, `buildIssueQueries(fullNames, labels, groupSize = 5) -> string[]`, `isClaimed(comments, now, days = 30) -> boolean`, `hasMaintainerComment(comments) -> boolean`, `issueType(item, config) -> 'kod'|'dokuman'|null`, `repoFromIssue(item) -> 'owner/repo'`, `findIssueOpportunities({ client, repos, config, now, log? }) -> Promise<{ opps: Opportunity[], failures: string[], claimed: number }>`

- [ ] **Adım 1: Başarısız testi yaz** — `test/issuelar.test.mjs`

```js
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
```

- [ ] **Adım 2: Testin başarısız olduğunu doğrula**

Çalıştır: `node --test test/issuelar.test.mjs`
Beklenen: FAIL — modül bulunamadı

- [ ] **Adım 3: Uygulamayı yaz** — `scripts/lib/issuelar.mjs`

```js
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
    const body = (c.body ?? '').toLowerCase().replace(/[’‘]/g, "'");
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
```

- [ ] **Adım 4: Testlerin geçtiğini doğrula**

Çalıştır: `node --test test/issuelar.test.mjs`
Beklenen: PASS (7 test)

- [ ] **Adım 5: Commit**

```bash
git add scripts/lib/issuelar.mjs test/issuelar.test.mjs
git commit -m "feat: kod ve doküman issue fırsatları"
```

---

### Task 7: Puanlama ve seçim

**Dosyalar:**
- Oluştur: `scripts/lib/puan.mjs`
- Test: `test/puan.test.mjs`

**Arayüzler:**
- Tüketir: `Opportunity`, `Repo` tipleri (`repo.mergedExternal` tara.run tarafından atanır)
- Üretir: `countMergedExternal(pulls) -> number`, `scoreMaintainer(n)`, `scoreClarity(opp)`, `scoreTopicLang(repo, config)`, `scoreFreshness(opp, now)`, `scoreSize(stars, config)`, `scoreOpportunity(opp, config, now) -> number`, `selectTop(opps, config, perRepo = 2) -> Opportunity[]` (puana göre azalan)

- [ ] **Adım 1: Başarısız testi yaz** — `test/puan.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countMergedExternal, scoreMaintainer, scoreClarity, scoreTopicLang, scoreFreshness, scoreSize,
  scoreOpportunity, selectTop,
} from '../scripts/lib/puan.mjs';

const config = {
  konular: ['accessibility'], diller: ['TypeScript'],
  yildiz: { min: 100, max: 30000, idealMin: 500, idealMax: 10000 },
};
const now = new Date('2026-09-23T00:00:00Z');

test('countMergedExternal sadece dışarıdan gelen ve merge edilmiş PRları sayar', () => {
  assert.equal(countMergedExternal([
    { merged_at: 'x', author_association: 'CONTRIBUTOR' },
    { merged_at: null, author_association: 'NONE' },
    { merged_at: 'x', author_association: 'MEMBER' },
    { merged_at: 'x', author_association: 'FIRST_TIME_CONTRIBUTOR' },
  ]), 2);
});

test('scoreMaintainer 10 PRda tavan yapar', () => {
  assert.equal(scoreMaintainer(0), 0);
  assert.equal(scoreMaintainer(4), 12);
  assert.equal(scoreMaintainer(25), 30);
});

test('scoreClarity kod issue kriterlerini uygular, çeviride 20 verir', () => {
  const body = `${'x'.repeat(200)}\n1. adım`;
  assert.equal(scoreClarity({ tur: 'kod', detay: { govde: body, maintainerYorumu: true } }), 20);
  assert.equal(scoreClarity({ tur: 'dokuman', detay: { govde: '```js\na\n```', maintainerYorumu: false } }), 6);
  assert.equal(scoreClarity({ tur: 'kod', detay: { govde: 'kısa', maintainerYorumu: false } }), 0);
  assert.equal(scoreClarity({ tur: 'ceviri', detay: {} }), 20);
});

test('scoreTopicLang konu ve dil eşleşmesine 10ar puan verir', () => {
  assert.equal(scoreTopicLang({ topics: ['accessibility'], language: 'TypeScript' }, config), 20);
  assert.equal(scoreTopicLang({ topics: [], language: 'TypeScript' }, config), 10);
  assert.equal(scoreTopicLang({ topics: [], language: 'Go' }, config), 0);
});

test('scoreFreshness issue yaşına ve çeviride son pusha bakar', () => {
  assert.equal(scoreFreshness({ tur: 'kod', detay: { olusturma: '2026-09-01T00:00:00Z' } }, now), 15);
  assert.equal(scoreFreshness({ tur: 'kod', detay: { olusturma: '2026-02-23T00:00:00Z' } }, now), 8);
  assert.equal(scoreFreshness({ tur: 'kod', detay: { olusturma: '2025-01-01T00:00:00Z' } }, now), 0);
  assert.equal(scoreFreshness({ tur: 'ceviri', repo: { pushedAt: '2026-09-20T00:00:00Z' } }, now), 15);
  assert.equal(scoreFreshness({ tur: 'ceviri', repo: { pushedAt: '2026-07-01T00:00:00Z' } }, now), 8);
});

test('scoreSize ideal aralığa 15, genel aralığa 8 verir', () => {
  assert.equal(scoreSize(1000, config), 15);
  assert.equal(scoreSize(200, config), 8);
  assert.equal(scoreSize(50000, config), 0);
});

test('scoreOpportunity bileşenleri toplar', () => {
  const repo = { topics: ['accessibility'], language: 'TypeScript', stars: 1000, pushedAt: '2026-09-20T00:00:00Z', mergedExternal: 5 };
  assert.equal(scoreOpportunity({ tur: 'ceviri', repo, detay: {} }, config, now), 85);
});

test('selectTop kota, repo sınırı ve boşluk doldurmayı uygular', () => {
  const mk = (key, tur, repo, puan) => ({ key, tur, repo: { fullName: repo }, puan });
  const cfg = { haftalikKota: { ceviri: 1, kod: 2, dokuman: 1 } };
  const opps = [
    mk('a#1', 'kod', 'a', 90), mk('a#2', 'kod', 'a', 85), mk('a#3', 'kod', 'a', 80),
    mk('b:tr', 'ceviri', 'b', 70), mk('c#1', 'kod', 'c', 60), mk('d#1', 'kod', 'd', 50),
  ];
  assert.deepEqual(selectTop(opps, cfg).map((o) => o.key), ['a#1', 'a#2', 'b:tr', 'c#1']);
});
```

- [ ] **Adım 2: Testin başarısız olduğunu doğrula**

Çalıştır: `node --test test/puan.test.mjs`
Beklenen: FAIL — modül bulunamadı

- [ ] **Adım 3: Uygulamayı yaz** — `scripts/lib/puan.mjs`

```js
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
```

- [ ] **Adım 4: Testlerin geçtiğini doğrula**

Çalıştır: `node --test test/puan.test.mjs`
Beklenen: PASS (8 test)

- [ ] **Adım 5: Commit**

```bash
git add scripts/lib/puan.mjs test/puan.test.mjs
git commit -m "feat: fırsat puanlama ve seçim"
```

---

### Task 8: Rapor ve görülen kaydı

**Dosyalar:**
- Oluştur: `scripts/lib/rapor.mjs`, `scripts/lib/gorulen.mjs`
- Test: `test/rapor.test.mjs`, `test/gorulen.test.mjs`

**Arayüzler:**
- Üretir (rapor): `reportTitle(date) -> string`, `renderReport({ date, selected, stats, failures }) -> string`, `parseReportData(body) -> object[]` (her öğe `{ key, tur, repo: 'owner/repo', baslik, url, puan, notlar, detay }`)
- Üretir (gorulen): `pruneSeen(seen, now, days = 180) -> object`, `markSeen(seen, keys, date) -> object`

- [ ] **Adım 1: Başarısız testleri yaz** — `test/rapor.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportTitle, renderReport, parseReportData } from '../scripts/lib/rapor.mjs';

const repoA = { fullName: 'o/a', htmlUrl: 'https://github.com/o/a', stars: 1200 };
const opp = (o) => ({ notlar: [], neden: 'n', ...o });

test('reportTitle en dash kullanır', () => {
  assert.equal(reportTitle('2026-09-28'), 'Fırsatlar – 2026-09-28');
});

test('renderReport türe göre gruplar, numaralar ve veri bloğu ekler', () => {
  const selected = [
    opp({ key: 'o/a#5', tur: 'kod', repo: repoA, baslik: 'Fix | pipe', url: 'u1', puan: 80, detay: { numara: 5, govde: 'uzun' } }),
    opp({
      key: 'o/a:tr', tur: 'ceviri', repo: repoA, baslik: 'Türkçe çeviri yok', url: 'u2', puan: 70,
      notlar: ['⚠ AI kullanımını belirt'], detay: { durum: 'yok', dir: 'locales' },
    }),
  ];
  const body = renderReport({ date: '2026-09-28', selected, stats: { 'Taranan repo': 3 }, failures: ['q1'] });
  assert.match(body, /^# Fırsatlar – 2026-09-28/);
  assert.ok(body.indexOf('## Türkçe çeviri') < body.indexOf('## Kod'));
  assert.ok(body.includes('| 1 | 70 | [o/a](https://github.com/o/a) ⭐1200 | [Türkçe çeviri yok](u2) | n | ⚠ AI kullanımını belirt |'));
  assert.ok(body.includes('Fix \\| pipe'));
  assert.ok(body.includes('- Taranan repo: 3'));
  assert.ok(body.includes('- q1'));
  const data = parseReportData(body);
  assert.deepEqual(data.map((d) => [d.key, d.puan, d.repo]), [['o/a:tr', 70, 'o/a'], ['o/a#5', 80, 'o/a']]);
  assert.deepEqual(data[1].detay, { numara: 5 });
});

test('boş rapor bilgi mesajı içerir ve boş veri döner', () => {
  const body = renderReport({ date: '2026-09-28', selected: [], stats: { 'Taranan repo': 0 }, failures: [] });
  assert.ok(body.includes('Bu hafta uygun fırsat bulunamadı.'));
  assert.deepEqual(parseReportData(body), []);
});

test('veri bloğu --> içeren metni bozmaz', () => {
  const selected = [opp({ key: 'o/a#1', tur: 'kod', repo: repoA, baslik: 'a --> b', url: 'u', puan: 1, detay: { numara: 1 } })];
  const body = renderReport({ date: '2026-09-28', selected, stats: {}, failures: [] });
  assert.equal(parseReportData(body)[0].baslik, 'a --> b');
});

test('parseReportData blok yoksa boş dizi döner', () => {
  assert.deepEqual(parseReportData('düz metin'), []);
});
```

`test/gorulen.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneSeen, markSeen } from '../scripts/lib/gorulen.mjs';

test('pruneSeen 180 günden eski kayıtları siler', () => {
  const now = new Date('2026-09-23T00:00:00Z');
  assert.deepEqual(pruneSeen({ a: '2026-09-01', b: '2026-01-01' }, now), { a: '2026-09-01' });
});

test('markSeen yeni anahtarları ekler, mevcut tarihi korur', () => {
  assert.deepEqual(markSeen({ a: '2026-09-01' }, ['a', 'b'], '2026-09-28'), { a: '2026-09-01', b: '2026-09-28' });
});
```

- [ ] **Adım 2: Testlerin başarısız olduğunu doğrula**

Çalıştır: `node --test test/rapor.test.mjs test/gorulen.test.mjs`
Beklenen: FAIL — modüller bulunamadı

- [ ] **Adım 3: Uygulamaları yaz** — `scripts/lib/rapor.mjs`

```js
const TUR_ADI = { ceviri: 'Türkçe çeviri', kod: 'Kod', dokuman: 'Dokümantasyon' };
const TUR_SIRASI = ['ceviri', 'kod', 'dokuman'];
const DATA_RE = /<!-- katki-data: ([\s\S]*?) -->/;

export const reportTitle = (date) => `Fırsatlar – ${date}`;

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function toData(opp) {
  return {
    key: opp.key,
    tur: opp.tur,
    repo: opp.repo.fullName,
    baslik: opp.baslik,
    url: opp.url,
    puan: opp.puan,
    notlar: opp.notlar,
    detay: opp.tur === 'ceviri' ? opp.detay : { numara: opp.detay.numara },
  };
}

export function renderReport({ date, selected, stats, failures = [] }) {
  const lines = [`# ${reportTitle(date)}`, ''];
  const ordered = [];
  if (selected.length === 0) {
    lines.push('Bu hafta uygun fırsat bulunamadı.', '');
  } else {
    lines.push('`/katki` komutuyla bu listeden seçerek başlayabilirsin.', '');
    for (const tur of TUR_SIRASI) {
      const group = selected.filter((o) => o.tur === tur);
      if (group.length === 0) continue;
      lines.push(`## ${TUR_ADI[tur]}`, '', '| # | Puan | Repo | İş | Neden | Not |', '|---|---|---|---|---|---|');
      for (const o of group) {
        ordered.push(o);
        lines.push(
          `| ${ordered.length} | ${o.puan} | [${o.repo.fullName}](${o.repo.htmlUrl}) ⭐${o.repo.stars} `
          + `| [${cell(o.baslik)}](${o.url}) | ${cell(o.neden)} | ${cell(o.notlar.join(' '))} |`,
        );
      }
      lines.push('');
    }
  }
  lines.push('<details><summary>Tarama istatistikleri</summary>', '');
  for (const [k, v] of Object.entries(stats)) lines.push(`- ${k}: ${v}`);
  lines.push('', '</details>', '');
  if (failures.length) {
    lines.push('⚠ **Başarısız sorgular:**', '');
    for (const f of failures) lines.push(`- ${cell(f)}`);
    lines.push('');
  }
  const json = JSON.stringify(ordered.map(toData)).replace(/>/g, '\\u003e');
  lines.push(`<!-- katki-data: ${json} -->`);
  return lines.join('\n');
}

export function parseReportData(body) {
  const m = body.match(DATA_RE);
  return m ? JSON.parse(m[1]) : [];
}
```

`scripts/lib/gorulen.mjs`:

```js
const DAY = 864e5;

export function pruneSeen(seen, now, days = 180) {
  const cutoff = now.getTime() - days * DAY;
  return Object.fromEntries(Object.entries(seen).filter(([, date]) => new Date(date).getTime() >= cutoff));
}

export function markSeen(seen, keys, date) {
  const out = { ...seen };
  for (const key of keys) out[key] ??= date;
  return out;
}
```

- [ ] **Adım 4: Testlerin geçtiğini doğrula**

Çalıştır: `node --test test/rapor.test.mjs test/gorulen.test.mjs`
Beklenen: PASS (7 test)

- [ ] **Adım 5: Commit**

```bash
git add scripts/lib/rapor.mjs scripts/lib/gorulen.mjs test/rapor.test.mjs test/gorulen.test.mjs
git commit -m "feat: markdown rapor ve görülen kaydı"
```

---

### Task 9: Keşif + orkestrasyon (tara.mjs) + yerel kuru çalıştırma

**Dosyalar:**
- Oluştur: `scripts/lib/kesif.mjs`, `scripts/tara.mjs`, `config.json`, `data/gorulen.json`
- Test: `test/kesif.test.mjs`, `test/tara.test.mjs`

**Arayüzler:**
- Tüketir: Task 3–8'deki tüm dışa aktarımlar
- Üretir (kesif): `isoDate(date) -> 'YYYY-MM-DD'`, `buildRepoQueries(config, now) -> string[]`, `normalizeRepo(apiRepo) -> Repo`, `discoverRepos({ client, config, now }) -> Promise<{ repos: Repo[], failures: string[] }>`
- Üretir (tara): `run({ client, config, now, dryRun, selfRepo?, seenPath, log?, out? }) -> Promise<{ selected, body }>`, `openPrRepos(client, user) -> Promise<Set<string>>` (küçük harf `owner/repo`), `publishReport(client, selfRepo, title, body) -> Promise<object>`

- [ ] **Adım 1: Başarısız testleri yaz** — `test/kesif.test.mjs`

```js
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
```

`test/tara.test.mjs`:

```js
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
```

- [ ] **Adım 2: Testlerin başarısız olduğunu doğrula**

Çalıştır: `node --test test/kesif.test.mjs test/tara.test.mjs`
Beklenen: FAIL — modüller bulunamadı

- [ ] **Adım 3: kesif.mjs yaz** — `scripts/lib/kesif.mjs`

```js
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
```

- [ ] **Adım 4: tara.mjs yaz** — `scripts/tara.mjs`

```js
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
```

- [ ] **Adım 5: config.json ve data/gorulen.json oluştur**

`config.json`:

```json
{
  "kullanici": "muhammedkoramaz",
  "konular": ["accessibility", "a11y", "education", "edtech", "health", "humanitarian",
              "disaster-response", "privacy", "self-hosted", "digital-public-goods"],
  "diller": ["JavaScript", "TypeScript", "Python"],
  "yildiz": { "min": 100, "max": 30000, "idealMin": 500, "idealMax": 10000 },
  "sonPushGun": 90,
  "maksRepo": 80,
  "kodEtiketleri": ["good first issue", "help wanted"],
  "dokumanEtiketleri": ["documentation", "docs"],
  "haftalikKota": { "ceviri": 4, "kod": 4, "dokuman": 2 },
  "ceviriEksikEsik": 0.7,
  "minDigerDil": 3
}
```

`data/gorulen.json`:

```json
{}
```

- [ ] **Adım 6: Testlerin geçtiğini doğrula**

Çalıştır: `node --test test/kesif.test.mjs test/tara.test.mjs`
Beklenen: PASS (9 test)

- [ ] **Adım 7: Tüm test paketini çalıştır**

Çalıştır: `node --test`
Beklenen: PASS, 0 başarısız (toplam ~77 test)

- [ ] **Adım 8: Gerçek veriyle kuru çalıştırma (yerel)**

Çalıştır (Git Bash):
```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
GITHUB_TOKEN=$(gh auth token) node scripts/tara.mjs --dry-run > /tmp/rapor.md
```
Beklenen: 2–4 dakika içinde çıkış kodu 0; `rapor.md` dosyası `# Fırsatlar – <bugün>` ile başlar, en az 1 tablo satırı ve `<!-- katki-data:` bloğu içerir; istatistiklerde `API isteği` < 1000. Linklerden 2–3 tanesini elle açıp fırsatın gerçekten geçerli olduğunu (issue açık/atanmamış, locale klasörü doğru) kontrol et. Yanlış pozitif varsa: ilgili modülde test ekleyip düzelt, bu adımı tekrarla.

- [ ] **Adım 9: Commit**

```bash
git add scripts/lib/kesif.mjs scripts/tara.mjs config.json data/gorulen.json test/kesif.test.mjs test/tara.test.mjs
git commit -m "feat: keşif ve haftalık tarama orkestrasyonu"
```

---

### Task 10: GitHub Actions workflow + sözlük

**Dosyalar:**
- Oluştur: `.github/workflows/tara.yml`, `tr-sozluk.md`

**Arayüzler:**
- Tüketir: `node --test`, `node scripts/tara.mjs` (Task 9); `GITHUB_TOKEN`, `GITHUB_REPOSITORY` ortam değişkenleri

- [ ] **Adım 1: Workflow yaz** — `.github/workflows/tara.yml`

```yaml
name: Haftalık tarama

on:
  schedule:
    - cron: "0 6 * * 1" # Pazartesi 06:00 UTC = 09:00 TSİ
  workflow_dispatch:

permissions:
  contents: write
  issues: write

concurrency:
  group: tara
  cancel-in-progress: false

jobs:
  tara:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Testler
        run: node --test
      - name: Tarama
        run: node scripts/tara.mjs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: gorulen.json kaydet
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/gorulen.json
          git diff --cached --quiet || (git commit -m "chore: görülen fırsatları güncelle" && git push)
```

- [ ] **Adım 2: Sözlüğü yaz** — `tr-sozluk.md`

```markdown
# Türkçe Terim Sözlüğü

Çevirilerde tutarlılık için. `/katki` her çeviri işinde bu dosyayı okur; kullanıcının düzelttiği yeni terimler buraya eklenir.

## Genel kurallar
- Hitap: projede mevcut Türkçe dosya varsa onun tonu; yoksa **siz** ("Kaydedin", "Emin misiniz?").
- Düğmeler kısa ve emir kipinde: "Kaydet", "İptal", "Sil".
- Yer tutucular (`{name}`, `%s`, `{{count}}`), HTML etiketleri ve ICU yapıları olduğu gibi kalır; Türkçe ekler yer tutucuya kesme ile bağlanır: `{name}'in` yerine mümkünse ek gerektirmeyen yapı kurulur ("Kullanıcı: {name}").
- Marka ve ürün adları çevrilmez.

## Terimler

| English | Türkçe | Not |
|---|---|---|
| Settings | Ayarlar | |
| Preferences | Tercihler | |
| Sign in / Log in | Giriş yap | |
| Sign out / Log out | Çıkış yap | |
| Sign up | Kaydol | |
| Account | Hesap | |
| Profile | Profil | |
| Password | Parola | "Şifre" değil |
| Username | Kullanıcı adı | |
| Email | E-posta | |
| Save | Kaydet | |
| Cancel | İptal | |
| Delete | Sil | |
| Remove | Kaldır | |
| Edit | Düzenle | |
| Add | Ekle | |
| Create | Oluştur | |
| Search | Ara | |
| Filter | Filtrele | |
| Upload | Yükle | |
| Download | İndir | |
| Share | Paylaş | |
| Submit | Gönder | |
| Back | Geri | |
| Next | İleri | |
| Close | Kapat | |
| Loading… | Yükleniyor… | |
| Error | Hata | |
| Warning | Uyarı | |
| Success | Başarılı | |
| Notifications | Bildirimler | |
| Dashboard | Pano | |
| Help | Yardım | |
| Language | Dil | |
| Accessibility | Erişilebilirlik | |
| Privacy | Gizlilik | |
| Are you sure? | Emin misiniz? | |
```

- [ ] **Adım 3: YAML sözdizimini doğrula**

Çalıştır: `node -e "const t=require('fs').readFileSync('.github/workflows/tara.yml','utf8'); if(!/cron: \"0 6 \* \* 1\"/.test(t)||!/workflow_dispatch/.test(t)) process.exit(1); console.log('ok')"`
Beklenen: `ok` (asıl doğrulama Task 12'de GitHub üzerinde workflow çalıştırılarak yapılır)

- [ ] **Adım 4: Commit**

```bash
git add .github/workflows/tara.yml tr-sozluk.md
git commit -m "feat: haftalık workflow ve Türkçe terim sözlüğü"
```

---

### Task 11: `/katki` komut dosyası

**Dosyalar:**
- Oluştur: `komut/katki.md`
- Kopyala: `komut/katki.md` → `C:\Users\muham\.claude\commands\katki.md`

**Arayüzler:**
- Tüketir: rapor issue'sundaki `katki-data` bloğu (Task 8 formatı), `scripts/lib/ceviri-kontrol.mjs` CLI (Task 2), `tr-sozluk.md` (Task 10)

- [ ] **Adım 1: Komut dosyasını yaz** — `komut/katki.md`

````markdown
---
description: Açık kaynak katkı akışı — haftalık fırsatlardan birini seç, hazırla, onayla, PR aç
argument-hint: "[boş | issue/repo linki | takip]"
---

# /katki

Kullanıcının (GitHub: `muhammedkoramaz`) açık kaynak katkı asistanısın.
Tasarım: `C:\Users\muham\katki\katki-radar\docs\superpowers\specs\2026-09-23-katki-radar-design.md`

Argüman: `$ARGUMENTS`

## Kesin kurallar
- ✋ işaretli adımlarda DUR ve kullanıcının açık onayını bekle. Onaysız: issue yorumu atma, push etme, PR açma, PR'a yorum yazma.
- Testler/lint/build geçmeden PR önerme. Çalıştırılamıyorsa PR açma; "ortamı kur" veya "işi bırak" seçeneklerini sun.
- Değişikliği işin kapsamında tut: ilgisiz refactor, format değişikliği, bağımlılık güncellemesi yok.
- Projenin AI politikası yasaklıyorsa işi hemen bırak, nedenini alıntıyla göster.
- Kullanıcıyla Türkçe konuş; upstream'e yazılan her şey (issue yorumu, commit, PR) projenin dilinde (genelde İngilizce).
- Bash'te `gh` bulunamazsa önce: `export PATH="$PATH:/c/Program Files/GitHub CLI"`

## Sabitler
- Radar reposu: `muhammedkoramaz/katki-radar`; yerel kopya `C:/Users/muham/katki/katki-radar`
- Çalışma klasörü: `C:/Users/muham/katki/<repo-adı>`
- Sözlük: `C:/Users/muham/katki/katki-radar/tr-sozluk.md`
- Çeviri kontrolü: `node C:/Users/muham/katki/katki-radar/scripts/lib/ceviri-kontrol.mjs <kaynak-dosya | -> <tr-dosyası>`

## 0. Ön kontroller
1. `gh auth status` — başarısızsa dur ve kullanıcıya `! gh auth login` yazmasını söyle.
2. Yarım işler: `C:/Users/muham/katki/` altındaki her git reposunda (katki-radar hariç) `git branch --list "katki/*"`; her branch için `gh pr list -R <upstream> --head <branch> --author @me --state all --json url` boşsa "yarım kalan iş" olarak not et.
3. Son 7 gündeki PR sayısı: `gh search prs --author @me --created ">=<bugün-7gün, YYYY-MM-DD>" --json url --limit 50`. ≥ 3 ise uyar: "Bu haftaki hedefe ulaştın; yine de devam edelim mi?"

## Mod seçimi
- `$ARGUMENTS` boş → Liste modu (Adım 1)
- `takip` → Takip modu (en alt bölüm)
- GitHub issue linki → o issue seçilmiş say, Adım 2'den başla
- GitHub repo linki → Türkçe çeviri işi say, locale klasörünü kendin bul, Adım 2'den başla

## 1. Seçim ✋
`gh issue list -R muhammedkoramaz/katki-radar --label firsatlar --state open --limit 1 --json number,title,body`
Gövdedeki `<!-- katki-data: [...] -->` bloğunu JSON olarak ayrıştır. Önce yarım kalan işleri, sonra listeyi tablo olarak göster (#, puan, tür, repo, iş, not). Kullanıcıya hangisini seçtiğini sor.

## 2. Proje kontrolü
Klonlamadan önce `gh` ile incele (dosyalar için `gh api repos/<o>/<r>/contents/<yol> -H "Accept: application/vnd.github.raw"`):
- CONTRIBUTING (`CONTRIBUTING.md`, `.github/CONTRIBUTING.md`, `docs/CONTRIBUTING.md`), `AI_POLICY.md`, README, `CODE_OF_CONDUCT.md`
- PR şablonu (`.github/PULL_REQUEST_TEMPLATE.md` veya `.github/PULL_REQUEST_TEMPLATE/`)
- CLA (CLA bot, `CLA.md`) ve DCO (`Signed-off-by`) şartı; commit formatı (conventional commits vb.)
- Test/lint/build komutları: `package.json` scripts, `pyproject.toml`/`tox.ini`/`Makefile`, `.github/workflows/*.yml`
- AI politikasını TAM METİN oku. Yasak → işi iptal et. Açıklama şartı → not al.
- Kod/doküman: `gh issue view <url> --comments` — atanmış mı, bağlı PR var mı, biri sahiplenmiş mi?
Kullanıcıya 5–8 maddelik Türkçe özet ver.

## 3. Kaynak görme (yalnızca kod/doküman) ✋
Kısa, kibar bir İngilizce yorum taslağı hazırla (ör. "Hi! I'd like to work on this. My plan: <1–2 sentences>. Does that sound good?"). Göster; onaylanırsa `gh issue comment <url> --body-file <geçici-dosya>`. Maintainer cevabını bekleyip beklemeyeceğini sor; beklenecekse dur ve daha sonra `/katki <issue-linki>` ile devam edilebileceğini söyle.

## 4. Hazırlık
- Klasör yoksa: `cd C:/Users/muham/katki && gh repo fork <o>/<r> --clone` (upstream remote otomatik eklenir)
- Klasör varsa: `gh repo sync muhammedkoramaz/<r> --source <o>/<r>`, sonra klasörde `git fetch upstream && git checkout <varsayılan-branch> && git merge --ff-only upstream/<varsayılan-branch>`
- `git checkout -b katki/<kisa-ad>` (ör. `katki/tr-locale`, `katki/issue-123`)
- Bağımlılıkları lock dosyasına göre kur: `package-lock.json` → `npm ci`; `pnpm-lock.yaml` → `pnpm install --frozen-lockfile`; `yarn.lock` → `yarn install --frozen-lockfile`; `uv.lock` → `uv sync`; `poetry.lock` → `poetry install`; yalnızca `requirements*.txt` → `python -m venv .venv` + `pip install -r ...`

## 5a. Çeviri çalışması
1. `tr-sozluk.md`'yi oku; terimleri tutarlı kullan.
2. Hitap: mevcut Türkçe dosya varsa tonunu izle; yoksa "siz".
3. Türkçe dosyayı oluştur/tamamla: anahtar sırası ve yapısı kaynakla aynı; yer tutucular, HTML etiketleri ve ICU yapıları birebir korunur.
4. Her dosya için: `node C:/Users/muham/katki/katki-radar/scripts/lib/ceviri-kontrol.mjs <en-dosyası> <tr-dosyası>` (gettext `.po` için kaynak yerine `-`). Çıkış kodu 0 olana kadar düzelt.
5. ✋ Çeviriyi 30–50 satırlık parçalar halinde `| Anahtar | İngilizce | Türkçe |` tablosuyla göster; her parça için onay/düzeltme al. Kullanıcının düzelttiği terimleri `tr-sozluk.md`'ye ekle; sözlük değişikliğini katki-radar reposunda ayrıca commit + push et (`git -C C:/Users/muham/katki/katki-radar ...`).
6. Proje dilleri bir yerde listeliyorsa (dil seçici, i18n config, `languages.ts`, `LINGUAS` vb.) Türkçeyi ekle.

## 5b. Kod / doküman çalışması
1. Hatayı yeniden üret (kod) ya da eksik dokümanı netleştir.
2. Mümkünse önce başarısız olan bir test yaz, sonra düzelt.
3. Yalnızca issue kapsamında değişiklik yap.

## 6. Doğrulama
Projenin test, lint ve build komutlarını çalıştır. Başarısız veya çalıştırılamayan varsa dur: sebebi açıkla, "ortamı düzelt" / "işi bırak" seçeneklerini sun. Başarılıysa çıktı özetini sakla (PR gövdesindeki Testing bölümü için).

## 7. İnceleme ✋
`git diff --stat` ve `git diff` göster; ne değişti / neden / nasıl test edildi özetini Türkçe yaz. Onay veya düzeltme bekle.

## 8. PR ✋
1. Commit mesajı projenin formatında; DCO gerekiyorsa `git commit -s`.
2. PR başlığı ve gövdesi: şablon varsa doldur; yoksa `## Summary`, `## Changes`, `## Testing`. Kod/doküman işlerinde `Closes #<no>`. Gövdenin son satırı:
   `This change was prepared with AI assistance and reviewed and tested by me.`
3. Başlık + gövde + commit mesajını göster, onay iste.
4. Onaydan sonra: `git push -u origin katki/<kisa-ad>` ve `gh pr create -R <o>/<r> --head muhammedkoramaz:katki/<kisa-ad> --title "<başlık>" --body-file <geçici-dosya>`
5. CLA gerekiyorsa imza linkini ver. PR linkini göster.

## Takip modu (`/katki takip`)
1. `gh search prs --author @me --state open --json url,title,repository,updatedAt --limit 50`
2. Her PR için `gh pr view <url> --json reviews,comments,reviewDecision,statusCheckRollup`. Son yorum kullanıcıdan başkasına aitse "yeni yorum var" işaretle ve üste al; CI kırmızıysa belirt.
3. Kullanıcı bir PR seçince: yorumları teknik olarak değerlendir (körü körüne kabul etme; haksızsa nedenini açıkla), ilgili klasörde düzeltmeyi yap, Adım 6 doğrulamasını çalıştır, cevap taslağı hazırla.
4. ✋ Diff + cevap taslağını göster; onaydan sonra push ve `gh pr comment <url> --body-file <geçici-dosya>`.
````

- [ ] **Adım 2: Komutu kur**

Çalıştır:
```bash
mkdir -p /c/Users/muham/.claude/commands
cp komut/katki.md /c/Users/muham/.claude/commands/katki.md
head -3 /c/Users/muham/.claude/commands/katki.md
```
Beklenen: `---`, `description: Açık kaynak katkı akışı ...`, `argument-hint: ...`

- [ ] **Adım 3: Commit**

```bash
git add komut/katki.md
git commit -m "feat: /katki komut dosyası"
```

---

### Task 12: GitHub'a yayınlama ve kabul testi

**Dosyalar:** yok (yalnızca uzak repo ve workflow)

- [ ] **Adım 1: ✋ Kullanıcıya sor** — "katki-radar reposu public mi private mi olsun?" (Private'ta Actions ayda 2000 dakika ücretsiz; tarama haftada ~5 dakika.) Cevabı bekle.

- [ ] **Adım 2: Repoyu oluştur ve push et**

Çalıştır (cevaba göre `--private` veya `--public`):
```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
gh repo create muhammedkoramaz/katki-radar --private --source . --remote origin --push \
  --description "Açık kaynak katkı fırsatları radarı"
```
Beklenen: repo URL'si yazdırılır, `git log origin/main --oneline` yerel log ile aynı.

- [ ] **Adım 3: Workflow'u elle tetikle ve izle**

Çalıştır:
```bash
gh workflow run tara.yml -R muhammedkoramaz/katki-radar
sleep 5
gh run watch -R muhammedkoramaz/katki-radar $(gh run list -R muhammedkoramaz/katki-radar --workflow tara.yml --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
```
Beklenen: tüm adımlar yeşil. Kırmızıysa `gh run view --log-failed` ile hatayı oku, superpowers:systematic-debugging ile düzelt, tekrar tetikle.

- [ ] **Adım 4: Sonucu doğrula**

Çalıştır:
```bash
gh issue list -R muhammedkoramaz/katki-radar --label firsatlar --state open --json number,title
git pull --ff-only && cat data/gorulen.json
```
Beklenen: `Fırsatlar – <bugün>` başlıklı 1 açık issue, içinde ≥ 1 fırsat; `data/gorulen.json` seçilen anahtarları içerir (bot commit'i).

- [ ] **Adım 5: `/katki` duman testi**

Kullanıcıdan yeni bir Claude Code oturumunda `/katki` çalıştırmasını iste. Beklenen: ön kontroller geçer, bu haftanın listesi tablo olarak gösterilir. İlk gerçek PR, kullanıcıyla birlikte uçtan uca yapılır (spec §6 kabul testi).
