/* ============================================================
   Props — reusable environment builders: LOD trees, instanced
   grass/flowers, rocks, ruin architecture, crystals, water,
   sky islands, cloud platforms, wind columns and waterfalls.
   ============================================================ */
import * as THREE from 'three';
import { makeRadialTexture, makeGlowSprite, rand, randInt, clamp, TAU, setShadows } from '../Utils.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GLOW = makeRadialTexture(96, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.16);

/* ============================================================
   Trees (LOD + wind sway)
   ============================================================ */
function buildCanopy(world, detail, palette) {
  const group = new THREE.Group();
  const mats = palette.map((c) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.9, metalness: 0.0, flatShading: true, envMapIntensity: 0.7,
  }));
  const count = detail === 'high' ? 7 : 2;
  for (let i = 0; i < count; i++) {
    const isTop = i === 0;
    const r = isTop ? rand(2.0, 2.8) : rand(1.15, 2.15);
    const geo = new THREE.IcosahedronGeometry(r, detail === 'high' ? 1 : 0);
    const leaf = new THREE.Mesh(geo, mats[i % mats.length]);
    const angle = rand(0, TAU);
    const dist = isTop ? 0 : rand(0.8, 2.1);
    leaf.position.set(
      Math.cos(angle) * dist,
      (isTop ? 6.1 : rand(4.1, 6.0)),
      Math.sin(angle) * dist
    );
    leaf.scale.y = rand(0.8, 1.15);
    leaf.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
    leaf.castShadow = detail === 'high';
    leaf.receiveShadow = true;
    group.add(leaf);
  }
  return group;
}

export function createTree(world, x, y, z, opts = {}) {
  const scale = opts.scale ?? 1;
  const palette = opts.palette || [0x4d8c45, 0x5fa34e, 0x6fb75a, 0x3f7a42];
  const high = new THREE.Group();
  const low = new THREE.Group();
  const trunkMat = world.materials.wood;
  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.46, 4.6, 8);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 2.3;
  trunk.castShadow = trunk.receiveShadow = true;
  high.add(trunk);
  const trunkLow = new THREE.Mesh(trunkGeo, trunkMat);
  trunkLow.position.y = 2.3;
  trunkLow.castShadow = true;
  low.add(trunkLow);

  // a few branches
  for (let i = 0; i < 3; i++) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.17, rand(1.6, 2.4), 6), trunkMat);
    const a = rand(0, TAU);
    branch.position.set(Math.cos(a) * 0.55, rand(3.0, 4.2), Math.sin(a) * 0.55);
    branch.rotation.z = Math.cos(a) * 0.9;
    branch.rotation.x = -Math.sin(a) * 0.9;
    branch.castShadow = true;
    high.add(branch);
  }

  const canopyHigh = buildCanopy(world, 'high', palette);
  const canopyLow = buildCanopy(world, 'low', palette);
  high.add(canopyHigh);
  low.add(canopyLow);

  const lod = new THREE.LOD();
  lod.position.set(x, y, z);
  lod.addLevel(high, 0);
  lod.addLevel(low, 46);
  lod.scale.setScalar(scale);
  world.scene.add(lod);
  world.trees.push({ lod, canopyHigh, canopyLow, phase: rand(0, TAU), amp: rand(0.008, 0.02) });

  if (opts.collide !== false) {
    world.addCollider(x, y + 2.3 * scale, z, 1.0 * scale, 4.6 * scale, 1.0 * scale, 'solid');
  }
  return lod;
}

/* ============================================================
   Rocks & ruin architecture
   ============================================================ */
