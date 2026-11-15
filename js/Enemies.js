/* ============================================================
   Enemies & projectiles

   Three regular enemy archetypes with distinct behaviour:
     • mossling — ground patroller that charges and lunges
     • wisp     — floating ranged orbiter
     • sentry   — stationary rune turret firing aimed bursts

   EnemySystem owns the enemies for the current zone. ProjectileSystem
   is shared by regular enemies, bosses and environmental attacks.
   ============================================================ */
import * as THREE from 'three';
import {
  clamp, damp, rand, TAU, makeGlowSprite, makeRadialTexture,
} from './Utils.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GLOW = makeRadialTexture(96, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.16);

const PALETTES = {
  meadow: {
    body: 0x4f8a44, dark: 0x2c512c, leaf: 0x83c05c, accent: 0xd8ff9a,
    eye: 0xffe9a6, orb: 0xffd98a, stone: 0x8b8673,
  },
  stone: {
    body: 0x8e8875, dark: 0x534e42, leaf: 0xa7a26a, accent: 0xffd28a,
    eye: 0xffc46a, orb: 0xffcf7e, stone: 0xa39a83,
  },
  crystal: {
    body: 0x3f8388, dark: 0x17373d, leaf: 0x7ff5e8, accent: 0x9ffff4,
    eye: 0xcbfffa, orb: 0x8ff7ec, stone: 0x2d5960,
  },
  storm: {
    body: 0x5d7f9a, dark: 0x2a3e55, leaf: 0x9fe6ef, accent: 0xd8feff,
    eye: 0xe8ffff, orb: 0xc8f4ff, stone: 0x6b7d8d,
  },
};

const TYPE_STATS = {
  mossling: { hp: 4, speed: 3.1, radius: 0.72, reach: 2.3, name: 'Mossling' },
  wisp: { hp: 3, speed: 3.8, radius: 0.62, reach: 2.5, name: 'Aether Wisp' },
  sentry: { hp: 6, speed: 0, radius: 0.85, reach: 2.7, name: 'Rune Sentry' },
};

function disposeGroup(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m && m.dispose) m.dispose(); });
    }
  });
}

/* ============================================================
   Projectiles
   ============================================================ */
export class ProjectileSystem {
  constructor(scene, effects, game) {
    this.scene = scene;
    this.effects = effects;
    this.game = game;
    this.list = [];
    this.geo = new THREE.IcosahedronGeometry(1, 1);
  }

  /**
   * @param {object} opts
   *  position, velocity, color, radius, damage, life, gravity,
   *  homing (0..1 steering per second), owner ('enemy'|'boss'), glowScale
   */
  spawn(opts) {
    const {
      position, velocity, color = 0xffd98a, radius = 0.2, damage = 1,
      life = 2.4, gravity = 0, homing = 0, glowScale = 1,
    } = opts;

    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.scale.setScalar(radius);
    mesh.position.copy(position);
    const glow = makeGlowSprite({
      color, size: 3.6 * glowScale, opacity: 0.7, texture: GLOW,
    });
    mesh.add(glow);
    this.scene.add(mesh);

    this.list.push({
      mesh, mat, glow, color, radius, damage, life, age: 0,
      velocity: velocity.clone(), gravity, homing,
    });
  }

