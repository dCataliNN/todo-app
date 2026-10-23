import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Points = require('../points.js');
const assert = require('node:assert/strict');
import test from 'node:test';

const noon = '2026-03-05T12:00:00';
const now = () => new Date(noon);

test('award: +10 per completed task, once per task id', () => {
  const w = Points.defaults();
  assert.equal(Points.award(w, 'a', now()), 10);
  assert.equal(Points.award(w, 'a', now()), 0); // same id never pays again
  assert.equal(Points.award(w, 'b', now()), 10);
  assert.equal(w.points, 20);
});

test('award: daily cap 100 reached, resets next day', () => {
  const w = Points.defaults();
  for (let i = 0; i < 10; i++) assert.equal(Points.award(w, 't' + i, now()), 10);
  assert.equal(w.points, 100);
  assert.equal(Points.award(w, 'extra', now()), 0); // capped
  const later = new Date('2026-03-06T00:30:00');
  assert.equal(Points.award(w, 'extra', later), 10); // new day
  assert.equal(w.points, 110);
});

test('award: partial grant when cap nearly full', () => {
  const w = Points.defaults();
  for (let i = 0; i < 9; i++) Points.award(w, 't' + i, now());
  w.earnedToday = 95; // force near cap
  assert.equal(Points.award(w, 'zz', now()), 5);
  assert.equal(w.points, 90 + 5); // 9 prior awards + partial grant
  assert.equal(Points.award(w, 'zz', now()), 0);
});

test('award: ignores empty ids and null wallet', () => {
  const w = Points.defaults();
  assert.equal(Points.award(w, '', now()), 0);
  assert.equal(Points.award(null, 'a', now()), 0);
});

test('redeem: deducts and owns, blocks double buy and insufficient funds', () => {
  const w = Points.normalize({ points: 60 });
  assert.equal(w.points, 60); // normalize accepts valid balance
  const buy = Points.redeem(w, 'grape');
  assert.deepEqual([buy.ok, buy.item.cost], [true, 60]);
  assert.deepEqual([w.points, w.owned, w.equipped], [0, ['grape'], null]);
  assert.equal(Points.redeem(w, 'grape').ok, false); // owned already
  assert.equal(Points.redeem(w, 'gold').reason, 'funds');
  assert.equal(Points.redeem(w, 'gold').missing, 99);
  assert.equal(Points.redeem(w, 'nope').reason, 'unknown'); // no mutation
  assert.equal(w.points, 0);
});

test('equip: only owned themes can be equipped', () => {
  const w = Points.normalize({ points: 99 });
  assert.equal(Points.equip(w, 'gold'), false); // not owned
  Points.redeem(w, 'gold');
  assert.equal(Points.equip(w, 'gold'), true);
  assert.equal(w.equipped, 'gold');
});

test('normalize: corrupt/old saves fall back to safe defaults', () => {
  for (const bad of [null, 'x', 42, { owned: ['nope'], points: -5, earnedToday: 999 }]) {
    const w = Points.normalize(bad);
    assert.equal(w.points, 0);
    assert.deepEqual(w.owned, []);
    assert.equal(w.equipped, null);
    assert.deepEqual(w.awarded, []);
  }
  // Known items survive, dupes collapse, equipped without owned is dropped.
  const w = Points.normalize({ points: 7, owned: ['gold', 'gold', 'sunset'], equipped: 'forest' });
  assert.equal(w.points, 7);
  assert.deepEqual(w.owned, ['gold', 'sunset']);
  assert.equal(w.equipped, null);
});

test('itemById: known ids resolve, junk does not', () => {
  assert.equal(Points.itemById('forest').cost, 30);
  assert.equal(Points.itemById(':)'), null);
});
