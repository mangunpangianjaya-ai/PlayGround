// ============================================================
// IRONFANG — procedural audio: orchestral score + SFX
// ============================================================
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.musicMode = null;
    this.intensity = 1;
    this.bar = 0;
    this.nextBar = 0;
    this.musicTimer = null;
    this.vol = { master: 0.8, music: 0.7, sfx: 0.85 };
    this.noiseBuffer = null;
    this.sfxLast = {};
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.vol.master;
    this.master.connect(ctx.destination);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 20;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.2;
    this.comp.connect(this.master);

    // simple generated reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4, 2.8);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.28;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.comp);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.vol.music;
    this.musicBus.connect(this.comp);
    this.musicBus.connect(this.reverb);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.vol.sfx;
    this.sfxBus.connect(this.comp);

    this.noiseBuffer = this.makeNoise(2.0);
    this.ready = true;
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeImpulse(seconds, decay) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolumes(v) {
    this.vol = { ...this.vol, ...v };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, now, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music, now, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, now, 0.05);
  }

  // ---------------- music ----------------
  startMusic(mode = 'hub') {
    this.init();
    if (!this.ctx) return;
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    this.intensity = 1;
    this.bar = 0;
    this.nextBar = this.ctx.currentTime + 0.12;
    if (!this.musicTimer) this.musicTimer = setInterval(() => this.schedule(), 120);
  }

  stopMusic() {
    this.musicMode = null;
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  setIntensity(n) {
    this.intensity = n;
  }

  schedule() {
    if (!this.ctx || !this.musicMode) return;
    if (this.ctx.state === 'suspended') return;
    const lookahead = this.ctx.currentTime + 1.2;
    let guard = 0;
    while (this.nextBar < lookahead && guard++ < 8) {
      const battle = this.musicMode === 'battle';
      const beat = battle ? 0.56 : 0.82;
      this.scheduleBar(this.nextBar, beat, battle, this.bar);
      this.nextBar += beat * 4;
      this.bar++;
    }
  }

  scheduleBar(t, beat, battle, bar) {
    const roots = battle ? [50, 46, 41, 48] : [50, 46, 43, 45];
    const minor = [true, false, false, true];
    const root = roots[bar % roots.length];
    const isMinor = minor[bar % roots.length];
    const chord = [0, isMinor ? 3 : 4, 7];
    const hi = this.intensity > 1;
    const barDur = beat * 4;

    // -- cello / string pad --
    for (let i = 0; i < 3; i++) {
      const n = midi(root + 12 + chord[i]);
      this.pad(t, n, barDur * 0.98, battle ? 0.028 : 0.022, root + 12);
    }
    if (battle) {
      // high string sustain on phrase peaks
      if (bar % 4 === 2 || hi) this.pad(t, midi(root + 24 + chord[2]), barDur * 0.9, hi ? 0.026 : 0.016, root + 24);
    }

    // -- low bass --
    for (const b of [0, 1.5, 2.5]) {
      this.pluck(t + b * beat, midi(root - 12), beat * 0.9, battle ? 0.09 : 0.05, 'triangle');
    }

    // -- arpeggio --
    const arpNotes = [0, 2, 1, 2, 1, 2, 0, 1];
    const arpCount = battle ? 8 : 4;
    for (let i = 0; i < arpCount; i++) {
      const at = t + (barDur / arpCount) * i;
      const deg = arpNotes[i % arpNotes.length];
      const oct = i % 4 === 0 ? 24 : 12;
      this.pluck(at, midi(root + oct + chord[deg]), (barDur / arpCount) * 0.9, battle ? 0.033 : 0.026, 'triangle', true);
    }

    // -- melody (battle) --
    if (battle) {
      const motif = [7, 10, 12, 10, 7, 5, 3, 7];
      const count = hi ? 8 : 4;
      for (let i = 0; i < count; i++) {
        if (!hi && i % 2 === 1) continue;
        const at = t + (barDur / count) * i;
        const note = midi(root + 12 + motif[(i + bar) % motif.length]);
        this.brass(at, note, (barDur / count) * 0.92, hi ? 0.05 : 0.032);
      }
    }

    // -- percussion --
    if (battle) {
      this.kick(t, 0.5);
      this.kick(t + beat * 2, 0.38);
      if (hi) {
        this.kick(t + beat * 3, 0.34);
        this.tom(t + beat * 1.5, 0.18, 110);
        this.tom(t + beat * 3.5, 0.16, 88);
      }
      for (let i = 0; i < 8; i++) this.shaker(t + (barDur / 8) * i, i % 2 === 0 ? 0.035 : 0.022);
      if (bar % 4 === 0) this.tom(t, hi ? 0.32 : 0.22, 70);
    } else {
      // hub: soft bell + wind swell
      if (bar % 2 === 0) this.bell(t + beat * 2.5, midi(root + 24 + chord[2]), 0.03);
      this.windSwell(t, barDur, 0.014);
    }
  }

  pad(t, freq, dur, gain, detuneBase) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.5);
    g.gain.setValueAtTime(gain, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.linearRampToValueAtTime(1400, t + dur * 0.5);
    filter.frequency.linearRampToValueAtTime(800, t + dur);
    filter.Q.value = 0.6;
    g.connect(filter); filter.connect(this.musicBus);
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = 0.5;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + 0.6);
    }
  }

  pluck(t, freq, dur, gain, type = 'triangle', delay = false) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicBus);
    if (delay) {
      const d = ctx.createDelay(0.5);
      d.delayTime.value = 0.19;
      const dg = ctx.createGain(); dg.gain.value = 0.28;
      g.connect(d); d.connect(dg); dg.connect(this.musicBus);
    }
    o.start(t); o.stop(t + dur + 0.05);
  }

  brass(t, freq, dur, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.linearRampToValueAtTime(2400, t + 0.1);
    filter.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.06);
    g.gain.setValueAtTime(gain * 0.8, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    o.connect(filter); filter.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.2);
  }

  bell(t, freq, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.01;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g); o2.connect(g); g.connect(this.musicBus); g.connect(this.reverb);
    o.start(t); o.stop(t + 2.3); o2.start(t); o2.stop(t + 2.3);
  }

  windSwell(t, dur, gain) {
    if (!this.noiseBuffer) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.5;
    f.frequency.linearRampToValueAtTime(900, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t); src.stop(t + dur + 0.1);
  }

  kick(t, gain = 0.4) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.32);
    this.noiseHit(t, 0.08, gain * 0.35, 'lowpass', 400);
  }

  tom(t, gain, freq) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.27);
  }

  shaker(t, gain) {
    if (!this.noiseBuffer) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 5000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t); src.stop(t + 0.06);
  }

  // ---------------- sfx helpers ----------------
  noiseHit(t, dur, gain, type = 'lowpass', freq = 800, q = 1) {
    if (!this.noiseBuffer || !this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    return f;
  }

  tone(t, type, f0, f1, dur, gain, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); out = p;
    }
    o.connect(g); out.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  guard(name, ms = 40) {
    const now = performance.now();
    if (this.sfxLast[name] && now - this.sfxLast[name] < ms) return false;
    this.sfxLast[name] = now;
    return true;
  }

  // ---------------- public sfx ----------------
  swing(weapon = 'greatsword', heavy = false) {
    this.init(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const heavyMul = heavy ? 1 : 0;
    const filter = this.noiseHit(t, 0.16 + heavyMul * 0.12, 0.16 + heavyMul * 0.12, 'bandpass', 700, 1.2);
    if (filter) {
      filter.frequency.setValueAtTime(500, t);
      filter.frequency.exponentialRampToValueAtTime(3200 - heavyMul * 1200, t + 0.14);
    }
    this.tone(t, weapon === 'greatsword' ? 'sawtooth' : 'triangle', 220, 80, 0.18 + heavyMul * 0.15, 0.05);
  }

  impact(power = 1, weak = false, pan = 0) {
    this.init(); if (!this.ctx) return;
    if (!this.guard('impact', 18)) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'sine', 130 + power * 40, 35, 0.16 + power * 0.06, 0.22 * power, pan);
    this.noiseHit(t, 0.09, 0.2 * power, 'lowpass', 900 + power * 300);
    if (weak) {
      this.tone(t + 0.01, 'triangle', 1500, 900, 0.1, 0.06, pan);
      this.noiseHit(t, 0.06, 0.1, 'highpass', 2500);
    }
  }

  partBreak() {
    this.init(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'triangle', 1800, 700, 0.25, 0.12);
    this.tone(t + 0.04, 'sine', 2400, 1200, 0.3, 0.08);
    this.noiseHit(t, 0.3, 0.2, 'bandpass', 2200, 2);
  }

  roar(big = false) {
    this.init(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = big ? 85 : 110;
    const dur = big ? 1.5 : 1.15;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.6, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 17;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 9;
    lfo.connect(lfoGain); lfoGain.connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(280, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.12);
    g.gain.setValueAtTime(0.26, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.sfxBus); g.connect(this.reverb);
    o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
    this.noiseHit(t, dur, 0.16, 'bandpass', 500, 0.7);
  }

  dodge() {
    this.init(); if (!this.ctx) return;
    if (!this.guard('dodge', 60)) return;
    const t = this.ctx.currentTime;
    const f = this.noiseHit(t, 0.22, 0.12, 'bandpass', 1100, 0.8);
    if (f) { f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.2); }
    this.tone(t, 'sine', 300, 120, 0.2, 0.04);
  }

  potion() {
    this.init(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [660, 880, 1320].forEach((f, i) => this.tone(t + i * 0.11, 'sine', f, f * 1.02, 0.18, 0.055));
  }

  fire() {
    this.init(); if (!this.ctx) return;
    if (!this.guard('fire', 70)) return;
    const t = this.ctx.currentTime;
    const f = this.noiseHit(t, 0.6, 0.18, 'lowpass', 900, 0.6);
    if (f) { f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(350, t + 0.5); }
  }

  ice() {
    this.init(); if (!this.ctx) return;
    if (!this.guard('ice', 70)) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'triangle', 1800, 2600, 0.25, 0.055);
    this.tone(t + 0.06, 'sine', 2800, 3400, 0.18, 0.04);
    this.noiseHit(t, 0.2, 0.08, 'highpass', 4200);
  }

  ui() {
    this.init(); if (!this.ctx) return;
    if (!this.guard('ui', 35)) return;
    this.tone(this.ctx.currentTime, 'sine', 720, 620, 0.06, 0.035);
  }

  notify() {
    this.init(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'triangle', 520, 520, 0.09, 0.05);
    this.tone(t + 0.1, 'triangle', 780, 780, 0.12, 0.045);
  }

  charge(level) {
    this.init(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = [330, 440, 550, 660][Math.min(3, level)];
    this.tone(t, 'sine', f, f * 1.5, 0.16, 0.07);
    this.tone(t, 'triangle', f * 2, f * 2, 0.12, 0.025);
  }

  victory() {
    this.init(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [62, 66, 69, 74];
    notes.forEach((n, i) => {
      this.brass(t + i * 0.18, midi(n), 0.7, 0.09);
      this.tone(t + i * 0.18, 'sine', midi(n + 12), midi(n + 12), 0.6, 0.03);
    });
    this.brass(t + 0.75, midi(50), 1.6, 0.1);
    this.brass(t + 0.75, midi(62), 1.6, 0.07);
    this.tone(t + 0.75, 'sine', 60, 36, 1.2, 0.16);
  }

  defeat() {
    this.init(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [57, 53, 50, 45];
    notes.forEach((n, i) => {
      this.brass(t + i * 0.32, midi(n), 1.0, 0.07);
      this.tone(t + i * 0.32, 'sine', midi(n - 12), midi(n - 12), 0.9, 0.05);
    });
  }

  monsterStep(pan = 0, heavy = false) {
    this.init(); if (!this.ctx) return;
    if (!this.guard('step', heavy ? 220 : 110)) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'sine', heavy ? 62 : 90, 30, 0.16, heavy ? 0.09 : 0.045, pan);
    this.noiseHit(t, 0.07, heavy ? 0.06 : 0.025, 'lowpass', 260);
  }

  whoosh() {
    this.init(); if (!this.ctx) return;
    if (!this.guard('whoosh', 120)) return;
    const t = this.ctx.currentTime;
    const f = this.noiseHit(t, 0.4, 0.09, 'bandpass', 300, 1.5);
    if (f) { f.frequency.linearRampToValueAtTime(900, t + 0.35); }
  }
}
