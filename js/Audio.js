/* ============================================================
   Audio — fully procedural WebAudio SFX, ambience and generative
   music. No external samples, so the game boots with zero assets.
   ============================================================ */
import { rand, pick } from './Utils.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

const ZONE_MUSIC = {
  meadow: { root: 57, chords: [[0, 4, 7, 11], [-3, 2, 5, 9], [5, 9, 12, 16], [3, 7, 10, 14]], tempo: 1.65, arp: [0, 7, 12, 16, 19, 16, 12, 7] },
  ruins: { root: 52, chords: [[0, 3, 7, 10], [-2, 3, 5, 10], [5, 8, 12, 15], [3, 7, 10, 14]], tempo: 1.95, arp: [0, 7, 10, 12, 15, 12, 10, 7] },
  crystal: { root: 55, chords: [[0, 3, 7, 14], [-4, 0, 5, 12], [3, 7, 10, 15], [-2, 3, 7, 10]], tempo: 2.25, arp: [0, 12, 7, 15, 19, 15, 7, 12] },
  sky: { root: 60, chords: [[0, 4, 7, 12], [-5, 0, 4, 9], [2, 5, 9, 12], [0, 4, 7, 11]], tempo: 1.55, arp: [0, 7, 12, 16, 19, 24, 19, 16] },
};

