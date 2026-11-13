import { Game } from './game.js';
import { AudioEngine } from './audio.js';
import { LEVELS } from './levels.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'lumen-hollow-save-v1';

const startScreen = $('startScreen');
const pauseScreen = $('pauseScreen');
const settingsScreen = $('settingsScreen');
const completeScreen = $('completeScreen');
const hud = $('hud');
const touchControls = $('touchControls');
const levelCard = $('levelCard');
const levelName = $('levelName');
const levelChapter = $('levelChapter');
const toast = $('toast');
const countEl = $('count');
const totalEl = $('total');
const startBtn = $('startBtn');
const continueHint = $('continueHint');
const freshBtn = $('freshBtn');
const pauseBtn = $('pauseBtn');
const resumeBtn = $('resumeBtn');
const restartBtn = $('restartBtn');
const settingsBtn = $('settingsBtn');
const menuBtn = $('menuBtn');
const closeSettingsBtn = $('closeSettingsBtn');
const musicRange = $('musicRange');
const sfxRange = $('sfxRange');
const musicValue = $('musicValue');
const sfxValue = $('sfxValue');
const muteBtn = $('muteBtn');
const muteLabel = $('muteLabel');
const soundBtnStart = $('soundBtnStart');
const nextBtn = $('nextBtn');
const completeMenuBtn = $('completeMenuBtn');
const completeTitle = $('completeTitle');
const completeSub = $('completeSub');
const completeCount = $('completeCount');

// ------------------------------------------------------------------ save
const defaultSave = () => ({
  v: 1,
  unlocked: 0,
  current: 0,
  completed: [],
  stars: {},
  checkpoints: {},
  settings: { music: 0.62, sfx: 0.78, muted: false },
});

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    const base = defaultSave();
    const s = {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data.settings || {}) },
      stars: data.stars && typeof data.stars === 'object' ? data.stars : {},
      checkpoints: data.checkpoints && typeof data.checkpoints === 'object' ? data.checkpoints : {},
      completed: Array.isArray(data.completed) ? data.completed : [],
    };
    s.unlocked = clamp(Number(s.unlocked) || 0, 0, LEVELS.length - 1);
    s.current = clamp(Number(s.current) || 0, 0, LEVELS.length - 1);
    return s;
  } catch {
    return defaultSave();
  }
}

let save = loadSave();
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      /* storage may be unavailable; the game still plays */
    }
  }, 120);
}

function hasProgress() {
  if (save.unlocked > 0) return true;
  if (save.current > 0) return true;
  if (save.completed.length) return true;
  return Object.values(save.stars).some((arr) => Array.isArray(arr) && arr.length)
    || Object.values(save.checkpoints).some((v) => typeof v === 'number' && v >= 0);
}

// ------------------------------------------------------------------ audio
const audio = new AudioEngine();

function applyVolumes() {
  audio.setVolumes({ music: save.settings.music, sfx: save.settings.sfx });
  audio.setMuted(save.settings.muted);
}

let audioStarted = false;
function ensureAudio() {
  audio.init();
  if (!audioStarted) {
    audioStarted = true;
    applyVolumes();
  }
}

// ------------------------------------------------------------------ game
const game = new Game(document.getElementById('game'), audio, {
  onLevelStart(index) {
    save.current = index;
    persist();
    const def = LEVELS[index];
    levelName.textContent = def.name;
    levelChapter.textContent = def.chapter;
    showLevelCard();
    hideComplete();
    setPlayingUI(true);
    updateHud(game.collectedCount, game.starsTotal);
    clearTimeout(hintTimer);
    if (index === 0) {
      hintTimer = setTimeout(() => {
        if (game.mode === 'play' && game.levelIndex === 0 && game.collectedCount === 0) {
          showToast('hold jump to float · press again in the air to double-jump');
        }
      }, 4200);
    }
  },
  onHud(count, total) {
    updateHud(count, total);
  },
  onCollect(levelIndex, starId, count, total) {
    if (!Array.isArray(save.stars[levelIndex])) save.stars[levelIndex] = [];
    if (!save.stars[levelIndex].includes(starId)) save.stars[levelIndex].push(starId);
    updateHud(count, total, true);
    persist();
  },
  onCheckpoint(levelIndex, cpIndex) {
    save.checkpoints[levelIndex] = cpIndex;
    persist();
  },
  onGate() {
    persist();
  },
  onComplete(info) {
    onLevelComplete(info);
  },
  onToast(message) {
    showToast(message);
  },
});

