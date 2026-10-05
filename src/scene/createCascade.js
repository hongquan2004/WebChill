import * as THREE from 'three';
import { groundHeight, riverCenter, riverWidth } from './terrain.js';

// A tributary descends a small rock outcrop on the left bank. The main river's
// elevation remains unchanged; the cascade ends just above its existing surface.
export function createCascade(scene, { mobile = false, rand = Math.random } = {}) {
  if (mobile) return { update() {}, setQuality() {}, dispose() {} };
  const objects = [], geometries = new Set(), materials = new Set();
  let disposed = false;
  const atBank = (z, distance) => riverCenter(z) - riverWidth(z) - distance;
  const distances = [7.4, 5, 3.1, 1.3, -.25];
  const heights = [4.45, 3.85, 3.28, 2.88, 2.55];
  const path = distances.map((distance, i) => {
    const z = -26 - distance * .19, x = atBank(z, distance);
    return new THREE.Vector3(x, Math.max(heights[i], groundHeight(x, z) + .15), z);
  });
  const lip = path[path.length - 1], foot = lip.clone().add(new THREE.Vector3(1.3, 0, .35));
  foot.y = .14;
  const matrix = new THREE.Object3D(), tint = new THREE.Color();
  function add(object, name) {
    object.name = name; objects.push(object); scene.add(object);
    geometries.add(object.geometry); materials.add(object.material);
    return object;
  }
  function geometry(positions, indices, uv, colors) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices); geo.computeVertexNormals();
    return geo;
  }
  function samplePath(t) {
    const segment = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
    return new THREE.Vector3().lerpVectors(path[segment], path[segment + 1], t * (path.length - 1) - segment);
  }

  // The raised water has a complete, ground-embedded bed beneath it, including
  // the face below the lip. Its shallow trough is flanked by uneven mossy rims.
  const bedPositions = [], bedColors = [], bedIndices = [];
  const rows = 24, columns = 5;
  for (let row = 0; row <= rows; row++) {
    const center = samplePath(row / rows), width = 1.08 + Math.sin(row * .83) * .12;
    for (let column = 0; column < columns; column++) {
      const across = column / (columns - 1) * 2 - 1;
      const z = center.z + across * width;
      bedPositions.push(center.x, center.y - .11 + Math.pow(Math.abs(across), 3) * .26, z);
      const shade = .66 + Math.abs(across) * .19 + rand() * .12;
      bedColors.push(shade * .92, shade, shade * .91);
      if (row < rows && column < columns - 1) {
        const a = row * columns + column;
        bedIndices.push(a, a + 1, a + columns, a + 1, a + columns + 1, a + columns);
      }
    }
  }
  function skirt(topA, topB) {
    const a = bedPositions.length / 3;
    for (const top of [topA, topB]) {
      const x = bedPositions[top * 3], y = bedPositions[top * 3 + 1], z = bedPositions[top * 3 + 2];
      bedPositions.push(x, y, z, x - .07, groundHeight(x - .07, z) - .18, z);
      bedColors.push(.70, .74, .66, .46, .51, .47);
    }
    bedIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (let row = 0; row < rows; row++) {
    skirt(row * columns, (row + 1) * columns);
    skirt((row + 1) * columns + columns - 1, row * columns + columns - 1);
  }
  for (let column = 0; column < columns - 1; column++) {
    skirt(rows * columns + column, rows * columns + column + 1);
    skirt(column + 1, column);
  }
  const snowCover = { value: 0 };
  const rockMaterial = new THREE.MeshStandardMaterial({ color: '#748579', roughness: .83, vertexColors: true, side: THREE.DoubleSide });
  rockMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.cascadeSnow = snowCover;
    shader.vertexShader = 'varying float cascadeUp;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ncascadeUp = max(0.0, normal.y);');
    shader.fragmentShader = 'uniform float cascadeSnow; varying float cascadeUp;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(.73, .81, .80), cascadeSnow * smoothstep(.45, .9, cascadeUp) * .65);');
  };
  rockMaterial.customProgramCacheKey = () => 'tributary-rock-snow-v1';
  const bed = add(new THREE.Mesh(geometry(bedPositions, bedIndices, null, bedColors), rockMaterial), 'Cascade rock shelf');
  bed.receiveShadow = bed.castShadow = true;

  const stoneGeometry = new THREE.IcosahedronGeometry(1, 1), stoneColors = [];
  const stoneVertices = stoneGeometry.getAttribute('position');
  for (let i = 0; i < stoneVertices.count; i++) {
    const shade = .6 + stoneVertices.getY(i) * .14 + rand() * .17;
    stoneColors.push(shade * .94, shade, shade * .91);
  }
  stoneGeometry.setAttribute('color', new THREE.Float32BufferAttribute(stoneColors, 3));
  const stones = add(new THREE.InstancedMesh(stoneGeometry, rockMaterial, 18), 'Cascade bank stones');
  for (let i = 0; i < stones.count; i++) {
    const center = samplePath((i + .5) / stones.count), side = i % 2 ? 1 : -1;
    const x = center.x + (rand() - .5) * .55, z = center.z + side * (1.05 + rand() * .43);
    const base = groundHeight(x, z), radius = .35 + rand() * .28;
    // Every boulder is embedded in the bank, not suspended beside the water.
    const height = Math.max(radius, (center.y - base) * .48);
    matrix.position.set(x, base + height * .62, z);
    matrix.rotation.set((rand() - .5) * .3, rand() * Math.PI, (rand() - .5) * .2);
    matrix.scale.set(radius * 1.6, height, radius); matrix.updateMatrix();
    stones.setMatrixAt(i, matrix.matrix);
    stones.setColorAt(i, tint.setHSL(.24 + rand() * .08, .12 + rand() * .1, .50 + rand() * .11));
  }
  stones.receiveShadow = stones.castShadow = true;

  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    time: { value: 0 }, flow: { value: 1 },
    waterTint: { value: new THREE.Color('#609588') }, foamTint: { value: new THREE.Color('#d5eadd') },
  };
  const waterVertex = `
    varying vec2 waterUv;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      waterUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `;
  const waterFragment = `
    uniform float time; uniform float flow; uniform vec3 waterTint; uniform vec3 foamTint;
    varying vec2 waterUv;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      float across = waterUv.x, downstream = waterUv.y - time * 2.6 * flow;
      float filaments = pow(.5 + .5 * sin(across * 39.0 + sin(downstream * 2.3) * 1.3), 6.0);
      float broken = .48 + .52 * sin(downstream * 8.0 + across * 9.0);
      float crest = pow(max(0.0, sin(downstream * 12.0 + sin(across * 8.0))), 12.0);
      float bubbles = filaments * (.30 + broken * .33) + crest * .19;
      float edge = 1.0 - smoothstep(.65, 1.0, abs(across));
      float alpha = edge * (.43 + bubbles * .42);
      if (alpha < .008) discard;
      gl_FragColor = vec4(mix(waterTint, foamTint, bubbles), alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `;
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: waterVertex, fragmentShader: waterFragment,
    side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthWrite: false, fog: true,
  });
  function ribbon(name, centerAt, widthAt, segments, flowLength) {
    const positions = [], uv = [], indices = [], cross = 4;
    for (let j = 0; j <= segments; j++) {
      const t = j / segments, center = centerAt(t), width = widthAt(t);
      for (let i = 0; i <= cross; i++) {
        const across = i / cross * 2 - 1;
        positions.push(center.x, center.y + Math.sin(across * 2.8) * .014, center.z + across * width);
        uv.push(across, t * flowLength);
        if (i < cross && j < segments) {
          const a = j * (cross + 1) + i;
          indices.push(a, a + 1, a + cross + 1, a + 1, a + cross + 2, a + cross + 1);
        }
      }
    }
    const mesh = add(new THREE.Mesh(geometry(positions, indices, uv), waterMaterial), name);
    mesh.renderOrder = 2;
    return mesh;
  }
  ribbon('Tributary shallow runnel', samplePath, (t) => .47 + t * .10, 36, 6.8);
  const curtain = ribbon('Small falling cascade', (t) => new THREE.Vector3(
    lip.x + (foot.x - lip.x) * t,
    lip.y - (lip.y - foot.y) * t * t,
    lip.z + (foot.z - lip.z) * t), (t) => .57 + t * .13, 28, 3.2);
  curtain.userData.lip = lip.toArray(); curtain.userData.foot = foot.toArray();

  const foamGeometry = new THREE.PlaneGeometry(2.2, 3.5);
  foamGeometry.rotateX(-Math.PI / 2); foamGeometry.translate(foot.x + .12, .16, foot.z + .55);
  const foamMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: waterVertex, transparent: true, depthWrite: false, fog: true,
    fragmentShader: `
      uniform float time; uniform float flow; uniform vec3 foamTint;
      varying vec2 waterUv;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 p = waterUv * 2.0 - 1.0;
        float r = length(p);
        float distortion = sin(p.x * 19.0 + time * 2.0) * sin(p.y * 16.0 - time * 3.8) * .08;
        float turbulent = pow(.5 + .5 * sin((r + distortion) * 24.0 - time * 6.0 * flow), 3.0);
        float broken = .55 + .45 * sin(p.y * 28.0 - p.x * 21.0 + time * 5.0);
        float alpha = (1.0 - smoothstep(.12, .97, r)) * (.09 + turbulent * broken * .51);
        if (alpha < .009) discard;
        gl_FragColor = vec4(foamTint, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const foam = add(new THREE.Mesh(foamGeometry, foamMaterial), 'Cascade foot foam'); foam.renderOrder = 3;

  const puffCount = 24, puffSeeds = [];
  for (let i = 0; i < puffCount; i++) puffSeeds.push(rand(), rand() * 2 - 1, .6 + rand() * .8);
  const mistGeometry = new THREE.InstancedBufferGeometry();
  mistGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0], 3));
  mistGeometry.setIndex([0,1,2,0,2,3]);
  mistGeometry.setAttribute('puffSeed', new THREE.InstancedBufferAttribute(new Float32Array(puffSeeds), 3));
  mistGeometry.instanceCount = puffCount;
  const mistMaterial = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, impact: { value: foot.clone() } },
    transparent: true, depthWrite: false, fog: true,
    vertexShader: `
      attribute vec3 puffSeed;
      uniform float time; uniform vec3 impact;
      varying vec2 puffUv; varying float puffFade;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        float age = fract(time * .36 * puffSeed.z + puffSeed.x);
        vec3 world = impact + vec3(.12 + age * .55, .14 + age * .92, puffSeed.y * (.24 + age * .65));
        vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
        mvPosition.xy += position.xy * (.28 + age * .8);
        puffUv = position.xy * 2.0;
        puffFade = sin(age * 3.14159265) * .038;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform vec3 foamTint;
      varying vec2 puffUv; varying float puffFade;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float alpha = exp(-dot(puffUv, puffUv) * 3.8) * puffFade;
        if (alpha < .003) discard;
        gl_FragColor = vec4(foamTint, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const mist = add(new THREE.Mesh(mistGeometry, mistMaterial), 'Cascade drifting spray');
  mist.frustumCulled = false; mist.renderOrder = 4;
  const dayWater = new THREE.Color('#609588'), nightWater = new THREE.Color('#263f48');
  const dayFoam = new THREE.Color('#d5eadd'), duskFoam = new THREE.Color('#d9cbb2'), nightFoam = new THREE.Color('#627f89');
  let quality = 'high', motionReduced = false;
  return {
    update({ time = 0, rain = 0, night = 0, dusk = 0, snowCover: cover = 0, reducedMotion = false } = {}) {
      if (disposed) return;
      motionReduced = reducedMotion;
      uniforms.time.value = reducedMotion ? 0 : time;
      uniforms.flow.value = 1 + rain * .25 - cover * .15;
      uniforms.waterTint.value.copy(dayWater).lerp(nightWater, night);
      uniforms.foamTint.value.copy(dayFoam).lerp(duskFoam, dusk).lerp(nightFoam, night);
      snowCover.value = THREE.MathUtils.clamp(cover, 0, 1);
      mist.visible = !reducedMotion && quality !== 'light';
    },
    setQuality(level) {
      if (disposed) return;
      quality = level;
      mistGeometry.instanceCount = level === 'balanced' ? 14 : puffCount;
      mist.visible = !motionReduced && level !== 'light';
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      objects.forEach((object) => { object.removeFromParent(); if (object.isInstancedMesh) object.dispose(); });
      geometries.forEach((value) => value.dispose()); materials.forEach((value) => value.dispose());
    },
  };
}
