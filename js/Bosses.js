/* ============================================================
   Bosses — one warden per realm, each with its own arena,
   attack vocabulary and phase escalation.

     • Moss Golem    — slam shockwaves, hurled boulders, charges
     • Rune Sentinel — fan volleys, radial rune bursts, blink
     • Prism Warden  — crystal rings, shard rain, lances
     • Storm Drake   — dive attacks, lightning columns, gales

   A boss waits dormant in its arena until the player steps in.
   Defeating it opens the road to the next realm.
   ============================================================ */
import * as THREE from 'three';
import {
  clamp, damp, rand, TAU, makeGlowSprite, makeRadialTexture,
} from './Utils.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GLOW = makeRadialTexture(96, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.16);

function disposeGroup(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m && m.dispose) m.dispose(); });
    }
  });
}

export class Boss {
  constructor(game, spec) {
    this.game = game;
    this.spec = spec;
    this.scene = game.scene;
    this.world = game.world;
    this.effects = game.effects;
    this.zone = spec.zone;
    this.type = spec.type;
    this.name = spec.name;
    this.home = spec.position.clone();
    this.position = spec.position.clone();
    this.arenaRadius = spec.arenaRadius || 13;
    this.maxHp = spec.maxHp;
    this.hp = this.maxHp;
    this.damageScale = 5;
    this.radius = 2.4;
    this.centerHeight = 2.2;
    this.color = 0xffd38c;
    this.alive = true;
    this.engaged = false;
    this.introTimer = 0;
    this.attackTimer = 1.8;
    this.action = null;
    this.phase = 1;
    this.time = rand(0, 6);
    this.hitFlash = 0;
    this.deathTimer = 0;
    this.telegraph = 0;
    this.movePhase = 0;
    this.facing = 0;
    this.lastHpRatio = 1;
    this.contactCooldown = 0;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.scene.add(this.group);
    this.build();
    this.group.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
    });
  }

  get center() { return this.position.clone().add(V3(0, this.centerHeight, 0)); }
  get hpRatio() { return clamp(this.hp / this.maxHp, 0, 1); }

  phaseLabel() { return `Phase ${['I', 'II', 'III'][Math.min(this.phase - 1, 2)]}`; }

  /* ---------------- subclass hooks ---------------- */
  build() { /* implemented by subclasses */ }
  idleMotion() { /* implemented by subclasses */ }
  animate() { /* implemented by subclasses */ }
  chooseAction() { this._finishAction(2.2); }
  updateAction() { this._finishAction(2.2); }
  move(dt) {
    if (!this.action) this._moveToward(dt, this.game.player.position, 2.0, 5.5);
  }

  /* ---------------- engagement ---------------- */
  engage() {
    if (this.engaged || !this.alive) return;
    this.engaged = true;
    this.introTimer = 1.35;
    this.attackTimer = 1.1;
    this.game.sfx('bossRoar');
    this.game.effects.addShake(0.5, 1.1);
    this.game.effects.shockwave(this.position.clone(), {
      color: this.color, radius: 7, duration: 1.1, y: this.position.y + 0.12,
    });
    this.game.effects.burst(this.center, {
      count: 60, speed: 8, size: 0.22, life: 1.1, gravity: -1,
      colors: [this.color, 0xffffff, 0xffedc2],
    });
    this.game.toast(`${this.name} awakens`, '☲');
    this.game.onBossEngaged?.(this);
  }

  /* ---------------- combat ---------------- */
  tryHit(playerPos, facing) {
    if (!this.alive) return false;
    const c = this.center;
    const dx = c.x - playerPos.x;
    const dz = c.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > this.radius + 2.6) return false;
    if (Math.abs(c.y - (playerPos.y + 1.1)) > 5.2) return false;
    if (dist > 0.001) {
      const dot = (dx / dist) * Math.sin(facing) + (dz / dist) * Math.cos(facing);
      if (dot < -0.15) return false;
    }
    return true;
  }

  takeDamage(amount = 1, source = null) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount * this.damageScale);
    this.hitFlash = 0.14;
    this.effects.hitSpark(this.center, this.color, 24);
    this.game.sfx('bossHit', 0.8);
    if (this.hp <= 0) {
      this._die();
      return true;
    }
    return false;
  }

  _die() {
    if (!this.alive) return;
    this.alive = false;
    this.deathTimer = 2.6;
    this.action = null;
    this.telegraph = 0;
    this.game.projectiles.clear();
    this.effects.enemyDeath(this.center, this.color);
    this.effects.shockwave(this.position.clone(), {
      color: this.color, radius: 14, duration: 1.6, y: this.position.y + 0.15,
    });
    this.effects.burst(this.center, {
      count: 120, speed: 13, size: 0.3, life: 1.6, gravity: -5,
      colors: [this.color, 0xffffff, 0xffe3a6, 0xff9d76],
    });
    this.game.effects.addShake(0.65, 1.4);
    this.game.sfx('slam');
    this.game.sfx('victory');
    this.game.onBossDefeated?.(this);
  }

  /* ---------------- movement helpers ---------------- */
  _moveToward(dt, target, speed, stopDist = 3) {
    const dir = target.clone().sub(this.position);
    dir.y = 0;
    const dist = dir.length();
    if (dist <= stopDist || dist < 0.001) return;
    dir.normalize();
    this.position.x += dir.x * speed * dt;
    this.position.z += dir.z * speed * dt;
    this.facing = Math.atan2(dir.x, dir.z);
    this.movePhase += dt * 6;
  }

  _clampToArena(padding = 2.2) {
    const dx = this.position.x - this.home.x;
    const dz = this.position.z - this.home.z;
    const r = Math.hypot(dx, dz);
    const max = this.arenaRadius - padding;
    if (r > max) {
      const k = max / r;
      this.position.x = this.home.x + dx * k;
      this.position.z = this.home.z + dz * k;
    }
  }

  _finishAction(cooldown = 2.0) {
    this.action = null;
    this.telegraph = 0;
    const speedUp = this.phase >= 3 ? 0.62 : this.phase === 2 ? 0.8 : 1;
    this.attackTimer = cooldown * speedUp;
  }

  _fireFan(origin, target, count, spread, speed, color, radius = 0.2, gravity = 0) {
    const base = Math.atan2(target.x - origin.x, target.z - origin.z);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * spread;
      const dir = V3(Math.sin(a), 0, Math.cos(a));
      this.game.projectiles.spawn({
        position: origin.clone(),
        velocity: dir.multiplyScalar(speed),
        color, radius, damage: 1, life: 3.2, gravity,
        glowScale: 1.15,
      });
    }
  }

  _fireRing(origin, count, speed, color, radius = 0.2, offset = 0) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + offset;
      const dir = V3(Math.sin(a), 0, Math.cos(a));
      this.game.projectiles.spawn({
        position: origin.clone(),
        velocity: dir.multiplyScalar(speed),
        color, radius, damage: 1, life: 2.8, glowScale: 1,
      });
    }
  }

  /* ---------------- frame update ---------------- */
  update(dt, player) {
    this.time += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);

    if (!this.alive) {
      this.deathTimer -= dt;
      const k = clamp(this.deathTimer / 2.6, 0, 1);
      this.group.rotation.z = (1 - k) * 0.5;
      this.group.position.y = this.position.y - (1 - k) * 2.2;
      this.group.scale.setScalar(Math.max(0.001, k));
      if (this.deathTimer <= 0) this.group.visible = false;
      return;
    }

    if (!this.engaged) {
      const dist = Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z);
      if (dist < this.arenaRadius + 1.5 && Math.abs(player.position.y - this.position.y) < 12) {
        this.engage();
      } else {
        this.idleMotion(dt);
        this.animate(dt);
        this.group.position.copy(this.position);
        return;
      }
    }

    if (this.introTimer > 0) {
      this.introTimer -= dt;
      this.telegraph = clamp(this.introTimer / 1.35, 0, 1);
      this.animate(dt);
      this.group.position.copy(this.position);
      return;
    }
    this.telegraph = 0;

    // phase escalation
    const ratio = this.hpRatio;
    if (this.phase === 1 && ratio <= 0.6) this._enterPhase(2);
    else if (this.phase === 2 && ratio <= 0.3) this._enterPhase(3);

    const dist = Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z);

    if (this.action) {
      this.updateAction(dt, player, dist);
    } else {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) this.chooseAction(dist, player);
      this.move(dt, player, dist);
    }

    this._clampToArena(this.type === 'drake' ? 3.2 : 2.2);
    this.animate(dt, player);
    this.group.position.copy(this.position);

    // Contact damage while charging/diving.
    if (this.action?.contact && this.contactCooldown <= 0) {
      if (dist < this.radius + 1.4 && Math.abs(player.position.y - this.position.y) < 3.5) {
        this.contactCooldown = 0.8;
        player.takeDamage(1, this.center, { knockback: 9, up: 5 });
      }
    }
  }

  _enterPhase(phase) {
    this.phase = phase;
    this.effects.shockwave(this.position.clone(), {
      color: this.color, radius: 10, duration: 1.0, y: this.position.y + 0.2,
    });
    this.effects.burst(this.center, {
      count: 40, speed: 7, size: 0.2, life: 0.9, gravity: 0,
      colors: [this.color, 0xffffff],
    });
    this.effects.addShake(0.35, 0.5);
    this.game.sfx('bossRoar');
    this.game.toast(`${this.name} · ${this.phaseLabel()}`, '☲');
  }
}