// ------------------------------------------------------------------ UI helpers
function setOverlay(el, on) {
  el.classList.toggle('show', on);
  el.setAttribute('aria-hidden', on ? 'false' : 'true');
}

function setPlayingUI(on) {
  hud.classList.toggle('hidden', !on);
  if (!on) touchControls.classList.add('hidden');
  else updateTouchVisibility();
}

function updateTouchVisibility() {
  const touch = matchMedia('(pointer: coarse)').matches || document.body.classList.contains('touch-mode');
  if (game.mode === 'play' && touch) touchControls.classList.remove('hidden');
  else touchControls.classList.add('hidden');
}

function updateHud(count, total, pop = false) {
  countEl.textContent = String(count);
  totalEl.textContent = `/ ${total}`;
  if (pop) {
    hud.querySelector('.hud-pill').classList.remove('pop');
    void hud.querySelector('.hud-pill').offsetWidth;
    hud.querySelector('.hud-pill').classList.add('pop');
  }
}

let toastTimer = 0;
function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 450);
  }, 2600);
}

let cardTimer = 0;
let hintTimer = 0;
function showLevelCard() {
  levelCard.classList.remove('hidden');
  requestAnimationFrame(() => levelCard.classList.add('show'));
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => {
    levelCard.classList.remove('show');
    setTimeout(() => levelCard.classList.add('hidden'), 1300);
  }, 3200);
}

let completeTimer = 0;
let lastComplete = null;

function updateContinueUI() {
  const progress = hasProgress();
  continueHint.classList.toggle('hidden', !progress);
}

function goMenu() {
  clearTimeout(completeTimer);
  setOverlay(pauseScreen, false);
  setOverlay(settingsScreen, false);
  setOverlay(completeScreen, false);
  hideComplete();
  game.attract(save.current);
  game.mode = 'menu';
  setPlayingUI(false);
  lastComplete = null;
  updateContinueUI();
  setOverlay(startScreen, true);
  countEl.textContent = '0';
  game.input.axis = 0;
  game.input.jumpHeld = false;
}

function startGame(index, restore) {
  ensureAudio();
  audio.click();
  clearTimeout(completeTimer);
  const idx = clamp(index, 0, LEVELS.length - 1);
  if (!restore) {
    save.stars[idx] = [];
    save.checkpoints[idx] = -1;
  }
  save.current = idx;
  persist();
  hideComplete();
  setOverlay(startScreen, false);
  setOverlay(pauseScreen, false);
  setOverlay(settingsScreen, false);
  setOverlay(completeScreen, false);
  game.startLevel(idx, {
    restore,
    collected: restore ? save.stars[idx] || [] : [],
    checkpoint: restore ? (typeof save.checkpoints[idx] === 'number' ? save.checkpoints[idx] : -1) : -1,
  });
  setPlayingUI(true);
  updateContinueUI();
}

// ------------------------------------------------------------------ start
function onStart() {
  ensureAudio();
  audio.click();
  if (hasProgress()) {
    startGame(save.current, true);
  } else {
    startGame(0, false);
  }
}

startBtn.addEventListener('click', onStart);

freshBtn.addEventListener('click', () => {
  ensureAudio();
  audio.click();
  const settings = save.settings;
  save = defaultSave();
  save.settings = settings;
  persist();
  updateContinueUI();
  showToast('a fresh little journey');
});

soundBtnStart.addEventListener('click', () => {
  ensureAudio();
  audio.click();
  openSettings('start');
});

// ------------------------------------------------------------------ pause
function openPause() {
  if (game.mode !== 'play') return;
  game.pause();
  setOverlay(pauseScreen, true);
  setPlayingUI(false);
  audio.click();
}

function resumeGame() {
  if (game.mode !== 'paused') return;
  setOverlay(pauseScreen, false);
  setOverlay(settingsScreen, false);
  game.resume();
  setPlayingUI(true);
  audio.click();
}

pauseBtn.addEventListener('click', () => {
  ensureAudio();
  if (game.mode === 'play') openPause();
});
resumeBtn.addEventListener('click', resumeGame);

