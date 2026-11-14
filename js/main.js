/* ============================================================
   Aetherbound — Shards of Dawn
   Stage 1 entry point: renderer, Sunlit Meadow test environment,
   third-person camera, fixed-step player, HUD, menus and audio.

   Later stages (ruins / crystal / sky zones, enemies, bosses)
   are intentionally not activated here. See WORLD_ZONES below.
   ============================================================ */
import * as THREE from 'three';
import { Environment, QUALITY } from './Environment.js';
import { Input } from './Input.js';
import { World } from './World.js';
import { Effects } from './Effects.js';
import { Player } from './Player.js';
import { AudioManager } from './Audio.js';
import { clamp, damp, formatTime, makeGlowSprite, makeRadialTexture } from './Utils.js';

const WISP_GLOW = makeRadialTexture(96, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.16);

/* ------------------------------------------------------------
   Scope gate — Stage 1 only builds the meadow. The other three
   zone builders already exist, but stay off until approved.
   ------------------------------------------------------------ */
const WORLD_ZONES = ['meadow'];

const STEP = 1 / 120;
const SAVE_KEY = 'aetherbound.stage1.save.v1';
const PREFS_KEY = 'aetherbound.prefs.v1';
const SAVE_VERSION = 1;

const DEFAULTS = {
  quality: 'high',
  renderScale: 100,
  post: true,
  shadows: true,
  sens: 100,
  invert: false,
  master: 80,
  music: 55,
};

const $ = (sel) => (typeof sel === 'string' && sel.startsWith('#')
  ? document.getElementById(sel.slice(1))
  : document.querySelector(sel));

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function softwareRenderer() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be unavailable in private mode */
  }
}

/* ============================================================
   Training wisp — a small Stage 1 attack target. These are not
   enemies; they simply prove the combo, hit sparks and lock-on.
   ============================================================ */
class TrainingWisp {
  constructor(scene, position, { color = 0xffd98a, phase = 0 } = {}) {
    this.scene = scene;
    this.home = position.clone();
    this.position = position.clone();
    this.color = color;
    this.phase = phase;
    this.alive = true;
    this.cooldown = 0;
    this.time = phase;
    this.radius = 0.55;

    const group = new THREE.Group();
    group.position.copy(position);
    this.group = group;

    this.coreMat = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color).multiplyScalar(0.55),
      emissiveIntensity: 1.6,
      metalness: 0.2,
      roughness: 0.16,
      transparent: true,
      opacity: 0.94,
    });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), this.coreMat);
    this.core.castShadow = true;
    group.add(this.core);

    this.ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.022, 4, 32), this.ringMat);
    this.ring.rotation.x = Math.PI / 2.4;
    group.add(this.ring);

    this.glow = makeGlowSprite({ color, size: 2.2, opacity: 0.4, texture: WISP_GLOW });
    group.add(this.glow);

    this.light = new THREE.PointLight(color, 0.9, 8, 2);
    group.add(this.light);

    scene.add(group);
  }

  get center() {
    return this.position.clone().add(new THREE.Vector3(0, 0.95, 0));
  }

  tryHit(playerPos, facing) {
    if (!this.alive) return false;
    const dx = this.position.x - playerPos.x;
    const dz = this.position.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2.7 || Math.abs(this.position.y - playerPos.y) > 2.2) return false;
    if (dist > 0.001) {
      const dot = (dx / dist) * Math.sin(facing) + (dz / dist) * Math.cos(facing);
      if (dot < 0.05) return false;
    }
    return true;
  }

  pop() {
    if (!this.alive) return;
    this.alive = false;
    this.cooldown = 4.5;
    this.group.visible = false;
  }

  update(dt) {
    this.time += dt;
    if (!this.alive) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.alive = true;
        this.group.visible = true;
        this.group.scale.setScalar(0.01);
      }
      return;
    }
    const targetScale = this.group.scale.x < 1 ? Math.min(1, this.group.scale.x + dt * 4.5) : 1;
    this.group.scale.setScalar(targetScale);
    this.position.y = this.home.y + Math.sin(this.time * 2.0 + this.phase) * 0.18;
    this.group.position.copy(this.position);
    this.core.rotation.y += dt * 1.4;
    this.core.rotation.z = Math.sin(this.time * 0.9) * 0.22;
    this.ring.rotation.z += dt * 0.8;
    const pulse = 0.82 + Math.sin(this.time * 3.2) * 0.18;
    this.glow.material.opacity = 0.36 * pulse;
    this.light.intensity = 0.9 * pulse;
    this.ringMat.opacity = 0.35 * pulse;
  }
}

/* ============================================================
   Game
   ============================================================ */
