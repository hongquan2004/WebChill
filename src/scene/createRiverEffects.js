import * as THREE from 'three';
import { riverCenter, riverWidth } from './terrain.js';

// Two inexpensive surface batches. All motion travels downstream, towards +Z.
export function createRiverEffects(scene, { mobile = false, rand, obstacles = [] }) {
  if (mobile) return { update() {}, setQuality() {}, dispose() {} };
  const objects = [];
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    time: { value: 0 }, rain: { value: 0 }, detail: { value: 1 },
    waterFoam: { value: new THREE.Color('#dcf3e8') },
    visibility: { value: 1 },
  };
  const positions = [], coordinates = [], seeds = [], indices = [];
  const across = 12, along = 32;
  obstacles.forEach((rock, index) => {
    const base = positions.length / 3;
    for (let j = 0; j <= along; j++) {
      const localZ = -1.35 + j / along * 9.35;
      const z = rock.z + localZ * rock.radiusZ;
      for (let i = 0; i <= across; i++) {
        const localX = -2.8 + i / across * 5.6;
        const x = riverCenter(z) + rock.offset + localX * rock.radiusX;
        positions.push(x, .105, z); coordinates.push(localX, localZ); seeds.push(index * 1.791);
        if (i < across && j < along) {
          const a = base + j * (across + 1) + i;
          indices.push(a, a + across + 1, a + 1, a + 1, a + across + 1, a + across + 2);
        }
      }
    }
  });
  const wakesGeometry = new THREE.BufferGeometry();
  wakesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  wakesGeometry.setAttribute('riverLocal', new THREE.Float32BufferAttribute(coordinates, 2));
  wakesGeometry.setAttribute('rockSeed', new THREE.Float32BufferAttribute(seeds, 1));
  wakesGeometry.setIndex(indices);
  const wakesMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true,
    vertexShader: `
      attribute vec2 riverLocal; attribute float rockSeed;
      varying vec2 localFlow; varying float seed;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        localFlow = riverLocal; seed = rockSeed;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float time; uniform float rain; uniform float detail; uniform float visibility;
      uniform vec3 waterFoam;
      varying vec2 localFlow; varying float seed;
      #include <common>
      #include <fog_pars_fragment>
      float ribbon(float d, float width) {
        float antialias = max(fwidth(d), .025);
        return 1. - smoothstep(width, width + antialias, abs(d));
      }
      void main() {
        vec2 p = localFlow;
        float distanceFromRock = length(p * vec2(1., 1.06));
        float bow = ribbon(distanceFromRock - .94, .09);
        bow *= (1. - smoothstep(.3, 1.25, p.y)) * (.74 + .26 * sin(p.x * 13. - time * 7. + seed));
        float downstream = smoothstep(.22, 1.3, p.y) * (1. - smoothstep(4., 7.8, p.y));
        float side = .66 + max(p.y, 0.) * .13;
        float curl = sin(p.y * 3.4 - time * 7.1 + seed) * (.06 + max(p.y, 0.) * .018);
        float wake = ribbon(abs(p.x) - side - curl, .048);
        wake *= .45 + .55 * pow(sin(p.y * 3.5 - time * 7.8 + seed) * .5 + .5, 2.);
        float ripple = ribbon(sin(p.y * 7. - time * 11. + abs(p.x) * 3. + seed), .13);
        ripple *= exp(-p.x * p.x * 2.) * .17;
        vec2 eddyPoint = vec2(abs(p.x) - 1.0, p.y - 1.65);
        float eddyRadius = length(eddyPoint * vec2(1.6, 1.));
        float eddyAngle = atan(eddyPoint.y, eddyPoint.x);
        float eddy = ribbon(eddyRadius - (.54 + sin(eddyAngle * 2. - time * 3.6 + seed) * .12), .04);
        eddy *= smoothstep(.2, .75, sin(eddyAngle * 2. - time * 3.6 + seed) * .5 + .5);
        float alpha = bow * .49 + downstream * (wake * .49 + ripple * detail + eddy * .28 * detail);
        alpha *= visibility * (1. + rain * .12);
        alpha *= smoothstep(.68, .88, distanceFromRock);
        if (alpha < .007) discard;
        gl_FragColor = vec4(waterFoam, min(alpha, .75));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const wakes = new THREE.Mesh(wakesGeometry, wakesMaterial);
  wakes.name = 'Rock wakes and eddies'; wakes.renderOrder = 2;
  objects.push(wakes); scene.add(wakes);

  const maxImpacts = 360;
  const impactGeometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(2, 2);
  impactGeometry.index = quad.index.clone();
  impactGeometry.setAttribute('position', quad.attributes.position.clone());
  quad.dispose();
  const impacts = [];
  for (let i = 0; i < maxImpacts; i++) {
    let x, z;
    // Avoid rain rings drawing over a rock; use the same visible footprints as the wakes.
    for (let attempt = 0; attempt < 32; attempt++) {
      z = 37 - rand() * 172;
      x = riverCenter(z) + (rand() * 2 - 1) * riverWidth(z) * .79;
      if (!obstacles.some((rock) => ((x - rock.x) / (rock.radiusX + .52)) ** 2
        + ((z - rock.z) / (rock.radiusZ + .52)) ** 2 < 1)) break;
    }
    impacts.push(x, z, .23 + rand() * .24, rand());
  }
  impactGeometry.setAttribute('impact', new THREE.InstancedBufferAttribute(new Float32Array(impacts), 4));
  impactGeometry.instanceCount = maxImpacts;
  const impactsMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true,
    vertexShader: `
      attribute vec4 impact;
      uniform float time;
      varying vec2 ringUv; varying float age;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        age = fract(time * (.82 + impact.w * .35) + impact.w);
        ringUv = position.xy;
        float radius = impact.z * (.24 + age * .76);
        vec3 world = vec3(impact.x + position.x * radius, .125, impact.y - position.y * radius);
        vec4 mvPosition = modelViewMatrix * vec4(world, 1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float rain; uniform float visibility; uniform vec3 waterFoam;
      varying vec2 ringUv; varying float age;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float radius = length(ringUv);
        float edge = max(fwidth(radius), .03);
        float ring = 1. - smoothstep(.035, .035 + edge, abs(radius - .84));
        float inner = (1. - smoothstep(.025, .025 + edge, abs(radius - .52))) * .27;
        float life = smoothstep(.01, .1, age) * (1. - smoothstep(.3, .96, age));
        float alpha = (ring + inner) * life * rain * visibility * .37;
        if (alpha < .007) discard;
        gl_FragColor = vec4(waterFoam, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const rainImpacts = new THREE.Mesh(impactGeometry, impactsMaterial);
  rainImpacts.name = 'Rain impact rings'; rainImpacts.renderOrder = 3;
  // Instanced centers live in attributes, so the tiny base quad cannot define its bounds.
  rainImpacts.frustumCulled = false; rainImpacts.visible = false;
  objects.push(rainImpacts); scene.add(rainImpacts);
  const dayColor = new THREE.Color('#dcf3e8'), duskColor = new THREE.Color('#e3d6c0'), nightColor = new THREE.Color('#708d9b');
  let disposed = false;
  return {
    update({ time = 0, rain = 0, night = 0, dusk = 0, snow = 0, reducedMotion = false }) {
      if (disposed) return;
      uniforms.time.value = reducedMotion ? 0 : time;
      uniforms.rain.value = THREE.MathUtils.clamp(rain, 0, 1);
      uniforms.visibility.value = 1 - night * .38 - snow * .12;
      uniforms.waterFoam.value.copy(dayColor).lerp(duskColor, dusk).lerp(nightColor, night);
      rainImpacts.visible = rain > .005 && !reducedMotion;
    },
    setQuality(level) {
      if (disposed) return;
      impactGeometry.instanceCount = level === 'light' ? 112 : level === 'balanced' ? 220 : maxImpacts;
      uniforms.detail.value = level === 'light' ? .35 : level === 'balanced' ? .7 : 1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      objects.forEach((object) => { scene.remove(object); object.geometry.dispose(); object.material.dispose(); });
    },
  };
}
