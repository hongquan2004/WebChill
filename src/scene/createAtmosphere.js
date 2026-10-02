import * as THREE from 'three';
import { groundHeight, riverCenter, riverWidth } from './terrain.js';

// Two instanced transparent batches add depth without a full-screen postprocess.
// Both remain depth tested so the opaque terrain and trees interrupt the light.
export function createAtmosphere(scene, { mobile = false, rand = Math.random } = {}) {
  if (mobile) return { update() {}, setQuality() {}, dispose() {} };

  const uniforms = {
    atmosphereTime: { value: 0 },
    shaftStrength: { value: .085 },
    hazeStrength: { value: .075 },
    sunDirection: { value: new THREE.Vector3(-48, 105, -250).normalize() },
    shaftColor: { value: new THREE.Color('#ffe7b6') },
    hazeColor: { value: new THREE.Color('#d1dcd0') },
  };
  const dayLight = new THREE.Color('#ffe7b6'), duskLight = new THREE.Color('#ffc687');
  const dayHaze = new THREE.Color('#d1dcd0'), duskHaze = new THREE.Color('#d9b499');
  const nightHaze = new THREE.Color('#50667c'), wetHaze = new THREE.Color('#b6cbcd');

  function quadGeometry(anchors, sizes) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    geometry.setAttribute('atmosphereAnchor', new THREE.InstancedBufferAttribute(new Float32Array(anchors), 3));
    geometry.setAttribute('atmosphereShape', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 3));
    geometry.instanceCount = anchors.length / 3;
    // Vertex shaders expand the unit quad in world space, so bound that expansion.
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-155, -5, -290), new THREE.Vector3(155, 70, 55));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    return geometry;
  }

  const shaftAnchors = [], shaftSizes = [];
  // Alternate banks, keeping the opening above the stream readable.
  const shaftDepths = [-20, -63, -100, 12, -44, -122, -6, -82, -143];
  shaftDepths.forEach((z, i) => {
    const side = i % 2 ? -1 : 1;
    const x = riverCenter(z) + side * (riverWidth(z) + 2 + rand() * 8);
    shaftAnchors.push(x, Math.max(.4, groundHeight(x, z)) + .4, z);
    shaftSizes.push(1.2 + rand() * 1.9, 48 + rand() * 33, rand() * Math.PI * 2);
  });
  const shaftGeometry = quadGeometry(shaftAnchors, shaftSizes);
  const shaftMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 atmosphereAnchor;
      attribute vec3 atmosphereShape;
      uniform vec3 sunDirection;
      varying vec2 atmosphereUv;
      varying float atmospherePhase;
      varying float atmosphereDistance;
      void main() {
        atmosphereUv = uv;
        atmospherePhase = atmosphereShape.z;
        vec3 axis = normalize(sunDirection);
        vec3 view = normalize(cameraPosition - atmosphereAnchor);
        vec3 across = normalize(cross(axis, view) + vec3(.00001, 0.0, 0.0));
        float width = atmosphereShape.x * mix(1.0, .35, uv.y);
        vec3 world = atmosphereAnchor + axis * uv.y * atmosphereShape.y + across * position.x * width;
        atmosphereDistance = distance(cameraPosition, world);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: `
      uniform float atmosphereTime;
      uniform float shaftStrength;
      uniform vec3 shaftColor;
      varying vec2 atmosphereUv;
      varying float atmospherePhase;
      varying float atmosphereDistance;
      void main() {
        float across = abs(atmosphereUv.x * 2.0 - 1.0);
        float softEdge = pow(max(0.0, 1.0 - across * across), 2.5);
        float ends = smoothstep(0.0, .12, atmosphereUv.y) * (1.0 - smoothstep(.63, 1.0, atmosphereUv.y));
        float bands = .77 + .15 * sin(atmosphereUv.x * 21.0 + atmospherePhase)
          + .08 * sin(atmosphereUv.x * 49.0 + atmospherePhase * 3.0);
        float drift = .92 + .08 * sin(atmosphereTime * .17 + atmospherePhase + atmosphereUv.y * 2.0);
        float distanceFade = smoothstep(7.0, 22.0, atmosphereDistance) * (1.0 - smoothstep(105.0, 240.0, atmosphereDistance));
        float alpha = softEdge * ends * bands * drift * distanceFade * shaftStrength;
        if (alpha < .001) discard;
        gl_FragColor = vec4(shaftColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const shafts = new THREE.Mesh(shaftGeometry, shaftMaterial);
  shafts.name = 'Soft forest sun shafts';
  shafts.renderOrder = 3;
  scene.add(shafts);

  const hazeAnchors = [], hazeSizes = [];
  // Near and distant layers are interleaved, preserving depth at reduced quality.
  const hazeDepths = [-44, -125, -79, -170, -18, -104, -148];
  hazeDepths.forEach((z, i) => {
    hazeAnchors.push(riverCenter(z) + (i % 2 ? -8 : 9), 2.7 + rand() * 2.2, z);
    hazeSizes.push(38 + rand() * 16, 4 + rand() * 3.2, rand() * Math.PI * 2);
  });
  const hazeGeometry = quadGeometry(hazeAnchors, hazeSizes);
  const hazeMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 atmosphereAnchor;
      attribute vec3 atmosphereShape;
      uniform float atmosphereTime;
      varying vec2 atmosphereUv;
      varying float atmospherePhase;
      varying float atmosphereDistance;
      void main() {
        atmosphereUv = uv;
        atmospherePhase = atmosphereShape.z;
        vec3 view = cameraPosition - atmosphereAnchor;
        vec3 across = normalize(vec3(view.z, 0.0, -view.x) + vec3(.00001, 0.0, 0.0));
        float drift = sin(atmosphereTime * .025 + atmospherePhase) * 3.0;
        vec3 world = atmosphereAnchor + across * (position.x * atmosphereShape.x + drift);
        world.y += (uv.y - .5) * atmosphereShape.y;
        atmosphereDistance = distance(cameraPosition, world);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: `
      uniform float atmosphereTime;
      uniform float hazeStrength;
      uniform vec3 hazeColor;
      varying vec2 atmosphereUv;
      varying float atmospherePhase;
      varying float atmosphereDistance;
      float hazeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float hazeNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hazeHash(i), hazeHash(i + vec2(1.0, 0.0)), f.x),
          mix(hazeHash(i + vec2(0.0, 1.0)), hazeHash(i + vec2(1.0)), f.x), f.y);
      }
      void main() {
        vec2 centered = atmosphereUv * 2.0 - 1.0;
        float border = pow(max(0.0, 1.0 - centered.x * centered.x), 1.5)
          * exp(-centered.y * centered.y * 7.0);
        vec2 p = atmosphereUv * vec2(6.0, 2.5) + vec2(atmosphereTime * .012, atmospherePhase);
        float wisps = hazeNoise(p) * .65 + hazeNoise(p * 2.1 + 3.7) * .35;
        float distanceFade = smoothstep(24.0, 65.0, atmosphereDistance) * (1.0 - smoothstep(155.0, 255.0, atmosphereDistance));
        float alpha = border * (.3 + wisps * .7) * distanceFade * hazeStrength;
        if (alpha < .001) discard;
        gl_FragColor = vec4(hazeColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const haze = new THREE.Mesh(hazeGeometry, hazeMaterial);
  haze.name = 'Layered valley haze';
  haze.renderOrder = 2;
  scene.add(haze);

  let disposed = false;
  let quality = 'high';
  const clamp = (value) => THREE.MathUtils.clamp(value, 0, 1);
  return {
    update({ time = 0, night = 0, dusk = 0, rain = 0, snow = 0, reducedMotion = false, sunDirection } = {}) {
      if (disposed) return;
      if (!reducedMotion) uniforms.atmosphereTime.value = time;
      const darkness = clamp(night), goldenHour = clamp(dusk), wet = clamp(rain), frost = clamp(snow);
      if (sunDirection?.lengthSq() > .0001) uniforms.sunDirection.value.copy(sunDirection).normalize();
      uniforms.shaftColor.value.copy(dayLight).lerp(duskLight, goldenHour);
      uniforms.shaftStrength.value = (.085 + goldenHour * .045) * (1 - darkness) * (1 - wet) * (1 - frost * .94);
      uniforms.hazeColor.value.copy(dayHaze).lerp(duskHaze, goldenHour).lerp(nightHaze, darkness).lerp(wetHaze, wet * .3 + frost * .35);
      uniforms.hazeStrength.value = (.075 + goldenHour * .035) * (1 - darkness * .76) * (1 - wet * .45) * (1 - frost * .38);
      shafts.visible = uniforms.shaftStrength.value > .001;
      haze.visible = uniforms.hazeStrength.value > .001;
    },
    setQuality(level) {
      if (disposed || !['high', 'balanced', 'light'].includes(level) || quality === level) return;
      quality = level;
      shaftGeometry.instanceCount = level === 'high' ? 9 : level === 'balanced' ? 6 : 3;
      hazeGeometry.instanceCount = level === 'high' ? 7 : level === 'balanced' ? 4 : 2;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      shafts.removeFromParent(); haze.removeFromParent();
      shaftGeometry.dispose(); hazeGeometry.dispose();
      shaftMaterial.dispose(); hazeMaterial.dispose();
    },
  };
}
