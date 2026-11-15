/* ============================================================
   Player — collision-safe character controller at 120 Hz with
   coyote time, jump/dash buffering, double jump, wall slide &
   jump, ledge grab, 3-hit combo, i-frames, and a fully
   procedural stylized "Nova" character with animation blending.

   GLTF SWAP POINT:
   Replace buildCharacter() with a loaded GLTF scene and drive
   the AnimationMixer in updateVisual(). All gameplay state lives
   on this.position / this.velocity, independent of the visuals.
   ============================================================ */
import * as THREE from 'three';
import { clamp, damp, lerp, angleLerp, rand, TAU, makeRadialTexture, makeGlowSprite } from './Utils.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const RADIUS = 0.42;
const HEIGHT = 1.78;

export class Player {
  constructor(scene, world, effects, callbacks = {}) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.callbacks = callbacks;

    this.position = V3(0, 0.05, 8);
    this.velocity = V3();
    this.radius = RADIUS;
    this.height = HEIGHT;
    this.facing = Math.PI;
    this.targetFacing = Math.PI;

    this.maxHp = 5;
    this.hp = 5;
    this.dead = false;
    this.iframes = 0;
    this.hurtTimer = 0;

    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.dashBuffer = 0;
    this.jumpHeld = false;
    this.jumpsUsed = 0;
    this.standingOn = null;
    this.wallContact = null;
    this.wallSliding = false;
    this.wallJumpLock = 0;
    this.ledge = null;
    this.state = 'air';

    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.airDashUsed = false;
    this.dashDir = V3(0, 0, -1);
    this.dashTrailTimer = 0;

    this.attacking = false;
    this.attackStage = 0;
    this.attackTimer = 0;
    this.attackDuration = 0.4;
    this.attackHitTime = 0.14;
    this.attackHitDone = false;
    this.attackQueued = false;
    this.comboTimer = 0;
    this.swordVisible = false;

    this.stepTimer = 0;
    this.splashTimer = 0;
    this.landTimer = 0;
    this.landImpact = 0;
    this.runPhase = 0;
    this.time = 0;
    this.wasInWater = false;
    this.aimTarget = null;

    this.lastMove = V3();
    this.collisionContact = { x: 0, z: 0 };
    this.tmpBox = new THREE.Box3();

