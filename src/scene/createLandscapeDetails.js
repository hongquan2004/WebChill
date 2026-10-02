import * as THREE from 'three';
import { groundHeight, noise, riverCenter, riverWidth } from './terrain.js';

// Surface detail stays local: two instanced stone batches and small reusable bump maps.
export function createLandscapeDetails(scene, { mobile, rand, ground, mountains }) {
  const textures = [], objects = [];
  const uniforms = { detailRain: { value: 0 }, detailSnow: { value: 0 } };
  const bumpSize = 128, bumpData = new Uint8Array(bumpSize * bumpSize * 4);
  for (let y = 0; y < bumpSize; y++) for (let x = 0; x < bumpSize; x++) {
    const u = x / bumpSize * Math.PI * 2, v = y / bumpSize * Math.PI * 2;
    const relief = 128 + Math.sin(u * 3 + Math.cos(v * 5)) * 27
      + Math.sin(v * 13 + Math.sin(u * 17)) * 17 + Math.cos(u * 31 + v * 23) * 8;
    const i = (y * bumpSize + x) * 4;
    bumpData[i] = bumpData[i + 1] = bumpData[i + 2] = relief; bumpData[i + 3] = 255;
  }
  function bumpTexture(x, y) {
    const texture = new THREE.DataTexture(bumpData, bumpSize, bumpSize);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.anisotropy = mobile ? 1 : 4; texture.repeat.set(x, y); texture.needsUpdate = true;
    textures.push(texture); return texture;
  }
  const detailFunctions = `
    varying vec3 detailWorld;
    uniform float detailRain; uniform float detailSnow;
    float detailHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float detailNoise(vec2 p) {
      vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(detailHash(cell), detailHash(cell + vec2(1.,0.)), f.x),
        mix(detailHash(cell + vec2(0.,1.)), detailHash(cell + vec2(1.,1.)), f.x), f.y);
    }
  `;
  function decorate(material, kind) {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'varying vec3 detailWorld;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec4 detailPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          detailPosition = instanceMatrix * detailPosition;
        #endif
        detailWorld = (modelMatrix * detailPosition).xyz;
      `);
      shader.fragmentShader = detailFunctions + shader.fragmentShader;
      const shared = `
        float detailMacro = detailNoise(detailWorld.xz * .42);
        float detailGrain = ${mobile ? '.5' : 'detailNoise(detailWorld.xz * 7.3 + detailWorld.y * .8)'};
        float detailFootprint = length(fwidth(detailWorld.xz));
        detailGrain = mix(detailGrain, .5, smoothstep(.15, .7, detailFootprint));
        float detailUp = abs(normalize(cross(dFdx(detailWorld), dFdy(detailWorld))).y);
        float detailWet = max(detailRain * .7, (1.0 - smoothstep(.02, .72, detailWorld.y)) * .56);
        diffuseColor.rgb *= .88 + detailMacro * .18 + (detailGrain - .5) * .13;
      `;
      const surface = kind === 'stone' ? `
        float detailMoss = smoothstep(.32, .78, detailUp) * smoothstep(.34, .75, detailMacro) * .64;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.105,.19,.078), detailMoss);
        float detailSeam = smoothstep(.88, .98, sin(detailWorld.y * 7.0 + detailMacro * 5.0) * .5 + .5);
        diffuseColor.rgb *= 1.0 - detailSeam * .16;
      ` : `
        float detailStrata = .91 + .09 * sin(detailWorld.y * .62 + detailNoise(detailWorld.xz * .065) * 4.0);
        float detailExposed = (1.0 - smoothstep(.32, .76, detailUp)) * ${kind === 'mountain' ? '.48' : '.26'};
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.24,.26,.23) * detailStrata, detailExposed);
        diffuseColor.rgb *= detailStrata;
      `;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        ${shared}
        ${surface}
        diffuseColor.rgb *= 1.0 - detailWet * .18;
        float detailFrost = detailSnow * smoothstep(.5, .88, detailUp) * (.48 + detailMacro * .23);
        detailFrost *= smoothstep(.06, .6, detailWorld.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.73,.82,.84), detailFrost);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = max(.42, roughnessFactor - detailWet * .3);
      `);
    };
    material.customProgramCacheKey = () => 'landscape-detail-' + kind + '-v1';
  }
  ground.material.bumpMap = bumpTexture(62, 74); ground.material.bumpScale = .105; decorate(ground.material, 'ground');
  const mountainBump = mobile ? null : bumpTexture(35, 9);
  mountains.forEach((mountain) => {
    mountain.material.bumpMap = mountainBump; mountain.material.bumpScale = .28;
    mountain.material.flatShading = false; decorate(mountain.material, 'mountain');
  });

  const stoneGeometry = new THREE.IcosahedronGeometry(1, mobile ? 1 : 2);
  const positions = stoneGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const n = noise(x * 3.1 + z * .7, y * 3.1 + z * 1.4);
    const warp = .79 + n * .31;
    positions.setXYZ(i, x * warp + y * .085, y * warp, z * warp - x * .045);
  }
  stoneGeometry.computeVertexNormals();
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .94, bumpMap: bumpTexture(1.7, 1.7), bumpScale: .075 });
  decorate(stoneMaterial, 'stone');
  const stoneCount = mobile ? 155 : 235;
  const stones = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, stoneCount);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  for (let i = 0; i < stoneCount; i++) {
    const z = 67 - rand() * 221, side = rand() > .5 ? 1 : -1;
    const x = riverCenter(z) + side * (riverWidth(z) + rand() * 2.9 - .55);
    const scale = .3 + Math.pow(rand(), 1.5) * 1.8;
    dummy.position.set(x, groundHeight(x, z) + scale * .20, z);
    dummy.rotation.set((rand() - .5) * .55, rand() * Math.PI * 2, (rand() - .5) * .35);
    dummy.scale.set(scale * (1.2 + rand() * .7), scale * (.58 + rand() * .3), scale);
    dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
    stones.setColorAt(i, color.setHSL(.12 + rand() * .05, .045 + rand() * .06, .31 + rand() * .20));
  }
  stones.castShadow = !mobile; stones.receiveShadow = true; objects.push(stones); scene.add(stones);

  const pebbleCount = mobile ? 300 : 720;
  const pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), stoneMaterial, pebbleCount);
  for (let i = 0; i < pebbleCount; i++) {
    const z = 57 - rand() * 125, side = rand() > .5 ? 1 : -1;
    const spread = Math.pow(rand(), 1.8) * 3.5;
    const x = riverCenter(z) + side * (riverWidth(z) + .05 + spread);
    const scale = .06 + rand() * .18;
    dummy.position.set(x, groundHeight(x, z) + scale * .24, z); dummy.rotation.set(rand(), rand() * Math.PI * 2, rand());
    dummy.scale.set(scale * 1.4, scale * .65, scale); dummy.updateMatrix(); pebbles.setMatrixAt(i, dummy.matrix);
    pebbles.setColorAt(i, color.setHSL(.1 + rand() * .06, .07, .30 + rand() * .23));
  }
  pebbles.receiveShadow = true; objects.push(pebbles); scene.add(pebbles);

  // The water effects use these exact footprints, so every wake starts at a visible rock.
  const riverObstacles = [];
  if (!mobile) {
    const placements = [[-92, -.28], [-73, .34], [-55, -.30], [-35, .27], [-17, -.36], [1, .29], [18, -.27]];
    const riverRocks = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, placements.length);
    riverRocks.name = 'Midstream rocks';
    placements.forEach(([z, lateral], i) => {
      const offset = riverWidth(z) * lateral;
      const x = riverCenter(z) + offset;
      const radiusX = .62 + rand() * .29, radiusZ = .66 + rand() * .31;
      dummy.position.set(x, -.025, z); dummy.rotation.set(.05, 0, -.08);
      dummy.scale.set(radiusX, .62 + rand() * .32, radiusZ); dummy.updateMatrix();
      riverRocks.setMatrixAt(i, dummy.matrix);
      riverRocks.setColorAt(i, color.setHSL(.13, .065, .29 + rand() * .10));
      riverObstacles.push(Object.freeze({ x, z, offset, radiusX, radiusZ }));
    });
    riverRocks.castShadow = true; riverRocks.receiveShadow = true;
    objects.push(riverRocks); scene.add(riverRocks);
  }
  Object.freeze(riverObstacles);
  let disposed = false;
  return {
    riverObstacles,
    update(rain, snow) {
      if (disposed) return;
      uniforms.detailRain.value = rain; uniforms.detailSnow.value = snow;
    },
    dispose() {
      if (disposed) return; disposed = true;
      const geometries = new Set();
      objects.forEach((object) => { scene.remove(object); object.dispose(); geometries.add(object.geometry); });
      geometries.forEach((geometry) => geometry.dispose());
      stoneMaterial.dispose(); textures.forEach((texture) => texture.dispose());
    },
  };
}
