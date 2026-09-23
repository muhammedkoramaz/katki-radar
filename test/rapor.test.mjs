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
