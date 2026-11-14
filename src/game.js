// ============================================================
// IRONFANG — game orchestration
// ============================================================
import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { Monster } from './monster.js';
import { createArena } from './arena.js';
import { WEAPONS, QUESTS, MATERIALS, upgradeCost, canAfford } from './data.js';
import { loadSave, writeSave, resetSave } from './save.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angleDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const HUNT_LENGTH = 600;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.save = loadSave();
    this.audio = new AudioEngine();
    this.audio.setVolumes({
      master: this.save.settings.master / 100,
      music: this.save.settings.music / 100,
      sfx: this.save.settings.sfx / 100,
    });

    const coarse = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.touchDevice = coarse;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance', alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x050b0a, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);

    this.fx = new FX(this.scene);
    this.ui = new UI(this);
    this.input = new Input(this, canvas);
    this.input.onPause = () => {
      if (this.state === 'hunt') this.setPaused(true);
      else if (this.state === 'pause') this.setPaused(false);
    };

    this.state = 'title';
    this.time = 0;
    this.lockOn = false;
    this.arena = null;
    this.player = null;
    this.monster = null;
    this.currentQuest = null;
    this.projectiles = [];
    this.zones = [];
    this.hitstop = 0;
    this.shakeAmt = 0;
    this.shakeTime = 0;
    this.camYaw = 0.3;
    this.camPitch = 0.26;
    this.resultDelay = 0;
    this.huntOver = false;
    this.intro = 0;
    this.musicIntensity = 1;
    this.settingsFromPause = false;
    this.smithWeapon = this.save.weapon;
    this.partsVersion = 0;
    this.hunt = null;

    this._bind();
    this.buildHub();
    this.ui.showScreen('title');
    this.applySettings();
    this.ui.setFade(false);
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    window.game = this;
  }

  _bind() {
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const kick = () => {
      this.audio.unlock();
      if (this.audio.musicMode === null && this.state !== 'result') {
        this.audio.startMusic(this.state === 'hunt' ? 'battle' : 'hub');
      }
    };
    window.addEventListener('pointerdown', kick, { passive: true });
    window.addEventListener('keydown', kick);
    window.addEventListener('keydown', (e) => {
      // Input is disabled while paused, so handle the resume shortcut here.
      if (e.code === 'Escape' && this.state === 'pause') this.setPaused(false);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'hunt') this.setPaused(true);
    });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.touchDevice ? 1.5 : 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 68 : w / h < 1.2 ? 64 : 60;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------
  // lifecycle
  // ------------------------------------------------------------
  clearWorld() {
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      p.mesh.traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    }
    this.projectiles = [];
    for (const z of this.zones) {
      this.scene.remove(z.mesh);
      z.mesh.traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    }
    this.zones = [];
    if (this.monster) { this.monster.destroy(); this.monster = null; }
    if (this.player) { this.player.destroy(); this.player = null; }
    if (this.arena) { this.arena.dispose(); this.arena = null; }
    this.fx.clear();
  }

  buildHub() {
    this.state = this.state === 'title' ? 'title' : 'hub';
    this.clearWorld();
    this.arena = createArena('hub', this.scene, this.renderer);
    this.spawnHubPlayer();
    this.hubTime = 0;
    this.camYaw = 0.28;
    this.camPitch = 0.2;
    this.lockOn = false;
    this.audio.startMusic('hub');
    this.audio.setIntensity(1);
    this.camera.position.set(0, 3, 10);
    this.camera.lookAt(0, 1.2, 2);
  }

  spawnHubPlayer() {
    if (this.player) { this.player.destroy(); this.player = null; }
    const id = this.save.weapon;
    const lvl = this.save.weaponLevels[id];
    const skin = this.save.skins[id];
    this.player = new Player(this.scene, this, id, lvl, skin);
    this.player.setPosition(this.arena.hubPlayer);
    this.player.facing = 0.15;
    this.player.root.rotation.y = 0.15;
  }

  goHub() {
    this.ui.hideResult();
    this.ui.showPause(false);
    this.ui.setFade(true);
    setTimeout(() => {
      this.state = 'hub';
      this.buildHub();
      this.ui.hideAllScreens();
      this.ui.showScreen('hub');
      this.ui.showHuntHud(false);
      this.ui.applyTouchVisibility(false);
      this.input.setEnabled(false);
      this.ui.setFade(false);
    }, 120);
  }

  startHunt(questId) {
    const quest = QUESTS.find((q) => q.id === questId);
    if (!quest) return;
    this.audio.unlock();
    this.currentQuest = quest;
    this.state = 'hunt';
    this.clearWorld();
    this.ui.setFade(true);

    this.arena = createArena(quest.arena, this.scene, this.renderer);
    const weaponId = this.save.weapon;
    this.player = new Player(this.scene, this, weaponId, this.save.weaponLevels[weaponId], this.save.skins[weaponId]);
    this.player.reset(this.arena.playerStart);
    this.player.facing = Math.PI;
    this.player.root.rotation.y = Math.PI;
    this.monster = new Monster(this.scene, this, quest.monster);
    this.monster.pos.copy(this.arena.monsterStart);
    this.monster.root.position.copy(this.monster.pos);
    this.monster.yaw = 0;
    this.monster.root.rotation.y = 0;
    this.monster.state = 'roar';
    this.monster.timer = 0;

    this.lockOn = false;
    this.huntOver = false;
    this.resultDelay = 0;
    this.hitstop = 0;
    this.shakeAmt = 0;
    this.shakeTime = 0;
    this.camYaw = 0;
    this.camPitch = 0.26;
    this.intro = 3.0;
    this.introRoared = false;
    this.partsVersion = 1;
    this.damageDealt = 0;
    this.hunt = {
      quest,
      timeLeft: HUNT_LENGTH,
      breaks: 0,
      breakMats: {},
      parts: [],
      won: false,
      reason: null,
    };
    this.ui._lastHud = {};
    this.ui.setupHud(quest);
    this.ui.setParts(this.monster.getParts().map((p) => ({ id: p.id, label: p.label, weak: p.weak })));
    this.ui.showScreen(null);
    this.ui.showHuntHud(true);
    this.ui.applyTouchVisibility(true);
    this.ui.setFade(false);
    this.ui.announce(quest.monsterName.toUpperCase(), '', 2.4);
    this.ui.subtitle(quest.hint, 3.4);
    this.input.reset();
    this.input.setEnabled(true);
    this.audio.startMusic('battle');
    this.audio.setIntensity(1);
    this.musicIntensity = 1;
    setTimeout(() => { if (this.state === 'hunt') this.input.requestPointerLock(); }, 200);
    setTimeout(() => this.audio.roar(true), 350);
    this.shake(0.35, 0.8);
  }

  restartHunt() {
    if (this.currentQuest) this.startHunt(this.currentQuest.id);
  }

  abandonHunt() {
    this.state = 'hub';
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.goHub();
  }

  setPaused(v) {
    if (v) {
      if (this.state !== 'hunt' || this.huntOver) return;
      this.state = 'pause';
      this.ui.showPause(true);
      this.input.setEnabled(false);
      this.input.exitPointerLock();
      this.audio.ui();
    } else {
      if (this.state !== 'pause') return;
      this.state = 'hunt';
      this.ui.showPause(false);
      this.ui.hideAllScreens();
      this.input.setEnabled(true);
      this.input.clearPresses();
      this.audio.ui();
      setTimeout(() => this.input.requestPointerLock(), 100);
    }
  }

  navigate(name) {
    if (this.state === 'hunt' || this.state === 'result') return;
    if (name === 'hub') {
      if (this.state === 'pause' && this.settingsFromPause) {
        this.settingsFromPause = false;
        this.ui.showScreen(null);
        this.ui.showPause(true);
        return;
      }
      if (this.audio.musicMode !== 'hub') this.audio.startMusic('hub');
      this.goHub();
      return;
    }
    if (name === 'settings' && this.state === 'pause') {
      this.settingsFromPause = true;
      this.ui.showPause(false);
    }
    this.ui.showScreen(name);
  }

  applySettings() {
    const s = this.save.settings;
    this.audio.setVolumes({ master: s.master / 100, music: s.music / 100, sfx: s.sfx / 100 });
    this.ui.applySettings();
    this.saveProgress();
  }

  saveProgress() { writeSave(this.save); }

  // ------------------------------------------------------------
  // progression
  // ------------------------------------------------------------
  setWeapon(id) {
    if (!WEAPONS[id]) return;
    this.save.weapon = id;
    this.saveProgress();
    this.audio.ui();
    this.ui.refreshHub();
    if (this.state === 'hub' || this.state === 'title') {
      this.spawnHubPlayer();
      this.ui.toast(`${WEAPONS[id].name} equipped`);
    }
  }

  upgradeWeapon(id) {
    const lvl = this.save.weaponLevels[id];
    if (lvl >= 5) return;
    const cost = upgradeCost(id, lvl + 1);
    if (!cost || !canAfford(cost, this.save.materials)) { this.ui.toast('Not enough materials'); this.audio.ui(); return; }
    for (const [mat, qty] of Object.entries(cost)) this.save.materials[mat] -= qty;
    this.save.weaponLevels[id] = lvl + 1;
    this.saveProgress();
    this.audio.notify();
    this.ui.refreshSmith();
    this.ui.toast(`${WEAPONS[id].name} forged to Lv.${lvl + 1}`);
    if (this.state === 'hub' && this.save.weapon === id) this.spawnHubPlayer();
  }

  unlockSkin(id, idx) {
    const w = WEAPONS[id];
    const skin = w.skins[idx];
    if (!skin || this.save.unlockedSkins[id].includes(idx)) return;
    const lvl = this.save.weaponLevels[id];
    if (lvl < skin.reqLevel) { this.ui.toast(`Requires ${w.name} Lv.${skin.reqLevel}`); return; }
    if (!skin.cost || !canAfford(skin.cost, this.save.materials)) { this.ui.toast('Not enough materials'); return; }
    for (const [mat, qty] of Object.entries(skin.cost)) this.save.materials[mat] -= qty;
    this.save.unlockedSkins[id].push(idx);
    this.save.skins[id] = idx;
    this.saveProgress();
    this.audio.notify();
    this.ui.refreshSmith();
    this.ui.toast(`Skin unlocked · ${skin.name}`);
    if (this.state === 'hub' && this.save.weapon === id) this.spawnHubPlayer();
  }

  equipSkin(id, idx) {
    this.save.skins[id] = idx;
    this.saveProgress();
    this.audio.ui();
    this.ui.refreshSmith();
    if (this.state === 'hub' && this.save.weapon === id) this.spawnHubPlayer();
  }

  resetProgress() {
    if (!window.confirm('Erase all progress, materials and upgrades?')) return;
    this.save = resetSave();
    this.saveProgress();
    this.audio.ui();
    this.smithWeapon = this.save.weapon;
    this.spawnHubPlayer();
    this.ui.refreshSettings();
    this.ui.refreshHub();
    this.ui.toast('Progress reset');
  }

  // ------------------------------------------------------------
  // combat bridge
  // ------------------------------------------------------------
  shake(amount, duration = 0.2) {
    if (this.save.settings.shake === false) return;
    this.shakeAmt = Math.max(this.shakeAmt, amount);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  project(worldPos) {
    const v = worldPos.clone().project(this.camera);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
      visible: v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2,
    };
  }

  playerHit({ part, base, def, worldPos, finisher, charged, demon }) {
    if (!this.monster || this.monster.dying || this.huntOver) return;
    const res = this.monster.damage(part.id, base, { finisher, charged });
    if (!res) return;
    const dmg = Math.round(res.damage);
    const cls = finisher || charged ? 'big' : part.weak ? 'weak' : part.mult < 1 ? 'resist' : '';
    this.ui.damage(this.project(worldPos), `${dmg}`, cls, part.weak ? 'WEAK' : (charged ? 'CHARGED' : ''));
    this.hitstop = Math.min(0.11, Math.max(this.hitstop, finisher || charged ? 0.075 : 0.032));
    this.audio.impact(Math.min(1.4, 0.55 + dmg / 60), !!part.weak);
    this.shake(def.shake ?? 0.2, 0.13);
    this.damageDealt += res.damage;
    if (res.broke) this.partsVersion++;
    if (res.enragedNow) {
      this.audio.setIntensity(2);
      this.musicIntensity = 2;
    }
    if (res.tiredNow) this.audio.setIntensity(1);
  }

  onPartBreak(part) {
    if (!this.hunt) return;
    this.hunt.breaks++;
    this.hunt.parts.push(part.label);
    const mat = part.material || 'mossScale';
    this.hunt.breakMats[mat] = (this.hunt.breakMats[mat] || 0) + 1;
    this.partsVersion++;
    this.ui.toast(`${part.label} broken · +1 ${MATERIALS[mat]?.name || 'material'}`, 2.4);
  }

  onMonsterDeath(monster) {
    if (this.huntOver) return;
    this.huntOver = true;
    this.hunt.won = true;
    this.hunt.reason = 'kill';
    this.resultDelay = 3.5;
    this.lockOn = false;
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.player.invuln = 999;
    this.audio.setIntensity(1);
    setTimeout(() => {
      if (this.state === 'hunt' || this.state === 'huntOver') this.audio.stopMusic();
    }, 900);
    this.ui.announce('HUNT COMPLETE', '', 3.0);
    this.ui.subtitle(`${monster.type.name} has fallen.`, 3.2);
  }

  onMonsterDeathEnd() {
    if (this.huntOver) this.resultDelay = Math.min(this.resultDelay, 0.25);
  }

  onPlayerDeath() {
    if (this.huntOver) return;
    this.huntOver = true;
    this.hunt.won = false;
    this.hunt.reason = 'death';
    this.resultDelay = 2.2;
    this.lockOn = false;
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.audio.stopMusic();
    this.audio.defeat();
    this.ui.announce('HUNTER DOWN', '', 2.4);
    this.ui.flash('hurt');
  }

  onPointerLockChange(locked) {
    if (this.state === 'hunt' && !locked && this.player && !this.huntOver && this.input.touchUsed === false) {
      // pointer captured hint remains; drag-look fallback still works
    }
  }

  toggleLock() {
    if (this.state !== 'hunt' || !this.monster || this.monster.dead) return;
    this.lockOn = !this.lockOn;
    this.audio.ui();
    this.ui.hint(this.lockOn ? 'Lock-on engaged' : 'Lock-on released', 1.2);
    if (this.lockOn) this.shake(0.05, 0.05);
  }

  setMusicIntensity(n) { this.audio.setIntensity(n); this.musicIntensity = n; }

  // ------------------------------------------------------------
  // projectiles & zones
  // ------------------------------------------------------------
  spawnProjectile({ from, to, speed, radius, damage, color, type, onHit }) {
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), new THREE.MeshBasicMaterial({ color }));
    const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 1.8, 1), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    group.add(core, glow);
    group.position.copy(from);
    this.scene.add(group);
    const dir = to.clone().sub(from);
    const distance = Math.max(1, dir.length());
    dir.normalize();
    this.projectiles.push({
      mesh: group, core, glow, from: from.clone(), to: to.clone(), dir, speed,
      traveled: 0, distance, damage, radius, onHit, color, type, life: 4,
    });
    this.audio.whoosh?.();
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const step = p.speed * dt;
      p.traveled += step;
      p.mesh.position.addScaledVector(p.dir, step);
      p.mesh.position.y = p.from.y + (p.to.y - p.from.y) * Math.min(1, p.traveled / p.distance);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 4;
      p.glow.material.opacity = 0.25 + Math.sin(this.time * 20) * 0.07;
      if (Math.random() < dt * 40) {
        this.fx.burst(p.mesh.position, p.color, 1, 0.7, 1, { life: 0.35, gravity: 0, up: 0.1 });
      }
      const pc = this.player?.pos;
      const hitPlayer = pc && Math.hypot(pc.x - p.mesh.position.x, pc.z - p.mesh.position.z) < p.radius + 0.7;
      if (p.traveled >= p.distance || hitPlayer || p.life <= 0) {
        p.onHit?.(p.mesh.position.clone());
        this.fx.burst(p.mesh.position, p.color, 14, 5, 1, { life: 0.5, gravity: 2 });
        this.scene.remove(p.mesh);
        p.mesh.traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
        this.projectiles.splice(i, 1);
      }
      p.life -= dt;
    }
  }

  spawnZone({ pos, radius, duration, dps, slow, color = 0x6fd8ff }) {
    const group = new THREE.Group();
    group.position.set(pos.x, 0.06, pos.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius, 40), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 36), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    fill.rotation.x = -Math.PI / 2;
    group.add(ring, fill);
    this.scene.add(group);
    this.zones.push({ mesh: group, ring, fill, pos: pos.clone(), radius, remaining: duration, dps, slow, tick: 0, color });
    this.fx.shockwave(pos, radius, color, 0.7);
  }

  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.remaining -= dt;
      z.tick -= dt;
      const f = Math.max(0, z.remaining / 5.5);
      z.ring.material.opacity = 0.35 + Math.sin(this.time * 6) * 0.12;
      z.mesh.rotation.y += dt * 0.35;
      const pc = this.player?.pos;
      const inside = pc && Math.hypot(pc.x - z.pos.x, pc.z - z.pos.z) < z.radius;
      if (inside) {
        this.player.slowTimer = 0.8;
        if (z.tick <= 0) {
          z.tick = 0.9;
          this.player.takeDamage(z.dps, z.pos, false);
          this.ui.subtitle('Frozen ground saps your strength', 1.2);
        }
        if (Math.random() < dt * 18) {
          this.fx.burst(new THREE.Vector3(pc.x + (Math.random() - 0.5) * 1.5, 0.4, pc.z + (Math.random() - 0.5) * 1.5), z.color, 1, 0.8, 1, { life: 0.6, gravity: 6 });
        }
      }
      if (Math.random() < dt * 10) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * z.radius;
        this.fx.burst(new THREE.Vector3(z.pos.x + Math.cos(a) * r, 0.2 + Math.random() * 1.2, z.pos.z + Math.sin(a) * r), z.color, 1, 0.5, 1, { life: 0.8, gravity: -1 });
      }
      if (z.remaining <= 0) {
        this.scene.remove(z.mesh);
        z.mesh.traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
        this.zones.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------
  // update loop
  // ------------------------------------------------------------
  loop(now) {
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, Math.max(0.0001, raw));
    this.time += dt;
    if (this.state === 'hunt') this.updateHunt(dt);
    else if (this.state === 'result') this.updateResult(dt);
    else if (this.state === 'pause') {
      if (this.arena) this.arena.update(dt, this.time, this.player?.pos);
      this.fx.update(dt);
    } else {
      this.updateHub(dt);
    }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }

  updateHub(dt) {
    if (!this.arena || !this.player) return;
    this.hubTime += dt;
    this.arena.update(dt, this.time, this.player.pos);
    this.player._animate(dt, null, this.camera, null);
    this.fx.update(dt);
    const target = new THREE.Vector3(this.player.pos.x, 1.25, this.player.pos.z);
    const yaw = 0.32 + Math.sin(this.time * 0.11) * 0.18;
    const pitch = 0.17;
    const dist = this.state === 'title' ? 6.4 : 7.2;
    const desired = new THREE.Vector3(
      target.x + Math.sin(yaw) * dist * Math.cos(pitch),
      target.y + 1.1 + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * dist * Math.cos(pitch)
    );
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 3));
    const right = new THREE.Vector3(-Math.cos(yaw + Math.PI / 2), 0, Math.sin(yaw + Math.PI / 2));
    const look = target.clone();
    if (this.state === 'title') look.addScaledVector(right, -2.4);
    this.camera.lookAt(look);
  }

  updateHunt(dt) {
    if (!this.arena || !this.player || !this.monster) return;
    if (this.input.consume('lock')) this.toggleLock();
    this.arena.update(dt, this.time, this.player.pos);
    this.fx.update(dt);

    if (this.intro > 0) {
      this.intro -= dt;
      const t = clamp(1 - this.intro / 3.0, 0, 1);
      this.monster._animate(dt, this.player);
      this.player._animate(dt, null, this.camera, null);
      this.updateIntroCamera(t, dt);
      if (!this.introRoared && t > 0.12) {
        this.introRoared = true;
        this.audio.roar(true);
        this.shake(0.55, 0.6);
        this.fx.shockwave(this.monster.pos, 8, 0xffd9a0, 0.9);
        this.fx.dust(new THREE.Vector3(this.monster.pos.x, 0.2, this.monster.pos.z), 20, 0x9a8a72);
      }
      if (this.intro <= 0) {
        this.monster.state = 'chase';
        this.monster.think = 0.6;
        this.hintControls();
      }
      this.updateHud();
      return;
    }

    if (this.huntOver) {
      this.resultDelay -= dt;
      this.monster.update(dt, this.player);
      this.player._animate(dt, null, this.camera, null);
      this.updateCamera(dt);
      this.updateHud();
      if (this.resultDelay <= 0 && this.state === 'hunt') this.finishHunt(this.hunt.reason === 'kill');
      return;
    }

    // quest timer
    this.hunt.timeLeft -= dt;
    if (this.hunt.timeLeft <= 0) {
      this.hunt.timeLeft = 0;
      this.huntOver = true;
      this.hunt.won = false;
      this.hunt.reason = 'timeout';
      this.resultDelay = 2.0;
      this.input.setEnabled(false);
      this.input.exitPointerLock();
      this.audio.stopMusic();
      this.ui.announce('TIME EXPIRED', '', 2.4);
      this.huntOver = true;
      return;
    }

    if (this.hitstop > 0) this.hitstop = Math.max(0, this.hitstop - dt);
    const simDt = this.hitstop > 0 ? dt * 0.06 : dt;

    this.player.update(simDt, this.input, this.camera, this.monster);
    this.monster.update(simDt, this.player);
    this.resolveBodies();
    this.updateProjectiles(simDt);
    this.updateZones(simDt);
    this.updateCamera(dt);
    this.updateHud();
  }

  updateResult(dt) {
    if (this.arena) this.arena.update(dt, this.time, this.player?.pos);
    this.fx.update(dt);
    if (this.monster) this.monster.update(dt, this.player || { pos: this.monster.pos });
    if (this.player) this.player._animate(dt, null, this.camera, null);
    // slow orbit around the aftermath
    const t = this.time * 0.13;
    const center = new THREE.Vector3();
    if (this.player) center.add(this.player.pos);
    if (this.monster) center.add(this.monster.pos);
    center.multiplyScalar(this.monster && this.player ? 0.5 : 1);
    center.y = 1.6;
    const yaw = t + 0.8;
    const dist = 11;
    const desired = new THREE.Vector3(
      center.x + Math.sin(yaw) * dist,
      center.y + 4.2,
      center.z + Math.cos(yaw) * dist
    );
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 1.4));
    this.camera.lookAt(center);
  }

  resolveBodies() {
    if (!this.player || !this.monster || this.monster.dead) return;
    const dx = this.player.pos.x - this.monster.pos.x;
    const dz = this.player.pos.z - this.monster.pos.z;
    const dist = Math.hypot(dx, dz);
    const min = this.monster.type.radius * 0.82 + 0.45;
    if (dist < min && dist > 0.001) {
      const push = min - dist;
      this.player.pos.x += (dx / dist) * push;
      this.player.pos.z += (dz / dist) * push;
      this.player.root.position.set(this.player.pos.x, 0, this.player.pos.z);
    }
  }

  updateIntroCamera(t, dt) {
    const ease = t * t * (3 - 2 * t);
    const yaw = 2.7 * (1 - ease);
    const pitch = 0.08 + 0.2 * ease;
    const dist = 11 - 3 * ease;
    const target = new THREE.Vector3(this.player.pos.x, 1.4, this.player.pos.z);
    const mc = this.monster.center;
    const look = target.clone().lerp(mc, Math.sin(t * Math.PI) * 0.55);
    const desired = new THREE.Vector3(
      target.x + Math.sin(yaw) * dist * Math.cos(pitch),
      target.y + 1.3 + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * dist * Math.cos(pitch)
    );
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
    this.camera.lookAt(look);
    this.camYaw = yaw;
    this.camPitch = pitch;
  }

  updateCamera(dt) {
    const look = this.input.consumeLook();
    if (look.x || look.y) {
      this.camYaw -= look.x;
      this.camPitch = clamp(this.camPitch + look.y * 0.65, -0.12, 1.0);
    }
    if (this.lockOn && this.monster && !this.monster.dead) {
      const desired = Math.atan2(this.player.pos.x - this.monster.pos.x, this.player.pos.z - this.monster.pos.z);
      this.camYaw += angleDiff(desired, this.camYaw) * (1 - Math.exp(-dt * 4.5));
      this.camPitch += (0.3 - this.camPitch) * (1 - Math.exp(-dt * 2.5));
    }
    const target = new THREE.Vector3(this.player.pos.x, 1.4, this.player.pos.z);
    const dist = this.lockOn ? 9.4 : 7.8;
    const cosP = Math.cos(this.camPitch);
    let desired = new THREE.Vector3(
      target.x + Math.sin(this.camYaw) * dist * cosP,
      target.y + 0.7 + Math.sin(this.camPitch) * dist,
      target.z + Math.cos(this.camYaw) * dist * cosP
    );
    desired.y = Math.max(1.1, desired.y);
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 11));

    // camera shake
    let sx = 0, sy = 0, sz = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = this.shakeAmt * Math.min(1, this.shakeTime * 6);
      sx = (Math.random() - 0.5) * k;
      sy = (Math.random() - 0.5) * k;
      sz = (Math.random() - 0.5) * k;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.4);
    }
    this.camera.lookAt(target.x + sx, target.y + sy, target.z + sz);
    this.camera.position.x += sx * 0.2;
    this.camera.position.y += sy * 0.15;
  }

  updateHud() {
    const p = this.player, m = this.monster;
    if (!p || !m || !this.hunt) return;
    let combo = 0;
    if (p.state === 'attack' && p.attack) combo = p.attack.index + 1;
    else if (p.comboTimer > 0) combo = p.comboIndex + 1;
    this.ui.updateHud({
      hp: p.hp, maxHp: p.maxHp, stamina: p.stamina, maxStamina: p.maxStamina,
      potions: p.potions,
      monsterHp: m.health, monsterMaxHp: m.maxHealth,
      phase: m.phase,
      time: this.hunt.timeLeft,
      combo: m.dying ? 0 : combo,
      charge: p.charging ? p.chargeLevel : 0,
      locked: this.lockOn,
      brokenParts: m.parts.filter((pr) => pr.broken).map((pr) => ({ id: pr.id })),
      partsVersion: this.partsVersion,
    });
  }

  hintControls() {
    const id = this.save.weapon;
    let msg = '';
    if (id === 'greatsword') msg = 'Hold ATTACK to charge · Hold SPECIAL to guard';
    else if (id === 'dualblades') msg = 'Tap SPECIAL for Demon Mode · tap again mid-combo for Blade Dance';
    else msg = 'Hold SPECIAL to guard · ITEM while moving';
    this.ui.hint(msg, 5);
    const touch = this.ui.touchMode || this.touchDevice;
    if (!touch) this.ui.subtitle('F — lock on · Space — dodge · E — potion', 4);
  }

  // ------------------------------------------------------------
  // results
  // ------------------------------------------------------------
  finishHunt(won) {
    if (this.state === 'result') return;
    const q = this.hunt.quest;
    const rewards = {};
    let zenny = 0;
    if (won) {
      for (const [mat, range] of Object.entries(q.rewards)) {
        const [a, b] = range;
        const qty = a + Math.floor(Math.random() * (b - a + 1));
        rewards[mat] = (rewards[mat] || 0) + qty;
      }
      for (const [mat, qty] of Object.entries(this.hunt.breakMats || {})) {
        rewards[mat] = (rewards[mat] || 0) + qty;
      }
      zenny = q.zenny + this.hunt.breaks * 130;
      for (const [mat, qty] of Object.entries(rewards)) {
        this.save.materials[mat] = (this.save.materials[mat] || 0) + qty;
      }
      this.save.zenny += zenny;
      this.save.cleared[q.id] = true;
      this.save.stats.wins++;
    }
    const timeUsed = HUNT_LENGTH - this.hunt.timeLeft;
    const mm = Math.floor(timeUsed / 60);
    const ss = Math.floor(timeUsed % 60).toString().padStart(2, '0');
    this.save.stats.hunts++;
    this.save.stats.totalDamage += Math.round(this.damageDealt);
    this.save.stats.breaks += this.hunt.breaks;
    if (won) {
      if (this.save.stats.bestTime === null || timeUsed < this.save.stats.bestTime) this.save.stats.bestTime = timeUsed;
    }
    this.saveProgress();

    this.state = 'result';
    this.ui.showHuntHud(false);
    this.ui.applyTouchVisibility(false);
    this.audio.stopMusic();
    if (won) this.audio.victory();
    else this.audio.defeat();
    this.ui.showResult({
      won,
      quest: q,
      rewards,
      zenny,
      reason: this.hunt.reason,
      stats: {
        time: `${mm}:${ss}`,
        breaks: this.hunt.breaks,
        damage: Math.round(this.damageDealt),
        potions: this.player?.potions ?? 0,
      },
    });
  }

  // ------------------------------------------------------------
  // helper for UI damage layers
  // ------------------------------------------------------------
  notify(text) { this.ui.toast(text); }
}
