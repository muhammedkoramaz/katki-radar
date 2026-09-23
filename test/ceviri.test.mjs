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
