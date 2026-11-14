// ============================================================
// IRONFANG — hunter: movement, combos, dodge, guard, potions
// ============================================================
import * as THREE from 'three';
import { WEAPONS, POTION_HEAL, HUNT_POTIONS } from './data.js';
import { createWeaponModel } from './weapons.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const angleDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const easeOut = (t) => 1 - Math.pow(1 - t, 2);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.12, flatShading: true, ...opts });
}

export class Player {
  constructor(scene, game, weaponId, level, skinIndex) {
    this.scene = scene;
    this.game = game;
    this.weaponId = weaponId;
    this.weapon = WEAPONS[weaponId];
    this.level = level;
    this.skins = this.weapon.skins;
    this.skin = this.skins[skinIndex] || this.skins[0];
    this.dmgScale = 1 + 0.16 * (level - 1);

    this.hp = 100;
    this.maxHp = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.potions = HUNT_POTIONS;
    this.state = 'idle';
    this.facing = Math.PI;
    this.pos = new THREE.Vector3(0, 0, 12);
    this.rollDir = new THREE.Vector2();
    this.time = 0;
    this.walkPhase = 0;
    this.speedSmooth = 0;
    this.staminaDelay = 0;
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.queued = false;
    this.queuedFinisher = false;
    this.charging = false;
    this.chargeTime = 0;
    this.chargeLevel = 0;
    this.demonMode = false;
    this.demonDrainAcc = 0;
    this.invuln = 0;
    this.hurtTimer = 0;
    this.staggerTimer = 0;
    this.dodgeTimer = 0;
    this.potionTimer = 0;
    this.potionHealed = false;
    this.attack = null;
    this.specialHeld = false;
    this.specialTimer = 0;
    this.specialDone = false;
    this.blockFlash = 0;
    this.knock = new THREE.Vector3();
    this.damageDealt = 0;
    this.trailPoints = 0;
    this.attackHeldPrior = false;

    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._camRight = new THREE.Vector3();

    this._build();
    this.trail = this.game.fx.createTrail(this.weapon.colors.trail);
    this.setPosition(this.pos);
  }

