import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdaptiveQuality } from '../src/scene/adaptiveQuality.js';

function run(controller, frameMs, duration) {
  const changes = [];
  for (let t = 0; t < duration; t += frameMs) {
    const change = controller.sample(frameMs);
    if (change) changes.push(change);
  }
  return changes;
}

test('starts detailed and ignores brief stalls and warmup', () => {
  const quality = createAdaptiveQuality();
  assert.deepEqual(run(quality, 40, 5000), []);
  run(quality, 40, 2900);
  run(quality, 16.7, 10000);
  assert.equal(quality.level, 'high');
});

test('sustained poor frame rate drops one tier at a time with a cooldown', () => {
  const quality = createAdaptiveQuality();
  assert.deepEqual(run(quality, 40, 11200), ['balanced']);
  assert.deepEqual(run(quality, 40, 11000), []);
  assert.equal(quality.level, 'balanced');
  assert.deepEqual(run(quality, 40, 7500), ['light']);
  assert.deepEqual(run(quality, 40, 30000), []);
});

test('fast frames recover gradually, without exceeding the high tier', () => {
  const quality = createAdaptiveQuality({ initialLevel: 'light' });
  assert.deepEqual(run(quality, 16.7, 23500), ['balanced']);
  assert.deepEqual(run(quality, 16.7, 20000), []);
  assert.deepEqual(run(quality, 16.7, 11000), ['high']);
  assert.deepEqual(run(quality, 16.7, 40000), []);
});

test('a paused or hidden tab clears slow evidence', () => {
  const quality = createAdaptiveQuality();
  run(quality, 40, 8200);
  for (const gap of [10000, NaN, Infinity, 0, -1]) assert.equal(quality.sample(gap), null);
  run(quality, 16.7, 18000);
  assert.equal(quality.level, 'high');
});

test('reset after resize or reduced motion cancels pending downgrade', () => {
  const quality = createAdaptiveQuality();
  run(quality, 40, 8200);
  quality.reset();
  run(quality, 40, 5000);
  assert.equal(quality.level, 'high');
  run(quality, 16.7, 12000);
  assert.equal(quality.level, 'high');
});

test('comfortable intermediate frame rates do not bounce between tiers', () => {
  const quality = createAdaptiveQuality({ initialLevel: 'balanced' });
  assert.deepEqual(run(quality, 23, 90000), []);
  assert.equal(quality.level, 'balanced');
});

test('a persistently overloaded device can downgrade even above 250 ms per frame', () => {
  const quality = createAdaptiveQuality();
  assert.ok(run(quality, 400, 30000).includes('balanced'));
  run(quality, 400, 30000);
  assert.equal(quality.level, 'light');
});

test('automatic quality can resume from a manual tier without stale performance evidence', () => {
  const quality = createAdaptiveQuality();
  run(quality, 40, 8200);
  quality.reset('light');
  assert.equal(quality.level, 'light');
  assert.deepEqual(run(quality, 16.7, 15000), []);
  assert.deepEqual(run(quality, 16.7, 7000), ['balanced']);
  quality.reset('high');
  assert.equal(quality.level, 'high');
});