/* ============================================================
   Moss Golem
   ============================================================ */
class MossGolem extends Boss {
  constructor(game, spec) {
    super(game, spec);
    this.color = 0xa8ff9a;
    this.radius = 2.6;
    this.centerHeight = 2.6;
  }

  build() {
    const rock = new THREE.MeshStandardMaterial({
      color: 0x6f6f5b, roughness: 0.96, metalness: 0.02, flatShading: true,
      envMapIntensity: 0.6,
    });
    const moss = new THREE.MeshStandardMaterial({
      color: 0x578c3e, roughness: 0.9, flatShading: true,
      emissive: 0x1d3a12, emissiveIntensity: 0.5,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xd6ff9c, emissive: 0x8cff6a, emissiveIntensity: 2.4,
      roughness: 0.2, metalness: 0.1,
    });
    this.coreMat = coreMat;

    const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(1.45, 0), rock);
    torso.position.y = 2.3;
    torso.scale.set(1.12, 1.0, 0.95);
    this.group.add(torso);
    this.torso = torso;

    const chest = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 0), moss);
    chest.position.set(0, 2.1, 0.62);
    chest.scale.set(1, 0.8, 0.7);
    this.group.add(chest);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), coreMat);
    core.position.set(0, 2.55, 0.9);
    this.group.add(core);
    this.core = core;

    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), rock);
    head.position.set(0, 3.72, 0.18);
    head.scale.set(1, 0.86, 0.9);
    this.group.add(head);
    this.head = head;
    for (const sx of [-0.25, 0.25]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xd6ff9c, toneMapped: false }));
      eye.position.set(sx, 3.82, 0.72);
      this.group.add(eye);
    }

    // shoulders / arms with pivot groups
    this.arms = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 1.55, 3.1, 0);
      const upper = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), rock);
      upper.position.set(sx * 0.22, -0.45, 0);
      upper.scale.set(0.9, 1.25, 0.9);
      pivot.add(upper);
      const fore = new THREE.Mesh(new THREE.DodecahedronGeometry(0.54, 0), rock);
      fore.position.set(sx * 0.42, -1.5, 0.1);
      fore.scale.set(0.78, 1.3, 0.78);
      pivot.add(fore);
      const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), rock);
      fist.position.set(sx * 0.52, -2.48, 0.15);
      pivot.add(fist);
      this.group.add(pivot);
      this.arms.push(pivot);
    }

    // legs
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.DodecahedronGeometry(0.56, 0), rock);
      leg.position.set(sx * 0.58, 0.62, 0);
      leg.scale.set(0.8, 1.2, 0.85);
      this.group.add(leg);
    }

    // moss caps
    for (let i = 0; i < 9; i++) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(rand(0.18, 0.4), 6, 4), moss);
      cap.position.set(rand(-1.1, 1.1), rand(2.6, 4.0), rand(-0.5, 0.7));
      cap.scale.y = 0.42;
      this.group.add(cap);
    }

    const glow = makeGlowSprite({ color: 0xa8ff9a, size: 5.5, opacity: 0.3, texture: GLOW });
    glow.position.set(0, 2.6, 0.9);
    this.group.add(glow);
    this.glow = glow;
  }

  idleMotion(dt) {
    this.position.y = this.home.y;
    this.head.rotation.y = Math.sin(this.time * 0.5) * 0.2;
    this.arms[0].rotation.x = Math.sin(this.time * 0.9) * 0.08;
    this.arms[1].rotation.x = -Math.sin(this.time * 0.9) * 0.08;
  }

  animate(dt) {
    this.position.y = this.home.y;
    const swing = Math.sin(this.movePhase) * 0.4;
    this.arms[0].rotation.x = swing;
    this.arms[1].rotation.x = -swing;
    this.head.rotation.y = Math.sin(this.time * 0.8) * 0.12;
    this.core.rotation.y += dt * 1.8;
    if (this.telegraph > 0) {
      this.arms.forEach((a) => { a.rotation.x = -1.6 * this.telegraph; });
      this.group.scale.setScalar(1 + Math.sin(this.time * 30) * 0.01 * this.telegraph);
    } else {
      this.group.scale.setScalar(1);
    }
    if (this.glow) this.glow.material.opacity = 0.26 + Math.sin(this.time * 2) * 0.08;
    this.coreMat.emissiveIntensity = 2.2 + Math.sin(this.time * 3) * 0.4 + this.hitFlash * 8;
  }

  move(dt, player, dist) {
    if (!this.action) {
      this._moveToward(dt, player.position, 2.1, 5.0);
      this.group.rotation.y = this.facing;
    }
  }

  chooseAction(dist) {
    const roll = Math.random();
    if (dist < 8.5 || roll < 0.42) {
      this.action = { kind: 'slam', t: 0.85, duration: 0.85, done: false };
      this.game.sfx('slam', 0.4);
    } else if (this.phase >= 2 && roll < 0.66) {
      this.action = { kind: 'charge', t: 0.65, duration: 0.65, done: false, contact: false, dir: null };
    } else {
      this.action = { kind: 'boulder', t: 0.8, duration: 0.8, done: false };
    }
  }

  updateAction(dt, player) {
    const a = this.action;
    a.t -= dt;
    this.telegraph = clamp(a.t / a.duration, 0, 1);

    if (a.kind === 'slam') {
      if (a.t <= 0 && !a.done) {
        a.done = true;
        this.group.rotation.y = Math.atan2(
          player.position.x - this.position.x,
          player.position.z - this.position.z,
        );
        this.game.sfx('slam');
        this.effects.addShake(0.55, 0.5);
        this.effects.shockwave(this.position.clone(), {
          color: 0xa8ff9a, radius: 9, duration: 0.8, y: this.position.y + 0.14,
        });
        this._fireRing(this.position.clone().add(V3(0, 0.7, 0)), 16, 10, 0xa8ff9a, 0.24, rand(0, TAU));
        if (Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z) < 7 &&
            Math.abs(player.position.y - this.position.y) < 2.5) {
          player.takeDamage(1, this.center, { knockback: 10, up: 6 });
        }
        this._finishAction(2.4);
      }
      return;
    }

    if (a.kind === 'boulder') {
      if (a.t <= 0 && !a.done) {
        a.done = true;
        this.game.sfx('shoot');
        const origin = this.center.clone().add(V3(0, 0.9, 0));
        const target = player.center.clone();
        const base = Math.atan2(target.x - origin.x, target.z - origin.z);
        for (let i = -1; i <= 1; i++) {
          const ang = base + i * 0.12;
          this.game.projectiles.spawn({
            position: origin.clone(),
            velocity: V3(Math.sin(ang) * 12, 4.5, Math.cos(ang) * 12),
            color: 0xc7a36a, radius: 0.38, damage: 1, life: 3.0,
            gravity: 12, glowScale: 1.4,
          });
        }
        this._finishAction(2.5);
      }
      return;
    }

    if (a.kind === 'charge') {
      if (!a.done && a.t <= 0) {
        a.done = true;
        const dir = player.position.clone().sub(this.position);
        dir.y = 0;
        a.dir = dir.lengthSq() > 0.001 ? dir.normalize() : V3(0, 0, 1);
        a.contact = true;
        a.duration = 0.75;
        a.t = 0.75;
        this.game.sfx('bossRoar', 0.7);
      }
      if (a.done && a.dir) {
        this.position.addScaledVector(a.dir, 18 * dt);
        this.movePhase += dt * 18;
        this.effects.footstep(this.position.clone(), 0x9c8d68);
        if (a.t <= 0) this._finishAction(2.2);
      }
    }
  }
}

