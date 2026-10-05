import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceMonitor } from '../src/scene/performanceMonitor.js';

test('reports actual rendered cadence and counters once a second', () => {
  const monitor = createPerformanceMonitor();
  assert.equal(monitor.sample({ now: 0 }), null);
  for (let i = 1; i < 40; i++) assert.equal(monitor.sample({ now: i * 25, renderMs: 5 }), null);
  const result = monitor.sample({ now: 1000, renderMs: 5, calls: 88, triangles: 12345, quality: 'balanced' });
  assert.equal(result.fps, 40);
  assert.equal(result.frameMs, 25);
  assert.equal(result.renderMs, 5);
  assert.equal(result.calls, 88);
  assert.equal(result.triangles, 12345);
  assert.equal(result.quality, 'balanced');
});

test('hidden tab gaps and invalid timestamps cannot produce misleading FPS', () => {
  const monitor = createPerformanceMonitor();
  monitor.sample({ now: 0 }); monitor.sample({ now: 25 });
  assert.equal(monitor.sample({ now: 90000 }), null);
  assert.equal(monitor.sample({ now: NaN }), null);
  monitor.reset();
  assert.equal(monitor.sample({ now: 100000 }), null);
  for (let i = 1; i < 20; i++) assert.equal(monitor.sample({ now: 100000 + i * 50 }), null);
  assert.equal(monitor.sample({ now: 101000 }).fps, 20);
});