export function createRock(world, x, y, z, scale = 1, opts = {}) {
  const geo = new THREE.DodecahedronGeometry(scale, 0);
  const mesh = new THREE.Mesh(geo, opts.material || world.materials.rock);
  mesh.position.set(x, y + scale * 0.55, z);
  mesh.scale.set(rand(0.8, 1.5), rand(0.55, 1.05), rand(0.8, 1.4));
  mesh.rotation.set(rand(0, 0.6), rand(0, TAU), rand(0, 0.6));
  mesh.castShadow = mesh.receiveShadow = true;
  world.scene.add(mesh);
  if (opts.collide) {
    const s = scale * 1.2;
    world.addCollider(mesh.position.x, y + s * 0.5, mesh.position.z, s, s, s, 'solid');
  }
  return mesh;
}

export function createColumn(world, x, y, z, opts = {}) {
  const height = opts.height ?? 6;
  const radius = opts.radius ?? 0.65;
  const mat = opts.material || world.materials.stone;
  const broken = opts.broken ?? false;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.35, radius * 1.55, 0.5, 10), mat);
  base.position.y = 0.25; base.castShadow = base.receiveShadow = true;
  group.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius, height, 12), mat);
  shaft.position.y = height / 2 + 0.4;
  shaft.castShadow = shaft.receiveShadow = true;
  group.add(shaft);
  if (!broken) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(radius * 3.1, 0.42, radius * 3.1), mat);
    cap.position.y = height + 0.6;
    cap.castShadow = true;
    group.add(cap);
    const cap2 = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.2, 0.24, radius * 2.2), world.materials.gold);
    cap2.position.y = height + 0.9;
    group.add(cap2);
    const rune = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.5, 0.035, 4, 16, Math.PI * 1.4),
      new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.55, toneMapped: false })
    );
    rune.position.set(0, height * 0.6, radius * 0.95);
    group.add(rune);
  } else {
    // jagged broken crown
    for (let i = 0; i < 3; i++) {
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(radius * rand(0.25, 0.5), 0), mat);
      chunk.position.set(rand(-radius, radius), height + rand(0.3, 0.8), rand(-radius, radius));
      chunk.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      chunk.castShadow = true;
      group.add(chunk);
    }
  }
  world.scene.add(group);
  if (opts.collide !== false) {
    world.addCollider(x, y + height / 2 + 0.4, z, radius * 2.1, height, radius * 2.1, 'solid');
  }
  return group;
}

export function createArch(world, x, y, z, opts = {}) {
  const width = opts.width ?? 7;
  const height = opts.height ?? 5.5;
  const mat = opts.material || world.materials.stone;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const torus = new THREE.Mesh(new THREE.TorusGeometry(width / 2, 0.35, 8, 24, Math.PI), mat);
  torus.position.y = height;
  torus.castShadow = true;
  group.add(torus);
  // keystone
  const key = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.8), world.materials.gold);
  key.position.y = height + width / 2;
  key.castShadow = true;
  group.add(key);
  world.scene.add(group);
  createColumn(world, x - width / 2, y, z, { height, radius: 0.42, material: mat });
  createColumn(world, x + width / 2, y, z, { height, radius: 0.42, material: mat });
  return group;
}

export function createRuinWall(world, x, y, z, opts = {}) {
  const width = opts.width ?? 8;
  const height = opts.height ?? 4;
  const depth = opts.depth ?? 0.8;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const segments = Math.max(3, Math.floor(width / 1.2));
  const mat = world.materials.stone;
  for (let i = 0; i < segments; i++) {
    const h = height * rand(0.45, 1.0);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(width / segments * 0.98, h, depth), mat);
    seg.position.set(-width / 2 + (i + 0.5) * (width / segments), h / 2, rand(-0.1, 0.1));
    seg.rotation.y = rand(-0.03, 0.03);
    seg.castShadow = seg.receiveShadow = true;
    group.add(seg);
  }
  world.scene.add(group);
  world.addCollider(x, y + height * 0.45, z, width, height * 0.9, depth + 0.2, 'solid');
  return group;
}

/* ============================================================
   Crystals
   ============================================================ */
