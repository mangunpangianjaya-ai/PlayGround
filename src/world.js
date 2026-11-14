// ============================================================
// IRONFANG — seamless open world: Forest frontier
// Terrain chunks, LOD, culling, prop pooling, landmarks, camp,
// dynamic day/night cycle and streamed ambience.
// ============================================================
import * as THREE from 'three';

const HALF = 160;
const SIZE = HALF * 2;
const CHUNK = 80;
const GRID = SIZE / CHUNK; // 4 x 4
const WATER_LEVEL = -0.35;
const CAMP_Y = 1.0;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------
// deterministic noise
// ------------------------------------------------------------
function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < 4; i++) {
    sum += noise2(x * freq, y * freq) * amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------
// terrain shape
// ------------------------------------------------------------
export function riverCenterX(z) {
  return 17 + Math.sin(z * 0.017 + 0.6) * 22 + Math.sin(z * 0.043) * 7;
}
function riverHalfWidth(z) {
  return 10 + Math.sin(z * 0.09) * 1.6;
}
const BRIDGE_X = riverCenterX(0);
const BRIDGE_HALF = 14;
const BRIDGE_Y = 1.55;
function onBridge(x, z) {
  return Math.abs(z) < 2.8 && x > BRIDGE_X - BRIDGE_HALF && x < BRIDGE_X + BRIDGE_HALF;
}

const LAIRS = [
  { x: -78, z: 62, y: 2.4 },
  { x: 72, z: -58, y: 2.1 },
  { x: -48, z: -95, y: 2.6 },
];

export function heightAt(x, z) {
  let h = 1.6 + fbm(x * 0.012, z * 0.012) * 7.4 + fbm(x * 0.045 + 11.3, z * 0.045 - 7.1) * 1.7;

  // long ridges
  h += Math.max(0, fbm(x * 0.008 - 20, z * 0.008 + 15) - 0.53) * 24;
  h += smoothstep(0.54, 0.74, fbm(x * 0.016 - 31, z * 0.016 + 17)) * 8;

  // base camp clearing
  const campD = Math.hypot(x, z);
  const campW = 1 - smoothstep(15, 29, campD);
  h = lerp(h, CAMP_Y, campW);

  // old ruins plateau
  const ruinD = Math.hypot(x - 70, z - 52);
  h = lerp(h, 4.4, 1 - smoothstep(10, 24, ruinD));

  // cave hill
  const caveD = Math.hypot(x + 74, z + 80);
  h += Math.exp(-(caveD * caveD) / (24 * 24)) * 11;

  // combat clearings so every lair is always reachable
  for (const l of LAIRS) {
    h = lerp(h, l.y, 1 - smoothstep(10, 25, Math.hypot(x - l.x, z - l.z)));
  }

  // river gorge carved after clearings
  const rd = Math.abs(x - riverCenterX(z));
  const bw = riverHalfWidth(z);
  const valley = 1 - smoothstep(bw, bw + 13, rd);
  h = lerp(h, -1.9, valley);

  // mountain rim
  const r = Math.hypot(x, z);
  h += smoothstep(122, 158, r) * 34;

  // bridge deck sits above the river
  if (onBridge(x, z)) h = Math.max(h, BRIDGE_Y);
  return h;
}

export function isWater(x, z) {
  if (onBridge(x, z)) return false;
  const rd = Math.abs(x - riverCenterX(z));
  return rd < riverHalfWidth(z) + 1.5 && heightAt(x, z) < WATER_LEVEL + 0.45;
}

function slopeAt(x, z) {
  const h = heightAt(x, z);
  return Math.max(
    Math.abs(heightAt(x + 1.4, z) - h),
    Math.abs(heightAt(x - 1.4, z) - h),
    Math.abs(heightAt(x, z + 1.4) - h),
    Math.abs(heightAt(x, z - 1.4) - h)
  );
}

function isWalkable(x, z) {
  if (Math.hypot(x, z) > 146) return false;
  if (heightAt(x, z) > 17) return false;
  return slopeAt(x, z) < 1.9;
}

// Gameplay-safe traversal test: the river blocks movement except on the
// bridge, and the mountain rim is out of bounds. Slopes are steep but
// passable so the hunter can climb the frontier foothills.
function canTraverse(x, z) {
  if (Math.hypot(x, z) > 144) return false;
  if (isWater(x, z)) return false;
  if (heightAt(x, z) > 16.5) return false;
  return true;
}

// ------------------------------------------------------------
// tiny procedural textures
// ------------------------------------------------------------
let moteTex = null;
function getMoteTexture() {
  if (moteTex) return moteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  moteTex = new THREE.CanvasTexture(c);
  moteTex.colorSpace = THREE.SRGBColorSpace;
  return moteTex;
}

// ------------------------------------------------------------
// shared prop materials / geometry
// ------------------------------------------------------------
const M = {
  trunk: new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.95, flatShading: true }),
  leafA: new THREE.MeshStandardMaterial({ color: 0x3d6a3a, roughness: 0.95, flatShading: true }),
  leafB: new THREE.MeshStandardMaterial({ color: 0x4d7b41, roughness: 0.95, flatShading: true }),
  leafC: new THREE.MeshStandardMaterial({ color: 0x2f5634, roughness: 0.95, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: 0x6b7268, roughness: 0.98, flatShading: true }),
  moss: new THREE.MeshStandardMaterial({ color: 0x567a45, roughness: 1, flatShading: true }),
  bush: new THREE.MeshStandardMaterial({ color: 0x49703c, roughness: 1, flatShading: true }),
  berry: new THREE.MeshStandardMaterial({ color: 0xb2543a, roughness: 0.8, flatShading: true }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8a8b7d, roughness: 0.97, flatShading: true }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x615f55, roughness: 0.98, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 0.92, flatShading: true }),
  cloth: new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.95, flatShading: true }),
  iron: new THREE.MeshStandardMaterial({ color: 0x596267, roughness: 0.4, metalness: 0.7, flatShading: true }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc9a04e, roughness: 0.35, metalness: 0.55, flatShading: true }),
  ice: new THREE.MeshStandardMaterial({ color: 0xa9e0f2, roughness: 0.18, metalness: 0.12, transparent: true, opacity: 0.9, flatShading: true }),
  obsidian: new THREE.MeshStandardMaterial({ color: 0x241a1d, roughness: 0.55, flatShading: true }),
  dark: new THREE.MeshBasicMaterial({ color: 0x090b0c }),
};

const G = {
  trunk: new THREE.CylinderGeometry(0.18, 0.3, 2.2, 5),
  trunkLo: new THREE.CylinderGeometry(0.2, 0.32, 2.2, 4),
  cone: new THREE.ConeGeometry(1, 1, 7),
  coneLo: new THREE.ConeGeometry(1, 1, 5),
  branch: new THREE.CylinderGeometry(0.07, 0.11, 1.1, 4),
  rock: new THREE.IcosahedronGeometry(1, 0),
  bush: new THREE.IcosahedronGeometry(1, 0),
  sphere: new THREE.IcosahedronGeometry(1, 0),
};

