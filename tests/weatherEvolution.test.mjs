import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherEvolution } from '../src/scene/weatherEvolution.js';

function advance(weather, seconds, options, dt = .05) {
  for (let i = 0; i < Math.round(seconds / dt); i++) weather.update({ dt, ...options });
  return weather.snapshot();
}

test('snow accumulates gradually and persists after snowfall before melting', () => {
  const weather = createWeatherEvolution();
  const first = weather.update({ dt: .05, snow: 1 });
  assert.ok(first.snowCover > 0 && first.snowCover < .01);
  const snowy = advance(weather, 90, { snow: 1 });
  assert.ok(snowy.snowCover > .8 && snowy.snowCover < 1);
  const stopped = weather.update({ dt: .05, snow: 0 });
  assert.ok(stopped.snowCover > .8, 'Stopping the snow does not erase the accumulated surface');
  const thawed = advance(weather, 120, { snow: 0, night: 0 });
  assert.ok(thawed.snowCover < snowy.snowCover && thawed.snowCover > .1);
  assert.ok(thawed.wetness > .15, 'Melting leaves a wet bank');
});

test('sunlight and rainfall thaw snow faster than a clear night', () => {
  const day = createWeatherEvolution({ snowCover: 1 });
  const night = createWeatherEvolution({ snowCover: 1 });
  const rain = createWeatherEvolution({ snowCover: 1 });
  const byDay = advance(day, 60, { night: 0 });
  const byNight = advance(night, 60, { night: 1 });
  const byRain = advance(rain, 60, { rain: 1, night: 0 });
  assert.ok(byRain.snowCover < byDay.snowCover && byDay.snowCover < byNight.snowCover);
});

test('canopies drip after rain and ground dries more slowly than the leaves', () => {
  const weather = createWeatherEvolution();
  const rainy = advance(weather, 50, { rain: 1 });
  assert.ok(rainy.wetness > .9);
  const afterRain = weather.update({ dt: .05 });
  assert.ok(afterRain.dripping > .9 && afterRain.wetness > .9);
  const later = advance(weather, 90, {});
  assert.ok(later.dripping < .05);
  assert.ok(later.wetness > .4 && later.wetness < afterRain.wetness);
  assert.ok(advance(weather, 900, {}).wetness < .01);
});

test('weather evolution is frame-rate independent and does not replay invalid or paused time', () => {
  const fast = createWeatherEvolution(), slow = createWeatherEvolution();
  advance(fast, 30, { snow: .7, rain: .3 }, .02);
  advance(slow, 30, { snow: .7, rain: .3 }, .1);
  const a = fast.snapshot(), b = slow.snapshot();
  for (const key of ['snowCover', 'wetness', 'dripping']) assert.ok(Math.abs(a[key] - b[key]) < .0001);
  for (const dt of [0, -1, NaN, Infinity]) assert.deepEqual(fast.update({ dt, rain: 1 }), a);
  const resumed = createWeatherEvolution(), oneSecond = createWeatherEvolution();
  assert.deepEqual(resumed.update({ dt: 3600, rain: 1 }), oneSecond.update({ dt: 1, rain: 1 }), 'A resume stall is bounded');
});

test('reduced motion settles instantly and reset removes prior weather', () => {
  const weather = createWeatherEvolution({ snowCover: 1, wetness: 1, canopyWater: 1 });
  assert.deepEqual(weather.update({ rain: .5, snow: .25, reducedMotion: true }), { snowCover: .25, wetness: .5, dripping: 0 });
  assert.deepEqual(weather.reset(), { snowCover: 0, wetness: 0, dripping: 0 });
  assert.deepEqual(weather.reset({ snowCover: 5, wetness: -4, canopyWater: NaN }), { snowCover: 1, wetness: 0, dripping: 0 });
});
