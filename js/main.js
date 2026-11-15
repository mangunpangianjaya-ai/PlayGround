/* ============================================================
   Aetherbound — Shards of Dawn
   Entry point: renderer, four connected realms, third-person
   camera, fixed-step player, enemies, bosses, HUD, menus, audio
   and persistent progression.
   ============================================================ */
import * as THREE from 'three';
import { Environment, QUALITY } from './Environment.js';
import { Input } from './Input.js';
import { World, ZONES } from './World.js';
import { Effects } from './Effects.js';
import { Player } from './Player.js';
import { AudioManager } from './Audio.js';
import { EnemySystem, ProjectileSystem } from './Enemies.js';
import { createBoss, disposeBoss } from './Bosses.js';
import { clamp, damp, formatTime } from './Utils.js';

/* All four realms are live. The road between them is gated by
   each realm's warden. */
const WORLD_ZONES = ['meadow', 'ruins', 'crystal', 'sky'];
const ZONE_ORDER = WORLD_ZONES;

const STEP = 1 / 120;
const SAVE_KEY = 'aetherbound.stage1.save.v1';
const PREFS_KEY = 'aetherbound.prefs.v1';
const SAVE_VERSION = 2;

const ZONE_SPAWN = {
  meadow: new THREE.Vector3(0, 0.08, 9),
  ruins: new THREE.Vector3(0, 2.45, -66),
  crystal: new THREE.Vector3(0, -23.95, -153),
  sky: new THREE.Vector3(0, 44.08, -74),
};

const TRAVEL_SPAWN = {
  'meadow>ruins': new THREE.Vector3(0, 2.45, -66),
  'ruins>meadow': new THREE.Vector3(0, 0.08, -50),
  'ruins>crystal': new THREE.Vector3(0, -23.95, -153),
  'crystal>ruins': new THREE.Vector3(0, 2.45, -118),
  'crystal>sky': new THREE.Vector3(0, 44.08, -74),
  'sky>crystal': new THREE.Vector3(0, -23.95, -196),
};

const EMPTY_BOSSES = () => ({ meadow: false, ruins: false, crystal: false, sky: false });

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

