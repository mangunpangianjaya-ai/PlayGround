/* ============================================================
   Zone 4 — The Skybound Isles
   A high archipelago above the world. Wind columns, cloud
   platforms and the final storm arena beneath a golden sky.
   ============================================================ */
import * as THREE from 'three';
import { rand, randInt, TAU, makeRadialTexture } from '../Utils.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function buildSky(world) {
  const M = world.materials;
  const SPAWN_Y = 44;
  const MAIN_Y = 47;

  /* ---------------- islands ---------------- */
  world.island(0, SPAWN_Y, -72, 28, 26, { depth: 16, hangVines: true });
  world.island(0, MAIN_Y, -112, 40, 38, { depth: 22, hangVines: true });
  world.island(-33, 46, -88, 18, 16, { depth: 13, hangVines: true });
  world.island(31, 45, -104, 16, 14, { depth: 12, hangVines: true });
  world.island(-17, 53, -134, 15, 13, { depth: 14, hangVines: true });
  world.island(27, 52, -138, 16, 14, { depth: 13, hangVines: true });
  // decorative distant isles
  world.island(-58, 39, -118, 10, 9, { depth: 10, hangVines: true });
  world.island(58, 42, -78, 11, 9, { depth: 11, hangVines: true });

  /* ---------------- bridge ---------------- */
  for (let i = 0; i < 7; i++) {
    const z = -86 - i * 1.18;
    const top = SPAWN_Y + 0.1 + i * 0.47;
    world.addPlatform(0, top, z, 5.6, Math.max(0.7, top - (SPAWN_Y - 1)), 1.25, M.stone, { cast: true });
  }
  for (const sx of [-3.0, 3.0]) {
    for (let i = 0; i < 7; i++) {
      const top = SPAWN_Y + 0.1 + i * 0.47;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.3, 6), M.gold);
      post.position.set(sx, top + 0.65, -86 - i * 1.18);
      post.castShadow = true;
      world.scene.add(post);
    }
  }
  // arch at the start of the bridge
  world.arch(0, SPAWN_Y, -85, { width: 6.2, height: 4.4, material: M.stone });

  /* ---------------- spawn & return ---------------- */
  world.addCheckpoint('sky', 0, 0, SPAWN_Y + 0.02, -78, 'Skyreach');
  world.addRuneCircle(V3(0, SPAWN_Y + 0.03, -78), 4.4, 0xffe6a2, 0.28);
  world.addPortal({
    id: 'portal_crystal_return', zone: 'sky', targetZone: 'crystal',
    position: V3(0, SPAWN_Y, -63), unlocked: true,
    colorA: 0xb48cff, colorB: 0x8ff7ec, label: 'Crystal Caverns',
  });
  // arrival statue
  world.statue(-7, SPAWN_Y, -76.5);

  /* ---------------- final arena ---------------- */
  const arenaZ = -112;
  world.addRuneCircle(V3(0, MAIN_Y + 0.04, arenaZ), 16, 0xffe09a, 0.34);
  world.addRuneCircle(V3(0, MAIN_Y + 0.05, arenaZ), 8.4, 0x9ff4ff, 0.22).group.rotation.y = 0.4;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const x = Math.cos(a) * 18.2, z = arenaZ + Math.sin(a) * 18.2;
    if (i % 2 === 0) {
      const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, rand(6, 9), 6), M.stoneDark);
      obelisk.position.set(x, MAIN_Y + 3.4, z);
      obelisk.rotation.y = rand(0, TAU);
      obelisk.castShadow = obelisk.receiveShadow = true;
      world.scene.add(obelisk);
      world.addCollider(x, MAIN_Y + 3.4, z, 2.0, 7, 2.0, 'solid');
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: 0xffe6a2, toneMapped: false }));
      cap.position.set(x, MAIN_Y + 8.2, z);
      world.scene.add(cap);
    } else {
      world.rock(x, MAIN_Y, z, rand(1.2, 2), { collide: true });
    }
  }
  world.bossSpawns.sky = {
    zone: 'sky', type: 'drake', name: 'Storm Drake',
    position: V3(0, MAIN_Y, arenaZ), arenaRadius: 17, maxHp: 420,
  };
  world.addCheckpoint('sky', 1, 0, MAIN_Y + 0.02, -96, "Storm's Edge");
  world.brazier(-8, MAIN_Y, -99, { color: 0xffd98a });
  world.brazier(8, MAIN_Y, -99, { color: 0xffd98a });

  /* ---------------- wind columns ---------------- */
  world.wind(17, MAIN_Y - 0.5, -95, 3.2, 20, { strength: 40, color: 0xd8ffff });
  world.wind(-22, SPAWN_Y, -98, 2.8, 18, { strength: 38, color: 0xd8ffff });
  world.wind(7, 47, -128, 2.4, 16, { strength: 42, color: 0xd8ffff });

  /* ---------------- cloud platforms ---------------- */
  world.cloudPlatform(-14, 45.6, -80, 6.4, 5.4, {
    moving: true, axis: V3(0, 1, 0), amplitude: 1.6, speed: 0.55, phase: 0.4, zone: 'sky',
  });
  world.cloudPlatform(-20, 47.0, -90, 5.6, 4.6, {
    moving: true, axis: V3(1, 0, 0), amplitude: 4.5, speed: 0.42, phase: 1.2, zone: 'sky',
  });
  world.cloudPlatform(22, 48.4, -93, 6, 5, {
    moving: true, axis: V3(0, 1, 0), amplitude: 2.0, speed: 0.5, phase: 2.1, zone: 'sky',
  });
  world.cloudPlatform(19, 50.0, -122, 6.2, 5.2, {
    moving: true, axis: V3(0, 0, 1), amplitude: 5, speed: 0.35, phase: 0.8, zone: 'sky',
  });

  /* ---------------- waterfalls ---------------- */
  world.waterfall(-9, SPAWN_Y, -58.9, 6.5, 30, { speed: 0.55, color: 0xcdf7ff, rotation: 0 });
  world.waterfall(10, MAIN_Y, -93.2, 8, 38, { speed: 0.42, color: 0xd8fbff, rotation: 0 });
  const mistTex = makeRadialTexture(128, 'rgba(220,255,255,0.5)', 'rgba(220,255,255,0)', 0.2);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: 0xe6ffff, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
    s.position.set(rand(-8, 12), SPAWN_Y - rand(6, 16), rand(-100, -70));
    s.scale.set(rand(8, 16), rand(3, 6), 1);
    world.scene.add(s);
  }

  /* ---------------- shards ---------------- */
  const gems = [
    [8, SPAWN_Y + 1.2, -76],
    [-33, 47.2, -88],
    [31, 46.2, -104],
    [-17, 54.2, -134],
    [27, 53.2, -138],
    [10, 50.4, -84],
    [0, SPAWN_Y + 2.5, -90],
    [14, MAIN_Y + 1.2, -120],
  ];
  gems.forEach((g, i) => world.addGem('sky', i, g[0], g[1], g[2], i % 2 ? 0xfff0b8 : 0x9ff7ff));

  /* ---------------- life ---------------- */
  for (const [x, z, y] of [[-9, -68, SPAWN_Y], [8, -79, SPAWN_Y], [-30, -90, 46], [30, -103, 45], [-18, -135, 53], [27, -139, 52]]) {
    world.tree(x, y, z, { scale: rand(0.8, 1.15), palette: [0x58a35e, 0x6ec06e, 0x87c95f, 0x4b9a6b] });
  }
  for (const [cx, cz, w, d, y, count] of [
    [0, -72, 24, 22, SPAWN_Y, 430],
    [0, -112, 36, 34, MAIN_Y, 760],
    [-33, -88, 15, 13, 46, 160],
    [31, -104, 13, 11, 45, 120],
    [-17, -134, 12, 10, 53, 140],
    [27, -138, 13, 11, 52, 140],
  ]) {
    const samples = [];
    for (let i = 0; i < count; i++) {
      const x = cx + rand(-w / 2, w / 2);
      const z = cz + rand(-d / 2, d / 2);
      samples.push({ x, y: y + 0.02, z, scale: 1 });
    }
    world.grass(samples, { palette: [0x6fbb5c, 0x86c968, 0x9fd477, 0x5ba94e] });
    const flowers = [];
    for (let i = 0; i < Math.floor(count * 0.1); i++) {
      flowers.push({ x: cx + rand(-w / 2, w / 2), y: y + 0.02, z: cz + rand(-d / 2, d / 2) });
    }
    world.flowers(flowers);
  }
  for (let i = 0; i < 6; i++) {
    world.bush(rand(-12, 12), SPAWN_Y, rand(-82, -64), rand(0.6, 1.0));
    world.bush(rand(-18, 18), MAIN_Y, rand(-128, -98), rand(0.6, 1.0));
  }
  for (let i = 0; i < 7; i++) {
    world.rock(rand(-36, 36), rand(44, 52), rand(-140, -60), rand(0.5, 1.2), { collide: false });
  }

  /* ---------------- enemies ---------------- */
  world.addEnemy('sky', 'wisp', -14, SPAWN_Y + 4, -74, { patrol: 6, variant: 'storm' });
  world.addEnemy('sky', 'wisp', 18, MAIN_Y + 5, -108, { patrol: 7, variant: 'storm' });
  world.addEnemy('sky', 'wisp', -27, 49, -94, { patrol: 5, variant: 'storm' });
  world.addEnemy('sky', 'wisp', 27, 55.5, -133, { patrol: 5, variant: 'storm' });
  world.addEnemy('sky', 'sentry', -10, MAIN_Y, -128, { variant: 'storm' });
  world.addEnemy('sky', 'sentry', 12, MAIN_Y, -99, { variant: 'storm' });
  world.addEnemy('sky', 'mossling', 27, 45, -104, { patrol: 3, variant: 'storm' });

  // extra cloud wisps for atmosphere
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: world.cloudTex, color: 0xf0ffff, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false }));
    s.position.set(rand(-40, 40), rand(38, 54), rand(-150, -50));
    s.scale.set(rand(12, 25), rand(4, 7), 1);
    world.scene.add(s);
  }
}
