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