// ------------------------------------------------------------
// object pool: streamed vegetation and rocks
// ------------------------------------------------------------
class PropPool {
  constructor() {
    this.pools = new Map();
    this.created = 0;
  }
  _bucket(type) {
    if (!this.pools.has(type)) this.pools.set(type, []);
    return this.pools.get(type);
  }
  acquire(type) {
    const b = this._bucket(type);
    if (b.length) return b.pop();
    this.created++;
    return this._build(type);
  }
  release(type, obj) {
    obj.parent?.remove(obj);
    obj.visible = true;
    this._bucket(type).push(obj);
  }
  _build(type) {
    const g = new THREE.Group();
    if (type === 'treeHi') {
      const trunk = new THREE.Mesh(G.trunk, M.trunk);
      trunk.position.y = 1.1;
      trunk.castShadow = true;
      g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const r = 1.55 - i * 0.32;
        const h = 1.9 - i * 0.22;
        const cone = new THREE.Mesh(G.cone, i % 2 ? M.leafA : M.leafB);
        cone.scale.set(r, h, r);
        cone.position.y = 2.2 + i * 1.02;
        cone.rotation.y = i * 0.6;
        cone.castShadow = true;
        g.add(cone);
      }
      const branch = new THREE.Mesh(G.branch, M.trunk);
      branch.position.set(0.52, 1.3, 0.1);
      branch.rotation.z = -0.9;
      g.add(branch);
      const moss = new THREE.Mesh(G.sphere, M.moss);
      moss.scale.set(0.32, 0.16, 0.32);
      moss.position.set(0.34, 1.62, 0.28);
      g.add(moss);
    } else if (type === 'treeLo') {
      const trunk = new THREE.Mesh(G.trunkLo, M.trunk);
      trunk.position.y = 1.1;
      g.add(trunk);
      const cone = new THREE.Mesh(G.coneLo, M.leafA);
      cone.scale.set(1.55, 3.3, 1.55);
      cone.position.y = 3.4;
      g.add(cone);
    } else if (type === 'rockHi') {
      const r = new THREE.Mesh(G.rock, M.rock);
      r.scale.set(1, 0.72, 1.08);
      r.position.y = 0.62;
      r.castShadow = true;
      r.receiveShadow = true;
      g.add(r);
      const r2 = new THREE.Mesh(G.rock, M.stoneDark);
      r2.scale.set(0.55, 0.42, 0.6);
      r2.position.set(0.62, 0.35, 0.32);
      g.add(r2);
      const moss = new THREE.Mesh(G.rock, M.moss);
      moss.scale.set(0.8, 0.24, 0.72);
      moss.position.y = 1.02;
      g.add(moss);
    } else if (type === 'rockLo') {
      const r = new THREE.Mesh(G.rock, M.rock);
      r.scale.set(1.05, 0.72, 1.15);
      r.position.y = 0.6;
      g.add(r);
    } else if (type === 'bushHi') {
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(G.bush, i % 2 ? M.bush : M.leafC);
        b.scale.set(0.55 + i * 0.08, 0.42, 0.5 + i * 0.06);
        b.position.set((i - 1) * 0.42, 0.35 + i * 0.06, (i % 2) * 0.28);
        g.add(b);
      }
      for (let i = 0; i < 3; i++) {
        const berry = new THREE.Mesh(new THREE.SphereGeometry(0.055, 4, 3), M.berry);
        berry.position.set((i - 1) * 0.38, 0.48 + (i % 2) * 0.12, 0.34);
        g.add(berry);
      }
    } else if (type === 'bushLo') {
      const b = new THREE.Mesh(G.bush, M.bush);
      b.scale.set(0.85, 0.5, 0.8);
      b.position.y = 0.38;
      g.add(b);
    }
    return g;
  }
}

