// ============================================================
// IRONFANG — arenas: forest, volcano, frozen cave, hub camp
// ============================================================
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

let moteTexture = null;
function getMoteTexture() {
  if (moteTexture) return moteTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  moteTexture = new THREE.CanvasTexture(canvas);
  moteTexture.colorSpace = THREE.SRGBColorSpace;
  return moteTexture;
}

function standard(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.02, flatShading: true, ...opts });
}

const ARENAS = {
  forest: {
    name: 'Verdant Hollow', ground: 0x466d3c, ground2: 0x527a44, skyTop: 0x3e718c, skyHorizon: 0xf6bd7d, skyBottom: 0x2c3a27,
    fog: 0x9cb18a, fogDensity: 0.012, hemiSky: 0xb8d8d0, hemiGround: 0x3d4a2a, hemiIntensity: 0.85,
    sun: 0xffd4a0, sunIntensity: 1.55, sunPos: [-18, 26, 10],
    ambient: 0.2, weather: 'leaves', grassCount: 300, flowers: true,
  },
  volcano: {
    name: 'Cinder Caldera', ground: 0x3a2925, ground2: 0x48322b, skyTop: 0x1a0a0d, skyHorizon: 0xbe4a22, skyBottom: 0x140807,
    fog: 0x5f2418, fogDensity: 0.017, hemiSky: 0x8a3a28, hemiGround: 0x1c0d0b, hemiIntensity: 0.75,
    sun: 0xff9050, sunIntensity: 1.15, sunPos: [14, 20, -12],
    ambient: 0.16, weather: 'ash', grassCount: 0, lava: true,
  },
  ice: {
    name: 'Frostmaw Cavern', ground: 0xc8dce6, ground2: 0xb3cddc, skyTop: 0x0d1c36, skyHorizon: 0x6d9dc0, skyBottom: 0x0a1524,
    fog: 0x9fc0d4, fogDensity: 0.014, hemiSky: 0x9cc8ea, hemiGround: 0x3a4a58, hemiIntensity: 0.95,
    sun: 0xbfe2ff, sunIntensity: 1.2, sunPos: [-12, 24, -16],
    ambient: 0.3, weather: 'snow', grassCount: 0, ice: true,
  },
  hub: {
    name: "Hunter's Rest", ground: 0x4a6b3e, ground2: 0x567847, skyTop: 0x2c4964, skyHorizon: 0xe6a06b, skyBottom: 0x27341f,
    fog: 0x8a9a7a, fogDensity: 0.014, hemiSky: 0xb9c9d8, hemiGround: 0x3a4326, hemiIntensity: 0.7,
    sun: 0xffb075, sunIntensity: 1.2, sunPos: [-14, 18, 12],
    ambient: 0.24, weather: 'fireflies', grassCount: 220, hub: true,
  },
};

function skyDome(top, horizon, bottom) {
  const geo = new THREE.SphereGeometry(170, 24, 14);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(top) },
      horizonColor: { value: new THREE.Color(horizon) },
      bottomColor: { value: new THREE.Color(bottom) },
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
  return new THREE.Mesh(geo, mat);
}

function makeGround(cfg, radius = 38) {
  const geo = new THREE.PlaneGeometry(radius * 2.4, radius * 2.4, 26, 26);
  geo.rotateX(-Math.PI / 2);
  const colors = [];
  const c1 = new THREE.Color(cfg.ground), c2 = new THREE.Color(cfg.ground2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = Math.hypot(x, z);
    const n = Math.sin(x * 0.35) * Math.cos(z * 0.28) * 0.5 + 0.5;
    const c = c1.clone().lerp(c2, n * 0.7 + Math.random() * 0.25);
    c.multiplyScalar(0.9 + Math.random() * 0.16);
    colors.push(c.r, c.g, c.b);
    // very subtle undulation away from the fighting center, flat in the middle
    const ramp = THREE.MathUtils.smoothstep(d, 12, 34);
    pos.setY(i, (Math.sin(x * 0.5) * Math.cos(z * 0.4) * 0.28) * ramp);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function makeRock(size, color, mossColor) {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(size, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * rand(0.8, 1.2), pos.getY(i) * rand(0.65, 1.15), pos.getZ(i) * rand(0.8, 1.2));
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, standard(color));
  rock.position.y = size * 0.55;
  rock.castShadow = true; rock.receiveShadow = true;
  g.add(rock);
  if (mossColor) {
    const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.72, 0), standard(mossColor));
    moss.scale.set(1, 0.35, 1);
    moss.position.y = size * 1.03;
    g.add(moss);
  }
  return g;
}