export function createCrystalCluster(world, x, y, z, opts = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const color = opts.color ?? 0x6ff7ea;
  const color2 = opts.color2 ?? 0xbd8fff;
  const scale = opts.scale ?? 1;
  const mat = new THREE.MeshPhysicalMaterial({
    color, emissive: new THREE.Color(color).multiplyScalar(0.5), emissiveIntensity: 1.4,
    metalness: 0.15, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.05,
    transparent: true, opacity: 0.93, envMapIntensity: 1.8, flatShading: true,
  });
  const mat2 = mat.clone();
  mat2.color.set(color2); mat2.emissive.set(new THREE.Color(color2).multiplyScalar(0.5));
  const count = opts.count ?? randInt(4, 8);
  for (let i = 0; i < count; i++) {
    const h = rand(1.2, 5.4) * scale;
    const r = rand(0.22, 0.65) * scale;
    const geo = new THREE.ConeGeometry(r, h, randInt(4, 6));
    const shard = new THREE.Mesh(geo, i % 3 === 0 ? mat2 : mat);
    const a = rand(0, TAU);
    const d = rand(0, 1.3) * scale;
    shard.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
    shard.rotation.z = rand(-0.3, 0.3);
    shard.rotation.x = rand(-0.25, 0.25);
    shard.castShadow = true;
    shard.receiveShadow = true;
    group.add(shard);
  }
  const glow = makeGlowSprite({ color, size: 7 * scale, opacity: 0.22, texture: GLOW });
  glow.position.y = 1.8 * scale;
  group.add(glow);
  if (opts.light) {
    const light = new THREE.PointLight(color, opts.lightIntensity ?? 2.5, opts.lightDistance ?? 24, 2);
    light.position.set(0, 3 * scale, 0);
    group.add(light);
    world.crystalLights.push({ light, phase: rand(0, TAU), base: light.intensity });
  }
  world.scene.add(group);
  world.crystalClusters.push({ mat, mat2, phase: rand(0, TAU), base: 1.4 });
  if (opts.collide) {
    const s = 2.0 * scale;
    world.addCollider(x, y + s * 0.45, z, s, s * 0.9, s, 'solid');
  }
  return group;
}

/* ============================================================
   Instanced grass / flowers / bushes
   ============================================================ */
function makeBladeGeometry() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array([
    -0.055, 0, 0, 0.055, 0, 0, 0.0, 0.72, 0.02,
    0, 0, -0.055, 0, 0, 0.055, 0.01, 0.72, 0,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export function createGrassField(world, samples, opts = {}) {
  if (!samples.length) return null;
  const geo = makeBladeGeometry();
  const mat = world.grassMaterial;
  const mesh = new THREE.InstancedMesh(geo, mat, samples.length);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const palette = opts.palette || [0x6faa52, 0x82b95a, 0x95c96a, 0x5d9448, 0xa7cc70];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.y = rand(0, TAU);
    const sc = (s.scale ?? 1) * rand(0.7, 1.45);
    dummy.scale.set(sc, sc * rand(0.7, 1.3), sc);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.set(palette[randInt(0, palette.length - 1)]).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.06, 0.06));
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  world.scene.add(mesh);
  world.instanced.push(mesh);
  return mesh;
}

export function createFlowerField(world, samples) {
  if (!samples.length) return null;
  const geo = new THREE.IcosahedronGeometry(0.12, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x221100, emissiveIntensity: 0.4 });
  const mesh = new THREE.InstancedMesh(geo, mat, samples.length);
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const palette = [0xffd36e, 0xff9fbe, 0xcfa8ff, 0xfff0c0, 0xffb078];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    dummy.position.set(s.x, s.y + 0.22, s.z);
    dummy.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    const sc = rand(0.6, 1.5);
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.set(palette[randInt(0, palette.length - 1)]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  world.scene.add(mesh);
  world.instanced.push(mesh);
  return mesh;
}