  update(dt, player) {
    const active = !!player && !player.dead;
    const playerCenter = player ? player.center : null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;

      if (p.homing > 0 && active) {
        const to = playerCenter.clone().sub(p.mesh.position);
        const d = to.length();
        if (d > 0.001) {
          const speed = p.velocity.length();
          const desired = to.divideScalar(d).multiplyScalar(speed);
          const k = clamp(p.homing * dt, 0, 1);
          p.velocity.lerp(desired, k);
        }
      }
      if (p.gravity) p.velocity.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 7;
      p.mesh.rotation.y += dt * 9;
      p.glow.material.opacity = 0.55 + Math.sin(p.age * 18) * 0.2;

      let remove = p.age >= p.life;

      if (!remove && active) {
        const dx = p.mesh.position.x - playerCenter.x;
        const dy = p.mesh.position.y - playerCenter.y;
        const dz = p.mesh.position.z - playerCenter.z;
        if (dx * dx + dy * dy + dz * dz < (p.radius + 0.78) * (p.radius + 0.78)) {
          player.takeDamage(p.damage, p.mesh.position, { knockback: 6.5, up: 4.0, iframes: 1.0 });
          this.effects.burst(p.mesh.position, {
            count: 16, speed: 5, size: 0.18, life: 0.4,
            colors: [p.color, 0xffffff], gravity: 0,
          });
          remove = true;
        }
      }

      if (!remove && (p.mesh.position.y < -70 || p.mesh.position.y > 120)) remove = true;

      if (remove) this._remove(i);
    }
  }

  _remove(i) {
    const p = this.list[i];
    this.scene.remove(p.mesh);
    p.mat.dispose();
    p.glow.material.dispose();
    this.list.splice(i, 1);
  }

  clear() {
    for (let i = this.list.length - 1; i >= 0; i--) this._remove(i);
  }
}

/* ============================================================
   Regular enemies
   ============================================================ */
class Enemy {
  constructor(game, spec) {
    this.game = game;
    this.scene = game.scene;
    this.world = game.world;
    this.effects = game.effects;
    this.zone = spec.zone;
    this.type = spec.type;
    this.variant = spec.variant || spec.zone;
    this.palette = PALETTES[this.variant] || PALETTES.meadow;
    this.stats = TYPE_STATS[this.type] || TYPE_STATS.mossling;
    this.name = this.stats.name;
    this.color = this.palette.orb;

    this.home = spec.position.clone();
    this.position = spec.position.clone();
    this.velocity = V3();
    this.radius = this.stats.radius;
    this.maxHp = this.stats.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.dying = 0;
    this.hitFlash = 0;
    this.time = rand(0, 10);
    this.hitCooldown = 0;
    this.attackCooldown = rand(0.8, 2.2);
    this.patrolRadius = spec.patrol || 0;
    this.wanderAngle = rand(0, TAU);
    this.wanderTimer = rand(1.5, 3.5);
    this.aggro = false;
    this.state = 'idle';
    this.facing = rand(0, TAU);
    this.chargeTimer = 0;
    this.charging = false;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this._build();
  }

  get center() {
    const h = this.type === 'wisp' ? 0.6 : this.type === 'sentry' ? 1.25 : 0.72;
    return this.position.clone().add(V3(0, h, 0));
  }