function makeTree(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 2.2, 5), standard(0x4a3526));
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  g.add(trunk);
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const r = 1.55 - i * 0.33;
    const h = 1.9 - i * 0.25;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), standard(i % 2 ? 0x3d6a3a : 0x467b40));
    cone.position.y = 2.2 + i * 1.05;
    cone.rotation.y = i * 0.6;
    cone.castShadow = true;
    g.add(cone);
  }
  // side branch
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 1.1, 4), standard(0x4a3526));
  branch.position.set(0.5, 1.3, 0.1);
  branch.rotation.z = -0.9;
  g.add(branch);
  g.scale.setScalar(scale);
  return g;
}

function makeIceSpire(size = 1) {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(0.5 * size, 3.2 * size, 5);
  const mat = new THREE.MeshStandardMaterial({ color: 0x9fd6ec, roughness: 0.25, metalness: 0.15, flatShading: true, transparent: true, opacity: 0.92 });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 1.6 * size;
  m.rotation.z = rand(-0.12, 0.12);
  m.castShadow = true;
  g.add(m);
  const m2 = new THREE.Mesh(new THREE.ConeGeometry(0.22 * size, 1.6 * size, 4), mat.clone());
  m2.position.set(0.44 * size, 0.8 * size, 0.1);
  m2.rotation.z = 0.35;
  g.add(m2);
  return g;
}

function makeLavaPool(size) {
  const g = new THREE.Group();
  const geo = new THREE.CircleGeometry(size, 9);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff5a14, emissive: 0xff3b00, emissiveIntensity: 2.1, roughness: 0.5 });
  const pool = new THREE.Mesh(geo, mat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.04;
  g.add(pool);
  const rim = new THREE.Mesh(new THREE.RingGeometry(size * 0.95, size * 1.22, 10), standard(0x2a1c18));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.05;
  g.add(rim);
  const glow = new THREE.PointLight(0xff6a20, 6, size * 7, 2);
  glow.position.y = 1.2;
  g.add(glow);
  g.userData.pulse = mat;
  return g;
}

function makeCampfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 5), standard(0x3d2a1d));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 5) * Math.PI;
    log.position.y = 0.1;
    g.add(log);
  }
  const stone = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.11, 4, 9), standard(0x5a5a52));
  stone.rotation.x = Math.PI / 2;
  stone.position.y = 0.07;
  g.add(stone);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 - i * 0.05, 0.7, 5), flameMat.clone());
    f.position.set(rand(-0.08, 0.08), 0.42 + i * 0.08, rand(-0.08, 0.08));
    g.add(f); flames.push(f);
  }
  const light = new THREE.PointLight(0xff9a4a, 12, 16, 2);
  light.position.y = 1;
  g.add(light);
  g.userData.flames = flames;
  g.userData.light = light;
  return g;
}