restartBtn.addEventListener('click', () => {
  ensureAudio();
  clearTimeout(completeTimer);
  setOverlay(pauseScreen, false);
  setOverlay(settingsScreen, false);
  game.restartLevel();
  save.stars[game.levelIndex] = [];
  save.checkpoints[game.levelIndex] = -1;
  persist();
  updateHud(0, game.starsTotal);
  setPlayingUI(true);
  audio.click();
});

menuBtn.addEventListener('click', () => {
  audio.click();
  goMenu();
});

// ------------------------------------------------------------------ settings
let settingsReturn = 'pause';

function syncSettingsUI() {
  const m = Math.round(save.settings.music * 100);
  const s = Math.round(save.settings.sfx * 100);
  musicRange.value = String(m);
  sfxRange.value = String(s);
  musicValue.textContent = String(m);
  sfxValue.textContent = String(s);
  muteBtn.classList.toggle('muted', save.settings.muted);
  muteBtn.setAttribute('aria-pressed', save.settings.muted ? 'true' : 'false');
  muteLabel.textContent = save.settings.muted ? 'sound is resting' : 'mute everything';
}

function openSettings(from) {
  settingsReturn = from;
  syncSettingsUI();
  setOverlay(settingsScreen, true);
  if (from === 'pause') setOverlay(pauseScreen, false);
  if (from === 'start') setOverlay(startScreen, true);
  audio.click();
}

function closeSettings() {
  setOverlay(settingsScreen, false);
  if (settingsReturn === 'pause' && game.mode === 'paused') setOverlay(pauseScreen, true);
  else if (settingsReturn === 'start') setOverlay(startScreen, true);
  audio.click();
}

settingsBtn.addEventListener('click', () => {
  ensureAudio();
  openSettings('pause');
});
closeSettingsBtn.addEventListener('click', closeSettings);

musicRange.addEventListener('input', () => {
  save.settings.music = Number(musicRange.value) / 100;
  musicValue.textContent = musicRange.value;
  audio.setVolumes({ music: save.settings.music });
  persist();
});
sfxRange.addEventListener('input', () => {
  save.settings.sfx = Number(sfxRange.value) / 100;
  sfxValue.textContent = sfxRange.value;
  audio.setVolumes({ sfx: save.settings.sfx });
  persist();
});
muteBtn.addEventListener('click', () => {
  save.settings.muted = !save.settings.muted;
  audio.setMuted(save.settings.muted);
  syncSettingsUI();
  persist();
  if (!save.settings.muted) audio.click();
});

// ------------------------------------------------------------------ complete
function onLevelComplete(info) {
  lastComplete = info;
  save.completed = Array.from(new Set([...save.completed, info.levelIndex]));
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length - 1, info.levelIndex + 1));
  save.stars[info.levelIndex] = game.stars.filter((s) => s.collected).map((s) => s.id);
  if (!info.isLast) save.current = info.levelIndex + 1;
  persist();

  setPlayingUI(false);
  setOverlay(completeScreen, false);
  completeTitle.textContent = info.isLast ? 'a soft little ending' : 'level complete';
  completeSub.textContent = info.isLast
    ? 'the hollow is quiet and warm. thank you for wandering.'
    : 'the fireflies settle around you';
  completeCount.textContent = `${info.collected} / ${info.total}`;
  nextBtn.textContent = info.isLast ? 'back to the meadow' : 'wander onward';
  completeMenuBtn.classList.toggle('hidden', info.isLast);

  clearTimeout(completeTimer);
  completeTimer = setTimeout(() => {
    setOverlay(completeScreen, true);
    audio.click();
  }, 900);
}

nextBtn.addEventListener('click', () => {
  if (!lastComplete) return;
  if (lastComplete.isLast) {
    goMenu();
    return;
  }
  startGame(lastComplete.levelIndex + 1, false);
  lastComplete = null;
});

completeMenuBtn.addEventListener('click', goMenu);

function hideComplete() {
  setOverlay(completeScreen, false);
}

// ------------------------------------------------------------------ input
const keys = new Set();
let touchLeft = false;
let touchRight = false;

