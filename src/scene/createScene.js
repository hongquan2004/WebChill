import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { groundHeight, noise, random, riverCenter, riverWidth } from './terrain';

export function createScene(container, initialNight, onFailure) {
  const rand = random();
  const mobile = container.clientWidth < 760;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  const initializationCleanup = [];
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 1.75));
    renderer.shadowMap.enabled = !mobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.13;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#c4d9cf', .0055);
    const camera = new THREE.PerspectiveCamera(48, 1, .2, 680);
    const baseCamera = new THREE.Vector3(24, 15, 43);
    camera.position.copy(baseCamera);
    const lookAt = new THREE.Vector3(-2, 10, -62);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = new THREE.Vector2();
    const dummy = new THREE.Object3D();
    const textures = [];
    const color = new THREE.Color();
    let disposed = false, frame = 0, previous = 0, elapsed = 0;
    let targetNight = initialNight ? 1 : 0, night = targetNight;
    let targetDusk = 0, dusk = 0, targetRain = 0, rain = 0, lastShadowUpdate = -1;
    const sunDirection = new THREE.Vector3(-48, 105, -250).normalize();

    const hemi = new THREE.HemisphereLight('#e2f1eb', '#3e5134', 2.4);
    scene.add(hemi);
    const sunlight = new THREE.DirectionalLight('#ffdfad', 3.2);
    sunlight.position.set(65, 85, -110);
    sunlight.target.position.set(0, 0, -22);
    sunlight.castShadow = !mobile;
    sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunlight.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 1, far: 270 });
    sunlight.shadow.bias = -.0005;
    sunlight.shadow.normalBias = .18;
    sunlight.shadow.radius = 3;
    scene.add(sunlight, sunlight.target);

    // Gradient sky, with a broad warm glow surrounding the sun.
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { night: { value: night }, dusk: { value: 0 }, rain: { value: 0 }, sunDirection: { value: sunDirection } },
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 vPosition; uniform float night; uniform float dusk; uniform float rain; uniform vec3 sunDirection;
        void main(){
          vec3 direction=normalize(vPosition);
          float h=pow(max(direction.y,0.),.55);
          vec3 day=mix(vec3(.86,.88,.73),vec3(.34,.62,.70),h);
          vec3 evening=mix(vec3(.96,.56,.35),vec3(.24,.31,.48),h);
          vec3 dark=mix(vec3(.085,.16,.24),vec3(.012,.027,.085),h);
          float halo=pow(max(dot(direction,sunDirection),0.),18.);
          vec3 col=mix(mix(day,evening,dusk),dark,night);
          col+=mix(vec3(.24,.13,.04),vec3(.42,.16,.035),dusk)*halo*(1.-night)*(1.-rain*.8);
          col=mix(col,mix(vec3(.32,.42,.46),vec3(.045,.075,.13),night),rain*.62);
          gl_FragColor=vec4(col,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(480, 32, 20), skyMaterial));

    function glowTexture(cloud = false) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (cloud) {
        for (let i = 0; i < 30; i++) {
          const x = 22 + rand() * 84, y = 43 + rand() * 40, r = 12 + rand() * 23;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, 'rgba(255,255,255,.20)'); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
        }
      } else {
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.12, 'rgba(255,255,255,.8)');
        g.addColorStop(.4, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      }
      const texture = new THREE.CanvasTexture(canvas); textures.push(texture); return texture;
    }
    const glow = glowTexture();
    const sunMaterial = new THREE.MeshBasicMaterial({ color: '#fff4cf', fog: false });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 24), sunMaterial);
    sun.position.set(-48, 105, -250); scene.add(sun);
    const haloMaterial = new THREE.SpriteMaterial({ map: glow, color: '#ffdc91', transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const halo = new THREE.Sprite(haloMaterial); halo.position.copy(sun.position); halo.scale.set(105, 105, 1); scene.add(halo);

    // A river valley with smoothly rising banks and layered, irregular mountains.
    const groundGeometry = new THREE.PlaneGeometry(360, 420, mobile ? 150 : 220, mobile ? 170 : 250);
    groundGeometry.rotateX(-Math.PI / 2); groundGeometry.translate(0, 0, -110);
    const positions = groundGeometry.attributes.position;
    const groundColors = [];
    const grass = new THREE.Color('#78945a'), moss = new THREE.Color('#3b6047'), sand = new THREE.Color('#aaa580');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), y = groundHeight(x, z);
      positions.setY(i, y);
      const bank = Math.abs(x - riverCenter(z)) - riverWidth(z);
      color.copy(moss).lerp(grass, noise(x * .08, z * .08));
      if (bank < 2.5) color.lerp(sand, THREE.MathUtils.clamp(1 - bank / 2.5, 0, 1));
      groundColors.push(color.r, color.g, color.b);
    }
    groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));
    groundGeometry.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    ground.receiveShadow = true; scene.add(ground);

    for (let layer = 0; layer < 3; layer++) {
      const geometry = new THREE.PlaneGeometry(570, 95, 130, 28);
      geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0, -155 - layer * 68);
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        const profile = Math.sin(((z + 155 + layer * 68) / 95 + .5) * Math.PI);
        const peak = 30 + layer * 15 + noise(x * .017 + layer * 12, layer * 8) * 65;
        const valley = 1 - .5 * Math.exp(-Math.pow((x + 12) / 43, 2));
        p.setY(i, Math.max(0, profile) * peak * valley + noise(x * .15, z * .15) * 4 - 3);
      }
      geometry.computeVertexNormals();
      const mountain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: ['#5c7e71', '#77948c', '#8da6a0'][layer], roughness: 1, flatShading: true }));
      scene.add(mountain);
    }

    // Real planar reflection; the normal map is generated locally, with no asset request.
    const normalSize = 128, normals = new Uint8Array(normalSize * normalSize * 4);
    for (let y = 0; y < normalSize; y++) for (let x = 0; x < normalSize; x++) {
      const i = (y * normalSize + x) * 4;
      const a = x / normalSize * Math.PI * 2, b = y / normalSize * Math.PI * 2;
      normals[i] = 128 + Math.sin(a * 7 + Math.cos(b * 4)) * 34;
      normals[i + 1] = 128 + Math.cos(b * 6 + Math.sin(a * 3)) * 34;
      normals[i + 2] = 244; normals[i + 3] = 255;
    }
    const normalTexture = new THREE.DataTexture(normals, normalSize, normalSize);
    normalTexture.wrapS = normalTexture.wrapT = THREE.RepeatWrapping;
    normalTexture.magFilter = normalTexture.minFilter = THREE.LinearFilter;
    normalTexture.needsUpdate = true; textures.push(normalTexture);
    const water = new Water(new THREE.PlaneGeometry(350, 410), {
      textureWidth: mobile ? 256 : 512, textureHeight: mobile ? 256 : 512,
      waterNormals: normalTexture, sunDirection: new THREE.Vector3(.4, .6, -.5).normalize(),
      sunColor: '#ffe6b4', waterColor: '#27796d', distortionScale: 1.25, fog: true,
    });
    water.rotation.x = -Math.PI / 2; water.position.set(0, .02, -108);
    water.material.uniforms.size.value = 5;
    water.receiveShadow = true;
    scene.add(water);

    // Instancing keeps the forest inexpensive: three foliage layers share a handful of draw calls.
    const trees = [];
    for (let i = 0; i < (mobile ? 780 : 1450); i++) {
      const x = (rand() - .5) * 215, z = 65 - rand() * 250;
      const bank = Math.abs(x - riverCenter(z)) - riverWidth(z);
      if (bank < 3 || (z > 14 && Math.abs(x - 24) < 13)) continue;
      trees.push({ x, z, y: groundHeight(x, z), height: 3.2 + rand() * 7.8, width: .8 + rand() * .45, rotation: rand() * Math.PI * 2, tint: rand() });
    }
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.10, .21, 1, 6), new THREE.MeshStandardMaterial({ color: '#68543d', roughness: 1 }), trees.length);
    trees.forEach((t, i) => { dummy.position.set(t.x, t.y + t.height * .32, t.z); dummy.scale.set(1, t.height * .64, 1); dummy.rotation.set(0, t.rotation, 0); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix); });
    scene.add(trunk);
    const treeGreen = new THREE.Color('#2a5d48'), treeLight = new THREE.Color('#628251');
    for (let layer = 0; layer < 4; layer++) {
      const geometry = new THREE.ConeGeometry(1, 1, 9, 3);
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const ripple = 1 + .1 * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 9 + p.getY(i) * 18);
        p.setX(i, p.getX(i) * ripple); p.setZ(i, p.getZ(i) * ripple);
      }
      geometry.computeVertexNormals();
      const leaves = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), trees.length);
      leaves.castShadow = !mobile; leaves.receiveShadow = true;
      trees.forEach((t, i) => {
        const width = t.height * (.29 - layer * .052) * t.width;
        dummy.position.set(t.x, t.y + t.height * (.32 + layer * .18), t.z);
        dummy.rotation.set(0, t.rotation + layer * .5, 0); dummy.scale.set(width, t.height * .46, width); dummy.updateMatrix();
        leaves.setMatrixAt(i, dummy.matrix); leaves.setColorAt(i, color.copy(treeGreen).lerp(treeLight, t.tint * .8 + layer * .045));
      });
      scene.add(leaves);
    }

    // Rounded river stones anchor the stream in the foreground.
    const stoneGeometry = new THREE.IcosahedronGeometry(1, 1);
    const stones = new THREE.InstancedMesh(stoneGeometry, new THREE.MeshStandardMaterial({ color: '#98a08a', roughness: .93, flatShading: true }), 180);
    for (let i = 0; i < 180; i++) {
      const z = 70 - rand() * 240, side = rand() > .5 ? 1 : -1;
      const x = riverCenter(z) + side * (riverWidth(z) + rand() * 2.4 - .5);
      const scale = .25 + rand() * 1.2;
      dummy.position.set(x, groundHeight(x, z) + scale * .12, z); dummy.rotation.set(rand(), rand() * 6, rand());
      dummy.scale.set(scale * 1.6, scale * .65, scale); dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
      stones.setColorAt(i, color.setHSL(.15 + rand() * .05, .09, .32 + rand() * .2));
    }
    stones.castShadow = !mobile; stones.receiveShadow = true; scene.add(stones);

    const bladeGeometry = new THREE.BufferGeometry();
    bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.06, 0, 0, .06, 0, 0, .10, .7, .06], 3));
    bladeGeometry.computeVertexNormals();
    const blades = new THREE.InstancedMesh(bladeGeometry, new THREE.MeshStandardMaterial({ color: '#819b53', side: THREE.DoubleSide, roughness: 1 }), mobile ? 1000 : 2600);
    for (let i = 0; i < blades.count; i++) {
      const z = 55 - rand() * 120, side = rand() > .5 ? 1 : -1;
      const x = riverCenter(z) + side * (riverWidth(z) + 1.3 + rand() * 15);
      dummy.position.set(x, groundHeight(x, z), z); dummy.rotation.set(0, rand() * 6.28, (rand() - .5) * .5);
      const s = .5 + rand() * 1.3; dummy.scale.set(s, s, s); dummy.updateMatrix(); blades.setMatrixAt(i, dummy.matrix);
    }
    scene.add(blades);

    // Sparse flowers and reeds add a detailed foreground without filling the valley.
    const flowerCount = mobile ? 100 : 220;
    const flowerStems = new THREE.InstancedMesh(new THREE.CylinderGeometry(.015, .021, 1, 4), new THREE.MeshStandardMaterial({ color: '#4e7644', roughness: 1 }), flowerCount);
    const flowerHeads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: .9 }), flowerCount);
    const petals = ['#efdca4', '#ece7cf', '#c8b5cf'];
    for (let i = 0; i < flowerCount; i++) {
      const z = 35 - rand() * 95, side = rand() > .5 ? 1 : -1;
      const x = riverCenter(z) + side * (riverWidth(z) + 2.4 + rand() * 10);
      const y = groundHeight(x, z), height = .35 + rand() * .55;
      dummy.rotation.set(0, rand() * Math.PI, .12 * (rand() - .5));
      dummy.position.set(x, y + height * .5, z); dummy.scale.set(1, height, 1); dummy.updateMatrix(); flowerStems.setMatrixAt(i, dummy.matrix);
      dummy.position.y = y + height; dummy.scale.set(.09 + rand() * .055, .055, .09 + rand() * .055); dummy.updateMatrix(); flowerHeads.setMatrixAt(i, dummy.matrix);
      flowerHeads.setColorAt(i, color.set(petals[i % petals.length]));
    }
    scene.add(flowerStems, flowerHeads);
    const reedCount = mobile ? 150 : 300;
    const reeds = new THREE.InstancedMesh(bladeGeometry, new THREE.MeshStandardMaterial({ color: '#a3ac69', side: THREE.DoubleSide, roughness: 1 }), reedCount);
    for (let i = 0; i < reedCount; i++) {
      const z = 45 - rand() * 115, side = rand() > .5 ? 1 : -1;
      const x = riverCenter(z) + side * (riverWidth(z) + .7 + rand() * 1.5);
      dummy.position.set(x, groundHeight(x, z), z); dummy.rotation.set(0, rand() * Math.PI * 2, (rand() - .5) * .2);
      const height = .9 + rand() * 1.3; dummy.scale.set(.7, height, .7); dummy.updateMatrix(); reeds.setMatrixAt(i, dummy.matrix);
    }
    scene.add(reeds);

    // A small flock glides slowly across the distant valley.
    const birdCount = 7, birdPositions = new Float32Array(birdCount * 12);
    const birdGeometry = new THREE.BufferGeometry();
    birdGeometry.setAttribute('position', new THREE.BufferAttribute(birdPositions, 3));
    const birdMaterial = new THREE.LineBasicMaterial({ color: '#334c47', transparent: true, opacity: .65, depthWrite: false });
    const birds = new THREE.LineSegments(birdGeometry, birdMaterial); birds.frustumCulled = false; scene.add(birds);

    // Rain remains a single draw call and only animates while the weather is active.
    const dropCount = mobile ? 380 : 720, dropPositions = new Float32Array(dropCount * 6), dropSeeds = [];
    for (let i = 0; i < dropCount; i++) dropSeeds.push({ x: -65 + rand() * 145, y: rand() * 70, z: 48 - rand() * 160, speed: 18 + rand() * 12, length: .45 + rand() * .65 });
    const rainGeometry = new THREE.BufferGeometry(); rainGeometry.setAttribute('position', new THREE.BufferAttribute(dropPositions, 3));
    rainGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const rainMaterial = new THREE.LineBasicMaterial({ color: '#c3d9df', transparent: true, opacity: 0, depthWrite: false });
    const rainfall = new THREE.LineSegments(rainGeometry, rainMaterial); rainfall.frustumCulled = false; rainfall.visible = false; scene.add(rainfall);

    const cloudMap = glowTexture(true);
    const clouds = [];
    for (let i = 0; i < 18; i++) {
      const material = new THREE.SpriteMaterial({ map: cloudMap, color: '#fff6de', transparent: true, opacity: .55, depthWrite: false, fog: true });
      const cloud = new THREE.Sprite(material);
      cloud.position.set((rand() - .5) * 360, 75 + rand() * 45, -190 - rand() * 90);
      cloud.scale.set(65 + rand() * 65, 14 + rand() * 20, 1);
      cloud.userData.startX = cloud.position.x; cloud.userData.speed = .16 + rand() * .2;
      clouds.push(cloud); scene.add(cloud);
    }
    const mists = [];
    for (let i = 0; i < 7; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudMap, color: '#d8e3cb', opacity: .15, transparent: true, depthWrite: false }));
      sprite.position.set((rand() - .5) * 120, 10 + rand() * 6, -35 - i * 22); sprite.scale.set(110, 12, 1);
      mists.push(sprite); scene.add(sprite);
    }

    const starPositions = [];
    for (let i = 0; i < 600; i++) {
      const phi = rand() * Math.PI * 2, elevation = .1 + rand() * 1.3;
      starPositions.push(370 * Math.cos(elevation) * Math.cos(phi), 370 * Math.sin(elevation), 370 * Math.cos(elevation) * Math.sin(phi));
    }
    const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: '#d8ecff', size: .8, transparent: true, opacity: 0, depthWrite: false, fog: false })); scene.add(stars);
    const fireflyPositions = [];
    for (let i = 0; i < 65; i++) { const z = 30 - rand() * 110, x = riverCenter(z) + (rand() - .5) * 32; fireflyPositions.push(x, Math.max(.8, groundHeight(x, z)) + 1 + rand() * 4, z); }
    const fireflyGeometry = new THREE.BufferGeometry(); fireflyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fireflyPositions, 3));
    const fireflies = new THREE.Points(fireflyGeometry, new THREE.PointsMaterial({ map: glow, color: '#e8ffa2', size: .38, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(fireflies);

    const dayFog = new THREE.Color('#c4d9cf'), nightFog = new THREE.Color('#162c40');
    const daySun = new THREE.Color('#ffdfad'), nightSun = new THREE.Color('#9db9ec');
    const dayHemi = new THREE.Color('#e2f1eb'), nightHemi = new THREE.Color('#6d8dba');
    const dayWater = new THREE.Color('#27796d'), nightWater = new THREE.Color('#0c293a');
    const dayCloud = new THREE.Color('#fff6de'), nightCloud = new THREE.Color('#677c9a');
    const dayDisk = new THREE.Color('#fff4cf'), nightDisk = new THREE.Color('#e3eeff');
    const duskFog = new THREE.Color('#b69986'), duskSun = new THREE.Color('#ffad69');
    const duskHemi = new THREE.Color('#c5b8c7'), duskWater = new THREE.Color('#557e75');
    const duskCloud = new THREE.Color('#f6c6ac'), rainFog = new THREE.Color('#778f98');
    const darkRainFog = new THREE.Color('#152637'), rainCloud = new THREE.Color('#98a5ac');
    const currentRainFog = new THREE.Color();
    const mixMood = (destination, day, sunset, dark) => destination.copy(day).lerp(sunset, dusk).lerp(dark, night);

    function render(now = 0) {
      try { renderFrame(now); } catch (error) {
        console.warn('The landscape could not be rendered.', error);
        disposeScene(); onFailure();
      }
    }
    function renderFrame(now = 0) {
      if (disposed) return;
      frame = requestAnimationFrame(render);
      if (document.hidden) { previous = now; return; }
      // Cap animation at 40 fps (30 on small screens); a static reduced-motion scene still updates controls.
      if (now - previous < (mobile ? 33 : 25)) return;
      const dt = Math.min((now - previous) / 1000, .08); previous = now;
      const changing = Math.abs(targetNight - night) > .001 || Math.abs(targetDusk - dusk) > .001 || Math.abs(targetRain - rain) > .001;
      if (reducedMotion.matches && !changing && !scene.userData.needsRender) return;
      if (!reducedMotion.matches) elapsed += dt;
      night = reducedMotion.matches ? targetNight : THREE.MathUtils.damp(night, targetNight, 1.6, dt);
      dusk = reducedMotion.matches ? targetDusk : THREE.MathUtils.damp(dusk, targetDusk, 1.6, dt);
      rain = reducedMotion.matches ? targetRain : THREE.MathUtils.damp(rain, targetRain, 1.4, dt);
      skyMaterial.uniforms.night.value = night;
      skyMaterial.uniforms.dusk.value = dusk;
      skyMaterial.uniforms.rain.value = rain;
      mixMood(scene.fog.color, dayFog, duskFog, nightFog).lerp(currentRainFog.copy(rainFog).lerp(darkRainFog, night), rain * .72);
      scene.fog.density = .0055 + rain * .004;
      mixMood(hemi.color, dayHemi, duskHemi, nightHemi); hemi.intensity = (2.4 - night * 1.55 - dusk * .35) * (1 - rain * .23);
      mixMood(sunlight.color, daySun, duskSun, nightSun); sunlight.intensity = (3.2 - night * 2.35 - dusk * .3) * (1 - rain * .68);
      mixMood(sunMaterial.color, dayDisk, duskSun, nightDisk);
      sun.position.set(-48 + dusk * 15, 105 - dusk * 38, -250); sun.scale.setScalar(1 - night * .22 + dusk * .16);
      sun.visible = rain < .97;
      sunDirection.copy(sun.position).normalize();
      sunlight.position.set(sun.position.x * .5, sun.position.y * .78, sun.position.z * .5);
      halo.position.copy(sun.position);
      mixMood(haloMaterial.color, daySun, duskSun, nightDisk); haloMaterial.opacity = (.6 - night * .35 + dusk * .12) * (1 - rain * .9);
      // Refresh static forest shadows only during lighting changes, at most four times a second.
      if (!mobile && scene.userData.needsRender) renderer.shadowMap.needsUpdate = true;
      if (!mobile && changing && now - lastShadowUpdate > 250) { renderer.shadowMap.needsUpdate = true; lastShadowUpdate = now; }
      water.material.uniforms.time.value = elapsed * .32;
      mixMood(water.material.uniforms.sunColor.value, daySun, duskSun, nightSun).multiplyScalar(1 - rain * .45);
      water.material.uniforms.sunDirection.value.copy(sunDirection);
      mixMood(water.material.uniforms.waterColor.value, dayWater, duskWater, nightWater);
      water.material.uniforms.distortionScale.value = 1.25 + rain * .9;
      stars.material.opacity = night * .9 * (1 - rain);
      fireflies.material.opacity = (night + dusk * .35) * (.6 + Math.sin(elapsed * .6) * .18) * (1 - rain * .6);
      const fp = fireflyGeometry.attributes.position;
      for (let i = 0; i < fp.count; i++) { fp.setX(i, fireflyPositions[i * 3] + Math.sin(elapsed * .24 + i) * .8); fp.setY(i, fireflyPositions[i * 3 + 1] + Math.sin(elapsed * .4 + i * 2) * .4); }
      fp.needsUpdate = true;
      clouds.forEach((c) => {
        c.position.x = ((c.userData.startX + elapsed * c.userData.speed + 220) % 440) - 220;
        mixMood(c.material.color, dayCloud, duskCloud, nightCloud).lerp(rainCloud, rain * .3);
        c.material.opacity = .55 + rain * .25;
      });
      mists.forEach((m, i) => { m.position.x = Math.sin(elapsed * .015 + i) * 35; m.material.opacity = .13 - night * .05 + rain * .12; mixMood(m.material.color, dayFog, duskFog, nightFog); });
      for (let i = 0; i < birdCount; i++) {
        const x = ((elapsed * 1.3 + i * 3.4 + 90) % 235) - 125;
        const y = 56 + Math.sin(elapsed * .14 + i * .45) * 2.2 + Math.abs(i - 3) * 1.1;
        const z = -110 - Math.abs(i - 3) * 2.4, wing = Math.sin(elapsed * 2.4 + i * .7) * .42;
        const j = i * 12;
        birdPositions[j] = x - .72; birdPositions[j + 1] = y + wing; birdPositions[j + 2] = z;
        birdPositions[j + 3] = x; birdPositions[j + 4] = y; birdPositions[j + 5] = z + .18;
        birdPositions[j + 6] = x; birdPositions[j + 7] = y; birdPositions[j + 8] = z + .18;
        birdPositions[j + 9] = x + .72; birdPositions[j + 10] = y + wing; birdPositions[j + 11] = z;
      }
      birdGeometry.attributes.position.needsUpdate = true; birdMaterial.opacity = .65 * (1 - night) * (1 - rain);
      rainfall.visible = rain > .001; rainMaterial.opacity = rain * (.30 - night * .09);
      if (rainfall.visible) {
        for (let i = 0; i < dropCount; i++) {
          const drop = dropSeeds[i], y = ((drop.y - elapsed * drop.speed) % 70 + 70) % 70;
          const x = drop.x + Math.sin(elapsed * .2) * 1.5;
          const j = i * 6;
          dropPositions[j] = x; dropPositions[j + 1] = y; dropPositions[j + 2] = drop.z;
          dropPositions[j + 3] = x + .08; dropPositions[j + 4] = y + drop.length; dropPositions[j + 5] = drop.z;
        }
        rainGeometry.attributes.position.needsUpdate = true;
      }
      const px = reducedMotion.matches ? 0 : pointer.x, py = reducedMotion.matches ? 0 : pointer.y;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, baseCamera.x + px * 1.2, 1.5, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, baseCamera.y + py * .4, 1.5, dt);
      camera.lookAt(lookAt);
      if (!reducedMotion.matches || changing || scene.userData.needsRender) {
        renderer.render(scene, camera); scene.userData.needsRender = false;
      }
    }
    function resize() {
      const width = container.clientWidth, height = container.clientHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.fov = width < 760 ? 70 : 48;
      baseCamera.set(...(width < 760 ? [14, 18, 55] : [24, 15, 43]));
      lookAt.set(...(width < 760 ? [10, 15, -65] : [-2, 10, -62]));
      camera.position.copy(baseCamera);
      camera.updateProjectionMatrix(); renderer.setSize(width, height); scene.userData.needsRender = true;
    }
    function move(event) { pointer.set(event.clientX / window.innerWidth * 2 - 1, 1 - event.clientY / window.innerHeight * 2); }
    function resetPointer() { pointer.set(0, 0); }
    function contextLost(event) { event.preventDefault(); onFailure(); }
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', resetPointer);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    initializationCleanup.push(() => {
      resizeObserver.disconnect(); window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', resetPointer);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      cancelAnimationFrame(frame);
    });
    resize(); camera.lookAt(lookAt); frame = requestAnimationFrame(render);
    function disposeScene() {
      if (disposed) return;
      disposed = true; initializationCleanup.forEach((cleanup) => cleanup());
      const geometries = new Set(), materials = new Set();
      scene.traverse((object) => { if (object.geometry) geometries.add(object.geometry); if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => materials.add(m)); });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => { m.uniforms?.mirrorSampler?.value?.dispose(); m.dispose(); });
      textures.forEach((t) => t.dispose()); sunlight.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove();
    }
    return {
      setNight(value) { targetNight = value ? 1 : 0; targetDusk = 0; scene.userData.needsRender = true; },
      setMood(value) {
        targetNight = value === 'night' ? 1 : 0;
        targetDusk = value === 'sunset' ? 1 : 0;
        scene.userData.needsRender = true;
      },
      setWeather(value) { targetRain = value === 'rain' ? 1 : 0; scene.userData.needsRender = true; },
      dispose: disposeScene,
    };
  } catch (error) {
    initializationCleanup.forEach((cleanup) => cleanup());
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    throw error;
  }
}
