import * as THREE from 'three';

function replaceRequired(source, anchor, replacement) {
  if (!source.includes(anchor)) throw new Error('Sky material shader anchor is unavailable: ' + anchor);
  return source.replace(anchor, replacement);
}

// Extend the existing moon and star draws; no extra geometry or render passes.
export function createSkyDetails({ sunMaterial, stars, rand }) {
  const night = { value: 0 }, time = { value: 0 };
  const craters = [];
  for (let i = 0; i < 14; i++) {
    const x = (rand() - .5) * 1.6, y = (rand() - .5) * 1.6;
    const center = new THREE.Vector3(x, y, Math.sqrt(Math.max(.06, 1 - x * x - y * y))).normalize();
    craters.push(new THREE.Vector4(center.x, center.y, center.z, .065 + rand() * .12));
  }
  const previousSunCompile = sunMaterial.onBeforeCompile;
  const previousSunKey = sunMaterial.customProgramCacheKey;
  const previousStarCompile = stars.material.onBeforeCompile;
  const previousStarKey = stars.material.customProgramCacheKey;
  const previousStarDetail = stars.geometry.getAttribute('celestialStarDetail');

  sunMaterial.onBeforeCompile = (shader, renderer) => {
    previousSunCompile.call(sunMaterial, shader, renderer);
    shader.uniforms.celestialNight = night;
    shader.uniforms.celestialCraters = { value: craters };
    shader.vertexShader = 'varying vec3 celestialSurface;\n' + shader.vertexShader;
    shader.vertexShader = replaceRequired(shader.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\ncelestialSurface = normalize(position);');
    shader.fragmentShader = `
      uniform float celestialNight;
      uniform vec4 celestialCraters[14];
      varying vec3 celestialSurface;
      float celestialHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float celestialNoise(vec3 p) {
        vec3 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(celestialHash(cell), celestialHash(cell + vec3(1,0,0)), f.x),
          mix(celestialHash(cell + vec3(0,1,0)), celestialHash(cell + vec3(1,1,0)), f.x), f.y),
          mix(mix(celestialHash(cell + vec3(0,0,1)), celestialHash(cell + vec3(1,0,1)), f.x),
          mix(celestialHash(cell + vec3(0,1,1)), celestialHash(cell + vec3(1,1,1)), f.x), f.y), f.z);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = replaceRequired(shader.fragmentShader, '#include <color_fragment>', `
      #include <color_fragment>
      if (celestialNight > .001) {
        vec3 moonNormal = normalize(celestialSurface);
        float maria = smoothstep(.26, .65, celestialNoise(moonNormal * 4.7 + 9.0));
        float relief = .56 + maria * .30 + celestialNoise(moonNormal * 36.0) * .09;
        for (int i = 0; i < 14; i++) {
          float radial = length(moonNormal - celestialCraters[i].xyz) / celestialCraters[i].w;
          float bowl = 1.0 - smoothstep(.1, .84, radial);
          float rim = exp(-pow((radial - .87) * 11.0, 2.0));
          relief -= bowl * .16;
          relief += rim * .095;
        }
        float rimLight = .78 + .22 * max(dot(moonNormal, normalize(vec3(-.45,.5,1.0))), 0.0);
        diffuseColor.rgb *= mix(1.0, clamp(relief * rimLight, .35, 1.03), celestialNight);
      }
    `);
  };
  sunMaterial.customProgramCacheKey = () => 'celestial-moon-relief-v1';
  sunMaterial.needsUpdate = true;

  const detail = new Float32Array(stars.geometry.attributes.position.count * 2);
  for (let i = 0; i < detail.length; i += 2) {
    detail[i] = .65 + Math.pow(rand(), 3) * 1.6;
    detail[i + 1] = rand() * Math.PI * 2;
  }
  stars.geometry.setAttribute('celestialStarDetail', new THREE.BufferAttribute(detail, 2));
  stars.material.onBeforeCompile = (shader, renderer) => {
    previousStarCompile.call(stars.material, shader, renderer);
    shader.uniforms.celestialTime = time;
    shader.vertexShader = 'uniform float celestialTime; attribute vec2 celestialStarDetail; varying float celestialTwinkle;\n' + shader.vertexShader;
    shader.vertexShader = replaceRequired(shader.vertexShader, '#include <logdepthbuf_vertex>', `
      gl_PointSize = clamp(gl_PointSize * celestialStarDetail.x, 1.0, 4.5);
      celestialTwinkle = .78 + .22 * sin(celestialTime * .32 + celestialStarDetail.y);
      #include <logdepthbuf_vertex>
    `);
    shader.fragmentShader = 'varying float celestialTwinkle;\n' + shader.fragmentShader;
    shader.fragmentShader = replaceRequired(shader.fragmentShader, '#include <color_fragment>', `
      #include <color_fragment>
      float celestialRadius = length(gl_PointCoord - vec2(.5)) * 2.0;
      if (celestialRadius >= 1.0) discard;
      diffuseColor.a *= (1.0 - smoothstep(.14, 1.0, celestialRadius)) * celestialTwinkle;
    `);
  };
  stars.material.customProgramCacheKey = () => 'celestial-soft-stars-v1';
  stars.material.needsUpdate = true;

  let disposed = false;
  return {
    update(elapsed, nightAmount) {
      if (disposed) return;
      time.value = elapsed;
      night.value = THREE.MathUtils.clamp(nightAmount, 0, 1);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sunMaterial.onBeforeCompile = previousSunCompile;
      sunMaterial.customProgramCacheKey = previousSunKey;
      stars.material.onBeforeCompile = previousStarCompile;
      stars.material.customProgramCacheKey = previousStarKey;
      if (previousStarDetail) stars.geometry.setAttribute('celestialStarDetail', previousStarDetail);
      else stars.geometry.deleteAttribute('celestialStarDetail');
      sunMaterial.needsUpdate = true;
      stars.material.needsUpdate = true;
    },
  };
}
