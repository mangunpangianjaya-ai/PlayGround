/* ============================================================
   World — assembles the four connected zones, owns all collision
   AABBs, collectibles, shrines, gates and portals.
   Zones are built in ./world/*.js for clarity.
   ============================================================ */
import * as THREE from 'three';
import {
  makeMottleTexture, makeNormalTexture, makeGrainTexture, makeCloudTexture,
  makeGlowSprite, rand, randInt, clamp, TAU,
} from './Utils.js';
import { MovingPlatform, Gate, Portal, Checkpoint, Gem, RuneCircle } from './world/Objects.js';
import {
  createTree, createRock, createColumn, createArch, createRuinWall, createCrystalCluster,
  createGrassField, createFlowerField, createBush, createWater, createSkyIsland,
  createCloudPlatform, createWindColumn, createWaterfall, createBrazier, createLantern,
  createLilyPads, createStatue,
} from './world/Props.js';
import { buildMeadow } from './world/meadow.js';
import { buildRuins } from './world/ruins.js';
import { buildCrystal } from './world/crystal.js';
import { buildSky } from './world/sky.js';

export const ZONES = {
  meadow: { name: 'Sunlit Meadow', sub: 'Where the world wakes', color: 0x9fe4a8 },
  ruins: { name: 'Ancient Ruins', sub: 'Stones that remember the sun', color: 0xffd08a },
  crystal: { name: 'Crystal Caverns', sub: 'Light sleeping under the earth', color: 0x8ff7ff },
  sky: { name: 'Skybound Isles', sub: 'The last road to dawn', color: 0xfff1c2 },
};

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class World {
  constructor(scene, environment, { zones = null } = {}) {
    this.scene = scene;
    this.environment = environment;
    this.time = 0;
    this.activeZones = zones ? new Set(zones) : null;

    this.colliders = [];
    this.movingPlatforms = [];
    this.gems = [];
    this.checkpoints = [];
    this.portals = [];
    this.gates = [];
    this.hazards = [];
    this.enemySpawns = [];
    this.bossSpawns = {};
    this.windZones = [];
    this.windVisuals = [];
    this.waterfalls = [];
    this.waters = [];
    this.braziers = [];
    this.lanterns = [];
    this.runeCircles = [];
    this.crystalLights = [];
    this.crystalClusters = [];
    this.trees = [];
    this.instanced = [];
    this.buildings = [];
    this.MovingPlatformClass = MovingPlatform;

    this.tex = this._makeTextures();
    this.cloudTex = makeCloudTexture(256, 4);
    this.materials = this._makeMaterials();
    this._makeGrassMaterial();

    // Each selected zone appends itself to the shared scene. The full
    // campaign passes all four realms; partial sets are still supported.
    const build = (zone, fn) => {
      if (!this.activeZones || this.activeZones.has(zone)) fn(this);
    };
    build('meadow', buildMeadow);
    build('ruins', buildRuins);
    build('crystal', buildCrystal);
    build('sky', buildSky);

    this.gemTotal = this.gems.length;
    this.zoneSpawns = {
      meadow: V3(0, 0.05, 8),
      ruins: V3(0, 2.45, -66),
      crystal: V3(0, -23.95, -146),
      sky: V3(0, 44.05, -74),
    };
  }

  /* ============================================================
     Procedural materials
     ============================================================ */
  _makeTextures() {
    const grass = makeMottleTexture(512, {
      base: [92, 138, 64], variance: 26, scale: 3.6, seed: 2,
      strokes: 1900, strokeColor: [164, 205, 96], darkSpots: 40,
    });
    const rock = makeMottleTexture(384, {
      base: [117, 113, 102], variance: 34, scale: 4.5, seed: 9,
      strokes: 500, strokeColor: [142, 138, 125], darkSpots: 65,
    });
    const stone = makeMottleTexture(384, {
      base: [174, 167, 146], variance: 24, scale: 5.2, seed: 15,
      strokes: 620, strokeColor: [198, 189, 163], darkSpots: 30,
    });
    const wood = makeMottleTexture(256, {
      base: [103, 76, 51], variance: 20, scale: 3.0, seed: 8,
      strokes: 320, strokeColor: [141, 108, 72], darkSpots: 15,
    });
    const sand = makeMottleTexture(256, {
      base: [194, 177, 139], variance: 18, scale: 4.0, seed: 21,
      strokes: 200, strokeColor: [215, 200, 162], darkSpots: 12,
    });
    const normal = makeNormalTexture(256, 9, 1.8, 5);
    const normalRock = makeNormalTexture(256, 7, 2.6, 12);
    const grain = makeGrainTexture(256, { base: 168, variance: 74, scale: 18, seed: 4 });
    const ao = makeGrainTexture(256, { base: 160, variance: 90, scale: 11, seed: 19 });
    return { grass, rock, stone, wood, sand, normal, normalRock, grain, ao };
  }

  _tex(tex, repeat) {
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.needsUpdate = true;
    return t;
  }

  _makeMaterials() {
    const t = this.tex;
    const grass = new THREE.MeshStandardMaterial({
      map: this._tex(t.grass, 13),
      normalMap: this._tex(t.normal, 13),
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: this._tex(t.grain, 13),
      roughness: 0.94, metalness: 0.0, envMapIntensity: 0.6,
    });
    const grassTopIsland = new THREE.MeshStandardMaterial({
      map: this._tex(t.grass, 4),
      normalMap: this._tex(t.normal, 4),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.94, metalness: 0.0, envMapIntensity: 0.6,
    });
    const path = new THREE.MeshStandardMaterial({
      map: this._tex(t.sand, 2),
      normalMap: this._tex(t.normal, 2),
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.9, metalness: 0.0, envMapIntensity: 0.55,
    });
    const rock = new THREE.MeshStandardMaterial({
      map: this._tex(t.rock, 5),
      normalMap: this._tex(t.normalRock, 5),
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: this._tex(t.grain, 5),
      roughness: 0.97, metalness: 0.0, envMapIntensity: 0.55,
    });
    const stone = new THREE.MeshStandardMaterial({
      map: this._tex(t.stone, 4),
      normalMap: this._tex(t.normalRock, 4),
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: this._tex(t.grain, 4),
      aoMap: this._tex(t.ao, 4),
      aoMapIntensity: 0.65,
      roughness: 0.9, metalness: 0.0, envMapIntensity: 0.7,
    });
    const stoneDark = new THREE.MeshStandardMaterial({
      map: this._tex(t.rock, 4),
      normalMap: this._tex(t.normalRock, 4),
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.95, metalness: 0.0, envMapIntensity: 0.6,
    });
    const wood = new THREE.MeshStandardMaterial({
      map: this._tex(t.wood, 3),
      normalMap: this._tex(t.normal, 3),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.85, metalness: 0.0, envMapIntensity: 0.5,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xd8a955, metalness: 0.82, roughness: 0.24,
      emissive: 0x3a2205, emissiveIntensity: 0.4, envMapIntensity: 1.3,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x30363a, metalness: 0.75, roughness: 0.38, envMapIntensity: 0.9,
    });
    const leafBush = new THREE.MeshStandardMaterial({
      color: 0x4c8646, roughness: 0.9, flatShading: true, envMapIntensity: 0.6,
    });
    const vines = new THREE.MeshStandardMaterial({
      color: 0x3f6f3f, roughness: 0.9, envMapIntensity: 0.4,
    });
    const cloud = new THREE.MeshStandardMaterial({
      color: 0xf0fbff, roughness: 1.0, metalness: 0.0,
      emissive: 0x7ea6b4, emissiveIntensity: 0.22, envMapIntensity: 0.7,
    });
    const acid = new THREE.MeshStandardMaterial({
      color: 0x0a4d4a, emissive: 0x1ed8c6, emissiveIntensity: 1.3,
      metalness: 0.1, roughness: 0.3, transparent: true, opacity: 0.9,
    });
    const ice = new THREE.MeshPhysicalMaterial({
      color: 0x9ffbf5, emissive: 0x155f68, emissiveIntensity: 1.0,
      metalness: 0.05, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05,
      transparent: true, opacity: 0.92, envMapIntensity: 1.8,
    });
    const crystalTeal = new THREE.MeshPhysicalMaterial({
      color: 0x76f4e5, emissive: 0x0b6d70, emissiveIntensity: 1.5,
      metalness: 0.1, roughness: 0.09, clearcoat: 1, clearcoatRoughness: 0.04,
      transparent: true, opacity: 0.94, envMapIntensity: 1.9, flatShading: true,
    });
    const crystalViolet = new THREE.MeshPhysicalMaterial({
      color: 0xb48cff, emissive: 0x4b1b86, emissiveIntensity: 1.4,
      metalness: 0.1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05,
      transparent: true, opacity: 0.94, envMapIntensity: 1.9, flatShading: true,
    });
    return {
      grass, grassTopIsland, path, rock, stone, stoneDark, wood, gold, darkMetal,
      leafBush, vines, cloud, acid, ice, crystalTeal, crystalViolet,
    };
  }

  _makeGrassMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1.0, metalness: 0.0,
      side: THREE.DoubleSide, envMapIntensity: 0.4,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        float wX = instanceMatrix[3].x;
        float wZ = instanceMatrix[3].z;
        float swayAmp = 0.09 + 0.05 * sin(uTime * 0.6 + wX * 0.2 + wZ * 0.1);
        transformed.x += sin(uTime * 1.5 + wX * 0.35 + wZ * 0.28) * position.y * swayAmp;
        transformed.z += cos(uTime * 1.1 + wX * 0.2 + wZ * 0.4) * position.y * swayAmp * 0.55;
      `);
      this.grassShader = shader;
    };
    this.grassMaterial = mat;
  }

  /* ============================================================
     Collision / mesh helpers used by zone builders
     ============================================================ */
  addCollider(cx, cy, cz, w, h, d, kind = 'solid') {
    const collider = { box: new THREE.Box3(), kind, active: true };
    collider.box.setFromCenterAndSize(V3(cx, cy, cz), V3(w, h, d));
    this.colliders.push(collider);
    return collider;
  }

  addMesh(mesh, { cast = true, receive = true } = {}) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    this.scene.add(mesh);
    return mesh;
  }

  /** Box mesh with its top surface at topY. */
  addPlatform(cx, topY, cz, w, h, d, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(cx, topY - h / 2, cz);
    mesh.castShadow = opts.cast ?? true;
    mesh.receiveShadow = opts.receive ?? true;
    this.scene.add(mesh);
    if (opts.collider !== false) {
      this.addCollider(cx, topY - h / 2, cz, w, h, d, opts.kind || 'solid');
    }
    return mesh;
  }

  /** Big flat ground: grass/stone plane over a chunk of rock. */
  addGround(cx, cz, w, d, topY, material, opts = {}) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d, opts.segments || 1, opts.segments || 1), material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(cx, topY, cz);
    plane.receiveShadow = true;
    this.scene.add(plane);
    if (opts.underside !== false) {
      const under = new THREE.Mesh(new THREE.BoxGeometry(w, opts.depth || 9, d), opts.rockMaterial || this.materials.rock);
      under.position.set(cx, topY - (opts.depth || 9) / 2 - 0.02, cz);
      under.castShadow = false;
      under.receiveShadow = true;
      this.scene.add(under);
    }
    if (opts.collider !== false) {
      this.addCollider(cx, topY - 2.0, cz, w, 4.0, d, 'solid');
    }
    return plane;
  }

  addGem(zone, index, x, y, z, color) {
    const id = `${zone}_gem_${index}`;
    const colorForZone = color ?? { meadow: 0x8ff7ec, ruins: 0xffd98a, crystal: 0xa0fff4, sky: 0xfff0b8 }[zone];
    return new Gem(this, { id, zone, position: V3(x, y, z), color: colorForZone });
  }

  addCheckpoint(zone, index, x, y, z, name) {
    return new Checkpoint(this, { id: `${zone}_cp_${index}`, zone, position: V3(x, y, z), name });
  }

  addPortal(opts) {
    return new Portal(this, opts);
  }

  addGate(opts) {
    return new Gate(this, opts);
  }

  addEnemy(zone, type, x, y, z, opts = {}) {
    this.enemySpawns.push({ zone, type, position: V3(x, y, z), ...opts });
  }

  addHazard(x, y, z, w, h, d, opts = {}) {
    const hazard = {
      box: new THREE.Box3().setFromCenterAndSize(V3(x, y, z), V3(w, h, d)),
      damage: opts.damage ?? 1, knockback: opts.knockback ?? 7, kind: opts.kind || 'spikes',
    };
    this.hazards.push(hazard);
    return hazard;
  }

  addWindZone(x, y, z, radius, height, strength = 34) {
    this.windZones.push({ x, y, z, radius, height, strength });
  }

  addRuneCircle(position, radius, color, opacity) {
    return new RuneCircle(this, { position, radius, color, opacity });
  }

  // pass-throughs used by zone builders
  tree(x, y, z, opts) { return createTree(this, x, y, z, opts); }
  rock(x, y, z, scale, opts) { return createRock(this, x, y, z, scale, opts); }
  column(x, y, z, opts) { return createColumn(this, x, y, z, opts); }
  arch(x, y, z, opts) { return createArch(this, x, y, z, opts); }
  wall(x, y, z, opts) { return createRuinWall(this, x, y, z, opts); }
  crystal(x, y, z, opts) { return createCrystalCluster(this, x, y, z, opts); }
  bush(x, y, z, scale) { return createBush(this, x, y, z, scale); }
  water(x, y, z, radius, opts) { return createWater(this, x, y, z, radius, opts); }
  island(cx, topY, cz, w, d, opts) { return createSkyIsland(this, cx, topY, cz, w, d, opts); }
  cloudPlatform(x, y, z, w, d, opts) { return createCloudPlatform(this, x, y, z, w, d, opts); }
  wind(x, y, z, radius, height, opts) { return createWindColumn(this, x, y, z, radius, height, opts); }
  waterfall(x, y, z, w, h, opts) { return createWaterfall(this, x, y, z, w, h, opts); }
  brazier(x, y, z, opts) { return createBrazier(this, x, y, z, opts); }
  lantern(x, y, z, opts) { return createLantern(this, x, y, z, opts); }
  lilyPads(x, y, z, radius, count) { return createLilyPads(this, x, y, z, radius, count); }
  statue(x, y, z) { return createStatue(this, x, y, z); }
  grass(samples, opts) { return createGrassField(this, samples, opts); }
  flowers(samples) { return createFlowerField(this, samples); }

  /* ============================================================
     Queries
     ============================================================ */
  zoneAt(position) {
    if (position.y > 30) return 'sky';
    if (position.y < -10) return 'crystal';
    if (position.z < -60) return 'ruins';
    return 'meadow';
  }

  getZoneInfo(zone) { return ZONES[zone] || ZONES.meadow; }

  getSpawn(zone) { return this.zoneSpawns[zone]?.clone() || this.zoneSpawns.meadow.clone(); }

  getBossSpawn(zone) { return this.bossSpawns[zone] || null; }

  findNearbyCheckpoint(position, radius = 2.4) {
    for (const cp of this.checkpoints) {
      if (cp.activated) continue;
      const dx = position.x - cp.position.x;
      const dy = position.y - cp.position.y;
      const dz = position.z - cp.position.z;
      if (dx * dx + dz * dz < radius * radius && Math.abs(dy) < 3.2) return cp;
    }
    return null;
  }

  findNearbyPortal(position) {
    for (const portal of this.portals) {
      if (!portal.unlocked) continue;
      if (portal.isPlayerInside(position)) return portal;
    }
    return null;
  }

  hazardAt(box) {
    for (const h of this.hazards) {
      if (h.box.intersectsBox(box)) return h;
    }
    return null;
  }

  windAt(position) {
    for (const w of this.windZones) {
      const dx = position.x - w.x, dz = position.z - w.z;
      if (dx * dx + dz * dz < w.radius * w.radius && position.y > w.y - 1 && position.y < w.y + w.height) {
        return w;
      }
    }
    return null;
  }

  inWater(position) {
    for (const water of this.waters) {
      const dx = position.x - water.center.x;
      const dz = position.z - water.center.z;
      if (dx * dx + dz * dz < (water.radius - 0.6) * (water.radius - 0.6) &&
          position.y < water.center.y + 0.5 && position.y > water.center.y - 2.5) {
        return water;
      }
    }
    return null;
  }

  /* ============================================================
     Progress state helpers
     ============================================================ */
  setGateOpen(zone, open, instant = false) {
    for (const gate of this.gates) {
      if (gate.zone === zone) gate.setOpen(open, instant);
    }
  }

  setPortalUnlocked(zone, unlocked, instant = true) {
    for (const portal of this.portals) {
      if (portal.zone === zone) portal.setUnlocked(unlocked, instant);
    }
  }

  restoreProgress(progress) {
    if (!progress) return;
    if (progress.gems) {
      for (const gem of this.gems) {
        if (progress.gems.includes(gem.id)) gem.collect();
      }
    }
    if (progress.checkpoints) {
      for (const cp of this.checkpoints) {
        if (progress.checkpoints.includes(cp.id)) cp.activate();
      }
    }
    if (progress.bosses) {
      if (progress.bosses.meadow) this.setGateOpen('meadow', true, true);
      if (progress.bosses.ruins) this.setPortalUnlocked('ruins', true, true);
      if (progress.bosses.crystal) this.setPortalUnlocked('crystal', true, true);
    }
  }

  /* ============================================================
     Frame update
     ============================================================ */
  update(dt, time, playerPos) {
    this.time = time;
    for (const p of this.movingPlatforms) p.update(time, dt);
    for (const gate of this.gates) gate.update(dt);
    for (const portal of this.portals) portal.update(dt);
    for (const gem of this.gems) gem.update(dt);
    for (const cp of this.checkpoints) cp.update(dt);
    for (const rune of this.runeCircles) rune.update(dt, time);

    for (const water of this.waters) water.uniforms.uTime.value = time;
    for (const w of this.windVisuals) {
      if (w.mat.map) w.mat.map.offset.y -= dt * 0.22;
      w.mesh.rotation.y += dt * 0.15;
    }
    for (const wf of this.waterfalls) {
      wf.tex.offset.y -= dt * wf.speed;
    }
    for (const b of this.braziers) {
      const p = 0.7 + Math.sin(time * 7 + b.phase) * 0.2 + Math.sin(time * 13 + b.phase * 2) * 0.1;
      b.light.intensity = b.base * p;
      b.glow.material.opacity = 0.45 + p * 0.2;
    }
    for (const l of this.lanterns) {
      const p = 0.8 + Math.sin(time * 5 + l.phase) * 0.15;
      l.light.intensity = 0.8 * p;
      l.glow.material.opacity = 0.4 * p;
    }

    // LOD canopies sway in the wind.
    for (const t of this.trees) {
      const s = Math.sin(time * 0.7 + t.phase) * t.amp;
      const c = Math.cos(time * 0.5 + t.phase) * t.amp * 0.6;
      t.canopyHigh.rotation.z = s;
      t.canopyHigh.rotation.x = c;
      t.canopyLow.rotation.z = s;
      t.canopyLow.rotation.x = c;
    }
    for (const c of this.crystalClusters) {
      const p = c.base + Math.sin(time * 1.4 + c.phase) * 0.22;
      c.mat.emissiveIntensity = p;
      c.mat2.emissiveIntensity = p * 0.9;
    }
    for (const l of this.crystalLights) {
      l.light.intensity = l.base * (0.8 + Math.sin(time * 1.7 + l.phase) * 0.2);
    }
    if (this.grassShader) this.grassShader.uniforms.uTime.value = time;
  }
}
