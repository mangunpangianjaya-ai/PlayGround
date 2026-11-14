// ============================================================
// IRONFANG — unified input: touch, keyboard, mouse
// ============================================================
const MOVE_KEYS = {
  KeyW: 'f', ArrowUp: 'f',
  KeyS: 'b', ArrowDown: 'b',
  KeyA: 'l', ArrowLeft: 'l',
  KeyD: 'r', ArrowRight: 'r',
};

export class Input {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.enabled = false;
    this.move = { x: 0, z: 0 };
    this.held = { attack: false, special: false, dodge: false, item: false };
    this.presses = { attack: 0, special: 0, dodge: 0, item: 0, lock: 0 };
    this.look = { x: 0, y: 0 };
    this.sprint = false;
    this.keys = new Set();
    this.mouseLocked = false;
    this.draggingCamera = false;
    this.dragId = null;
    this.lastPointer = { x: 0, y: 0 };
    this.touchDragId = null;
    this.stickPointer = null;
    this.stickVector = { x: 0, y: 0 };
    this.stickBase = null;
    this.stickKnob = null;
    this.stickMax = 44;
    this.enabled = false;
    this.touchUsed = false;
    this.onPause = null;
    this._bind();
  }

  _bind() {
    // ---------- keyboard ----------
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.enabled) return;
      if (this.keys.has(e.code)) return;
      this.keys.add(e.code);
      if (e.code === 'Escape') { this.onPause?.(); return; }
      switch (e.code) {
        case 'Space': this.press('dodge'); break;
        case 'KeyJ': this.held.attack = true; this.press('attack'); break;
        case 'KeyK': this.held.special = true; this.press('special'); break;
        case 'KeyE': this.press('item'); break;
        case 'KeyF': case 'KeyQ': case 'Tab': this.press('lock'); break;
        case 'ShiftLeft': case 'ShiftRight': this.sprint = true; break;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyJ') this.held.attack = false;
      if (e.code === 'KeyK') this.held.special = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.held.attack = this.held.special = false;
      this.sprint = false;
    });

    // ---------- mouse ----------
    const onDown = (e) => {
      if (!this.enabled) return;
      if (e.target.closest && e.target.closest('.btn,button,input,.screen')) return;
      if (e.button === 0) {
        this.held.attack = true; this.press('attack');
      } else if (e.button === 2) {
        this.held.special = true; this.press('special');
      }
    };
    const onUp = (e) => {
      if (e.button === 0) this.held.attack = false;
      if (e.button === 2) this.held.special = false;
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.mouseLocked) {
        this.look.x += (e.movementX || 0) * this.sens() * 0.0021;
        this.look.y += (e.movementY || 0) * this.sens() * 0.0018;
      } else if (this.draggingCamera) {
        this.look.x += (e.movementX || 0) * this.sens() * 0.003;
        this.look.y += (e.movementY || 0) * this.sens() * 0.0025;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = document.pointerLockElement === this.canvas;
      this.game?.onPointerLockChange?.(this.mouseLocked);
    });

    // drag-to-look fallback on the canvas (mouse without lock, touch elsewhere)
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse' && this.mouseLocked) return;
      this.touchDragId = e.pointerId;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      this.draggingCamera = true;
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.enabled || e.pointerId !== this.touchDragId) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      this.look.x += dx * this.sens() * (e.pointerType === 'touch' ? 0.0072 : 0.003);
      this.look.y += dy * this.sens() * (e.pointerType === 'touch' ? 0.006 : 0.0025);
    });
    const endDrag = (e) => {
      if (e.pointerId !== this.touchDragId) return;
      this.draggingCamera = false;
      this.touchDragId = null;
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    // ---------- touch joystick ----------
    this.stickBase = document.getElementById('stick-base');
    this.stickKnob = document.getElementById('stick-knob');
    const zone = document.getElementById('stick-zone');
    if (zone) {
      zone.addEventListener('pointerdown', (e) => this._stickStart(e));
      zone.addEventListener('pointermove', (e) => this._stickMove(e));
      zone.addEventListener('pointerup', (e) => this._stickEnd(e));
      zone.addEventListener('pointercancel', (e) => this._stickEnd(e));
    }

    // ---------- action buttons ----------
    document.querySelectorAll('.act-btn[data-action]').forEach((btn) => {
      const action = btn.dataset.action;
      const down = (e) => {
        e.preventDefault(); e.stopPropagation();
        this.touchUsed = true;
        this.held[action] = true;
        if (action === 'dodge' || action === 'item') this.press(action);
        else { this.held[action] = true; this.press(action); }
        btn.classList.add('pressed');
        try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      };
      const up = (e) => {
        e.preventDefault();
        this.held[action] = false;
        btn.classList.remove('pressed');
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', (e) => {
        if (e.buttons === 0) { this.held[action] = false; btn.classList.remove('pressed'); }
      });
    });
    const lockBtn = document.getElementById('touch-lock');
    if (lockBtn) {
      lockBtn.addEventListener('pointerdown', () => {
        this.touchUsed = true;
      });
    }
  }

  sens() { return Math.max(0.3, (this.game?.save?.settings?.sens ?? 100) / 100); }

  press(action) { this.presses[action] = (this.presses[action] || 0) + 1; }
  consume(action) {
    if (this.presses[action] > 0) { this.presses[action]--; return true; }
    return false;
  }
  clearPresses() {
    for (const k of Object.keys(this.presses)) this.presses[k] = 0;
  }
  reset() {
    this.move.x = 0; this.move.z = 0;
    this.held.attack = this.held.special = this.held.dodge = this.held.item = false;
    this.sprint = false;
    this.clearPresses();
    this.look.x = this.look.y = 0;
    this.stickVector.x = this.stickVector.y = 0;
    if (this.stickKnob) this.stickKnob.style.transform = 'translate(-50%,-50%)';
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) { this.reset(); this.exitPointerLock(); }
  }

  requestPointerLock() {
    if (!this.canvas || this.touchUsed) return;
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch { /* ignore */ }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  _stickStart(e) {
    e.preventDefault();
    if (this.stickPointer !== null) return;
    this.stickPointer = e.pointerId;
    this.touchUsed = true;
    const rect = this.stickBase.getBoundingClientRect();
    this.stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    this.stickMax = rect.width * 0.34;
    this._stickMove(e);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  _stickMove(e) {
    if (e.pointerId !== this.stickPointer) return;
    e.preventDefault();
    let dx = e.clientX - this.stickCenter.x;
    let dy = e.clientY - this.stickCenter.y;
    const max = this.stickMax;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    this.stickVector.x = dx / max;
    this.stickVector.y = dy / max;
    if (this.stickKnob) this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const mag = Math.min(1, len / max);
    this.move.x = this.stickVector.x;
    this.move.z = -this.stickVector.y;
    this.sprint = mag > 0.96;
  }

  _stickEnd(e) {
    if (e.pointerId !== this.stickPointer) return;
    this.stickPointer = null;
    this.move.x = this.move.z = 0;
    this.stickVector.x = this.stickVector.y = 0;
    this.sprint = false;
    if (this.stickKnob) this.stickKnob.style.transform = 'translate(-50%,-50%)';
  }

  // keyboard move merged with joystick, returns camera-relative vector
  updateMove() {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (x || z) {
      const len = Math.hypot(x, z);
      x /= len; z /= len;
      return { x, z, mag: 1 };
    }
    const mag = Math.min(1, Math.hypot(this.move.x, this.move.z));
    if (mag > 0.08) return { x: this.move.x / mag, z: this.move.z / mag, mag };
    return { x: 0, z: 0, mag: 0 };
  }

  consumeLook() {
    const out = { x: this.look.x, y: this.look.y };
    this.look.x = this.look.y = 0;
    return out;
  }

  isSprint() { return this.sprint || this.heldSprint; }

  get heldSprint() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
}