function refreshAxis() {
  const left = keys.has('ArrowLeft') || keys.has('KeyA') || touchLeft;
  const right = keys.has('ArrowRight') || keys.has('KeyD') || touchRight;
  game.setAxis((right ? 1 : 0) - (left ? 1 : 0));
}

function isJumpKey(code) {
  return code === 'Space' || code === 'ArrowUp' || code === 'KeyW' || code === 'KeyZ' || code === 'KeyJ';
}

window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();

  if (e.code === 'Enter' && startScreen.classList.contains('show') && !settingsScreen.classList.contains('show')) {
    onStart();
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (settingsScreen.classList.contains('show')) {
      closeSettings();
    } else if (game.mode === 'play') {
      openPause();
    } else if (game.mode === 'paused') {
      resumeGame();
    }
    return;
  }
  if (e.code === 'KeyM') {
    ensureAudio();
    save.settings.muted = !save.settings.muted;
    audio.setMuted(save.settings.muted);
    syncSettingsUI();
    persist();
    if (game.mode === 'play') showToast(save.settings.muted ? 'sound is resting' : 'sound returns');
    return;
  }

  if (game.mode !== 'play') return;
  if (e.repeat) return;

  keys.add(e.code);
  if (isJumpKey(e.code)) {
    ensureAudio();
    game.queueJump();
    game.setJumpHeld(true);
  }
  refreshAxis();
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (isJumpKey(e.code)) game.setJumpHeld(false);
  refreshAxis();
});

window.addEventListener('blur', () => {
  keys.clear();
  touchLeft = touchRight = false;
  game.setAxis(0);
  game.setJumpHeld(false);
  if (game.mode === 'play') openPause();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.mode === 'play') openPause();
  }
});

// touch
function bindTouchButton(btn) {
  const act = btn.dataset.act;
  const press = (e) => {
    e.preventDefault();
    ensureAudio();
    btn.classList.add('active');
    if (btn.setPointerCapture && e.pointerId !== undefined) {
      try { btn.setPointerCapture(e.pointerId); } catch { /* noop */ }
    }
    if (act === 'left') {
      touchLeft = true;
      refreshAxis();
    } else if (act === 'right') {
      touchRight = true;
      refreshAxis();
    } else if (act === 'jump') {
      game.queueJump();
      game.setJumpHeld(true);
    }
  };
  const release = (e) => {
    if (e) e.preventDefault();
    btn.classList.remove('active');
    if (act === 'left') {
      touchLeft = false;
      refreshAxis();
    } else if (act === 'right') {
      touchRight = false;
      refreshAxis();
    } else if (act === 'jump') {
      game.setJumpHeld(false);
    }
  };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
document.querySelectorAll('.touch-btn').forEach(bindTouchButton);

document.addEventListener('touchstart', () => {
  document.body.classList.add('touch-mode');
  if (game.mode === 'play') updateTouchVisibility();
}, { passive: true, once: true });

// click chime for UI
document.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('pointerdown', () => ensureAudio(), { passive: true });
});

// pause automatically if the page loses focus while playing
window.addEventListener('pagehide', () => {
  persist();
});

// resume the audio context on any gesture
window.addEventListener('pointerdown', ensureAudio, { once: true });
window.addEventListener('keydown', ensureAudio, { once: true });

// ------------------------------------------------------------------ boot
function boot() {
  applyVolumes();
  syncSettingsUI();
  updateContinueUI();
  setPlayingUI(false);
  updateHud(0, LEVELS[0].stars.length);
  totalEl.textContent = `/ ${LEVELS[0].stars.length}`;

  // preload / init audio only after a gesture; the menu music starts then.
  const savedLevel = save.current;
  game.attract(savedLevel);
  game.mode = 'menu';
  startBtn.textContent = 'tap to start';

  // tiny debug handle for tests and tinkering
  window.__lumen = {
    game,
    audio,
    get save() { return save; },
    levels: LEVELS,
    startLevel: (i) => startGame(i, false),
    gotoMenu: goMenu,
    state: () => game.debugState(),
  };
}

boot();

// keep the sliders in sync if settings change elsewhere
window.addEventListener('storage', (e) => {
  if (e.key === SAVE_KEY) {
    save = loadSave();
    applyVolumes();
    syncSettingsUI();
    updateContinueUI();
  }
});