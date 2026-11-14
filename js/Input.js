/* ============================================================
   Input — keyboard, mouse (pointer lock), gamepad, multi-touch
   Edge presses are buffered until consumed by the fixed-step sim.
   ============================================================ */
import { clamp } from './Utils.js';

const KEY_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'dash', ShiftRight: 'dash',
  KeyJ: 'attack', KeyK: 'attack',
  KeyQ: 'lock',
  KeyE: 'interact',
  Escape: 'pause',
  KeyM: 'mute',
};

const PAD_DEADZONE = 0.16;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.zoomDelta = 0;
    this.lookSensitivity = 1;
    this.invertY = false;
    this.enabled = true;

    this.touch = {
      moveX: 0, moveY: 0,
      actions: new Set(),
    };
    this.touchActive = false;

    this.pad = {
      index: null,
      connected: false,
      buttons: new Array(20).fill(false),
      prev: new Array(20).fill(false),
      axes: [0, 0, 0, 0],
    };
    this.activeDevice = 'keyboard';
    this.onGamepad = null;

    this._mouse = { down: false, id: -1, lastX: 0, lastY: 0, startX: 0, startY: 0, dragged: false, locked: false };

    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();

    // expose for querying / tuning from the console
    window.__aetherInput = this;
  }

  get isTouchDevice() {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  /* ---------------- keyboard ---------------- */
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F5' || e.code === 'F12') return;
      const action = KEY_MAP[e.code];
      if (action) e.preventDefault();
      if (!action) return;
      if (!e.repeat) {
        this.pressed.add(action);
        if (action === 'mute' || action === 'pause') this.pressed.add(action);
      }
      this.keys.add(e.code);
      this.activeDevice = 'keyboard';
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.actions.clear();
    });
  }

  /* ---------------- mouse ---------------- */
  _bindMouse() {
    const canvas = this.canvas;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.activeDevice = e.pointerType === 'pen' ? 'pen' : 'mouse';
      if (e.button === 1) { e.preventDefault(); this.pressed.add('lock'); return; }
      if (e.button === 2) { e.preventDefault(); this.pressed.add('lock'); return; }
      if (e.button !== 0) return;
      this._mouse.down = true;
      this._mouse.id = e.pointerId;
      this._mouse.lastX = e.clientX;
      this._mouse.lastY = e.clientY;
      this._mouse.startX = e.clientX;
      this._mouse.startY = e.clientY;
      this._mouse.dragged = false;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }

      if (document.pointerLockElement === canvas) {
        this.pressed.add('attack');
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (document.pointerLockElement === canvas) {
        this._addLook(e.movementX, e.movementY);
        return;
      }
      if (!this._mouse.down || e.pointerId !== this._mouse.id) return;
      const dx = e.clientX - this._mouse.lastX;
      const dy = e.clientY - this._mouse.lastY;
      this._mouse.lastX = e.clientX;
      this._mouse.lastY = e.clientY;
      if (Math.hypot(e.clientX - this._mouse.startX, e.clientY - this._mouse.startY) > 5) this._mouse.dragged = true;
      if (this._mouse.dragged) this._addLook(dx, dy);
      this.activeDevice = 'mouse';
    });

    const endMouse = (e) => {
      if (e.pointerType === 'touch') return;
      if (!this._mouse.down) return;
      const wasDrag = this._mouse.dragged;
      this._mouse.down = false;
      this._mouse.dragged = false;
      if (!wasDrag && e.button === 0 && document.pointerLockElement !== canvas) {
        // A short click: capture the mouse for fluid camera control.
        this.pressed.add('attack');
        this.requestLock();
      }
    };
    window.addEventListener('pointerup', endMouse);
    window.addEventListener('pointercancel', () => { this._mouse.down = false; this._mouse.dragged = false; });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomDelta += clamp(e.deltaY * 0.0025, -1.5, 1.5);
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this._mouse.locked = document.pointerLockElement === canvas;
    });
  }

  requestLock() {
    if (this.isTouchDevice) return;
    const el = this.canvas;
    if (document.pointerLockElement === el) return;
    if (el.requestPointerLock) {
      const p = el.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _addLook(dx, dy) {
    this.lookX += dx * 0.0026 * this.lookSensitivity;
    this.lookY += dy * 0.0026 * this.lookSensitivity * (this.invertY ? -1 : 1);
  }

  /* ---------------- gamepad ---------------- */
  _pollGamepad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (const p of pads) { if (p && p.connected) { pad = p; break; } }
    if (!pad) {
      if (this.pad.connected) this.pad.connected = false;
      return;
    }
    if (!this.pad.connected) {
      this.pad.connected = true;
      this.pad.index = pad.index;
      this.onGamepad?.(pad);
    }

    const btns = pad.buttons.map(b => b.pressed || b.value > 0.35);
    // Standard mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 8 Back, 9 Start
    const mappings = [
      [0, 'jump'], [2, 'attack'], [5, 'dash'], [4, 'lock'],
      [9, 'pause'], [8, 'mute'], [1, 'dash'],
    ];
    for (const [idx, action] of mappings) {
      if (btns[idx] && !this.pad.prev[idx]) {
        this.pressed.add(action);
        this.activeDevice = 'gamepad';
      }
      if (btns[idx]) this.pad.buttons[idx] = true;
      else this.pad.buttons[idx] = false;
    }

    const ax = pad.axes;
    const dead = (v) => Math.abs(v) < PAD_DEADZONE ? 0 : (v - Math.sign(v) * PAD_DEADZONE) / (1 - PAD_DEADZONE);
    this.pad.axes = [dead(ax[0] || 0), dead(ax[1] || 0), dead(ax[2] || 0), dead(ax[3] || 0)];
    if (Math.abs(this.pad.axes[0]) + Math.abs(this.pad.axes[1]) + Math.abs(this.pad.axes[2]) + Math.abs(this.pad.axes[3]) > 0.02) {
      this.activeDevice = 'gamepad';
    }
    this.pad.prev = btns;
  }

  /* ---------------- touch ---------------- */
  _bindTouch() {
    if (this.isTouchDevice) document.body.classList.add('touch-mode');

    const zone = document.getElementById('stick-zone');
    const knob = document.getElementById('stick-knob');
    const look = document.getElementById('touch-look');
    if (!zone || !knob) return;

    let stickId = -1;
    let lookId = -1;
    let lookLastX = 0, lookLastY = 0;
    let centerX = 0, centerY = 0;
    const maxDist = 46;

    const setKnob = (x, y) => {
      knob.style.transform = `translate(${x}px, ${y}px)`;
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchActive = true;
      this.activeDevice = 'touch';
      if (stickId !== -1) return;
      stickId = e.pointerId;
      const rect = zone.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      zone.setPointerCapture(e.pointerId);
      this._updateStick(e.clientX, e.clientY, centerX, centerY, maxDist, setKnob);
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      e.preventDefault();
      this._updateStick(e.clientX, e.clientY, centerX, centerY, maxDist, setKnob);
    });

    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = -1;
      this.touch.moveX = 0;
      this.touch.moveY = 0;
      setKnob(0, 0);
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);

    if (look) {
      look.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.touchActive = true;
        this.activeDevice = 'touch';
        if (lookId !== -1) return;
        lookId = e.pointerId;
        lookLastX = e.clientX;
        lookLastY = e.clientY;
        look.setPointerCapture(e.pointerId);
      });
      look.addEventListener('pointermove', (e) => {
        if (e.pointerId !== lookId) return;
        const dx = e.clientX - lookLastX;
        const dy = e.clientY - lookLastY;
        lookLastX = e.clientX;
        lookLastY = e.clientY;
        this._addLook(dx * 1.5, dy * 1.5);
      });
      const endLook = (e) => { if (e.pointerId === lookId) lookId = -1; };
      look.addEventListener('pointerup', endLook);
      look.addEventListener('pointercancel', endLook);
    }

    // Action buttons: independent pointers => true multi-touch.
    document.querySelectorAll('[data-touch]').forEach((btn) => {
      const action = btn.dataset.touch;
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchActive = true;
        this.activeDevice = 'touch';
        if (!this.touch.actions.has(action)) this.pressed.add(action);
        this.touch.actions.add(action);
        btn.classList.add('active');
        try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      };
      const up = (e) => {
        e.preventDefault();
        this.touch.actions.delete(action);
        btn.classList.remove('active');
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // Prevent double-tap zoom / browser gestures on the play surface.
    document.addEventListener('touchmove', (e) => {
      if (e.target.closest && e.target.closest('#touch')) e.preventDefault();
    }, { passive: false });
  }

  _updateStick(clientX, clientY, cx, cy, maxDist, setKnob) {
    let dx = clientX - cx;
    let dy = clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > maxDist) { dx = (dx / len) * maxDist; dy = (dy / len) * maxDist; }
    setKnob(dx, dy);
    this.touch.moveX = dx / maxDist;
    this.touch.moveY = dy / maxDist;
  }

  /* ---------------- public API ---------------- */
  update(dt) {
    this._pollGamepad();
    // Gamepad camera: graceful continuous rotation.
    if (this.pad.connected) {
      const gx = this.pad.axes[2];
      const gy = this.pad.axes[3];
      if (Math.abs(gx) > 0.01 || Math.abs(gy) > 0.01) {
        this.lookX += gx * 2.2 * this.lookSensitivity * dt;
        this.lookY += gy * 2.0 * this.lookSensitivity * (this.invertY ? -1 : 1) * dt;
      }
    }
  }

  isDown(action) {
    if (!this.enabled) return false;
    if (this.touch.actions.has(action)) return true;
    for (const code in KEY_MAP) {
      if (KEY_MAP[code] === action && this.keys.has(code)) return true;
    }
    if (this.pad.connected) {
      if (action === 'jump' && (this.pad.buttons[0] || this.pad.buttons[3])) return true;
      if (action === 'attack' && this.pad.buttons[2]) return true;
      if (action === 'dash' && (this.pad.buttons[5] || this.pad.buttons[1])) return true;
      if (action === 'lock' && this.pad.buttons[4]) return true;
    }
    return false;
  }

  consumePressed(action) {
    if (this.pressed.has(action)) {
      this.pressed.delete(action);
      return true;
    }
    return false;
  }

  getMove() {
    let x = 0, y = 0;
    if (this.enabled) {
      if (this.isDown('right')) x += 1;
      if (this.isDown('left')) x -= 1;
      if (this.isDown('forward')) y += 1;
      if (this.isDown('back')) y -= 1;
      x += this.touch.moveX;
      y += -this.touch.moveY;
      if (this.pad.connected) {
        x += this.pad.axes[0];
        y += -this.pad.axes[1];
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, len: Math.min(1, len) };
  }

  consumeLook() {
    const out = { x: this.lookX, y: this.lookY };
    this.lookX = 0; this.lookY = 0;
    return out;
  }

  consumeZoom() {
    const z = this.zoomDelta;
    this.zoomDelta = 0;
    return z;
  }

  getUsingGamepad() {
    return this.pad.connected && this.activeDevice === 'gamepad';
  }
}
