/* ============================================================
   Zone 2 — The Ancient Ruins
   A sun-bleached plateau of broken colonnades, floating stone
   and a rune portal that leads down into the crystal caverns.
   ============================================================ */
import * as THREE from 'three';
import { MovingPlatform, RuneCircle } from './Objects.js';
import { rand, randInt, TAU, makeRadialTexture } from '../Utils.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function buildRuins(world) {
  const M = world.materials;
  const TOP = 2.4;

  /* ---------------- plateau ---------------- */
  world.addGround(0, -96, 76, 68, TOP, M.stone, { depth: 13, rockMaterial: M.rock, segments: 3 });
  // mossy patches to break up the stone
  const mossMat = new THREE.MeshStandardMaterial({
    map: world._tex(world.tex.grass, 4), normalMap: world._tex(world.tex.normal, 4),
    roughness: 0.95, metalness: 0, color: 0xa8c47a, transparent: true, opacity: 0.75,
  });
  for (let i = 0; i < 12; i++) {
    const r = rand(1.4, 4.2);
    const moss = new THREE.Mesh(new THREE.CircleGeometry(r, 14), mossMat);
    moss.rotation.x = -Math.PI / 2;
    moss.position.set(rand(-35, 35), TOP + 0.014, rand(-128, -64));
    moss.receiveShadow = true;
    world.scene.add(moss);
  }
  // broken rim stones
  for (let i = 0; i < 26; i++) {
    const side = i % 4;
    let x = rand(-37, 37), z = rand(-129, -63);
    if (side === 0) z = -129 + rand(-0.5, 1);
    if (side === 1) z = -63 + rand(-1, 0.5);
    if (side === 2) x = -37 + rand(-0.5, 1);
    if (side === 3) x = 37 + rand(-1, 0.5);
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1, 2.6), 0), M.rock);
    r.position.set(x, TOP + rand(-1.2, 0.3), z);
    r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    r.castShadow = r.receiveShadow = true;
    world.scene.add(r);
  }

  /* ---------------- threshold & colonnade ---------------- */
  world.addCheckpoint('ruins', 0, 0, TOP + 0.02, -66, 'Ruins Threshold');
  world.addRuneCircle(V3(0, TOP + 0.03, -66), 4.2, 0xffd28a, 0.25);
  world.arch(0, TOP, -74, { width: 9, height: 5.4 });

  for (let i = 0; i < 5; i++) {
    const z = -74 - i * 9.5;
    const broken = i % 3 === 0;
    world.column(-22 + rand(-0.6, 0.6), TOP, z, { height: broken ? rand(2.4, 4.2) : 6.4, radius: 0.62, broken, collide: true });
    world.column(22 + rand(-0.6, 0.6), TOP, z + rand(-1.5, 1.5), { height: broken ? rand(3, 5) : 6.4, radius: 0.62, broken: !broken, collide: true });
  }
  world.wall(-31, TOP, -86, { width: 9, height: 4.5, depth: 0.9 });
  world.wall(30, TOP, -108, { width: 10, height: 3.2, depth: 0.9 });
  world.wall(-29, TOP, -116, { width: 7, height: 5, depth: 1.0 });
  world.arch(0, TOP, -88, { width: 12, height: 6.2 });
  world.wall(17, TOP, -70, { width: 6, height: 2.4, depth: 0.8 });
  world.wall(-17, TOP, -120, { width: 8, height: 3.2, depth: 0.8 });

  // fallen columns and rubble
  for (let i = 0; i < 10; i++) {
    const x = rand(-33, 33), z = rand(-126, -68);
    if (Math.hypot(x, z + 102) < 15) continue;
    world.rock(x, TOP, z, rand(0.4, 1.4), { collide: i < 3 });
  }
  for (let i = 0; i < 5; i++) {
    const x = rand(-28, 28), z = rand(-120, -70);
    const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, rand(3, 6), 10), M.stone);
    fallen.rotation.z = Math.PI / 2;
    fallen.rotation.y = rand(0, TAU);
    fallen.position.set(x, TOP + 0.5, z);
    fallen.castShadow = fallen.receiveShadow = true;
    world.scene.add(fallen);
  }

  // braziers along the processional way
  for (const [x, z] of [[-5.4, -70], [5.4, -70], [-6, -90], [6, -90], [-5.5, -114], [5.5, -114]]) {
    world.brazier(x, TOP, z);
  }

  /* ---------------- boss arena ---------------- */
  const arenaX = 0, arenaZ = -102;
  world.addRuneCircle(V3(arenaX, TOP + 0.04, arenaZ), 13.5, 0xffc96e, 0.32);
  const inner = world.addRuneCircle(V3(arenaX, TOP + 0.05, arenaZ), 7, 0x8ff7ec, 0.22);
  inner.group.scale.setScalar(1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const x = arenaX + Math.cos(a) * 16, z = arenaZ + Math.sin(a) * 16;
    if (i % 2 === 0) world.column(x, TOP, z, { height: rand(5.2, 7.4), radius: 0.7, broken: false, collide: true });
    else world.rock(x, TOP, z, rand(1.2, 2.4), { collide: true });
  }
  // levitating rune stones
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.5), M.stoneDark);
    stone.position.set(arenaX + Math.cos(a) * 19, TOP + 5 + rand(-1, 1), arenaZ + Math.sin(a) * 19);
    stone.rotation.y = -a;
    stone.castShadow = true;
    world.scene.add(stone);
    const rune = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 4, 16, Math.PI * 1.5), new THREE.MeshBasicMaterial({ color: 0x8ff7ec, transparent: true, opacity: 0.55, toneMapped: false }));
    rune.position.copy(stone.position).add(V3(0, 0, 0.3));
    world.scene.add(rune);
  }
  world.bossSpawns.ruins = {
    zone: 'ruins', type: 'sentinel', name: 'Rune Sentinel',
    position: V3(arenaX, TOP, arenaZ), arenaRadius: 15, maxHp: 220,
  };
  world.addCheckpoint('ruins', 1, 0, TOP + 0.02, -91, 'Sunken Court');

  /* ---------------- platforming route ---------------- */
  // west tower
  world.column(-25, TOP, -78, { height: 3.0, radius: 1.0, broken: true, collide: true });
  world.addPlatform(-25, 5.4, -78, 5.2, 0.9, 5.2, M.stone);
  world.addPlatform(-25, 8.2, -79, 3.4, 0.8, 3.4, M.stoneDark);
  const westLift = world.addMesh(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 3.2), M.stone));
  westLift.position.set(-19.5, 3.0, -78);
  new MovingPlatform(world, westLift, V3(3.2, 0.45, 3.2), {
    axis: V3(0, 1, 0), amplitude: 2.2, speed: 0.6, phase: 0.4, zone: 'ruins',
  });
  // east tower
  world.column(25, TOP, -88, { height: 4.2, radius: 1.1, broken: true, collide: true });
  world.addPlatform(25, 5.0, -88, 5.4, 0.9, 5.4, M.stone);
  world.addPlatform(25, 8.5, -88, 3.6, 0.8, 3.6, M.stoneDark);
  const eastLift = world.addMesh(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 3.2), M.stoneDark));
  eastLift.position.set(19, 2.8, -88);
  new MovingPlatform(world, eastLift, V3(3.2, 0.45, 3.2), {
    axis: V3(0, 1, 0), amplitude: 2.4, speed: 0.52, phase: 2.1, zone: 'ruins',
  });
  // centre moving slab above the courtyard
  const slab = world.addMesh(new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 3.2), M.stone));
  slab.position.set(0, 7, -114);
  new MovingPlatform(world, slab, V3(4.6, 0.5, 3.2), {
    axis: V3(0, 0, 1), amplitude: 5.5, speed: 0.33, phase: 0.7, zone: 'ruins',
  });
  world.addPlatform(-12, 9.4, -122, 4.2, 0.8, 4.2, M.stoneDark);

  // spike hazards
  const makeSpikes = (x, z, w, d) => {
    const group = new THREE.Group();
    group.position.set(x, TOP, z);
    for (let i = 0; i < Math.max(3, Math.floor(w * d * 0.8)); i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(rand(0.12, 0.24), rand(0.4, 0.9), 5), M.darkMetal);
      spike.position.set(rand(-w / 2, w / 2), rand(0.2, 0.45), rand(-d / 2, d / 2));
      spike.rotation.set(rand(-0.2, 0.2), rand(0, TAU), rand(-0.2, 0.2));
      spike.castShadow = true;
      group.add(spike);
    }
    const stain = new THREE.Mesh(new THREE.CircleGeometry(w * 0.7, 16), new THREE.MeshBasicMaterial({ color: 0x1c2a2a, transparent: true, opacity: 0.45 }));
    stain.rotation.x = -Math.PI / 2; stain.position.y = 0.01; group.add(stain);
    world.scene.add(group);
    world.addHazard(x, TOP + 0.35, z, w, 0.7, d, { damage: 1, knockback: 8, kind: 'spikes' });
  };
  makeSpikes(-13, -83, 6, 4);
  makeSpikes(13, -114, 5, 4);
  makeSpikes(29, -98, 4, 4);

  /* ---------------- crystal portal ---------------- */
  // dais and steps
  world.addPlatform(0, TOP + 0.55, -123, 10, 0.55, 9, M.stoneDark);
  for (let i = 0; i < 2; i++) {
    world.addPlatform(0, TOP + 0.18 + i * 0.18, -117.5 - i * 0.7, 8 - i * 1.2, 0.4, 1.0, M.stone);
  }
  world.addPortal({
    id: 'portal_crystal', zone: 'ruins', targetZone: 'crystal',
    position: V3(0, TOP + 0.55, -123), unlocked: false,
    colorA: 0x72f3ff, colorB: 0xb68cff, label: 'Crystal Caverns',
  });
  world.brazier(-6.4, TOP + 0.55, -122);
  world.brazier(6.4, TOP + 0.55, -122);

  /* ---------------- collectible shards ---------------- */
  const gems = [
    [0, TOP + 1.2, -71],
    [-25, 6.7, -78],
    [25, 9.7, -88],
    [12, TOP + 1.2, -96],
    [-13, TOP + 1.2, -109],
    [30, TOP + 1.2, -120],
    [-12, 10.7, -122],
    [0, 5.4, -86],
  ];
  // a small ledge under the last shard
  world.addPlatform(0, 4.8, -86, 3.4, 0.7, 3.4, M.stoneDark);
  gems.forEach((g, i) => world.addGem('ruins', i, g[0], g[1], g[2]));

  /* ---------------- enemies ---------------- */
  world.addEnemy('ruins', 'sentry', -18, TOP, -76, { patrol: 0 });
  world.addEnemy('ruins', 'sentry', 18, TOP, -94, { patrol: 0 });
  world.addEnemy('ruins', 'sentry', -24, TOP, -110, { patrol: 0 });
  world.addEnemy('ruins', 'mossling', 10, TOP, -78, { patrol: 5, variant: 'stone' });
  world.addEnemy('ruins', 'mossling', -9, TOP, -118, { patrol: 4, variant: 'stone' });
  world.addEnemy('ruins', 'wisp', -5, TOP + 6, -96, { patrol: 7 });
  world.addEnemy('ruins', 'wisp', 22, TOP + 5, -112, { patrol: 6 });

  /* ---------------- flora ---------------- */
  const grass = [];
  for (let i = 0; i < 700; i++) {
    const x = rand(-36, 36), z = rand(-128, -64);
    if (Math.hypot(x, z + 102) < 14) continue;
    grass.push({ x, y: TOP + 0.02, z, scale: 0.8 });
  }
  world.grass(grass, { palette: [0x7d9a4f, 0x91a85a, 0x6b8a45, 0xb0b46a] });
  const flowers = [];
  for (let i = 0; i < 90; i++) {
    const x = rand(-34, 34), z = rand(-126, -66);
    if (Math.hypot(x, z + 102) < 14) continue;
    flowers.push({ x, y: TOP + 0.02, z });
  }
  world.flowers(flowers);
  for (let i = 0; i < 6; i++) {
    world.bush(rand(-33, 33), TOP, rand(-125, -69), rand(0.7, 1.2));
  }
  // dry trees at the edges
  world.tree(-34, TOP, -98, { scale: 0.9, palette: [0x7b8a3c, 0x9aa04a, 0x6a7a34] });
  world.tree(33, TOP, -75, { scale: 1.05, palette: [0x8b9c46, 0xa8a850, 0x6e8034] });

  // floating dust in the sunbeams
  const dustTex = makeRadialTexture(96, 'rgba(255,240,190,0.8)', 'rgba(255,240,190,0)', 0.2);
  for (let i = 0; i < 4; i++) {
    const shaft = new THREE.Mesh(
      new THREE.PlaneGeometry(rand(6, 14), rand(26, 40)),
      new THREE.MeshBasicMaterial({ map: dustTex, color: 0xffe3a0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    shaft.position.set(rand(-20, 20), TOP + 16, rand(-115, -75));
    shaft.rotation.z = rand(-0.3, 0.3);
    world.scene.add(shaft);
  }
}