// ------------------------------------------------------------
// world
// ------------------------------------------------------------
export function createWorld(scene, renderer) {
  const group = new THREE.Group();
  group.name = 'open-world';
  scene.add(group);

  const markerGroup = new THREE.Group();
  group.add(markerGroup);

  // ---------- sky / lights ----------
  scene.fog = new THREE.FogExp2(0x9cb18a, 0.0072);
  scene.background = new THREE.Color(0x8fb0a0);

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3e718c) },
      horizonColor: { value: new THREE.Color(0xf6bd7d) },
      bottomColor: { value: new THREE.Color(0x2c3a27) },
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor; varying vec3 vPos;
      void main(){
        float h = normalize(vPos).y;
        vec3 c = mix(horizonColor, topColor, smoothstep(0.0, 0.65, h));
        c = mix(bottomColor, c, smoothstep(-0.25, 0.04, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 14), skyMat);
  sky.frustumCulled = false;
  group.add(sky);

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getMoteTexture(), color: 0xffe2ab, transparent: true, opacity: 0.95,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  sunSprite.scale.setScalar(38);
  group.add(sunSprite);

  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getMoteTexture(), color: 0xcfe4ff, transparent: true, opacity: 0.8,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  moonSprite.scale.setScalar(22);
  group.add(moonSprite);

  // stars
  const starGeo = new THREE.BufferGeometry();
  const starArr = new Float32Array(900);
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = 0.12 + Math.random() * 0.88;
    const r = Math.sqrt(1 - y * y);
    starArr[i * 3] = Math.cos(a) * r * 355;
    starArr[i * 3 + 1] = y * 355;
    starArr[i * 3 + 2] = Math.sin(a) * r * 355;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starArr, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xdfe9ff, size: 1.6, map: getMoteTexture(), alphaTest: 0.02,
    transparent: true, opacity: 0, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  stars.frustumCulled = false;
  group.add(stars);

  const hemi = new THREE.HemisphereLight(0xb8d8d0, 0x3d4a2a, 0.85);
  group.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  group.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xffd4a0, 1.55);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -34;
  sunLight.shadow.camera.right = 34;
  sunLight.shadow.camera.top = 34;
  sunLight.shadow.camera.bottom = -34;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 160;
  sunLight.shadow.bias = -0.0018;
  group.add(sunLight);
  group.add(sunLight.target);

  // ---------- static world geometry ----------
  const staticGroup = new THREE.Group();
  group.add(staticGroup);

  // river water ribbon
  const waterSegments = 96;
  const waterVerts = [];
  const waterUvs = [];
  const waterIdx = [];
  for (let i = 0; i <= waterSegments; i++) {
    const z = -HALF + (i / waterSegments) * SIZE;
    const cx = riverCenterX(z);
    const w = riverHalfWidth(z) + 1.4;
    waterVerts.push(cx - w, WATER_LEVEL, z, cx + w, WATER_LEVEL, z);
    waterUvs.push(0, i / 8, 1, i / 8);
    if (i < waterSegments) {
      const a = i * 2;
      waterIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const waterGeo = new THREE.BufferGeometry();
  waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterVerts, 3));
  waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(waterUvs, 2));
  waterGeo.setIndex(waterIdx);
  waterGeo.computeVertexNormals();
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x39768a, roughness: 0.18, metalness: 0.3,
    transparent: true, opacity: 0.82, side: THREE.DoubleSide,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.receiveShadow = true;
  water.renderOrder = 1;
  staticGroup.add(water);

  // river foam dashes
  const foamGeo = new THREE.BufferGeometry();
  const foamArr = new Float32Array(180 * 3);
  const foamData = [];
  for (let i = 0; i < 180; i++) {
    const z = -HALF + Math.random() * SIZE;
    const cx = riverCenterX(z);
    const w = (Math.random() - 0.5) * riverHalfWidth(z) * 1.7;
    foamArr[i * 3] = cx + w;
    foamArr[i * 3 + 1] = WATER_LEVEL + 0.03;
    foamArr[i * 3 + 2] = z;
    foamData.push({ z, w, speed: 1.2 + Math.random() * 2.2, phase: Math.random() * 10 });
  }
  foamGeo.setAttribute('position', new THREE.BufferAttribute(foamArr, 3));
  const foam = new THREE.Points(foamGeo, new THREE.PointsMaterial({
    color: 0xd6f2f0, size: 0.16, map: getMoteTexture(), alphaTest: 0.02,
    transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  foam.frustumCulled = false;
  staticGroup.add(foam);

  // bridge
  const bridge = new THREE.Group();
  const bx = BRIDGE_X;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(BRIDGE_HALF * 2 + 6, 0.22, 5.4), M.wood);
  deck.position.set(bx, BRIDGE_Y - 0.12, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  bridge.add(deck);
  for (let i = -7; i <= 7; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 5.7), i % 2 ? M.wood : M.cloth);
    plank.position.set(bx + i * 1.9, BRIDGE_Y + 0.01, 0);
    bridge.add(plank);
  }
  for (const s of [-1, 1]) {
    for (let i = -3; i <= 3; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.15, 0.2), M.wood);
      post.position.set(bx + i * 4.2, BRIDGE_Y + 0.5, s * 2.65);
      post.castShadow = true;
      bridge.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(BRIDGE_HALF * 2 + 1, 0.14, 0.16), M.wood);
    rail.position.set(bx, BRIDGE_Y + 1.0, s * 2.65);
    bridge.add(rail);
  }
  staticGroup.add(bridge);

  // boundary cliffs
  const cliffMat = new THREE.MeshStandardMaterial({ color: 0x4a5142, roughness: 0.99, flatShading: true });
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + Math.random() * 0.06;
    const r = 139 + Math.random() * 15;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const size = 6 + Math.random() * 10;
    const rock = new THREE.Mesh(G.rock, cliffMat);
    rock.scale.set(size * (0.7 + Math.random() * 0.6), size * (0.9 + Math.random() * 0.9), size * (0.7 + Math.random() * 0.6));
    rock.position.set(x, heightAt(x, z) - size * 0.3, z);
    rock.rotation.y = Math.random() * 6;
    rock.castShadow = true;
    rock.receiveShadow = true;
    staticGroup.add(rock);
  }

  // ---------- camp ----------
  const stationDefs = [
    { id: 'quests', label: 'Quest Board', x: -9, z: -8, color: 0xffd98a, screen: 'quests', icon: 'board' },
    { id: 'smith', label: 'Blacksmith', x: 11, z: -7, color: 0xff9a5a, screen: 'smith', icon: 'anvil' },
    { id: 'items', label: 'Item Box', x: 10, z: 7, color: 0x9fc7ff, screen: 'items', icon: 'box' },
    { id: 'bed', label: 'Bed · Skip to dawn', x: -10, z: 8, color: 0xb28bff, screen: null, icon: 'bed' },
  ];
  const stations = [];
  const animated = { markers: [], flames: [], lights: [], glows: [] };

  for (const s of stationDefs) {
    s.y = heightAt(s.x, s.z);
    s.pos = new THREE.Vector3(s.x, s.y, s.z);
    stations.push(s);
  }

  const camp = new THREE.Group();
  staticGroup.add(camp);
  const campY = heightAt(0, 0);

  const dirt = new THREE.Mesh(new THREE.CircleGeometry(21, 36), new THREE.MeshStandardMaterial({ color: 0x6c5a3e, roughness: 1, transparent: true, opacity: 0.9 }));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = campY + 0.025;
  dirt.receiveShadow = true;
  camp.add(dirt);

  // central campfire
  const firePos = new THREE.Vector3(0, campY, 1.5);
  const campfire = makeCampfire();
  campfire.position.copy(firePos);
  camp.add(campfire);
  animated.flames.push(...campfire.userData.flames);
  animated.lights.push(campfire.userData.light);

  // tent
  const tent = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.0, 4), M.cloth);
  body.position.y = 1.5;
  body.rotation.y = Math.PI / 4;
  body.castShadow = true;
  tent.add(body);
  const opening = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.8, 3), new THREE.MeshBasicMaterial({ color: 0x1a0f08 }));
  opening.position.set(0, 0.9, 1.75);
  opening.rotation.x = 0.2;
  tent.add(opening);
  tent.position.set(-15, campY, 12);
  tent.rotation.y = 0.5;
  camp.add(tent);

  // quest board
  const qb = makeQuestBoard();
  qb.position.set(-9, heightAt(-9, -8), -8);
  qb.rotation.y = 0.5;
  camp.add(qb);

  // blacksmith forge
  const smith = makeForge();
  smith.position.set(11, heightAt(11, -7), -7);
  smith.rotation.y = -0.7;
  camp.add(smith);
  animated.flames.push(...smith.userData.flames);
  animated.lights.push(smith.userData.light);

  // item chest
  const chest = makeChest();
  chest.position.set(10, heightAt(10, 7), 7);
  chest.rotation.y = -0.45;
  camp.add(chest);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.3), M.wood);
  box.position.set(12.1, heightAt(12.1, 8.1) + 0.6, 8.1);
  box.rotation.y = 0.3;
  box.castShadow = true;
  camp.add(box);

  // bed
  const bed = makeBed();
  bed.position.set(-10, heightAt(-10, 8), 8);
  bed.rotation.y = 0.25;
  camp.add(bed);

  // crates and logs
  for (let i = 0; i < 4; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), M.wood);
    const a = 2.4 + i * 0.8;
    crate.position.set(Math.cos(a) * 14, heightAt(Math.cos(a) * 14, Math.sin(a) * 14) + 0.38, Math.sin(a) * 14);
    crate.rotation.y = i;
    crate.castShadow = true;
    camp.add(crate);
  }

  // station beacons
  for (const s of stations) {
    const mat = new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), mat);
    gem.position.set(s.x, s.y + 3.15, s.z);
    gem.userData.baseY = s.y + 3.15;
    gem.userData.phase = Math.random() * 6;
    markerGroup.add(gem);
    animated.markers.push(gem);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.14, 2.6, 5, 1, true),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.position.set(s.x, s.y + 1.65, s.z);
    markerGroup.add(beam);
  }

  // ---------- old ruins ----------
  const ruins = makeRuins();
  ruins.position.set(70, heightAt(70, 52), 52);
  staticGroup.add(ruins);
  const ruinObstacles = [
    { x: 70, z: 52, r: 2.2 },
    { x: 62, z: 45, r: 1.0 }, { x: 78, z: 45, r: 1.0 },
    { x: 62, z: 59, r: 1.0 }, { x: 78, z: 59, r: 1.0 },
    { x: 70, z: 42, r: 1.0 }, { x: 70, z: 62, r: 1.0 },
  ];

  // ---------- cave entrance ----------
  const cavePos = new THREE.Vector3(-74, heightAt(-74, -80), -80);
  const cave = makeCave();
  cave.position.copy(cavePos);
  cave.rotation.y = 0.16;
  staticGroup.add(cave);
  const caveObstacles = [
    { x: -74, z: -80, r: 3.4 },
    { x: -68, z: -75, r: 1.7 },
    { x: -80, z: -77, r: 1.8 },
  ];

  // ---------- quest lair dressing ----------
  const lairObstacles = [];
  const forestLair = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const x = LAIRS[0].x + Math.cos(a) * 9;
    const z = LAIRS[0].z + Math.sin(a) * 9;
    const stone = new THREE.Mesh(G.rock, M.stoneDark);
    stone.scale.set(1.4, 2.2 + (i % 2) * 0.8, 1.2);
    stone.position.set(x, heightAt(x, z) + 1.0, z);
    stone.rotation.y = i;
    stone.castShadow = true;
    forestLair.add(stone);
    lairObstacles.push({ x, z, r: 1.4 });
  }
  staticGroup.add(forestLair);

  const fireLair = new THREE.Group();
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(15, 28), new THREE.MeshStandardMaterial({ color: 0x3a2820, roughness: 1, transparent: true, opacity: 0.9 }));
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.set(72, heightAt(72, -58) + 0.06, -58);
  fireLair.add(scorch);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const x = 72 + Math.cos(a) * (6 + (i % 3) * 2);
    const z = -58 + Math.sin(a) * (6 + (i % 3) * 2);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.5 + (i % 3) * 0.18, 2.6 + (i % 2) * 1.6, 5), M.obsidian);
    spike.position.set(x, heightAt(x, z) + 1.2, z);
    spike.rotation.z = (i % 2 ? -1 : 1) * 0.18;
    spike.castShadow = true;
    fireLair.add(spike);
    lairObstacles.push({ x, z, r: 0.8 });
  }
  const emberGlow = new THREE.PointLight(0xff6a20, 3, 26, 2);
  emberGlow.position.set(72, heightAt(72, -58) + 2.2, -58);
  fireLair.add(emberGlow);
  animated.lights.push(emberGlow);
  staticGroup.add(fireLair);

  const iceLair = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.35;
    const x = -48 + Math.cos(a) * (5 + (i % 4) * 2.3);
    const z = -95 + Math.sin(a) * (5 + (i % 4) * 2.3);
    const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.38 + (i % 3) * 0.18, 1.8 + (i % 4) * 0.8, 5), M.ice);
    crystal.position.set(x, heightAt(x, z) + 0.9, z);
    crystal.rotation.z = (i % 2 ? -1 : 1) * 0.16;
    crystal.castShadow = true;
    iceLair.add(crystal);
    lairObstacles.push({ x, z, r: 0.65 });
  }
  const frost = new THREE.Mesh(new THREE.CircleGeometry(13, 28), new THREE.MeshStandardMaterial({ color: 0xa9c8cf, roughness: 0.8, transparent: true, opacity: 0.38 }));
  frost.rotation.x = -Math.PI / 2;
  frost.position.set(-48, heightAt(-48, -95) + 0.05, -95);
  iceLair.add(frost);
  staticGroup.add(iceLair);

  // ---------- weather ----------
  const leafCount = 190;
  const leafGeo = new THREE.BufferGeometry();
  const leafArr = new Float32Array(leafCount * 3);
  const leafCol = new Float32Array(leafCount * 3);
  const leafData = [];
  const leafBase = new THREE.Color(0xd8b06a);
  for (let i = 0; i < leafCount; i++) {
    leafArr[i * 3] = (Math.random() - 0.5) * 150;
    leafArr[i * 3 + 1] = Math.random() * 24;
    leafArr[i * 3 + 2] = (Math.random() - 0.5) * 150;
    const c = leafBase.clone().offsetHSL(Math.random() * 0.08 - 0.04, 0, Math.random() * 0.25 - 0.12);
    leafCol[i * 3] = c.r; leafCol[i * 3 + 1] = c.g; leafCol[i * 3 + 2] = c.b;
    leafData.push({ vy: 0.4 + Math.random() * 0.9, drift: 0.2 + Math.random() * 0.8, phase: Math.random() * 6.5 });
  }
  leafGeo.setAttribute('position', new THREE.BufferAttribute(leafArr, 3));
  leafGeo.setAttribute('color', new THREE.BufferAttribute(leafCol, 3));
  const leaves = new THREE.Points(leafGeo, new THREE.PointsMaterial({
    size: 0.15, vertexColors: true, transparent: true, opacity: 0.8,
    map: getMoteTexture(), alphaTest: 0.02, depthWrite: false,
    blending: THREE.NormalBlending, sizeAttenuation: true,
  }));
  leaves.frustumCulled = false;
  group.add(leaves);

  const flyCount = 64;
  const flyGeo = new THREE.BufferGeometry();
  const flyArr = new Float32Array(flyCount * 3);
  const flyBase = [];
  for (let i = 0; i < flyCount; i++) {
    flyBase.push({ x: (Math.random() - 0.5) * 110, y: 0.5 + Math.random() * 3.2, z: (Math.random() - 0.5) * 110, phase: Math.random() * 6.5, amp: 0.3 + Math.random() });
  }
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyArr, 3));
  const fireflies = new THREE.Points(flyGeo, new THREE.PointsMaterial({
    color: 0xd8ff9a, size: 0.18, map: getMoteTexture(), alphaTest: 0.02,
    transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  fireflies.frustumCulled = false;
  group.add(fireflies);

  // ---------- state ----------
  const pool = new PropPool();
  const chunks = new Map();
  const activeChunkKeys = new Set();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0, flatShading: true });
  const staticObstacles = [
    ...ruinObstacles,
    ...caveObstacles,
    ...lairObstacles,
    { x: 0, z: 1.5, r: 1.0 },
    { x: -15, z: 12, r: 2.6 },
    { x: -9, z: -8, r: 1.1 },
    { x: 11, z: -7, r: 2.0 },
    { x: 10, z: 7, r: 1.2 },
    { x: -10, z: 8, r: 1.4 },
    { x: BRIDGE_X, z: 0, r: 0.1 },
  ];
  const obstacles = [...staticObstacles];
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  const chunkSphere = new THREE.Sphere(new THREE.Vector3(), CHUNK * 0.78);
  let streamTimer = 0;
  let lastActive = '';
  let chunkBuilds = 0;

  let hours = 8.25;
  let dayCount = 1;
  let clockPhase = 'DAY';
  const sunDir = new THREE.Vector3(0, 1, 0);
  const moonDir = new THREE.Vector3(0, -1, 0);
  const colorTmp = new THREE.Color();
  const nightTop = new THREE.Color(0x050a18);
  const nightHorizon = new THREE.Color(0x151d38);
  const nightBottom = new THREE.Color(0x04070d);
  const dayTop = new THREE.Color(0x3e718c);
  const dayHorizon = new THREE.Color(0xf6bd7d);
  const dayBottom = new THREE.Color(0x2c3a27);
  const duskColor = new THREE.Color(0xff8a52);
  const waterDay = new THREE.Color(0x39768a);
  const waterNight = new THREE.Color(0x10263c);

  const markers = [
    { id: 'camp', label: 'Base Camp', x: 0, z: 0, kind: 'camp', color: '#e8b45a' },
    { id: 'quests', label: 'Quest Board', x: -9, z: -8, kind: 'quest', color: '#ffd98a' },
    { id: 'smith', label: 'Blacksmith', x: 11, z: -7, kind: 'forge', color: '#ff9a5a' },
    { id: 'items', label: 'Item Box', x: 10, z: 7, kind: 'item', color: '#9fc7ff' },
    { id: 'bed', label: 'Bed', x: -10, z: 8, kind: 'bed', color: '#b28bff' },
    { id: 'bridge', label: 'River Bridge', x: BRIDGE_X, z: 0, kind: 'bridge', color: '#9fc7ff' },
    { id: 'ruins', label: 'Old Ruins', x: 70, z: 52, kind: 'ruins', color: '#d8cfae' },
    { id: 'cave', label: 'Cave Mouth', x: -74, z: -80, kind: 'cave', color: '#8fd0e8' },
    { id: 'lair-forest', label: 'Verdant Hollow', x: LAIRS[0].x, z: LAIRS[0].z, kind: 'lair', color: '#6fbf6a', quest: 'forest' },
    { id: 'lair-fire', label: 'Cinder Scar', x: LAIRS[1].x, z: LAIRS[1].z, kind: 'lair', color: '#ff8a3d', quest: 'volcano' },
    { id: 'lair-ice', label: 'Frostmaw Mouth', x: LAIRS[2].x, z: LAIRS[2].z, kind: 'lair', color: '#8fd0e8', quest: 'ice' },
  ];

  const questSpawns = {
    forest: {
      region: 'Verdant Hollow',
      player: { x: -67, z: 75 },
      monster: { x: -84, z: 52 },
    },
    volcano: {
      region: 'Cinder Scar',
      player: { x: 60, z: -44 },
      monster: { x: 82, z: -65 },
    },
    ice: {
      region: 'Frostmaw Mouth',
      player: { x: -37, z: -82 },
      monster: { x: -57, z: -101 },
    },
  };

  // ------------------------------------------------------------
  // terrain colouring
  // ------------------------------------------------------------
  const cGreen = new THREE.Color(0x4a6b38);
  const cGreen2 = new THREE.Color(0x6e8f4a);
  const cMud = new THREE.Color(0x6a5a3c);
  const cRock = new THREE.Color(0x77796c);
  const cCinder = new THREE.Color(0x5a3a2c);
  const cIce = new THREE.Color(0x8fa8a8);
  const cDirt = new THREE.Color(0x6c5a3e);
  const cStone = new THREE.Color(0x77756a);
  function terrainColor(x, z, h, out) {
    const n = fbm(x * 0.08 + 3, z * 0.08 - 7);
    out.copy(cGreen).lerp(cGreen2, n * 0.8);
    const rd = Math.abs(x - riverCenterX(z));
    if (rd < riverHalfWidth(z) + 5 && h < WATER_LEVEL + 1.6) out.lerp(cMud, 0.7);
    if (h > 8) out.lerp(cRock, smoothstep(8, 17, h));
    const cinder = smoothstep(42, 62, x) * (1 - smoothstep(-35, -78, z));
    if (cinder > 0) out.lerp(cCinder, cinder * 0.7);
    const ice = (1 - smoothstep(-38, -64, x)) * (1 - smoothstep(-45, -75, z));
    if (ice > 0) out.lerp(cIce, ice * 0.5);
    const campD = Math.hypot(x, z);
    if (campD < 23) out.lerp(cDirt, (1 - smoothstep(14, 23, campD)) * 0.8);
    const ruinD = Math.hypot(x - 70, z - 52);
    if (ruinD < 20) out.lerp(cStone, (1 - smoothstep(8, 20, ruinD)) * 0.65);
    const l = 0.92 + n * 0.16;
    out.multiplyScalar(l);
    return out;
  }

  // ------------------------------------------------------------
  // chunk building
  // ------------------------------------------------------------
  function chunkCenter(cx, cz) {
    return new THREE.Vector3(-HALF + CHUNK * (cx + 0.5), 0, -HALF + CHUNK * (cz + 0.5));
  }

  function buildTerrain(cx, cz, low) {
    const center = chunkCenter(cx, cz);
    const seg = low ? 5 : 20;
    const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const wx = center.x + pos.getX(i);
      const wz = center.z + pos.getZ(i);
      const y = heightAt(wx, wz) - (low ? 0.04 : 0);
      pos.setY(i, y);
      terrainColor(wx, wz, y, col);
      colors.push(col.r, col.g, col.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, terrainMat);
    mesh.position.set(center.x, 0, center.z);
    // geometry vertices are local to the chunk center
    mesh.geometry.translate(0, 0, 0);
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    return mesh;
  }

  function canPlace(x, z, r) {
    if (Math.hypot(x, z) > 138) return false;
    if (Math.hypot(x, z) < 29) return false;
    if (Math.abs(x - riverCenterX(z)) < riverHalfWidth(z) + 4) return false;
    if (Math.hypot(x - 70, z - 52) < 23) return false;
    if (Math.hypot(x + 74, z + 80) < 22) return false;
    for (const l of LAIRS) if (Math.hypot(x - l.x, z - l.z) < 18) return false;
    if (onBridge(x, z)) return false;
    if (!isWalkable(x, z)) return false;
    if (slopeAt(x, z) > 1.25) return false;
    return true;
  }

  function buildChunkProps(cx, cz, chunkGroup, hiGroup, loGroup, chunkData) {
    const center = chunkCenter(cx, cz);
    const rng = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x9e3779b9);
    const plan = [
      ['tree', 18, 0.075], ['rock', 7, 0.09], ['bush', 11, 0.045],
    ];
    for (const [kind, count, rBase] of plan) {
      for (let i = 0; i < count; i++) {
        const x = center.x + (rng() - 0.5) * (CHUNK - 6);
        const z = center.z + (rng() - 0.5) * (CHUNK - 6);
        const scale = kind === 'tree' ? 0.78 + rng() * 0.75 : kind === 'rock' ? 0.55 + rng() * 1.25 : 0.7 + rng() * 0.8;
        const r = rBase * scale * (kind === 'tree' ? 6.2 : kind === 'rock' ? 8.4 : 3.6);
        if (!canPlace(x, z, r)) continue;
        const y = heightAt(x, z);
        const hi = pool.acquire(kind === 'tree' ? 'treeHi' : kind === 'rock' ? 'rockHi' : 'bushHi');
        const lo = pool.acquire(kind === 'tree' ? 'treeLo' : kind === 'rock' ? 'rockLo' : 'bushLo');
        for (const [obj, target] of [[hi, hiGroup], [lo, loGroup]]) {
          obj.position.set(x, y, z);
          obj.rotation.y = rng() * 6.28;
          obj.scale.setScalar(scale);
          target.add(obj);
        }
        chunkData.props.push({ kind, hi, lo });
        if (kind === 'tree') chunkData.obstacles.push({ x, z, r: 0.42 * scale + 0.35 });
        else if (kind === 'rock') chunkData.obstacles.push({ x, z, r: 0.8 * scale + 0.2 });
      }
    }
  }

  function loadChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (chunks.has(key)) return chunks.get(key);
    chunkBuilds++;
    const center = chunkCenter(cx, cz);
    const chunkGroup = new THREE.Group();
    chunkGroup.name = `chunk-${key}`;
    const hiGroup = new THREE.Group();
    const loGroup = new THREE.Group();
    chunkGroup.add(hiGroup, loGroup);

    const hiTerrain = buildTerrain(cx, cz, false);
    const loTerrain = buildTerrain(cx, cz, true);
    hiGroup.add(hiTerrain);
    loGroup.add(loTerrain);

    const data = { key, cx, cz, center, group: chunkGroup, hiGroup, loGroup, props: [], obstacles: [] };
    buildChunkProps(cx, cz, chunkGroup, hiGroup, loGroup, data);
    group.add(chunkGroup);
    chunks.set(key, data);
    return data;
  }

  function unloadChunk(key) {
    const c = chunks.get(key);
    if (!c) return;
    activeChunkKeys.delete(key);
    group.remove(c.group);
    for (const p of c.props) {
      pool.release(p.kind === 'tree' ? 'treeHi' : p.kind === 'rock' ? 'rockHi' : 'bushHi', p.hi);
      pool.release(p.kind === 'tree' ? 'treeLo' : p.kind === 'rock' ? 'rockLo' : 'bushLo', p.lo);
    }
    c.hiGroup.traverse((o) => { if (o.geometry && o !== c.hiGroup) o.geometry.dispose(); });
    c.loGroup.traverse((o) => { if (o.geometry && o !== c.loGroup) o.geometry.dispose(); });
    chunks.delete(key);
  }

  function updateStreaming(playerPos, camera) {
    const pcx = clamp(Math.floor((playerPos.x + HALF) / CHUNK), 0, GRID - 1);
    const pcz = clamp(Math.floor((playerPos.z + HALF) / CHUNK), 0, GRID - 1);
    const wanted = new Set();
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        if (cx < 0 || cx >= GRID || cz < 0 || cz >= GRID) continue;
        const key = `${cx},${cz}`;
        wanted.add(key);
        if (!chunks.has(key)) loadChunk(cx, cz);
        activeChunkKeys.add(key);
      }
    }
    const active = [...chunks.keys()];
    for (const key of active) {
      if (!wanted.has(key)) {
        unloadChunk(key);
        continue;
      }
      const c = chunks.get(key);
      const dist = Math.hypot(c.center.x - playerPos.x, c.center.z - playerPos.z);
      chunkSphere.center.set(c.center.x, heightAt(c.center.x, c.center.z) + 2, c.center.z);
      const inFrustum = frustum.intersectsSphere(chunkSphere);
      c.group.visible = inFrustum && dist < 230;
      const high = dist < 82;
      c.hiGroup.visible = high;
      c.loGroup.visible = !high;
    }

    const wantedKey = [...wanted].sort().join('|');
    if (wantedKey !== lastActive) {
      lastActive = wantedKey;
      obstacles.length = 0;
      obstacles.push(...staticObstacles);
      for (const key of wanted) {
        const c = chunks.get(key);
        if (c) obstacles.push(...c.obstacles);
      }
    }
  }

  // ------------------------------------------------------------
  // update: day/night + ambient
  // ------------------------------------------------------------
  function updateDayNight(dt, playerPos, camera) {
    hours = (hours + dt * (24 / 600)) % 24;
    const a = ((hours - 6) / 24) * Math.PI * 2;
    sunDir.set(Math.cos(a), Math.sin(a), 0.32).normalize();
    moonDir.copy(sunDir).multiplyScalar(-1);

    const day = smoothstep(-0.08, 0.26, sunDir.y);
    const dusk = 1 - smoothstep(0.05, 0.42, Math.abs(sunDir.y));
    const horizon = colorTmp.copy(nightHorizon).lerp(dayHorizon, day).lerp(duskColor, dusk * 0.65);
    skyMat.uniforms.topColor.value.copy(nightTop).lerp(dayTop, day);
    skyMat.uniforms.horizonColor.value.copy(horizon);
    skyMat.uniforms.bottomColor.value.copy(nightBottom).lerp(dayBottom, day);

    scene.fog.color.copy(horizon).multiplyScalar(day > 0.35 ? 0.86 : 0.42);
    scene.fog.density = 0.0062 + (1 - day) * 0.0018;
    renderer.setClearColor(scene.fog.color, 1);

    hemi.color.copy(new THREE.Color(0x8098c8)).lerp(new THREE.Color(0xb8d8d0), day);
    hemi.groundColor.copy(new THREE.Color(0x1b2118)).lerp(new THREE.Color(0x3d4a2a), day);
    hemi.intensity = 0.26 + day * 0.62;
    ambient.intensity = 0.08 + day * 0.14;

    const lightDir = day > 0.08 ? sunDir : moonDir;
    sunLight.position.set(playerPos.x + lightDir.x * 65, playerPos.y + lightDir.y * 65 + 18, playerPos.z + lightDir.z * 65);
    sunLight.target.position.set(playerPos.x, playerPos.y, playerPos.z);
    sunLight.target.updateMatrixWorld();
    sunLight.color.set(0xffc28a).lerp(new THREE.Color(0xaec4e8), 1 - day);
    sunLight.intensity = 0.2 + day * 1.8;

    // sky follows the camera; sun/moon/star discs follow too
    sky.position.copy(camera.position);
    sunSprite.position.copy(camera.position).addScaledVector(sunDir, 330);
    moonSprite.position.copy(camera.position).addScaledVector(moonDir, 330);
    stars.position.copy(camera.position);
    sunSprite.material.opacity = 0.85 * smoothstep(-0.18, 0.06, sunDir.y);
    moonSprite.material.opacity = 0.72 * smoothstep(-0.12, 0.1, moonDir.y);
    stars.material.opacity = (1 - day) * 0.9;

    waterMat.color.copy(waterNight).lerp(waterDay, day);
    waterMat.opacity = 0.7 + day * 0.14;
    foam.material.opacity = 0.24 + day * 0.3;

    clockPhase = hours >= 5.5 && hours < 7 ? 'DAWN' : hours >= 7 && hours < 17.5 ? 'DAY' : hours >= 17.5 && hours < 19.5 ? 'DUSK' : 'NIGHT';
    if (hours < 0.05) dayCount++;
  }

  function updateAmbient(dt, elapsed, playerPos) {
    // water flow
    const pa = foam.geometry.attributes.position.array;
    for (let i = 0; i < foamData.length; i++) {
      const d = foamData[i];
      let z = d.z + d.speed * dt;
      if (z > HALF) z = -HALF;
      d.z = z;
      pa[i * 3] = riverCenterX(z) + d.w + Math.sin(elapsed * 0.9 + d.phase) * 0.6;
      pa[i * 3 + 1] = WATER_LEVEL + 0.03;
      pa[i * 3 + 2] = z;
    }
    foam.geometry.attributes.position.needsUpdate = true;

    // leaves drift around the player
    const la = leaves.geometry.attributes.position.array;
    const px = playerPos?.x || 0, pz = playerPos?.z || 0;
    for (let i = 0; i < leafData.length; i++) {
      const d = leafData[i];
      let x = la[i * 3] + Math.sin(elapsed * 0.8 + d.phase) * d.drift * dt;
      let z = la[i * 3 + 2] + Math.cos(elapsed * 0.55 + d.phase) * d.drift * dt * 0.5;
      let y = la[i * 3 + 1] - d.vy * dt;
      if (y < 0.2) {
        y = 18 + Math.random() * 8;
        x = px + (Math.random() - 0.5) * 120;
        z = pz + (Math.random() - 0.5) * 120;
      }
      if (Math.abs(x - px) > 78) x = px + Math.sign(px - x) * 76;
      if (Math.abs(z - pz) > 78) z = pz + Math.sign(pz - z) * 76;
      la[i * 3] = x; la[i * 3 + 1] = y; la[i * 3 + 2] = z;
    }
    leaves.geometry.attributes.position.needsUpdate = true;

    // fireflies at dusk/night
    const fa = fireflies.geometry.attributes.position.array;
    for (let i = 0; i < flyBase.length; i++) {
      const b = flyBase[i];
      fa[i * 3] = px + b.x + Math.sin(elapsed * 0.4 + b.phase) * b.amp;
      fa[i * 3 + 1] = heightAt(px + b.x, pz + b.z) + b.y + Math.sin(elapsed * 0.8 + b.phase * 1.7) * 0.3;
      fa[i * 3 + 2] = pz + b.z + Math.cos(elapsed * 0.5 + b.phase) * b.amp;
    }
    fireflies.geometry.attributes.position.needsUpdate = true;
    fireflies.material.opacity = 0.15 + Math.max(0, 1 - smoothstep(0.35, 0.8, sunDir.y)) * 0.8;

    for (const f of animated.flames) {
      f.scale.setScalar(0.88 + Math.sin(elapsed * 8 + f.position.x * 3) * 0.14);
      f.position.y += Math.sin(elapsed * 6 + f.position.z) * 0.002;
    }
    for (const l of animated.lights) {
      if (l.isPointLight) l.intensity = (l.userData.baseIntensity || 8) * (0.85 + Math.sin(elapsed * 7.3 + l.position.x) * 0.15);
    }
    for (const g of animated.markers) {
      g.position.y = g.userData.baseY + Math.sin(elapsed * 1.8 + g.userData.phase) * 0.16;
      g.rotation.y += dt * 0.9;
      g.material.opacity = 0.55 + Math.sin(elapsed * 2.4 + g.userData.phase) * 0.22;
    }
    // glow light intensity baseline
    for (const l of animated.lights) {
      if (!l.userData.baseIntensity) l.userData.baseIntensity = l.intensity;
    }
  }

  // ------------------------------------------------------------
  // public API
  // ------------------------------------------------------------
  const api = {
    id: 'world',
    name: 'Verdant Frontier',
    scene,
    group,
    bounds: 146,
    stations,
    markers,
    questSpawns,
    obstacles,
    staticObstacles,
    heightAt,
    isWater,
    isWalkable,
    canTraverse,
    hubPlayer: new THREE.Vector3(0, heightAt(0, 7), 7),
    playerStart: new THREE.Vector3(0, heightAt(0, 7), 7),
    monsterStart: new THREE.Vector3(LAIRS[0].x, heightAt(LAIRS[0].x, LAIRS[0].z), LAIRS[0].z),
    get hours() { return hours; },
    get dayCount() { return dayCount; },
    get phase() { return clockPhase; },
    get activeChunks() { return activeChunkKeys.size; },
    get stats() {
      let hiProps = 0;
      for (const k of activeChunkKeys) {
        const c = chunks.get(k);
        if (c) hiProps += c.props.length;
      }
      return {
        chunks: activeChunkKeys.size,
        cachedChunks: chunks.size,
        chunkBuilds,
        hiProps,
        pooled: [...pool.pools.values()].reduce((a, b) => a + b.length, 0),
        poolCreated: pool.created,
        obstacles: obstacles.length,
        clock: api.clock(),
      };
    },
    clock() {
      const h = Math.floor(hours);
      const m = Math.floor((hours % 1) * 60);
      return {
        text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        phase: clockPhase,
        hours,
      };
    },
    skipToMorning() {
      hours = 6.4;
      dayCount++;
      return api.clock();
    },
    nearestStation(pos, maxDist = 3.5) {
      let best = null, bestD = maxDist;
      for (const s of stations) {
        const d = Math.hypot(pos.x - s.x, pos.z - s.z);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    },
    spawnFor(questId) {
      const spawn = questSpawns[questId] || questSpawns.forest;
      const p = spawn.player;
      const m = spawn.monster;
      return {
        region: spawn.region,
        player: new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z),
        monster: new THREE.Vector3(m.x, heightAt(m.x, m.z), m.z),
      };
    },
    // Force a streaming + lighting refresh when teleporting between regions.
    focus(pos, camera) {
      const at = pos || api.hubPlayer;
      if (camera && camera.updateMatrixWorld) {
        camera.updateMatrixWorld();
        projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreen);
      }
      updateStreaming(at, camera);
      updateDayNight(0, at, camera || { position: new THREE.Vector3(0, 8, 18) });
    },
    update(dt, elapsed, playerPos, camera) {
      const pos = playerPos || api.hubPlayer;
      if (camera && camera.updateMatrixWorld) {
        camera.updateMatrixWorld();
        projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreen);
      }
      streamTimer -= dt;
      if (streamTimer <= 0) {
        streamTimer = 0.22;
        updateStreaming(pos, camera);
      }
      updateDayNight(dt, pos, camera);
      updateAmbient(dt, elapsed, pos);
    },
    dispose() {
      scene.remove(group);
      scene.fog = null;
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    },
  };

  // initial build so the title screen is already inside the world
  updateStreaming(api.hubPlayer, null);
  updateDayNight(0, api.hubPlayer, { position: new THREE.Vector3(0, 8, 18) });
  return api;
}