class Game {
  constructor() {
    this.state = 'boot';
    this.prefs = { ...DEFAULTS, ...(loadJSON(PREFS_KEY) || {}) };
    if (!loadJSON(PREFS_KEY) && softwareRenderer()) this.prefs.quality = 'medium';

    this.elapsed = 0;
    this.playTime = 0;
    this.accumulator = 0;
    this.menuTime = 0;
    this.frames = 0;
    this.fps = 60;
    this.fpsClock = 0;

    this.camYaw = 0;
    this.camPitch = 0.21;
    this.camDistance = 7.0;
    this.baseFov = 58;

    this.respawn = new THREE.Vector3(0, 0.08, 9);
    this.lastHp = -1;
    this.gemCount = 0;
    this.lockTarget = null;
    this.targets = [];
    this.combo = 0;
    this.comboTimer = 0;
    this.returnScreen = 'menu';
    this.screenReturn = null;
    this.hintTimer = 0;
    this.lastInteract = false;
    this.saveDirty = false;
    this.saveClock = 0;

    this.loop = this.loop.bind(this);
  }

  /* ----------------------------------------------------------
     Boot
     ---------------------------------------------------------- */
  $(sel) { return $(sel); }

  async boot() {
    try {
      this.progress(12, 'Lighting the renderer…');
      await nextFrame();
      await nextFrame();

      this.env = new Environment($('#game'), {
        quality: this.prefs.quality,
        renderScale: this.prefs.renderScale / 100,
      });
      this.camera = this.env.camera;
      this.scene = this.env.scene;
      this.env.setZone('meadow', true);
      this.applyPrefsToEnvironment();

      this.progress(42, 'Growing the Sunlit Meadow…');
      await nextFrame();

      this.audio = new AudioManager({
        master: this.prefs.master / 100,
        music: this.prefs.music / 100,
        sfx: 0.9,
      });
      this.effects = new Effects(this.scene, this.camera);
      this.effects.setZone('meadow');
      this.world = new World(this.scene, this.env, { zones: WORLD_ZONES });

      this.progress(74, 'Waking the shards…');
      await nextFrame();

      this.player = new Player(this.scene, this.world, this.effects, this.makeCallbacks());
      this.createTrainingWisps();

      // Gentle camera-side fill so the character reads against the sunlit grass.
      this.playerLight = new THREE.PointLight(0xfff0d8, 7, 8.5, 2);
      this.playerLight.position.set(0, 3, 12);
      this.scene.add(this.playerLight);

      this.input = new Input(this.env.renderer.domElement);
      this.input.lookSensitivity = this.prefs.sens / 100;
      this.input.invertY = !!this.prefs.invert;

      this.bindUI();
      this.bindResize();
      this.buildHearts();

      const saved = loadJSON(SAVE_KEY);
      if (saved && saved.v === SAVE_VERSION) this.applySave(saved);

      this.$('#gem-total').textContent = `/ ${this.world.gems.length}`;
      this.updateGemHud();

      this.progress(93, 'Tuning the light…');
      await nextFrame();

      // Warm the pipeline with one hidden render so shaders compile.
      this.updateCamera(1 / 60, true);
      this.env.render(1 / 60);

      this.progress(100, 'Ready');
      await nextFrame();

      this.state = 'menu';
      this.updateMenuCamera(0, true);
      this.updateHud();
      requestAnimationFrame(this.loop);

      setTimeout(() => {
        this.$('#loading').classList.add('hidden');
        this.openMenu();
      }, 420);
    } catch (err) {
      console.error(err);
      const tip = this.$('#load-tip');
      if (tip) {
        tip.innerHTML = `<b style="color:#ff9aa8">The Aether failed to wake.</b><br><span style="font-size:11px;opacity:.8">${String(err?.message || err)}</span>`;
      }
      this.$('#load-fill').style.width = '100%';
      this.$('#load-fill').style.background = '#ff6f91';
    }
  }

  progress(pct, tip) {
    const fill = this.$('#load-fill');
    if (fill) fill.style.width = `${pct}%`;
    if (tip && this.$('#load-tip')) this.$('#load-tip').textContent = tip;
  }

  makeCallbacks() {
    return {
      onJump: () => this.sfx('jump'),
      onDoubleJump: () => this.sfx('doubleJump'),
      onLand: (impact) => {
        this.sfx('land');
        this.effects.addShake(0.05 + impact * 0.12, 0.18);
      },
      onDash: () => {
        this.sfx('dash');
        this.effects.addShake(0.08, 0.16);
      },
      onAttackStart: (stage) => this.sfx(stage === 0 ? 'attack' : stage === 1 ? 'attack2' : 'attack3'),
      onAttackHit: (stage, position, facing) => this.registerAttack(stage, position, facing),
      onStep: () => this.sfx('step', 0.7),
      onWater: () => this.sfx('splash'),
      onDamage: () => {
        this.sfx('hurt');
        this.flash('#damage-vignette');
        this.effects.addShake(0.3, 0.32);
        this.updateHearts(true);
      },
      onHeal: () => {
        this.flash('#heal-vignette');
        this.updateHearts(true);
      },
      onDeath: () => this.onDeath(),
      onLedge: () => this.sfx('step'),
    };
  }

