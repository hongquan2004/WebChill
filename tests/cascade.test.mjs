import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { groundHeight, riverCenter, riverWidth, random } from '../src/scene/terrain.js';
import { createCascade } from '../src/scene/createCascade.js';
import { createCameraDirector } from '../src/scene/createCameraDirector.js';

test('side cascade has finite geometry, a supported bank runnel and a foot inside the river', () => {
  const scene = new THREE.Scene(), cascade = createCascade(scene, { rand: random(412) });
  try {
    for (const object of scene.children) {
      for (const attribute of Object.values(object.geometry.attributes)) {
        assert.ok(Array.from(attribute.array).every(Number.isFinite), `${object.name} has finite geometry`);
      }
      assert.notEqual(object.material.depthTest, false, 'Terrain can occlude every effect');
    }
    const runnel = scene.getObjectByName('Tributary shallow runnel').geometry.attributes.position;
    for (let i = 0; i < runnel.count; i++) {
      assert.ok(runnel.getY(i) > groundHeight(runnel.getX(i), runnel.getZ(i)), 'Tributary water clears the terrain');
    }
    const curtain = scene.getObjectByName('Small falling cascade');
    const [x, y, z] = curtain.userData.foot;
    assert.ok(y >= .02 && y < .2, 'Waterfall lands at the main river elevation');
    assert.ok(curtain.userData.lip[1] - y > 2 && curtain.userData.lip[1] - y < 3);
    assert.ok(Math.abs(x - riverCenter(z)) + 1 < riverWidth(z), 'Waterfall foot is inside the channel');
    const foam = scene.getObjectByName('Cascade foot foam').geometry.attributes.position;
    for (let i = 0; i < foam.count; i++) {
      assert.ok(Math.abs(foam.getX(i) - riverCenter(foam.getZ(i))) < riverWidth(foam.getZ(i)), 'Impact foam stays on the river');
    }
    const shelf = scene.getObjectByName('Cascade rock shelf').geometry.attributes.position;
    let embedded = 0;
    for (let i = 0; i < shelf.count; i++) if (shelf.getY(i) < groundHeight(shelf.getX(i), shelf.getZ(i))) embedded++;
    assert.ok(embedded > 50, 'Solid shelf skirts join the existing bank');
  } finally { cascade.dispose(); }
});

test('cascade lip and foot fit both desktop viewpoints', () => {
  const scene = new THREE.Scene(), cascade = createCascade(scene, { rand: random(412) });
  try {
    const curtain = scene.getObjectByName('Small falling cascade');
    for (const view of ['valley', 'stream']) {
      const camera = new THREE.PerspectiveCamera(48, 16 / 9, .2, 680);
      const director = createCameraDirector(camera);
      director.setView(view); director.update({ reducedMotion: true }); camera.updateMatrixWorld();
      for (const point of [curtain.userData.lip, curtain.userData.foot]) {
        const projected = new THREE.Vector3(...point).project(camera);
        assert.ok(Math.abs(projected.x) < .85 && Math.abs(projected.y) < .85 && projected.z > -1 && projected.z < 1, `${view} contains waterfall`);
      }
      director.dispose();
    }
  } finally { cascade.dispose(); }
});

test('quality and reduced motion disable spray without removing the cascade', () => {
  const scene = new THREE.Scene(), cascade = createCascade(scene, { rand: random(412) });
  try {
    const mist = scene.getObjectByName('Cascade drifting spray');
    cascade.update({ time: 12 });
    assert.equal(mist.visible, true);
    const high = mist.geometry.instanceCount;
    cascade.setQuality('balanced'); assert.ok(mist.geometry.instanceCount < high);
    cascade.setQuality('light'); assert.equal(mist.visible, false);
    cascade.setQuality('high'); assert.equal(mist.geometry.instanceCount, high);
    cascade.update({ reducedMotion: true }); cascade.setQuality('balanced');
    assert.equal(mist.visible, false, 'Changing quality cannot bypass reduced motion');
    assert.equal(scene.getObjectByName('Small falling cascade').visible, true);
    cascade.update({ time: 15, night: 1, snowCover: 1 }); assert.equal(mist.visible, true);
    assert.equal(mist.material.uniforms.time.value, 15);
  } finally { cascade.dispose(); }
});

test('cascade releases shared resources once and mobile allocates no desktop batches', () => {
  const scene = new THREE.Scene(), caller = new THREE.Object3D(); scene.add(caller);
  const cascade = createCascade(scene, { rand: random(412) });
  const resources = new Set(scene.children.flatMap((o) => [o.geometry, o.material]).filter(Boolean));
  const counts = new Map();
  for (const value of resources) { counts.set(value, 0); value.addEventListener('dispose', () => counts.set(value, counts.get(value) + 1)); }
  cascade.dispose(); cascade.dispose(); cascade.update({ rain: 1 }); cascade.setQuality('high');
  assert.deepEqual(scene.children, [caller]);
  assert.ok([...counts.values()].every((count) => count === 1));
  const mobile = createCascade(scene, { mobile: true });
  mobile.update({ rain: 1 }); mobile.setQuality('high'); mobile.dispose(); mobile.dispose();
  assert.deepEqual(scene.children, [caller]);
});