// ------------------------------------------------------------
// static props
// ------------------------------------------------------------
function makeCampfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 5), M.trunk);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 5) * Math.PI;
    log.position.y = 0.1;
    g.add(log);
  }
  const stone = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.11, 4, 9), M.stone);
  stone.rotation.x = Math.PI / 2;
  stone.position.y = 0.07;
  g.add(stone);
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 - i * 0.05, 0.7, 5), new THREE.MeshBasicMaterial({
      color: 0xff9a3c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    f.position.set((Math.random() - 0.5) * 0.16, 0.42 + i * 0.08, (Math.random() - 0.5) * 0.16);
    g.add(f);
    flames.push(f);
  }
  const light = new THREE.PointLight(0xff9a4a, 12, 18, 2);
  light.position.y = 1;
  light.userData.baseIntensity = 12;
  g.add(light);
  g.userData.flames = flames;
  g.userData.light = light;
  return g;
}

function makeQuestBoard() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.1, 0.16), M.wood);
    post.position.set(s * 1.1, 1.05, 0);
    post.castShadow = true;
    g.add(post);
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.45, 0.12), M.wood);
  board.position.y = 1.7;
  board.castShadow = true;
  g.add(board);
  for (let i = 0; i < 3; i++) {
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.78), new THREE.MeshStandardMaterial({ color: 0xe6dcc0, roughness: 1 }));
    paper.position.set((i - 1) * 0.75, 1.72, 0.075);
    paper.rotation.z = (i - 1) * 0.08;
    g.add(paper);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.85, 0.65, 4), M.cloth);
  roof.position.y = 2.6;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  return g;
}