  // ------------------------------------------------------------
  _build() {
    const root = new THREE.Group();
    this.root = root;
    const model = new THREE.Group();
    this.model = model;
    root.add(model);

    const armorMat = mat(0x50656b, { metalness: 0.35, roughness: 0.5 });
    const clothMat = mat(0x2e4a42);
    const leatherMat = mat(0x5c432e);
    const goldMat = mat(0xc9a04e, { metalness: 0.6, roughness: 0.32 });
    const darkMat = mat(0x222a29);

    // hips
    const hips = new THREE.Group();
    hips.position.y = 0.92;
    model.add(hips);
    this.hips = hips;

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.18, 6), leatherMat);
    belt.position.y = 0.02;
    hips.add(belt);

    // torso
    const torso = new THREE.Group();
    hips.add(torso);
    this.torso = torso;
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.4, 0.72, 6), armorMat);
    chest.position.y = 0.38;
    chest.castShadow = true;
    torso.add(chest);
    const chestPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.41, 0.36, 6, 1, true), goldMat);
    chestPlate.position.y = 0.5;
    chestPlate.scale.set(1.02, 1, 1.02);
    torso.add(chestPlate);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.42, 6, 1, true), clothMat);
    skirt.position.y = -0.02;
    torso.add(skirt);

    // head
    const head = new THREE.Group();
    head.position.y = 0.84;
    torso.add(head);
    this.head = head;
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), armorMat);
    skull.scale.set(1, 1.05, 0.95);
    skull.castShadow = true;
    head.add(skull);
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.34, 5), goldMat);
    helm.position.y = 0.15;
    helm.rotation.y = Math.PI / 5;
    head.add(helm);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.075, 0.1), new THREE.MeshStandardMaterial({ color: 0x1c2624, emissive: 0x6fffdc, emissiveIntensity: 1.5, roughness: 0.4 }));
    visor.position.set(0, 0.015, 0.2);
    head.add(visor);
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), goldMat);
      horn.position.set(s * 0.22, 0.22, 0.02);
      horn.rotation.z = -s * 0.55;
      head.add(horn);
    }

    // arms
    const makeArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.4, 0.62, 0);
      torso.add(pivot);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.42, 5), armorMat);
      upper.position.y = -0.2;
      upper.castShadow = true;
      pivot.add(upper);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.34, 5), clothMat);
      fore.position.y = -0.53;
      pivot.add(fore);
      const shoulder = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 0), goldMat);
      shoulder.scale.set(1, 0.8, 1);
      pivot.add(shoulder);
      const hand = new THREE.Object3D();
      hand.position.y = -0.72;
      pivot.add(hand);
      const fist = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), leatherMat);
      fist.position.y = -0.7;
      pivot.add(fist);
      return { pivot, hand };
    };
    const left = makeArm(-1);
    const right = makeArm(1);
    this.armL = left.pivot;
    this.armR = right.pivot;
    this.handL = left.hand;
    this.handR = right.hand;

    // legs
    const makeLeg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.17, 0, 0);
      hips.add(pivot);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.46, 5), clothMat);
      thigh.position.y = -0.23;
      thigh.castShadow = true;
      pivot.add(thigh);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.09, 0.42, 5), armorMat);
      shin.position.y = -0.65;
      pivot.add(shin);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.34), leatherMat);
      boot.position.set(0, -0.87, 0.05);
      pivot.add(boot);
      return pivot;
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);

    // cape
    const capeGeo = new THREE.PlaneGeometry(0.6, 0.85, 2, 3);
    const cape = new THREE.Mesh(capeGeo, new THREE.MeshStandardMaterial({ color: 0x29443b, side: THREE.DoubleSide, roughness: 0.95, flatShading: true }));
    cape.position.set(0, 0.32, -0.28);
    torso.add(cape);
    this.cape = cape;

    // hunter's mark / scarf
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 4, 8), mat(0xb2543a));
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.74;
    torso.add(scarf);

    // weapon models
    const models = createWeaponModel(this.weaponId, this.skin, this.level);
    if (models.right) {
      this.handR.add(models.right);
      this.weaponR = models.right;
    }
    if (models.left) {
      this.handL.add(models.left);
      this.weaponL = models.left;
    }
    this.applyWeaponRest();

    // charge aura
    this.aura = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true })
    );
    this.aura.position.y = 1.1;
    this.aura.scale.setScalar(0.8);
    model.add(this.aura);
    this.aura.visible = false;

    // demon aura
    this.demonAura = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.0, 1),
      new THREE.MeshBasicMaterial({ color: 0xb28bff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.demonAura.position.y = 1.05;
    this.demonAura.visible = false;
    model.add(this.demonAura);

    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.scene.add(root);
  }

  applyWeaponRest() {
    const id = this.weaponId;
    if (this.weaponR) {
      if (id === 'greatsword') this.weaponR.rotation.set(0.42, 0, -0.12);
      else if (id === 'dualblades') this.weaponR.rotation.set(1.35, 0.1, 0.15);
      else this.weaponR.rotation.set(0.45, 0, -0.05);
    }
    if (this.weaponL) {
      if (id === 'dualblades') this.weaponL.rotation.set(1.35, -0.1, -0.15);
      else if (id === 'swordshield') this.weaponL.rotation.set(0.2, -1.15, 0.2);
    }
  }

  setPosition(p) {
    this.pos.copy(p);
    this.pos.y = 0;
    this.root.position.copy(this.pos);
  }

  get center() {
    return this._tmp2.set(this.pos.x, 1.1, this.pos.z);
  }

  reset(p) {
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.potions = HUNT_POTIONS;
    this.state = 'idle';
    this.attack = null;
    this.dead = false;
    this.invuln = 0;
    this.demonMode = false;
    this.charging = false;
    this.chargeTime = 0;
    this.chargeLevel = 0;
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.queued = false;
    this.staggerTimer = 0;
    this.potionTimer = 0;
    this.damageDealt = 0;
    this.facing = Math.PI;
    this.setPosition(p);
    this.root.rotation.set(0, this.facing, 0);
    this._poseReset();
  }

  // ------------------------------------------------------------
  update(dt, input, camera, monster) {
    this.time += dt;
    if (this.dead) { this._animate(dt, input, camera); return; }
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.staggerTimer = Math.max(0, this.staggerTimer - dt);

    const pressedAttack = input.consume('attack');
    const pressedSpecial = input.consume('special');
    const pressedDodge = input.consume('dodge');
    const pressedItem = input.consume('item');
    const move = input.updateMove();

    // camera basis
    camera.getWorldDirection(this._camDir);
    this._camDir.y = 0;
    if (this._camDir.lengthSq() < 0.001) this._camDir.set(0, 0, -1);
    this._camDir.normalize();
    this._camRight.set(-this._camDir.z, 0, this._camDir.x);
    const moveVec = this._tmp.copy(this._camRight).multiplyScalar(move.x).addScaledVector(this._camDir, move.z);
    const moving = move.mag > 0.08;

    const canAct = this.state !== 'dead' && this.staggerTimer <= 0;

    // ----- dodge -----
    if (pressedDodge && canAct && this.state !== 'dodge') {
      if (this.stamina >= 12) {
        this._startDodge(moveVec, moving);
      } else {
        this.game.ui.hint('Not enough stamina', 1.2);
      }
    }

    // ----- potion -----
    if (pressedItem && canAct && this.state !== 'dodge' && this.state !== 'attack') {
      this.usePotion();
    }

    // ----- special handling -----
    if (this.weaponId === 'dualblades') {
      if (pressedSpecial && canAct && this.state !== 'dodge') this._dualSpecial();
    } else if (this.weapon.canGuard) {
      if (input.held.special && (this.state === 'idle' || this.state === 'guard' || this.state === 'charge')) {
        this.specialTimer += dt;
        if (this.specialTimer > 0.16 && !this.specialDone) {
          this.specialDone = true;
          this.state = 'guard';
          this.charging = false;
          this.attack = null;
        }
      } else if (!input.held.special) {
        if (this.specialTimer > 0 && this.specialTimer <= 0.16 && !this.specialDone && canAct && this.state !== 'guard') {
          this._startFinisher();
        }
        this.specialTimer = 0;
        this.specialDone = false;
        if (this.state === 'guard') this.state = 'idle';
      }
      if (pressedSpecial && (this.state === 'attack')) this.queuedFinisher = true;
    }

    // ----- attack input -----
    if (pressedAttack && canAct && this.state !== 'dodge') {
      if (this.state === 'attack') {
        this.queued = true;
      } else if (this.state === 'charge') {
        // releasing handled below; a fresh tap releases the charge
        this._releaseCharge();
      } else if (this.state === 'guard') {
        this.state = 'idle';
        this._beginCombo();
      } else if (this.state === 'drink') {
        // ignore
      } else {
        this._beginCombo();
      }
    }

    if ((this.state === 'idle' || this.state === 'guard') && this.weaponId === 'greatsword' && input.held.attack && this.attackHeldPrior) {
      this._beginCharge();
    }
    this.attackHeldPrior = input.held.attack;

    // ----- state machine -----
    if (this.state === 'attack') this._updateAttack(dt, monster);
    else if (this.state === 'charge') this._updateCharge(dt, input);
    else if (this.state === 'dodge') this._updateDodge(dt);
    else if (this.state === 'drink') this._updatePotion(dt);
    else if (this.state === 'guard') {
      if (!input.held.special) this.state = 'idle';
    }

    // ----- combo timeout -----
    if (this.state !== 'attack') {
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.comboIndex = 0;
      }
    }

    // ----- movement -----
    let allowMove = true, speedMul = 1;
    if (this.state === 'attack') { allowMove = false; }
    else if (this.state === 'charge') { allowMove = true; speedMul = 0.32; }
    else if (this.state === 'guard') { allowMove = true; speedMul = 0.38; }
    else if (this.state === 'drink') { allowMove = this.weaponId === 'swordshield'; speedMul = 0.55; }
    else if (this.state === 'dodge') { allowMove = false; }
    else if (this.staggerTimer > 0) { allowMove = false; }

    if (allowMove) {
      let speed = this.weapon.moveSpeed * speedMul;
      let sprinting = false;
      if (this.demonMode && this.state === 'idle') speed *= 1.1;
      if (moving && input.isSprint() && this.stamina > 2 && this.state === 'idle') {
        speed = this.weapon.sprintSpeed;
        sprinting = true;
        this._drainStamina(9 * dt);
      }
      if (sprinting && Math.random() < dt * 18) {
        this.game.fx.dust(this._tmp2.set(this.pos.x, 0.1, this.pos.z), 1, 0x8d7f65);
      }
      if (moving) {
        this.speedSmooth = damp(this.speedSmooth, speed, 14, dt);
        const targetYaw = Math.atan2(moveVec.x, moveVec.z);
        if (this.state !== 'guard' || !this.game.lockOn) {
          this.facing += angleDiff(targetYaw, this.facing) * (1 - Math.exp(-dt * 13));
        }
        const vx = moveVec.x * this.speedSmooth * move.mag;
        const vz = moveVec.z * this.speedSmooth * move.mag;
        this._move(vx * dt, vz * dt);
      } else {
        this.speedSmooth = damp(this.speedSmooth, 0, 12, dt);
      }
    } else {
      this.speedSmooth = damp(this.speedSmooth, 0, 16, dt);
    }

    // guard / locked facing
    if (this.state === 'guard' || (this.game.lockOn && monster && (this.state === 'attack' || moving === false))) {
      if (monster && !monster.dead) {
        const target = Math.atan2(monster.pos.x - this.pos.x, monster.pos.z - this.pos.z);
        this.facing += angleDiff(target, this.facing) * (1 - Math.exp(-dt * (this.state === 'guard' ? 10 : 5)));
      }
    }

    // knockback
    if (this.knock.lengthSq() > 0.001) {
      this._move(this.knock.x * dt, this.knock.z * dt);
      this.knock.multiplyScalar(Math.exp(-dt * 8));
    }

    // stamina
    this.staminaDelay = Math.max(0, this.staminaDelay - dt);
    if (this.demonMode) {
      this._drainStamina(this.weapon.demon.drain * dt);
      this.demonDrainAcc += dt;
      if (this.stamina <= 0) {
        this.demonMode = false;
        this.game.ui.announce('DEMON MODE ENDS', 'tired', 1.4);
        this.game.audio.notify();
      }
      if (this.demonDrainAcc > 0.08) {
        this.demonDrainAcc = 0;
        this.game.fx.burst(this._tmp2.set(this.pos.x, 1.0, this.pos.z), 0xb28bff, 2, 1.2, 1, { life: 0.5, gravity: -1.5 });
      }
    } else if (this.staminaDelay <= 0 && this.state !== 'dodge' && this.state !== 'guard') {
      this.stamina = Math.min(this.maxStamina, this.stamina + 27 * dt);
    }

    // charge aura visuals
    if (this.charging) {
      this.chargeTime += dt;
      const lvl = this._chargeLevelFromTime();
      if (lvl !== this.chargeLevel) {
        this.chargeLevel = lvl;
        if (lvl > 0) this.game.audio.charge(lvl);
      }
      this.aura.visible = true;
      this.aura.material.opacity = 0.1 + lvl * 0.08;
      this.aura.rotation.y += dt * 2;
      this.aura.scale.setScalar(0.8 + lvl * 0.18 + Math.sin(this.time * 8) * 0.04);
      if (Math.random() < dt * (8 + lvl * 8)) {
        this.game.fx.burst(this._tmp2.set(this.pos.x, 1.15, this.pos.z), this.weapon.colors.trail, 1, 0.7, 1, { life: 0.5, gravity: -2.5 });
      }
    } else {
      this.aura.visible = false;
    }
    if (this.demonMode) {
      this.demonAura.visible = true;
      this.demonAura.material.opacity = 0.09 + Math.sin(this.time * 6) * 0.03;
      this.demonAura.rotation.y -= dt * 1.2;
    } else {
      this.demonAura.visible = false;
    }

    // trail during active attack
    if (this.state === 'attack' && this.attack && this.attack.phase === 'active') {
      this._emitTrail();
    }

    this._animate(dt, input, camera, monster);
  }

  // ------------------------------------------------------------
  _move(dx, dz) {
    this.pos.x += dx;
    this.pos.z += dz;
    const arena = this.game.arena;
    const bounds = arena ? arena.bounds - 1.2 : 29;
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > bounds) {
      this.pos.x = (this.pos.x / d) * bounds;
      this.pos.z = (this.pos.z / d) * bounds;
    }
    if (arena) {
      for (const o of arena.obstacles) {
        const dx2 = this.pos.x - o.x, dz2 = this.pos.z - o.z;
        const dist = Math.hypot(dx2, dz2);
        const min = o.r + 0.45;
        if (dist < min && dist > 0.0001) {
          this.pos.x = o.x + (dx2 / dist) * min;
          this.pos.z = o.z + (dz2 / dist) * min;
        }
      }
    }
    this.root.position.set(this.pos.x, 0, this.pos.z);
  }

  _drainStamina(n) {
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = 0.6;
  }

  _beginCombo() {
    let idx = 0;
    if (this.comboTimer > 0) idx = Math.min(2, this.comboIndex + 1);
    this._startAttack(this.weapon.combo[idx], idx, false);
    this.game.audio.swing(this.weaponId, idx > 0);
  }

  _startFinisher() {
    this._startAttack(this.weapon.finisher, 2, true);
    this.game.audio.swing(this.weaponId, true);
    this.game.ui.announce(this.weapon.finisher.name.toUpperCase(), '', 1.1);
  }

  _startAttack(def, index, finisher = false) {
    this._autoAim();
    this.state = 'attack';
    this.attack = {
      def, index, finisher,
      phase: 'windup', timer: 0,
      hitsDone: 0, tickTimer: 0,
      lungeSign: 1,
    };
    this.comboIndex = index;
    this.comboTimer = 0;
    this.queued = false;
    this.queuedFinisher = false;
    this.charging = false;
    this.chargeTime = 0;
    this.chargeLevel = 0;
    this._attackTime = 0;
  }

  _beginCharge() {
    if (this.state !== 'idle') return;
    this.state = 'charge';
    this.charging = true;
    this.chargeTime = 0;
    this.chargeLevel = 0;
    this.attack = null;
    this.comboIndex = 0;
    this.comboTimer = 0;
  }

  _chargeLevelFromTime() {
    const t = this.weapon.charge.times;
    if (this.chargeTime >= t[3]) return 3;
    if (this.chargeTime >= t[2]) return 2;
    if (this.chargeTime >= t[1]) return 1;
    return 0;
  }

  _releaseCharge() {
    const lvl = Math.max(0, this._chargeLevelFromTime());
    const cd = this.weapon.charge;
    const def = {
      ...cd,
      dmg: cd.dmg[lvl],
      name: cd.name[lvl],
      isCharged: lvl,
    };
    this.charging = false;
    this.chargeTime = 0;
    this.chargeLevel = 0;
    this._startAttack(def, 0, false);
    this.game.audio.swing(this.weaponId, true);
    this.game.ui.announce(def.name.toUpperCase(), '', 1.4);
    if (lvl >= 3) this.game.shake(0.5, 0.3);
  }

  _updateCharge(dt, input) {
    if (!input.held.attack) this._releaseCharge();
  }

  _dualSpecial() {
    if (!this.demonMode) {
      if (this.stamina < 15) { this.game.ui.hint('Not enough stamina', 1.2); return; }
      this._drainStamina(15);
      this.demonMode = true;
      this.game.audio.notify();
      this.game.ui.announce('DEMON MODE', '', 1.4);
      this.game.fx.burst(this._tmp2.set(this.pos.x, 1.0, this.pos.z), 0xb28bff, 18, 5, 1, { life: 0.7, gravity: -1 });
    } else {
      if (this.state === 'attack') { this.queuedFinisher = true; return; }
      if (this.stamina < 20) { this.game.ui.hint('Not enough stamina', 1.2); return; }
      this._drainStamina(20);
      this._startFinisher();
    }
  }

  _updateAttack(dt, monster) {
    const a = this.attack;
    if (!a) { this.state = 'idle'; return; }
    const def = a.def;
    const speedMul = (this.demonMode ? this.weapon.demon.speed : 1) * (a.finisher && this.weaponId === 'dualblades' ? 1.15 : 1);
    a.timer += dt * speedMul;
    const total = def.windup + def.active + def.recover;

    // forward lunge handled during windup/active
    if (def.lunge && (a.phase === 'windup' || a.phase === 'active')) {
      const forward = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
      this._move(forward.x * def.lunge * dt * 0.55, forward.z * def.lunge * dt * 0.55);
    }

    if (a.phase === 'windup' && a.timer >= def.windup) {
      a.phase = 'active';
      a.timer = 0;
      a.hitsDone = 0;
      a.tickTimer = 0;
      this.game.audio.swing(this.weaponId, !!a.finisher || !!def.isCharged);
      const flashScale = def.anim === 'spin' || def.anim === 'dance' ? 2.4 : a.finisher ? 1.8 : 1.1;
      this.game.fx.slashFlash(this._tmp.set(this.pos.x, 1.0, this.pos.z), this.facing, this.weapon.colors.trail, flashScale, 0.7);
      if (def.isCharged >= 2) this.game.shake(0.35, 0.18);
    } else if (a.phase === 'active') {
      const hits = def.hits || 1;
      if (def.hits) {
        a.tickTimer -= dt;
        if (a.tickTimer <= 0 && a.hitsDone < def.hits) {
          this._checkHit(monster, def, a);
          a.hitsDone++;
          a.tickTimer = def.hitInterval || (def.active / def.hits);
        }
      } else if (a.hitsDone === 0) {
        this._checkHit(monster, def, a);
        a.hitsDone = 1;
      }
      if (this.demonMode && this.weaponId === 'dualblades' && a.index === 2 && !a.flurryDone && a.hitsDone >= 1 && !a.finisher) {
        a.flurryDone = true;
        const fl = this.weapon.demon.flurry;
        for (let i = 0; i < fl.hits; i++) {
          setTimeout(() => {
            if (this.state === 'attack' || this.state === 'idle') {
              this._checkHit(monster, { ...def, dmg: fl.dmg, reach: def.reach }, { index: a.index, finisher: false });
            }
          }, 90 + i * 95);
        }
      }
      if (a.timer >= def.active) {
        a.phase = 'recover';
        a.timer = 0;
      }
    } else if (a.phase === 'recover') {
      if (a.timer >= def.recover) {
        this._endAttack();
        return;
      }
      if (a.timer > def.recover * 0.38) {
        if (this.queuedFinisher && this.weaponId !== 'dualblades') {
          this.queuedFinisher = false;
          this.queued = false;
          this._startFinisher();
          return;
        }
        if (this.queued) {
          this.queued = false;
          if (this.weaponId === 'greatsword' && this.game.input?.held.attack) {
            this._beginCharge();
          } else {
            this._beginCombo();
          }
          return;
        }
      }
    }
    if (a.timer > total * 2.5) this._endAttack();
  }

  _endAttack() {
    const idx = this.attack?.index ?? 0;
    this.comboIndex = idx;
    this.comboTimer = 0.65;
    this.attack = null;
    this.state = 'idle';
    if (this.weaponId === 'greatsword' && this.game.input?.held.attack) {
      this._beginCharge();
    } else if (this.game.input?.held.attack) {
      // mobile-friendly auto combo
      this._beginCombo();
    }
  }

  _checkHit(monster, def, attackInfo) {
    if (!monster || monster.dead) return;
    const parts = monster.getParts();
    const fx = this.game.fx;
    const reach = def.reach || 2.5;
    const arc = def.arc || 2.0;
    const targets = [];
    for (const part of parts) {
      if (part.broken && part.id !== 'body' && Math.random() < 0.25) continue;
      const wp = part.obj.getWorldPosition(new THREE.Vector3());
      const dx = wp.x - this.pos.x;
      const dz = wp.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach + part.radius) continue;
      const ang = Math.atan2(dx, dz);
      const diff = Math.abs(angleDiff(ang, this.facing));
      const partAng = Math.atan2(part.radius, Math.max(0.6, dist)) * 0.9;
      if (diff > arc / 2 + partAng) continue;
      if (wp.y > 6 || wp.y < -1) continue;
      targets.push({ part, dist, wp });
    }
    targets.sort((a, b) => a.dist - b.dist);
    const selected = targets.slice(0, 3);
    for (const t of selected) {
      const base = (typeof def.dmg === 'number' ? def.dmg : 10) * this.dmgScale * (this.demonMode ? this.weapon.demon.damage : 1);
      this.damageDealt += base;
      this.game.playerHit({
        part: t.part,
        base,
        def,
        worldPos: t.wp,
        finisher: !!attackInfo?.finisher,
        charged: !!def.isCharged,
        demon: this.demonMode,
      });
      fx.spark(t.wp, this.weapon.colors.trail, !!attackInfo?.finisher || def.isCharged >= 2);
    }
    if (!selected.length) {
      // small whiff dust at weapon range
      const fxPos = new THREE.Vector3(this.pos.x + Math.sin(this.facing) * reach * 0.7, 0.5, this.pos.z + Math.cos(this.facing) * reach * 0.7);
      fx.dust(fxPos, 2, 0x8d8168);
    }
  }

  _emitTrail() {
    const hand = this.weaponId === 'dualblades' ? (Math.floor(this.time * 14) % 2 ? this.weaponL : this.weaponR) : this.weaponR;
    const w = hand || this.weaponR;
    if (!w) return;
    const tip = w.getObjectByName('tip');
    const base = w.getObjectByName('base');
    if (!tip || !base) return;
    const tipPos = tip.getWorldPosition(this._tmp);
    const basePos = base.getWorldPosition(this._tmp2);
    this.trail.add(basePos, tipPos, 0.2);
    if (this.weaponId === 'dualblades' && this.weaponL) {
      const tip2 = this.weaponL.getObjectByName('tip');
      const base2 = this.weaponL.getObjectByName('base');
      if (tip2 && base2) this.trail.add(base2.getWorldPosition(new THREE.Vector3()), tip2.getWorldPosition(new THREE.Vector3()), 0.16);
    }
  }

  // ------------------------------------------------------------
  usePotion() {
    if (this.potions <= 0) { this.game.ui.hint('No potions left', 1.4); return; }
    if (this.hp >= this.maxHp) { this.game.ui.hint('Health is full', 1.4); return; }
    if (this.state === 'dodge' || this.state === 'dead') return;
    this.potions--;
    this.state = 'drink';
    this.potionTimer = 0;
    this.potionHealed = false;
    this.charging = false;
    this.chargeTime = 0;
    this.chargeLevel = 0;
    this.attack = null;
    this.game.audio.potion();
    this.game.ui.subtitle('Drinking potion…', 1.0);
  }

  _updatePotion(dt) {
    this.potionTimer += dt;
    if (!this.potionHealed && this.potionTimer >= 0.7) {
      this.potionHealed = true;
      const heal = Math.min(POTION_HEAL, this.maxHp - this.hp);
      this.hp += heal;
      this.game.ui.damage(this.game.project(this._tmp.set(this.pos.x, 1.9, this.pos.z)), `+${Math.round(heal)}`, 'heal');
      this.game.audio.potion();
      this.game.fx.burst(this._tmp.set(this.pos.x, 1.2, this.pos.z), 0x8fe36f, 14, 2.4, 1, { life: 0.8, gravity: -2 });
    }
    if (this.potionTimer >= 1.25) {
      this.state = 'idle';
    }
  }

  // ------------------------------------------------------------
  _startDodge(moveVec, moving) {
    this._drainStamina(20);
    this.state = 'dodge';
    this.dodgeTimer = 0;
    this.charging = false;
    this.attack = null;
    this.comboIndex = 0;
    this.comboTimer = 0;
    if (moving) {
      this.rollDir.set(moveVec.x, moveVec.z);
      this.facing = Math.atan2(moveVec.x, moveVec.z);
    } else {
      this.rollDir.set(-Math.sin(this.facing), -Math.cos(this.facing));
    }
    this.rollDir.normalize();
    this.invuln = 0.38;
    this.game.audio.dodge();
    this.game.fx.dust(this._tmp.set(this.pos.x, 0.15, this.pos.z), 7, 0x9a8d70);
  }

  _updateDodge(dt) {
    this.dodgeTimer += dt;
    const t = Math.min(1, this.dodgeTimer / 0.42);
    const sp = 9.5 * (1 - t * 0.6);
    this._move(this.rollDir.x * sp * dt, this.rollDir.y * sp * dt);
    if (t >= 1) {
      this.state = 'idle';
      this.dodgeTimer = 0;
    } else if (Math.random() < dt * 20) {
      this.game.fx.dust(this._tmp.set(this.pos.x, 0.12, this.pos.z), 1, 0x9a8d70);
    }
  }

  _autoAim() {
    const m = this.game.monster;
    if (!m || m.dead) return;
    const dx = m.pos.x - this.pos.x, dz = m.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1) return;
    const ang = Math.atan2(dx, dz);
    const diff = Math.abs(angleDiff(ang, this.facing));
    if (this.game.lockOn || diff < 2.0 || dist < 6) {
      this.facing = ang;
    }
  }

  // ------------------------------------------------------------
  stun(seconds = 1.2) {
    if (this.dead || this.state === 'dodge' || this.invuln > 0.2) return;
    this.staggerTimer = Math.max(this.staggerTimer, seconds);
    this.attack = null;
    this.charging = false;
    this.chargeTime = 0;
    this.chargeLevel = 0;
    if (this.state !== 'guard') this.state = 'idle';
    this.game.ui.subtitle('Stunned by the roar!', 1.2);
  }

  takeDamage(amount, sourcePos, heavy = false) {
    if (this.dead) return { result: 'dead' };
    if (this.invuln > 0 || this.state === 'dodge') {
      return { result: 'dodge' };
    }
    let dmg = amount;
    let result = 'hit';
    const toSource = new THREE.Vector2(sourcePos.x - this.pos.x, sourcePos.z - this.pos.z).normalize();
    const forward = new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
    const facingSource = forward.dot(toSource) > 0.1;
    if (this.state === 'guard' && this.weapon.canGuard && facingSource) {
      const cost = this.weapon.blockStamina;
      if (this.stamina >= cost * 0.5) {
        dmg *= (1 - this.weapon.blockReduction);
        this._drainStamina(cost);
        result = 'block';
        this.blockFlash = 0.25;
        this.game.audio.impact(0.7, true, 0);
        this.game.fx.spark(this._tmp.set(this.pos.x + forward.x * 0.6, 1.2, this.pos.z + forward.y * 0.6), 0xffd58a, true);
        this.game.shake(0.15, 0.1);
        if (this.stamina <= 0) {
          result = 'guardbreak';
          this.staggerTimer = 0.8;
          this.state = 'idle';
          this.game.ui.announce('GUARD BROKEN', 'tired', 1.2);
          dmg = amount;
        }
      } else {
        result = 'guardbreak';
        this.staggerTimer = 0.8;
        this.state = 'idle';
      }
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.hurtTimer = 0.3;
    if (dmg > 6) this.staggerTimer = Math.max(this.staggerTimer, heavy ? 0.5 : 0.22);
    this.invuln = 0.65;
    this.charging = false;
    this.attack = null;
    if (this.state !== 'guard') this.state = 'idle';
    if (this.potionTimer > 0) this.potionTimer = 0;
    this.game.ui.damage(this.game.project(this._tmp.set(this.pos.x, 1.9, this.pos.z)), `-${Math.round(dmg)}`, 'small');
    const away = new THREE.Vector3(this.pos.x - sourcePos.x, 0, this.pos.z - sourcePos.z).normalize();
    this.knock.addScaledVector(away, heavy ? 7 : 4.5);
    this.game.ui.flash('hurt');
    this.game.shake(heavy ? 0.5 : 0.28, heavy ? 0.3 : 0.18);
    this.game.audio.impact(0.9, false, 0);
    if (this.hp <= 0) {
      this.dead = true;
      this.state = 'dead';
      this.game.onPlayerDeath();
    }
    return { result, dmg };
  }

  // ------------------------------------------------------------
  _poseReset() {
    this.model.rotation.set(0, 0, 0);
    this.model.position.set(0, 0, 0);
    this.hips.position.y = 0.92 + 0;
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.armR.rotation.set(0, 0, 0);
    this.legL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    if (this.cape) this.cape.rotation.set(0, 0, 0);
  }

  _animate(dt, input, camera, monster) {
    if (!this.rigInit) { this._poseReset(); this.rigInit = true; }
    const pose = {
      hipY: 0, torsoX: 0, torsoY: 0, headX: 0,
      armRx: -0.08, armRy: 0, armRz: 0.12,
      armLx: -0.08, armLy: 0, armLz: -0.12,
      legLx: 0, legRx: 0,
      modelRotY: 0, modelRotX: 0,
      wRx: 0.42, wRy: 0, wRz: -0.12,
      wLx: 0, wLy: -1.15, wLz: 0.2,
      capeSwing: 0,
    };
    if (this.weaponId === 'dualblades') { pose.wRx = 1.35; pose.wRy = 0.1; pose.wRz = 0.15; pose.wLx = 1.35; pose.wLy = -0.1; pose.wLz = -0.15; }
    if (this.weaponId === 'swordshield') { pose.wRx = 0.45; pose.wRy = 0; pose.wRz = -0.05; }

    const moving = this.speedSmooth > 0.6;
    const moveAmt = clamp(this.speedSmooth / this.weapon.moveSpeed, 0, 1.2);
    if (moving) this.walkPhase += dt * (6.5 + this.speedSmooth * 0.7);
    const swing = Math.sin(this.walkPhase) * (0.55 + moveAmt * 0.25);
    if (moving) {
      pose.legLx = swing;
      pose.legRx = -swing;
      pose.armRx += -swing * 0.5;
      pose.armLx += swing * 0.5;
      pose.hipY = Math.abs(Math.cos(this.walkPhase)) * 0.045;
      pose.torsoX = 0.07 + moveAmt * 0.06;
      pose.capeSwing = -0.25 - moveAmt * 0.2;
    } else {
      const breath = Math.sin(this.time * 2.4) * 0.02;
      pose.hipY = breath;
      pose.armRx += breath * 0.8;
      pose.armLx -= breath * 0.5;
    }

    // potion drinking
    if (this.state === 'drink') {
      const t = Math.min(1, this.potionTimer / 1.2);
      pose.armRx = -2.2 + Math.sin(t * Math.PI) * -0.15;
      pose.armRz = -0.9;
      pose.headX = -0.35 * Math.sin(t * Math.PI);
      pose.wRx = 2.0;
    }

    // guard
    if (this.state === 'guard') {
      pose.hipY = -0.12;
      pose.torsoX = 0.18;
      pose.armRx = -1.25;
      pose.armRz = 0.32;
      pose.armLx = -1.35;
      pose.armLz = -0.4;
      pose.wRx = 1.1;
      if (this.weaponId === 'swordshield') {
        pose.armLx = -1.5; pose.armLz = -0.35; pose.armRx = -0.6;
        if (this.weaponL) pose.wLy = -1.5;
      }
      if (this.weaponId === 'greatsword') {
        pose.wRx = 1.55; pose.armRx = -1.5; pose.armRz = 0.25;
      }
      if (this.blockFlash > 0) { this.blockFlash -= dt; pose.torsoX -= 0.15; }
    }

    // dodge
    if (this.state === 'dodge') {
      const t = Math.min(1, this.dodgeTimer / 0.42);
      pose.hipY = -0.35 * Math.sin(t * Math.PI);
      pose.torsoX = 0.65 * Math.sin(t * Math.PI);
      pose.armLx = -1.5; pose.armRx = -1.2;
      pose.legLx = 1.1 * Math.sin(t * Math.PI); pose.legRx = -0.6;
      pose.modelRotY = -t * Math.PI * 2;
    }

    // charging
    if (this.charging) {
      pose.hipY = -0.1;
      pose.torsoX = -0.15;
      pose.torsoY = 0.65;
      pose.armRx = -2.1;
      pose.armRz = 0.4;
      pose.wRx = 1.1;
      pose.headX = 0.1;
    }

    // attack poses
    if (this.state === 'attack' && this.attack) {
      this._attackPose(pose, dt);
    }

    // hurt / stagger
    if (this.hurtTimer > 0) {
      pose.torsoX -= 0.3 * (this.hurtTimer / 0.3);
      pose.headX -= 0.2;
    }
    if (this.staggerTimer > 0 && this.state !== 'dodge') {
      pose.hipY -= 0.1;
      pose.torsoX += 0.25;
    }

    // dead
    if (this.dead) {
      pose.modelRotX = -Math.PI * 0.48;
      pose.hipY = -0.55;
      pose.modelRotY = 0;
      pose.armRx = 0.6; pose.armLx = 0.5;
      pose.legLx = 0.2; pose.legRx = -0.2;
    }

    // apply smoothly
    const k = 1 - Math.exp(-dt * 18);
    const apply = (obj, key, target) => { obj.rotation[key] = lerp(obj.rotation[key], target, k); };
    apply(this.torso, 'x', pose.torsoX);
    apply(this.torso, 'y', pose.torsoY);
    apply(this.head, 'x', pose.headX);
    apply(this.armR, 'x', pose.armRx);
    apply(this.armR, 'y', pose.armRy);
    apply(this.armR, 'z', pose.armRz);
    apply(this.armL, 'x', pose.armLx);
    apply(this.armL, 'y', pose.armLy);
    apply(this.armL, 'z', pose.armLz);
    apply(this.legL, 'x', pose.legLx);
    apply(this.legR, 'x', pose.legRx);
    this.hips.position.y = lerp(this.hips.position.y, 0.92 + pose.hipY, k);
    this.model.position.y = lerp(this.model.position.y, this.dead ? 0.42 : 0, this.dead ? 1 - Math.exp(-dt * 4) : k);
    this.model.rotation.y = lerp(this.model.rotation.y, pose.modelRotY, 1 - Math.exp(-dt * 20));
    this.model.rotation.x = lerp(this.model.rotation.x, pose.modelRotX, this.dead ? 1 - Math.exp(-dt * 6) : k);
    if (this.cape) {
      apply(this.cape, 'x', pose.capeSwing + Math.sin(this.time * 3) * 0.05);
      apply(this.cape, 'z', Math.sin(this.time * 1.7) * 0.06);
    }
    if (this.weaponR) {
      this.weaponR.rotation.x = lerp(this.weaponR.rotation.x, pose.wRx, 1 - Math.exp(-dt * 22));
      this.weaponR.rotation.y = lerp(this.weaponR.rotation.y, pose.wRy, 1 - Math.exp(-dt * 22));
      this.weaponR.rotation.z = lerp(this.weaponR.rotation.z, pose.wRz, 1 - Math.exp(-dt * 22));
    }
    if (this.weaponL) {
      this.weaponL.rotation.x = lerp(this.weaponL.rotation.x, pose.wLx, 1 - Math.exp(-dt * 22));
      this.weaponL.rotation.y = lerp(this.weaponL.rotation.y, pose.wLy, 1 - Math.exp(-dt * 22));
      this.weaponL.rotation.z = lerp(this.weaponL.rotation.z, pose.wLz, 1 - Math.exp(-dt * 22));
    }
    this.root.rotation.y = this.facing;
    this.root.position.set(this.pos.x, 0, this.pos.z);
  }

  _attackPose(pose, dt) {
    const a = this.attack;
    const def = a.def;
    let t = 0;
    let phase = a.phase;
    if (phase === 'windup') t = clamp(a.timer / def.windup, 0, 1);
    else if (phase === 'active') t = clamp(a.timer / def.active, 0, 1);
    else t = clamp(a.timer / def.recover, 0, 1);
    const w = phase === 'windup' ? easeOut(t) : phase === 'active' ? easeInOut(t) : t;
    const anim = def.anim;

    if (anim === 'vertical' || anim === 'uppercut') {
      if (phase === 'windup') {
        pose.torsoY = 0.3 * w;
        pose.armRx = -0.3 - 2.1 * w;
        pose.armRz = 0.5;
        pose.wRx = 0.5 - 0.7 * w;
        pose.hipY = 0.02;
      } else if (phase === 'active') {
        pose.torsoY = 0.3 - 0.5 * w;
        pose.torsoX = 0.2 * w;
        pose.armRx = -2.4 + 3.4 * w;
        pose.armRz = 0.4 - 0.6 * w;
        pose.wRx = -0.2 + 1.7 * w;
        pose.hipY = -0.06 * w;
      } else {
        pose.torsoY = -0.2 * (1 - w);
        pose.armRx = 1.0 - 1.0 * w;
        pose.armRz = 0.2;
        pose.wRx = 1.5 - 1.1 * w;
      }
    } else if (anim === 'horizontal' || anim === 'spin') {
      if (anim === 'spin') {
        pose.armRx = -1.2;
        pose.armRz = -1.1;
        pose.wRx = 1.5;
        if (phase === 'windup') pose.torsoY = -0.7 * w;
        else if (phase === 'active') pose.modelRotY = -Math.PI * 2 * w;
        else pose.modelRotY = -Math.PI * 2;
        pose.hipY = -0.05;
      } else {
        if (phase === 'windup') {
          pose.torsoY = 1.1 * w;
          pose.armRx = -1.2;
          pose.armRz = -0.7;
          pose.wRx = 1.2;
          pose.hipY = -0.04;
        } else if (phase === 'active') {
          pose.torsoY = 1.1 - 2.3 * w;
          pose.armRx = -1.3;
          pose.armRz = -0.5;
          pose.wRx = 1.45;
          pose.hipY = -0.05;
        } else {
          pose.torsoY = -1.2 + 1.2 * w;
          pose.armRx = -1.0;
          pose.armRz = -0.2;
          pose.wRx = 1.35;
        }
      }
    } else if (anim === 'thrust' || anim === 'bash') {
      const forward = anim === 'bash' ? 1 : 1;
      if (phase === 'windup') {
        pose.torsoX = -0.15;
        pose.armRx = anim === 'bash' ? -1.4 : -1.3;
        pose.armRz = 0.5;
        pose.wRx = 1.4;
        pose.hipY = -0.08;
        if (anim === 'bash') { pose.armLx = -1.2; pose.armLz = -0.6; }
      } else if (phase === 'active') {
        pose.torsoX = 0.2;
        pose.armRx = -1.7;
        pose.armRz = 0.1;
        pose.wRx = 1.6;
        if (anim === 'bash') { pose.armLx = -2.1 * forward; pose.armLz = -0.45; }
      } else {
        pose.armRx = -0.6;
        pose.armRz = 0.2;
        pose.wRx = 0.8;
      }
    } else if (anim === 'dbl1' || anim === 'dbl2' || anim === 'dbl3' || anim === 'dance') {
      const speed = a.finisher ? 22 : 15;
      const spin = Math.sin(a.timer * speed);
      if (anim === 'dbl1') {
        pose.armRx = phase === 'windup' ? -1.4 : 0.8 * spin;
        pose.armRz = 0.5;
        pose.armLx = phase === 'active' ? -1.6 : -0.4;
        pose.armLz = -0.35;
        pose.torsoY = spin * 0.4;
        pose.modelRotY = phase === 'active' ? spin * 0.25 : 0;
      } else if (anim === 'dbl2') {
        pose.armLx = phase === 'windup' ? -1.4 : 0.8 * -spin;
        pose.armLz = -0.5;
        pose.armRx = phase === 'active' ? -1.6 : -0.4;
        pose.armRz = 0.35;
        pose.torsoY = -spin * 0.5;
      } else if (anim === 'dbl3') {
        pose.armRx = phase === 'windup' ? -2.0 : 1.1 * spin;
        pose.armLx = phase === 'windup' ? -2.0 : 1.1 * -spin;
        pose.armRz = 0.45; pose.armLz = -0.45;
        pose.hipY = -0.06;
      } else {
        // blade dance
        pose.armRx = -1.2 + Math.sin(a.timer * 28) * 1.3;
        pose.armLx = -1.2 + Math.cos(a.timer * 28) * 1.3;
        pose.armRz = 0.6; pose.armLz = -0.6;
        pose.torsoY = Math.sin(a.timer * 18) * 0.4;
        pose.modelRotY = -a.timer * 13;
        pose.hipY = -0.08;
      }
    } else if (anim === 'sn1' || anim === 'sn2' || anim === 'sn3') {
      if (anim === 'sn1') {
        pose.armRx = phase === 'windup' ? -1.2 : phase === 'active' ? 0.8 : 0.2;
        pose.armRz = 0.3;
        pose.torsoY = phase === 'active' ? 0.5 : 0.1;
        pose.wRx = 1.3;
      } else if (anim === 'sn2') {
        pose.armRx = -1.0;
        pose.armRz = -0.6;
        pose.wRx = 1.45;
        pose.torsoY = phase === 'active' ? -0.55 : 0;
      } else {
        pose.armRx = phase === 'windup' ? -0.8 : -1.7;
        pose.armRz = 0.18;
        pose.wRx = 1.6;
        pose.torsoX = phase === 'active' ? 0.35 : 0;
        pose.armLx = -0.9;
      }
    }
  }

  destroy() {
    this.trail?.dispose();
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
