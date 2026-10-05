import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { groundHeight, riverCenter, riverWidth, random } from '../src/scene/terrain.js';
import { createVegetation } from '../src/scene/createVegetation.js';
import { createWeatherDetails } from '../src/scene/createWeatherDetails.js';

test('residual drops originate on actual bank-side boughs and land above terrain', () => {
  const scene = new THREE.Scene();
  const vegetation = createVegetation(scene, { mobile: false, rand: random(1847), groundHeight, riverCenter, riverWidth });
  const weather = createWeatherDetails(scene, { rand: random(715) });
  try {
    const drops = scene.getObjectByName('Residual canopy droplets');
    assert.ok(drops, 'Existing pine canopy supplies drop anchors');
    const origins = drops.geometry.attributes.dripOrigin, paths = drops.geometry.attributes.dripPath;
    const canopy = scene.getObjectByName('Irregular pine boughs 0'), vertices = canopy.geometry.attributes.position;
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), tips = [];
    for (let tree = 0; tree < canopy.count; tree++) {
      canopy.getMatrixAt(tree, matrix);
      for (let i = 0; i < vertices.count; i++) {
        if (vertices.getY(i) >= .025 || Math.hypot(vertices.getX(i), vertices.getZ(i)) <= .8) continue;
        point.fromBufferAttribute(vertices, i).applyMatrix4(matrix); tips.push(point.clone());
      }
    }
    for (let i = 0; i < origins.count; i++) {
      const x = origins.getX(i), y = origins.getY(i), z = origins.getZ(i), fall = paths.getZ(i);
      assert.ok([x, y, z, fall].every(Number.isFinite) && fall > .45);
      assert.ok(tips.some((tip) => (tip.x - x) ** 2 + (tip.y + .015 - y) ** 2 + (tip.z - z) ** 2 < .000001), 'Drop comes from an existing lower bough');
      assert.ok(y - fall > groundHeight(x, z), 'Drop fades before entering the ground');
    }
    weather.update({ time: 42, dripping: .8 }); assert.equal(drops.visible, true);
    assert.equal(drops.material.uniforms.time.value, 42);
    const high = drops.geometry.instanceCount;
    weather.setQuality('light'); assert.ok(drops.geometry.instanceCount < high);
    weather.setQuality('high'); assert.equal(drops.geometry.instanceCount, high);
    weather.update({ dripping: 0 }); assert.equal(drops.visible, false);
    weather.update({ dripping: 1, reducedMotion: true }); assert.equal(drops.visible, false);
    const resources = [drops.geometry, drops.material], count = [0, 0];
    resources.forEach((resource, i) => resource.addEventListener('dispose', () => count[i]++));
    weather.dispose(); weather.dispose(); weather.update({ dripping: 1 }); weather.setQuality('high');
    assert.deepEqual(count, [1, 1]);
    assert.equal(scene.getObjectByName('Residual canopy droplets'), undefined);
    assert.equal(scene.getObjectByName('Pine trunks').isInstancedMesh, true, 'Weather cleanup preserves caller vegetation');
  } finally { weather.dispose(); vegetation.dispose(); }
});

test('mobile or a missing canopy does not invent floating drop sources', () => {
  const scene = new THREE.Scene();
  for (const mobile of [false, true]) {
    const details = createWeatherDetails(scene, { mobile });
    details.update({ dripping: 1 }); details.setQuality('high'); details.dispose(); details.dispose();
    assert.equal(scene.children.length, 0);
  }
});