    this._buildCharacter();
    this._buildCompanion();
  }

  /* ============================================================
     Character construction (placeholder primitives)
     ============================================================ */
  _buildCharacter() {
    const suit = new THREE.MeshStandardMaterial({ color: 0xf1efe6, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.9 });
    const suitDark = new THREE.MeshStandardMaterial({ color: 0x253a47, roughness: 0.55, metalness: 0.18, envMapIntensity: 0.8 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x6ff7e8, emissive: 0x2bd8ce, emissiveIntensity: 1.5, roughness: 0.25, metalness: 0.1, toneMapped: true });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe3b35c, metalness: 0.75, roughness: 0.26, envMapIntensity: 1.2 });
    const visor = new THREE.MeshPhysicalMaterial({ color: 0x53e9e0, emissive: 0x1aa7a4, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04 });
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0xd95b66, roughness: 0.72, metalness: 0.02, side: THREE.DoubleSide });
    this.materials = { suit, suitDark, accent, gold, visor, scarf: scarfMat };

    const root = new THREE.Group();
    root.position.copy(this.position);
    this.root = root;
    this.scene.add(root);

    const visual = new THREE.Group();
    root.add(visual);
    this.visual = visual;

    const body = new THREE.Group();
    body.position.y = 0;
    visual.add(body);
    this.body = body;

    // torso
    const torsoGeo = new THREE.CapsuleGeometry(0.245, 0.36, 6, 12);
    const torso = new THREE.Mesh(torsoGeo, suit);
    torso.position.y = 1.17;
    torso.castShadow = true;
    body.add(torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.18, 5, 12), suitDark);
    chest.position.set(0, 1.31, 0.02);
    chest.scale.set(1.02, 1, 0.88);
    chest.castShadow = true;
    body.add(chest);
    // belt
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.09, 14), gold);
    belt.position.y = 0.98;
    belt.castShadow = true;
    body.add(belt);
    // chest core
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), accent);
    core.position.set(0, 1.32, 0.21);
    body.add(core);
    this.core = core;
    // backpack
    const pack = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.28, 4, 10), suitDark);
    pack.position.set(0, 1.2, -0.25);
    pack.scale.set(1.1, 1, 0.62);
    pack.castShadow = true;
    body.add(pack);
    const packCore = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.06), accent);
    packCore.position.set(0, 1.22, -0.37);
    packCore.rotation.x = 0.06;
    body.add(packCore);

    // head
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.62;
    body.add(headGroup);
    this.headGroup = headGroup;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.245, 20, 16), suit);
    head.scale.set(1, 1.02, 0.98);
    head.castShadow = true;
    headGroup.add(head);
    const visorMesh = new THREE.Mesh(new THREE.SphereGeometry(0.205, 20, 14, -0.65, 1.3, 0.95, 1.2), visor);
    visorMesh.position.set(0, 0.01, 0.09);
    visorMesh.scale.set(0.94, 0.8, 0.72);
    headGroup.add(visorMesh);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.2, 5), gold);
    antenna.position.set(0.08, 0.3, -0.02);
    antenna.rotation.z = -0.15;
    headGroup.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), accent);
    antennaTip.position.set(0.1, 0.4, -0.02);
    headGroup.add(antennaTip);
    // helmet rim
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.028, 4, 24), gold);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.03;
    headGroup.add(rim);

    // arms
    const mkArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.3, 1.42, 0);
      body.add(pivot);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.26, 4, 8), suit);
      upper.position.y = -0.16;
      upper.castShadow = true;
      pivot.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      pivot.add(elbow);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.24, 4, 8), suitDark);
      lower.position.y = -0.14;
      lower.castShadow = true;
      elbow.add(lower);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), suit);
      hand.position.y = -0.29;
      hand.castShadow = true;
      elbow.add(hand);
      // wrist light
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 4, 14), accent);
      band.rotation.x = Math.PI / 2;
      band.position.y = -0.23;
      elbow.add(band);
      return { pivot, elbow, hand };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // infinity-blade (visible during attacks)
    const sword = new THREE.Group();
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.2, 6), gold);
    hilt.rotation.x = Math.PI / 2;
    sword.add(hilt);
    const bladeMat = new THREE.MeshBasicMaterial({ color: 0xaafff8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, toneMapped: false });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.86), bladeMat);
    blade.position.z = 0.5;
    sword.add(blade);
    const bladeGlow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.9), new THREE.MeshBasicMaterial({ color: 0x5ff7e8, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, toneMapped: false }));
    bladeGlow.position.z = 0.5;
    sword.add(bladeGlow);
    sword.position.set(0, -0.32, 0.06);
    sword.rotation.x = -0.2;
    this.armR.elbow.add(sword);
    this.sword = sword;
    sword.visible = false;

    // legs
    const mkLeg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, 0.9, 0);
      body.add(pivot);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.092, 0.3, 4, 8), suitDark);
      upper.position.y = -0.18;
      upper.castShadow = true;
      pivot.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.38;
      pivot.add(knee);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.24, 4, 8), suit);
      lower.position.y = -0.14;
      lower.castShadow = true;
      knee.add(lower);
      const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.12, 4, 8), gold);
      boot.rotation.x = Math.PI / 2;
      boot.position.set(0, -0.29, 0.03);
      boot.scale.set(1.05, 1, 0.9);
      boot.castShadow = true;
      knee.add(boot);
      return { pivot, knee };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    // scarf + trailing ribbons
    const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.075, 6, 18), scarfMat);
    scarfRing.rotation.x = Math.PI / 2;
    scarfRing.position.y = 1.48;
    scarfRing.scale.set(1.05, 1, 1);
    scarfRing.castShadow = true;
    body.add(scarfRing);
    this.ribbons = [];
    for (let i = 0; i < 3; i++) {
      const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.16 - i * 0.03, 0.34), scarfMat);
      ribbon.position.set(0.06 + i * 0.015, 1.44 - i * 0.3, -0.24 - i * 0.05);
      ribbon.rotation.x = 0.2;
      ribbon.castShadow = true;
      body.add(ribbon);
      this.ribbons.push(ribbon);
    }

    // soft rim light attached to the hero
    this.heroLight = new THREE.PointLight(0x6ff7e8, 0.55, 4.5, 2);
    this.heroLight.position.set(0, 1.3, 0.25);
    root.add(this.heroLight);

    // teleport/landing dust sprite under the feet
    const shadowTex = makeRadialTexture(64, 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 0.2);
    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false })
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.contactShadow);

    this.flashTime = 0;
  }

  _buildCompanion() {
    const g = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, toneMapped: false });
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), coreMat);
    g.add(orb);
    const glow = makeGlowSprite({ color: 0xffe6a0, size: 0.75, opacity: 0.75, texture: makeRadialTexture(64, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.15) });
    g.add(glow);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.55, toneMapped: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 3, 20), ringMat);
    g.add(ring);
    this.pip = { group: g, orb, glow, ring, pos: V3(1.2, 2.4, 8), phase: 0 };
    this.scene.add(g);
  }

  /* ============================================================
     Public API
     ============================================================ */
  get center() { return V3(this.position.x, this.position.y + this.height * 0.55, this.position.z); }
  get forward() { return V3(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  get speed() { return Math.hypot(this.velocity.x, this.velocity.z); }
  get healthRatio() { return clamp(this.hp / this.maxHp, 0, 1); }

  reset(position, facing = Math.PI) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.facing = this.targetFacing = facing;
    this.hp = this.maxHp;
    this.dead = false;
    this.iframes = 1.1;
    this.hurtTimer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.attacking = false;
    this.attackTimer = 0;
    this.attackStage = 0;
    this.attackQueued = false;
    this.ledge = null;
    this.comboTimer = 0;
    this.visual.rotation.set(0, 0, 0);
    this.visual.position.set(0, 0, 0);
    this.root.visible = true;
    this.root.position.copy(position);
    this.standingOn = null;
  }

  addHp(n) {
    if (this.dead) return;
    const before = this.hp;
    this.hp = clamp(this.hp + n, 0, this.maxHp);
    if (this.hp > before) this.callbacks.onHeal?.(this.hp, this.maxHp);
  }

  takeDamage(amount, sourcePosition = null, opts = {}) {
    if (this.dead || this.iframes > 0 || this.dashTimer > 0) return false;
    this.hp -= amount;
    this.iframes = opts.iframes ?? 1.1;
    this.hurtTimer = 0.32;
    this.flashTime = 0.2;
    if (sourcePosition) {
      const dir = this.position.clone().sub(sourcePosition);
      dir.y = 0;
      if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
      dir.normalize();
      this.velocity.x = dir.x * (opts.knockback ?? 8);
      this.velocity.z = dir.z * (opts.knockback ?? 8);
      this.velocity.y = opts.up ?? 5.2;
    } else {
      this.velocity.y = Math.max(this.velocity.y, 4);
    }
    this.grounded = false;
    this.height = HEIGHT;
    this.effects.hitSpark(this.center, 0xff7d8a, 18);
    this.effects.addShake(0.34, 0.35);
    this.callbacks.onDamage?.(amount, this.hp, this.maxHp);
    if (this.hp <= 0) this._die();
    return true;
  }

  _die() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.velocity.set(0, 0, 0);
    this.attacking = false;
    this.ledge = null;
    this.callbacks.onDeath?.();
  }

  healFull() {
    this.hp = this.maxHp;
    this.callbacks.onHeal?.(this.hp, this.maxHp);
  }

  /* ============================================================
     Fixed-step simulation
     ============================================================ */
  update(dt, input, cameraYaw, aimTarget = null) {
    if (this.dead) {
      this.time += dt;
      return;
    }
    this.time += dt;
    this.aimTarget = aimTarget;

    // timers
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.dashBuffer = Math.max(0, this.dashBuffer - dt);
    this.wallJumpLock = Math.max(0, this.wallJumpLock - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt * 0); // attack consumed below

    // input edges
    if (input.consumePressed('jump')) this.jumpBuffer = 0.14;
    if (input.consumePressed('dash')) this.dashBuffer = 0.12;
    const attackPressed = input.consumePressed('attack');
    this.jumpHeld = input.isDown('jump');

    // attack combo input
    if (attackPressed) {
      if (!this.attacking && this.comboTimer > 0 && this.attackStage < 2 && this.attackStage > 0) {
        this._startAttack(this.attackStage + 1);
      } else if (!this.attacking) {
        this._startAttack(0);
      } else if (this.attackStage < 2) {
        this.attackQueued = true;
      }
    }

    // moving platforms carry the player
    if (this.grounded && this.standingOn && this.standingOn.platform) {
      this.position.add(this.standingOn.platform.delta);
    }

    // ledge state
    if (this.ledge) {
      this._updateLedge(dt);
      this._updateAttack(dt);
      return;
    }

    // dash
    if (this.dashTimer > 0) {
      this._updateDash(dt);
      this._updateAttack(dt);
      this._checkHazards();
      return;
    }

    if (this.dashBuffer > 0 && this.dashCooldown <= 0 && (!this.grounded ? !this.airDashUsed : true)) {
      this._startDash(input, cameraYaw);
      this._checkHazards();
      return;
    }

    // movement input relative to camera
    const mv = input.getMove();
    const forward = V3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const right = V3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    const wish = V3().addScaledVector(forward, mv.y).addScaledVector(right, mv.x);
    const wishLen = Math.min(1, wish.length());
    if (wish.lengthSq() > 0.0001) wish.normalize();
    this.lastMove.copy(wish);
    const inWater = this.world.inWater(this.position);
    const wind = this.world.windAt(this.position);
    const speedCap = inWater ? 4.6 : 8.3;
    const accel = this.grounded ? 62 : (inWater ? 24 : 34);
    const decel = this.grounded ? (inWater ? 10 : 15) : 3.2;

    // slow while attacking / hurt
    const control = this.attacking ? 0.28 : (this.hurtTimer > 0 ? 0.12 : 1);
    if (wishLen > 0.05) {
      const desiredX = wish.x * speedCap * wishLen * control;
      const desiredZ = wish.z * speedCap * wishLen * control;
      this.velocity.x = damp(this.velocity.x, desiredX, accel * 0.28, dt);
      this.velocity.z = damp(this.velocity.z, desiredZ, accel * 0.28, dt);
      if (!this.attacking) {
        this.targetFacing = Math.atan2(wish.x, wish.z);
        if (this.aimTarget) {
          this.targetFacing = Math.atan2(this.aimTarget.x - this.position.x, this.aimTarget.z - this.position.z);
        }
      }
    } else {
      this.velocity.x = damp(this.velocity.x, 0, decel, dt);
      this.velocity.z = damp(this.velocity.z, 0, decel, dt);
    }

    // gravity / buoyancy / wind
    this.velocity.y -= 32 * dt;
    if (inWater) {
      this.velocity.y = Math.max(this.velocity.y, -4.5);
      if (this.wasJumping) { this.velocity.y = Math.max(this.velocity.y, 5.5); this.wasJumping = false; }
    }
    if (wind && !this.grounded) {
      this.velocity.y += wind.strength * dt * 1.6;
      this.velocity.y = Math.min(this.velocity.y, 17);
    }
    if (this.jumpHeld && this.velocity.y > 0) {
      this.velocity.y -= 18 * dt;
    } else if (this.velocity.y > 0) {
      this.velocity.y -= 16 * dt;
    }
    this.velocity.y = Math.max(this.velocity.y, -38);

    // jumping
    if (this.jumpBuffer > 0) {
      if (this.grounded || this.coyote > 0) {
        this._jump();
      } else if (this.wallContact && this.wallJumpLock <= 0) {
        this._wallJump();
      } else if (this.jumpsUsed < 2) {
        this._doubleJump();
      }
    }

    // fall through a ledge with down input
    if (this.grounded && mv.y < -0.7 && this.standingOn && this.standingOn.kind === 'solid' && this.position.y > 1) {
      // only trigger on one-way platforms (none currently) - kept for extensibility
    }

    // Keep the previous frame's grounded state through horizontal collision resolution
    // so small ledges can be stepped onto before the vertical pass refreshes it.
    this._moveAndCollide(dt);
    if (this.grounded) {
      this.coyote = 0.11;
      this.jumpsUsed = 0;
      this.airDashUsed = false;
      if (this.velocity.y < -11) {
        const impact = clamp(-this.velocity.y / 26, 0.2, 1);
        this.landTimer = 0.2;
        this.landImpact = impact;
        this.effects.burst(this.position.clone().add(V3(0, 0.05, 0)), {
          count: 16, speed: 2.6, direction: V3(0, 1, 0), spread: 1.0,
          posVar: 0.25, size: 0.18, life: 0.5, gravity: -2, drag: 2.2,
          colors: [0xd9c69a, 0xcab98d, 0xffffff],
        });
        this.callbacks.onLand?.(impact);
      }
    }

    // wall detection & slide
    this._detectWalls();
    this.wallSliding = false;
    if (!this.grounded && this.wallContact && this.velocity.y < -2.5 && wishLen > 0.2) {
      const intoWall = wish.dot(this.wallContact.normal) < -0.25;
      if (intoWall && !this.ledge) {
        this.wallSliding = true;
        this.velocity.y = Math.max(this.velocity.y, -3.2);
        if (Math.random() < dt * 18) {
          this.effects.spawnWallDust?.(this.position);
          this.effects.burst(this.position.clone().add(V3(0, 1.2, 0)).addScaledVector(this.wallContact.normal, -0.35), {
            count: 2, speed: 1.2, size: 0.09, life: 0.34, gravity: -1, drag: 3,
            colors: [0xd9c9a8, 0xffffff],
          });
        }
      }
    }

    // ledge grab
    if (!this.grounded && this.velocity.y < -1.2 && !this.attacking && this.wallContact) {
      const ledge = this._findLedge(wish);
      if (ledge) {
        this._grabLedge(ledge);
      }
    }

    // attack progression
    this._updateAttack(dt);

    // footsteps / water splashes
    if (this.grounded && this.speed > 2.2) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = clamp(0.4 - this.speed * 0.027, 0.18, 0.36);
        this.effects.footstep(this.position.clone(), this.world.zoneAt(this.position) === 'ruins' ? 0xcabb9a : 0x9fbb7a);
        this.callbacks.onStep?.();
      }
    } else {
      this.stepTimer = 0;
    }
    if (inWater) {
      this.splashTimer -= dt;
      if (this.splashTimer <= 0 && this.speed > 1.2) {
        this.splashTimer = 0.18;
        this.effects.splash(this.position.clone().add(V3(0, 0.1, 0)));
        this.callbacks.onWater?.();
      }
    }

    // facing
    if (!this.attacking && this.hurtTimer <= 0 && (this.speed > 0.4 || mv.len > 0.1)) {
      this.targetFacing = this.aimTarget
        ? Math.atan2(this.aimTarget.x - this.position.x, this.aimTarget.z - this.position.z)
        : Math.atan2(this.velocity.x, this.velocity.z);
    }
    if (this.ledge) {
      this.targetFacing = Math.atan2(-this.ledge.normal.x, -this.ledge.normal.z);
    }
    this.facing = angleLerp(this.facing, this.targetFacing, 1 - Math.exp(-16 * dt));

    this._checkHazards();

    if (this.position.y < -50) {
      this._die();
    }
  }

  _jump() {
    this.velocity.y = 14.6;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpsUsed = 1;
    this.landTimer = 0;
    this.wasJumping = true;
    this.effects.burst(this.position.clone(), {
      count: 10, speed: 2.4, direction: V3(0, 1, 0), spread: 0.9, posVar: 0.2,
      size: 0.14, life: 0.4, gravity: -1, drag: 2.5, colors: [0xd8ccaa, 0xffffff],
    });
    this.callbacks.onJump?.(false);
  }

  _doubleJump() {
    this.velocity.y = 13.6;
    this.jumpsUsed = 2;
    this.jumpBuffer = 0;
    this.effects.doubleJump(this.center);
    this.callbacks.onDoubleJump?.();
  }

  _wallJump() {
    const n = this.wallContact.normal;
    this.velocity.x = n.x * 10.5;
    this.velocity.z = n.z * 10.5;
    this.velocity.y = 11.5;
    this.jumpsUsed = 1;
    this.jumpBuffer = 0;
    this.wallJumpLock = 0.25;
    this.targetFacing = Math.atan2(n.x, n.z);
    this.effects.burst(this.center, {
      count: 14, speed: 3.2, size: 0.12, life: 0.38, gravity: -2, drag: 2.4,
      colors: [0x8ff7ec, 0xffffff],
    });
    this.callbacks.onJump?.(true);
  }

  _startDash(input, cameraYaw) {
    const mv = input.getMove();
    let dir;
    if (mv.len > 0.15) {
      const forward = V3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
      const right = V3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
      dir = V3().addScaledVector(forward, mv.y).addScaledVector(right, mv.x).normalize();
    } else {
      dir = this.forward;
    }
    this.dashDir.copy(dir);
    this.targetFacing = Math.atan2(dir.x, dir.z);
    this.dashTimer = 0.22;
    this.dashCooldown = 0.72;
    this.dashBuffer = 0;
    this.velocity.set(dir.x * 25, 0.5, dir.z * 25);
    this.iframes = Math.max(this.iframes, 0.28);
    if (!this.grounded) this.airDashUsed = true;
    this.attacking = false;
    this.effects.burst(this.center, {
      count: 16, speed: 3, direction: dir.clone().negate(), spread: 0.7,
      size: 0.2, life: 0.45, gravity: 0.2, drag: 2.8, colors: [0x8ff7ec, 0xffffff, 0xa8e8ff],
    });
    this.callbacks.onDash?.();
  }

  _updateDash(dt) {
    this.dashTimer -= dt;
    this.dashTrailTimer -= dt;
    this.velocity.y = Math.max(this.velocity.y, -0.2);
    this.grounded = false;
    this._moveAndCollide(dt);
    if (this.dashTrailTimer <= 0) {
      this.dashTrailTimer = 0.018;
      this.effects.dashTrail(this.center.clone().add(V3(0, 0.2, 0)));
    }
    if (this.grounded) this.coyote = 0.1;
    if (this.dashTimer <= 0) {
      this.velocity.x *= 0.42;
      this.velocity.z *= 0.42;
      this.velocity.y = Math.min(this.velocity.y, 2);
    }
  }

  _updateLedge(dt) {
    if (!this.ledge) return;
    this.velocity.set(0, 0, 0);
    this.iframes = Math.max(this.iframes, 0.05);
    const n = this.ledge.normal;
    this.targetFacing = Math.atan2(-n.x, -n.z);
    this.facing = angleLerp(this.facing, this.targetFacing, 1 - Math.exp(-20 * dt));
    // keep glued
    this.position.x = this.ledge.box.max.x + this.radius + 0.02 * (n.x > 0 ? 1 : -1) * 0 - n.x * (this.radius + 0.04);
    this.position.z = this.ledge.box.max.z + this.radius + 0.02 * (n.z > 0 ? 1 : -1) * 0 - n.z * (this.radius + 0.04);
    this.position.y = this.ledge.box.max.y - 1.62;
    if (this.jumpBuffer > 0) {
      // climb up
      this.position.copy(this.ledge.climbPos);
      this.velocity.set(n.x * 1.8, 8.4, n.z * 1.8);
      this.ledge = null;
      this.jumpBuffer = 0;
      this.jumpsUsed = 1;
      this.grounded = false;
      this.effects.burst(this.center, { count: 12, speed: 2, size: 0.12, life: 0.4, gravity: -3, colors: [0x8ff7ec, 0xffffff] });
      this.callbacks.onJump?.(false);
      return;
    }
    if (this.dashBuffer > 0) {
      this.velocity.set(n.x * 9, 5, n.z * 9);
      this.ledge = null;
      this.dashBuffer = 0;
      this.iframes = Math.max(this.iframes, 0.2);
    }
  }

  _findLedge(wish) {
    if (!this.wallContact) return null;
    const col = this.wallContact.collider;
    if (!col || !col.box) return null;
    const top = col.box.max.y;
    const rel = top - this.position.y;
    if (rel < 1.15 || rel > 1.95) return null;
    const n = this.wallContact.normal;
    if (wish.len > 0.1 && wish.dot(n) > -0.15) return null;
    // ensure there's space above
    const climbPos = V3(
      this.position.x - n.x * (this.radius + 0.08),
      top + 0.03,
      this.position.z - n.z * (this.radius + 0.08)
    );
    const test = this._boxAt(climbPos.x, climbPos.y + 0.1, climbPos.z);
    for (const c of this.world.colliders) {
      if (!c.active) continue;
      if (c === col) continue;
      if (test.intersectsBox(c.box)) return null;
    }
    return { box: col.box, normal: n, climbPos };
  }

  _grabLedge(ledge) {
    this.ledge = ledge;
    this.dashTimer = 0;
    this.attacking = false;
    this.velocity.set(0, 0, 0);
    this.wallSliding = false;
    this.targetFacing = Math.atan2(-ledge.normal.x, -ledge.normal.z);
    this.effects.burst(this.center.clone().add(V3(0, 0.55, 0)), {
      count: 10, speed: 1.5, size: 0.1, life: 0.4, gravity: -1, drag: 2.5, colors: [0xffffff, 0xd8ccaa],
    });
    this.callbacks.onLedge?.();
  }

  _startAttack(stage) {
    this.attackStage = clamp(stage, 0, 2);
    this.attacking = true;
    this.attackTimer = 0;
    this.attackHitDone = false;
    this.attackQueued = false;
    this.attackDuration = this.attackStage === 2 ? 0.52 : 0.4;
    this.attackHitTime = this.attackStage === 2 ? 0.2 : 0.15;
    this.comboTimer = 0.55;
    this.sword.visible = true;
    if (this.aimTarget) {
      this.targetFacing = Math.atan2(this.aimTarget.x - this.position.x, this.aimTarget.z - this.position.z);
      this.facing = this.targetFacing;
    }
    this.velocity.x *= 0.4;
    this.velocity.z *= 0.4;
    this.callbacks.onAttackStart?.(this.attackStage);
  }

  _updateAttack(dt) {
    if (!this.attacking) {
      this.sword.visible = false;
      if (this.attackStage > 0 && this.comboTimer <= 0) this.attackStage = 0;
      return;
    }
    this.attackTimer += dt;
    if (!this.attackHitDone && this.attackTimer >= this.attackHitTime) {
      this.attackHitDone = true;
      const fwd = this.forward;
      this.effects.slash(this.position.clone().addScaledVector(fwd, 0.8), this.facing, {
        color: this.attackStage === 2 ? 0xffe6a0 : 0x9ffff4,
        scale: this.attackStage === 2 ? 1.35 : 1,
      });
      this.callbacks.onAttackHit?.(this.attackStage, this.position.clone(), this.facing);
    }
    if (this.attackTimer >= this.attackDuration) {
      this.attacking = false;
      this.sword.visible = false;
      this.comboTimer = 0.38;
      if (this.attackQueued && this.attackStage < 2) {
        this._startAttack(this.attackStage + 1);
      } else if (this.attackStage >= 2) {
        this.attackStage = 0;
      }
    }
  }

  _checkHazards() {
    if (this.iframes > 0 || this.dead) return;
    const box = this._boxAt(this.position.x, this.position.y + 0.15, this.position.z);
    const hazard = this.world.hazardAt(box);
    if (hazard) {
      const center = hazard.box.getCenter(V3());
      this.takeDamage(hazard.damage, center, { knockback: hazard.knockback, up: 6.5, iframes: 1.2 });
      this.callbacks.onHazard?.(hazard);
    }
  }

  /* ============================================================
     Collision
     ============================================================ */
  _boxAt(x, y, z) {
    const box = this.tmpBox;
    box.min.set(x - this.radius, y, z - this.radius);
    box.max.set(x + this.radius, y + this.height, z + this.radius);
    return box;
  }

  _moveAndCollide(dt) {
    this.collisionContact.x = 0;
    this.collisionContact.z = 0;
    const active = this.world.colliders;
    // Grounding can be refreshed after the horizontal pass, so infer nearby
    // support here as well; this lets grounded players climb short steps.
    const supportProbe = this._boxAt(this.position.x, this.position.y - 0.06, this.position.z);
    const hasGroundSupport = this.grounded || active.some((c) =>
      c.active && c.box.max.y <= this.position.y + 0.08 &&
      c.box.max.y >= this.position.y - 0.12 && supportProbe.intersectsBox(c.box));

    // X
    this.position.x += this.velocity.x * dt;
    for (let iter = 0; iter < 2; iter++) {
      const box = this._boxAt(this.position.x, this.position.y, this.position.z);
      let hit = false;
      for (const c of active) {
        if (!c.active) continue;
        if (c.box.max.y <= this.position.y + 0.015) continue; // standing on top, not a wall
        if (!box.intersectsBox(c.box)) continue;
        // step up small ledges
        if (hasGroundSupport && c.box.max.y - this.position.y <= 0.56 && c.box.max.y > this.position.y + 0.02) {
          this.position.y = c.box.max.y + 0.015;
          this.velocity.y = Math.max(0, this.velocity.y);
          this.standingOn = c;
          this.grounded = true;
          continue;
        }
        if (this.velocity.x > 0) {
          this.position.x = c.box.min.x - this.radius - 0.001;
          this.collisionContact.x = 1;
        } else if (this.velocity.x < 0) {
          this.position.x = c.box.max.x + this.radius + 0.001;
          this.collisionContact.x = -1;
        } else {
          const pc = c.box.getCenter(V3());
          this.position.x += this.position.x < pc.x ? -0.02 : 0.02;
        }
        this.velocity.x = 0;
        this._recordWallContact(c, this.collisionContact.x, 0);
        hit = true;
        break;
      }
      if (!hit) break;
    }

    // Z
    this.position.z += this.velocity.z * dt;
    for (let iter = 0; iter < 2; iter++) {
      const box = this._boxAt(this.position.x, this.position.y, this.position.z);
      let hit = false;
      for (const c of active) {
        if (!c.active) continue;
        if (c.box.max.y <= this.position.y + 0.015) continue; // standing on top, not a wall
        if (!box.intersectsBox(c.box)) continue;
        if (hasGroundSupport && c.box.max.y - this.position.y <= 0.56 && c.box.max.y > this.position.y + 0.02) {
          this.position.y = c.box.max.y + 0.015;
          this.velocity.y = Math.max(0, this.velocity.y);
          this.standingOn = c;
          this.grounded = true;
          continue;
        }
        if (this.velocity.z > 0) {
          this.position.z = c.box.min.z - this.radius - 0.001;
          this.collisionContact.z = 1;
        } else if (this.velocity.z < 0) {
          this.position.z = c.box.max.z + this.radius + 0.001;
          this.collisionContact.z = -1;
        }
        this.velocity.z = 0;
        this._recordWallContact(c, 0, this.collisionContact.z);
        hit = true;
        break;
      }
      if (!hit) break;
    }

    // Y
    const prevVy = this.velocity.y;
    this.position.y += this.velocity.y * dt;
    this.grounded = false;
    this.standingOn = null;
    for (let iter = 0; iter < 2; iter++) {
      const box = this._boxAt(this.position.x, this.position.y, this.position.z);
      let hit = false;
      for (const c of active) {
        if (!c.active) continue;
        if (!box.intersectsBox(c.box)) continue;
        if (this.velocity.y <= 0) {
          this.position.y = c.box.max.y;
          this.velocity.y = 0;
          this.grounded = true;
          this.standingOn = c;
          this.coyote = 0.11;
        } else {
          this.position.y = c.box.min.y - this.height - 0.001;
          this.velocity.y = 0;
        }
        hit = true;
        break;
      }
      if (!hit) break;
    }

    // ground probe (handles standing still)
    if (!this.grounded && this.velocity.y <= 0.01) {
      const probe = this._boxAt(this.position.x, this.position.y - 0.06, this.position.z);
      let best = null;
      for (const c of active) {
        if (!c.active) continue;
        if (probe.intersectsBox(c.box)) {
          if (!best || c.box.max.y > best.box.max.y) best = c;
        }
      }
      if (best) {
        this.position.y = best.box.max.y;
        this.velocity.y = 0;
        this.grounded = true;
        this.standingOn = best;
        this.coyote = 0.11;
      }
    }

    // keep inside the world's vertical bounds
    if (this.position.y < -52) {
      this.position.y = -52;
      this.velocity.y = 0;
    }
  }

  _recordWallContact(collider, nx, nz) {
    if (nx === 0 && nz === 0) return;
    this.wallContact = {
      collider,
      normal: V3(nx, 0, nz).normalize(),
      time: this.time,
    };
  }

  _detectWalls() {
    this.wallContact = null;
    this.wallJumpLock = Math.max(0, this.wallJumpLock);
    if (this.grounded) return;
    const p = this.position;
    const probes = [
      { nx: 1, x: p.x + this.radius + 0.06, z: p.z },
      { nx: -1, x: p.x - this.radius - 0.06, z: p.z },
      { nz: 1, x: p.x, z: p.z + this.radius + 0.06 },
      { nz: -1, x: p.x, z: p.z - this.radius - 0.06 },
    ];
    for (const probe of probes) {
      for (const c of this.world.colliders) {
        if (!c.active) continue;
        if (probe.x - 0.02 > c.box.min.x && probe.x + 0.02 < c.box.max.x &&
            probe.z - 0.02 > c.box.min.z && probe.z + 0.02 < c.box.max.z &&
            p.y + 0.3 < c.box.max.y && p.y + this.height - 0.2 > c.box.min.y) {
          this.wallContact = { collider: c, normal: V3(probe.nx || 0, 0, probe.nz || 0), time: this.time };
          return;
        }
      }
    }
  }

  /* ============================================================
     Visuals / animation blending
     ============================================================ */
  updateVisual(dt, camera) {
    if (!this.root) return;
    this.root.position.copy(this.position);
    this.root.rotation.y = this.facing;

    // i-frame blink
    if (this.dead) {
      this.visual.rotation.z = damp(this.visual.rotation.z, -Math.PI / 2, 7, dt);
      this.visual.position.y = damp(this.visual.position.y, 0.15, 5, dt);
      this.root.visible = true;
    } else if (this.iframes > 0.12 && this.hurtTimer > 0) {
      this.visual.visible = Math.floor(this.time * 28) % 2 === 0;
    } else {
      this.visual.visible = true;
    }

    const moving = this.speed > 0.6;
    const airborne = !this.grounded && !this.ledge;
    const targetLean = this.dashTimer > 0 ? 0.35 : (this.attacking ? 0.08 : (moving ? 0.06 : 0));
    this.visual.rotation.x = damp(this.visual.rotation.x, targetLean, 10, dt);
    this.visual.rotation.z = damp(this.visual.rotation.z, airborne ? -this.velocity.x * 0.008 : 0, 6, dt);

    // squash & stretch
    let squash = 1;
    if (this.landTimer > 0) squash = 1 - Math.sin((this.landTimer / 0.2) * Math.PI) * 0.12 * this.landImpact;
    if (airborne) squash = 1 + clamp(Math.abs(this.velocity.y) * 0.003, 0, 0.06);
    this.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    this.visual.position.y = damp(this.visual.position.y, this.dead ? 0.15 : 0, 6, dt);

    // idle bob + breathing
    const breath = Math.sin(this.time * 2.1) * 0.01;
    const runSpeed = clamp(this.speed / 8.3, 0, 1);
    if (moving && this.grounded) this.runPhase += dt * (5.2 + runSpeed * 5.6);
    else this.runPhase += dt * 1.2;

    const phase = this.runPhase;
    const runWeight = this.grounded && moving ? clamp(this.speed / 4, 0, 1) : 0;
    const idleWeight = 1 - runWeight;
    const swing = Math.sin(phase) * 0.72 * runWeight;
    const swing2 = Math.sin(phase + Math.PI) * 0.72 * runWeight;

    // target rotations
    let legLX = swing, legRX = swing2, kneeLX = Math.max(0, -swing) * 0.7, kneeRX = Math.max(0, -swing2) * 0.7;
    let armLX = -swing * 0.85, armRX = -swing2 * 0.85;
    let armLZ = -0.06, armRZ = 0.06;
    let headX = 0, headY = 0;
    let torsoTwist = Math.sin(phase) * 0.055 * runWeight;
    let swordSwing = 0;

    if (this.ledge) {
      legLX = -0.3; legRX = -0.05; kneeLX = 0.65; kneeRX = 0.4;
      armLX = -2.45; armRX = -2.45; armLZ = -0.3; armRZ = 0.3;
      torsoTwist = 0.1; headX = 0.25;
    } else if (this.dashTimer > 0) {
      legLX = -0.9; legRX = 0.55; kneeLX = 0.25; kneeRX = 0.1;
      armLX = 1.9; armRX = 1.9; armLZ = -0.55; armRZ = 0.55;
      headX = -0.2;
    } else if (airborne) {
      if (this.velocity.y > 2) {
        legLX = -0.72; legRX = -0.25; kneeLX = 1.15; kneeRX = 0.7;
        armLX = -1.1; armRX = -1.1; armLZ = -0.28; armRZ = 0.28;
        headX = -0.08;
      } else {
        legLX = -0.2; legRX = 0.2; kneeLX = 0.35; kneeRX = 0.35;
        armLX = -0.6; armRX = -0.6; armLZ = -0.65; armRZ = 0.65;
        headX = 0.12;
      }
    } else if (this.hurtTimer > 0) {
      legLX = 0.2; legRX = -0.2; armLX = -0.8; armRX = -0.8; headX = -0.25;
    }

    if (this.attacking) {
      const t = this.attackTimer / this.attackDuration;
      const arc = Math.sin(clamp(t, 0, 1) * Math.PI);
      if (this.attackStage === 2) {
        armRX = -2.4 + t * 3.7;
        armRZ = 0.6 - t * 0.9;
        swordSwing = -1.2 + t * 2.4;
        torsoTwist = -0.2 + t * 0.45;
        armLX = -0.7;
      } else if (this.attackStage === 1) {
        armRX = -1.9 + t * 3.1;
        armRZ = 0.9 - t * 1.5;
        swordSwing = -0.8 + t * 1.9;
        torsoTwist = 0.2 - t * 0.4;
        armLX = 0.5;
      } else {
        armRX = -1.4 + t * 2.5;
        armRZ = 0.4 - t * 1.2;
        swordSwing = -0.5 + t * 2;
        torsoTwist = 0.14 - t * 0.3;
        armLX = -0.4;
      }
      armRX += arc * 0.1;
    }

    // additive idle
    const idleArm = Math.sin(this.time * 1.4) * 0.045 * idleWeight;
    armLX += idleArm; armRX -= idleArm;
    headX += Math.sin(this.time * 0.9) * 0.025 * idleWeight;
    headY = Math.sin(this.time * 0.55) * 0.05 * idleWeight;

    // apply with damping
    const k = 1 - Math.exp(-18 * dt);
    this.legL.pivot.rotation.x = lerp(this.legL.pivot.rotation.x, legLX, k);
    this.legR.pivot.rotation.x = lerp(this.legR.pivot.rotation.x, legRX, k);
    this.legL.knee.rotation.x = lerp(this.legL.knee.rotation.x, kneeLX, k);
    this.legR.knee.rotation.x = lerp(this.legR.knee.rotation.x, kneeRX, k);
    this.armL.pivot.rotation.x = lerp(this.armL.pivot.rotation.x, armLX, k);
    this.armR.pivot.rotation.x = lerp(this.armR.pivot.rotation.x, armRX, k);
    this.armL.pivot.rotation.z = lerp(this.armL.pivot.rotation.z, armLZ, k);
    this.armR.pivot.rotation.z = lerp(this.armR.pivot.rotation.z, armRZ, k);
    this.headGroup.rotation.x = lerp(this.headGroup.rotation.x, headX, k);
    this.headGroup.rotation.y = lerp(this.headGroup.rotation.y, headY, k);
    this.body.rotation.y = lerp(this.body.rotation.y, torsoTwist, k);
    this.body.position.y = breath + (this.grounded && moving ? Math.abs(Math.sin(phase * 2)) * 0.03 : 0);

    // sword orientation
    if (this.sword.visible) {
      this.sword.rotation.x = lerp(this.sword.rotation.x, -1.5 + swordSwing, 0.35);
      this.sword.rotation.z = Math.sin(this.time * 24) * 0.02;
    }

    // scarf ribbons follow movement
    for (let i = 0; i < this.ribbons.length; i++) {
      const r = this.ribbons[i];
      const target = Math.sin(this.time * (4 + i * 0.6) + i) * 0.2 + clamp(this.speed * 0.04, 0, 0.45);
      r.rotation.x = damp(r.rotation.x, this.grounded ? target : target + 0.5, 5, dt);
      r.rotation.z = Math.sin(this.time * 3.2 + i * 0.8) * 0.12;
    }
    this.core.rotation.y += dt * 1.8;
    this.core.rotation.x += dt * 0.8;
    this.heroLight.intensity = 0.45 + Math.sin(this.time * 2.4) * 0.1;

    // contact shadow tracks ground under the player
    const gy = this._groundYUnder();
    this.contactShadow.position.set(this.position.x, gy + 0.025, this.position.z);
    const airHeight = this.position.y - gy;
    const shadowScale = clamp(1.25 - airHeight * 0.12, 0.35, 1.3);
    this.contactShadow.scale.setScalar(shadowScale * (1 + Math.sin(this.time * 2) * 0.02));
    this.contactShadow.material.opacity = clamp(0.36 - airHeight * 0.03, 0.04, 0.36);

    this._updateCompanion(dt, camera);
  }

  _groundYUnder() {
    // probe straight down through the collider set
    let best = -50;
    const x = this.position.x, z = this.position.z;
    for (const c of this.world.colliders) {
      if (!c.active) continue;
      if (x > c.box.min.x - this.radius * 0.6 && x < c.box.max.x + this.radius * 0.6 &&
          z > c.box.min.z - this.radius * 0.6 && z < c.box.max.z + this.radius * 0.6) {
        if (c.box.max.y <= this.position.y + 0.1 && c.box.max.y > best) best = c.box.max.y;
      }
    }
    return best;
  }

  _updateCompanion(dt, camera) {
    const p = this.pip;
    p.phase += dt;
    const side = this.facing + Math.PI * 0.6;
    const target = V3(
      this.position.x + Math.cos(side) * 1.25,
      this.position.y + 2.15 + Math.sin(p.phase * 1.7) * 0.16,
      this.position.z + Math.sin(side) * 1.25
    );
    p.pos.x = damp(p.pos.x, target.x, 3.4, dt);
    p.pos.y = damp(p.pos.y, target.y, 4.2, dt);
    p.pos.z = damp(p.pos.z, target.z, 3.4, dt);
    p.group.position.copy(p.pos);
    p.group.rotation.y += dt * 0.8;
    p.orb.position.y = Math.sin(p.phase * 2.3) * 0.04;
    p.ring.rotation.x = Math.PI / 2 + Math.sin(p.phase) * 0.4;
    p.ring.rotation.z += dt * 1.6;
    p.glow.material.opacity = 0.55 + Math.sin(p.phase * 3.1) * 0.15;
    if (Math.random() < dt * 2.5) {
      this.effects.pool.spawn({
        position: p.pos.clone(), count: 1, speed: 0.3, size: 0.09, life: 0.6, lifeVar: 0.5,
        gravity: 0.4, drag: 2, colors: [0xffe6a0, 0xffffff],
      });
    }
  }
}
