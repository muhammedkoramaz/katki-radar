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
