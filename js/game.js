import { LEVELS } from './levels.js';
import { Background } from './background.js';
import { FX } from './fx.js';
import {
  TAU, clamp, damp, lerp, rgba, roundedRect, ellipse,
  overlap, hash, mulberry32, smoothstep,
} from './util.js';

const FIXED = 1 / 120;
const PLAYER_W = 30;
const PLAYER_H = 42;

export class Game {
  constructor(canvas, audio, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.audio = audio;
    this.hooks = hooks;
    this.fx = new FX();
    this.time = 0;
    this.lastTs = 0;
    this.accum = 0;
    this.mode = 'menu';
    this.input = { axis: 0, jumpHeld: false, jumpBuffer: 0 };
    this.prevJumpHeld = false;
    this.camera = { x: 0, y: 0 };
    this.levelIndex = 0;
    this.levelDef = LEVELS[0];
    this.level = LEVELS[0];
    this.player = null;
    this.ambient = [];
    this.decor = { grass: [], flowers: [], pebbles: [], vines: [] };
    this.fallTimer = 0;
    this.gateHint = 0;
    this.completeInfo = null;
    this.streak = 0;
    this.streakTimer = 0;
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsCount = 0;

    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    this.attract(0);
    this._raf = requestAnimationFrame(this._frame);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.cssW = w;
    this.cssH = h;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * this.dpr) || this.canvas.height !== Math.round(h * this.dpr)) {
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
    }
    const landscape = w >= h;
    let z = landscape
      ? clamp(h / 720, 0.9, 1.4)
      : clamp(w / 430, 0.82, 1.2);
    z = Math.max(z, w / 1500, h / 1080);
    this.zoom = z;
    this.viewW = w / z;
    this.viewH = h / z;
    if (this.player) this.clampCamera();
  }

  // ------------------------------------------------------------------ setup
  attract(index = 0) {
    this.buildLevel(index, { restore: false });
    this.mode = 'menu';
    this.accum = 0;
    this.camera.x = clamp(420 - this.viewW / 2, 0, Math.max(0, this.level.width - this.viewW));
    this.camera.y = clamp(120, 0, Math.max(0, this.level.height - this.viewH));
    this.fx.list.length = 0;
  }

  buildLevel(index, options = {}) {
    const def = LEVELS[index];
    this.levelIndex = index;
    this.levelDef = def;
    this.level = def;
    this.background = new Background(def.theme, index * 3 + 2);
    this.audio.setMusic(def.theme.music, 1.6);
    this.audio.setAmbience(def.theme.ambient);

    this.solids = def.ground.map(([x, y, w, h = 470]) => ({ x, y, w, h }));
    this.platforms = def.platforms.map(([x, y, w]) => ({ x, y, w, h: 16, oneWay: true }));
    this.movers = (def.movers || []).map((m, i) => ({
      ...m, h: 18, baseX: m.x, baseY: m.y, phase: i * 1.9,
      prevX: m.x, prevY: m.y, dx: 0, dy: 0, oneWay: true,
    }));
    this.mushrooms = (def.mushrooms || []).map(([x, y], i) => ({
      x, y, bounce: 0, phase: i * 1.7,
    }));
    this.stars = def.stars.map(([x, y], i) => ({
      id: i, x, y, collected: false, phase: i * 0.83, bob: 0,
    }));
    this.checkpoints = (def.checkpoints || []).map(([x, y], i) => ({
      x, y, active: false, index: i, bloom: 0, phase: i * 1.3,
    }));
    this.gate = def.gate ? { ...def.gate, unlocked: false, open: 0, glow: 0 } : null;
    this.goal = { x: def.goal[0], y: def.goal[1], w: 108, h: 170, bloom: 0 };
    this.starsTotal = this.stars.length;
    this.collectedCount = 0;
    this.fallTimer = 0;
    this.completeInfo = null;
    this.streak = 0;
    this.streakTimer = 0;
    this.gateHint = 0;
    this.ambient = this.buildAmbient();
    this.buildDecor();

    const spawn = def.spawn;
    this.player = {
      x: spawn[0] - PLAYER_W / 2,
      y: spawn[1],
      w: PLAYER_W, h: PLAYER_H,
      vx: 0, vy: 0,
      facing: 1, onGround: false, moverRef: null,
      coyote: 0, jumpsUsed: 0,
      squash: 0, squashVel: 0, runPhase: 0,
      blink: 2.4, blinkTime: 0,
      tailX: spawn[0] - 40, tailY: spawn[1] + 12,
      idle: 0,
    };
    this.respawnPoint = { x: spawn[0], y: spawn[1] + PLAYER_H, checkpoint: -1 };

    if (options.restore) {
      if (options.collected) {
        for (const id of options.collected) {
          const s = this.stars[id];
          if (s) {
            s.collected = true;
            this.collectedCount++;
          }
        }
      }
      const cpIndex = typeof options.checkpoint === 'number' ? options.checkpoint : -1;
      if (cpIndex >= 0 && this.checkpoints[cpIndex]) {
        for (let i = 0; i <= cpIndex; i++) this.checkpoints[i].active = true;
        const cp = this.checkpoints[cpIndex];
        this.respawnPoint = { x: cp.x, y: cp.y, checkpoint: cpIndex };
        this.player.x = cp.x - PLAYER_W / 2;
        this.player.y = cp.y - PLAYER_H - 2;
      }
    }

    this.fx.list.length = 0;
    this.camera.x = clamp(this.player.x + PLAYER_W / 2 - this.viewW / 2, 0, Math.max(0, def.width - this.viewW));
    this.camera.y = clamp(this.player.y + PLAYER_H / 2 - this.viewH * 0.58, 0, Math.max(0, def.height - this.viewH));
    this.clampCamera();
  }

  buildAmbient() {
    const def = this.levelDef;
    const rng = mulberry32(this.levelIndex * 151 + 13);
    const list = [];
    const count = 36;
    for (let i = 0; i < count; i++) {
      list.push({
        kind: 'mote',
        x: rng() * def.width,
        y: 120 + rng() * 1000,
        size: 1 + rng() * 1.7,
        phase: rng() * TAU,
        speed: 0.4 + rng() * 0.9,
        drift: 6 + rng() * 16,
        vy: -2 + rng() * 5,
      });
    }
    const petalCount = 34;
    for (let i = 0; i < petalCount; i++) {
      list.push({
        kind: 'petal',
        x: rng() * def.width,
        y: 80 + rng() * 1100,
        size: 2.4 + rng() * 3.2,
        phase: rng() * TAU,
        rot: rng() * TAU,
        vr: (rng() - 0.5) * 1.8,
        vy: 10 + rng() * 22,
        vx: -16 + rng() * 32,
        color: rng() < 0.6 ? def.theme.flower : def.theme.flower2,
      });
    }
    return list;
  }

  buildDecor() {
    const th = this.levelDef.theme;
    const grass = [];
    const flowers = [];
    const pebbles = [];
    const vines = [];
    const surfaces = [
      ...this.solids.map((s) => ({ x: s.x, y: s.y, w: s.w, tall: true })),
      ...this.platforms.map((p) => ({ x: p.x, y: p.y, w: p.w, tall: false })),
    ];
    for (const s of surfaces) {
      for (let x = s.x + 10; x < s.x + s.w - 8; x += 22) {
        const r = hash(x * 0.37 + s.y * 0.11 + this.levelIndex * 7);
        if (r < 0.34) {
          grass.push({ x, y: s.y + 2, h: 5 + hash(x * 1.7) * 11, phase: hash(x * 3.1) * TAU });
        }
        if (r > 0.92) {
          flowers.push({
            x, y: s.y - 2, scale: 0.65 + hash(x * 2.3) * 0.6,
            color: r > 0.963 ? th.flower2 : th.flower,
            phase: hash(x * 4.4) * TAU,
          });
        }
      }
      if (s.tall) {
        for (let y = s.y + 70; y < Math.min(s.y + 430, this.levelDef.height); y += 90) {
          for (let k = 0; k < 2; k++) {
            const px = s.x + 30 + hash(s.x + y * 1.3 + k * 41) * (s.w - 60);
            pebbles.push({ x: px, y, r: 2 + hash(px) * 4 });
          }
        }
      } else {
        for (let k = 0; k < 2; k++) {
          const vx = s.x + 18 + hash(s.x + k * 17) * (s.w - 36);
          vines.push({ x: vx, y: s.y + 16, len: 16 + hash(vx * 1.9) * 46, phase: hash(vx) * TAU });
        }
      }
    }
    this.decor = { grass, flowers, pebbles, vines };
  }

  // ------------------------------------------------------------------ public
  startLevel(index, options = {}) {
    this.buildLevel(index, options);
    this.mode = 'play';
    this.accum = 0;
    this.input.jumpBuffer = 0;
    this.input.jumpHeld = false;
    this.prevJumpHeld = false;
    this.hooks.onLevelStart?.(index, this.levelDef);
    this.hooks.onHud?.(this.collectedCount, this.starsTotal, 0);
  }

  restartLevel() {
    this.startLevel(this.levelIndex, { restore: false });
  }

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.input.axis = 0;
    this.input.jumpHeld = false;
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'play';
    this.accum = 0;
  }

  setAxis(axis) {
    this.input.axis = clamp(axis, -1, 1);
  }

  setJumpHeld(held) {
    this.input.jumpHeld = !!held;
  }

  queueJump() {
    this.input.jumpBuffer = 0.15;
  }

  debugState() {
    return {
      mode: this.mode,
      level: this.levelIndex,
      x: this.player?.x,
      y: this.player?.y,
      vx: this.player?.vx,
      vy: this.player?.vy,
      onGround: this.player?.onGround,
      collected: this.collectedCount,
      total: this.starsTotal,
      gate: this.gate ? { unlocked: this.gate.unlocked, need: this.gate.need } : null,
      fps: Math.round(this.fps),
    };
  }

  // ------------------------------------------------------------------ frame
  _frame = (ts) => {
    this._raf = requestAnimationFrame(this._frame);
    if (!this.lastTs) this.lastTs = ts;
    const raw = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    const dt = clamp(raw, 0, 0.05);
    this.time += dt;

    this._fpsAcc += raw;
    this._fpsCount++;
    if (this._fpsAcc > 0.5) {
      this.fps = this._fpsCount / this._fpsAcc;
      this._fpsAcc = 0;
      this._fpsCount = 0;
    }

    if (this.mode === 'play') {
      this.accum += dt;
      let steps = 0;
      while (this.accum >= FIXED && steps < 10) {
        this._step(FIXED);
        this.accum -= FIXED;
        steps++;
      }
    }
    if (this.mode === 'paused' || this.mode === 'complete') {
      this.accum = 0;
    }

    if (this.mode !== 'play' || this.fallTimer > 0) {
      this._updateVisuals(dt);
    }
    this.fx.update(dt);
    this._updateAmbient(dt);
    this._updateCamera(dt);
    this.render();
    this.audio.update(dt);
  };

  _step(dt) {
    this.streakTimer = Math.max(0, this.streakTimer - dt);
    if (this.streakTimer <= 0 && this.streak > 0) this.streak = 0;
    this.gateHint = Math.max(0, this.gateHint - dt);
    this._updateMovers(dt);

    if (this.fallTimer > 0) {
      const before = this.fallTimer;
      this.fallTimer = Math.max(0, this.fallTimer - dt);
      if (before > 0.42 && this.fallTimer <= 0.42) this._relocate();
      return;
    }

    this._updatePlayer(dt);
    this._updateVisuals(dt);
    this._updateMushrooms(dt);
    this._updatePickups(dt);
  }

  _updateVisuals(dt) {
    const p = this.player;
    if (!p) return;
    p.idle += dt;
    p.blink -= dt;
    if (p.blink <= 0) {
      p.blinkTime = 0.13;
      p.blink = 2.4 + Math.random() * 3.5;
    }
    if (p.blinkTime > 0) p.blinkTime -= dt;

    if (p.onGround && Math.abs(p.vx) > 40) p.runPhase += Math.abs(p.vx) * dt * 0.052;
    else p.runPhase = damp(p.runPhase, 0, 6, dt);

    const cx = p.x + p.w / 2;
    const targetX = cx - p.facing * (26 + Math.min(24, Math.abs(p.vx) * 0.06));
    const targetY = p.y + 18 + Math.sin(this.time * 3.4) * 3.4 - p.vy * 0.014;
    if (!Number.isFinite(p.tailX) || Math.abs(p.tailX - cx) > 150) {
      p.tailX = targetX;
      p.tailY = targetY;
    }
    p.tailX = damp(p.tailX, targetX, 7, dt);
    p.tailY = damp(p.tailY, targetY, 6, dt);
  }

  // ------------------------------------------------------------------ physics
  _updateMovers(dt) {
    for (const m of this.movers) {
      m.prevX = m.x;
      m.prevY = m.y;
      const ang = this.time * (m.speed / Math.max(1, m.range)) + m.phase;
      if (m.axis === 'x') m.x = m.baseX + Math.sin(ang) * m.range;
      else m.y = m.baseY + Math.sin(ang) * m.range;
      m.dx = m.x - m.prevX;
      m.dy = m.y - m.prevY;
    }
  }

  _updatePlayer(dt) {
    const p = this.player;
    const input = this.input;
    if (!p) return;

    input.jumpBuffer = Math.max(0, input.jumpBuffer - dt);

    // ride moving platforms
    if (p.onGround && p.moverRef) {
      p.x += p.moverRef.dx;
      p.y += p.moverRef.dy;
    }
    p.moverRef = null;

    const wasOnGround = p.onGround;
    const fallSpeed = p.vy;

    // Horizontal movement — soft acceleration, gentle friction.
    const accel = p.onGround ? 2500 : 1750;
    const maxSpeed = 292;
    if (input.axis !== 0) {
      p.vx += input.axis * accel * dt;
      if (Math.abs(p.vx) > maxSpeed) p.vx = clamp(p.vx, -maxSpeed, maxSpeed);
      p.facing = input.axis > 0 ? 1 : -1;
    } else {
      const friction = p.onGround ? 2500 : 320;
      if (Math.abs(p.vx) <= friction * dt) p.vx = 0;
      else p.vx -= Math.sign(p.vx) * friction * dt;
    }

    // jump cut
    if (this.prevJumpHeld && !input.jumpHeld && p.vy < -220) p.vy *= 0.56;
    this.prevJumpHeld = input.jumpHeld;

    // Gravity — floaty and forgiving.
    let gravity = 2020;
    if (p.vy < 0 && input.jumpHeld) gravity *= 0.82;
    p.vy = Math.min(1000, p.vy + gravity * dt);

    // Coyote time / jump charges.
    if (p.onGround) {
      p.coyote = 0.13;
      p.jumpsUsed = 0;
    } else {
      p.coyote = Math.max(0, p.coyote - dt);
    }

    if (input.jumpBuffer > 0 && !this.completeInfo) {
      if (p.onGround || p.coyote > 0) {
        this._jump(-730, false);
        input.jumpBuffer = 0;
      } else if (p.jumpsUsed < 2) {
        this._jump(-642, true);
        input.jumpBuffer = 0;
      }
    }

    p.onGround = false;

    // ---- X axis collisions
    p.x += p.vx * dt;
    const gateBox = this.gate && !this.gate.unlocked
      ? { x: this.gate.x, y: this.gate.y, w: this.gate.w, h: this.gate.h }
      : null;
    const solidsX = gateBox ? [...this.solids, gateBox] : this.solids;
    for (const s of solidsX) {
      if (!overlap(p, s)) continue;
      if (p.vx > 0) p.x = s.x - p.w;
      else if (p.vx < 0) p.x = s.x + s.w;
      p.vx = 0;
    }
    p.x = clamp(p.x, 0, this.level.width - p.w);

    // ---- Y axis collisions
    const prevBottom = p.y + p.h;
    p.y += p.vy * dt;
    let landed = false;

    for (const s of solidsX) {
      if (!overlap(p, s)) continue;
      if (p.vy > 0) {
        p.y = s.y - p.h;
        p.vy = 0;
        landed = true;
      } else if (p.vy < 0) {
        p.y = s.y + s.h;
        p.vy = 0;
      }
    }

    // one-way platforms and movers
    if (p.vy >= 0) {
      const candidates = [...this.platforms, ...this.movers];
      for (const pl of candidates) {
        const withinX = p.x + p.w > pl.x + 2 && p.x < pl.x + pl.w - 2;
        if (!withinX) continue;
        const top = pl.y;
        if (prevBottom <= top + 7 && p.y + p.h >= top) {
          p.y = top - p.h;
          p.vy = 0;
          landed = true;
          if (pl.dx !== undefined) p.moverRef = pl;
        }
      }
    }

    // safety: keep inside solid columns horizontally if embedded
    for (const s of this.solids) {
      if (overlap(p, s)) {
        const fromLeft = Math.abs(p.x + p.w - s.x);
        const fromRight = Math.abs(s.x + s.w - p.x);
        if (fromLeft < fromRight) p.x = s.x - p.w;
        else p.x = s.x + s.w;
        p.vx = 0;
      }
    }

    p.onGround = landed;
    if (p.onGround) {
      p.jumpsUsed = 0;
      p.coyote = 0.13;
    }

    if (!wasOnGround && p.onGround && fallSpeed > 220) {
      const power = clamp(fallSpeed / 2300, 0.12, 0.38);
      p.squash = power;
      p.squashVel = 0;
      this.audio.land(fallSpeed < 560);
      this.fx.burst(p.x + p.w / 2, p.y + p.h, {
        color: '#f4e4ca', count: 6, speed: 40, life: 0.5, size: 2.4, gravity: -18, additive: false, angle: 0, spread: Math.PI * 2,
      });
    }

    // squash / stretch spring
    p.squashVel += (-p.squash * 230 - p.squashVel * 16) * dt;
    p.squash += p.squashVel * dt;

    // footstep puffs
    if (p.onGround && Math.abs(p.vx) > 150) {
      this._stepDust = (this._stepDust || 0) + dt;
      if (this._stepDust > 0.16) {
        this._stepDust = 0;
        this.fx.spawn({
          x: p.x + p.w / 2 - p.facing * 8, y: p.y + p.h - 1,
          vx: -p.facing * 16, vy: -12, life: 0.45, maxLife: 0.45, size: 2.6,
          color: '#f6ead3', type: 'dust', additive: false, gravity: -6, drag: 0.94,
        });
      }
    }

    // mushroom bounce check
    for (const m of this.mushrooms) {
      const capTop = m.y - 62;
      const feet = p.y + p.h;
      if (
        p.vy > 90 &&
        feet >= capTop - 2 && feet <= capTop + 30 &&
        Math.abs(p.x + p.w / 2 - m.x) < 38
      ) {
        p.y = capTop - p.h;
        p.vy = -1040;
        p.jumpsUsed = 0;
        p.coyote = 0;
        p.squash = -0.28;
        p.squashVel = -1.4;
        m.bounce = 1;
        this.audio.bounce();
        this.fx.ring(m.x, m.y - 62, '#ffe6bc', 16, 0.6);
        this.fx.burst(m.x, m.y - 60, {
          color: this.levelDef.theme.flower, count: 12, speed: 130, life: 0.8,
          size: 3.2, gravity: 220, type: 'petal', additive: false, angle: -Math.PI / 2, spread: Math.PI,
        });
      }
    }

    // fell off the world — no penalty, just a soft return.
    if (p.y > this.level.height + 110) {
      this.fallTimer = 1.0;
      this.audio.respawn();
    }
  }

  _jump(vy, isDouble) {
    const p = this.player;
    p.vy = vy;
    p.onGround = false;
    p.moverRef = null;
    p.coyote = 0;
    p.jumpsUsed = isDouble ? 2 : 1;
    p.squash = -0.2;
    p.squashVel = 0.6;
    if (isDouble) {
      this.audio.doubleJump();
      this.fx.ring(p.x + p.w / 2, p.y + p.h - 6, '#cfe6d2', 12, 0.55);
      this.fx.burst(p.x + p.w / 2, p.y + p.h - 4, {
        color: '#fff0c4', count: 9, speed: 80, life: 0.6, size: 2.6, gravity: -30, type: 'dot',
      });
    } else {
      this.audio.jump();
      this.fx.burst(p.x + p.w / 2, p.y + p.h, {
        color: '#f2e6d2', count: 5, speed: 40, life: 0.4, size: 2.3,
        gravity: -20, additive: false, angle: 0, spread: Math.PI * 2,
      });
    }
  }

  _updateMushrooms(dt) {
    for (const m of this.mushrooms) {
      m.bounce = Math.max(0, m.bounce - dt * 2.6);
    }
  }

  _updatePickups(dt) {
    const p = this.player;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;

    for (const s of this.stars) {
      if (s.collected) continue;
      s.bob = Math.sin(this.time * 1.8 + s.phase) * 5;
      const dx = cx - s.x;
      const dy = cy - (s.y + s.bob);
      if (dx * dx + dy * dy < 56 * 56) {
        s.collected = true;
        this.collectedCount++;
        this.streak++;
        this.streakTimer = 2.6;
        this.fx.burst(s.x, s.y + s.bob, {
          color: '#ffe7a0', count: 12, speed: 85, life: 0.9, size: 3, gravity: -20, type: 'dot',
        });
        this.fx.ring(s.x, s.y + s.bob, '#ffeec0', 10, 0.6);
        this.fx.spawn({
          x: s.x, y: s.y, type: 'sparkle', color: '#fff6cf',
          size: 4, life: 0.8, maxLife: 0.8, vy: -40, gravity: -20, additive: true,
        });
        this.audio.collect(this.streak - 1);
        this.hooks.onCollect?.(this.levelIndex, s.id, this.collectedCount, this.starsTotal);
        if (this.gate && !this.gate.unlocked && this.collectedCount >= this.gate.need) {
          this._openGate();
        }
      }
    }

    // checkpoints
    for (const cp of this.checkpoints) {
      if (cp.active) {
        cp.bloom = Math.min(1, cp.bloom + dt * 2);
        continue;
      }
      const nearX = Math.abs(cx - cp.x) < 46;
      const nearY = p.y + p.h > cp.y - 100 && p.y + p.h < cp.y + 40;
      if (nearX && nearY) {
        cp.active = true;
        this.respawnPoint = { x: cp.x, y: cp.y, checkpoint: cp.index };
        this.audio.checkpoint();
        this.fx.ring(cp.x, cp.y - 66, '#ffe8b5', 14, 0.9);
        this.fx.burst(cp.x, cp.y - 62, {
          color: '#ffe6a8', count: 16, speed: 90, life: 1.2, size: 3, gravity: -30,
        });
        this.hooks.onCheckpoint?.(this.levelIndex, cp.index);
        this.hooks.onToast?.('a warm little light to return to');
      }
    }

    // gate hint
    if (this.gate && !this.gate.unlocked) {
      if (this.gate.open > 0) this.gate.open = 0;
      if (Math.abs(cx - (this.gate.x + this.gate.w / 2)) < 150 && this.gateHint <= 0) {
        const need = this.gate.need - this.collectedCount;
        this.hooks.onToast?.(`the bloom still needs ${need} more firefl${need === 1 ? 'y' : 'ies'}`);
        this.gateHint = 5.5;
      }
    } else if (this.gate) {
      this.gate.open = Math.min(1, this.gate.open + dt * 0.9);
      this.gate.glow = Math.min(1, this.gate.glow + dt);
    }

    // goal
    if (!this.completeInfo) {
      const goalRect = { x: this.goal.x - 54, y: this.goal.y - 240, w: 108, h: 260 };
      if (overlap(p, goalRect)) this._finishLevel();
    }
  }

  _openGate() {
    if (!this.gate || this.gate.unlocked) return;
    this.gate.unlocked = true;
    this.gate.glow = 0;
    this.audio.gateOpen();
    this.fx.ring(this.gate.x + this.gate.w / 2, this.gate.y + 40, '#ffe9ae', 22, 1.1);
    this.fx.burst(this.gate.x + this.gate.w / 2, this.gate.y + 40, {
      color: '#ffe6b0', count: 30, speed: 130, life: 1.4, size: 3.2, gravity: -40,
    });
    this.hooks.onGate?.(this.levelIndex);
    this.hooks.onToast?.('the bloom awakens');
  }

  _finishLevel() {
    const p = this.player;
    const info = {
      levelIndex: this.levelIndex,
      collected: this.collectedCount,
      total: this.starsTotal,
      isLast: this.levelIndex === LEVELS.length - 1,
    };
    this.mode = 'complete';
    this.completeInfo = info;
    this.goal.bloom = 1;
    p.vx = 0;
    p.vy = 0;
    p.onGround = true;
    this.audio.complete();
    this.fx.ring(this.goal.x, this.goal.y - 92, '#ffe9b4', 30, 1.4);
    this.fx.burst(this.goal.x, this.goal.y - 100, {
      color: '#ffe7ad', count: 26, speed: 130, life: 1.6, size: 3.4, gravity: -20,
    });
    this.fx.burst(this.goal.x, this.goal.y - 70, {
      color: this.levelDef.theme.flower, count: 22, speed: 110, life: 2.4,
      size: 3.6, gravity: 20, type: 'petal', additive: false, angle: -Math.PI / 2, spread: Math.PI * 1.4,
    });
    this.hooks.onComplete?.(info);
  }

  _relocate() {
    const p = this.player;
    const rp = this.respawnPoint;
    p.x = rp.x - p.w / 2;
    p.y = rp.y - p.h - 2;
    p.vx = 0;
    p.vy = 0;
    p.onGround = true;
    p.jumpsUsed = 0;
    p.moverRef = null;
    p.tailX = p.x + 10;
    p.tailY = p.y + 16;
    this.camera.x = clamp(p.x + p.w / 2 - this.viewW / 2, 0, Math.max(0, this.level.width - this.viewW));
    this.camera.y = clamp(p.y + p.h / 2 - this.viewH * 0.58, 0, Math.max(0, this.level.height - this.viewH));
    this.fx.burst(rp.x, rp.y - 6, {
      color: '#fff0c6', count: 18, speed: 70, life: 1.1, size: 3, gravity: -56,
      type: 'petal', additive: false, angle: -Math.PI / 2, spread: Math.PI * 1.4,
    });
    this.fx.ring(rp.x, rp.y - 12, '#ffe7ae', 14, 0.9);
  }

  _updateAmbient(dt) {
    const camL = this.camera.x - 260;
    const camR = this.camera.x + this.viewW + 260;
    for (const a of this.ambient) {
      if (a.kind === 'mote') {
        a.x += Math.sin(this.time * a.speed + a.phase) * a.drift * dt;
        a.y += a.vy * dt;
        if (a.y < 40) a.y = this.level.height - 80;
        a.y += Math.sin(this.time * 0.6 + a.phase) * 3 * dt;
      } else {
        a.x += (a.vx + Math.sin(this.time * 0.8 + a.phase) * 14) * dt;
        a.y += a.vy * dt;
        a.rot += a.vr * dt;
        if (a.y > this.level.height + 30 || a.x < camL - 400 || a.x > camR + 400) {
          a.x = camL + Math.random() * (camR - camL);
          a.y = -20;
        }
      }
      if (a.x < -100) a.x = this.level.width + 80;
      if (a.x > this.level.width + 100) a.x = -60;
    }
  }

  _updateCamera(dt) {
    if (!this.player) return;
    if (this.mode === 'menu') {
      const target = 620 + Math.sin(this.time * 0.032) * 380;
      const tx = clamp(target - this.viewW / 2, 0, Math.max(0, this.level.width - this.viewW));
      const ty = clamp(90 + Math.sin(this.time * 0.021) * 40, 0, Math.max(0, this.level.height - this.viewH));
      this.camera.x = damp(this.camera.x, tx, 0.55, dt);
      this.camera.y = damp(this.camera.y, ty, 0.5, dt);
      return;
    }
    const p = this.player;
    const lead = clamp(p.vx * 0.22, -90, 90);
    const tx = clamp(p.x + p.w / 2 + lead - this.viewW / 2, 0, Math.max(0, this.level.width - this.viewW));
    const ty = clamp(p.y + p.h / 2 - this.viewH * 0.56, 0, Math.max(0, this.level.height - this.viewH));
    this.camera.x = damp(this.camera.x, tx, 7.5, dt);
    this.camera.y = damp(this.camera.y, ty, 5.5, dt);
  }

  clampCamera() {
    if (!this.level) return;
    this.camera.x = clamp(this.camera.x, 0, Math.max(0, this.level.width - this.viewW));
    this.camera.y = clamp(this.camera.y, 0, Math.max(0, this.level.height - this.viewH));
  }

  // ------------------------------------------------------------------ render
  render() {
    const ctx = this.ctx;
    const { cssW: w, cssH: h, dpr, zoom, camera } = this;
    if (!this.background) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.background.draw(ctx, camera, w, h, this.time, zoom);

    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
    ctx.translate(-camera.x, -camera.y);

    const view = { x: camera.x - 120, y: camera.y - 200, w: this.viewW + 240, h: this.viewH + 400 };
    this._drawWorld(ctx, view);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._drawForeground(ctx, w, h);
    this._drawWeather(ctx, w, h);
    this._drawVignette(ctx, w, h);
    this._drawRespawnFade(ctx, w, h);

    if (this.mode === 'menu') this._drawMenuSparkles(ctx, w, h);
  }

  _drawForeground(ctx, w, h) {
    const th = this.levelDef.theme;
    ctx.save();
    ctx.fillStyle = th.foregroundColor;
    for (let i = 0; i < 16; i++) {
      const baseX = ((i * 149) % (w + 180)) - 90 + Math.sin(this.time * 0.3 + i) * 4;
      const baseY = h + 18;
      const scale = 0.55 + hash(i * 4.3) * 0.8;
      const alpha = 0.16 + hash(i * 2.1) * 0.12;
      ctx.globalAlpha = alpha;
      for (let k = 0; k < 3; k++) {
        const x = baseX + k * 9 * scale;
        const hh = (34 + hash(i * 3.1 + k) * 58) * scale;
        const sway = Math.sin(this.time * 0.8 + i * 0.9 + k) * 10;
        ctx.beginPath();
        ctx.moveTo(x - 5 * scale, baseY);
        ctx.quadraticCurveTo(x - 3 * scale + sway * 0.4, baseY - hh * 0.55, x + sway, baseY - hh);
        ctx.quadraticCurveTo(x + 2 * scale + sway * 0.4, baseY - hh * 0.5, x + 5 * scale, baseY);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawWorld(ctx, view) {
    const th = this.levelDef.theme;
    this._drawPlatforms(ctx, view, th);
    this._drawVines(ctx, view, th);
    for (const m of this.mushrooms) {
      if (m.x < view.x - 100 || m.x > view.x + view.w + 100) continue;
      this._drawMushroom(ctx, m, th);
    }
    for (const cp of this.checkpoints) {
      if (cp.x < view.x - 100 || cp.x > view.x + view.w + 100) continue;
      this._drawCheckpoint(ctx, cp, th);
    }
    if (this.gate) this._drawGate(ctx, th);
    this._drawGoal(ctx, th);
    this._drawStars(ctx, view);
    this._drawAmbient(ctx, view);
    this.fx.draw(ctx);
    this._drawPlayer(ctx, th);
  }

  _drawPlatforms(ctx, view, th) {
    for (const s of this.solids) {
      if (s.x + s.w < view.x - 60 || s.x > view.x + view.w + 60) continue;
      this._drawSolid(ctx, s, th);
    }
    for (const pl of this.platforms) {
      if (pl.x + pl.w < view.x - 80 || pl.x > view.x + view.w + 80) continue;
      this._drawFloat(ctx, pl, th);
    }
    for (const m of this.movers) {
      if (m.x + m.w < view.x - 80 || m.x > view.x + view.w + 80) continue;
      this._drawMover(ctx, m, th);
    }
    // grass blades + flowers + pebbles
    for (const g of this.decor.grass) {
      if (g.x < view.x - 30 || g.x > view.x + view.w + 30) continue;
      const sway = Math.sin(this.time * 1.3 + g.phase) * 2.4;
      ctx.strokeStyle = th.grassDark;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.quadraticCurveTo(g.x + sway * 0.4, g.y - g.h * 0.6, g.x + sway, g.y - g.h);
      ctx.stroke();
      if (g.h > 12) {
        ctx.beginPath();
        ctx.moveTo(g.x + 3, g.y);
        ctx.quadraticCurveTo(g.x + 3 + sway * 0.5, g.y - g.h * 0.45, g.x + 3 + sway * 0.8, g.y - g.h * 0.75);
        ctx.stroke();
      }
    }
    for (const f of this.decor.flowers) {
      if (f.x < view.x - 30 || f.x > view.x + view.w + 30) continue;
      this._drawFlower(ctx, f);
    }
    for (const p of this.decor.pebbles) {
      if (p.x < view.x - 20 || p.x > view.x + view.w + 20) continue;
      ctx.fillStyle = rgba(th.soilDark, 0.4);
      ellipse(ctx, p.x, p.y, p.r, p.r * 0.62);
      ctx.fill();
    }
  }

  _drawSolid(ctx, s, th) {
    const grad = ctx.createLinearGradient(0, s.y, 0, s.y + Math.min(420, s.h));
    grad.addColorStop(0, th.soilLight);
    grad.addColorStop(0.16, th.soil);
    grad.addColorStop(1, th.soilDark);
    ctx.fillStyle = grad;
    roundedRect(ctx, s.x, s.y, s.w, s.h, [22, 22, 0, 0]);
    ctx.fill();

    // grass cap
    const gg = ctx.createLinearGradient(0, s.y - 2, 0, s.y + 24);
    gg.addColorStop(0, th.grassLight);
    gg.addColorStop(0.45, th.grass);
    gg.addColorStop(1, th.grassDark);
    ctx.fillStyle = gg;
    roundedRect(ctx, s.x, s.y - 2, s.w, 24, [22, 22, 8, 8]);
    ctx.fill();

    ctx.fillStyle = rgba('#ffffff', 0.18);
    ctx.beginPath();
    ctx.ellipse(s.x + s.w / 2, s.y + 4, s.w / 2 - 18, 4, 0, 0, TAU);
    ctx.fill();

    // scalloped grass-to-soil edge
    ctx.fillStyle = rgba(th.grassDark, 0.52);
    for (let x = s.x + 12; x < s.x + s.w - 12; x += 28) {
      const rr = 5 + hash(x * 1.31 + s.y) * 7;
      ctx.beginPath();
      ctx.ellipse(x, s.y + 23, rr, 3.4, 0, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(th.soilDark, 0.22);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + 27);
    ctx.lineTo(s.x + s.w, s.y + 27);
    ctx.stroke();

    // faint roots / texture
    ctx.strokeStyle = rgba(th.soilDark, 0.4);
    ctx.lineWidth = 1.4;
    const startX = Math.max(s.x + 30, Math.ceil((s.x + 30) / 90) * 90);
    for (let x = startX; x < s.x + s.w - 30; x += 90) {
      const hh = hash(x * 0.7) * 50 + 20;
      ctx.beginPath();
      ctx.moveTo(x, s.y + 34);
      ctx.quadraticCurveTo(x + 6, s.y + 34 + hh * 0.5, x - 3, s.y + 34 + hh);
      ctx.stroke();
    }
  }

  _drawFloat(ctx, pl, th) {
    const shadow = ctx.createLinearGradient(0, pl.y - 4, 0, pl.y + 22);
    shadow.addColorStop(0, th.grass);
    shadow.addColorStop(0.38, th.soilLight);
    shadow.addColorStop(1, th.soilDark);
    ctx.fillStyle = shadow;
    roundedRect(ctx, pl.x, pl.y - 2, pl.w, 22, 11);
    ctx.fill();

    const gg = ctx.createLinearGradient(0, pl.y - 4, 0, pl.y + 7);
    gg.addColorStop(0, th.grassLight);
    gg.addColorStop(1, th.grassDark);
    ctx.fillStyle = gg;
    roundedRect(ctx, pl.x, pl.y - 4, pl.w, 12, [9, 9, 4, 4]);
    ctx.fill();
  }

  _drawMover(ctx, m, th) {
    // soft glow beneath
    const g = ctx.createRadialGradient(m.x + m.w / 2, m.y + 16, 2, m.x + m.w / 2, m.y + 16, m.w * 0.8);
    g.addColorStop(0, rgba(th.accent, 0.22));
    g.addColorStop(1, rgba(th.accent, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(m.x + m.w / 2, m.y + 14, m.w * 0.8, 0, TAU);
    ctx.fill();

    const body = ctx.createLinearGradient(0, m.y - 6, 0, m.y + 22);
    body.addColorStop(0, th.grassLight);
    body.addColorStop(0.4, th.grass);
    body.addColorStop(1, th.soilDark);
    ctx.fillStyle = body;
    roundedRect(ctx, m.x, m.y - 5, m.w, 24, 12);
    ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.22);
    roundedRect(ctx, m.x + 10, m.y - 2, m.w - 20, 4, 2);
    ctx.fill();

    // little leaf fins
    ctx.fillStyle = rgba(th.grass, 0.9);
    for (const side of [-1, 1]) {
      const x = side < 0 ? m.x + 4 : m.x + m.w - 4;
      ctx.beginPath();
      ctx.ellipse(x + side * 4, m.y + 4, 12, 5, side * 0.5, 0, TAU);
      ctx.fill();
    }

    // hanging sparkle
    ctx.fillStyle = rgba(th.star, 0.9);
    ctx.beginPath();
    ctx.arc(m.x + m.w / 2, m.y + 16 + Math.sin(this.time * 2 + m.phase) * 2, 1.8, 0, TAU);
    ctx.fill();
  }

  _drawVines(ctx, view, th) {
    for (const v of this.decor.vines) {
      if (v.x < view.x - 20 || v.x > view.x + view.w + 20) continue;
      const sway = Math.sin(this.time * 0.9 + v.phase) * 5;
      ctx.strokeStyle = rgba(th.grassDark, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.quadraticCurveTo(v.x + sway * 0.3, v.y + v.len * 0.6, v.x + sway, v.y + v.len);
      ctx.stroke();
      ctx.fillStyle = rgba(th.grassDark, 0.8);
      const ly = v.y + v.len * 0.7;
      ctx.beginPath();
      ctx.ellipse(v.x + sway * 0.45 + 4, ly, 4, 2.2, 0.5, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(v.x + sway * 0.8 - 3, ly + 9, 3.4, 2, -0.4, 0, TAU);
      ctx.fill();
    }
  }

  _drawFlower(ctx, f) {
    const sway = Math.sin(this.time * 1.1 + f.phase) * 2;
    const baseY = f.y;
    const topY = f.y - 10 * f.scale;
    ctx.strokeStyle = rgba('#7fa083', 0.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(f.x, baseY);
    ctx.quadraticCurveTo(f.x + sway * 0.4, baseY - 6, f.x + sway, topY);
    ctx.stroke();
    ctx.fillStyle = f.color;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      ctx.beginPath();
      ctx.ellipse(
        f.x + sway + Math.cos(a) * 2.6 * f.scale,
        topY + Math.sin(a) * 2.2 * f.scale,
        2.6 * f.scale, 1.7 * f.scale, a, 0, TAU,
      );
      ctx.fill();
    }
    ctx.fillStyle = '#f5d58d';
    ctx.beginPath();
    ctx.arc(f.x + sway, topY, 1.4 * f.scale, 0, TAU);
    ctx.fill();
  }

  _drawMushroom(ctx, m, th) {
    const squash = m.bounce;
    const sx = 1 + squash * 0.22;
    const sy = 1 - squash * 0.26;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(sx, sy);

    ctx.fillStyle = '#f1e4cf';
    roundedRect(ctx, -8, -30, 16, 30, [7, 7, 3, 3]);
    ctx.fill();
    ctx.fillStyle = rgba('#d8c3a6', 0.7);
    roundedRect(ctx, -8, -16, 16, 16, [0, 0, 3, 3]);
    ctx.fill();

    const capY = -42;
    const cg = ctx.createLinearGradient(0, capY - 24, 0, capY + 12);
    cg.addColorStop(0, '#f6c7c1');
    cg.addColorStop(0.6, th.accent);
    cg.addColorStop(1, '#c97f7f');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(0, capY, 36, 20, 0, Math.PI, TAU);
    ctx.lineTo(36, capY + 2);
    ctx.quadraticCurveTo(0, capY + 16, -36, capY + 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = rgba('#fff4e4', 0.88);
    const spots = [[-16, -52, 5], [5, -56, 4], [20, -48, 3.4], [-4, -45, 2.6]];
    for (const [sx2, sy2, r] of spots) {
      ctx.beginPath();
      ctx.ellipse(sx2, sy2, r * 1.15, r * 0.8, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // glow when freshly bounced
    if (m.bounce > 0.03) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(m.x, m.y - 44, 0, m.x, m.y - 44, 60);
      g.addColorStop(0, rgba('#ffe9b4', m.bounce * 0.35));
      g.addColorStop(1, rgba('#ffe9b4', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y - 44, 60, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  _drawCheckpoint(ctx, cp, th) {
    const active = cp.active;
    const bob = Math.sin(this.time * 1.4 + cp.phase) * 2.5;
    const lx = cp.x;
    const ly = cp.y - 78 + bob;

    // pole
    ctx.strokeStyle = rgba('#7c6559', 0.8);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cp.x, cp.y);
    ctx.quadraticCurveTo(cp.x - 4, cp.y - 40, cp.x - 16, cp.y - 64);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cp.x - 16, cp.y - 64);
    ctx.lineTo(lx, cp.y - 70);
    ctx.stroke();

    // glow
    if (active) {
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.6 + Math.sin(this.time * 2 + cp.phase) * 0.15;
      const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 56);
      g.addColorStop(0, rgba('#ffe8ac', 0.5 * pulse));
      g.addColorStop(0.4, rgba('#ffd98c', 0.16));
      g.addColorStop(1, rgba('#ffd98c', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, 56, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // lantern glass
    const glass = ctx.createLinearGradient(lx, ly - 13, lx, ly + 13);
    if (active) {
      glass.addColorStop(0, '#fff4cf');
      glass.addColorStop(0.6, '#ffdf9d');
      glass.addColorStop(1, '#f2b775');
    } else {
      glass.addColorStop(0, 'rgba(255, 250, 239, 0.78)');
      glass.addColorStop(1, 'rgba(232, 210, 194, 0.55)');
    }
    ctx.fillStyle = glass;
    roundedRect(ctx, lx - 9, ly - 12, 18, 24, 8);
    ctx.fill();
    ctx.strokeStyle = rgba('#8d7568', 0.42);
    ctx.lineWidth = 1.4;
    roundedRect(ctx, lx - 9, ly - 12, 18, 24, 8);
    ctx.stroke();
    ctx.fillStyle = active ? '#e8b56f' : '#c3ab96';
    roundedRect(ctx, lx - 11, ly - 15, 22, 4, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, ly - 16, 2.2, 0, TAU);
    ctx.fill();
    if (active) {
      ctx.fillStyle = '#fff8d9';
      ctx.beginPath();
      ctx.arc(lx, ly + 1, 4.5, 0, TAU);
      ctx.fill();
    }

    // base stones
    ctx.fillStyle = rgba(th.soilDark, 0.55);
    ctx.beginPath();
    ctx.ellipse(cp.x, cp.y + 1, 14, 4, 0, 0, TAU);
    ctx.fill();
  }

  _drawGate(ctx, th) {
    const gate = this.gate;
    if (!gate) return;
    const open = gate.open;
    const cx = gate.x + gate.w / 2;
    const baseY = gate.y + gate.h;
    const topY = gate.y;
    const bloomY = baseY - 208;

    if (!gate.unlocked) {
      // soft glow behind the hedge
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createLinearGradient(cx, baseY, cx, topY);
      halo.addColorStop(0, rgba('#ffe7ae', 0.04));
      halo.addColorStop(0.45, rgba('#ffe7ae', 0.11));
      halo.addColorStop(1, rgba('#ffe7ae', 0));
      ctx.fillStyle = halo;
      ctx.fillRect(gate.x - 18, topY, gate.w + 36, gate.h);
      ctx.restore();

      // a tall sleeping hedge
      ctx.save();
      ctx.strokeStyle = rgba('#688b74', 0.92);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x = gate.x + 6 + (i / 6) * (gate.w - 12);
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.bezierCurveTo(
          x + 14, baseY - gate.h * 0.33,
          x - 18, baseY - gate.h * 0.62,
          x + (i - 3) * 3, topY,
        );
        ctx.stroke();
      }
      // branches across
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = rgba('#7d9d81', 0.7);
      for (let i = 0; i < 7; i++) {
        const yy = baseY - 60 - i * (gate.h - 90) / 6;
        ctx.beginPath();
        ctx.moveTo(gate.x + 4, yy + 6);
        ctx.quadraticCurveTo(cx, yy - 14, gate.x + gate.w - 4, yy);
        ctx.stroke();
      }
      // leaves
      ctx.fillStyle = rgba(th.grass, 0.84);
      for (let i = 0; i < 62; i++) {
        const yy = baseY - 18 - hash(i * 3.7) * (gate.h - 30);
        const xx = gate.x + 2 + hash(i * 2.1) * (gate.w - 4);
        ctx.beginPath();
        ctx.ellipse(xx, yy, 7.4, 3.9, hash(i) * TAU, 0, TAU);
        ctx.fill();
      }
      // tiny buds
      ctx.fillStyle = rgba(th.flower, 0.65);
      for (let i = 0; i < 9; i++) {
        const yy = baseY - 40 - hash(i * 5.1) * (gate.h - 80);
        const xx = gate.x + 8 + hash(i * 7.3) * (gate.w - 16);
        ctx.beginPath();
        ctx.arc(xx, yy, 2.4, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // sleeping bloom
      this._drawBloom(ctx, cx, bloomY, 1.05 + Math.sin(this.time * 1.2) * 0.04, th, 0.8, true);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const bg = ctx.createRadialGradient(cx, bloomY, 2, cx, bloomY, 46);
      bg.addColorStop(0, rgba('#ffe9b4', 0.22));
      bg.addColorStop(1, rgba('#ffe9b4', 0));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, bloomY, 46, 0, TAU);
      ctx.fill();
      ctx.restore();

      // requirement dots
      const need = gate.need;
      const have = Math.min(need, this.collectedCount);
      const dotW = 11;
      const totalW = need * dotW;
      const startX = cx - totalW / 2;
      const dotY = bloomY - 52;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rowGlow = ctx.createRadialGradient(cx, dotY, 2, cx, dotY, totalW * 0.65);
      rowGlow.addColorStop(0, rgba('#ffe8b0', 0.14));
      rowGlow.addColorStop(1, rgba('#ffe8b0', 0));
      ctx.fillStyle = rowGlow;
      ctx.beginPath();
      ctx.ellipse(cx, dotY, totalW * 0.65, 16, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      for (let i = 0; i < need; i++) {
        const filled = i < have;
        ctx.fillStyle = filled ? rgba('#ffd98a', 0.98) : rgba('#fff4e4', 0.4);
        ctx.beginPath();
        ctx.arc(startX + i * dotW + dotW / 2, dotY, 3.1, 0, TAU);
        ctx.fill();
        if (filled) {
          ctx.fillStyle = rgba('#ffe7a0', 0.2);
          ctx.beginPath();
          ctx.arc(startX + i * dotW + dotW / 2, dotY, 6.4, 0, TAU);
          ctx.fill();
        }
      }
    } else {
      // retreating hedge, waking bloom
      const left = 1 - open;
      if (left > 0.02) {
        ctx.save();
        ctx.globalAlpha = left * 0.8;
        ctx.strokeStyle = rgba('#8fb08f', 0.75);
        ctx.lineWidth = 4;
        for (let i = 0; i < 6; i++) {
          const x = gate.x + 8 + (i / 5) * (gate.w - 16);
          ctx.beginPath();
          ctx.moveTo(x, baseY);
          ctx.quadraticCurveTo(x + 8, baseY - gate.h * 0.5, x - 2, topY);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(cx, baseY, cx, topY);
      g.addColorStop(0, rgba('#ffe7ae', 0.1 + gate.glow * 0.14));
      g.addColorStop(0.5, rgba('#ffe7ae', 0.18 * gate.glow));
      g.addColorStop(1, rgba('#ffe7ae', 0));
      ctx.fillStyle = g;
      ctx.fillRect(gate.x - 24, topY, gate.w + 48, gate.h);
      ctx.restore();
      this._drawBloom(ctx, cx, bloomY, 0.95 + open * 0.35, th, 0.95, false);
      // floating light petals
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) {
        const t = (this.time * 0.24 + i / 8) % 1;
        ctx.fillStyle = rgba('#ffe8b0', (1 - t) * 0.4 * open);
        ctx.beginPath();
        ctx.arc(cx + Math.sin(t * 6 + i * 2) * 38, baseY - t * 260, 2.2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawBloom(ctx, x, y, scale, th, alpha, closed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    const petalCount = 6;
    for (let i = 0; i < petalCount; i++) {
      const a = (i / petalCount) * TAU + this.time * 0.05;
      const spread = closed ? 0.55 : 1;
      ctx.save();
      ctx.rotate(a);
      const grad = ctx.createLinearGradient(0, -8, 0, -34);
      grad.addColorStop(0, '#ffeccd');
      grad.addColorStop(1, closed ? '#eab6b1' : '#ffd8c4');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, -22 * spread, 8, 18 * spread, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffe5a2';
    ctx.beginPath();
    ctx.arc(0, 0, closed ? 6 : 8, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  _drawGoal(ctx, th) {
    const goal = this.goal;
    const x = goal.x;
    const base = goal.y;
    const top = base - 132;
    const done = this.completeInfo ? 1 : 0;
    const pulse = 0.7 + Math.sin(this.time * 1.6) * 0.15 + done * 0.3;

    // light column
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(x, base, x, top - 70);
    g.addColorStop(0, rgba('#ffe7ad', 0.2 * pulse));
    g.addColorStop(0.55, rgba('#ffe7ad', 0.13 * pulse));
    g.addColorStop(1, rgba('#ffe7ad', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 60, base);
    ctx.quadraticCurveTo(x - 38, top - 30, x - 26, top);
    ctx.lineTo(x + 26, top);
    ctx.quadraticCurveTo(x + 38, top - 30, x + 60, base);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // arch vines
    ctx.strokeStyle = rgba('#7e9c80', 0.9);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * 48, base);
      ctx.bezierCurveTo(x + side * 54, base - 60, x + side * 38, top + 30, x + side * 6, top - 2);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(th.grass, 0.9);
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1;
      const yy = base - 12 - (i / 16) * 110;
      const xx = x + side * (46 - (i / 16) * 42);
      ctx.beginPath();
      ctx.ellipse(xx, yy, 7, 3.6, side * 0.6, 0, TAU);
      ctx.fill();
    }

    this._drawBloom(ctx, x, top - 8, done ? 1.25 : 1 + Math.sin(this.time * 1.2) * 0.04, th, done ? 1 : 0.92, false);

    // drifting glow dots
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const t = (this.time * 0.35 + i / 7) % 1;
      const yy = base - t * 140;
      const xx = x + Math.sin(t * 7 + i * 2) * 26;
      ctx.fillStyle = rgba('#ffe7ad', 0.45 * (1 - t));
      ctx.beginPath();
      ctx.arc(xx, yy, 2, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawStars(ctx, view) {
    for (const s of this.stars) {
      if (s.collected) continue;
      if (s.x < view.x - 60 || s.x > view.x + view.w + 60) continue;
      const y = s.y + Math.sin(this.time * 1.8 + s.phase) * 5;
      const pulse = 0.75 + Math.sin(this.time * 2.6 + s.phase * 1.7) * 0.25;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(s.x, y, 0, s.x, y, 27 * pulse);
      glow.addColorStop(0, rgba('#fff0bd', 0.72));
      glow.addColorStop(0.3, rgba('#ffd97c', 0.32));
      glow.addColorStop(1, rgba('#ffd97c', 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(s.x, y, 27 * pulse, 0, TAU);
      ctx.fill();
      ctx.restore();

      // wings
      const flap = Math.sin(this.time * 9 + s.phase) * 0.5;
      ctx.save();
      ctx.translate(s.x, y);
      ctx.fillStyle = 'rgba(255, 253, 238, 0.5)';
      ctx.beginPath();
      ctx.ellipse(-5, -2, 7, 3.2, -0.55 - flap, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(5, -2, 7, 3.2, 0.55 + flap, 0, TAU);
      ctx.fill();

      const core = ctx.createRadialGradient(-1.5, -2, 0.5, 0, 0, 7.5);
      core.addColorStop(0, '#fffbe8');
      core.addColorStop(0.45, '#ffe19a');
      core.addColorStop(0.85, '#f4bf63');
      core.addColorStop(1, '#eab35c');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, 6.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(116, 82, 48, 0.55)';
      ctx.beginPath();
      ctx.arc(-2.4, -1.6, 1.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 250, 237, 0.95)';
      ctx.beginPath();
      ctx.arc(-2, -2.8, 1.8, 0, TAU);
      ctx.fill();
      ctx.restore();

      // tiny sparkle cross
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#fff7d9', 0.6);
      ctx.lineWidth = 1;
      const ss = 12 + pulse * 4;
      ctx.beginPath();
      ctx.moveTo(s.x - ss, y);
      ctx.lineTo(s.x + ss, y);
      ctx.moveTo(s.x, y - ss);
      ctx.lineTo(s.x, y + ss);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawAmbient(ctx, view) {
    ctx.save();
    for (const a of this.ambient) {
      if (a.x < view.x - 50 || a.x > view.x + view.w + 50) continue;
      if (a.kind === 'mote') {
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.45 + 0.3 * Math.sin(this.time * 1.4 + a.phase);
        const r = a.size * 3.3;
        const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
        g.addColorStop(0, rgba('#fff2c8', 0.55 * pulse));
        g.addColorStop(0.3, rgba('#ffd98c', 0.24 * pulse));
        g.addColorStop(1, rgba('#ffd98c', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot);
        ctx.globalAlpha = 0.62;
        ctx.fillStyle = a.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, a.size, a.size * 0.52, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  _findGroundBelow(cx, feet) {
    let best = Infinity;
    for (const s of this.solids) {
      if (cx > s.x && cx < s.x + s.w && s.y >= feet - 4 && s.y < best) best = s.y;
    }
    for (const pl of this.platforms) {
      if (cx > pl.x && cx < pl.x + pl.w && pl.y >= feet - 4 && pl.y < best) best = pl.y;
    }
    for (const m of this.movers) {
      if (cx > m.x && cx < m.x + m.w && m.y >= feet - 4 && m.y < best) best = m.y;
    }
    return best === Infinity ? null : best;
  }

  _drawPlayer(ctx, th) {
    const p = this.player;
    if (!p) return;
    const cx = p.x + p.w / 2;
    const feet = p.y + p.h;
    if (cx < this.camera.x - 120 || cx > this.camera.x + this.viewW + 120) return;
    if (this.fallTimer > 0.62) return;

    // shadow
    const gy = this._findGroundBelow(cx, feet);
    if (gy !== null && gy - feet < 320) {
      const d = clamp(1 - (gy - feet) / 320, 0.1, 1);
      ctx.save();
      ctx.globalAlpha = 0.16 * d;
      ctx.fillStyle = '#4b4540';
      ctx.beginPath();
      ctx.ellipse(cx, gy - 1, 17 * d + 5, 4 * d + 1.4, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // scarf tail
    let tailX = p.tailX ?? cx - 30;
    let tailY = p.tailY ?? p.y + 18;
    const anchorY = p.y + 18;
    const tdx = tailX - cx;
    const tdy = tailY - anchorY;
    const tdist = Math.hypot(tdx, tdy);
    if (tdist > 58) {
      tailX = cx + (tdx / tdist) * 58;
      tailY = anchorY + (tdy / tdist) * 58;
    }
    const sway = Math.sin(this.time * 4.2) * 2.6;
    const midX = cx - p.facing * (17 + Math.min(12, Math.abs(p.vx) * 0.035));
    const midY = anchorY - 2 + Math.sin(this.time * 3.1) * 2.4 - Math.min(5, Math.abs(p.vy) * 0.008);
    ctx.save();
    ctx.fillStyle = rgba(th.accent, 0.92);
    ctx.beginPath();
    ctx.moveTo(cx - p.facing * 1, anchorY - 3);
    ctx.quadraticCurveTo(midX, midY - 6, tailX, tailY - 5 + sway * 0.3);
    ctx.quadraticCurveTo(tailX - p.facing * 7, tailY + 2 + sway * 0.6, tailX - p.facing * 3, tailY + 5 + sway * 0.7);
    ctx.quadraticCurveTo(midX, midY + 5, cx, anchorY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba('#f9dcc3', 0.5);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, anchorY);
    ctx.quadraticCurveTo(midX, midY, tailX - p.facing * 2, tailY + sway * 0.5);
    ctx.stroke();
    ctx.restore();

    const speedStretch = clamp(-p.vy * 0.00007, -0.05, 0.09);
    const breathe = p.onGround && Math.abs(p.vx) < 20 ? Math.sin(p.idle * 1.5) * 0.015 : 0;
    const sy = clamp(1 - p.squash + speedStretch + breathe, 0.66, 1.32);
    const sx = 1 / sy;

    ctx.save();
    ctx.translate(cx, feet);
    ctx.scale(p.facing * sx, sy);

    const run = p.runPhase;
    const runAmp = p.onGround ? Math.min(1, Math.abs(p.vx) / 240) : 0;
    const legSwing = Math.sin(run) * 5 * runAmp;
    const bodyBob = Math.abs(Math.sin(run)) * 1.8 * runAmp + (p.onGround ? 0 : 1.5);

    // feet
    const footY = -4 - (p.onGround ? 0 : 3);
    ctx.fillStyle = '#dc9a90';
    ctx.strokeStyle = 'rgba(122, 84, 82, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(-8 + legSwing * 0.6, footY - bodyBob, 7, 4.4, -0.1, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(8 - legSwing * 0.6, footY - bodyBob, 7, 4.4, 0.1, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // arms
    ctx.fillStyle = '#f3dcc5';
    const armSwing = Math.sin(run + Math.PI) * 4 * runAmp;
    ctx.beginPath();
    ctx.ellipse(-20, -27 - bodyBob - armSwing * 0.4, 4.4, 6.5, -0.25, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(20, -27 - bodyBob + armSwing * 0.4, 4.4, 6.5, 0.25, 0, TAU);
    ctx.fill();

    // body
    const bodyGrad = ctx.createLinearGradient(0, -58, 0, -2);
    bodyGrad.addColorStop(0, '#fffaf0');
    bodyGrad.addColorStop(0.55, '#fbeedb');
    bodyGrad.addColorStop(1, '#f2d7c0');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = 'rgba(134, 96, 90, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, -31 - bodyBob, 21, 27, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // belly
    ctx.fillStyle = 'rgba(255, 250, 239, 0.72)';
    ctx.beginPath();
    ctx.ellipse(0, -22 - bodyBob, 13, 15, 0, 0, TAU);
    ctx.fill();

    // ears
    const earSway = Math.sin(this.time * 1.7) * 0.06 + (p.onGround ? 0 : -0.16);
    ctx.save();
    ctx.translate(0, -50 - bodyBob);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.18 + earSway) + (side < 0 ? -0.06 : 0.06));
      ctx.fillStyle = '#f8e2cc';
      ctx.strokeStyle = 'rgba(138, 101, 95, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(side * 9, -14, 7.4, 17, side * 0.12, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(238, 173, 167, 0.65)';
      ctx.beginPath();
      ctx.ellipse(side * 9, -14, 3.6, 11, side * 0.12, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // face
    const look = p.facing * 1.4;
    const blinking = p.blinkTime > 0;
    ctx.strokeStyle = '#6b5359';
    ctx.fillStyle = '#6b5359';
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    if (blinking) {
      for (const ex of [-7.5, 7.5]) {
        ctx.beginPath();
        ctx.arc(ex + look * 0.4, -34 - bodyBob, 2.6, 0.15, Math.PI - 0.15);
        ctx.stroke();
      }
    } else {
      for (const ex of [-7.5, 7.5]) {
        ctx.beginPath();
        ctx.ellipse(ex + look, -34 - bodyBob, 2.6, 3.2, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(ex + look - 0.8, -35.2 - bodyBob, 0.9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#6b5359';
      }
    }

    // cheeks
    ctx.fillStyle = 'rgba(238, 158, 154, 0.4)';
    ctx.beginPath();
    ctx.ellipse(-13, -27 - bodyBob, 4.4, 2.6, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(13, -27 - bodyBob, 4.4, 2.6, 0, 0, TAU);
    ctx.fill();

    // smile
    ctx.strokeStyle = 'rgba(107, 83, 89, 0.75)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(look * 0.6, -28 - bodyBob, 2.2, 0.25, Math.PI - 0.25);
    ctx.stroke();

    // scarf collar
    ctx.strokeStyle = rgba(th.accent, 0.95);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, -45 - bodyBob, 11, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.restore();

    // little glints around when double-jumping
    if (!p.onGround && p.jumpsUsed >= 2 && p.vy > -700) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const yy = p.y + 10 + i * 9 + Math.sin(this.time * 4 + i) * 2;
        ctx.fillStyle = rgba('#ffeec4', 0.3 - i * 0.07);
        ctx.beginPath();
        ctx.arc(cx + Math.sin(this.time * 3 + i) * 8, yy, 1.8, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawWeather(ctx, w, h) {
    const th = this.levelDef.theme;
    if (th.ambient.rain > 0.05) {
      ctx.save();
      ctx.strokeStyle = `rgba(226, 234, 244, ${0.1 + th.ambient.rain * 0.12})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 62; i++) {
        const sx = (hash(i * 2.3) * w + this.time * (12 + (i % 4) * 8) + Math.sin(this.time + i) * 8) % (w + 60) - 30;
        const sy = (hash(i * 5.1) * h + this.time * (240 + (i % 5) * 60)) % (h + 40) - 20;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - 3, sy + 14);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawVignette(ctx, w, h) {
    const night = this.levelDef.theme.stars > 0.2;
    const key = `${w}x${h}:${night ? 1 : 0}`;
    if (!this._vignette || this._vignetteKey !== key) {
      const scale = 0.5;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      const v = c.getContext('2d');
      v.setTransform(scale, 0, 0, scale, 0, 0);
      const g = v.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.28, w / 2, h * 0.5, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(70, 48, 58, 0)');
      g.addColorStop(0.72, 'rgba(70, 48, 58, 0.04)');
      g.addColorStop(1, 'rgba(62, 42, 54, 0.26)');
      v.fillStyle = g;
      v.fillRect(0, 0, w, h);
      if (night) {
        const top = v.createLinearGradient(0, 0, 0, h * 0.4);
        top.addColorStop(0, 'rgba(28, 32, 60, 0.2)');
        top.addColorStop(1, 'rgba(28, 32, 60, 0)');
        v.fillStyle = top;
        v.fillRect(0, 0, w, h * 0.4);
      }
      this._vignette = c;
      this._vignetteKey = key;
    }
    ctx.drawImage(this._vignette, 0, 0, this._vignette.width, this._vignette.height, 0, 0, w, h);
  }

  _drawRespawnFade(ctx, w, h) {
    if (this.fallTimer <= 0) return;
    const t = this.fallTimer;
    const alpha = t > 0.42 ? clamp((1.0 - t) / 0.58, 0, 1) : clamp(t / 0.42, 0, 1);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, `rgba(255, 247, 231, ${alpha * 0.92})`);
    g.addColorStop(1, `rgba(252, 231, 208, ${alpha * 0.98})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (alpha > 0.2) {
      ctx.fillStyle = `rgba(125, 92, 100, ${alpha * 0.5})`;
      ctx.textAlign = 'center';
      ctx.font = 'italic 18px Georgia, serif';
      ctx.fillText('softly back again', w / 2, h / 2 + 6);
    }
  }

  _drawMenuSparkles(ctx, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = w * (0.24 + 0.52 * hash(i * 3.3)) + Math.sin(this.time * 0.2 + i) * 20;
      const y = h * (0.3 + 0.35 * hash(i * 5.7)) + Math.cos(this.time * 0.17 + i * 2) * 16;
      const a = 0.25 + 0.2 * Math.sin(this.time * 0.9 + i * 1.5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
      g.addColorStop(0, `rgba(255, 246, 214, ${a})`);
      g.addColorStop(1, 'rgba(255, 246, 214, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}