function makeForge() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 2.6), M.stoneDark);
  base.position.y = 0.25;
  base.receiveShadow = true;
  g.add(base);
  const anvil = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.32, 0.55), M.iron);
  top.position.y = 0.9;
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.6, 6), M.iron);
  waist.position.y = 0.55;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.5), M.iron);
  foot.position.y = 0.26;
  anvil.add(top, waist, foot);
  anvil.position.set(0.9, 0, 0.6);
  g.add(anvil);
  const forge = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.4), M.stoneDark);
  forge.position.set(-0.7, 0.75, -0.4);
  forge.castShadow = true;
  g.add(forge);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.65), new THREE.MeshBasicMaterial({ color: 0xff7a22 }));
  mouth.position.set(-0.7, 0.8, 0.31);
  g.add(mouth);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.4, 0.65), M.stone);
  chimney.position.set(-1.1, 2.0, -0.7);
  chimney.castShadow = true;
  g.add(chimney);
  const flames = [];
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 - i * 0.04, 0.6, 4), new THREE.MeshBasicMaterial({
      color: 0xffb04a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    f.position.set(-0.7, 1.25 + i * 0.08, 0.25);
    g.add(f);
    flames.push(f);
  }
  const light = new THREE.PointLight(0xff8a3a, 7, 14, 2);
  light.position.set(-0.6, 1.6, 0.2);
  light.userData.baseIntensity = 7;
  g.add(light);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), M.wood);
  sign.position.set(1.9, 0.75, -1.0);
  g.add(sign);
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.1), M.wood);
  signBoard.position.set(1.9, 1.6, -1.0);
  g.add(signBoard);
  g.userData.flames = flames;
  g.userData.light = light;
  return g;
}

