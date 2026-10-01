import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCycle, dueCycleSteps, MOOD_CYCLE, WEATHER_CYCLE, MOOD_INTERVAL, WEATHER_INTERVAL } from '../src/hooks/useSceneCycle.js';

test('does not advance before a deadline; advances exactly on the deadline', () => {
  assert.equal(dueCycleSteps(119_999, 120_000, MOOD_INTERVAL), 0);
  assert.equal(dueCycleSteps(120_000, 120_000, MOOD_INTERVAL), 1);
});

test('a background tab catches up without restarting the cycle', () => {
  const steps = dueCycleSteps(420_000, 120_000, MOOD_INTERVAL);
  assert.equal(steps, 3);
  assert.equal(advanceCycle('day', MOOD_CYCLE, steps), 'day');
  const nextAt = 120_000 + steps * MOOD_INTERVAL;
  assert.equal(nextAt, 480_000);
  assert.equal(dueCycleSteps(479_999, nextAt, MOOD_INTERVAL), 0);
});

test('moods and weather repeat in their own order', () => {
  assert.equal(advanceCycle('day', MOOD_CYCLE), 'sunset');
  assert.equal(advanceCycle('sunset', MOOD_CYCLE), 'night');
  assert.equal(advanceCycle('night', MOOD_CYCLE), 'day');
  assert.equal(advanceCycle('clear', WEATHER_CYCLE), 'rain');
  assert.equal(advanceCycle('rain', WEATHER_CYCLE), 'snow');
  assert.equal(advanceCycle('snow', WEATHER_CYCLE), 'clear');
});

test('mood and weather intervals remain independent after a long absence', () => {
  const elapsed = 1_200_000;
  const moodSteps = dueCycleSteps(elapsed, MOOD_INTERVAL, MOOD_INTERVAL);
  const weatherSteps = dueCycleSteps(elapsed, WEATHER_INTERVAL, WEATHER_INTERVAL);
  assert.equal(moodSteps, 10);
  assert.equal(weatherSteps, 6);
  assert.equal(advanceCycle('day', MOOD_CYCLE, moodSteps), 'sunset');
  assert.equal(advanceCycle('clear', WEATHER_CYCLE, weatherSteps), 'clear');
});
