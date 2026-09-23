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
