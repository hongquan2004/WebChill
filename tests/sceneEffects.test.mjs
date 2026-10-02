import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { random, groundHeight, riverCenter, riverWidth } from '../src/scene/terrain.js';
import { createVegetation } from '../src/scene/createVegetation.js';
import { createLandscapeDetails } from '../src/scene/createLandscapeDetails.js';
import { createAtmosphere } from '../src/scene/createAtmosphere.js';
import { createRiverEffects } from '../src/scene/createRiverEffects.js';
import { createWildlife } from '../src/scene/createWildlife.js';

function resourcesIn(scene) {
  const resources = new Set();
  scene.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    const materials = [object.material, object.customDepthMaterial, object.customDistanceMaterial].flat().filter(Boolean);
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  return resources;
}

function fixture(t, mobile = false) {
  const scene = new THREE.Scene();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial());
  const mountains = Array.from({ length: 3 }, () => new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial()));
  const callerObjects = [ground, ...mountains];
  scene.add(...callerObjects);
  const callerResources = resourcesIn(scene), rand = random(1847);
  const landscape = createLandscapeDetails(scene, { mobile, rand, ground, mountains });
  const vegetation = createVegetation(scene, { mobile, rand, groundHeight, riverCenter, riverWidth });
  const beforeEffects = [...scene.children];
  const atmosphere = createAtmosphere(scene, { mobile, rand });
  const river = createRiverEffects(scene, { mobile, rand, obstacles: landscape.riverObstacles });
  const wildlife = createWildlife(scene, { mobile, rand });
  const helpers = [landscape, vegetation, atmosphere, river, wildlife];
  const qualityHelpers = [vegetation, atmosphere, river, wildlife];
  const dispose = () => helpers.forEach((helper) => helper.dispose());
  t.after(() => { dispose(); callerResources.forEach((resource) => resource.dispose()); });
  return {
    scene, landscape, beforeEffects, callerObjects, callerResources, dispose,
    object(name) {
      const object = scene.getObjectByName(name);
      assert.ok(object, `Expected scene batch: ${name}`);
      return object;
    },
    quality(level) { qualityHelpers.forEach((helper) => helper.setQuality(level)); },
    update(options = {}) {
      const state = { time: 10, rain: 0, night: 0, dusk: 0, snow: 0, reducedMotion: false, ...options };
      landscape.update(state.rain, state.snow);
      vegetation.update(state.time, state.reducedMotion, state.rain, state.snow);
      [atmosphere, river, wildlife].forEach((helper) => helper.update(state));
    },
  };
}

test('desktop detail quality can decrease and restore without losing the forest', (t) => {
  const f = fixture(t);
  const names = [
    'Foreground needle sprays', 'Exposed pine branches', 'Folded meadow grass',
    'Riverbank reed clumps', 'Feathered bank ferns', 'Soft forest sun shafts',
    'Layered valley haze', 'Rain impact rings', 'Sunlit bank butterflies', 'Slow canopy leaf drift',
  ];
  const counts = () => names.map((name) => {
    const object = f.object(name);
    return object.isInstancedMesh ? object.count : object.geometry.instanceCount;
  });
  const treeCount = f.object('Pine trunks').count;
  f.quality('high'); const high = counts();
  f.quality('balanced'); const balanced = counts();
  f.quality('light'); const light = counts();
  names.forEach((name, index) => {
    assert.ok(light[index] > 0 && light[index] < balanced[index] && balanced[index] < high[index], `${name} reduces progressively`);
  });
  assert.equal(f.object('Pine trunks').count, treeCount);
  f.quality('high');
  assert.deepEqual(counts(), high, 'Returning to high restores each original batch count');
});