/* ============================================================
   Rune Sentinel
   ============================================================ */
class RuneSentinel extends Boss {
  constructor(game, spec) {
    super(game, spec);
    this.color = 0xffd28a;
    this.radius = 2.1;
    this.centerHeight = 2.5;
    this.hover = 1.1;
  }

  build() {
    const stone = new THREE.MeshStandardMaterial({
      color: 0x9d937a, roughness: 0.82, metalness: 0.1, flatShading: true,
      envMapIntensity: 0.8,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x3a3d37, roughness: 0.7, metalness: 0.35, envMapIntensity: 0.9,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffdd9a, emissive: 0xffb45c, emissiveIntensity: 2.3,
      roughness: 0.18, metalness: 0.25,
    });
    this.coreMat = glowMat;

    const body = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), stone);
    body.position.y = 2.6;
    body.scale.set(1, 1.4, 1);
    this.group.add(body);
    this.torso = body;

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), glowMat);
    core.position.set(0, 2.6, 0.9);
    this.group.add(core);
    this.core = core;

    // floating crown
    const crown = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 6, 32), dark);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 4.1;
    this.group.add(crown);
    this.crown = crown;

    this.shards = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), glowMat);
      shard.position.set(Math.cos(a) * 1.55, 2.6 + Math.sin(i) * 0.2, Math.sin(a) * 1.55);
      this.group.add(shard);
      this.shards.push({ mesh: shard, a });
    }

    // rune tablets around the body
    this.tablets = [];
    const tabMat = new THREE.MeshStandardMaterial({ color: 0x6d6655, roughness: 0.85, metalness: 0.15 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.5, 0.16), tabMat);
      tablet.position.set(Math.cos(a) * 2.0, 2.5, Math.sin(a) * 2.0);
      tablet.rotation.y = -a;
      this.group.add(tablet);
      this.tablets.push({ mesh: tablet, a });
    }

    // arms of stone
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 1.8, 6), stone);
      arm.position.set(sx * 1.35, 2.2, 0);
      arm.rotation.z = sx * -0.5;
      this.group.add(arm);
    }

    const glow = makeGlowSprite({ color: 0xffd28a, size: 6, opacity: 0.3, texture: GLOW });
    glow.position.y = 2.6;
    this.group.add(glow);
    this.glow = glow;
  }

  idleMotion() {
    this.position.y = this.home.y + this.hover + Math.sin(this.time * 1.3) * 0.15;
    this.crown.rotation.z += 0.01;
    this.core.rotation.y += 0.02;
  }

  animate(dt) {
    const bob = Math.sin(this.time * 1.4) * 0.18;
    this.position.y = this.home.y + this.hover + bob;
    this.core.rotation.y += dt * 2.0;
    this.core.rotation.x = Math.sin(this.time) * 0.25;
    this.crown.rotation.z += dt * 0.8;
    this.shards.forEach((s, i) => {
      const a = s.a + this.time * (0.5 + i * 0.04);
      s.mesh.position.set(Math.cos(a) * 1.55, 2.6 + Math.sin(this.time * 1.3 + i) * 0.28, Math.sin(a) * 1.55);
      s.mesh.rotation.y += dt * 2;
    });
    this.tablets.forEach((t, i) => {
      t.mesh.rotation.y = -t.a + Math.sin(this.time * 0.7 + i) * 0.2;
      t.mesh.position.y = 2.5 + Math.sin(this.time * 1.1 + i * 1.4) * 0.18;
    });
    if (this.telegraph > 0) {
      this.group.scale.setScalar(1 + Math.sin(this.time * 24) * 0.015 * this.telegraph);
    } else {
      this.group.scale.setScalar(1);
    }
    if (this.glow) this.glow.material.opacity = 0.24 + Math.sin(this.time * 2.2) * 0.07;
    this.coreMat.emissiveIntensity = 2.0 + Math.sin(this.time * 3.1) * 0.4 + this.hitFlash * 8;
    this.group.rotation.y = this.facing;
  }

  move(dt, player, dist) {
    // Hovers around the arena rather than chasing directly.
    if (!this.action) {
      const orbit = this.home.clone().add(V3(
        Math.cos(this.time * 0.3) * 8.2,
        0,
        Math.sin(this.time * 0.3) * 8.2,
      ));
      this._moveToward(dt, orbit, 1.8, 0.5);
      const look = player.position.clone().sub(this.position);
      this.facing = Math.atan2(look.x, look.z);
    }
  }

  chooseAction(dist) {
    const roll = Math.random();
    if (this.phase >= 2 && roll < 0.45) {
      this.action = { kind: 'burst', t: 0.75, duration: 0.75, done: false };
    } else if (roll < 0.72) {
      this.action = { kind: 'volley', t: 0.55, duration: 0.55, done: false };
    } else {
      this.action = { kind: 'blink', t: 0.35, duration: 0.35, done: false };
    }
  }

  updateAction(dt, player) {
    const a = this.action;
    a.t -= dt;
    this.telegraph = clamp(a.t / a.duration, 0, 1);

    if (a.kind === 'volley' && a.t <= 0 && !a.done) {
      a.done = true;
      this.game.sfx('shoot');
      const origin = this.center.clone();
      this._fireFan(origin, player.position.clone().add(V3(0, 1, 0)), 5, 0.13, 14, 0xffd28a, 0.22);
      this.effects.burst(origin, { count: 18, speed: 4, size: 0.16, life: 0.4, colors: [0xffd28a, 0xffffff] });
      this._finishAction(2.0);
    } else if (a.kind === 'burst' && a.t <= 0 && !a.done) {
      a.done = true;
      this.game.sfx('shockwave');
      this._fireRing(this.center.clone(), 14, 11, 0xffc46a, 0.23, rand(0, TAU));
      this._finishAction(2.4);
    } else if (a.kind === 'blink' && a.t <= 0 && !a.done) {
      a.done = true;
      this.effects.burst(this.center, { count: 30, speed: 5, size: 0.18, life: 0.6, colors: [0xffd28a, 0xffffff] });
      const angle = rand(0, TAU);
      const r = rand(5, this.arenaRadius - 3);
      this.position.x = this.home.x + Math.cos(angle) * r;
      this.position.z = this.home.z + Math.sin(angle) * r;
      this.effects.shockwave(this.position.clone(), { color: 0xffd28a, radius: 4, duration: 0.6, y: this.position.y + 0.1 });
      this.game.sfx('portal', 0.4);
      this._finishAction(1.4);
    }
  }
}

