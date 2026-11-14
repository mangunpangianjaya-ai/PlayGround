/* ============================================================
   Zone 1 — The Sunlit Meadow
   A bright starting plateau with a shallow aether pond, warm
   grass, swaying trees, a mossy boss arena and the ruins gate.
   ============================================================ */
import * as THREE from 'three';
import { MovingPlatform } from './Objects.js';
import { rand, randInt, TAU, makeRadialTexture } from '../Utils.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function buildMeadow(world) {
  const M = world.materials;
  const TOP = 0;

  /* ---------------- ground ---------------- */
  world.addGround(0, -20, 96, 76, TOP, M.grass, { depth: 11 });
  // mossy cliff chunks around the rim
  for (let i = 0; i < 22; i++) {
    const side = i % 4;
    let x = rand(-45, 45), z = rand(-56, 16);
    if (side === 0) z = -57 + rand(-1.4, 0.5);
    if (side === 1) z = 17 + rand(-0.5, 1.4);
    if (side === 2) x = -47 + rand(-1.2, 0.5);
    if (side === 3) x = 47 + rand(-0.5, 1.2);
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1.2, 3.5), 0), M.rock);
    r.position.set(x, rand(-2.2, 0.25), z);
    r.scale.y = rand(0.6, 1.2);
    r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    r.castShadow = r.receiveShadow = true;
    world.scene.add(r);
  }

  /* ---------------- stone path ---------------- */
  for (let i = 0; i < 26; i++) {
    const z = 11 - i * 2.55;
    const tile = new THREE.Mesh(new THREE.BoxGeometry(rand(2.4, 3.0), 0.09, 2.18), M.path);
    tile.position.set(rand(-0.12, 0.12), 0.055, z);
    tile.rotation.y = rand(-0.035, 0.035);
    tile.receiveShadow = true;
    world.scene.add(tile);
    if (i % 5 === 2) world.lantern(i % 2 ? 2.4 : -2.4, 0, z);
  }

  /* ---------------- spawn shrine ---------------- */
  world.statue(-5.4, 0, 12.4);
  world.addRuneCircle(V3(0, 0.02, 7), 4.4, 0xffd98a, 0.3);
  world.addCheckpoint('meadow', 0, 0, 0.02, 7, 'Dawn Shrine');

  /* ---------------- aether pond ---------------- */
  const pondX = -20, pondZ = -8, pondR = 9.2;
  world.water(pondX, 0.12, pondZ, pondR, { deep: 0x0b4148, shallow: 0x2c9b8e, bottom: 0x143a31 });
  world.lilyPads(pondX, 0.12, pondZ, pondR, 12);

  // little island + plank bridge
  world.addPlatform(pondX, 0.78, pondZ, 5.4, 1.6, 5.4, M.rock);
  const islandGrass = new THREE.Mesh(new THREE.CircleGeometry(2.55, 28), M.grassTopIsland);
  islandGrass.rotation.x = -Math.PI / 2;
  islandGrass.position.set(pondX, 0.79, pondZ);
  islandGrass.receiveShadow = true;
  world.scene.add(islandGrass);
  world.addCollider(pondX, 0.7, pondZ, 5.4, 1.4, 5.4, 'solid');
  world.tree(pondX + 0.8, 0.78, pondZ - 0.9, { scale: 0.75, palette: [0x4d8c45, 0x6fb75a, 0x3f7a42] });

  // wooden planks from the north shore
  for (let i = 0; i < 7; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.13, 0.7), M.wood);
    plank.position.set(pondX, 0.7 + i * 0.012, 0.7 - i * 0.92);
    plank.rotation.y = rand(-0.02, 0.02);
    plank.castShadow = plank.receiveShadow = true;
    world.scene.add(plank);
  }
  world.addCollider(pondX, 0.58, -2.2, 2.0, 0.34, 7.2, 'solid');
  for (const sx of [-1.05, 1.05]) {
    for (let i = 0; i < 3; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.2, 6), M.wood);
      post.position.set(pondX + sx, 1.2, 0.6 - i * 2.3);
      post.castShadow = true;
      world.scene.add(post);
    }
  }

  // floating stepping platforms over the pond
  const makeStonePlatform = (x, y, z, w, d) => {
    const mesh = world.addMesh(new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, d), M.stone));
    mesh.position.set(x, y, z);
    const plat = new MovingPlatform(world, mesh, V3(w, 0.42, d), {
      axis: V3(0, 1, 0), amplitude: 1.1, speed: 0.65, phase: rand(0, TAU), zone: 'meadow',
    });
    return { mesh, plat };
  };
  makeStonePlatform(-28.5, 1.4, -4.5, 3.2, 3.2);
  makeStonePlatform(-23.5, 2.2, -13.8, 2.8, 2.8);
  const movingBridge = world.addMesh(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.4, 2.2), M.stoneDark));
  movingBridge.position.set(-13.5, 1.6, -7.5);
  new MovingPlatform(world, movingBridge, V3(4.4, 0.4, 2.2), {
    axis: V3(1, 0, 0), amplitude: 3.4, speed: 0.45, phase: 1.2, zone: 'meadow',
  });

  /* ---------------- trees & greenery ---------------- */
  const treeSpots = [
    [-34, 8, 1.25], [-40, -14, 1.0], [-32, -30, 1.1], [37, 5, 1.15],
    [40, -20, 0.9], [31, -44, 1.05], [-38, -45, 0.85], [16, -8, 0.8],
    [12, -48, 1.25], [-13, 13, 0.9], [44, -34, 1.0], [-45, -26, 0.8],
    [22, 10, 0.95], [6, -12, 0.72],
  ];
  for (const [x, z, s] of treeSpots) {
    world.tree(x, 0, z, { scale: s, palette: [0x4d8c45, 0x5fa34e, 0x6fb75a, 0x3f7a42, 0x83c060] });
  }

  for (let i = 0; i < 14; i++) {
    const x = rand(-43, 43), z = rand(-54, 15);
    if (Math.abs(x) < 4 || Math.hypot(x - pondX, z - pondZ) < pondR + 1) continue;
    world.bush(x, 0.02, z, rand(0.7, 1.4));
  }
  for (let i = 0; i < 22; i++) {
    const x = rand(-44, 44), z = rand(-55, 16);
    if (Math.abs(x) < 3.5 || Math.hypot(x - pondX, z - pondZ) < pondR) continue;
    world.rock(x, 0, z, rand(0.35, 1.3), { collide: i < 4 });
  }
  // mushrooms and tiny flora
  for (let i = 0; i < 16; i++) {
    const x = rand(-42, 42), z = rand(-54, 14);
    if (Math.abs(x) < 3 || Math.hypot(x - pondX, z - pondZ) < pondR + 0.5) continue;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, rand(0.2, 0.45), 5), M.path);
    stem.position.y = 0.15; g.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(rand(0.13, 0.28), 8, 6, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: i % 3 ? 0xffb0c4 : 0xffd78a, roughness: 0.65, emissive: 0x3a1720, emissiveIntensity: 0.3 }));
    cap.position.y = 0.3; cap.castShadow = true; g.add(cap);
    world.scene.add(g);
  }

  /* ---------------- boss arena ---------------- */
  const arenaX = 27, arenaZ = -31;
  world.addRuneCircle(V3(arenaX, 0.03, arenaZ), 11.5, 0xffcf7e, 0.34);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.2;
    const x = arenaX + Math.cos(a) * 13.2, z = arenaZ + Math.sin(a) * 13.2;
    if (i % 2 === 0) {
      world.column(x, 0, z, { height: rand(3.4, 5.4), radius: 0.62, broken: i % 4 === 0, collide: true });
    } else {
      world.rock(x, 0, z, rand(1.4, 2.4), { collide: true });
    }
  }
  world.tree(arenaX - 12, 0, arenaZ + 2, { scale: 1.45, palette: [0x467f3f, 0x5c9f4c, 0x6fb75a] });
  for (let i = 0; i < 16; i++) {
    const a = rand(0, TAU), r = rand(2, 10.5);
    world.flowers;
    const x = arenaX + Math.cos(a) * r, z = arenaZ + Math.sin(a) * r;
    if (i < 4) world.rock(x, 0.02, z, rand(0.4, 0.8), {});
  }
  world.bossSpawns.meadow = {
    zone: 'meadow', type: 'golem', name: 'Moss Golem',
    position: V3(arenaX, 0, arenaZ), arenaRadius: 13, maxHp: 160,
  };

  /* ---------------- gate + stairway to the ruins ---------------- */
  world.addGate({ id: 'ruins_gate', zone: 'meadow', position: V3(0, 0, -55), width: 12, height: 7.4, depth: 1.0 });
  for (let i = 0; i < 7; i++) {
    const top = 0.36 * (i + 1);
    const z = -57.3 - i * 1.05;
    const w = 12.4 + i * 0.25;
    world.addPlatform(0, top, z, w, Math.max(0.6, top + 0.4), 1.15, M.stone, { cast: true });
  }
  for (const sx of [-6.4, 6.4]) {
    for (let i = 0; i < 7; i++) {
      const top = 0.36 * (i + 1);
      const z = -57.3 - i * 1.05;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.42, Math.max(0.8, top + 0.8), 1.15), M.stone);
      rail.position.set(sx, Math.max(0.8, top + 0.8) / 2 + top * 0.35, z);
      rail.castShadow = rail.receiveShadow = true;
      world.scene.add(rail);
    }
  }
  world.lantern(-5.7, 0, -52);
  world.lantern(5.7, 0, -52);

  /* ---------------- checkpoint before the gate ---------------- */
  world.addCheckpoint('meadow', 1, 0, 0.02, -46, 'Meadow Gate');

  /* ---------------- shards ---------------- */
  const gemData = [
    [10, 1.15, 1], [-11.5, 1.15, -10], [-20, 1.85, -8], [33, 1.15, -14],
    [-36, 1.3, -35], [37, 1.15, -45], [8, 4.35, -24], [-9, 1.15, -51],
  ];
  // pedestal for the high shard
  world.addPlatform(8, 3.15, -24, 3.2, 3.15, 3.2, M.rock);
  gemData.forEach((g, i) => world.addGem('meadow', i, g[0], g[1], g[2]));

  /* ---------------- enemies ---------------- */
  world.addEnemy('meadow', 'mossling', 14, 0, -18, { patrol: 5 });
  world.addEnemy('meadow', 'mossling', -27, 0, -27, { patrol: 4 });
  world.addEnemy('meadow', 'mossling', -7, 0, -39, { patrol: 6 });
  world.addEnemy('meadow', 'wisp', 19, 4.4, -16, { patrol: 6 });
  world.addEnemy('meadow', 'wisp', -32, 5, -12, { patrol: 5 });
  world.addEnemy('meadow', 'mossling', 31, 0, -47, { patrol: 4 });

  /* ---------------- grass / flowers ---------------- */
  const grass = [];
  for (let i = 0; i < 3600; i++) {
    const x = rand(-46, 46), z = rand(-56, 17);
    if (Math.abs(x) < 2.3) continue;
    if (Math.hypot(x - pondX, z - pondZ) < pondR + 0.4) continue;
    if (Math.hypot(x - arenaX, z - arenaZ) < 2.5) continue;
    grass.push({ x, y: 0.02, z, scale: 1 });
  }
  world.grass(grass);
  const flowers = [];
  for (let i = 0; i < 420; i++) {
    const x = rand(-44, 44), z = rand(-55, 16);
    if (Math.abs(x) < 2.6 || Math.hypot(x - pondX, z - pondZ) < pondR) continue;
    flowers.push({ x, y: 0.02, z });
  }
  world.flowers(flowers);

  // low mist drifting over the pond
  const mistTex = makeRadialTexture(96, 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)', 0.2);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: 0xcdf7f1, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false }));
    s.position.set(pondX + rand(-6, 6), rand(0.3, 0.8), pondZ + rand(-6, 6));
    s.scale.set(rand(8, 14), rand(2, 4), 1);
    world.scene.add(s);
  }
}
