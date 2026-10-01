import * as THREE from 'three';

// Instanced, locally generated vegetation. Wind stays on the GPU, including shadow depth.
export function createVegetation(scene, { mobile, rand, groundHeight, riverCenter, riverWidth }) {
  const time = { value: 0 }, wind = { value: 1 }, snow = { value: 0 };
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const depthMaterials = [];
  const windCode = `
    vec3 plantOrigin = vec3(0.0);
    #ifdef USE_INSTANCING
      plantOrigin = instanceMatrix[3].xyz;
    #endif
    float plantPhase = dot(plantOrigin.xz, vec2(.13, .09));
    float plantBend = sin(plantTime * 1.15 + plantPhase) * .072
      + sin(plantTime * 2.15 + plantPhase * 1.7) * .023;
    float tipWeight = pow(max(position.y, 0.0), 1.7);
    transformed.x += plantBend * tipWeight * plantWind;
    transformed.z += cos(plantTime * .8 + plantPhase) * .038 * tipWeight * plantWind;
  `;
  function animate(material, depth = false) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.plantTime = time; shader.uniforms.plantWind = wind;
      shader.vertexShader = 'uniform float plantTime; uniform float plantWind;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + windCode);
      if (!depth) {
        shader.uniforms.plantSnow = snow;
        shader.vertexShader = 'varying float plantTop;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nplantTop = clamp(position.y, 0.0, 1.0);');
        shader.fragmentShader = 'uniform float plantSnow; varying float plantTop;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(.77,.85,.84), plantSnow * smoothstep(.25, .95, plantTop) * .68);');
      }
    };
    material.customProgramCacheKey = () => depth ? 'plant-wind-depth-v1' : 'plant-wind-color-v1';
    return material;
  }
  function addPlant(mesh, casts = false) {
    animate(mesh.material); mesh.receiveShadow = true; mesh.castShadow = casts && !mobile;
    if (mesh.castShadow) {
      const depth = animate(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: mesh.material.side }), true);
      mesh.customDepthMaterial = depth; depthMaterials.push(depth);
    }
    scene.add(mesh); return mesh;
  }

  const trees = [];
  for (let i = 0; i < (mobile ? 730 : 1320); i++) {
    const x = (rand() - .5) * 215, z = 65 - rand() * 250;
    if (Math.abs(x - riverCenter(z)) - riverWidth(z) < 3 || (z > 14 && Math.abs(x - 24) < 13)) continue;
    trees.push({ x, z, y: groundHeight(x, z), height: 4 + rand() * 8.8, width: .78 + rand() * .48, rotation: rand() * Math.PI * 2, tint: rand(), lean: (rand() - .5) * .045 });
  }
  const bark = new THREE.MeshStandardMaterial({ color: '#63503c', roughness: 1 });
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.07, .23, 1, 7), bark, trees.length);
  trunk.castShadow = !mobile; trunk.receiveShadow = true;
  trees.forEach((t, i) => {
    dummy.position.set(t.x, t.y + t.height * .42, t.z); dummy.scale.set(t.width, t.height * .84, t.width);
    dummy.rotation.set(t.lean, t.rotation, t.lean); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
  });
  scene.add(trunk);
  const green = new THREE.Color('#225342'), tips = new THREE.Color('#6e925b');
  for (let tier = 0; tier < 4; tier++) {
    const vertices = [], colors = [], indices = [], segments = 12;
    const radii = [1, .84, .57, .28, 0], heights = [0, .13, .38, .68, 1];
    for (let ring = 0; ring < radii.length; ring++) {
      for (let segment = 0; segment < segments; segment++) {
        const angle = segment / segments * Math.PI * 2;
        const ripple = 1 + Math.sin(angle * 5 + tier * 1.1) * .2 + Math.cos(angle * 3 - ring * 1.7) * .12;
        const radius = radii[ring] * ripple;
        const y = heights[ring] + (ring < 4 ? Math.sin(angle * 5 + tier) * .045 * (1 - heights[ring]) : 0);
        vertices.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        const tint = .68 + heights[ring] * .32; colors.push(tint, tint, tint);
        if (ring < 4) {
          const a = ring * segments + segment, b = ring * segments + (segment + 1) % segments, c = a + segments, d = b + segments;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const canopy = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ roughness: .96, vertexColors: true, side: THREE.DoubleSide }), trees.length);
    trees.forEach((t, i) => {
      const span = t.height * (.29 - tier * .054) * t.width;
      const bottom = t.height * (.20 + tier * .185);
      dummy.position.set(t.x + t.lean * bottom, t.y + bottom, t.z + t.lean * bottom);
      dummy.rotation.set(t.lean, t.rotation + tier * .65, t.lean); dummy.scale.set(span, t.height * (.44 - tier * .035), span);
      dummy.updateMatrix(); canopy.setMatrixAt(i, dummy.matrix);
      canopy.setColorAt(i, color.copy(green).lerp(tips, t.tint * .68 + tier * .06));
    });
    addPlant(canopy, true);
  }
  // Visible lower branches break the uniform outline of the nearest trees.
  const nearTrees = trees.filter((t) => t.z > -68).slice(0, mobile ? 120 : 240);
  const branches = new THREE.InstancedMesh(new THREE.CylinderGeometry(.018, .065, 1, 5), bark, nearTrees.length * 3);
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  nearTrees.forEach((t, i) => {
    for (let branch = 0; branch < 3; branch++) {
      const angle = t.rotation + branch * 2.1, length = t.height * (.16 + branch * .015);
      direction.set(Math.cos(angle), -.16, Math.sin(angle)).normalize();
      dummy.position.set(t.x, t.y + t.height * (.24 + branch * .14), t.z).addScaledVector(direction, length * .5);
      dummy.quaternion.setFromUnitVectors(up, direction); dummy.scale.set(1, length, 1); dummy.updateMatrix(); branches.setMatrixAt(i * 3 + branch, dummy.matrix);
    }
  });
  branches.castShadow = !mobile; scene.add(branches);

  // Each instance is a tuft of five curved, tapered blades rather than one triangle.
  const blades = [], bladeColors = [], bladeIndices = [];
  for (let blade = 0; blade < 5; blade++) {
    const angle = blade * 2.399, height = .57 + rand() * .44, bend = .12 + rand() * .22;
    const baseX = Math.cos(angle) * .10, baseZ = Math.sin(angle) * .10, offset = blades.length / 3;
    for (let segment = 0; segment <= 3; segment++) {
      const t = segment / 3, width = .045 * (1 - t) + .001;
      const x = baseX + Math.cos(angle) * bend * t * t, z = baseZ + Math.sin(angle) * bend * t * t;
      for (const side of [-1, 1]) {
        blades.push(x + Math.cos(angle + Math.PI / 2) * width * side, height * t, z + Math.sin(angle + Math.PI / 2) * width * side);
        const shade = .48 + t * .52; bladeColors.push(shade, shade, shade * .9);
      }
      if (segment < 3) { const a = offset + segment * 2; bladeIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const tuftGeometry = new THREE.BufferGeometry(); tuftGeometry.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
  tuftGeometry.setAttribute('color', new THREE.Float32BufferAttribute(bladeColors, 3)); tuftGeometry.setIndex(bladeIndices); tuftGeometry.computeVertexNormals();
  const grass = new THREE.InstancedMesh(tuftGeometry, new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, roughness: 1 }), mobile ? 1700 : 3900);
  const grassDark = new THREE.Color('#507448'), grassLight = new THREE.Color('#a7b86b');
  for (let i = 0; i < grass.count; i++) {
    const z = 57 - rand() * 135, side = rand() > .5 ? 1 : -1;
    const x = riverCenter(z) + side * (riverWidth(z) + .8 + rand() * 21);
    dummy.position.set(x, groundHeight(x, z), z); dummy.rotation.set(0, rand() * Math.PI * 2, (rand() - .5) * .18);
    const scale = .55 + rand() * 1.05; dummy.scale.set(scale, scale, scale); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    grass.setColorAt(i, color.copy(grassDark).lerp(grassLight, rand()));
  }
  addPlant(grass);
  const reeds = new THREE.InstancedMesh(tuftGeometry, new THREE.MeshStandardMaterial({ color: '#b6b477', side: THREE.DoubleSide, vertexColors: true, roughness: 1 }), mobile ? 180 : 340);
  for (let i = 0; i < reeds.count; i++) {
    const z = 45 - rand() * 120, side = rand() > .5 ? 1 : -1;
    const x = riverCenter(z) + side * (riverWidth(z) + .6 + rand() * 1.6);
    dummy.position.set(x, groundHeight(x, z), z); dummy.rotation.set(0, rand() * Math.PI * 2, .04);
    const scale = 1 + rand(); dummy.scale.set(.65, scale * 1.6, .65); dummy.updateMatrix(); reeds.setMatrixAt(i, dummy.matrix);
  }
  addPlant(reeds);
  return {
    update(elapsed, reducedMotion, rain, snowIntensity) {
      time.value = elapsed; wind.value = reducedMotion ? 0 : 1 + rain * .65; snow.value = snowIntensity;
    },
    dispose() { depthMaterials.forEach((material) => material.dispose()); },
  };
}
