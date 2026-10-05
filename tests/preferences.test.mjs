import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences } from '../src/preferences.js';

test('older saved preferences keep their settings and gain safe scene defaults', () => {
  const value = normalizePreferences({ mood: 'night', weather: 'rain', autoMood: true, volume: 72, minutes: 45 });
  assert.equal(value.mood, 'night');
  assert.equal(value.weather, 'rain');
  assert.equal(value.volume, 72);
  assert.equal(value.minutes, 45);
  assert.equal(value.autoMood, true);
  assert.equal(value.view, 'valley');
  assert.equal(value.quality, 'auto');
  assert.equal(value.drift, true);
});

test('view, motion and manual quality survive a saved JSON round trip', () => {
  const selected = { view: 'stream', drift: false, quality: 'balanced', weather: 'snow' };
  const saved = normalizePreferences(selected);
  assert.deepEqual(normalizePreferences(JSON.parse(JSON.stringify(saved))), saved);
  for (const [key, value] of Object.entries(selected)) assert.equal(saved[key], value);
});

test('malformed storage values cannot select invalid camera or graphics settings', () => {
  const defaults = normalizePreferences();
  for (const value of [null, [], 7, 'invalid']) assert.deepEqual(normalizePreferences(value), defaults);
  const value = normalizePreferences({ view: '../../invalid', quality: 'ultra', drift: 'false', volume: 900, minutes: -4 });
  assert.equal(value.view, 'valley');
  assert.equal(value.quality, 'auto');
  assert.equal(value.drift, true);
  assert.equal(value.volume, 100);
  assert.equal(value.minutes, 25);
});
