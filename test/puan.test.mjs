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