export function createBush(world, x, y, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const mat = world.materials.leafBush;
  for (let i = 0; i < 4; i++) {
    const r = rand(0.5, 0.95) * scale;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
    b.position.set(rand(-0.5, 0.5) * scale, rand(0.3, 0.9) * scale, rand(-0.5, 0.5) * scale);
    b.scale.y = rand(0.7, 1.1);
    b.castShadow = true; b.receiveShadow = true;
    group.add(b);
  }
  world.scene.add(group);
  return group;
}

/* ============================================================
   Water
   ============================================================ */
const WATER_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSunColor;
  uniform vec3 uSky;
  varying vec2 vUv;
  varying vec3 vWorld;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);
  }
  float waves(vec2 p){
    float t=uTime*0.7;
    return sin(p.x*3.1+t)*0.5 + sin(p.y*4.3-t*1.3)*0.5 + noise(p*2.4+vec2(t*0.4,-t*0.3))*0.9;
  }
  void main(){
    vec2 uv = vUv;
    vec2 p = uv * 7.0;
    float n = waves(p);
    float n2 = waves(p*1.9 + 3.0);
    vec3 normal = normalize(vec3((n-n2)*0.045, 1.0, (n2-n)*0.045));
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    vec3 sunDir = normalize(vec3(0.5, 0.75, 0.35));
    vec3 halfV = normalize(viewDir + sunDir);
    float spec = pow(max(dot(normal, halfV), 0.0), 220.0) * 1.8;
    float ripple = smoothstep(0.55, 0.95, n*0.5+0.5);
    vec3 col = mix(uDeep, uShallow, 0.35 + ripple * 0.3);
    col = mix(col, uSky, fres * 0.65);
    col += uSunColor * spec;
    float edge = smoothstep(1.0, 0.72, length(uv - 0.5) * 1.8);
    float foam = smoothstep(0.72, 0.98, ripple) * edge;
    col += vec3(0.7, 0.95, 0.92) * foam * 0.18;
    float alpha = 0.68 + fres * 0.22;
    gl_FragColor = vec4(col, alpha);
  }
`;

const WATER_VERT = /* glsl */`
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main(){
    vUv = uv;
    vec3 pos = position;
    float w = sin(pos.x*1.7 + uTime*0.8)*0.035 + sin(pos.y*2.1 - uTime*0.6)*0.03;
    pos.z += w;
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export function createWater(world, x, y, z, radius, opts = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(opts.deep ?? 0x0e4a52) },
    uShallow: { value: new THREE.Color(opts.shallow ?? 0x2f9e91) },
    uSunColor: { value: new THREE.Color(0xffe6b0) },
    uSky: { value: new THREE.Color(0xbfe6e2) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.CircleGeometry(radius, 72, 0, TAU);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  mesh.renderOrder = 3;
  group.add(mesh);

  const bottom = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.98, 48),
    new THREE.MeshStandardMaterial({ color: opts.bottom ?? 0x183d34, roughness: 1 })
  );
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.08;
  bottom.receiveShadow = true;
  group.add(bottom);

  // edge stones
  const rockMat = world.materials.rock;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rand(-0.1, 0.1);
    const rr = radius * rand(0.95, 1.07);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.3, 0.9), 0), rockMat);
    rock.position.set(Math.cos(a) * rr, rand(-0.16, 0.05), Math.sin(a) * rr);
    rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    rock.castShadow = rock.receiveShadow = true;
    group.add(rock);
  }

  world.scene.add(group);
  world.waters.push({ group, uniforms, mesh, radius, center: V3(x, y, z) });
  return group;
}

/* ============================================================
   Sky islands, cloud platforms, wind, waterfalls
   ============================================================ */