test('weather, nighttime and reduced motion control the combined effects', (t) => {
  const f = fixture(t);
  const visible = (name) => f.object(name).visible;
  f.update();
  assert.equal(visible('Soft forest sun shafts'), true);
  assert.equal(visible('Layered valley haze'), true);
  assert.equal(visible('Sunlit bank butterflies'), true);
  assert.equal(visible('Slow canopy leaf drift'), true);
  assert.equal(visible('Rain impact rings'), false);
  f.update({ rain: 1 });
  assert.equal(visible('Soft forest sun shafts'), false);
  assert.equal(visible('Sunlit bank butterflies'), false);
  assert.equal(visible('Rain impact rings'), true);
  f.update({ night: 1 });
  assert.equal(visible('Soft forest sun shafts'), false);
  assert.equal(visible('Sunlit bank butterflies'), false);
  assert.equal(visible('Layered valley haze'), true);
  assert.equal(visible('Rain impact rings'), false);
  f.update({ snow: 1 });
  assert.equal(visible('Sunlit bank butterflies'), false);
  assert.equal(visible('Slow canopy leaf drift'), false);
  assert.equal(visible('Rain impact rings'), false);
  f.update({ rain: 1, reducedMotion: true });
  assert.equal(visible('Rain impact rings'), false);
  assert.equal(visible('Sunlit bank butterflies'), false);
  assert.equal(visible('Slow canopy leaf drift'), false);
  assert.equal(visible('Rock wakes and eddies'), true);
  f.update();
  assert.equal(visible('Sunlit bank butterflies'), true, 'Effects recover after motion and weather restrictions clear');
});

test('rock wakes stay inside the curved river and rain impacts avoid the rock footprints', (t) => {
  const f = fixture(t), obstacles = f.landscape.riverObstacles;
  assert.ok(obstacles.length > 0);
  assert.ok(Object.isFrozen(obstacles) && obstacles.every(Object.isFrozen));
  const rocks = f.object('Midstream rocks'), matrix = new THREE.Matrix4(), center = new THREE.Vector3();
  assert.equal(rocks.count, obstacles.length);
  obstacles.forEach((rock, index) => {
    rocks.getMatrixAt(index, matrix); center.setFromMatrixPosition(matrix);
    assert.ok(Math.abs(center.x - rock.x) < .00001 && Math.abs(center.z - rock.z) < .00001, 'Wake metadata matches rendered rocks');
  });
  const position = f.object('Rock wakes and eddies').geometry.attributes.position;
  assert.ok(position.count > 0);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    assert.ok(Math.abs(x - riverCenter(z)) < riverWidth(z), 'Foam remains inside the banks');
  }
  const impacts = f.object('Rain impact rings').geometry.attributes.impact;
  for (let i = 0; i < impacts.count; i++) {
    const x = impacts.getX(i), z = impacts.getY(i), radius = impacts.getZ(i);
    assert.ok(Number.isFinite(x) && Number.isFinite(z) && radius > 0);
    assert.ok(Math.abs(x - riverCenter(z)) + radius < riverWidth(z), 'Expanded rings fit inside the channel');
    assert.ok(obstacles.every((rock) => ((x - rock.x) / (rock.radiusX + .52)) ** 2
      + ((z - rock.z) / (rock.radiusZ + .52)) ** 2 >= 1), 'Ring centers avoid rock footprints');
  }
});

test('mobile retains the landscape without allocating desktop effect batches', (t) => {
  const f = fixture(t, true);
  assert.deepEqual(f.scene.children, f.beforeEffects);
  assert.equal(f.landscape.riverObstacles.length, 0);
  for (const level of ['light', 'balanced', 'high']) {
    f.quality(level); f.update({ rain: 1 }); f.update({ snow: 1, reducedMotion: true });
  }
  assert.deepEqual(f.scene.children, f.beforeEffects);
});

test('combined helpers release their shared resources once and preserve caller-owned objects', (t) => {
  const f = fixture(t);
  const resources = resourcesIn(f.scene), counts = new Map();
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  }
  f.dispose(); f.dispose();
  assert.deepEqual(f.scene.children, f.callerObjects);
  let ownedCount = 0;
  for (const [resource, count] of counts) {
    if (f.callerResources.has(resource)) assert.equal(count, 0, 'Helpers preserve caller geometry and materials');
    else { assert.equal(count, 1, `Owned ${resource.type} is disposed exactly once`); ownedCount++; }
  }
  assert.ok(ownedCount > 0);
  f.quality('high'); f.update({ rain: 1 });
  assert.deepEqual(f.scene.children, f.callerObjects, 'Calls after disposal cannot restore removed batches');
});