  /* ---------------- visuals ---------------- */
  _build() {
    const p = this.palette;
    if (this.type === 'wisp') this._buildWisp(p);
    else if (this.type === 'sentry') this._buildSentry(p);
    else this._buildMossling(p);
    this.group.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
    });
  }

  _buildMossling(p) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: p.body, roughness: 0.92, metalness: 0.02,
      emissive: new THREE.Color(p.dark).multiplyScalar(0.18), emissiveIntensity: 0.4,
      envMapIntensity: 0.7,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: p.dark, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: p.leaf, roughness: 0.85, flatShading: true,
      emissive: new THREE.Color(p.leaf).multiplyScalar(0.1), emissiveIntensity: 0.4,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: p.eye, toneMapped: false });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), bodyMat);
    body.scale.set(1.05, 0.9, 0.95);
    body.position.y = 0.7;
    this.group.add(body);
    this.body = body;

    // mossy back and head crown
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(rand(0.1, 0.2), rand(0.24, 0.5), 4), leafMat);
      leaf.position.set(rand(-0.4, 0.4), 1.08 + rand(-0.05, 0.18), rand(-0.3, 0.3));
      leaf.rotation.z = rand(-0.5, 0.5);
      leaf.rotation.x = rand(-0.4, 0.4);
      this.group.add(leaf);
    }

    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), darkMat);
    snout.scale.set(1, 0.7, 1.2);
    snout.position.set(0, 0.66, 0.42);
    this.group.add(snout);

    for (const sx of [-0.19, 0.19]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), eyeMat);
      eye.position.set(sx, 0.86, 0.4);
      this.group.add(eye);
    }

    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.26, 3, 6), darkMat);
      leg.position.set(sx * 0.3, 0.25, 0);
      this.group.add(leg);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 3, 6), bodyMat);
      arm.position.set(sx * 0.56, 0.66, 0.12);
      arm.rotation.z = sx * 0.4;
      this.group.add(arm);
    }

    const glow = makeGlowSprite({ color: p.orb, size: 2.2, opacity: 0.24, texture: GLOW });
    glow.position.y = 0.75;
    this.group.add(glow);
    this.glow = glow;
  }

  _buildWisp(p) {
    this.coreMat = new THREE.MeshStandardMaterial({
      color: p.orb, emissive: new THREE.Color(p.orb).multiplyScalar(0.7),
      emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1,
      transparent: true, opacity: 0.95,
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), this.coreMat);
    core.position.y = 0.6;
    this.group.add(core);
    this.core = core;

    const shellMat = new THREE.MeshBasicMaterial({
      color: p.eye, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, wireframe: true,
    });
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.66, 1), shellMat);
    shell.position.y = 0.6;
    this.group.add(shell);
    this.shell = shell;

    this.ringMat = new THREE.MeshBasicMaterial({
      color: p.orb, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.025, 4, 32), this.ringMat);
    this.ring.rotation.x = Math.PI / 2.4;
    this.ring.position.y = 0.6;
    this.group.add(this.ring);

    this.ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.018, 4, 24), this.ringMat);
    this.ring2.rotation.y = Math.PI / 2.2;
    this.ring2.position.y = 0.6;
    this.group.add(this.ring2);

    this.glow = makeGlowSprite({ color: p.orb, size: 2.8, opacity: 0.42, texture: GLOW });
    this.glow.position.y = 0.6;
    this.group.add(this.glow);

    this.light = new THREE.PointLight(p.orb, 1.0, 9, 2);
    this.light.position.y = 0.6;
    this.group.add(this.light);
  }

  _buildSentry(p) {
    const stoneMat = new THREE.MeshStandardMaterial({
      color: p.stone, roughness: 0.9, metalness: 0.05,
      emissive: new THREE.Color(p.dark).multiplyScalar(0.2), emissiveIntensity: 0.4,
      envMapIntensity: 0.7,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: p.orb, emissive: new THREE.Color(p.orb).multiplyScalar(0.8),
      emissiveIntensity: 2.4, roughness: 0.12, metalness: 0.15,
    });
    this.coreMat = coreMat;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.66, 0.5, 6), stoneMat);
    base.position.y = 0.3;
    this.group.add(base);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 1.0, 6), stoneMat);
    body.position.y = 1.0;
    this.group.add(body);
    this.body = body;
    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), stoneMat);
    head.position.y = 1.72;
    this.group.add(head);
    this.head = head;

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.19, 0), coreMat);
    core.position.set(0, 1.02, 0.35);
    this.group.add(core);
    this.core = core;

    this.ringMat = new THREE.MeshBasicMaterial({
      color: p.orb, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.03, 4, 28), this.ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 1.72;
    this.group.add(this.ring);

    this.glow = makeGlowSprite({ color: p.orb, size: 2.6, opacity: 0.34, texture: GLOW });
    this.glow.position.y = 1.15;
    this.group.add(this.glow);

    this.light = new THREE.PointLight(p.orb, 0.8, 10, 2);
    this.light.position.y = 1.15;
    this.group.add(this.light);

    // two floating side tablets
    const tabMat = new THREE.MeshStandardMaterial({ color: p.stone, roughness: 0.85, metalness: 0.1 });
    this.tablets = [];
    for (const sx of [-1, 1]) {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.34), tabMat);
      tab.position.set(sx * 0.78, 1.18, 0);
      this.group.add(tab);
      this.tablets.push(tab);
    }
  }

  /* ---------------- combat ---------------- */
  tryHit(playerPos, facing) {
    if (!this.alive) return false;
    const c = this.center;
    const dx = c.x - playerPos.x;
    const dz = c.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > this.stats.reach + 1.15) return false;
    if (Math.abs(c.y - (playerPos.y + 1.0)) > (this.type === 'sentry' ? 2.5 : 2.2)) return false;
    if (dist > 0.001) {
      const dot = (dx / dist) * Math.sin(facing) + (dz / dist) * Math.cos(facing);
      if (dot < -0.05) return false;
    }
    return true;
  }

  takeDamage(amount = 1, source = null) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.hitFlash = 0.16;
    if (source) {
      const dir = this.position.clone().sub(source);
      dir.y = 0;
      if (dir.lengthSq() > 0.001) {
        dir.normalize();
        this.velocity.addScaledVector(dir, this.type === 'mossling' ? 2.6 : 0.8);
      }
    }
    if (this.hp <= 0) {
      this._die();
      return true;
    }
    return false;
  }

  _die() {
    if (!this.alive) return;
    this.alive = false;
    this.dying = 0.55;
    this.effects.enemyDeath(this.center, this.color);
    this.game.sfx('enemyDie');
    this.game.onEnemyKilled?.(this);
    if (this.light) this.light.intensity = 0;
  }

  /* ---------------- simulation ---------------- */
  update(dt, player) {
    this.time += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;

    if (!this.alive) {
      this.dying -= dt;
      const k = clamp(this.dying / 0.55, 0, 1);
      this.group.scale.setScalar(Math.max(0.001, k));
      this.group.rotation.y += dt * 3;
      if (this.dying <= 0) this.group.visible = false;
      return;
    }

    const toPlayer = player.position.clone().sub(this.position);
    const dist = Math.hypot(toPlayer.x, toPlayer.z);
    const vertical = Math.abs(this.position.y - player.position.y);

    if (this.type === 'mossling') this._updateMossling(dt, player, dist, vertical);
    else if (this.type === 'wisp') this._updateWisp(dt, player, dist, vertical);
    else this._updateSentry(dt, player, dist, vertical);

    // visual response to damage
    const flash = this.hitFlash > 0 ? 1 + this.hitFlash * 2.4 : 1;
    this.group.scale.setScalar(this.type === 'mossling' ? flash : 1);
    if (this.coreMat) this.coreMat.emissiveIntensity = 2.0 + Math.sin(this.time * 4) * 0.35 + (this.hitFlash > 0 ? 2.5 : 0);
    if (this.glow) this.glow.material.opacity = 0.28 + Math.sin(this.time * 2.6 + 1) * 0.08;

    this.group.position.copy(this.position);
  }

  _updateMossling(dt, player, dist, vertical) {
    const aggro = dist < 14 && vertical < 7;
    this.aggro = aggro;

    if (aggro) {
      const dir = player.position.clone().sub(this.position);
      dir.y = 0;
      if (dir.lengthSq() > 0.001) dir.normalize();
      this.facing = Math.atan2(dir.x, dir.z);

      const moving = dist > 1.9;
      if (moving) {
        const speed = this.stats.speed * (this.charging ? 2.1 : 1);
        this.velocity.x = damp(this.velocity.x, dir.x * speed, 8, dt);
        this.velocity.z = damp(this.velocity.z, dir.z * speed, 8, dt);
      } else {
        this.velocity.x = damp(this.velocity.x, 0, 10, dt);
        this.velocity.z = damp(this.velocity.z, 0, 10, dt);
      }

      // close-range lunge telegraph
      if (dist < 3.6 && this.attackCooldown <= 0) {
        this.attackCooldown = 2.1;
        this.charging = true;
        this.chargeTimer = 0.42;
        this.velocity.x = dir.x * 11.5;
        this.velocity.z = dir.z * 11.5;
      }

      if (dist < 1.65 && vertical < 2.0 && this.hitCooldown <= 0) {
        this.hitCooldown = 1.0;
        player.takeDamage(1, this.center, { knockback: 7, up: 4.5 });
      }
    } else {
      // slow patrol orbit around home
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = rand(2.2, 4.4);
        this.wanderAngle = rand(0, TAU);
      }
      const radius = Math.max(0.6, this.patrolRadius);
      const target = this.home.clone().add(V3(
        Math.cos(this.wanderAngle) * radius * 0.7,
        0,
        Math.sin(this.wanderAngle) * radius * 0.7,
      ));
      const dir = target.clone().sub(this.position);
      dir.y = 0;
      if (dir.lengthSq() > 0.15) {
        dir.normalize();
        const speed = 1.15;
        this.velocity.x = damp(this.velocity.x, dir.x * speed, 5, dt);
        this.velocity.z = damp(this.velocity.z, dir.z * speed, 5, dt);
        this.facing = Math.atan2(dir.x, dir.z);
      } else {
        this.velocity.x = damp(this.velocity.x, 0, 6, dt);
        this.velocity.z = damp(this.velocity.z, 0, 6, dt);
      }
    }

    this.chargeTimer = Math.max(0, this.chargeTimer - dt);
    if (this.chargeTimer <= 0) this.charging = false;

    const nextX = this.position.x + this.velocity.x * dt;
    const nextZ = this.position.z + this.velocity.z * dt;
    const probe = V3(nextX, this.position.y + 0.4, nextZ);
    const ground = groundHeight(this.world, probe);
    // Don't walk into water or off a ledge. Without this a chase can drag a
    // ground enemy over the rim of a floating isle and drop it into the void.
    if (!this.world.inWater(probe) && ground !== null && ground > this.position.y - 2.5) {
      this.position.x = nextX;
      this.position.z = nextZ;
      this.position.y = ground;
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    this.group.rotation.y = this.facing;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const bob = Math.sin(this.time * (speed > 0.4 ? 10 : 2.4)) * (speed > 0.4 ? 0.06 : 0.03);
    if (this.body) this.body.position.y = 0.7 + bob;
    this.group.rotation.z = clamp(-this.velocity.x * 0.008, -0.08, 0.08);
  }

  _updateWisp(dt, player, dist, vertical) {
    const aggro = dist < 19 && vertical < 10;
    this.aggro = aggro;
    const orbitRadius = aggro ? 7.2 : Math.max(2.5, this.patrolRadius || 3);
    const target = aggro
      ? player.position.clone().add(V3(
        Math.cos(this.time * 0.75) * orbitRadius,
        3.4 + Math.sin(this.time * 1.1) * 0.6,
        Math.sin(this.time * 0.75) * orbitRadius,
      ))
      : this.home.clone().add(V3(
        Math.cos(this.time * 0.5) * orbitRadius,
        0.4 + Math.sin(this.time * 1.4) * 0.7,
        Math.sin(this.time * 0.5) * orbitRadius,
      ));

    this.position.lerp(target, 1 - Math.exp(-1.8 * dt));
    if (aggro) {
      const look = player.position.clone().sub(this.position);
      this.facing = Math.atan2(look.x, look.z);
      this.group.rotation.y = this.facing;

      if (this.attackCooldown <= 0 && dist < 17) {
        this.attackCooldown = rand(2.3, 3.3);
        const origin = this.center;
        const aim = player.center.clone().sub(origin).normalize();
        const speed = 12.5;
        this.game.projectiles.spawn({
          position: origin,
          velocity: aim.multiplyScalar(speed),
          color: this.palette.orb,
          radius: 0.19,
          damage: 1,
          life: 2.2,
          glowScale: 1.1,
        });
        this.game.sfx('shoot', 0.7);
        this.game.effects.burst(origin, {
          count: 8, speed: 2.5, size: 0.12, life: 0.3, colors: [this.palette.orb, 0xffffff],
        });
      }
    }

    this.core.rotation.y += dt * 2.2;
    this.core.rotation.z = Math.sin(this.time * 1.2) * 0.18;
    this.shell.rotation.y -= dt * 0.8;
    this.shell.rotation.x += dt * 0.4;
    this.ring.rotation.z += dt * 1.5;
    this.ring2.rotation.x += dt * 1.1;
    const p = 0.9 + Math.sin(this.time * 3) * 0.1;
    this.light.intensity = 0.9 * p;
  }

  _updateSentry(dt, player, dist, vertical) {
    const aggro = dist < 21 && vertical < 9;
    this.aggro = aggro;
    if (aggro) {
      const look = player.position.clone().sub(this.position);
      this.facing = Math.atan2(look.x, look.z);
    }
    this.group.rotation.y = damp(this.group.rotation.y, this.facing, 4, dt);

    // hover / idle
    this.position.y = this.home.y + Math.sin(this.time * 1.3) * 0.08;
    if (this.tablets) {
      this.tablets.forEach((t, i) => {
        t.rotation.y += dt * (i ? 1.2 : -1.2);
        t.position.y = 1.18 + Math.sin(this.time * 1.8 + i * Math.PI) * 0.12;
      });
    }
    if (this.ring) this.ring.rotation.z += dt * 0.8;
    this.head.rotation.y += dt * 0.4;
    this.core.rotation.y -= dt * 1.8;
    const p = 0.85 + Math.sin(this.time * 2.6) * 0.15;
    this.light.intensity = 0.75 * p;

    if (aggro && this.attackCooldown <= 0) {
      this.attackCooldown = this.variant === 'storm' ? 2.0 : 2.6;
      this.game.sfx('shoot', 0.8);
      const origin = this.center;
      const base = Math.atan2(player.position.x - this.position.x, player.position.z - this.position.z);
      for (let i = -1; i <= 1; i++) {
        const a = base + i * 0.16;
        const aim = V3(Math.sin(a), 0.02, Math.cos(a));
        this.game.projectiles.spawn({
          position: origin.clone().add(V3(0, 0, 0)),
          velocity: aim.multiplyScalar(11.5),
          color: this.palette.orb,
          radius: 0.17,
          damage: 1,
          life: 2.6,
          glowScale: 0.9,
        });
      }
      this.game.effects.burst(origin, {
        count: 12, speed: 3.2, size: 0.13, life: 0.35, colors: [this.palette.orb, 0xffffff],
      });
    }
  }

  dispose() {
    this.scene.remove(this.group);
    disposeGroup(this.group);
  }
}

