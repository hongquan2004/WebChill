import * as THREE from 'three';
import { groundHeight, riverCenter, riverWidth } from './terrain.js';

// A few drops release from actual lower pine boughs, rather than another rain layer.
export function createWeatherDetails(scene, { mobile = false, rand = Math.random } = {}) {
  const empty = { update() {}, setQuality() {}, dispose() {} };
  if (mobile) return empty;
  const canopy = scene.getObjectByName('Irregular pine boughs 0');
  const anchors = canopy?.geometry.getAttribute('plantAnchor');
  if (!canopy?.isInstancedMesh || !anchors) return empty;
  const sources = [], matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  const vertices = canopy.geometry.getAttribute('position');
  // The first ring contains the downward-facing tips of the lowest branches.
  const tips = [];
  for (let i = 0; i < vertices.count; i++) {
    if (vertices.getY(i) < .025 && Math.hypot(vertices.getX(i), vertices.getZ(i)) > .8) tips.push(i);
  }
  for (let i = 0; i < anchors.count && tips.length; i++) {
    const x = anchors.getX(i), z = anchors.getZ(i);
    const bankDistance = Math.abs(x - riverCenter(z)) - riverWidth(z);
    if (z < -65 || z > 30 || bankDistance < 3 || bankDistance > 15) continue;
    canopy.getMatrixAt(i, matrix);
    const tip = tips[Math.floor(rand() * tips.length)];
    point.fromBufferAttribute(vertices, tip).applyMatrix4(matrix);
    const landing = Math.max(.04, groundHeight(point.x, point.z),
      groundHeight(point.x + .1, point.z + .06)) + .05;
    if (point.y - landing > .45) sources.push([point.x, point.y + .015, point.z, point.y - landing]);
  }
  if (!sources.length) return empty;

  const count = Math.min(64, sources.length * 2), origins = [], paths = [];
  for (let i = 0; i < count; i++) {
    const source = sources[Math.floor(rand() * sources.length)];
    origins.push(...source.slice(0, 3));
    paths.push(rand(), 3.5 + rand() * 5.5, source[3], .75 + rand() * .6);
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5,-.5,0, .5,-.5,0, .5,.5,0, -.5,.5,0], 3));
  geometry.setIndex([0,1,2,0,2,3]);
  geometry.setAttribute('dripOrigin', new THREE.InstancedBufferAttribute(new Float32Array(origins), 3));
  geometry.setAttribute('dripPath', new THREE.InstancedBufferAttribute(new Float32Array(paths), 4));
  geometry.instanceCount = count;
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    time: { value: 0 }, strength: { value: 0 }, tint: { value: new THREE.Color('#d9e8dd') },
  };
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, fog: true,
    uniforms,
    vertexShader: `
      attribute vec3 dripOrigin; attribute vec4 dripPath;
      uniform float time;
      varying vec2 dropUv; varying float dropFade;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        float age = fract(time / dripPath.y + dripPath.x) * dripPath.y;
        float lifetime = sqrt(2.0 * dripPath.z / 9.81);
        float progress = clamp(age / lifetime, 0.0, 1.0);
        vec3 world = dripOrigin + vec3(progress * .08, -.5 * 9.81 * min(age, lifetime) * min(age, lifetime), progress * .04);
        vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
        mvPosition.xy += position.xy * vec2(.065, .10 + progress * .065) * dripPath.w;
        dropUv = position.xy * 2.0;
        dropFade = (1.0 - step(lifetime, age)) * smoothstep(0.0, .04, progress) * (1.0 - smoothstep(.9, 1.0, progress));
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float strength; uniform vec3 tint;
      varying vec2 dropUv; varying float dropFade;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float shape = 1.0 - smoothstep(.42, 1.0, length(dropUv));
        float alpha = shape * dropFade * strength * .7;
        if (alpha < .007) discard;
        gl_FragColor = vec4(tint, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const drops = new THREE.Mesh(geometry, material);
  drops.name = 'Residual canopy droplets'; drops.frustumCulled = false;
  drops.visible = false; scene.add(drops);
  const dayColor = new THREE.Color('#d9e8dd'), nightColor = new THREE.Color('#637b86');
  let disposed = false;
  return {
    update({ time = 0, dripping = 0, snow = 0, night = 0, reducedMotion = false } = {}) {
      if (disposed) return;
      uniforms.time.value = reducedMotion ? 0 : time;
      uniforms.strength.value = THREE.MathUtils.clamp(dripping, 0, 1) * (1 - snow * .8);
      uniforms.tint.value.copy(dayColor).lerp(nightColor, night);
      drops.visible = !reducedMotion && uniforms.strength.value > .012;
    },
    setQuality(level) {
      if (disposed) return;
      geometry.instanceCount = Math.ceil(count * (level === 'light' ? .34 : level === 'balanced' ? .65 : 1));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      drops.removeFromParent(); geometry.dispose(); material.dispose();
    },
  };
}
