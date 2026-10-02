import * as THREE from 'three';
import { groundHeight, riverCenter, riverWidth } from './terrain.js';

// Two small instanced batches: all flutter, flight and leaf fall stay on the GPU.
export function createWildlife(scene, { mobile, rand }) {
  if (mobile) return { update() {}, setQuality() {}, dispose() {} };

  const time = { value: 0 }, butterflyAlpha = { value: 1 }, leafAlpha = { value: 1 };
  const vertices = [], colors = [], indices = [];
  const warm = new THREE.Color('#e8ba65'), cream = new THREE.Color('#f3e8c6');
  let disposed = false;

  function vertex(x, y, z, shade) {
    vertices.push(x, y, z);
    colors.push(shade, shade * .96, shade * .86);
  }
  for (const side of [-1, 1]) {
    for (const rear of [false, true]) {
      const start = vertices.length / 3;
      vertex(side * .025, 0, rear ? .015 : -.025, .78);
      vertex(side * (rear ? .21 : .29), 0, rear ? .17 : -.09, .27);
      vertex(side * (rear ? .18 : .25), 0, rear ? .24 : -.25, .30);
      vertex(side * .08, 0, rear ? .09 : -.20, .90);
      vertex(side * (rear ? .12 : .17), .006, rear ? .13 : -.125, 1.0);
      for (let edge = 0; edge < 4; edge++) indices.push(start + edge, start + (edge + 1) % 4, start + 4);
    }
  }
  // A narrow body remains visible between the two independently folded wings.
  const body = vertices.length / 3;
  vertex(-.014, .009, -.16, .13); vertex(.014, .009, -.16, .13);
  vertex(.011, .009, .14, .16); vertex(-.011, .009, .14, .16);
  indices.push(body, body + 1, body + 2, body, body + 2, body + 3);

  function geometryFromData(positions, vertexColors, faces) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
    geometry.setIndex(faces);
    geometry.computeVertexNormals();
    return geometry;
  }
  const butterfliesGeometry = geometryFromData(vertices, colors, indices);
  const butterflyCount = 18, leafCount = 26;
  const flightOrigins = [], flightSeeds = [], flightColors = [];
  for (let i = 0; i < butterflyCount; i++) {
    const z = 28 - rand() * 83, side = rand() < .5 ? -1 : 1;
    const x = riverCenter(z) + side * (riverWidth(z) + 2.5 + rand() * 4.2);
    // Flight paths clear the whole patch of sloping bank, including the long grass.
    let highestGround = groundHeight(x, z);
    for (let sample = 0; sample < 8; sample++) {
      const angle = sample * Math.PI / 4;
      highestGround = Math.max(highestGround, groundHeight(x + Math.cos(angle) * 2.2, z + Math.sin(angle) * 1.8));
    }
    flightOrigins.push(x, highestGround + 1.25 + rand() * .65, z);
    flightSeeds.push(rand() * Math.PI * 2, .75 + rand() * .5, .75 + rand() * .5);
    const tint = warm.clone().lerp(cream, rand());
    flightColors.push(tint.r, tint.g, tint.b);
  }
  butterfliesGeometry.setAttribute('wildOrigin', new THREE.InstancedBufferAttribute(new Float32Array(flightOrigins), 3));
  butterfliesGeometry.setAttribute('wildSeed', new THREE.InstancedBufferAttribute(new Float32Array(flightSeeds), 3));
  butterfliesGeometry.setAttribute('wildTint', new THREE.InstancedBufferAttribute(new Float32Array(flightColors), 3));
  butterfliesGeometry.instanceCount = butterflyCount;

  const declarations = `
    uniform float wildTime;
    attribute vec3 wildOrigin;
    attribute vec3 wildSeed;
    attribute vec3 wildTint;
    varying vec3 wildColor;
    varying float wildFade;
    #include <fog_pars_vertex>
  `;
  const finishVertex = `
    vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  `;
  const fragmentShader = `
    uniform float wildAlpha;
    varying vec3 wildColor;
    varying float wildFade;
    #include <fog_pars_fragment>
    void main() {
      float alpha = wildAlpha * wildFade;
      if (alpha < .012) discard;
      gl_FragColor = vec4(wildColor, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `;
  function material(vertexShader, alpha) {
    return new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), wildTime: time, wildAlpha: alpha },
      vertexShader, fragmentShader, side: THREE.DoubleSide, vertexColors: true,
      transparent: true, depthWrite: false, fog: true, forceSinglePass: true,
    });
  }
  const butterfliesMaterial = material(declarations + `
    void main() {
      float t = wildTime * wildSeed.y, phase = wildSeed.x;
      float flap = .58 + sin(t * 14.0 + phase) * .55;
      vec3 local = position * wildSeed.z;
      local.y += abs(local.x) * sin(flap);
      local.x *= cos(flap);
      float dx = cos(t * .38 + phase) * .684 + cos(t * .79 + phase) * .237;
      float dz = -sin(t * .32 + phase) * .48;
      float heading = atan(dx, dz);
      mat2 turn = mat2(cos(heading), -sin(heading), sin(heading), cos(heading));
      local.xz = turn * local.xz;
      vec3 world = wildOrigin + local + vec3(
        sin(t * .38 + phase) * 1.8 + sin(t * .79 + phase) * .3,
        sin(t * .87 + phase) * .22 + cos(t * .39 + phase) * .15,
        cos(t * .32 + phase) * 1.5);
      wildColor = color * wildTint;
      wildFade = 1.0;
      ${finishVertex}
    }
  `, butterflyAlpha);
  const butterflies = new THREE.Mesh(butterfliesGeometry, butterfliesMaterial);
  butterflies.name = 'Sunlit bank butterflies';
  butterflies.frustumCulled = false;
  scene.add(butterflies);

  const leafGeometry = geometryFromData(
    [0, 0, -.24, -.085, 0, -.04, -.072, 0, .11, 0, .02, .21, .072, 0, .11, .085, 0, -.04, 0, .024, 0],
    [.43,.46,.30, .66,.68,.39, .82,.77,.45, .64,.61,.35, .72,.75,.43, .56,.62,.32, .90,.83,.49],
    [0,1,6, 1,2,6, 2,3,6, 3,4,6, 4,5,6, 5,0,6],
  );
  const treeAnchors = scene.getObjectByName('Pine trunks')?.geometry.getAttribute('plantAnchor');
  const sourceTrees = [];
  if (treeAnchors) {
    for (let i = 0; i < treeAnchors.count; i++) {
      const x = treeAnchors.getX(i), z = treeAnchors.getZ(i);
      if (z > -75 && z < 38 && Math.abs(x - riverCenter(z)) < riverWidth(z) + 17) {
        sourceTrees.push([x, treeAnchors.getY(i), z, treeAnchors.getW(i)]);
      }
    }
  }
  const leafOrigins = [], leafSeeds = [], leafTints = [], leafPaths = [];
  for (let i = 0; i < leafCount; i++) {
    const tree = sourceTrees.length ? sourceTrees[Math.floor(rand() * sourceTrees.length)] : null;
    const z = tree ? tree[2] : 22 - rand() * 70;
    const x = tree ? tree[0] : riverCenter(z) + (i % 2 ? 1 : -1) * (riverWidth(z) + 7);
    const ground = tree ? tree[1] : groundHeight(x, z);
    const canopyY = ground + (tree ? tree[3] * .62 : 5.5);
    // Check the drift envelope so no falling leaf disappears through a rising bank.
    let landingY = ground;
    for (let sample = 0; sample < 8; sample++) {
      const angle = sample * Math.PI / 4;
      landingY = Math.max(landingY, groundHeight(x + Math.cos(angle) * 1.8, z + Math.sin(angle) * 1.8));
    }
    leafOrigins.push(x, canopyY, z);
    leafSeeds.push(rand() * Math.PI * 2, .8 + rand() * .5, .64 + rand() * .55);
    leafPaths.push(Math.max(.8, canopyY - landingY - .2), 23 + rand() * 16);
    const tint = new THREE.Color().setHSL(.10 + rand() * .08, .22 + rand() * .18, .58 + rand() * .14);
    leafTints.push(tint.r, tint.g, tint.b);
  }
  leafGeometry.setAttribute('wildOrigin', new THREE.InstancedBufferAttribute(new Float32Array(leafOrigins), 3));
  leafGeometry.setAttribute('wildSeed', new THREE.InstancedBufferAttribute(new Float32Array(leafSeeds), 3));
  leafGeometry.setAttribute('wildTint', new THREE.InstancedBufferAttribute(new Float32Array(leafTints), 3));
  leafGeometry.setAttribute('leafPath', new THREE.InstancedBufferAttribute(new Float32Array(leafPaths), 2));
  leafGeometry.instanceCount = leafCount;
  const leafMaterial = material(declarations + `
    attribute vec2 leafPath;
    void main() {
      float phase = wildSeed.x;
      float progress = fract(wildTime / leafPath.y + phase / 6.2831853);
      float tumble = wildTime * .72 * wildSeed.y + phase;
      float angle = wildTime * .31 + phase;
      vec3 local = position * wildSeed.z;
      local.yz = mat2(cos(tumble), -sin(tumble), sin(tumble), cos(tumble)) * local.yz;
      local.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * local.xz;
      vec3 world = wildOrigin + local + vec3(
        sin(progress * 7.4 + phase) * 1.2 + progress * .45,
        -progress * leafPath.x,
        cos(progress * 6.2 + phase) * 1.1);
      wildColor = color * wildTint;
      wildFade = smoothstep(0.0, .09, progress) * (1.0 - smoothstep(.82, 1.0, progress));
      ${finishVertex}
    }
  `, leafAlpha);
  const leaves = new THREE.Mesh(leafGeometry, leafMaterial);
  leaves.name = 'Slow canopy leaf drift';
  leaves.frustumCulled = false;
  scene.add(leaves);

  return {
    update({ time: elapsed = 0, night = 0, dusk = 0, rain = 0, snow = 0, reducedMotion = false }) {
      if (disposed) return;
      time.value = reducedMotion ? 0 : elapsed;
      butterflyAlpha.value = (1 - night) * (1 - dusk * .55) * (1 - rain) * (1 - snow);
      leafAlpha.value = (1 - night * .88) * (1 - rain * .75) * (1 - snow);
      butterflies.visible = !reducedMotion && butterflyAlpha.value > .012;
      leaves.visible = !reducedMotion && leafAlpha.value > .012;
    },
    setQuality(level) {
      if (disposed) return;
      const ratio = level === 'light' ? .38 : level === 'balanced' ? .67 : 1;
      butterfliesGeometry.instanceCount = Math.max(1, Math.floor(butterflyCount * ratio));
      leafGeometry.instanceCount = Math.max(1, Math.floor(leafCount * ratio));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const object of [butterflies, leaves]) {
        object.removeFromParent(); object.geometry.dispose(); object.material.dispose();
      }
    },
  };
}