export class AudioManager {
  constructor(settings = {}) {
    this.ctx = null;
    this.ready = false;
    this.masterVolume = settings.master ?? 0.8;
    this.musicVolume = settings.music ?? 0.55;
    this.sfxVolume = settings.sfx ?? 0.9;
    this.muted = false;
    this.zone = 'meadow';
    this.musicTimer = null;
    this.musicStart = 0;
    this.nextNoteTime = 0;
    this.step = 0;
    this.ambientNodes = [];
    this.lastStep = 0;
    this._musicGain = null;
    this._sfxGain = null;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* will retry on gesture */ }
    }

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.masterVolume;
    this.master.connect(this.ctx.destination);

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.22;
    this.compressor.connect(this.master);

    // procedural cathedral-ish reverb
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(2.6, 2.1);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.22;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.compressor);

    this._sfxGain = this.ctx.createGain();
    this._sfxGain.gain.value = this.sfxVolume;
    this._sfxGain.connect(this.compressor);
    this._sfxGain.connect(this.reverb);

    this._musicGain = this.ctx.createGain();
    this._musicGain.gain.value = 0;
    this._musicGain.connect(this.compressor);
    this._musicGain.connect(this.reverb);

    this.noiseBuffer = this._makeNoise(2.0);
    this.ready = true;

    this.startAmbience();
    this.startMusic('meadow');
    // gentle fade-in
    const t = this.ctx.currentTime;
    this._musicGain.gain.cancelScheduledValues(t);
    this._musicGain.gain.setValueAtTime(0.0001, t);
    this._musicGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, this.musicVolume * 0.25), t + 3.5);
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _makeImpulse(duration, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buffer = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 + 0.3 * Math.sin(i * 0.003));
      }
    }
    return buffer;
  }

  setVolumes({ master, music, sfx }) {
    if (master !== undefined) this.masterVolume = master;
    if (music !== undefined) this.musicVolume = music;
    if (sfx !== undefined) this.sfxVolume = sfx;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, t, 0.08);
    this._sfxGain.gain.setTargetAtTime(this.sfxVolume, t, 0.08);
    this._musicGain.gain.setTargetAtTime(this.muted ? 0 : this.musicVolume * 0.25, t, 0.3);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.setVolumes({});
    return this.muted;
  }

  /* ---------------- sound effects ---------------- */
  _env(gainNode, t, attack, hold, release, peak) {
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gainNode.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }

  tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.3, gain = 0.12, attack = 0.008, hold = 0.02, detune = 0, pan = 0, wet = 0.25 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + attack + hold + dur);
    osc.detune.value = detune;
    p.pan.value = pan;
    this._env(g, t, attack, hold, dur, gain);
    osc.connect(g); g.connect(p); p.connect(this._sfxGain);
    if (wet > 0) {
      const send = this.ctx.createGain(); send.gain.value = wet;
      p.connect(send); send.connect(this.reverb);
    }
    osc.start(t);
    osc.stop(t + attack + hold + dur + 0.05);
  }

  noise({ dur = 0.3, gain = 0.2, filter = 'bandpass', freq = 1200, freqEnd = null, q = 1, attack = 0.005, pan = 0, wet = 0.15 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    this._env(g, t, attack, 0.01, dur, gain);
    src.connect(f); f.connect(g); g.connect(p); p.connect(this._sfxGain);
    if (wet > 0) {
      const send = this.ctx.createGain(); send.gain.value = wet;
      p.connect(send); send.connect(this.reverb);
    }
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  sfx(name, opts = {}) {
    if (!this.ready) return;
    switch (name) {
      case 'jump':
        this.tone({ freq: 280, freqEnd: 620, type: 'sine', dur: 0.18, gain: 0.09, wet: 0.2 });
        this.noise({ dur: 0.16, gain: 0.03, filter: 'highpass', freq: 900, freqEnd: 2600 });
        break;
      case 'doubleJump':
        this.tone({ freq: 520, freqEnd: 1050, type: 'triangle', dur: 0.22, gain: 0.07, wet: 0.4 });
        this.tone({ freq: 780, freqEnd: 1560, type: 'sine', dur: 0.18, gain: 0.045, wet: 0.5 });
        break;
      case 'land':
        this.noise({ dur: 0.18, gain: 0.12, filter: 'lowpass', freq: 420, freqEnd: 120, q: 0.7, wet: 0.08 });
        this.tone({ freq: 110, freqEnd: 55, type: 'sine', dur: 0.16, gain: 0.13, wet: 0.05 });
        break;
      case 'dash':
        this.noise({ dur: 0.32, gain: 0.12, filter: 'bandpass', freq: 380, freqEnd: 2800, q: 1.6, wet: 0.15 });
        this.tone({ freq: 220, freqEnd: 620, type: 'sawtooth', dur: 0.16, gain: 0.025, wet: 0.2 });
        break;
      case 'attack':
      case 'attack2':
      case 'attack3': {
        const base = name === 'attack' ? 1500 : name === 'attack2' ? 1900 : 2400;
        this.noise({ dur: 0.16, gain: 0.1, filter: 'bandpass', freq: base, freqEnd: base * 0.3, q: 1.2, wet: 0.2 });
        this.tone({ freq: base * 0.22, freqEnd: base * 0.1, type: 'triangle', dur: 0.12, gain: 0.035, wet: 0.3 });
        break;
      }
      case 'hit':
        this.noise({ dur: 0.12, gain: 0.2, filter: 'lowpass', freq: 1800, freqEnd: 260, q: 0.8, wet: 0.1 });
        this.tone({ freq: 150, freqEnd: 70, type: 'square', dur: 0.09, gain: 0.05, wet: 0.1 });
        break;
      case 'enemyHit':
        this.tone({ freq: 360, freqEnd: 180, type: 'triangle', dur: 0.1, gain: 0.07, wet: 0.2 });
        this.noise({ dur: 0.08, gain: 0.08, filter: 'bandpass', freq: 1600, q: 1.2 });
        break;
      case 'enemyDie':
        this.tone({ freq: 320, freqEnd: 90, type: 'sawtooth', dur: 0.4, gain: 0.06, wet: 0.4 });
        this.noise({ dur: 0.35, gain: 0.12, filter: 'lowpass', freq: 2400, freqEnd: 180, wet: 0.3 });
        break;
      case 'hurt':
        this.tone({ freq: 220, freqEnd: 60, type: 'sawtooth', dur: 0.32, gain: 0.1, wet: 0.25 });
        this.noise({ dur: 0.2, gain: 0.1, filter: 'lowpass', freq: 1200, freqEnd: 200, wet: 0.1 });
        break;
      case 'collect':
        this.tone({ freq: NOTE(88), type: 'sine', dur: 0.38, gain: 0.07, wet: 0.55 });
        setTimeout(() => this.tone({ freq: NOTE(95), type: 'sine', dur: 0.5, gain: 0.055, wet: 0.65 }), 65);
        setTimeout(() => this.tone({ freq: NOTE(100), type: 'triangle', dur: 0.45, gain: 0.03, wet: 0.7 }), 130);
        break;
      case 'checkpoint':
        [60, 64, 67, 72].forEach((n, i) => setTimeout(() => this.tone({ freq: NOTE(n), type: 'sine', dur: 1.1, gain: 0.05, attack: 0.06, wet: 0.7 }), i * 90));
        break;
      case 'heal':
        [72, 76, 79].forEach((n, i) => setTimeout(() => this.tone({ freq: NOTE(n), type: 'sine', dur: 0.7, gain: 0.05, wet: 0.6 }), i * 70));
        break;
      case 'portal':
        this.tone({ freq: 180, freqEnd: 880, type: 'sine', dur: 1.2, gain: 0.05, attack: 0.2, wet: 0.8 });
        this.noise({ dur: 1.1, gain: 0.06, filter: 'bandpass', freq: 400, freqEnd: 4200, q: 2, attack: 0.25, wet: 0.7 });
        break;
      case 'bossRoar':
        this.tone({ freq: 72, freqEnd: 38, type: 'sawtooth', dur: 1.6, gain: 0.14, attack: 0.08, wet: 0.45 });
        this.tone({ freq: 96, freqEnd: 45, type: 'square', dur: 1.4, gain: 0.06, attack: 0.1, wet: 0.4 });
        this.noise({ dur: 1.3, gain: 0.09, filter: 'lowpass', freq: 600, freqEnd: 120, attack: 0.05, wet: 0.3 });
        break;
      case 'bossHit':
        this.noise({ dur: 0.22, gain: 0.16, filter: 'lowpass', freq: 2400, freqEnd: 160, q: 0.9, wet: 0.25 });
        this.tone({ freq: 110, freqEnd: 52, type: 'square', dur: 0.18, gain: 0.05, wet: 0.2 });
        break;
      case 'slam':
        this.tone({ freq: 80, freqEnd: 28, type: 'sine', dur: 0.6, gain: 0.22, wet: 0.3 });
        this.noise({ dur: 0.5, gain: 0.18, filter: 'lowpass', freq: 1400, freqEnd: 90, wet: 0.25 });
        break;
      case 'shockwave':
        this.noise({ dur: 0.55, gain: 0.12, filter: 'bandpass', freq: 220, freqEnd: 1200, q: 0.7, wet: 0.35 });
        break;
      case 'shoot':
        this.tone({ freq: 900, freqEnd: 280, type: 'triangle', dur: 0.22, gain: 0.055, wet: 0.4 });
        this.noise({ dur: 0.12, gain: 0.04, filter: 'highpass', freq: 1800 });
        break;
      case 'death':
        this.tone({ freq: 180, freqEnd: 40, type: 'sawtooth', dur: 1.4, gain: 0.1, wet: 0.6 });
        this.noise({ dur: 1.2, gain: 0.09, filter: 'lowpass', freq: 1000, freqEnd: 80, wet: 0.4 });
        break;
      case 'victory':
        [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => setTimeout(() => this.tone({ freq: NOTE(n), type: 'sine', dur: 1.8, gain: 0.055, attack: 0.04, wet: 0.8 }), i * 160));
        break;
      case 'ui':
        this.tone({ freq: 720, freqEnd: 980, type: 'sine', dur: 0.09, gain: 0.035, wet: 0.2 });
        break;
      case 'step':
        this.noise({ dur: 0.07, gain: 0.022 + Math.random() * 0.012, filter: 'lowpass', freq: 500 + Math.random() * 300, q: 0.8, wet: 0.02 });
        break;
      case 'splash':
        this.noise({ dur: 0.2, gain: 0.06, filter: 'bandpass', freq: 1400, freqEnd: 700, q: 0.8, wet: 0.15 });
        break;
      default:
        break;
    }
  }

  /* ---------------- generative music ---------------- */
  startMusic(zone) {
    if (!this.ready) return;
    if (this.musicTimer) return;
    this.zone = zone;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.15;
    this.musicTimer = setInterval(() => this._scheduleMusic(), 180);
    this._scheduleMusic();
  }

  setZone(zone) {
    if (this.zone === zone) return;
    this.zone = zone;
    // A gentle harmonic lift when entering a new realm.
    if (this.ready) {
      this.tone({ freq: NOTE(ZONE_MUSIC[zone].root + 12), type: 'sine', dur: 1.6, gain: 0.03, attack: 0.2, wet: 0.8 });
    }
  }

  _scheduleMusic() {
    if (!this.ready || !this._musicGain) return;
    const conf = ZONE_MUSIC[this.zone] || ZONE_MUSIC.meadow;
    const stepDur = conf.tempo / 2;
    while (this.nextNoteTime < this.ctx.currentTime + 0.8) {
      const step = this.step;
      const chordIndex = Math.floor(step / 8) % conf.chords.length;
      const chord = conf.chords[chordIndex];
      const time = this.nextNoteTime;

      // Pad bloom on each chord.
      if (step % 8 === 0) {
        chord.forEach((semi, ci) => {
          this._musicNote(NOTE(conf.root + semi), time + ci * 0.08, stepDur * 7.8, 0.035, 'sine', 0.9, 0.35);
          if (ci === 0) this._musicNote(NOTE(conf.root + semi - 12), time, stepDur * 8, 0.03, 'triangle', 0.8, 0.1);
        });
      }

      // Airy arpeggio.
      const arpNote = conf.arp[step % conf.arp.length];
      const arpGain = 0.014 + (step % 4 === 0 ? 0.008 : 0);
      this._musicNote(NOTE(conf.root + 12 + arpNote), time, stepDur * 2.2, arpGain, 'sine', 0.7, 0.6);

      // Sub pulse / soft heartbeat every two beats.
      if (step % 4 === 0) {
        this._musicNote(NOTE(conf.root - 24), time, stepDur * 1.4, 0.045, 'sine', 0.9, 0.05);
      }

      this.nextNoteTime += stepDur;
      this.step++;
    }
  }

  _musicNote(freq, time, dur, gain, type = 'sine', attackRatio = 0.2, wet = 0.4) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'sine' ? 3200 : 1400, time);
    filter.Q.value = 0.4;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    osc.detune.value = rand(-4, 4);
    const attack = Math.max(0.01, dur * attackRatio);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(filter); filter.connect(g); g.connect(this._musicGain);
    if (wet > 0) {
      const send = this.ctx.createGain(); send.gain.value = wet;
      g.connect(send); send.connect(this.reverb);
    }
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  /* ---------------- ambience ---------------- */
  startAmbience() {
    if (!this.ready) return;
    // Looping wind bed.
    const src = this.ctx.createBufferSource();
    src.buffer = this._makeNoise(4);
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 380; filter.Q.value = 0.4;
    const gain = this.ctx.createGain(); gain.gain.value = 0.018;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain); lfoGain.connect(gain.gain);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start();
    lfo.start();
    this.ambientNodes.push(src, lfo);

    // Occasional bird calls / crystal chimes.
    this._ambientTimer = setInterval(() => {
      if (!this.ready || this.muted || document.hidden) return;
      if (Math.random() > 0.55) return;
      if (this.zone === 'meadow' || this.zone === 'sky') {
        const base = rand(1400, 2300);
        this.tone({ freq: base, freqEnd: base * rand(1.05, 1.4), type: 'sine', dur: 0.12, gain: 0.012, attack: 0.01, pan: rand(-0.7, 0.7), wet: 0.6 });
        setTimeout(() => this.tone({ freq: base * 1.15, freqEnd: base * 0.9, type: 'sine', dur: 0.1, gain: 0.008, wet: 0.6 }), 140);
      } else if (this.zone === 'crystal') {
        this.tone({ freq: rand(1600, 2600), type: 'sine', dur: 1.4, gain: 0.008, attack: 0.1, wet: 0.9 });
      } else if (this.zone === 'ruins') {
        this.tone({ freq: rand(260, 420), type: 'triangle', dur: 1.8, gain: 0.008, attack: 0.3, wet: 0.8 });
      }
    }, 3300);
  }

  setPaused(paused) {
    if (!this.ready || !this._musicGain) return;
    const target = this.muted ? 0 : this.musicVolume * (paused ? 0.08 : 0.25);
    this._musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  }
}