export function createSkyIsland(world, cx, topY, cz, w, d, opts = {}) {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  const rockMat = world.materials.rock;
  const grass = world.materials.grassTopIsland;

  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), grass);
  top.rotation.x = -Math.PI / 2;
  top.position.y = topY;
  top.receiveShadow = true;
  group.add(top);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, d), rockMat);
  cap.position.y = topY - 0.9;
  cap.castShadow = cap.receiveShadow = true;
  group.add(cap);

  // inverted rock keel
  const depth = opts.depth ?? Math.min(w, d) * rand(0.55, 0.85);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.min(w, d) * 0.46, depth, 9), rockMat);
  cone.rotation.x = Math.PI;
  cone.position.y = topY - 1.8 - depth / 2;
  cone.rotation.y = rand(0, TAU);
  cone.castShadow = true;
  group.add(cone);
  for (let i = 0; i < 5; i++) {
    const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.8, 2.2), 0), rockMat);
    chunk.position.set(rand(-w * 0.33, w * 0.33), topY - rand(1.5, 5), rand(-d * 0.33, d * 0.33));
    chunk.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    chunk.castShadow = true;
    group.add(chunk);
  }
  // jagged rim stones
  for (let i = 0; i < Math.floor((w + d) * 0.55); i++) {
    const edge = randInt(0, 3);
    const a = rand(0, TAU);
    const rw = w / 2 - rand(0.2, 1.2), rd = d / 2 - rand(0.2, 1.2);
    let px = Math.cos(a) * rw, pz = Math.sin(a) * rd;
    if (edge === 0) pz = -d / 2 + rand(0, 0.6);
    if (edge === 1) pz = d / 2 - rand(0, 0.6);
    if (edge === 2) px = -w / 2 + rand(0, 0.6);
    if (edge === 3) px = w / 2 - rand(0, 0.6);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.35, 1.1), 0), rockMat);
    rock.position.set(px, topY + rand(-0.1, 0.25), pz);
    rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    rock.castShadow = rock.receiveShadow = true;
    group.add(rock);
  }

  world.scene.add(group);
  world.addCollider(cx, topY - 2.0, cz, w, 4.0, d, 'solid');
  if (opts.hangVines) {
    for (let i = 0; i < 7; i++) {
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, rand(2, 6), 4), world.materials.vines);
      vine.position.set(rand(-w / 2, w / 2), topY - rand(2, 5), rand(-d / 2, d / 2));
      vine.rotation.z = rand(-0.15, 0.15);
      group.add(vine);
    }
  }
  return { group, top: topY };
}

export function createCloudPlatform(world, x, y, z, w, d, opts = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const mat = world.materials.cloud;
  const blobs = 6;
  for (let i = 0; i < blobs; i++) {
    const geo = new THREE.SphereGeometry(rand(1.0, 2.0), 12, 8);
    const b = new THREE.Mesh(geo, mat);
    b.position.set(rand(-w * 0.35, w * 0.35), rand(-0.25, 0.2), rand(-d * 0.3, d * 0.3));
    b.scale.y = 0.45;
    b.castShadow = false;
    b.receiveShadow = true;
    group.add(b);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.25, d * 0.75), mat);
  top.position.y = 0.35;
  top.receiveShadow = true;
  group.add(top);
  world.scene.add(group);

  const collider = { box: new THREE.Box3(), kind: 'solid', active: true };
  collider.box.setFromCenterAndSize(V3(x, y + 0.35, z), V3(w * 0.9, 0.5, d * 0.75));
  world.colliders.push(collider);
  if (opts.moving) {
    const platform = new (world.MovingPlatformClass)(world, group, V3(w * 0.9, 0.6, d * 0.75), {
      axis: opts.axis || V3(0, 1, 0), amplitude: opts.amplitude ?? 1.5,
      speed: opts.speed ?? 0.8, phase: opts.phase ?? 0, zone: opts.zone || 'sky',
    });
    world.colliders = world.colliders.filter((c) => c !== collider);
    return platform;
  }
  return group;
}