function makeChest() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), M.wood);
  body.position.y = 0.35;
  body.castShadow = true;
  g.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.22, 8, 1, false, 0, Math.PI), M.wood);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.7;
  g.add(lid);
  for (const s of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.74, 0.84), M.gold);
    band.position.set(s * 0.4, 0.38, 0);
    g.add(band);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.1), M.gold);
  lock.position.set(0, 0.55, 0.44);
  g.add(lock);
  return g;
}

function makeBed() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.22, 3.1), M.wood);
  frame.position.y = 0.55;
  frame.castShadow = true;
  g.add(frame);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.14), M.wood);
      leg.position.set(sx * 0.96, 0.26, sz * 1.36);
      g.add(leg);
    }
  }
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.28, 2.75), new THREE.MeshStandardMaterial({ color: 0xd6c8a2, roughness: 1, flatShading: true }));
  mattress.position.y = 0.76;
  g.add(mattress);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 1.5), new THREE.MeshStandardMaterial({ color: 0x4f7a68, roughness: 1, flatShading: true }));
  blanket.position.set(0, 0.92, 0.45);
  g.add(blanket);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.55), new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 1 }));
  pillow.position.set(0, 0.93, -1.08);
  g.add(pillow);
  // canopy
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), M.wood);
      post.position.set(sx * 1.25, 1.1, sz * 1.6);
      g.add(post);
    }
  }
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 4), new THREE.MeshStandardMaterial({ color: 0x365b70, roughness: 0.95, flatShading: true }));
  canopy.position.y = 2.55;
  canopy.rotation.y = Math.PI / 4;
  g.add(canopy);
  return g;
}

