import * as THREE from 'three';

// One draw call for near and distant flakes. All motion runs on the GPU;
// locally sampled terrain keeps each falling column safely above the banks.
export function createSnow(scene, { mobile, rand, groundHeight }) {
  const count = mobile ? 580 : 1120;
  const nearCount = mobile ? 220 : 430;
  const positions = new Float32Array(count * 3);
  const motion = new Float32Array(count * 4);
  const drift = new Float32Array(count * 4);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const near = i < nearCount;
    const x = near ? -58 + rand() * 146 : -85 + rand() * 180;
    const z = near ? 54 - rand() * 108 : -35 - rand() * 145;
    const sway = 0.75 + rand() * 1.75;
    const width = sway + 0.5;
    const depth = sway * 0.45;
    let floor = 0.08;

    // Sample the entire drift envelope once. A small clearance and normal
    // depth testing prevent flakes from leaking through sloping terrain.
    for (let sx = -2; sx <= 2; sx += 1) {
      for (let sz = -2; sz <= 2; sz += 1) {
        floor = Math.max(floor, groundHeight(x + sx * width * 0.5, z + sz * depth * 0.5) + 0.6);
      }
    }

    const height = (near ? 44 : 57) + rand() * 15;
    positions.set([x, floor, z], i * 3);
    motion.set([
      rand() * height,
      height,
      (near ? 0.8 : 0.65) + rand() * 0.9,
      near ? 0.64 + rand() * 0.25 : 0.44 + rand() * 0.22,
    ], i * 4);
    drift.set([sway, 0.13 + rand() * 0.15, rand() * Math.PI * 2, depth], i * 4);
    sizes[i] = near ? 0.10 + rand() * 0.20 : 0.12 + rand() * 0.17;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aMotion', new THREE.BufferAttribute(motion, 4));
  geometry.setAttribute('aDrift', new THREE.BufferAttribute(drift, 4));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    fog: true,
    toneMapped: false,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uPixelScale: { value: 400 },
      },
    ]),
    vertexShader: `
      uniform float uTime;
      uniform float uPixelScale;
      attribute vec4 aMotion;
      attribute vec4 aDrift;
      attribute float aSize;
      varying float vOpacity;
      #include <fog_pars_vertex>

      void main() {
        float fall = mod(aMotion.x - uTime * aMotion.z, aMotion.y);
        vec3 flake = position;
        flake.x += sin(uTime * aDrift.y + aDrift.z) * aDrift.x;
        flake.x += sin(uTime * 0.037 + aDrift.z * 0.3) * 0.5;
        flake.z += cos(uTime * aDrift.y * 0.73 + aDrift.z) * aDrift.w;
        flake.y += fall;

        vec4 mvPosition = modelViewMatrix * vec4(flake, 1.0);
        float distance = -mvPosition.z;
        float lowerFade = smoothstep(0.0, 1.6, fall);
        float upperFade = 1.0 - smoothstep(aMotion.y - 3.0, aMotion.y, fall);
        float cameraFade = smoothstep(2.0, 9.0, distance);
        vOpacity = aMotion.w * lowerFade * upperFade * cameraFade;

        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(aSize * uPixelScale * projectionMatrix[1][1] / max(distance, 1.0), 1.1, 12.0);
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uIntensity;
      varying float vOpacity;
      #include <fog_pars_fragment>

      void main() {
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (radius >= 1.0) discard;
        float softEdge = 1.0 - smoothstep(0.18, 1.0, radius);
        float alpha = softEdge * vOpacity * uIntensity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(vec3(0.89, 0.95, 1.0), alpha);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const object = new THREE.Points(geometry, material);
  object.name = 'Soft snowfall';
  object.frustumCulled = false;
  object.visible = false;
  const viewport = new THREE.Vector4();
  object.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(viewport);
    material.uniforms.uPixelScale.value = Math.max(1, viewport.w) * 0.5;
  };
  scene.add(object);

  let disposed = false;
  let initializedTime = false;

  return {
    object,
    update({ time, intensity, reducedMotion }) {
      if (disposed) return;
      const amount = Math.min(1, Math.max(0, Number(intensity) || 0));
      material.uniforms.uIntensity.value = amount;
      object.visible = amount > 0.001;
      // Freeze at the current frame when reduced motion is enabled.
      if (!reducedMotion || !initializedTime) {
        material.uniforms.uTime.value = Number.isFinite(time) ? time : 0;
        initializedTime = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      object.removeFromParent();
      object.onBeforeRender = () => {};
      geometry.dispose();
      material.dispose();
    },
  };
}
