import { clamp, mulberry32 } from './util.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * A tiny generative music box: soft piano-ish plucks, warm pads, bass,
 * wind / water / rain ambience, birds, and gentle UI sounds.
 * Everything is synthesised, so the game stays a small static bundle.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.musicVolume = 0.62;
    this.sfxVolume = 0.78;
    this.muted = false;

    this.musicConfig = null;
    this.pendingMusic = null;
    this.switchAt = 0;
    this.step = 0;
    this.nextNote = 0;
    this.lastChord = null;
    this.melodyMidi = 69;

    this.ambience = { wind: 0.4, birds: 0.5, rain: 0, water: 0 };
    this.birdTimer = 4;
    this.rainTimer = 2;
    this.rng = mulberry32(20260413);
  }

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this._buildGraph();
      this.ready = true;
      if (this.pendingMusic) {
        this.musicConfig = this.pendingMusic;
        this.pendingMusic = null;
        this.step = 0;
        this.nextNote = this.ctx.currentTime + 0.15;
        this._fadeMusicTo(this.musicVolume, 1.5);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.02;
    this.compressor.release.value = 0.35;

    this.master.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);

    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.9;
    this.ambientGain.connect(this.master);

    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.4);
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0.22;
    this.reverb.connect(this.reverbWet);
    this.reverbWet.connect(this.master);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 1;
    this.reverbIn.connect(this.reverb);

    this.noise = this._noiseBuffer(2.5);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, decay);
        data[i] = (Math.random() * 2 - 1) * env * (i < 300 ? i / 300 : 1);
      }
    }
    return buf;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.96 + white * 0.04;
      data[i] = last * 2.4;
    }
    // make it loop smoothly
    const fade = 800;
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[i] *= k;
      data[len - 1 - i] *= k;
    }
    return buf;
  }

  _ambientLoop(type) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    if (type === 'wind') {
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.Q.value = 0.7;
    } else if (type === 'water') {
      filter.type = 'bandpass';
      filter.frequency.value = 720;
      filter.Q.value = 1.1;
    } else {
      filter.type = 'highpass';
      filter.frequency.value = 3200;
    }
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);
    src.start();
    return { src, filter, gain };
  }

  _ensureAmbient() {
    if (this.ambientNodes) return;
    if (!this.ctx) return;
    this.ambientNodes = {
      wind: this._ambientLoop('wind'),
      water: this._ambientLoop('water'),
      rain: this._ambientLoop('rain'),
    };
    const ctx = this.ctx;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(this.ambientNodes.wind.filter.frequency);
    lfo.start();
  }

  setVolumes({ music, sfx } = {}) {
    if (typeof music === 'number') this.musicVolume = clamp(music, 0, 1);
    if (typeof sfx === 'number') this.sfxVolume = clamp(sfx, 0, 1);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._fadeMusicTo(this.musicVolume, 0.4);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume, now, 0.08);
    this._ambientTargets();
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, now, 0.06);
  }

  _fadeMusicTo(value, seconds) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setTargetAtTime(value, now, Math.max(0.08, seconds / 3.2));
  }

  /** Switch the generative progression, with a soft level-to-level fade. */
  setMusic(config, fade = 1.6) {
    this.pendingMusic = config;
    if (!this.ctx) return;
    this._ensureAmbient();
    this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setTargetAtTime(0, now, 0.35);
    this.switchAt = now + Math.max(0.45, fade * 0.45);

    const target = { ...this.ambience };
    this._ambientTargets();
    void target;
  }

  setAmbience(cfg = {}) {
    this.ambience = { ...this.ambience, ...cfg };
    this._ambientTargets();
  }

  _ambientTargets() {
    if (!this.ctx || !this.ambientNodes) return;
    const now = this.ctx.currentTime;
    const base = this.sfxVolume;
    const n = this.ambientNodes;
    n.wind.gain.gain.setTargetAtTime(Math.max(0.0001, this.ambience.wind * 0.16 * base), now, 1.2);
    n.water.gain.gain.setTargetAtTime(Math.max(0.0001, this.ambience.water * 0.1 * base), now, 1.2);
    n.rain.gain.gain.setTargetAtTime(Math.max(0.0001, this.ambience.rain * 0.055 * base), now, 1.4);
  }

  update(dt) {
    if (!this.ctx || this.ctx.state !== 'running') return;

    // swap progression after fade-out
    if (this.switchAt && this.ctx.currentTime >= this.switchAt && this.pendingMusic) {
      this.musicConfig = this.pendingMusic;
      this.pendingMusic = null;
      this.switchAt = 0;
      this.step = 0;
      this.nextNote = this.ctx.currentTime + 0.1;
      this._fadeMusicTo(this.musicVolume, 1.8);
    }

    this._scheduleMusic();
    this._ambientEvents(dt);
  }

  _scheduleMusic() {
    const cfg = this.musicConfig;
    if (!cfg) return;
    const now = this.ctx.currentTime;
    if (this.nextNote < now - 1) this.nextNote = now + 0.05;
    if (this.nextNote === 0) this.nextNote = now + 0.1;

    let guard = 0;
    while (this.nextNote < now + 0.55 && guard++ < 40) {
      this._musicStep(this.step, this.nextNote, cfg);
      this.nextNote += 30 / cfg.tempo; // eighth note
      this.step++;
    }
  }

  _musicStep(step, t, cfg) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = cfg.chords[bar % cfg.chords.length];
    const base = cfg.base;

    if (s === 0) {
      const noteCount = chord.length;
      for (let i = 0; i < noteCount; i++) {
        const midi = base + chord[i] - 12 * (i === 0 ? 0 : 1) + (i === 0 ? 0 : 0);
        this._pad(midi + (i === 0 ? 0 : 0), t + i * 0.03, 4.6, i === 0 ? 0.045 : 0.03);
      }
      this._bass(base + chord[0] - 24, t, 0.075, 4.2);
      this.lastChord = chord;
    }

    // gentle arpeggio
    const arpSteps = [0, 3, 6, 8, 11, 14];
    if (arpSteps.includes(s) && this.rng() < 0.62) {
      const ci = Math.floor(this.rng() * chord.length);
      const octave = this.rng() < 0.3 ? 12 : 0;
      const midi = base + chord[ci] + octave + (s >= 8 ? 12 : 0);
      this._piano(midi, t, 1.5 + this.rng() * 0.9, 0.085 + this.rng() * 0.03, ci % 2 ? 0.35 : -0.35);
    }

    // sparse melody
    if ((s === 4 || s === 10 || s === 14) && this.rng() < 0.32) {
      const scale = cfg.scale;
      let midi = base + 24 + scale[Math.floor(this.rng() * scale.length)] + (this.rng() < 0.35 ? 12 : 0);
      if (Math.abs(midi - this.melodyMidi) > 7) midi = this.melodyMidi + (midi > this.melodyMidi ? 2 : -2);
      this.melodyMidi = midi;
      this._piano(midi, t + 0.02, 2.2, 0.065, 0.15);
      this._piano(midi + 12, t + 0.02, 1.1, 0.018, -0.3);
    }

    if (s === 15 && this.rng() < 0.18) {
      const midi = base + 36 + cfg.scale[Math.floor(this.rng() * cfg.scale.length)];
      this._bell(midi, t + 0.1, 0.035, 1.6);
    }
  }

  _piano(midi, t, dur, vel, pan = 0) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    g.connect(pn);
    pn.connect(this.musicBus);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    pn.connect(send);
    send.connect(this.reverbIn);

    const harmonics = [[1, 1, 'sine'], [2, 0.3, 'sine'], [3.99, 0.08, 'triangle']];
    for (const [mul, amp, type] of harmonics) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * mul, t);
      o.detune.value = (mul === 1 ? (this.rng() - 0.5) * 4 : 0);
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  _pad(midi, t, dur, vel) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 1.3);
    g.gain.setValueAtTime(vel, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.Q.value = 0.4;
    g.connect(lp);
    lp.connect(this.musicBus);
    const send = ctx.createGain();
    send.gain.value = 0.7;
    lp.connect(send);
    send.connect(this.reverbIn);

    for (const det of [-5, 5]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = 0.5;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  _bass(midi, t, vel, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _bell(midi, t, vel, dur) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const f = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.01;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    const send = ctx.createGain();
    send.gain.value = 0.8;
    g.connect(this.musicBus);
    g.connect(send);
    send.connect(this.reverbIn);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------- effects
  _sfxBlip({ f0 = 440, f1 = 660, dur = 0.18, type = 'sine', vel = 0.14, pan = 0, delay = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    o.connect(g);
    g.connect(pn);
    pn.connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = 0.35;
    pn.connect(send);
    send.connect(this.reverbIn);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _sfxNoise({ dur = 0.15, vel = 0.08, freq = 900, type = 'lowpass', q = 0.8 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  click() {
    this._sfxBlip({ f0: 720, f1: 860, dur: 0.09, vel: 0.05, type: 'sine' });
  }

  jump() {
    this._sfxBlip({ f0: 360, f1: 520, dur: 0.17, vel: 0.075, type: 'sine' });
    this._sfxBlip({ f0: 540, f1: 720, dur: 0.12, vel: 0.03, type: 'triangle', delay: 0.01 });
  }

  doubleJump() {
    this._sfxBlip({ f0: 520, f1: 780, dur: 0.22, vel: 0.07, type: 'sine' });
    this._sfxBlip({ f0: 780, f1: 1040, dur: 0.3, vel: 0.04, type: 'sine', delay: 0.045 });
  }

  land(soft = false) {
    this._sfxBlip({ f0: soft ? 130 : 150, f1: 60, dur: 0.16, vel: soft ? 0.045 : 0.08, type: 'sine' });
    this._sfxNoise({ dur: 0.1, vel: soft ? 0.018 : 0.032, freq: 500, type: 'lowpass' });
  }

  bounce() {
    this._sfxBlip({ f0: 260, f1: 540, dur: 0.3, vel: 0.09, type: 'sine' });
    this._sfxBlip({ f0: 620, f1: 980, dur: 0.34, vel: 0.04, type: 'triangle', delay: 0.06 });
    this._sfxNoise({ dur: 0.12, vel: 0.02, freq: 380, type: 'lowpass' });
  }

  collect(streak = 0) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const notes = [76, 79, 81, 84, 86, 88, 91, 93];
    const midi = notes[Math.min(notes.length - 1, streak % 8)];
    void scale;
    this._bell(midi, this.ctx ? this.ctx.currentTime : 0, 0.055, 1.1);
    this._sfxBlip({ f0: mtof(midi + 12), f1: mtof(midi + 19), dur: 0.26, vel: 0.03, type: 'sine' });
  }

  checkpoint() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((n, i) => {
      this._sfxBlip({ f0: mtof(67 + n), f1: mtof(67 + n), dur: 0.9, vel: 0.045, type: 'sine', delay: i * 0.09 });
    });
    void t;
  }

  gateOpen() {
    this._sfxBlip({ f0: 220, f1: 660, dur: 1.1, vel: 0.06, type: 'sine' });
    this._sfxBlip({ f0: 330, f1: 880, dur: 1.4, vel: 0.04, type: 'triangle', delay: 0.12 });
    this._bell(88, this.ctx ? this.ctx.currentTime + 0.3 : 0, 0.04, 2.4);
  }

  respawn() {
    this._sfxBlip({ f0: 420, f1: 200, dur: 0.45, vel: 0.04, type: 'sine' });
    this._sfxBlip({ f0: 280, f1: 140, dur: 0.5, vel: 0.03, type: 'sine', delay: 0.08 });
  }

  complete() {
    if (!this.ctx) return;
    const notes = [62, 66, 69, 74, 78, 81];
    notes.forEach((n, i) => {
      this._bell(n + 12, this.ctx.currentTime + i * 0.16, 0.045, 2.4);
      this._sfxBlip({ f0: mtof(n), f1: mtof(n), dur: 1.6, vel: 0.03, type: 'sine', delay: i * 0.16 });
    });
  }

  // ------------------------------------------------------------- ambience
  _ambientEvents(dt) {
    this._ensureAmbient();
    if (!this.ambientNodes) return;
    if (this.muted) return;

    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 5 + this.rng() * 11;
      if (this.ambience.birds > 0.05 && this.rng() < this.ambience.birds) this._chirp();
    }

    this.rainTimer -= dt;
    if (this.rainTimer <= 0) {
      this.rainTimer = 0.35 + this.rng() * 1.6;
      if (this.ambience.rain > 0.1) {
        this._sfxNoise({ dur: 0.05, vel: 0.006 * this.ambience.rain, freq: 3200 + this.rng() * 1400, type: 'highpass' });
      }
    }
  }

  _chirp() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + this.rng() * 0.2;
    const pn = ctx.createStereoPanner();
    pn.pan.value = (this.rng() - 0.5) * 1.2;
    pn.connect(this.ambientGain);
    const notes = 3 + Math.floor(this.rng() * 4);
    const base = 1900 + this.rng() * 900;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const st = t + i * (0.075 + this.rng() * 0.05);
      const f = base * (0.88 + this.rng() * 0.3) * (i % 2 ? 1.14 : 1);
      o.frequency.setValueAtTime(f, st);
      o.frequency.exponentialRampToValueAtTime(f * (1.15 + this.rng() * 0.1), st + 0.055);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.014, st + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.08);
      o.connect(g);
      g.connect(pn);
      o.start(st);
      o.stop(st + 0.1);
    }
  }
}