/* ============================================================
   Prism Warden
   ============================================================ */
class PrismWarden extends Boss {
  constructor(game, spec) {
    super(game, spec);
    this.color = 0x8ff7ff;
    this.radius = 2.2;
    this.centerHeight = 2.4;
    this.hover = 1.4;
  }

  build() {
    const crystal = new THREE.MeshPhysicalMaterial({
      color: 0x7ff5ea, emissive: 0x20a9b0, emissiveIntensity: 1.8,
      metalness: 0.05, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04,
      transparent: true, opacity: 0.95, envMapIntensity: 1.9, flatShading: true,
    });
    const violet = new THREE.MeshPhysicalMaterial({
      color: 0xb48cff, emissive: 0x5522aa, emissiveIntensity: 1.6,
      metalness: 0.08, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05,
      transparent: true, opacity: 0.95, envMapIntensity: 1.9, flatShading: true,
    });
    this.coreMat = crystal;

    const body = new THREE.Mesh(new THREE.OctahedronGeometry(1.35, 0), crystal);
    body.position.y = 2.7;
    body.scale.set(0.9, 1.55, 0.9);
    this.group.add(body);
    this.torso = body;

    const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), violet);
    heart.position.set(0, 2.7, 0.65);
    this.group.add(heart);
    this.core = heart;

    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x9ffff4, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.055, 5, 48), this.ringMat);
    this.ring.rotation.x = Math.PI / 2.1;
    this.ring.position.y = 2.7;
    this.group.add(this.ring);

    this.ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.035, 4, 36), this.ringMat);
    this.ring2.rotation.y = Math.PI / 2.3;
    this.ring2.position.y = 2.7;
    this.group.add(this.ring2);

    this.shards = [];
    for (let i = 0; i < 8; i++) {
      const mat = i % 2 ? violet : crystal;
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.34 + (i % 3) * 0.08, 0), mat);
      const a = (i / 8) * TAU;
      shard.position.set(Math.cos(a) * 2.2, 2.7 + Math.sin(i * 1.3) * 0.35, Math.sin(a) * 2.2);
      this.group.add(shard);
      this.shards.push({ mesh: shard, a, r: 2.2 });
    }

    const glow = makeGlowSprite({ color: 0x8ff7ff, size: 7, opacity: 0.32, texture: GLOW });
    glow.position.y = 2.7;
    this.group.add(glow);
    this.glow = glow;
  }

  idleMotion() {
    this.position.y = this.home.y + this.hover + Math.sin(this.time) * 0.2;
    this.core.rotation.y += 0.015;
  }

  animate(dt) {
    this.position.y = this.home.y + this.hover + Math.sin(this.time * 1.3) * 0.24;
    this.torso.rotation.y += dt * 0.9;
    this.core.rotation.y -= dt * 2.2;
    this.ring.rotation.z += dt * 0.7;
    this.ring2.rotation.x += dt * 0.5;
    this.shards.forEach((s, i) => {
      const a = s.a + this.time * (0.35 + i * 0.02);
      s.mesh.position.set(
        Math.cos(a) * s.r,
        2.7 + Math.sin(this.time * 1.2 + i * 0.8) * 0.4,
        Math.sin(a) * s.r,
      );
      s.mesh.rotation.x += dt * 1.2;
      s.mesh.rotation.y += dt * 1.6;
    });
    if (this.telegraph > 0) {
      this.group.scale.setScalar(1 + Math.sin(this.time * 26) * 0.02 * this.telegraph);
    } else {
      this.group.scale.setScalar(1);
    }
    if (this.glow) this.glow.material.opacity = 0.28 + Math.sin(this.time * 2.4) * 0.08;
    this.coreMat.emissiveIntensity = 1.6 + Math.sin(this.time * 3.4) * 0.35 + this.hitFlash * 6;
  }

  move(dt, player, dist) {
    if (!this.action) {
      const orbit = this.home.clone().add(V3(
        Math.cos(this.time * 0.24) * 6.8,
        0,
        Math.sin(this.time * 0.24) * 6.8,
      ));
      this._moveToward(dt, orbit, 1.6, 0.5);
      this.facing = Math.atan2(player.position.x - this.position.x, player.position.z - this.position.z);
      this.group.rotation.y = this.facing;
    }
  }

  chooseAction(dist) {
    const roll = Math.random();
    if (roll < 0.38) this.action = { kind: 'ring', t: 0.7, duration: 0.7, done: false };
    else if (roll < 0.7) this.action = { kind: 'rain', t: 1.4, duration: 1.4, done: false, spawned: 0, acc: 0 };
    else this.action = { kind: 'lance', t: 0.6, duration: 0.6, done: false };
  }

  updateAction(dt, player) {
    const a = this.action;
    a.t -= dt;
    this.telegraph = clamp(a.t / a.duration, 0, 1);

    if (a.kind === 'ring' && a.t <= 0 && !a.done) {
      a.done = true;
      this.game.sfx('shockwave');
      this._fireRing(this.center.clone(), 12, 10, 0x8ff7ff, 0.24, rand(0, TAU));
      this.effects.burst(this.center, { count: 24, speed: 4, size: 0.18, life: 0.5, colors: [0x8ff7ff, 0xd1b0ff] });
      this._finishAction(2.2);
    } else if (a.kind === 'rain') {
      a.acc += dt;
      if (a.acc > 0.2 && a.spawned < 7) {
        a.acc = 0;
        a.spawned++;
        const p = player.position.clone();
        p.x += rand(-2.8, 2.8);
        p.z += rand(-2.8, 2.8);
        p.y += 13;
        this.game.projectiles.spawn({
          position: p,
          velocity: V3(0, -22, 0),
          color: a.spawned % 2 ? 0xd1b0ff : 0x8ff7ff,
          radius: 0.27, damage: 1, life: 2.2, glowScale: 1.2,
        });
      }
      if (a.t <= 0 && !a.done) {
        a.done = true;
        this.game.sfx('shoot');
        this._finishAction(2.3);
      }
    } else if (a.kind === 'lance' && a.t <= 0 && !a.done) {
      a.done = true;
      this.game.sfx('shoot');
      const origin = this.center.clone();
      const target = player.center.clone();
      const base = Math.atan2(target.x - origin.x, target.z - origin.z);
      for (let i = -1; i <= 1; i++) {
        const ang = base + i * 0.06;
        this.game.projectiles.spawn({
          position: origin.clone(),
          velocity: V3(Math.sin(ang) * 20, 0.2, Math.cos(ang) * 20),
          color: i === 0 ? 0xffffff : 0x8ff7ff,
          radius: 0.2, damage: 1, life: 2.4, glowScale: 1.1,
        });
      }
      this._finishAction(1.8);
    }
  }
}

