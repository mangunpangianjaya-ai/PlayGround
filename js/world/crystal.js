/* ============================================================
   Zone 3 — The Crystal Caverns
   A dark, luminous cavern of living crystal, acid pools and
   floating shards. Reached by the rune portal in the ruins.
   ============================================================ */
import * as THREE from 'three';
import { MovingPlatform } from './Objects.js';
import { rand, randInt, TAU, makeRadialTexture } from '../Utils.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function buildCrystal(world) {
  const M = world.materials;
  const TOP = -24;
  const CX = 0, CZ = -171;

  /* ---------------- cavern shell ---------------- */
  world.addGround(CX, CZ, 84, 70, TOP, M.rock, { depth: 12, rockMaterial: M.rock, segments: 4 });
  // wall blocks (left/right/front/back)
  world.addPlatform(-43, TOP + 27, CZ, 2.4, 54, 74, M.rock, { cast: false });
  world.addPlatform(43, TOP + 27, CZ, 2.4, 54, 74, M.rock, { cast: false });
  world.addPlatform(CX, TOP + 27, -207, 88, 54, 2.4, M.rock, { cast: false });
  // front wall split around the arrival alcove
  world.addPlatform(-26, TOP + 27, -135, 36, 54, 2.4, M.rock, { cast: false });
  world.addPlatform(26, TOP + 27, -135, 36, 54, 2.4, M.rock, { cast: false });
  // ceiling
  world.addPlatform(CX, TOP + 29, CZ, 88, 2.5, 74, M.rock, { cast: false });
  // jagged rock columns and arches
  for (let i = 0; i < 20; i++) {
    const x = rand(-39, 39), z = rand(-203, -139);
    if (Math.hypot(x, z + 180) < 15) continue;
    const h = rand(3, 12);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1.2, 3.2), 0), M.rock);
    rock.position.set(x, TOP + h * 0.4, z);
    rock.scale.y = rand(1.2, 2.8);
    rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    rock.castShadow = rock.receiveShadow = true;
    world.scene.add(rock);
    if (rand() < 0.45) world.addCollider(x, TOP + h * 0.4, z, rand(2.2, 4.2), h * 0.9, rand(2.2, 4.2), 'solid');
  }
  // stalactites
  for (let i = 0; i < 26; i++) {
    const x = rand(-40, 40), z = rand(-203, -139);
    const h = rand(2, 8);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(rand(0.3, 1.2), h, 5), M.rock);
    spike.position.set(x, TOP + 28.5 - h / 2, z);
    spike.rotation.x = Math.PI;
    spike.castShadow = true;
    world.scene.add(spike);
  }

  // soft volumetric crystals fill light
  const fillA = new THREE.PointLight(0x3ed6d8, 10, 75, 2);
  fillA.position.set(-12, TOP + 16, -160);
  world.scene.add(fillA);
  const fillB = new THREE.PointLight(0x8b6dff, 8, 70, 2);
  fillB.position.set(18, TOP + 12, -190);
  world.scene.add(fillB);
  const fillC = new THREE.PointLight(0x7ff5e7, 6, 50, 2);
  fillC.position.set(0, TOP + 7, -144);
  world.scene.add(fillC);

  /* ---------------- arrival & return ---------------- */
  world.addCheckpoint('crystal', 0, 0, TOP + 0.02, -153, 'Crystal Landing');
  world.addPortal({
    id: 'portal_ruins_return', zone: 'crystal', targetZone: 'ruins',
    position: V3(0, TOP, -139), unlocked: true,
    colorA: 0xffd28a, colorB: 0x8ff7ec, label: 'Ancient Ruins',
  });
  // arrival arch
  world.arch(0, TOP, -147, { width: 11, height: 6.4, material: M.stoneDark });
  world.addRuneCircle(V3(0, TOP + 0.03, -153), 5.2, 0x8ff7ec, 0.28);

  /* ---------------- crystal gardens ---------------- */
  const clusters = [
    [-27, TOP, -152, 1.3, true], [26, TOP, -158, 1.1, true], [-33, TOP, -176, 1.4, true],
    [31, TOP, -184, 1.2, true], [-20, TOP, -194, 1.0, false], [21, TOP, -198, 1.4, true],
    [-11, TOP, -162, 0.8, false], [12, TOP, -145, 0.7, false], [34, TOP, -170, 0.9, true],
    [-36, TOP, -142, 0.8, false], [0, TOP + 12, -150, 1.3, true], [-14, TOP + 18, -192, 1.6, true],
  ];
  for (const [x, y, z, s, light] of clusters) {
    world.crystal(x, y, z, {
      scale: s, color: rand() > 0.4 ? 0x6ff7ea : 0xb48cff,
      color2: rand() > 0.5 ? 0xb48cff : 0x6ff7ea,
      light, lightIntensity: 2.4, lightDistance: 22, collide: s > 1.0,
    });
  }
  // crystal veins on the floor and walls
  for (let i = 0; i < 20; i++) {
    const vein = new THREE.Mesh(new THREE.BoxGeometry(rand(0.06, 0.16), 0.02, rand(2, 8)), new THREE.MeshBasicMaterial({
      color: rand() > 0.5 ? 0x54f0e4 : 0xb388ff, transparent: true, opacity: 0.6, toneMapped: false,
    }));
    vein.position.set(rand(-38, 38), TOP + 0.05, rand(-200, -140));
    vein.rotation.y = rand(0, TAU);
    world.scene.add(vein);
  }

  /* ---------------- acid pools ---------------- */
  const makePool = (x, z, r) => {
    const glow = new THREE.Mesh(new THREE.CircleGeometry(r, 36), new THREE.MeshBasicMaterial({ color: 0x2af0da, transparent: true, opacity: 0.75, toneMapped: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, TOP + 0.04, z);
    world.scene.add(glow);
    const rim = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.5, 36), new THREE.MeshStandardMaterial({ color: 0x1c3a3a, roughness: 0.8 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(x, TOP + 0.05, z);
    world.scene.add(rim);
    const light = new THREE.PointLight(0x2af0da, 2.2, 14, 2);
    light.position.set(x, TOP + 1.2, z);
    world.scene.add(light);
    world.addHazard(x, TOP + 0.4, z, r * 1.8, 0.8, r * 1.8, { damage: 1, knockback: 9, kind: 'acid' });
  };
  makePool(-17, -156, 4.4);
  makePool(18, -166, 3.6);
  makePool(-30, -187, 3.2);

  /* ---------------- boss arena ---------------- */
  const arenaZ = -180;
  world.addRuneCircle(V3(0, TOP + 0.04, arenaZ), 12.5, 0x8ff7ff, 0.3);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.3;
    const x = Math.cos(a) * 15, z = arenaZ + Math.sin(a) * 15;
    if (i % 2 === 0) world.crystal(x, TOP, z, { scale: 1.05, color: 0x6ff7ea, color2: 0xb48cff, light: i === 0, collide: true });
    else world.rock(x, TOP, z, rand(1, 2), { collide: true });
  }
  world.bossSpawns.crystal = {
    zone: 'crystal', type: 'prism', name: 'Prism Warden',
    position: V3(0, TOP, arenaZ), arenaRadius: 14, maxHp: 300,
  };
  world.addCheckpoint('crystal', 1, 0, TOP + 0.02, -168, 'Prism Hollow');

  /* ---------------- crystal platforms ---------------- */
  const makeCrystalSlab = (x, y, z, w, d) => {
    const mesh = world.addMesh(new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), M.ice));
    mesh.position.set(x, y, z);
    return mesh;
  };
  world.addPlatform(-28, -18, -152, 5.2, 0.8, 5.2, M.ice);
  world.addPlatform(-28, -14.5, -152, 3.4, 0.8, 3.4, M.ice);
  world.addPlatform(27, -16, -168, 5.6, 0.8, 5.6, M.ice);
  world.addPlatform(27, -12, -168, 3.6, 0.8, 3.6, M.ice);
  world.addPlatform(-12, -19, -174, 4.4, 0.7, 4.4, M.ice);
  world.addPlatform(-8, -15.5, -174, 3.4, 0.7, 3.4, M.ice);
  world.addPlatform(-8, -10.5, -192, 5, 0.8, 5, M.ice);
  world.addPlatform(-2, -14.8, -192, 3.2, 0.7, 3.2, M.ice);

  // moving lifts
  const liftA = makeCrystalSlab(-20, -19, -162, 3.4, 3.4);
  new MovingPlatform(world, liftA, V3(3.4, 0.7, 3.4), { axis: V3(0, 1, 0), amplitude: 3.2, speed: 0.55, phase: 0.2, zone: 'crystal' });
  const liftB = makeCrystalSlab(16, -17, -186, 3.6, 3.6);
  new MovingPlatform(world, liftB, V3(3.6, 0.7, 3.6), { axis: V3(0, 1, 0), amplitude: 2.8, speed: 0.48, phase: 2.2, zone: 'crystal' });
  const sweep = makeCrystalSlab(0, -19.5, -160, 4.4, 3.0);
  new MovingPlatform(world, sweep, V3(4.4, 0.7, 3.0), { axis: V3(1, 0, 0), amplitude: 8, speed: 0.36, phase: 0.9, zone: 'crystal' });

  /* ---------------- sky portal ---------------- */
  world.addPlatform(0, TOP + 0.6, -201, 10, 0.6, 8.6, M.stoneDark);
  world.addPortal({
    id: 'portal_sky', zone: 'crystal', targetZone: 'sky',
    position: V3(0, TOP + 0.6, -201), unlocked: false,
    colorA: 0xb48cff, colorB: 0xffe6a2, label: 'Skybound Isles',
  });
  world.brazier(-6.2, TOP + 0.6, -200, { color: 0xb48cff });
  world.brazier(6.2, TOP + 0.6, -200, { color: 0x8ff7ec });

  /* ---------------- shards ---------------- */
  const gems = [
    [0, TOP + 1.2, -150],
    [-28, -13.4, -152],
    [27, -10.9, -168],
    [-8, -9.4, -192],
    [16, -17.5, -186],
    [30, TOP + 1.2, -196],
    [-31, TOP + 1.2, -192],
    [0, TOP + 6.2, -186],
  ];
  // floating pedestal beneath the high shard
  world.addPlatform(0, TOP + 5.4, -186, 4.2, 0.7, 4.2, M.ice);
  gems.forEach((g, i) => world.addGem('crystal', i, g[0], g[1], g[2], i % 2 ? 0x9ffff4 : 0xd1b0ff));

  /* ---------------- enemies ---------------- */
  world.addEnemy('crystal', 'mossling', -12, TOP, -152, { patrol: 4, variant: 'crystal' });
  world.addEnemy('crystal', 'mossling', 14, TOP, -176, { patrol: 5, variant: 'crystal' });
  world.addEnemy('crystal', 'mossling', -22, TOP, -190, { patrol: 4, variant: 'crystal' });
  world.addEnemy('crystal', 'wisp', 20, TOP + 5, -154, { patrol: 6, variant: 'crystal' });
  world.addEnemy('crystal', 'wisp', -16, TOP + 6, -186, { patrol: 6, variant: 'crystal' });
  world.addEnemy('crystal', 'sentry', 30, TOP, -158, { variant: 'crystal' });
  world.addEnemy('crystal', 'sentry', -30, TOP, -172, { variant: 'crystal' });

  /* ---------------- motes / mist ---------------- */
  const mistTex = makeRadialTexture(96, 'rgba(140,245,255,0.55)', 'rgba(140,245,255,0)', 0.2);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: 0x8ff7ff, transparent: true, opacity: 0.05, depthWrite: false, toneMapped: false }));
    s.position.set(rand(-35, 35), TOP + rand(0.5, 5), rand(-200, -140));
    s.scale.set(rand(8, 18), rand(3, 6), 1);
    world.scene.add(s);
  }

  // faint organic growth
  for (let i = 0; i < 10; i++) {
    world.bush(rand(-34, 34), TOP, rand(-200, -142), rand(0.5, 0.9));
  }
}