function groundHeight(world, position) {
  // Pick the highest collider top beneath the enemy's feet, with a small
  // step allowance so patrolling enemies follow platforms instead of walls.
  // Returns null when there is no floor under the probe at all.
  let best = -Infinity;
  for (const c of world.colliders) {
    if (!c.active || !c.box) continue;
    const b = c.box;
    if (position.x < b.min.x - 0.35 || position.x > b.max.x + 0.35) continue;
    if (position.z < b.min.z - 0.35 || position.z > b.max.z + 0.35) continue;
    if (b.max.y <= position.y + 0.65 && b.max.y > best) best = b.max.y;
  }
  return best === -Infinity ? null : best;
}

/* ============================================================
   EnemySystem — loads the enemies for a single zone.
   ============================================================ */
export class EnemySystem {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.zone = null;
  }

  load(zone) {
    this.clear();
    this.zone = zone;
    for (const spec of this.game.world.enemySpawns) {
      if (spec.zone !== zone) continue;
      this.enemies.push(new Enemy(this.game, spec));
    }
  }

  reload() { if (this.zone) this.load(this.zone); }

  clear() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
  }

  getTargets() {
    return this.enemies.filter((e) => e.alive);
  }

  get aliveCount() {
    return this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  }

  update(dt, player) {
    for (const e of this.enemies) e.update(dt, player);
  }
}