/* ============================================================
   Storm Drake
   ============================================================ */
class StormDrake extends Boss {
  constructor(game, spec) {
    super(game, spec);
    this.color = 0xd8feff;
    this.radius = 2.8;
    this.centerHeight = 2.2;
    this.hover = 4.0;
  }

  build() {
    const hide = new THREE.MeshStandardMaterial({
      color: 0x3d668f, roughness: 0.62, metalness: 0.12,
      emissive: 0x101f36, emissiveIntensity: 0.8, envMapIntensity: 1.0, flatShading: true,
    });
    const belly = new THREE.MeshStandardMaterial({
      color: 0x9fd8e8, roughness: 0.55, metalness: 0.08,
      emissive: 0x1d4a5e, emissiveIntensity: 0.6, flatShading: true,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xd8feff, emissive: 0x7fe8ff, emissiveIntensity: 3,
      roughness: 0.12, metalness: 0.1,
    });
    this.coreMat = glowMat;

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 2.2, 6, 12), hide);
    body.rotation.x = Math.PI / 2.2;
    body.position.set(0, 2.8, 0);
    this.group.add(body);
    this.torso = body;

    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.2, 5, 10), belly);
    chest.rotation.x = Math.PI / 2.2;
    chest.position.set(0, 2.45, 0.35);
    this.group.add(chest);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, 1.5, 8), hide);
    neck.position.set(0, 3.7, 1.1);
    neck.rotation.x = 0.6;
    this.group.add(neck);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.6, 7), hide);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 4.2, 2.05);
    this.group.add(head);
    this.head = head;

    for (const sx of [-0.26, 0.26]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xd8feff, toneMapped: false }));
      eye.position.set(sx, 4.26, 2.55);
      this.group.add(eye);
    }
    // horns
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.0, 5), belly);
      horn.position.set(sx * 0.4, 4.75, 1.8);
      horn.rotation.z = sx * 0.45;
      this.group.add(horn);
    }

    // wings — pivots let them flap
    this.wings = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.7, 3.25, 0.1);
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3.4, 4), hide);
      wing.rotation.z = sx * Math.PI / 2;
      wing.rotation.x = -0.2;
      wing.position.set(sx * 1.7, 0.2, 0);
      wing.scale.z = 0.18;
      pivot.add(wing);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.8, 4), belly);
      tip.rotation.z = sx * Math.PI / 2;
      tip.position.set(sx * 3.4, 0.65, 0);
      tip.scale.z = 0.18;
      pivot.add(tip);
      this.group.add(pivot);
      this.wings.push(pivot);
    }

    // tail
    this.tail = new THREE.Group();
    this.tail.position.set(0, 2.7, -1.5);
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.ConeGeometry(0.42 - i * 0.1, 1.4, 5), hide);
      seg.rotation.x = Math.PI / 2;
      seg.position.set(0, 0.1, -i * 1.1);
      this.tail.add(seg);
    }
    const tailTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), glowMat);
    tailTip.position.set(0, 0.1, -3.4);
    this.tail.add(tailTip);
    this.group.add(this.tail);

    // legs / claws
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), hide);
      leg.position.set(sx * 0.55, 1.8, 0.35);
      leg.rotation.x = 0.5;
      this.group.add(leg);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.65, 5), belly);
      claw.position.set(sx * 0.65, 1.15, 0.75);
      claw.rotation.x = 0.7;
      this.group.add(claw);
    }

    // storm core
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), glowMat);
    core.position.set(0, 2.7, 0.9);
    this.group.add(core);
    this.core = core;

    const glow = makeGlowSprite({ color: 0xc8f4ff, size: 7, opacity: 0.32, texture: GLOW });
    glow.position.y = 3.0;
    this.group.add(glow);
    this.glow = glow;

    this.light = new THREE.PointLight(0xbfeaff, 2.2, 20, 2);
    this.light.position.y = 3;
    this.group.add(this.light);
  }

  idleMotion() {
    this.position.y = this.home.y + this.hover + Math.sin(this.time * 1.2) * 0.25;
    this.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(this.time * 2) * 0.15; });
    this.core.rotation.y += 0.02;
  }

  animate(dt) {
    if (!this.action || this.action.kind !== 'dive' || !this.action.contact) {
      this.position.y = this.home.y + this.hover + Math.sin(this.time * 1.3) * 0.28;
    }
    const flap = this.time * (this.action?.kind === 'dive' ? 16 : 3.4);
    this.wings.forEach((w, i) => {
      w.rotation.z = (i ? -1 : 1) * (Math.sin(flap) * 0.32 + 0.18);
    });
    this.tail.rotation.y = Math.sin(this.time * 2.1) * 0.15;
    this.core.rotation.y += dt * 2.4;
    this.core.rotation.x += dt * 1.3;
    this.head.rotation.x = 0.1 + Math.sin(this.time * 1.7) * 0.05;
    if (this.telegraph > 0) {
      this.group.scale.setScalar(1 + Math.sin(this.time * 28) * 0.02 * this.telegraph);
    } else {
      this.group.scale.setScalar(1);
    }
    this.coreMat.emissiveIntensity = 2.8 + Math.sin(this.time * 4) * 0.6 + this.hitFlash * 8;
    if (this.glow) this.glow.material.opacity = 0.28 + Math.sin(this.time * 3) * 0.08;
    this.light.intensity = 2.0 + Math.sin(this.time * 4.2) * 0.4;
    this.group.rotation.y = this.facing;
  }

  move(dt, player, dist) {
    if (this.action) return;
    // Circle the player from above.
    const orbit = player.position.clone().add(V3(
      Math.cos(this.time * 0.55) * 8.5,
      0,
      Math.sin(this.time * 0.55) * 8.5,
    ));
    this._moveToward(dt, orbit, 5.5, 1.0);
    this.facing = Math.atan2(player.position.x - this.position.x, player.position.z - this.position.z);
  }

  chooseAction(dist) {
    const roll = Math.random();
    if (this.phase >= 2 && roll < 0.42) {
      this.action = { kind: 'lightning', t: 1.15, duration: 1.15, done: false, spawned: 0, acc: 0 };
    } else if (roll < 0.7) {
      this.action = { kind: 'dive', t: 0.65, duration: 0.65, done: false, contact: false, dir: null };
    } else {
      this.action = { kind: 'gale', t: 0.6, duration: 0.6, done: false };
    }
  }

  updateAction(dt, player) {
    const a = this.action;
    a.t -= dt;
    this.telegraph = clamp(a.t / a.duration, 0, 1);

    if (a.kind === 'lightning') {
      a.acc += dt;
      if (a.acc > 0.22 && a.spawned < 6) {
        a.acc = 0;
        a.spawned++;
        const p = player.position.clone();
        p.x += rand(-3.4, 3.4);
        p.z += rand(-3.4, 3.4);
        p.y = this.home.y + 18;
        this.game.projectiles.spawn({
          position: p,
          velocity: V3(rand(-1.5, 1.5), -28, rand(-1.5, 1.5)),
          color: 0xd8feff, radius: 0.24, damage: 1, life: 2.0, glowScale: 1.5,
        });
      }
      if (a.t <= 0 && !a.done) {
        a.done = true;
        this.game.sfx('shockwave');
        this._finishAction(2.4);
      }
    } else if (a.kind === 'gale' && a.t <= 0 && !a.done) {
      a.done = true;
      this.game.sfx('shockwave');
      this._fireRing(this.center.clone(), 16, 13, 0xbfeaff, 0.22, rand(0, TAU));
      this._finishAction(2.0);
    } else if (a.kind === 'dive') {
      if (!a.done && a.t <= 0) {
        a.done = true;
        const dir = player.position.clone().sub(this.position);
        dir.y = 0;
        a.dir = dir.lengthSq() > 0.001 ? dir.normalize() : V3(0, 0, 1);
        a.contact = true;
        a.duration = 0.8;
        a.t = 0.8;
        this.game.sfx('bossRoar', 0.7);
      }
      if (a.done && a.dir) {
        this.position.addScaledVector(a.dir, 21 * dt);
        this.position.y = damp(this.position.y, this.home.y + 1.2, 5, dt);
        this.effects.dashTrail(this.center.clone(), 0xc8f4ff);
        if (a.t <= 0) {
          this.position.y = this.home.y + this.hover;
          this._finishAction(2.1);
        }
      }
    }
  }
}

const BOSS_TYPES = {
  golem: MossGolem,
  sentinel: RuneSentinel,
  prism: PrismWarden,
  drake: StormDrake,
};

export function createBoss(game, spec) {
  const Ctor = BOSS_TYPES[spec.type] || MossGolem;
  return new Ctor(game, spec);
}

export function disposeBoss(boss) {
  if (!boss) return;
  boss.game.scene.remove(boss.group);
  disposeGroup(boss.group);
}