export function createArena(id, scene, renderer) {
  const isHub = id === 'hub';
  const cfg = ARENAS[id] || ARENAS.forest;
  const group = new THREE.Group();
  scene.add(group);

  scene.fog = new THREE.FogExp2(cfg.fog, cfg.fogDensity);
  const sky = skyDome(cfg.skyTop, cfg.skyHorizon, cfg.skyBottom);
  group.add(sky);

  // sun / moon disc
  const sunGeo = new THREE.CircleGeometry(7, 20);
  const sunMat = new THREE.MeshBasicMaterial({ color: id === 'ice' ? 0xd7efff : 0xffd9a0, transparent: true, opacity: 0.85, fog: false, depthWrite: false });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(cfg.sunPos[0] * 5, cfg.sunPos[1] * 4.2, cfg.sunPos[2] * 5);
  sun.lookAt(0, 0, 0);
  group.add(sun);

  // lights
  const hemi = new THREE.HemisphereLight(cfg.hemiSky, cfg.hemiGround, cfg.hemiIntensity);
  group.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, cfg.ambient);
  group.add(amb);
  const sunLight = new THREE.DirectionalLight(cfg.sun, cfg.sunIntensity);
  sunLight.position.set(...cfg.sunPos);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -22;
  sunLight.shadow.camera.right = 22;
  sunLight.shadow.camera.top = 22;
  sunLight.shadow.camera.bottom = -22;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 70;
  sunLight.shadow.bias = -0.0018;
  group.add(sunLight);
  group.add(sunLight.target);

  const ground = makeGround(cfg);
  group.add(ground);

  // arena ring marking
  const ringGeo = new THREE.RingGeometry(13.2, 13.7, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: id === 'volcano' ? 0xff8a4a : id === 'ice' ? 0x8fd6f2 : 0xd9c89a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);

  const obstacles = [];
  const scenery = [];
  const dummy = new THREE.Object3D();
  const rng = (a, b) => a + Math.random() * (b - a);

  // helper to place props without blocking the start lanes
  const clearOfStarts = (x, z, r) => {
    const starts = [[0, 12], [0, -8], [0, 2]];
    return starts.every(([sx, sz]) => Math.hypot(x - sx, z - sz) > r + 4.2);
  };

  // ---------- perimeter cliffs ----------
  const cliffColor = id === 'forest' ? 0x3d4a34 : id === 'volcano' ? 0x201514 : id === 'ice' ? 0x7f9aad : 0x3a4934;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng(-0.05, 0.05);
    const dist = rng(34, 41);
    const size = rng(3.2, 6.5);
    const rock = makeRock(size, cliffColor, null);
    rock.position.set(Math.cos(a) * dist, -size * 0.25, Math.sin(a) * dist);
    rock.rotation.y = rng(0, 6);
    scenery.push(rock);
    group.add(rock);
  }

  // ---------- arena props ----------
  if (id === 'forest' || isHub) {
    const treeCount = isHub ? 10 : 17;
    for (let i = 0; i < treeCount; i++) {
      const a = rng(0, Math.PI * 2);
      const dist = rng(15, 29);
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (!clearOfStarts(x, z, 2.2)) { i--; continue; }
      const tree = makeTree(rng(0.85, 1.35));
      tree.position.set(x, 0, z);
      tree.rotation.y = rng(0, 6);
      group.add(tree);
      obstacles.push({ x, z, r: 0.7, h: 4 });
    }
    for (let i = 0; i < 9; i++) {
      const a = rng(0, Math.PI * 2);
      const dist = rng(12, 28);
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (!clearOfStarts(x, z, 1.5)) { i--; continue; }
      const size = rng(0.7, 1.8);
      const rock = makeRock(size, 0x6b7268, 0x567a45);
      rock.position.set(x, 0, z);
      rock.rotation.y = rng(0, 6);
      group.add(rock);
      obstacles.push({ x, z, r: size * 0.92, h: size });
    }
    // mushrooms / flowers dots
    const dotGeo = new THREE.SphereGeometry(0.07, 4, 3);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    for (let i = 0; i < 26; i++) {
      const a = rng(0, Math.PI * 2), dist = rng(5, 26);
      const d = new THREE.Mesh(dotGeo, Math.random() > 0.5 ? dotMat : new THREE.MeshBasicMaterial({ color: 0xb28bff }));
      d.position.set(Math.cos(a) * dist, 0.06, Math.sin(a) * dist);
      group.add(d);
    }
  } else if (id === 'volcano') {
    for (let i = 0; i < 14; i++) {
      const a = rng(0, Math.PI * 2);
      const dist = rng(14, 30);
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (!clearOfStarts(x, z, 2)) { i--; continue; }
      const size = rng(0.9, 2.6);
      const rock = makeRock(size, 0x2b1d1a, null);
      rock.position.set(x, 0, z);
      rock.rotation.y = rng(0, 6);
      group.add(rock);
      obstacles.push({ x, z, r: size * 0.9, h: size });
    }
    for (let i = 0; i < 5; i++) {
      const a = rng(0, Math.PI * 2);
      const dist = rng(16, 27);
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      const pool = makeLavaPool(rng(1.2, 2.6));
      pool.position.set(x, 0, z);
      group.add(pool);
      scenery.push(pool);
    }
    // jagged spires
    for (let i = 0; i < 8; i++) {
      const a = rng(0, Math.PI * 2), dist = rng(26, 33);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(rng(0.6, 1.4), rng(4, 8), 5), standard(0x241615));
      spike.position.set(Math.cos(a) * dist, 2, Math.sin(a) * dist);
      spike.rotation.z = rng(-0.15, 0.15);
      spike.castShadow = true;
      group.add(spike);
    }
  } else if (id === 'ice') {
    for (let i = 0; i < 16; i++) {
      const a = rng(0, Math.PI * 2);
      const dist = rng(14, 30);
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (!clearOfStarts(x, z, 2)) { i--; continue; }
      const spire = makeIceSpire(rng(0.7, 2.0));
      spire.position.set(x, 0, z);
      spire.rotation.y = rng(0, 6);
      group.add(spire);
      obstacles.push({ x, z, r: 0.7, h: 3 });
    }
    for (let i = 0; i < 8; i++) {
      const a = rng(0, Math.PI * 2);
      const dist = rng(13, 28);
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (!clearOfStarts(x, z, 1.6)) { i--; continue; }
      const size = rng(0.9, 2.2);
      const rock = makeRock(size, 0x86a4b6, 0xcfeaf5);
      rock.position.set(x, 0, z);
      rock.rotation.y = rng(0, 6);
      group.add(rock);
      obstacles.push({ x, z, r: size * 0.9, h: size });
    }
    // frozen arch
    const archMat = new THREE.MeshStandardMaterial({ color: 0xa6d8ea, roughness: 0.2, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.9 });
    for (let side = -1; side <= 1; side += 2) {
      const pillar = new THREE.Mesh(new THREE.ConeGeometry(1.1, 9, 5), archMat);
      pillar.position.set(side * 8, 4.4, -24);
      pillar.rotation.z = side * 0.14;
      group.add(pillar);
    }
  }

  // campfire for hub
  let campfire = null;
  if (isHub) {
    campfire = makeCampfire();
    campfire.position.set(3.2, 0, 9);
    group.add(campfire);
    // tent
    const tent = new THREE.Group();
    const tentMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9, flatShading: true });
    const body = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.6, 4), tentMat);
    body.position.y = 1.3;
    body.rotation.y = Math.PI / 4;
    body.castShadow = true;
    tent.add(body);
    const opening = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 3), new THREE.MeshBasicMaterial({ color: 0x1a0f08 }));
    opening.position.set(0, 0.8, 1.55);
    opening.rotation.x = 0.2;
    tent.add(opening);
    tent.position.set(-4, 0, 10);
    tent.rotation.y = 0.4;
    group.add(tent);
    // crates
    for (let i = 0; i < 3; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), standard(0x6a4a2e));
      crate.position.set(-2.4 + i * 0.8, 0.35, 7.5 + (i % 2) * 0.7);
      crate.rotation.y = rng(0, 1);
      crate.castShadow = true;
      group.add(crate);
    }
  }

  // ---------- grass ----------
  let grass = null;
  let grassData = [];
  const grassCount = cfg.grassCount || 0;
  if (grassCount > 0) {
    const bladeGeo = new THREE.PlaneGeometry(0.13, 0.75, 1, 2);
    bladeGeo.translate(0, 0.375, 0);
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0x6b9a4e, side: THREE.DoubleSide });
    grass = new THREE.InstancedMesh(bladeGeo, bladeMat, grassCount);
    grass.castShadow = false;
    grass.frustumCulled = false;
    group.add(grass);
    for (let i = 0; i < grassCount; i++) {
      const a = rng(0, Math.PI * 2), dist = rng(4.5, 31);
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      grassData.push({ x, z, phase: rng(0, 6.5), scale: rng(0.7, 1.9), rot: rng(0, 3.1) });
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, grassData[i].rot, 0);
      dummy.scale.setScalar(grassData[i].scale);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
    }
    grass.instanceMatrix.needsUpdate = true;
    const snowGrass = id === 'ice';
    if (snowGrass) bladeMat.color.set(0x9fc0b8);
  }

  // ---------- weather / ambience ----------
  const weather = { points: null, data: [], kind: cfg.weather };
  if (cfg.weather === 'ash' || cfg.weather === 'snow' || cfg.weather === 'leaves') {
    const count = id === 'volcano' ? 520 : 460;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const base = cfg.weather === 'snow' ? new THREE.Color(0xffffff) : cfg.weather === 'ash' ? new THREE.Color(0x8e8078) : new THREE.Color(0xd8b06a);
    for (let i = 0; i < count; i++) {
      const x = rng(-38, 38), y = rng(0, 26), z = rng(-38, 38);
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      weather.data.push({ vy: cfg.weather === 'snow' ? rng(0.7, 1.7) : cfg.weather === 'ash' ? rng(0.35, 0.9) : rng(0.4, 1.1), drift: rng(0.2, 0.9), phase: rng(0, 6.5), size: rng(0.5, 1.2) });
      const c = base.clone().offsetHSL(0, 0, rng(-0.12, 0.12));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: cfg.weather === 'snow' ? 0.16 : cfg.weather === 'ash' ? 0.12 : 0.14,
      vertexColors: true, transparent: true, opacity: cfg.weather === 'snow' ? 0.85 : 0.7,
      map: getMoteTexture(), alphaTest: 0.02,
      depthWrite: false, blending: cfg.weather === 'ash' ? THREE.NormalBlending : THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);
    weather.points = pts;
    weather.arr = arr;
  }

  // fireflies
  let fireflies = null, fireflyBase = null;
  if (cfg.weather === 'fireflies' || id === 'forest') {
    const count = isHub ? 42 : 26;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    fireflyBase = [];
    for (let i = 0; i < count; i++) {
      const a = rng(0, Math.PI * 2), d = rng(6, 26);
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = rng(0.7, 3.4);
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      fireflyBase.push({ x, y, z, phase: rng(0, 6.5), amp: rng(0.4, 1.4) });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color: 0xd8ff9a, size: 0.14, map: getMoteTexture(), alphaTest: 0.02, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    fireflies = new THREE.Points(geo, mat);
    fireflies.frustumCulled = false;
    group.add(fireflies);
  }

  // embers for volcano
  let embers = null;
  let emberData = [];
  if (id === 'volcano') {
    const count = 130;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rng(0, Math.PI * 2), d = rng(4, 30);
      arr[i * 3] = Math.cos(a) * d; arr[i * 3 + 1] = rng(0, 6); arr[i * 3 + 2] = Math.sin(a) * d;
      emberData.push({ vy: rng(0.6, 1.8), phase: rng(0, 6.5), drift: rng(-0.4, 0.4) });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff7a2a, size: 0.12, map: getMoteTexture(), alphaTest: 0.02, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    embers = new THREE.Points(geo, mat);
    embers.frustumCulled = false;
    group.add(embers);
    emberData = { list: emberData, arr };
  }

  const grassDummy = new THREE.Object3D();
  let t = 0;

  const api = {
    id, cfg, group, obstacles, bounds: 31,
    playerStart: new THREE.Vector3(0, 0, 12),
    monsterStart: new THREE.Vector3(0, 0, -8),
    hubPlayer: new THREE.Vector3(0, 0, 2),
    name: cfg.name,
    update(dt, elapsed, camPos) {
      t = elapsed;
      if (grass) {
        for (let i = 0; i < grassData.length; i++) {
          const d = grassData[i];
          const sway = Math.sin(t * 1.7 + d.phase) * 0.16 + Math.sin(t * 0.7 + d.phase * 0.6) * 0.08;
          grassDummy.position.set(d.x, 0, d.z);
          grassDummy.rotation.set(sway * 0.6, d.rot, sway);
          grassDummy.scale.set(d.scale, d.scale, d.scale);
          grassDummy.updateMatrix();
          grass.setMatrixAt(i, grassDummy.matrix);
        }
        grass.instanceMatrix.needsUpdate = true;
      }
      if (weather.points) {
        const arr = weather.arr;
        const cx = camPos ? camPos.x : 0, cz = camPos ? camPos.z : 0;
        for (let i = 0; i < weather.data.length; i++) {
          const d = weather.data[i];
          let y = arr[i * 3 + 1] - d.vy * dt;
          let x = arr[i * 3] + Math.sin(t * 0.8 + d.phase) * d.drift * dt;
          let z = arr[i * 3 + 2] + Math.cos(t * 0.6 + d.phase) * d.drift * dt * 0.5;
          if (y < 0.05) { y = 24; x = cx + rng(-34, 34); z = cz + rng(-34, 34); }
          if (Math.abs(x - cx) > 40) x = cx + Math.sign(cx - x) * 38;
          if (Math.abs(z - cz) > 40) z = cz + Math.sign(cz - z) * 38;
          arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
        }
        weather.points.geometry.attributes.position.needsUpdate = true;
      }
      if (fireflies) {
        const arr = fireflies.geometry.attributes.position.array;
        for (let i = 0; i < fireflyBase.length; i++) {
          const b = fireflyBase[i];
          arr[i * 3] = b.x + Math.sin(t * 0.5 + b.phase) * b.amp;
          arr[i * 3 + 1] = b.y + Math.sin(t * 0.9 + b.phase * 1.7) * 0.35;
          arr[i * 3 + 2] = b.z + Math.cos(t * 0.6 + b.phase) * b.amp;
        }
        fireflies.geometry.attributes.position.needsUpdate = true;
        fireflies.material.opacity = 0.7 + Math.sin(t * 2.2) * 0.2;
      }
      if (embers) {
        const arr = emberData.arr;
        for (let i = 0; i < emberData.list.length; i++) {
          const d = emberData.list[i];
          let y = arr[i * 3 + 1] + d.vy * dt;
          arr[i * 3] += Math.sin(t * 1.2 + d.phase) * 0.22 * dt + d.drift * dt;
          arr[i * 3 + 2] += Math.cos(t + d.phase) * 0.18 * dt;
          if (y > 9) { y = 0.2; }
          arr[i * 3 + 1] = y;
        }
        embers.geometry.attributes.position.needsUpdate = true;
      }
      for (const s of scenery) {
        if (s.userData.pulse) {
          const p = 1.8 + Math.sin(t * 2.4 + s.position.x) * 0.55;
          s.userData.pulse.emissiveIntensity = p;
        }
      }
      if (campfire) {
        campfire.userData.flames.forEach((f, i) => {
          f.scale.setScalar(0.9 + Math.sin(t * 8 + i * 2) * 0.12);
          f.position.y = 0.4 + i * 0.08 + Math.sin(t * 6 + i) * 0.03;
        });
        if (campfire.userData.light) campfire.userData.light.intensity = 10 + Math.sin(t * 7.3) * 2.2;
      }
      // gentle light drift
      sunLight.position.x = cfg.sunPos[0] + Math.sin(t * 0.04) * 2;
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
  return api;
}
