import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCameraDirector } from '../src/scene/createCameraDirector.js';
import { groundHeight } from '../src/scene/terrain.js';

const pose = (camera) => [...camera.position.toArray(), ...camera.quaternion.toArray(), camera.fov];

test('camera begins at the original valley framing on desktop and mobile', () => {
  for (const mobile of [false, true]) {
    const camera = new THREE.PerspectiveCamera(48, 1.6, .2, 680);
    const director = createCameraDirector(camera, { mobile, groundHeight });
    assert.deepEqual(camera.position.toArray(), mobile ? [14, 18, 55] : [24, 15, 43]);
    assert.equal(camera.fov, mobile ? 70 : 48);
    const expected = new THREE.PerspectiveCamera();
    expected.position.copy(camera.position);
    expected.lookAt(new THREE.Vector3(...(mobile ? [10, 15, -65] : [-2, 10, -62])));
    assert.ok(camera.quaternion.angleTo(expected.quaternion) < 1e-7);
    director.dispose();
  }
});

test('long drift cycles and view transitions remain finite, bounded, and above terrain', () => {
  for (const mobile of [false, true]) {
    const camera = new THREE.PerspectiveCamera(48, 1.6, .2, 680);
    const director = createCameraDirector(camera, { mobile, groundHeight });
    director.setDrift(true);
    const pointer = { x: 0, y: 0 };
    for (let frame = 0; frame < 24000; frame++) {
      if (frame % 900 === 0) director.setView(frame % 1800 === 0 ? 'stream' : 'valley');
      pointer.x = Math.sin(frame * .019) * 4;
      pointer.y = Math.cos(frame * .023) * 4;
      director.update({ time: frame / 30, dt: 1 / 30, pointer });
      assert.ok(pose(camera).every(Number.isFinite));
      assert.ok(camera.position.y >= groundHeight(camera.position.x, camera.position.z) + 4.6 - 1e-9);
      assert.ok(camera.position.x >= 12 && camera.position.x <= 27);
      assert.ok(camera.position.z >= 23 && camera.position.z <= 56);
      assert.ok(camera.fov >= 48 && camera.fov <= 70);
    }
    director.dispose();
  }
});

test('reduced motion snaps to a stable selected view despite drift, time and pointer changes', () => {
  const camera = new THREE.PerspectiveCamera();
  const director = createCameraDirector(camera, { groundHeight });
  director.setDrift(true);
  for (const view of ['stream', 'valley']) {
    director.setView(view);
    director.update({ time: 10, dt: .01, pointer: { x: 1, y: 1 }, reducedMotion: true });
    const expected = pose(camera);
    for (let i = 0; i < 60; i++) {
      director.update({ time: 100 + i, dt: .1, pointer: { x: -i, y: i }, reducedMotion: true });
      assert.deepEqual(pose(camera), expected);
    }
  }
  assert.deepEqual(camera.position.toArray(), [24, 15, 43]);
  director.dispose();
});

test('turning off drift and returning to valley recovers the original pose without a jump', () => {
  const camera = new THREE.PerspectiveCamera();
  const director = createCameraDirector(camera, { groundHeight });
  const original = pose(camera);
  director.setView('stream');
  director.setDrift(true);
  for (let i = 0; i < 300; i++) director.update({ time: i / 30, dt: 1 / 30, pointer: { x: 1, y: -1 } });
  const before = camera.position.clone();
  director.setView('valley');
  director.setDrift(false);
  director.update({ time: 10, dt: 1 / 60 });
  assert.ok(camera.position.distanceTo(before) < 1);
  for (let i = 0; i < 900; i++) director.update({ time: 10 + i / 30, dt: 1 / 30 });
  pose(camera).forEach((value, i) => assert.ok(Math.abs(value - original[i]) < 1e-6));
  director.dispose();
});

test('camera clears intervening ridges, ignores bad controls and stops after disposal', () => {
  const camera = new THREE.PerspectiveCamera();
  const height = (x, z) => z > 29 && z < 35 ? 24 : groundHeight(x, z);
  const director = createCameraDirector(camera, { groundHeight: height });
  assert.equal(director.setView('unknown'), false);
  assert.equal(director.setView('__proto__'), false);
  director.setView('stream');
  for (let i = 0; i < 300; i++) {
    director.update({ time: i / 30, dt: 1 / 30 });
    assert.ok(camera.position.y >= height(camera.position.x, camera.position.z) + 4.6 - 1e-9);
  }
  director.setDrift(true);
  director.update({ time: NaN, dt: Infinity, pointer: { x: Infinity, y: NaN } });
  assert.ok(pose(camera).every(Number.isFinite));
  const stopped = pose(camera);
  director.dispose();
  director.dispose();
  director.setView('valley');
  director.update({ time: 60, dt: 1, reducedMotion: true });
  assert.deepEqual(pose(camera), stopped);
});

test('responsive framing keeps the selected view and leaves aspect under the renderer control', () => {
  const camera = new THREE.PerspectiveCamera(48, 1.77);
  const director = createCameraDirector(camera, { groundHeight });
  director.setView('stream');
  director.setMobile(true);
  director.update({ reducedMotion: true });
  assert.equal(camera.fov, 70);
  assert.equal(camera.position.y, 10);
  assert.equal(camera.position.z, 24);
  assert.equal(camera.aspect, 1.77);
  director.setView('valley');
  director.update({ reducedMotion: true });
  assert.deepEqual(camera.position.toArray(), [14, 18, 55]);
  director.setMobile(false);
  director.update({ reducedMotion: true });
  assert.deepEqual(camera.position.toArray(), [24, 15, 43]);
  assert.equal(camera.fov, 48);
  director.dispose();
});