function makeRuins() {
  const g = new THREE.Group();
  const ring = 10.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * ring;
    const z = Math.sin(a) * ring;
    const broken = i % 3 === 1;
    const h = broken ? 2.2 + (i % 2) : 5.2;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.8, h, 6), i % 2 ? M.stone : M.stoneDark);
    pillar.position.set(x, h / 2, z);
    pillar.rotation.z = broken ? (i % 2 ? 0.18 : -0.14) : 0;
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    g.add(pillar);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 1.5), M.stone);
    cap.position.set(x, h + 0.16, z);
    g.add(cap);
  }
  const altar = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.0, 2.0), M.stoneDark);
  altar.position.y = 0.5;
  altar.castShadow = true;
  g.add(altar);
  const rune = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.65, 6), new THREE.MeshBasicMaterial({
    color: 0x8fe6d2, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  rune.rotation.x = -Math.PI / 2;
  rune.position.y = 1.02;
  g.add(rune);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.28, 4.5, 6, 1, true), new THREE.MeshBasicMaterial({
    color: 0x8fe6d2, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  beam.position.y = 3.2;
  g.add(beam);
  return g;
}

function makeCave() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 0), M.stoneDark);
    pillar.scale.set(1.2, 2.0, 1.3);
    pillar.position.set(s * 3.6, 2.4, 0.4);
    pillar.rotation.z = s * 0.16;
    pillar.castShadow = true;
    g.add(pillar);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.85, 5, 9, Math.PI), M.stoneDark);
  arch.position.y = 3.1;
  arch.rotation.z = Math.PI;
  arch.rotation.x = 0.05;
  arch.castShadow = true;
  g.add(arch);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(3.3, 18, 0, Math.PI), M.dark);
  mouth.position.set(0, 3.15, 0.75);
  mouth.rotation.z = Math.PI;
  g.add(mouth);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), M.dark);
  inner.position.set(0, 1.2, 0.76);
  g.add(inner);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.22 + (i % 2) * 0.12, 1.3 + (i % 3) * 0.5, 4), M.ice);
    crystal.position.set(Math.cos(a) * 4.6, 0.75, Math.sin(a) * 2.3 + 1);
    crystal.rotation.z = Math.cos(a) * 0.2;
    g.add(crystal);
  }
  const mist = new THREE.PointLight(0x6fd8ff, 3.5, 20, 2);
  mist.position.set(0, 2.4, 3.0);
  g.add(mist);
  return g;
}
