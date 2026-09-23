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