  createTrainingWisps() {
    const spots = [
      { p: new THREE.Vector3(7.5, 1.1, 1.5), color: 0xffd98a },
      { p: new THREE.Vector3(-7, 1.25, -5.5), color: 0x8ff7ec },
      { p: new THREE.Vector3(13, 1.2, -15), color: 0xffb3c8 },
    ];
    spots.forEach((spot, i) => {
      this.targets.push(new TrainingWisp(this.scene, spot.p, { color: spot.color, phase: i * 2.1 }));
    });
  }

  /* ----------------------------------------------------------
     Resize
     ---------------------------------------------------------- */
  bindResize() {
    const onResize = () => {
      if (!this.effects || !this.env) return;
      const pr = this.env.renderer.getPixelRatio();
      this.effects.updatePointScale(Math.max(320, window.innerHeight * pr * 0.58));
    };
    window.addEventListener('resize', onResize);
    onResize();
  }

  /* ----------------------------------------------------------
     UI
     ---------------------------------------------------------- */
  bindUI() {
    const click = (id, fn) => {
      const el = this.$(id);
      if (el) el.addEventListener('click', () => {
        this.audio?.init();
        this.sfx('ui');
        fn();
      });
    };

    click('#btn-new', () => this.startGame(true));
    click('#btn-continue', () => this.startGame(false));

    click('#btn-settings-menu', () => this.openScreen('settings', 'menu'));
    click('#btn-controls-menu', () => this.openScreen('controls', 'menu'));
    click('#btn-settings-pause', () => this.openScreen('settings', 'pause'));
    click('#btn-controls-pause', () => this.openScreen('controls', 'pause'));
    click('#btn-resume', () => this.resume());
    click('#btn-pause-close', () => this.resume());
    click('#btn-save-quit', () => this.quitToMenu());
    click('#btn-respawn', () => this.respawnPlayer());
    click('#btn-go-menu', () => this.quitToMenu(true));
    click('#btn-hud-pause', () => this.pause());
    click('#btn-reset-save', () => this.resetSave());

    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio?.init();
        this.sfx('ui');
        this.closeScreen(btn.dataset.close);
      });
    });

    // Settings
    const qualitySeg = $('#quality-seg');
    if (qualitySeg) {
      qualitySeg.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-quality]');
        if (!btn) return;
        this.audio?.init();
        this.sfx('ui');
        this.prefs.quality = btn.dataset.quality;
        this.env.applyQuality(this.prefs.quality, { renderScale: this.prefs.renderScale / 100 });
        this.applyPrefsToEnvironment();
        this.syncSettingsUI();
        this.savePrefs();
        this.toast(`Graphics · ${btn.textContent}`, '✦');
      });
    }

    const scale = $('#render-scale');
    if (scale) scale.addEventListener('input', () => {
      this.prefs.renderScale = Number(scale.value);
      this.env.setRenderScale(this.prefs.renderScale / 100);
      this.syncSettingsUI();
      this.savePrefs();
    });

    const bindToggle = (id, key, onChange) => {
      const el = this.$(id);
      if (!el) return;
      el.addEventListener('click', () => {
        this.audio?.init();
        this.sfx('ui');
        this.prefs[key] = !this.prefs[key];
        this.applyPrefsToEnvironment();
        this.syncSettingsUI();
        this.savePrefs();
        onChange?.(this.prefs[key]);
      });
    };
    bindToggle('#toggle-post', 'post');
    bindToggle('#toggle-shadows', 'shadows');

    const sens = $('#look-sens');
    if (sens) sens.addEventListener('input', () => {
      this.prefs.sens = Number(sens.value);
      if (this.input) this.input.lookSensitivity = this.prefs.sens / 100;
      this.syncSettingsUI();
      this.savePrefs();
    });

    const invert = $('#toggle-invert');
    if (invert) invert.addEventListener('click', () => {
      this.audio?.init();
      this.sfx('ui');
      this.prefs.invert = !this.prefs.invert;
      if (this.input) this.input.invertY = this.prefs.invert;
      this.syncSettingsUI();
      this.savePrefs();
    });

    const vol = (id, key, label) => {
      const el = this.$(id);
      if (!el) return;
      el.addEventListener('input', () => {
        this.prefs[key] = Number(el.value);
        this.audio?.setVolumes({ [key]: this.prefs[key] / 100 });
        this.syncSettingsUI();
        this.savePrefs();
      });
      if (this.$(label)) this.$(label).dataset.value = key;
    };
    vol('#master-vol', 'master', '#master-value');
    vol('#music-vol', 'music', '#music-value');

    this.syncSettingsUI();

    // Escape / pointer-lock housekeeping.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing') {
        e.preventDefault();
        this.pause();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing') {
        this.hintTimer = Math.max(this.hintTimer, 2.5);
      }
    });
    window.addEventListener('beforeunload', () => this.saveProgress());
  }

  syncSettingsUI() {
    const setText = (id, text) => { const el = this.$(id); if (el) el.textContent = text; };
    const seg = $('#quality-seg');
    if (seg) seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.quality === this.prefs.quality));
    setText('#quality-value', this.prefs.quality.toUpperCase());
    setText('#quality-chip', this.prefs.quality.toUpperCase());

    const scale = $('#render-scale');
    if (scale) scale.value = String(this.prefs.renderScale);
    setText('#scale-value', `${this.prefs.renderScale}%`);

    const sens = $('#look-sens');
    if (sens) sens.value = String(this.prefs.sens);
    setText('#sens-value', `${(this.prefs.sens / 100).toFixed(1)}×`);

    const master = $('#master-vol');
    if (master) master.value = String(this.prefs.master);
    setText('#master-value', `${this.prefs.master}%`);

    const music = $('#music-vol');
    if (music) music.value = String(this.prefs.music);
    setText('#music-value', `${this.prefs.music}%`);

    $('#toggle-post')?.classList.toggle('on', !!this.prefs.post);
    $('#toggle-shadows')?.classList.toggle('on', !!this.prefs.shadows);
    $('#toggle-invert')?.classList.toggle('on', !!this.prefs.invert);
  }

  applyPrefsToEnvironment() {
    if (!this.env) return;
    const preset = QUALITY[this.prefs.quality] || QUALITY.high;
    const post = !!this.prefs.post && !!preset.bloom;
    const shadows = !!this.prefs.shadows && !!preset.shadow;
    if (this.env.bloomPass) this.env.bloomPass.enabled = post;
    this.env.setGodRays?.(post);
    this.env.renderer.shadowMap.enabled = shadows;
    this.env.sun.castShadow = shadows;
    if (this.env.gradePass) this.env.gradePass.uniforms.uSaturation.value = 1.13;
    this.scene?.traverse((o) => {
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m) m.needsUpdate = true; });
      }
    });
  }

  savePrefs() {
    saveJSON(PREFS_KEY, this.prefs);
  }

  /* ----------------------------------------------------------
     Screen flow
     ---------------------------------------------------------- */
  showScreen(id) {
    const el = this.$(id.startsWith('#') || id.startsWith('.') ? id : `#${id}`);
    if (el) el.classList.add('visible');
  }

  hideScreen(id) {
    const el = this.$(id.startsWith('#') || id.startsWith('.') ? id : `#${id}`);
    if (el) el.classList.remove('visible');
  }

  openMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    this.hideScreen('pause');
    this.hideScreen('gameover');
    this.hideScreen('settings');
    this.hideScreen('controls');
    this.hideScreen('victory');
    this.$('#hud').classList.remove('visible');
    this.$('#touch').style.display = '';
    this.showScreen('menu');
    this.menuTime = 0;
    this.updateMenuCamera(0, true);
    this.refreshContinueLabel();
  }

  refreshContinueLabel() {
    const saved = loadJSON(SAVE_KEY);
    const btn = $('#btn-continue');
    if (!btn) return;
    const label = btn.querySelector('.btn-label span') || btn.querySelector('.btn-label');
    if (!label) return;
    label.textContent = saved ? 'Continue Journey' : 'Enter the Meadow';
    btn.style.opacity = '';
  }

  openScreen(id, from) {
    this.screenReturn = from;
    if (from === 'menu') this.hideScreen('menu');
    if (from === 'pause') this.hideScreen('pause');
    this.showScreen(id);
    this.syncSettingsUI();
  }

  closeScreen(id) {
    this.hideScreen(id);
    if (this.screenReturn === 'pause' && this.state === 'paused') this.showScreen('pause');
    else if (this.screenReturn === 'menu' || this.state === 'menu') this.showScreen('menu');
  }

  startGame(fresh) {
    this.audio?.init();
    if (fresh) {
      this.clearSave();
      this.resetWorldProgress();
    } else {
      const saved = loadJSON(SAVE_KEY);
      if (saved && saved.v === SAVE_VERSION) this.applySave(saved);
    }

    this.hideScreen('menu');
    this.hideScreen('settings');
    this.hideScreen('controls');
    this.hideScreen('pause');
    this.hideScreen('gameover');
    this.$('#hud').classList.add('visible');
    this.$('#lockhint').style.display = '';

    this.state = 'playing';
    this.input.enabled = true;
    this.input.pressed.clear();
    this.input.attackHeld = false;
    this.playTime = savedTimeOr(this, 0);
    this.player.reset(this.respawn.clone(), Math.PI);
    this.player.time = 0;

    this.camYaw = 0;
    this.camPitch = 0.21;
    this.camDistance = 7.0;
    this.updateCamera(1 / 60, true);

    this.showZoneCard();
    this.updateGemHud();
    this.updateHearts(true);
    this.toast('Stage 1 · Sunlit Meadow', '✦');
    this.sfx('checkpoint');

    if (!this.input.isTouchDevice) this.input.requestLock();
    this.hintTimer = 8;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.pressed.clear();
    this.input.exitLock();
    this.hideScreen('settings');
    this.hideScreen('controls');
    this.showScreen('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.hideScreen('pause');
    this.hideScreen('settings');
    this.hideScreen('controls');
    this.state = 'playing';
    this.input.enabled = true;
    this.input.pressed.clear();
    this.hintTimer = 0;
    if (!this.input.isTouchDevice) this.input.requestLock();
  }

  quitToMenu(fromDeath = false) {
    this.saveProgress();
    this.input?.exitLock();
    this.hideScreen('pause');
    this.hideScreen('settings');
    this.hideScreen('controls');
    if (!fromDeath) this.hideScreen('gameover');
    this.$('#hud').classList.remove('visible');
    this.player?.reset(this.respawn.clone(), Math.PI);
    this.state = 'menu';
    this.openMenu();
  }

  onDeath() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.input.enabled = false;
    this.input.exitLock();
    this.sfx('death');
    this.effects.addShake(0.4, 0.5);
    setTimeout(() => {
      if (this.state !== 'dead') return;
      this.$('#go-shards').textContent = String(this.gemCount);
      this.$('#go-zone').textContent = 'Sunlit Meadow';
      this.$('#go-time').textContent = formatTime(this.playTime);
      this.showScreen('gameover');
      this.$('#hud').classList.remove('visible');
    }, 850);
  }

  respawnPlayer() {
    this.hideScreen('gameover');
    this.$('#hud').classList.add('visible');
    this.player.reset(this.respawn.clone(), Math.PI);
    this.camYaw = 0;
    this.camPitch = 0.21;
    this.updateCamera(1 / 60, true);
    this.updateHearts(true);
    this.state = 'playing';
    this.input.enabled = true;
    this.input.pressed.clear();
    this.fadeRespawn();
    if (!this.input.isTouchDevice) this.input.requestLock();
  }

  fadeRespawn() {
    const fade = $('#fade');
    fade.classList.add('black');
    setTimeout(() => fade.classList.remove('black'), 260);
  }

  /* ----------------------------------------------------------
     Progress / save
     ---------------------------------------------------------- */
  resetWorldProgress() {
    this.world.gems.forEach((g) => g.restore());
    this.world.checkpoints.forEach((c) => c.reset());
    this.gemCount = 0;
    this.respawn.set(0, 0.08, 9);
    this.player?.healFull();
    this.updateGemHud();
  }

  applySave(data) {
    if (!data) return;
    if (Array.isArray(data.gems)) {
      const ids = new Set(data.gems);
      this.world.gems.forEach((g) => { if (ids.has(g.id)) g.collect(); });
    }
    if (Array.isArray(data.checkpoints)) {
      const ids = new Set(data.checkpoints);
      this.world.checkpoints.forEach((c) => { if (ids.has(c.id)) c.activate(); });
    }
    if (data.respawn && Number.isFinite(data.respawn.x)) {
      this.respawn.set(data.respawn.x, data.respawn.y, data.respawn.z);
    }
    this.gemCount = this.world.gems.filter((g) => g.collected).length;
    this.savedTime = Number.isFinite(data.time) ? data.time : 0;
    if (this.player) this.player.position.copy(this.respawn);
    this.updateGemHud();
  }

  saveProgress() {
    if (!this.world) return;
    const data = {
      v: SAVE_VERSION,
      gems: this.world.gems.filter((g) => g.collected).map((g) => g.id),
      checkpoints: this.world.checkpoints.filter((c) => c.activated).map((c) => c.id),
      respawn: { x: this.respawn.x, y: this.respawn.y, z: this.respawn.z },
      time: this.playTime,
      savedAt: Date.now(),
    };
    saveJSON(SAVE_KEY, data);
    if (this.prefs) this.savePrefs();
  }

  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    this.savedTime = 0;
  }

  resetSave() {
    this.clearSave();
    this.resetWorldProgress();
    this.player?.reset(this.respawn.clone(), Math.PI);
    this.updateHearts(true);
    this.refreshContinueLabel();
    this.toast('Save data reset', '↺');
  }

  /* ----------------------------------------------------------
     Gameplay helpers
     ---------------------------------------------------------- */
  sfx(name, gain = 1) {
    if (!this.audio?.ready) return;
    this.audio.sfx(name, gain === 1 ? {} : { gain });
  }

  toast(text, icon = '✦') {
    const host = $('#toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="t-ico">${icon}</span><span>${text}</span>`;
    host.appendChild(el);
    el.addEventListener('animationend', (e) => {
      if (e.animationName === 'toastOut') el.remove();
    });
    setTimeout(() => el.remove(), 3800);
  }

  showZoneCard() {
    const card = $('#zonecard');
    if (!card) return;
    $('#zc-name').textContent = 'Sunlit Meadow';
    $('#zc-sub').textContent = 'Where the world wakes';
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
  }

  flash(sel) {
    const el = this.$(sel);
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  buildHearts() {
    const host = $('#hearts');
    if (!host) return;
    host.innerHTML = '';
    const path = 'M12 21s-7.4-4.7-9.6-9C.7 8.3 2.2 4.6 5.6 3.8 8 3.2 10.4 4.5 12 6.5c1.6-2 4-3.3 6.4-2.7 3.4.8 4.9 4.5 3.2 8.2C19.4 16.3 12 21 12 21z';
    for (let i = 0; i < this.player.maxHp; i++) {
      const h = document.createElement('span');
      h.className = 'heart full';
      h.innerHTML = `<svg viewBox="0 0 24 24"><path d="${path}"/></svg>`;
      host.appendChild(h);
    }
  }

  updateHearts(animate = false) {
    if (!this.player) return;
    const host = $('#hearts');
    if (!host) return;
    const children = Array.from(host.children);
    children.forEach((el, i) => {
      const full = i < this.player.hp;
      const was = el.classList.contains('full');
      el.classList.toggle('full', full);
      el.classList.toggle('empty', !full);
      if (animate && was !== full) {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
    });
  }

  updateGemHud() {
    const count = this.world.gems.filter((g) => g.collected).length;
    this.gemCount = count;
    const el = $('#gem-count');
    if (el) el.textContent = String(count);
    const total = $('#gem-total');
    if (total) total.textContent = `/ ${this.world.gems.length}`;
    const obj = $('#objective-text');
    if (obj) obj.textContent = count >= this.world.gems.length
      ? 'Stage 1 complete · awaiting Stage 2'
      : 'Explore the meadow · gather dawn shards';
  }

  registerAttack(stage, position, facing) {
    let hit = false;
    for (const target of this.targets) {
      if (!target.tryHit(position, facing)) continue;
      target.pop();
      hit = true;
      this.effects.hitSpark(target.center, target.color, 26);
      this.effects.burst(target.center, {
        count: 18, speed: 4.2, size: 0.18, life: 0.55, gravity: -2, drag: 2.4,
        colors: [target.color, 0xffffff, 0xfff1c2],
      });
      this.effects.addShake(0.08, 0.16);
      this.sfx('enemyHit');
      this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
      this.comboTimer = 1.35;
      if (this.combo >= 2) {
        const pop = $('#combo-pop');
        if (pop) {
          pop.textContent = `x${Math.min(this.combo, 9)}`;
          pop.classList.add('show');
        }
      }
      if (this.lockTarget === target) this.lockTarget = null;
    }
    if (hit) {
      this.hudKick = 0.12;
    } else {
      this.sfx('hit', 0.4);
    }
    if (this.lockTarget && !this.lockTarget.alive) this.lockTarget = null;
    if (this.comboTimer <= 0 && !hit) this.combo = 0;
  }

  findLockTarget() {
    let best = null;
    let bestDist = 20;
    const origin = this.player.position;
    for (const target of this.targets) {
      if (!target.alive) continue;
      const d = origin.distanceTo(target.position);
      if (d < bestDist) { best = target; bestDist = d; }
    }
    return best;
  }

  /* ----------------------------------------------------------
     Camera
     ---------------------------------------------------------- */
  clipCamera(focus, desired) {
    const dir = desired.clone().sub(focus);
    const len = dir.length();
    if (len < 0.001) return desired;
    dir.divideScalar(len);
    const ray = new THREE.Ray(focus, dir);
    const hit = new THREE.Vector3();
    let nearest = len;
    for (const collider of this.world.colliders) {
      if (!collider.active || !collider.box) continue;
      if (collider.box.containsPoint(focus)) continue;
      if (!ray.intersectBox(collider.box, hit)) continue;
      const d = hit.distanceTo(focus);
      if (d > 0.25 && d < nearest) nearest = d;
    }
    if (nearest < len - 0.05) {
      desired.copy(focus).addScaledVector(dir, Math.max(1.1, nearest - 0.3));
    }
    return desired;
  }

  updateMenuCamera(dt, snap = false) {
    this.menuTime += dt;
    const t = this.menuTime;
    const focus = new THREE.Vector3(0, 2.35, 6.8);
    const yaw = 0.45 + t * 0.07;
    const pitch = 0.16 + Math.sin(t * 0.11) * 0.025;
    const dist = 10.5;
    const desired = new THREE.Vector3(
      focus.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      focus.y + Math.sin(pitch) * dist,
      focus.z + Math.cos(yaw) * Math.cos(pitch) * dist
    );
    if (snap) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 1 - Math.exp(-2.4 * dt));
    this.camera.lookAt(focus);
    this.camera.fov = damp(this.camera.fov, 52, 1.8, dt);
    this.camera.updateProjectionMatrix();
  }

  updateCamera(dt, snap = false) {
    const focus = this.player.center;
    focus.y += 0.55;

    const off = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch)
    );
    const desired = focus.clone().addScaledVector(off, this.camDistance);
    this.clipCamera(focus, desired);

    if (snap) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 1 - Math.exp(-11 * dt));

    const shake = this.effects.getShakeOffset();
    const look = focus.clone().addScaledVector(shake, 0.9);
    this.camera.lookAt(look);

    if (this.playerLight) {
      const toCam = this.camera.position.clone().sub(focus).normalize();
      this.playerLight.position.copy(focus).addScaledVector(toCam, 2.3);
      this.playerLight.position.y += 0.7;
    }

    const speedRatio = clamp(this.player.speed / 8.3, 0, 1);
    const targetFov = this.baseFov + speedRatio * 3.5 + (this.player.dashTimer > 0 ? 3.5 : 0);
    const nextFov = damp(this.camera.fov, targetFov, 6, dt);
    if (Math.abs(nextFov - this.camera.fov) > 0.001) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
  }

  /* ----------------------------------------------------------
     Main loop
     ---------------------------------------------------------- */
  loop(now) {
    requestAnimationFrame(this.loop);
    if (this.lastNow === undefined) this.lastNow = now;
    const dt = Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.elapsed += dt;

    // FPS readout (used only by the HUD quality chip tooltip)
    this.frames++;
    this.fpsClock += dt;
    if (this.fpsClock > 1) {
      this.fps = this.frames / this.fpsClock;
      this.frames = 0;
      this.fpsClock = 0;
    }

    if (this.state === 'playing' || this.state === 'dead') {
      this.readLook();

      if (this.state === 'playing') {
        this.accumulator = Math.min(this.accumulator + dt, STEP * 6);
        while (this.accumulator >= STEP) {
          this.world.update(STEP, this.elapsed, this.player.position);
          this.player.update(STEP, this.input, this.camYaw, this.lockTarget?.position || null);
          this.accumulator -= STEP;
          this.playTime += STEP;
        }
        if (this.comboTimer > 0) {
          this.comboTimer -= dt;
          if (this.comboTimer <= 0) {
            this.combo = 0;
            $('#combo-pop')?.classList.remove('show');
          }
        }
        this.pollActions(dt);
      }

      for (const target of this.targets) target.update(dt);
      this.world.update(dt, this.elapsed, this.player.position);
      this.effects.update(dt, this.player.position);
      this.updateCamera(dt);
      this.player.updateVisual(dt, this.camera);
      this.env.update(dt, this.player.center);
      this.updateHud();
    } else if (this.state === 'menu') {
      for (const target of this.targets) target.update(dt);
      this.world.update(dt, this.elapsed, this.player.position);
      this.effects.update(dt, this.player.position);
      this.player.updateVisual(dt, this.camera);
      this.updateMenuCamera(dt);
      this.env.update(dt, new THREE.Vector3(0, 2, 7));
      this.updateHud();
    } else if (this.state === 'paused') {
      this.player.updateVisual(dt, this.camera);
      this.env.update(dt, this.player.center);
      this.updateHud();
    } else {
      // boot / loading: still resolve the initial camera
      if (this.player) {
        this.player.updateVisual(dt, this.camera);
        this.updateMenuCamera(dt);
      }
    }

    // Global hotkeys that work even when paused / on menus.
    if (this.input) {
      if (this.input.consumePressed('mute')) this.toggleMute();
      if (this.state === 'playing' && this.input.consumePressed('pause')) this.pause();
    }

    this.saveClock += dt;
    if (this.state === 'playing' && this.saveClock > 10) {
      this.saveClock = 0;
      if (this.saveDirty) {
        this.saveDirty = false;
        this.saveProgress();
      }
    }

    this.env.render(dt);
  }

  readLook() {
    if (!this.input) return;
    const look = this.input.consumeLook();
    if (look.x || look.y) {
      this.camYaw -= look.x;
      this.camPitch = clamp(this.camPitch + look.y, -0.28, 1.02);
    }
    const zoom = this.input.consumeZoom();
    if (zoom) this.camDistance = clamp(this.camDistance + zoom * 4.5, 3.6, 12.5);
  }

  pollActions(dt) {
    const input = this.input;

    if (input.consumePressed('lock')) {
      if (this.lockTarget) {
        this.lockTarget = null;
        this.sfx('ui');
      } else {
        this.lockTarget = this.findLockTarget();
        if (this.lockTarget) {
          this.sfx('ui');
          this.toast('Locked · training wisp', '◎');
        } else {
          this.toast('Nothing to lock onto', '◎');
        }
      }
    }
    if (this.lockTarget && !this.lockTarget.alive) this.lockTarget = null;

    // Shrines
    for (const cp of this.world.checkpoints) {
      if (cp.activated) continue;
      const dx = cp.position.x - this.player.position.x;
      const dz = cp.position.z - this.player.position.z;
      if (dx * dx + dz * dz < 2.7 * 2.7 && Math.abs(cp.position.y - this.player.position.y) < 2.5) {
        cp.activate();
        this.respawn.copy(cp.position).add(new THREE.Vector3(0, 0.08, 1.8));
        this.player.addHp(2);
        this.updateHearts(true);
        this.sfx('checkpoint');
        this.effects.shockwave(cp.position.clone(), { color: 0xffd98a, radius: 4, duration: 0.8, y: cp.position.y + 0.4 });
        this.toast(`${cp.name} · checkpoint restored`, '◈');
        this.saveProgress();
      }
    }

    // Shards
    for (const gem of this.world.gems) {
      if (gem.collected) continue;
      const dx = gem.position.x - this.player.position.x;
      const dy = gem.position.y - (this.player.position.y + 1.0);
      const dz = gem.position.z - this.player.position.z;
      if (dx * dx + dy * dy + dz * dz < 1.55 * 1.55) {
        gem.collect();
        this.gemCount++;
        this.updateGemHud();
        this.effects.collect(gem.position, gem.color);
        this.sfx('collect');
        this.toast(`Dawn shard · ${this.gemCount}/${this.world.gems.length}`, '◇');
        this.saveProgress();
        if (this.gemCount >= this.world.gems.length) {
          setTimeout(() => {
            this.toast('All shards gathered · Stage 1 complete', '✦');
            this.sfx('victory');
          }, 500);
        }
      }
    }

    // Sealed gate interaction
    const gate = this.world.gates.find((g) => g.zone === 'meadow');
    let nearGate = false;
    if (gate) {
      const dx = gate.group.position.x - this.player.position.x;
      const dz = gate.group.position.z - this.player.position.z;
      nearGate = Math.hypot(dx, dz) < 7.5 && Math.abs(this.player.position.y - gate.group.position.y) < 5;
    }
    const prompt = $('#interact');
    if (prompt && nearGate !== this.lastInteract) {
      this.lastInteract = nearGate;
      if (nearGate) {
        prompt.innerHTML = '<kbd>E</kbd> Inspect the sealed gate';
        prompt.classList.add('visible');
      } else {
        prompt.classList.remove('visible');
      }
    }
    if (nearGate && input.consumePressed('interact')) {
      this.sfx('ui');
      this.toast('The Ancient Ruins open in Stage 2', '⌛');
    }

    // Release lock if the target drifts too far away.
    if (this.lockTarget) {
      if (this.player.position.distanceTo(this.lockTarget.position) > 24) this.lockTarget = null;
    }

    if (this.hintTimer > 0) this.hintTimer -= dt;
  }

  toggleMute() {
    if (!this.audio) return;
    this.audio.init();
    const muted = this.audio.toggleMute();
    this.toast(muted ? 'Sound muted' : 'Sound on', muted ? '×' : '♪');
  }

  /* ----------------------------------------------------------
     HUD
     ---------------------------------------------------------- */
  updateHud() {
    if (!this.player || !this.world) return;
    if (this.player.hp !== this.lastHp) {
      this.lastHp = this.player.hp;
      this.updateHearts(true);
    }

    const dash = $('#dash-ring');
    if (dash) {
      const ratio = clamp(this.player.dashCooldown / 0.72, 0, 1);
      dash.style.strokeDashoffset = String(213.6 * ratio);
      const ready = $('#dash-ready');
      if (ready) ready.textContent = ratio <= 0.01 ? 'READY' : `${Math.ceil(this.player.dashCooldown * 10) / 10}s`;
    }

    // Compass to nearest uncollected shard (or current lock target)
    const compass = $('#compass');
    if (compass) {
      let target = null;
      let best = Infinity;
      for (const gem of this.world.gems) {
        if (gem.collected) continue;
        const d = this.player.position.distanceTo(gem.position);
        if (d < best) { best = d; target = gem; }
      }
      if (this.lockTarget) { target = this.lockTarget; best = this.player.position.distanceTo(this.lockTarget.position); }
      compass.classList.toggle('hidden', !target);
      if (target) {
        const dx = target.position.x - this.player.position.x;
        const dz = target.position.z - this.player.position.z;
        const targetAngle = Math.atan2(dx, dz);
        const cameraAngle = this.camYaw + Math.PI;
        let rel = targetAngle - cameraAngle;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        const arrow = $('#compass-arrow');
        if (arrow) arrow.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
        const dist = $('#compass-dist');
        if (dist) dist.textContent = `${Math.round(best)} m`;
      }
    }

    // Lock-on reticle
    const reticle = $('#reticle');
    if (reticle) {
      if (this.lockTarget?.alive) {
        const p = this.lockTarget.center.clone().project(this.camera);
        if (p.z < 1) {
          reticle.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth}px`;
          reticle.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight}px`;
          reticle.classList.add('visible');
        } else {
          reticle.classList.remove('visible');
        }
      } else {
        reticle.classList.remove('visible');
      }
    }

    // Subtle input hint fades once the player has moved or the timer ends.
    const hint = $('#lockhint');
    if (hint) {
      const show = this.state === 'playing' && !this.input?.isTouchDevice && this.hintTimer > 0;
      hint.style.opacity = show ? '0.45' : '0';
    }
  }
}

function savedTimeOr(game, fallback) {
  return Number.isFinite(game.savedTime) ? game.savedTime : fallback;
}

/* ============================================================
   Boot
   ============================================================ */
const game = new Game();
window.__aether = game;
window.__THREE = THREE;
game.boot();