export function createWindColumn(world, x, y, z, radius, height, opts = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const mat = new THREE.MeshBasicMaterial({
    color: opts.color ?? 0xcafcff, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    map: world.cloudTex,
  });
  if (mat.map) { mat.map = mat.map.clone(); mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(2, 3); mat.map.needsUpdate = true; }
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.75, radius, height, 20, 1, true), mat);
  mesh.position.y = height / 2;
  group.add(mesh);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * rand(0.6, 0.95), 0.04, 4, 28),
      new THREE.MeshBasicMaterial({ color: 0xd6ffff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = rand(1, height - 1);
    group.add(ring);
  }
  world.scene.add(group);
  world.windZones.push({ x, y, z, radius, height, strength: opts.strength ?? 34 });
  world.windVisuals.push({ mesh, mat, time: rand(0, 10) });
  return group;
}

export function createWaterfall(world, x, y, z, w, h, opts = {}) {
  const tex = world.cloudTex.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color: opts.color ?? 0xcdfcff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y - h / 2, z);
  mesh.rotation.y = opts.rotation ?? 0;
  world.scene.add(mesh);
  world.waterfalls.push({ mesh, tex, speed: opts.speed ?? 0.4 });
  return mesh;
}

/* ============================================================
   Small decorations
   ============================================================ */
export function createBrazier(world, x, y, z, opts = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 0.5, 10), world.materials.stoneDark);
  bowl.position.y = 0.9; bowl.castShadow = true;
  group.add(bowl);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.28, 0.8, 8), world.materials.stoneDark);
  stem.position.y = 0.45; group.add(stem);
  const glow = makeGlowSprite({ color: opts.color ?? 0xffc46a, size: 2.2, opacity: 0.7, texture: GLOW });
  glow.position.y = 1.25;
  group.add(glow);
  const light = new THREE.PointLight(opts.color ?? 0xffb45e, 2.0, 12, 2);
  light.position.y = 1.4;
  group.add(light);
  world.scene.add(group);
  world.braziers.push({ glow, light, phase: rand(0, TAU), base: 2.0 });
  return group;
}

export function createLantern(world, x, y, z, opts = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.1, 6), world.materials.wood);
  post.position.y = 1.05; post.castShadow = true; group.add(post);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: opts.color ?? 0xffd98a, toneMapped: false }));
  orb.position.y = 2.2; group.add(orb);
  const glow = makeGlowSprite({ color: opts.color ?? 0xffd98a, size: 1.8, opacity: 0.55, texture: GLOW });
  glow.position.y = 2.2; group.add(glow);
  const light = new THREE.PointLight(opts.color ?? 0xffc46a, 0.8, 8, 2);
  light.position.y = 2.2; group.add(light);
  world.scene.add(group);
  world.lanterns.push({ group, glow, light, phase: rand(0, TAU) });
  return group;
}

export function createLilyPads(world, x, y, z, radius, count = 10) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x4f9c59, roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU), r = rand(1, radius * 0.85);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(rand(0.25, 0.65), 10, 0, Math.PI * 1.75), mat);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = rand(0, TAU);
    pad.position.set(x + Math.cos(a) * r, y + 0.08, z + Math.sin(a) * r);
    pad.receiveShadow = true;
    world.scene.add(pad);
  }
}

export function createStatue(world, x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 1.2, 12), world.materials.stoneDark);
  base.position.y = 0.6; base.castShadow = base.receiveShadow = true; group.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 4.4, 8), world.materials.stone);
  body.position.y = 3.4; body.castShadow = true; group.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), world.materials.stone);
  head.position.y = 5.9; head.castShadow = true; group.add(head);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 4, 32), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.65, toneMapped: false }));
  halo.position.y = 6.3; group.add(halo);
  const wingL = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.4, 4), world.materials.stone);
  wingL.position.set(-1.3, 4.2, 0); wingL.rotation.z = 0.45; wingL.castShadow = true; group.add(wingL);
  const wingR = wingL.clone(); wingR.position.x = 1.3; wingR.rotation.z = -0.45; group.add(wingR);
  world.scene.add(group);
  world.addCollider(x, y + 1.2, z, 5, 2.4, 5, 'solid');
  return group;
}