function isValidSave(data) {
  return !!data && Number.isFinite(Number(data.v)) && Number(data.v) >= 1;
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

    this.zone = 'meadow';
    this.respawn = new THREE.Vector3(0, 0.08, 9);
    this.respawnZone = 'meadow';
    this.bossesDefeated = EMPTY_BOSSES();
    this.boss = null;
    this.transitioning = false;
    this.hitStop = 0;
    this.kills = 0;
    this.lastHp = -1;
    this.gemCount = 0;
    this.lockTarget = null;
    this.combo = 0;
    this.comboTimer = 0;
    this.returnScreen = 'menu';
    this.screenReturn = null;
    this.hintTimer = 0;
    this.lastInteract = null;
    this.lastPrompt = '';
    this.saveDirty = false;
    this.saveClock = 0;
    this.victoryDelay = 0;
    this.resetArmedAt = 0;
    this.newArmedAt = 0;

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
      this.projectiles = new ProjectileSystem(this.scene, this.effects, this);
      this.enemies = new EnemySystem(this);

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
      if (isValidSave(saved)) this.applySave(saved);

      this.$('#gem-total').textContent = `/ ${this.world.gems.length}`;
      this.updateGemHud();
      this.updateProgressionUi();

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

    click('#btn-new', () => this.requestNewJourney());
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
    click('#btn-reset-save', () => this.armResetSave());
    click('#btn-keep-playing', () => this.keepPlaying());
    click('#btn-victory-menu', () => this.quitToMenu(true));

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

    // Enter / Space begins a journey from the title screen.
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'menu') return;
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'Space') return;
      const visible = document.querySelector('.screen.visible');
      if (!visible || visible.id !== 'menu') return;
      if (e.target instanceof HTMLElement && e.target.closest('button')) return;
      e.preventDefault();
      if (e.repeat) return;
      this.audio?.init();
      this.startGame(!loadJSON(SAVE_KEY));
    });

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

  setTouchVisible(visible) {
    const el = this.$('#touch');
    if (el) el.style.display = visible ? '' : 'none';
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
    this.setTouchVisible(false);
    this.showScreen('menu');
    this.menuTime = 0;
    this.updateMenuCamera(0, true);
    this.cancelNewJourneyPrompt();
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
    this.cancelNewJourneyPrompt();
    if (fresh) {
      this.clearSave();
      this.resetWorldProgress();
      this.respawn.copy(ZONE_SPAWN.meadow);
      this.respawnZone = 'meadow';
    } else {
      const saved = loadJSON(SAVE_KEY);
      if (isValidSave(saved)) this.applySave(saved);
      else {
        this.resetWorldProgress();
        this.respawn.copy(ZONE_SPAWN.meadow);
        this.respawnZone = 'meadow';
      }
    }

    this.hideScreen('menu');
    this.hideScreen('settings');
    this.hideScreen('controls');
    this.hideScreen('pause');
    this.hideScreen('gameover');
    this.hideScreen('victory');
    this.$('#hud').classList.add('visible');
    this.setTouchVisible(true);
    this.$('#lockhint').style.display = '';

    this.state = 'playing';
    this.input.enabled = true;
    this.input.pressed.clear();
    this.input.attackHeld = false;
    this.transitioning = false;
    this.victoryDelay = 0;

    this.enterZone(this.zone, {
      spawn: this.respawn.clone(),
      announce: false,
      instant: true,
    });

    this.playTime = savedTimeOr(this, 0);
    this.showZoneCard(this.zone);
    this.updateGemHud();
    this.updateHearts(true);
    this.toast(`${ZONES[this.zone].name} · ${ZONES[this.zone].sub}`, '✦');
    this.sfx('checkpoint');

    if (!this.input.isTouchDevice) this.input.requestLock();
    this.hintTimer = 8;
  }

  /* ----------------------------------------------------------
     Realm entry & travel
     ---------------------------------------------------------- */
  enterZone(zone, { spawn = null, announce = false, instant = true } = {}) {
    if (!ZONES[zone]) zone = 'meadow';
    this.zone = zone;

    this.env.setZone(zone, instant);
    this.effects.setZone(zone);
    this.audio?.setZone(zone);

    this.jumpClearFx();
    this.enemies.load(zone);
    this.clearBoss();
    if (!this.bossesDefeated[zone]) this.spawnBossForZone(zone);

    const pos = (spawn || ZONE_SPAWN[zone]).clone();
    this.respawn.copy(pos);
    this.respawnZone = zone;
    this.player.reset(pos, Math.PI);
    this.player.time = 0;
    this.camYaw = 0;
    this.camPitch = 0.21;
    this.camDistance = 7.0;
    this.lockTarget = null;
    this.updateCamera(1 / 60, true);
    this.updateProgressionUi();
    this.updateGemHud();
    this.updateHearts(true);
    this.lastInteract = null;
    this.lastPrompt = '';

    if (announce) {
      this.showZoneCard(zone);
      this.toast(`${ZONES[zone].name} · ${ZONES[zone].sub}`, '✦');
      this.sfx('portal');
    }
  }

  jumpClearFx() {
    this.projectiles?.clear();
  }

  spawnBossForZone(zone) {
    const spec = this.world.bossSpawns[zone];
    if (!spec || this.bossesDefeated[zone]) return;
    this.boss = createBoss(this, spec);
  }

  clearBoss() {
    if (this.boss) {
      disposeBoss(this.boss);
      this.boss = null;
    }
    this.$('#bossbar')?.classList.remove('visible');
  }

  travelToZone(target) {
    if (this.transitioning || this.state !== 'playing') return;
    if (!ZONES[target]) return;
    const source = this.zone;
    this.transitioning = true;
    this.input.enabled = false;
    this.player.velocity.set(0, 0, 0);
    this.player.attacking = false;
    this.$('#bossbar').classList.remove('visible');
    this.$('#interact')?.classList.remove('visible');
    this.sfx('portal');

    const fade = $('#fade');
    fade.classList.add('black');
    setTimeout(() => {
      if (this.state !== 'playing') {
        this.transitioning = false;
        fade.classList.remove('black');
        return;
      }
      const key = `${source}>${target}`;
      const pos = (TRAVEL_SPAWN[key] || ZONE_SPAWN[target]).clone();
      this.enterZone(target, { spawn: pos, announce: true, instant: true });
      this.saveProgress();
      setTimeout(() => {
        fade.classList.remove('black');
        this.transitioning = false;
        this.input.enabled = this.state === 'playing';
        this.input.pressed.clear();
        if (this.state === 'playing' && !this.input.isTouchDevice) this.input.requestLock();
      }, 220);
    }, 320);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.pressed.clear();
    this.input.exitLock();
    this.audio?.setPaused(true);
    this.setTouchVisible(false);
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
    this.audio?.setPaused(false);
    this.setTouchVisible(true);
    this.hintTimer = 0;
    if (!this.input.isTouchDevice) this.input.requestLock();
  }

  quitToMenu(fromDeath = false) {
    this.saveProgress();
    this.input?.exitLock();
    this.hideScreen('pause');
    this.hideScreen('settings');
    this.hideScreen('controls');
    this.hideScreen('victory');
    this.hideScreen('gameover');
    this.$('#hud').classList.remove('visible');
    this.enemies?.clear();
    this.projectiles?.clear();
    this.clearBoss();
    this.player?.reset(this.respawn.clone(), Math.PI);
    this.state = 'menu';
    this.openMenu();
  }

  onDeath() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.input.enabled = false;
    this.input.exitLock();
    this.setTouchVisible(false);
    this.$('#bossbar').classList.remove('visible');
    this.sfx('death');
    this.effects.addShake(0.4, 0.5);
    setTimeout(() => {
      if (this.state !== 'dead') return;
      this.$('#go-shards').textContent = String(this.gemCount);
      this.$('#go-zone').textContent = ZONES[this.zone].name;
      this.$('#go-time').textContent = formatTime(this.playTime);
      this.showScreen('gameover');
      this.$('#hud').classList.remove('visible');
    }, 850);
  }

  respawnPlayer() {
    this.hideScreen('gameover');
    this.$('#hud').classList.add('visible');
    this.setTouchVisible(true);
    this.updateHearts(true);
    this.enemies?.load(this.zone);
    this.projectiles?.clear();
    this.clearBoss();
    if (!this.bossesDefeated[this.zone]) this.spawnBossForZone(this.zone);
    this.player.reset(this.respawn.clone(), Math.PI);
    this.camYaw = 0;
    this.camPitch = 0.21;
    this.updateCamera(1 / 60, true);
    this.updateProgressionUi();
    this.updateGemHud();
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

  keepPlaying() {
    this.hideScreen('victory');
    this.$('#hud').classList.add('visible');
    this.setTouchVisible(true);
    this.state = 'playing';
    this.input.enabled = true;
    this.input.pressed.clear();
    this.updateProgressionUi();
    if (!this.input.isTouchDevice) this.input.requestLock();
  }

  showVictory() {
    if (this.state !== 'playing') return;
    this.victoryDelay = 0;
    this.state = 'victory';
    this.input.enabled = false;
    this.input.exitLock();
    this.setTouchVisible(false);
    this.$('#bossbar').classList.remove('visible');
    this.$('#vi-shards').textContent = String(this.gemCount);
    this.$('#vi-bosses').textContent = `${ZONE_ORDER.filter((z) => this.bossesDefeated[z]).length}/4`;
    this.$('#vi-time').textContent = formatTime(this.playTime);
    const totalShards = this.world.gems.length;
    const sub = $('#vi-sub');
    if (sub) {
      sub.innerHTML = this.gemCount >= totalShards
        ? 'The Aether is whole again. Four realms breathe beneath a mended sky,<br />and every shard of dawn sings your name.'
        : `The wardens are fallen and the sun rises once more.<br />${totalShards - this.gemCount} dawn shards still wait in the wilds.`;
    }
    this.$('#hud').classList.remove('visible');
    this.$('#interact').classList.remove('visible');
    this.showScreen('victory');
    this.saveProgress();
  }

  /* ----------------------------------------------------------
     Progress / save
     ---------------------------------------------------------- */
  resetWorldProgress() {
    this.world.gems.forEach((g) => g.restore());
    this.world.checkpoints.forEach((c) => c.reset());
    this.world.setGateOpen('meadow', false, true);
    this.bossesDefeated = EMPTY_BOSSES();
    this.victoryDelay = 0;
    this.syncProgressionWorld(true);
    this.gemCount = 0;
    this.zone = 'meadow';
    this.respawn.copy(ZONE_SPAWN.meadow);
    this.respawnZone = 'meadow';
    this.clearBoss();
    this.enemies?.clear();
    this.projectiles?.clear();
    this.player?.healFull();
    this.updateGemHud();
    this.updateProgressionUi();
  }

  syncProgressionWorld(instant = true) {
    this.world.setGateOpen('meadow', !!this.bossesDefeated.meadow, instant);
    for (const portal of this.world.portals) {
      if (portal.id === 'portal_crystal') portal.setUnlocked(!!this.bossesDefeated.ruins, instant);
      if (portal.id === 'portal_sky') portal.setUnlocked(!!this.bossesDefeated.crystal, instant);
    }
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
    this.zone = ZONES[data.zone] ? data.zone : 'meadow';
    this.bossesDefeated = { ...EMPTY_BOSSES(), ...(data.bosses || {}) };
    this.syncProgressionWorld(true);

    if (data.respawn && Number.isFinite(data.respawn.x)) {
      this.respawn.set(data.respawn.x, data.respawn.y, data.respawn.z);
    } else {
      this.respawn.copy(ZONE_SPAWN[this.zone]);
    }
    this.respawnZone = ZONES[data.respawnZone] ? data.respawnZone : this.zone;
    this.gemCount = this.world.gems.filter((g) => g.collected).length;
    this.savedTime = Number.isFinite(data.time) ? data.time : 0;
    if (this.player) this.player.position.copy(this.respawn);
    this.updateGemHud();
    this.updateProgressionUi();
  }

  saveProgress() {
    if (!this.world) return;
    const data = {
      v: SAVE_VERSION,
      zone: this.zone,
      respawnZone: this.respawnZone,
      bosses: { ...this.bossesDefeated },
      gems: this.world.gems.filter((g) => g.collected).map((g) => g.id),
      checkpoints: this.world.checkpoints.filter((c) => c.activated).map((c) => c.id),
      respawn: { x: this.respawn.x, y: this.respawn.y, z: this.respawn.z },
      time: this.playTime,
      savedAt: Date.now(),
    };
    saveJSON(SAVE_KEY, data);
    this.saveDirty = false;
    if (this.prefs) this.savePrefs();
  }

  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    this.savedTime = 0;
  }

  requestNewJourney() {
    const btn = $('#btn-new');
    const label = btn?.querySelector('.btn-label span') || btn?.querySelector('.btn-label');
    if (!loadJSON(SAVE_KEY)) {
      this.startGame(true);
      return;
    }
    const now = performance.now();
    if (this.newArmedAt && now - this.newArmedAt < 6000) {
      clearTimeout(this._newTimer);
      this.newArmedAt = 0;
      btn?.classList.remove('danger');
      if (label) label.textContent = 'New Journey';
      this.startGame(true);
      return;
    }
    this.newArmedAt = now;
    btn?.classList.add('danger');
    if (label) label.textContent = 'Erase save & begin';
    this.toast('Starting over erases this journey. Click again to confirm.', '⚠');
    clearTimeout(this._newTimer);
    this._newTimer = setTimeout(() => this.cancelNewJourneyPrompt(), 6000);
  }

  cancelNewJourneyPrompt() {
    clearTimeout(this._newTimer);
    this.newArmedAt = 0;
    const btn = $('#btn-new');
    if (!btn) return;
    btn.classList.remove('danger');
    const label = btn.querySelector('.btn-label span') || btn.querySelector('.btn-label');
    if (label) label.textContent = 'New Journey';
  }

  armResetSave() {
    const btn = $('#btn-reset-save');
    const label = btn?.querySelector('.btn-label');
    const now = performance.now();
    if (this.resetArmedAt && now - this.resetArmedAt < 6000) {
      clearTimeout(this._resetTimer);
      this.resetArmedAt = 0;
      btn?.classList.remove('danger');
      if (label) label.textContent = 'Reset save data';
      this.resetSave();
      return;
    }
    this.resetArmedAt = now;
    btn?.classList.add('danger');
    if (label) label.textContent = 'Click again to erase';
    this.toast('Erase all progress? Click again to confirm', '⚠');
    clearTimeout(this._resetTimer);
    this._resetTimer = setTimeout(() => {
      this.resetArmedAt = 0;
      btn?.classList.remove('danger');
      if (label) label.textContent = 'Reset save data';
    }, 6000);
  }

  resetSave() {
    this.clearSave();
    this.resetWorldProgress();
    this.playTime = 0;
    this.saveClock = 0;
    this.saveDirty = false;
    this.zone = 'meadow';
    this.respawn.copy(ZONE_SPAWN.meadow);
    this.respawnZone = 'meadow';
    this.openMenu();
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

  showZoneCard(zone = this.zone) {
    const card = $('#zonecard');
    if (!card) return;
    const info = ZONES[zone] || ZONES.meadow;
    $('#zc-name').textContent = info.name;
    $('#zc-sub').textContent = info.sub;
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
  }

  updateProgressionUi() {
    if (!this.world) return;
    const info = ZONES[this.zone] || ZONES.meadow;
    const zoneLabel = $('#zone-label');
    if (zoneLabel && zoneLabel.textContent !== info.name) zoneLabel.textContent = info.name;

    const bossSpec = this.world.bossSpawns[this.zone];
    const bossName = bossSpec?.name || 'Warden';
    const zoneGems = this.world.gems.filter((g) => g.zone === this.zone);
    const collected = zoneGems.filter((g) => g.collected).length;
    const defeated = !!this.bossesDefeated[this.zone];
    let text;

    if (this.boss?.alive && this.boss.engaged) {
      text = `${bossName} engaged · ${this.boss.phaseLabel()}`;
    } else if (!defeated) {
      text = `Shards ${collected}/${zoneGems.length} · awaken the ${bossName}`;
    } else if (this.zone === 'meadow') {
      text = 'The Ruins Gate is open · climb the northern stair';
    } else if (this.zone === 'ruins') {
      text = 'Crystal portal awakened · seek the northern dais';
    } else if (this.zone === 'crystal') {
      text = 'Sky portal awakened · ascend from the far dais';
    } else {
      text = 'Dawn restored · wander the isles';
    }

    const obj = $('#objective-text');
    if (obj && obj.textContent !== text) obj.textContent = text;
    const mob = $('#mobile-objective');
    if (mob && mob.textContent !== text) mob.textContent = text;
  }

  onBossEngaged(boss) {
    this.updateProgressionUi();
    this.effects.addShake(0.25, 0.4);
  }

  onBossDefeated(boss) {
    const zone = boss.zone;
    if (this.bossesDefeated[zone]) return;
    this.bossesDefeated[zone] = true;
    this.syncProgressionWorld(false);

    this.player?.healFull();
    this.updateHearts(true);
    this.gemCount = this.world.gems.filter((g) => g.collected).length;
    this.sfx('checkpoint');

    const messages = {
      meadow: 'Moss Golem felled · the Ruins Gate opens',
      ruins: 'Rune Sentinel felled · the crystal portal awakens',
      crystal: 'Prism Warden felled · the sky portal blazes open',
      sky: 'Storm Drake felled · the dawn is mended',
    };
    this.toast(messages[zone] || 'Warden felled', '✦');
    this.updateProgressionUi();
    this.saveProgress();

    if (zone === 'sky') {
      // Let the death effects breathe; the loop shows the screen once
      // the world is still, even if the player paused in the meantime.
      this.victoryDelay = 1.8;
    }
  }

  onEnemyKilled(enemy) {
    this.kills++;
    // A small mercy: fallen enemies sometimes leave a mote of light.
    if (this.player && !this.player.dead && Math.random() < 0.18 && this.player.hp < this.player.maxHp) {
      this.player.addHp(1);
      this.effects.burst(enemy.center, {
        count: 10, speed: 2, size: 0.16, life: 0.5, gravity: 1,
        colors: [0xffe6a2, 0xffffff],
      });
    }
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
    this.updateProgressionUi();
  }

  getCombatTargets() {
    const list = this.enemies ? this.enemies.getTargets() : [];
    if (this.boss?.alive) list.push(this.boss);
    return list;
  }

  registerAttack(stage, position, facing) {
    let hit = false;
    let hitBoss = false;
    const damage = stage === 2 ? 2 : 1;
    for (const target of this.getCombatTargets()) {
      if (!target.tryHit(position, facing)) continue;
      const isBoss = target === this.boss;
      target.takeDamage(damage, position);
      hit = true;
      if (isBoss) hitBoss = true;
      this.effects.hitSpark(target.center, target.color || 0xffe3a0, 26);
      this.effects.burst(target.center, {
        count: isBoss ? 26 : 18, speed: 4.2, size: 0.18, life: 0.55, gravity: -2, drag: 2.4,
        colors: [target.color || 0xffe3a0, 0xffffff, 0xfff1c2],
      });
      this.effects.addShake(isBoss ? 0.16 : 0.08, isBoss ? 0.24 : 0.16);
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
      if (!target.alive && this.lockTarget === target) this.lockTarget = null;
    }
    if (hit) {
      this.hudKick = 0.12;
      this.hitStop = Math.max(this.hitStop, hitBoss ? 0.075 : 0.045);
      this.updateProgressionUi();
    } else {
      this.sfx('hit', 0.4);
    }
    if (this.lockTarget && !this.lockTarget.alive) this.lockTarget = null;
    if (this.comboTimer <= 0 && !hit) this.combo = 0;
  }

  findLockTarget() {
    let best = null;
    let bestDist = 22;
    const origin = this.player.position;
    for (const target of this.getCombatTargets()) {
      if (!target.alive) continue;
      const d = origin.distanceTo(target.center || target.position);
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

    // Poll gamepads every frame (look axes, fresh button edges).
    if (this.input) {
      this.input.update(dt);
      if (this.state !== 'playing' && this.state !== 'dead') this.input.consumeLook();
    }

    if (this.state === 'playing' || this.state === 'dead') {
      this.readLook();

      if (this.state === 'playing' && !this.transitioning) {
        if (this.hitStop > 0) {
          this.hitStop = Math.max(0, this.hitStop - dt);
        } else {
          this.accumulator = Math.min(this.accumulator + dt, STEP * 6);
          let steps = 0;
          while (this.accumulator >= STEP && steps < 6) {
            this.world.update(STEP, this.elapsed, this.player.position);
            this.player.update(STEP, this.input, this.camYaw, this.lockTarget?.position || null);
            this.enemies.update(STEP, this.player);
            this.boss?.update(STEP, this.player);
            this.projectiles.update(STEP, this.player);
            this.accumulator -= STEP;
            this.playTime += STEP;
            steps++;
          }
        }
        if (this.comboTimer > 0) {
          this.comboTimer -= dt;
          if (this.comboTimer <= 0) {
            this.combo = 0;
            $('#combo-pop')?.classList.remove('show');
          }
        }
        this.pollActions(dt);
        if (this.victoryDelay > 0) {
          this.victoryDelay -= dt;
          if (this.victoryDelay <= 0) this.showVictory();
        }
      } else if (this.state === 'dead') {
        this.world.update(dt, this.elapsed, this.player.position);
      }

      this.effects.update(dt, this.player.position);
      this.updateCamera(dt);
      this.player.updateVisual(dt, this.camera);
      this.env.update(dt, this.player.center);
      this.updateHud();
    } else if (this.state === 'menu') {
      this.world.update(dt, this.elapsed, this.player.position);
      this.effects.update(dt, this.player.position);
      this.player.updateVisual(dt, this.camera);
      this.updateMenuCamera(dt);
      this.env.update(dt, new THREE.Vector3(0, 2, 7));
      this.updateHud();
    } else if (this.state === 'paused' || this.state === 'victory') {
      this.world.update(dt, this.elapsed, this.player.position);
      this.effects.update(dt, this.player.position);
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
    if (this.state === 'playing') this.saveDirty = true;
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
    if (this.transitioning) return;

    if (input.consumePressed('lock')) {
      if (this.lockTarget) {
        this.lockTarget = null;
        this.sfx('ui');
      } else {
        this.lockTarget = this.findLockTarget();
        if (this.lockTarget) {
          this.sfx('ui');
          this.toast(`Locked · ${this.lockTarget.name || 'warden'}`, '◎');
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
        this.respawnZone = cp.zone;
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
            this.toast('Every dawn shard gathered', '✦');
            this.sfx('victory');
          }, 500);
        }
      }
    }

    /* ---------------- gates & portals ---------------- */
    const gate = this.world.gates.find((g) => g.zone === this.zone);
    let nearGate = false;
    if (gate) {
      const dx = gate.group.position.x - this.player.position.x;
      const dz = gate.group.position.z - this.player.position.z;
      nearGate = Math.hypot(dx, dz) < 8.0 && Math.abs(this.player.position.y - gate.group.position.y) < 5.5;
    }

    let nearPortal = null;
    for (const portal of this.world.portals) {
      if (portal.zone !== this.zone) continue;
      const dx = portal.position.x - this.player.position.x;
      const dz = portal.position.z - this.player.position.z;
      if (Math.hypot(dx, dz) < 5.6 && Math.abs(this.player.position.y - portal.position.y) < 5.5) {
        nearPortal = portal;
        break;
      }
    }

    let promptText = '';
    if (nearPortal) {
      promptText = nearPortal.unlocked
        ? `<kbd>E</kbd> Travel to ${nearPortal.label}`
        : `✦ Sealed by the ${this.bossName(this.zone)}`;
    } else if (nearGate) {
      promptText = gate.open > 0.55
        ? '<kbd>E</kbd> Enter the Ancient Ruins'
        : `✦ Sealed by the ${this.bossName('meadow')}`;
    }

    const prompt = $('#interact');
    if (prompt && promptText !== this.lastPrompt) {
      this.lastPrompt = promptText;
      if (promptText) {
        prompt.innerHTML = promptText;
        prompt.classList.add('visible');
      } else {
        prompt.classList.remove('visible');
      }
    }

    if (input.consumePressed('interact')) {
      if (nearPortal) {
        if (nearPortal.unlocked) {
          this.travelToZone(nearPortal.targetZone);
        } else {
          this.sfx('ui');
          this.toast(`${nearPortal.label} is sealed · defeat the ${this.bossName(this.zone)}`, '⌛');
        }
      } else if (nearGate) {
        if (gate.open > 0.55) {
          this.travelToZone('ruins');
        } else {
          this.sfx('ui');
          this.toast(`The gate is sealed · defeat the ${this.bossName('meadow')}`, '⌛');
        }
      }
    }

    // Walking through the opened meadow gate carries you down the stair.
    if (this.zone === 'meadow' && gate && gate.open > 0.55 && this.player.position.z < -60.5 && this.player.position.y > 1.1) {
      this.travelToZone('ruins');
      return;
    }

    // Release lock if the target drifts too far away.
    if (this.lockTarget) {
      const t = this.lockTarget.center || this.lockTarget.position;
      if (this.player.position.distanceTo(t) > 24) this.lockTarget = null;
    }

    if (this.hintTimer > 0) this.hintTimer -= dt;
  }

  bossName(zone) {
    return this.world?.bossSpawns[zone]?.name || 'warden';
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

    // Boss health bar
    const bossbar = $('#bossbar');
    if (bossbar) {
      const live = this.boss?.alive && this.boss.engaged;
      bossbar.classList.toggle('visible', !!live);
      if (live) {
        const fill = $('#boss-fill');
        if (fill) fill.style.width = `${Math.max(0, this.boss.hpRatio * 100)}%`;
        const name = $('#boss-name');
        if (name) name.textContent = this.boss.name;
        const phase = $('#boss-phase');
        if (phase) phase.textContent = this.boss.phaseLabel();
      }
    }

    // Compass to the current goal: lock target, active warden, nearest
    // shard in this realm, then the realm's exit.
    const compass = $('#compass');
    if (compass) {
      let target = null;
      let best = Infinity;
      if (this.lockTarget?.alive) {
        target = this.lockTarget;
        best = this.player.position.distanceTo(target.center || target.position);
      } else if (this.boss?.alive && this.boss.engaged) {
        target = this.boss;
        best = this.player.position.distanceTo(this.boss.position);
      } else {
        for (const gem of this.world.gems) {
          if (gem.collected || gem.zone !== this.zone) continue;
          const d = this.player.position.distanceTo(gem.position);
          if (d < best) { best = d; target = gem; }
        }
        if (!target && this.boss?.alive) {
          target = this.boss;
          best = this.player.position.distanceTo(this.boss.position);
        }
        if (!target && this.bossesDefeated[this.zone]) {
          if (this.zone === 'meadow') {
            const gate = this.world.gates.find((g) => g.zone === 'meadow');
            if (gate) {
              target = { position: gate.group.position };
              best = this.player.position.distanceTo(gate.group.position);
            }
          } else if (this.zone === 'ruins') {
            const p = this.world.portals.find((x) => x.id === 'portal_crystal');
            if (p) { target = p; best = this.player.position.distanceTo(p.position); }
          } else if (this.zone === 'crystal') {
            const p = this.world.portals.find((x) => x.id === 'portal_sky');
            if (p) { target = p; best = this.player.position.distanceTo(p.position); }
          }
        }
      }
      const targetPos = target ? (target.center || target.position) : null;
      compass.classList.toggle('hidden', !targetPos);
      if (targetPos) {
        const dx = targetPos.x - this.player.position.x;
        const dz = targetPos.z - this.player.position.z;
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

    const progSig = `${this.zone}:${this.boss?.engaged ? 1 : 0}:${this.boss?.phase || 0}:${this.bossesDefeated[this.zone] ? 1 : 0}`;
    if (this._progSig !== progSig) {
      this._progSig = progSig;
      this.updateProgressionUi();
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
