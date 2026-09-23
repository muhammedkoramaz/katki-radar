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
