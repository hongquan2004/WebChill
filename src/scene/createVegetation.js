import * as THREE from 'three';

// Instanced, locally generated vegetation. Wind stays on the GPU, including shadow depth.
export function createVegetation(scene, { mobile, rand, groundHeight, riverCenter, riverWidth }) {
  const time = { value: 0 }, wind = { value: 1 }, snow = { value: 0 };
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const depthMaterials = [], objects = [];
  let disposed = false;
  const meadowWindCode = `
    vec3 plantOrigin = vec3(0.0);
    #ifdef USE_INSTANCING
      plantOrigin = instanceMatrix[3].xyz;
    #endif
    float plantPhase = dot(plantOrigin.xz, vec2(.13, .09));
    float meadowGust = .60 + .40 * sin(plantTime * .37 - dot(plantOrigin.xz, vec2(.061, .048)));
    float plantBend = sin(plantTime * 1.05 + plantPhase) * .060
      + sin(plantTime * 2.35 + plantPhase * 1.7) * .018
      + sin(plantTime * .43 + plantPhase * .47) * .023;
    float tipWeight = pow(clamp(position.y, 0.0, 1.2), 1.7);
    transformed.x += plantBend * tipWeight * plantWind * meadowGust;
    transformed.z += cos(plantTime * .8 + plantPhase) * .038 * tipWeight * plantWind * meadowGust;
  `;
  // Every part of a tree uses the same root and height. Bend in world space, then
  // undo the instance rotation/scale so branches stay attached to moving trunks.
  const treeWindCode = `
    vec3 plantWorld = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    float treeHeight = max(plantAnchor.w, 1.0);
    float treeWeight = pow(clamp((plantWorld.y - plantAnchor.y) / treeHeight, 0.0, 1.25), 1.8);
    float grovePhase = dot(plantAnchor.xz, vec2(.046, .032));
    float treePhase = sin(dot(plantAnchor.xz, vec2(.73, .47))) * .38;
    float passingGust = .5 + .5 * sin(plantTime * .34 - grovePhase);
    float treeSway = sin(plantTime * .66 + grovePhase + treePhase) * (.012 + passingGust * .018)
      + sin(plantTime * 1.24 + grovePhase * 1.6 + treePhase) * .003;
    vec3 worldBend = vec3(treeSway, 0.0,
      treeSway * .42 + sin(plantTime * .51 + grovePhase * .8) * .006);
    vec3 localBend = vec3(
      dot(worldBend, instanceMatrix[0].xyz) / dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz),
      dot(worldBend, instanceMatrix[1].xyz) / dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz),
      dot(worldBend, instanceMatrix[2].xyz) / dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz));
    transformed += localBend * treeWeight * treeHeight * plantWind;
  `;
  function animate(material, depth = false, woody = false) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.plantTime = time; shader.uniforms.plantWind = wind;
      shader.vertexShader = 'uniform float plantTime; uniform float plantWind;\n' + shader.vertexShader;
      if (woody) shader.vertexShader = 'attribute vec4 plantAnchor;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (woody ? treeWindCode : meadowWindCode));
      if (!depth) {
        shader.uniforms.plantSnow = snow;
        shader.vertexShader = 'varying float plantTop; varying float plantUp;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nplantTop = clamp(position.y, 0.0, 1.0); plantUp = clamp(normal.y * .65 + .45, 0.0, 1.0);');
        shader.fragmentShader = 'uniform float plantSnow; varying float plantTop; varying float plantUp;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat frost = smoothstep(.16, .94, plantTop) * mix(.36, 1.0, plantUp);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(.77,.85,.84), plantSnow * frost * .76);');
      }
    };
    material.customProgramCacheKey = () => `plant-gust-${woody ? 'tree' : 'meadow'}-${depth ? 'depth' : 'color'}-v3`;
    return material;
  }
  function addObject(mesh) {
    objects.push(mesh);
    scene.add(mesh);
    return mesh;
  }
  function addPlant(mesh, casts = false, woody = false) {
    animate(mesh.material, false, woody); mesh.receiveShadow = true; mesh.castShadow = casts && !mobile;
    if (mesh.castShadow) {
      const depth = animate(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: mesh.material.side }), true, woody);
      mesh.customDepthMaterial = depth; depthMaterials.push(depth);
    }
    return addObject(mesh);
  }
  function setTreeAnchors(mesh, placements, repeats = 1) {
    const anchors = new Float32Array(placements.length * repeats * 4);
    placements.forEach((tree, index) => {
      for (let repeat = 0; repeat < repeats; repeat++) {
        anchors.set([tree.x, tree.y, tree.z, tree.height], (index * repeats + repeat) * 4);
      }
    });
    mesh.geometry.setAttribute('plantAnchor', new THREE.InstancedBufferAttribute(anchors, 4));
  }
  function makeGeometry(vertices, colors, indices) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  const trees = [];
  for (let i = 0; i < (mobile ? 730 : 1320); i++) {
    const x = (rand() - .5) * 215, z = 65 - rand() * 250;
    if (Math.abs(x - riverCenter(z)) - riverWidth(z) < 3 || (z > 14 && Math.abs(x - 24) < 13)) continue;
    const form = rand();
    trees.push({ x, z, y: groundHeight(x, z), height: 4 + rand() * 8.8, width: (.80 + rand() * .36) * (form < .28 ? .78 : form > .75 ? 1.13 : 1), rotation: rand() * Math.PI * 2, tint: rand(), lean: (rand() - .5) * .06, form });
  }
  const bark = new THREE.MeshStandardMaterial({ color: '#70614b', roughness: 1, vertexColors: true });
  function barkGeometry(topRadius, bottomRadius, segments) {
    const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, 1, segments);
    const p = geometry.attributes.position, tints = [];
    for (let i = 0; i < p.count; i++) {
      const angle = Math.atan2(p.getZ(i), p.getX(i));
      const shade = .64 + .16 * Math.sin(angle * 3 + .4) + (p.getY(i) + .5) * .12;
      tints.push(shade, shade * .96, shade * .85);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
    return geometry;
  }
  const trunk = new THREE.InstancedMesh(barkGeometry(.07, .23, 7), bark, trees.length);
  trunk.name = 'Pine trunks';
  trunk.castShadow = !mobile; trunk.receiveShadow = true;
  trees.forEach((t, i) => {
    dummy.position.set(t.x, t.y + t.height * .42, t.z); dummy.scale.set(t.width, t.height * .84, t.width);
    dummy.rotation.set(t.lean, t.rotation, t.lean); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
  });
  setTreeAnchors(trunk, trees);
  addPlant(trunk, true, true);
  const green = new THREE.Color('#244f3e'), tips = new THREE.Color('#789565'), blueGreen = new THREE.Color('#4b7268');
  for (let tier = 0; tier < 4; tier++) {
    const vertices = [], colors = [], indices = [], segments = mobile ? 12 : 14;
    const radii = [1, .88, .57, .24, 0], heights = [0, .14, .39, .72, 1];
    for (let ring = 0; ring < radii.length; ring++) {
      for (let segment = 0; segment < segments; segment++) {
        const angle = segment / segments * Math.PI * 2 + Math.sin(ring * 1.3 + tier) * .045;
        const branch = segment % 2 === 0 ? 1.15 : .73;
        const irregularity = 1 + Math.sin(angle * 3 + tier * 1.1) * .13 + Math.cos(angle * 5 - ring * 1.7) * .075;
        const radius = radii[ring] * irregularity * (branch + heights[ring] * (1 - branch));
        const droop = segment % 2 === 0 ? -.07 : .035;
        const y = heights[ring] + (ring < 4 ? (droop + Math.sin(angle * 3 + tier) * .035) * (1 - heights[ring]) : 0);
        vertices.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        const tint = .60 + heights[ring] * .34 + (segment % 2 === 0 ? .05 : -.025);
        colors.push(tint * .95, tint, tint * .91);
        if (ring < 4) {
          const a = ring * segments + segment, b = ring * segments + (segment + 1) % segments, c = a + segments, d = b + segments;
          indices.push(a, c, b);
          if (ring < 3) indices.push(b, c, d);
        }
      }
    }
    const geometry = makeGeometry(vertices, colors, indices);
    const canopy = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ roughness: .96, vertexColors: true, side: THREE.DoubleSide }), trees.length);
    canopy.name = 'Irregular pine boughs ' + tier;
    trees.forEach((t, i) => {
      const tierShape = 1 + Math.sin(t.rotation * 2 + tier * 1.7) * .09;
      const span = t.height * (.29 - tier * .054) * t.width * tierShape;
      const bottom = t.height * (.19 + tier * (.176 + t.form * .018));
      dummy.position.set(t.x + t.lean * bottom, t.y + bottom, t.z + t.lean * bottom);
      dummy.rotation.set(t.lean, t.rotation + tier * .65, t.lean); dummy.scale.set(span, t.height * (.43 - tier * .032) * (1.02 - t.form * .08), span * (1.05 - t.form * .1));
      dummy.updateMatrix(); canopy.setMatrixAt(i, dummy.matrix);
      canopy.setColorAt(i, color.copy(green).lerp(tips, t.tint * .58 + tier * .055).lerp(blueGreen, t.form < .28 ? .32 : 0));
    });
    setTreeAnchors(canopy, trees);
    addPlant(canopy, true, true);
  }
  // Close trees receive solid needle sprays; the distant forest keeps its cheap crowns.
  const nearTrees = trees.filter((t) => t.z > -72 && Math.abs(t.x - 10) < 65)
    .sort((a, b) => (a.x - 24) ** 2 + (a.z - 43) ** 2 - (b.x - 24) ** 2 - (b.z - 43) ** 2)
    .slice(0, mobile ? 100 : 210);
  const needleVertices = [], needleColors = [], needleIndices = [];
  function needleCluster(base, end, width, thickness) {
    const axis = new THREE.Vector3().subVectors(end, base).normalize();
    const across = new THREE.Vector3(0, 0, 1).cross(axis).normalize();
    const normal = new THREE.Vector3().crossVectors(axis, across).normalize();
    const center = new THREE.Vector3().lerpVectors(base, end, .47);
    const points = [base, end, center.clone().addScaledVector(across, width), center.clone().addScaledVector(across, -width), center.clone().addScaledVector(normal, thickness), center.clone().addScaledVector(normal, -thickness)];
    const offset = needleVertices.length / 3;
    points.forEach((p, index) => {
      needleVertices.push(p.x, p.y, p.z);
      const shade = .64 + p.y * .25 + (index === 4 ? .1 : 0);
      needleColors.push(shade * .91, shade, shade * .90);
    });
    for (const index of [0,4,2, 0,3,4, 0,5,3, 0,2,5, 1,2,4, 1,4,3, 1,3,5, 1,5,2]) needleIndices.push(offset + index);
  }
  for (let node = 0; node < 3; node++) {
    for (let ray = 0; ray < 3; ray++) {
      const angle = ray * Math.PI * 2 / 3 + node * 1.35;
      const y = .10 + node * .22, reach = .34 - node * .055;
      needleCluster(new THREE.Vector3(0, y, 0), new THREE.Vector3(Math.cos(angle) * reach, y + .34, Math.sin(angle) * reach), .07 - node * .009, .028);
    }
  }
  needleCluster(new THREE.Vector3(0, .55, 0), new THREE.Vector3(.035, 1.08, 0), .075, .03);
  const needleGeometry = makeGeometry(needleVertices, needleColors, needleIndices);
  const needles = new THREE.InstancedMesh(needleGeometry, new THREE.MeshStandardMaterial({ roughness: .93, vertexColors: true, side: THREE.DoubleSide }), nearTrees.length * 4);
  needles.name = 'Foreground needle sprays';
  const branches = new THREE.InstancedMesh(barkGeometry(.018, .055, 5), bark, nearTrees.length * 4);
  branches.name = 'Exposed pine branches';
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  nearTrees.forEach((t, i) => {
    for (let branch = 0; branch < 4; branch++) {
      const angle = t.rotation + branch * 2.399, length = t.height * t.width * (.29 - branch * .025);
      const bottom = t.height * (.22 + branch * .098);
      direction.set(Math.cos(angle), -.055 + branch * .025, Math.sin(angle)).normalize();
      dummy.position.set(t.x + t.lean * bottom, t.y + bottom, t.z + t.lean * bottom).addScaledVector(direction, length * .5);
      dummy.quaternion.setFromUnitVectors(up, direction); dummy.scale.set(1, length, 1); dummy.updateMatrix(); branches.setMatrixAt(i * 4 + branch, dummy.matrix);
      dummy.position.addScaledVector(direction, -length * .32);
      dummy.scale.set(length * .80, length * .93, length * .80); dummy.updateMatrix(); needles.setMatrixAt(i * 4 + branch, dummy.matrix);
      needles.setColorAt(i * 4 + branch, color.copy(green).lerp(tips, .14 + t.tint * .52));
    }
  });
  setTreeAnchors(branches, nearTrees, 4);
  setTreeAnchors(needles, nearTrees, 4);
  addPlant(branches, true, true);
  addPlant(needles, true, true);

  // Folded ribbons give each tuft a visible midrib, narrow tips and a drooping profile.
  const blades = [], bladeColors = [], bladeIndices = [];
  for (let blade = 0; blade < (mobile ? 4 : 5); blade++) {
    const angle = blade * 2.399 + rand() * .25, height = .52 + rand() * .52, bend = .16 + rand() * .26;
    const baseX = Math.cos(angle) * .085, baseZ = Math.sin(angle) * .085, offset = blades.length / 3;
    const bladeWidth = .032 + rand() * .022;
    for (let segment = 0; segment <= 3; segment++) {
      const t = segment / 3, width = bladeWidth * (1 - t * t) + .0005;
      const curl = bend * t * t + .1 * t * t * t;
      const x = baseX + Math.cos(angle) * curl, z = baseZ + Math.sin(angle) * curl;
      for (const side of [-1, 0, 1]) {
        const fold = side === 0 ? .025 * Math.sin(t * Math.PI) : 0;
        blades.push(x + Math.cos(angle + Math.PI / 2) * width * side + Math.cos(angle) * fold, height * (t - .13 * t * t * t), z + Math.sin(angle + Math.PI / 2) * width * side + Math.sin(angle) * fold);
        const shade = .43 + t * .47 + (side === 0 ? .11 : 0);
        bladeColors.push(shade, shade, shade * (blade === 1 ? .77 : .90));
      }
      if (segment < 3) {
        const a = offset + segment * 3;
        bladeIndices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
      }
    }
  }
  const tuftGeometry = makeGeometry(blades, bladeColors, bladeIndices);
  const grass = new THREE.InstancedMesh(tuftGeometry, new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, roughness: 1 }), mobile ? 1700 : 3900);
  grass.name = 'Folded meadow grass';
  const grassDark = new THREE.Color('#507448'), grassLight = new THREE.Color('#a7b86b');
  for (let i = 0; i < grass.count; i++) {
    const z = 57 - rand() * 135, side = rand() > .5 ? 1 : -1;
    const x = riverCenter(z) + side * (riverWidth(z) + .8 + Math.pow(rand(), 1.4) * 23);
    dummy.position.set(x, groundHeight(x, z), z); dummy.rotation.set(0, rand() * Math.PI * 2, (rand() - .5) * .18);
    const scale = .55 + rand() * 1.05; dummy.scale.set(scale * (.85 + rand() * .35), scale, scale); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    grass.setColorAt(i, color.copy(grassDark).lerp(grassLight, rand()));
  }
  addPlant(grass);
  const reeds = new THREE.InstancedMesh(tuftGeometry, new THREE.MeshStandardMaterial({ color: '#b6b477', side: THREE.DoubleSide, vertexColors: true, roughness: 1 }), mobile ? 180 : 340);
  reeds.name = 'Riverbank reed clumps';
  for (let i = 0; i < reeds.count; i++) {
    const z = 45 - rand() * 120, side = rand() > .5 ? 1 : -1;
    const x = riverCenter(z) + side * (riverWidth(z) + .6 + rand() * 1.6);
    dummy.position.set(x, groundHeight(x, z), z); dummy.rotation.set(0, rand() * Math.PI * 2, .04);
    const scale = 1 + rand(); dummy.scale.set(.65, scale * 1.6, .65); dummy.updateMatrix(); reeds.setMatrixAt(i, dummy.matrix);
  }
  addPlant(reeds);

  // Ferns add a separate feathered silhouette between the meadow and the forest.
  const fernVertices = [], fernColors = [], fernIndices = [];
  function fernVertex(point, shade) {
    fernVertices.push(point.x, point.y, point.z);
    fernColors.push(shade * .89, shade, shade * .84);
  }
  const frondCount = mobile ? 5 : 6;
  for (let frond = 0; frond < frondCount; frond++) {
    const angle = frond * Math.PI * 2 / frondCount + .2 * Math.sin(frond * 2.7);
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const across = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const height = .53 + .08 * Math.sin(frond * 1.8);
    const fernPoint = (t) => outward.clone().multiplyScalar(t * .87).setY(.035 + Math.sin(t * Math.PI * .8) * height);
    const stemStart = fernVertices.length / 3;
    for (let segment = 0; segment <= 4; segment++) {
      const t = segment / 4, center = fernPoint(t), halfWidth = .008 * (1 - t * .7);
      fernVertex(center.clone().addScaledVector(across, halfWidth), .71 + t * .16);
      fernVertex(center.clone().addScaledVector(across, -halfWidth), .71 + t * .16);
      if (segment < 4) {
        const a = stemStart + segment * 2;
        fernIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    for (let pair = 0; pair < 4; pair++) {
      const t = .23 + pair * .18;
      for (const side of [-1, 1]) {
        const base = fernPoint(t - .045);
        const tip = fernPoint(t).addScaledVector(across, side * (.235 - t * .095)).addScaledVector(outward, .095);
        tip.y -= .035;
        const midpoint = new THREE.Vector3().lerpVectors(base, tip, .5);
        const leafSide = new THREE.Vector3(-(tip.z - base.z), 0, tip.x - base.x).normalize().multiplyScalar(.037 - pair * .003);
        const offset = fernVertices.length / 3;
        fernVertex(base, .60 + t * .17);
        fernVertex(midpoint.clone().add(leafSide), .68 + t * .16);
        fernVertex(tip, .77 + t * .13);
        fernVertex(midpoint.clone().sub(leafSide), .66 + t * .16);
        fernVertex(midpoint.clone().add(new THREE.Vector3(0, .018, 0)), .88 + t * .1);
        fernIndices.push(offset, offset + 1, offset + 4, offset + 1, offset + 2, offset + 4, offset + 2, offset + 3, offset + 4, offset + 3, offset, offset + 4);
      }
    }
  }
  const fernGeometry = makeGeometry(fernVertices, fernColors, fernIndices);
  const ferns = new THREE.InstancedMesh(fernGeometry, new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true, side: THREE.DoubleSide }), mobile ? 85 : 180);
  ferns.name = 'Feathered bank ferns';
  const fernDark = new THREE.Color('#416e49'), fernLight = new THREE.Color('#7b9a5d');
  for (let i = 0; i < ferns.count; i++) {
    const z = 46 - rand() * 106, side = rand() > .5 ? 1 : -1;
    const x = riverCenter(z) + side * (riverWidth(z) + 2.4 + Math.pow(rand(), 1.5) * 13);
    const scale = .82 + rand() * .66;
    dummy.position.set(x, groundHeight(x, z) + .015, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, (rand() - .5) * .075);
    dummy.scale.set(scale, scale * (.85 + rand() * .22), scale);
    dummy.updateMatrix(); ferns.setMatrixAt(i, dummy.matrix);
    ferns.setColorAt(i, color.copy(fernDark).lerp(fernLight, rand()));
  }
  addPlant(ferns);

  const detailCounts = [needles, branches, grass, reeds, ferns].map((mesh) => [mesh, mesh.count]);

  return {
    update(elapsed, reducedMotion, rain, snowIntensity) {
      if (disposed) return;
      time.value = elapsed; wind.value = reducedMotion ? 0 : 1 + rain * .65 + snowIntensity * .12; snow.value = snowIntensity;
    },
    setQuality(level) {
      if (disposed) return;
      const ratio = level === 'light' ? .46 : level === 'balanced' ? .73 : 1;
      for (const [mesh, count] of detailCounts) {
        // Keep complete sets of four branches/needle sprays on the nearest trees.
        const group = mesh === needles || mesh === branches ? 4 : 1;
        mesh.count = Math.min(count, Math.max(group, Math.floor(count * ratio / group) * group));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set(), materials = new Set(depthMaterials);
      objects.forEach((object) => {
        object.removeFromParent();
        geometries.add(object.geometry); materials.add(object.material);
        object.dispose();
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
