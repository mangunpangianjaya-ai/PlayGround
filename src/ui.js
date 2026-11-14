// ============================================================
// IRONFANG — menus, HUD, damage numbers
// ============================================================
import { WEAPONS, WEAPON_ORDER, QUESTS, MATERIALS, HUNT_POTIONS, upgradeCost, canAfford, matColor } from './data.js';

const ICON = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const WEAPON_ART = {
  greatsword: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round">
    <path d="M41 10 59 10 64 24 62 62 50 74 38 62 36 24Z"/>
    <path d="M38 62 62 62M50 74 50 90M43 90 57 90"/>
    <path d="M42 27 50 38 58 27M50 38 50 58"/>
    <path d="M31 67 38 62M69 67 62 62"/>
  </svg>`,
  dualblades: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round">
    <path d="M18 18 38 40 32 48 12 28Z"/>
    <path d="M18 18 24 34 30 40"/>
    <path d="M82 18 62 40 68 48 88 28Z"/>
    <path d="M82 18 76 34 70 40"/>
    <path d="M24 76 42 58 50 66 32 84 22 86Z"/>
    <path d="M76 76 58 58 50 66 68 84 78 86Z"/>
  </svg>`,
  swordshield: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round">
    <path d="M36 12 44 12 47 20 46 52 40 58 34 52 33 20Z"/>
    <path d="M30 58 50 58M40 58 40 70"/>
    <path d="M20 64 58 64 58 78 40 92 22 78Z"/>
    <path d="M34 72 46 72 46 82 40 86 34 82Z"/>
  </svg>`,
};

const MONSTER_ART = {
  forestdrake: (c1, c2) => `<svg viewBox="0 0 100 100" fill="none">
      <path d="M8 70 18 50 16 30 32 44 40 20 50 40 62 16 66 40 82 30 82 50 94 66 74 62 64 76 54 64 44 82 34 66Z" fill="${c1}" stroke="${c2}" stroke-width="1.5"/>
      <path d="M32 52 42 48 40 56Z" fill="${c2}"/>
      <path d="M62 52 72 48 70 56Z" fill="${c2}"/>
      <path d="M44 66 54 64 50 72Z" fill="${c2}" opacity=".7"/>
      <path d="M20 84 30 74M80 84 70 74" stroke="${c2}" stroke-width="2"/>
    </svg>`,
  firewyvern: (c1, c2) => `<svg viewBox="0 0 100 100" fill="none">
      <path d="M4 74Q20 24 44 46L50 32 56 46Q80 24 96 74 70 58 58 68L50 84 42 68Q30 58 4 74Z" fill="${c1}" stroke="${c2}" stroke-width="1.5"/>
      <path d="M44 46 50 40 56 46 50 52Z" fill="${c2}"/>
      <path d="M24 62 36 58M76 62 64 58M50 52 50 66" stroke="${c2}" stroke-width="1.2" opacity=".6"/>
    </svg>`,
  icebehemoth: (c1, c2) => `<svg viewBox="0 0 100 100" fill="none">
      <path d="M10 82 16 52 24 40 30 54 36 26 46 46 50 18 56 46 66 26 72 54 78 40 86 52 92 82Z" fill="${c1}" stroke="${c2}" stroke-width="1.5"/>
      <path d="M26 70 74 70 70 84 30 84Z" fill="${c2}" opacity=".28"/>
      <path d="M36 62 44 58M64 62 56 58" stroke="${c2}" stroke-width="2.4"/>
    </svg>`,
};

function weaponArt(id) { return WEAPON_ART[id] || ''; }

export class UI {
  constructor(game) {
    this.game = game;
    this.screen = 'title';
    this.smithWeapon = 'greatsword';
    this.huntEls = {
      root: document.getElementById('hunt-ui'),
      hpFill: document.getElementById('hp-fill'),
      hpText: document.getElementById('hp-text'),
      stamFill: document.getElementById('stam-fill'),
      stamText: document.getElementById('stam-text'),
      monsterName: document.getElementById('monster-name'),
      monsterPhase: document.getElementById('monster-phase'),
      monsterFill: document.getElementById('monster-fill'),
      partChips: document.getElementById('part-chips'),
      timerText: document.getElementById('timer-text'),
      timer: document.getElementById('timer'),
      questName: document.getElementById('hud-quest-name'),
      weaponTag: document.getElementById('hud-weapon-tag'),
      comboMeter: document.getElementById('combo-meter'),
      comboPips: [...document.querySelectorAll('.combo-meter .pips i')],
      itemCount: document.getElementById('item-count'),
      touchItemCount: document.getElementById('touch-item-count'),
      announce: document.getElementById('announce'),
      subtitle: document.getElementById('subtitle'),
      charge: document.getElementById('charge-indicator'),
      chargePips: [...document.querySelectorAll('.charge-pips i')],
      hint: document.getElementById('action-hint'),
      lock: document.getElementById('lock-indicator'),
      cameraHint: document.getElementById('camera-hint'),
      touch: document.getElementById('touch-controls'),
      touchLock: document.getElementById('touch-lock'),
      hp: document.querySelector('.bar.hp'),
    };
    this.damageLayer = document.getElementById('damage-layer');
    this.toastEl = document.getElementById('toast');
    this.flashEl = document.getElementById('flash');
    this.fadeEl = document.getElementById('fade');
    this.screenEls = [...document.querySelectorAll('.screen')];
    this._announceTimer = 0;
    this._subTimer = 0;
    this._hintTimer = 0;
    this._toastTimer = 0;
    this._lastHud = {};

    this._wire();
    this._paintIcons();
  }

  _paintIcons() {
    document.querySelectorAll('[data-icon]').forEach((el) => {
      el.innerHTML = ICON(el.dataset.icon);
    });
  }

  _wire() {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => {
        this.game.audio.unlock();
        this.game.audio.ui();
        this.game.navigate(el.dataset.nav);
      });
    });
    document.getElementById('result-again')?.addEventListener('click', () => this.game.restartHunt());
    document.getElementById('result-hub')?.addEventListener('click', () => this.game.goHub());
    document.getElementById('resume-btn')?.addEventListener('click', () => this.game.setPaused(false));
    document.getElementById('abandon-btn')?.addEventListener('click', () => this.game.abandonHunt());
    document.getElementById('pause-btn')?.addEventListener('click', () => this.game.setPaused(true));
    document.getElementById('reset-save')?.addEventListener('click', () => this.game.resetProgress());
    document.getElementById('touch-lock')?.addEventListener('click', () => this.game.toggleLock());

    const questGrid = document.getElementById('quest-grid');
    questGrid?.addEventListener('click', (e) => {
      const card = e.target.closest('[data-quest]');
      if (!card) return;
      this.game.audio.unlock();
      this.game.audio.ui();
      this.game.startHunt(card.dataset.quest);
    });

    document.getElementById('hub-weapon-switch')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-weapon]');
      if (!b) return;
      this.game.setWeapon(b.dataset.weapon);
    });

    document.getElementById('smith-weapons')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-smith-weapon]');
      if (!b) return;
      this.smithWeapon = b.dataset.smithWeapon;
      this.game.audio.ui();
      this.refreshSmith();
    });
    document.getElementById('smith-detail')?.addEventListener('click', (e) => {
      const upgrade = e.target.closest('[data-upgrade]');
      if (upgrade) { this.game.upgradeWeapon(this.smithWeapon); return; }
      const skin = e.target.closest('[data-skin]');
      if (skin) {
        const idx = Number(skin.dataset.skin);
        if (skin.dataset.locked === '1') this.game.unlockSkin(this.smithWeapon, idx);
        else this.game.equipSkin(this.smithWeapon, idx);
      }
    });

    // settings
    const bindRange = (id, key, suffix, apply) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = Number(el.value);
        this.game.save.settings[key] = v;
        document.getElementById(id + '-val').textContent = v + (suffix || '');
        this.game.applySettings();
        this.game.saveProgress();
      });
    };
    bindRange('set-master', 'master');
    bindRange('set-music', 'music');
    bindRange('set-sfx', 'sfx');
    bindRange('set-sens', 'sens');

    const toggle = (id, key, after) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        this.game.save.settings[key] = el.checked;
        this.game.saveProgress();
        after?.(el.checked);
      });
    };
    toggle('set-lefty', 'lefty', () => this.applySettings());
    toggle('set-touch', 'touch', () => this.applySettings());
    toggle('set-shake', 'shake');
  }

  // ---------------- screen management ----------------
  showScreen(name) {
    this.screen = name;
    this.screenEls.forEach((el) => el.classList.add('hidden'));
    if (!name) return;
    const el = document.getElementById('screen-' + name);
    if (el) el.classList.remove('hidden');
    if (name === 'hub') this.refreshHub();
    if (name === 'quests') this.refreshQuests();
    if (name === 'smith') this.refreshSmith();
    if (name === 'settings') this.refreshSettings();
  }

  hideAllScreens() {
    this.screenEls.forEach((el) => el.classList.add('hidden'));
    this.screen = null;
  }

  showHuntHud(show) {
    this.huntEls.root.classList.toggle('hidden', !show);
  }

  applySettings() {
    const s = this.game.save.settings;
    document.body.classList.toggle('lefty', !!s.lefty);
    this.applyTouchVisibility();
  }

  applyTouchVisibility(inHunt = this.game.state === 'hunt' || this.game.state === 'pause') {
    const s = this.game.save.settings;
    let touch = s.touch;
    if (touch === null || touch === undefined) {
      touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    }
    this.huntEls.touch.classList.toggle('hidden', !(touch && inHunt));
    document.body.classList.toggle('touch-mode', !!touch);
    this.huntEls.cameraHint.classList.toggle('show', !touch && inHunt);
    this.huntEls.cameraHint.innerHTML = '<kbd>Click</kbd> to capture mouse · <kbd>F</kbd> lock on · drag to look';
    this.touchMode = touch;
  }

  // ---------------- hub ----------------
  refreshHub() {
    const s = this.game.save;
    const w = WEAPONS[s.weapon];
    const lvl = s.weaponLevels[s.weapon];
    document.getElementById('hub-weapon-icon').innerHTML = weaponArt(w.id);
    document.getElementById('hub-weapon-name').textContent = w.name;
    document.getElementById('hub-weapon-desc').textContent = w.desc;
    const skinName = w.skins[s.skins[w.id]]?.name || w.skins[0].name;
    document.getElementById('hub-weapon-stats').innerHTML = `
      <div class="mini-stat"><span>POWER</span><b>${'◆'.repeat(Math.round(w.power))}</b></div>
      <div class="mini-stat"><span>SPEED</span><b>${'◆'.repeat(Math.round(w.speed))}</b></div>
      <div class="mini-stat"><span>LEVEL</span><b>${lvl}</b></div>`;
    document.getElementById('hub-weapon-switch').innerHTML = WEAPON_ORDER.map((id) =>
      `<button class="wsw ${id === w.id ? 'on' : ''}" data-weapon="${id}">${WEAPONS[id].short}</button>`).join('');
    document.getElementById('hub-skin-line').innerHTML = `<span>SKIN · <b>${skinName}</b></span><span>ATK ×${(1 + 0.16 * (lvl - 1)).toFixed(2)}</span>`;

    const matCount = Object.values(s.materials).reduce((a, b) => a + b, 0);
    document.getElementById('hub-stats').innerHTML = `
      <div class="stat-chip">ZENNY <b>${s.zenny.toLocaleString()}</b></div>
      <div class="stat-chip">MATERIALS <b>${matCount}</b></div>
      <div class="stat-chip">HUNTS <b>${s.stats.wins}/${s.stats.hunts}</b></div>`;
    document.getElementById('hub-note').textContent = s.stats.wins > 0
      ? `A hunter's work is never done. ${s.stats.wins} hunt${s.stats.wins > 1 ? 's' : ''} cleared.`
      : 'Progress saves automatically. Your first hunt awaits.';
    this.applySettings();
  }

  // ---------------- quests ----------------
  refreshQuests() {
    const s = this.game.save;
    const grid = document.getElementById('quest-grid');
    grid.innerHTML = QUESTS.map((q) => {
      const [c1, c2] = q.palette;
      const rewards = Object.entries(q.rewards).map(([id, range]) => {
        const shown = Array.isArray(range) ? `${range[0]}–${range[1]}` : range;
        return `<span class="mat-chip"><i class="mat-dot" style="background:${matColor(id)}"></i>${MATERIALS[id].name} ×${shown}</span>`;
      }).join('');
      const cleared = s.cleared[q.id];
      return `<article class="quest-card ${cleared ? 'cleared' : ''}" data-quest="${q.id}">
        <div class="q-art" style="background:radial-gradient(ellipse at 50% 55%, ${c1}cc, ${c2}22 62%, transparent 82%), linear-gradient(160deg, ${c2}, #0a1a16)">${MONSTER_ART[q.monster](c1, c2)}</div>
        <span class="q-rank">${q.rank}</span>
        ${cleared ? '<span class="q-cleared">CLEARED</span>' : ''}
        <div class="q-body">
          <h3>${q.name}</h3>
          <div class="q-sub">${q.monsterName} · ${q.arena} arena</div>
          <div class="q-meta"><span>◷ 10:00</span><span>⚔ ${q.hint}</span></div>
          <p class="q-desc">${q.desc}</p>
          <div class="q-rewards">${rewards}</div>
          <div class="q-launch"><span>ACCEPT QUEST</span><div class="q-arrow">›</div></div>
        </div>
      </article>`;
    }).join('');
    const matCount = Object.values(s.materials).reduce((a, b) => a + b, 0);
    document.getElementById('quest-material-pill').textContent = `ZENNY ${s.zenny.toLocaleString()} · MAT ${matCount}`;
    const w = WEAPONS[s.weapon];
    document.getElementById('quest-loadout').innerHTML = `<span>LOADOUT</span><b style="color:var(--gold-hi)">${w.name} · Lv.${s.weaponLevels[w.id]}</b><span>·</span><span>${w.skins[s.skins[w.id]].name}</span>`;
  }

  // ---------------- blacksmith ----------------
  refreshSmith() {
    const s = this.game.save;
    const w = WEAPONS[this.smithWeapon];
    const lvl = s.weaponLevels[this.smithWeapon];
    const skinIdx = s.skins[this.smithWeapon];
    document.getElementById('smith-weapons').innerHTML = WEAPON_ORDER.map((id) => {
      const ww = WEAPONS[id];
      return `<button class="smith-w ${id === this.smithWeapon ? 'on' : ''}" data-smith-weapon="${id}">
        <span class="wicon">${weaponArt(id)}</span>
        <span>${ww.name}<small>LV. ${s.weaponLevels[id]} · ${ww.skins[s.skins[id]].name}</small></span>
      </button>`;
    }).join('');

    const cost = upgradeCost(this.smithWeapon, lvl + 1);
    const maxed = lvl >= 5;
    const affordable = cost && canAfford(cost, s.materials);
    const costHTML = maxed ? '<span class="cost-chip">MAXIMUM FORGE</span>' : Object.entries(cost).map(([id, qty]) => {
      const have = s.materials[id] || 0;
      return `<span class="cost-chip ${have < qty ? 'lacking' : ''}"><i class="mat-dot" style="background:${matColor(id)}"></i>${MATERIALS[id].name} ${have}/${qty}</span>`;
    }).join('');

    const skinsHTML = w.skins.map((sk, i) => {
      const unlocked = s.unlockedSkins[this.smithWeapon].includes(i);
      const equipped = i === skinIdx;
      const reqMet = lvl >= sk.reqLevel;
      const canUnlock = sk.cost && canAfford(sk.cost, s.materials) && reqMet;
      const label = unlocked ? (equipped ? 'EQUIPPED' : 'EQUIP') : (!reqMet ? `LV. ${sk.reqLevel}` : canUnlock ? 'UNLOCK' : 'MATERIALS');
      return `<button class="skin-card ${equipped ? 'on' : ''} ${unlocked ? '' : 'locked'}" data-skin="${i}" data-locked="${unlocked ? 0 : 1}">
        <span class="skin-swatch" style="background:linear-gradient(120deg,#${sk.blade.toString(16).padStart(6, '0')},#${(sk.accent || sk.shield || 0x888888).toString(16).padStart(6, '0')})"></span>
        ${sk.name}<small>${label}</small>
      </button>`;
    }).join('');

    document.getElementById('smith-detail').innerHTML = `
      <div class="sd-head">
        <div class="sd-art">${weaponArt(w.id)}</div>
        <div class="sd-title">
          <h3>${w.name}</h3>
          <p>${w.desc}</p>
        </div>
      </div>
      <div class="sd-stats">
        <div class="sd-stat"><span>RAW DAMAGE</span><b>${Math.round(w.combo[0].dmg * (1 + 0.16 * (lvl - 1)))} <em>Lv.${lvl}</em></b></div>
        <div class="sd-stat"><span>SPEED</span><b>${w.speed} / 5</b></div>
        <div class="sd-stat"><span>REACH</span><b>${w.range} / 5</b></div>
      </div>
      <div class="upgrade-row">
        <div style="flex:1;min-width:200px">
          <h4 class="upgrade-title">Forge Upgrade ${maxed ? '' : `→ Lv.${lvl + 1}`}</h4>
          <p class="upgrade-sub">+16% damage per level · unlocks new skins</p>
          <div>${costHTML}</div>
        </div>
        <button class="btn primary" data-upgrade="1" ${maxed || !affordable ? 'disabled' : ''}>${maxed ? 'FULLY FORGED' : 'UPGRADE'}</button>
      </div>
      <div class="skins">
        <h4>WEAPON SKINS</h4>
        <div class="skin-grid">${skinsHTML}</div>
      </div>`;

    const entries = Object.entries(s.materials).filter(([, v]) => v > 0);
    const matHTML = entries.length
      ? entries.map(([id, v]) => `<div class="inv-row"><i class="mat-dot" style="background:${matColor(id)}"></i><span>${MATERIALS[id].name}</span><b>${v}</b></div>`).join('')
      : '<div class="inv-empty">No materials yet.<br>Accept a quest and break some monster parts.</div>';
    document.getElementById('smith-inventory-list').innerHTML = matHTML + `<div class="inv-row" style="margin-top:10px;border-top:1px solid var(--line);padding-top:12px"><i class="mat-dot" style="background:var(--gold)"></i><span>Zenny</span><b>${s.zenny}</b></div>`;
    document.getElementById('smith-materials').textContent = `ZENNY ${s.zenny.toLocaleString()}`;
  }

  // ---------------- settings ----------------
  refreshSettings() {
    const s = this.game.save.settings;
    const setRange = (id, key) => {
      const el = document.getElementById(id);
      if (el) el.value = s[key];
      const val = document.getElementById(id + '-val');
      if (val) val.textContent = s[key];
    };
    setRange('set-master', 'master');
    setRange('set-music', 'music');
    setRange('set-sfx', 'sfx');
    setRange('set-sens', 'sens');
    document.getElementById('set-lefty').checked = !!s.lefty;
    document.getElementById('set-touch').checked = !!(s.touch ?? (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0));
    document.getElementById('set-shake').checked = s.shake !== false;
  }

  // ---------------- HUD ----------------
  setupHud(quest) {
    const h = this.huntEls;
    h.questName.textContent = quest.name.toUpperCase();
    h.weaponTag.textContent = (WEAPONS[this.game.save.weapon]?.name || 'Weapon').toUpperCase();
    h.monsterName.textContent = quest.monsterName;
    h.monsterPhase.textContent = 'CALM';
    h.monsterPhase.className = 'phase-tag';
    h.timerText.textContent = '10:00';
    h.timer.classList.remove('low');
    h.itemCount.textContent = HUNT_POTIONS;
    h.touchItemCount.textContent = HUNT_POTIONS;
    h.charge.classList.add('hidden');
    h.comboMeter.classList.remove('on');
    h.comboPips.forEach((p) => p.classList.remove('on'));
    h.monsterFill.style.transform = 'scaleX(1)';
    h.hpFill.style.transform = 'scaleX(1)';
    h.stamFill.style.transform = 'scaleX(1)';
    h.hpText.textContent = '100';
    h.stamText.textContent = '100';
    h.hp.classList.remove('low');
    h.root.classList.remove('hidden');
    this.showHuntHud(true);
    this.applyTouchVisibility(true);
  }

  setParts(parts) {
    this.huntEls.partChips.innerHTML = parts.map((p) =>
      `<span class="part-chip ${p.weak ? 'weak' : ''}" data-part="${p.id}">${p.label}</span>`).join('');
    this._parts = parts;
  }

  updateHud(state) {
    const h = this.huntEls;
    const hpPct = Math.max(0, state.hp / state.maxHp);
    const stPct = Math.max(0, state.stamina / state.maxStamina);
    const mPct = Math.max(0, state.monsterHp / state.monsterMaxHp);
    if (this._lastHud.hp !== hpPct) {
      h.hpFill.style.transform = `scaleX(${hpPct})`;
      h.hpText.textContent = Math.ceil(state.hp);
      h.hp.classList.toggle('low', hpPct < 0.3);
      this._lastHud.hp = hpPct;
    }
    if (this._lastHud.st !== stPct) {
      h.stamFill.style.transform = `scaleX(${stPct})`;
      h.stamText.textContent = Math.round(state.stamina);
      this._lastHud.st = stPct;
    }
    if (this._lastHud.mhp !== mPct) {
      h.monsterFill.style.transform = `scaleX(${mPct})`;
      this._lastHud.mhp = mPct;
    }
    if (this._lastHud.phase !== state.phase) {
      const phase = state.phase;
      h.monsterPhase.textContent = phase === 'enraged' ? 'ENRAGED' : phase === 'tired' ? 'TIRED' : 'CALM';
      h.monsterPhase.className = 'phase-tag ' + (phase === 'normal' ? '' : phase);
      this._lastHud.phase = phase;
    }
    if (this._lastHud.time !== state.time) {
      const t = Math.max(0, state.time);
      const mm = Math.floor(t / 60).toString().padStart(2, '0');
      const ss = Math.floor(t % 60).toString().padStart(2, '0');
      h.timerText.textContent = `${mm}:${ss}`;
      h.timer.classList.toggle('low', t <= 60);
      this._lastHud.time = state.time;
    }
    if (this._lastHud.items !== state.potions) {
      h.itemCount.textContent = state.potions;
      h.touchItemCount.textContent = state.potions;
      this._lastHud.items = state.potions;
    }
    if (this._lastHud.combo !== state.combo) {
      h.comboMeter.classList.toggle('on', state.combo > 0);
      h.comboPips.forEach((p, i) => p.classList.toggle('on', i < state.combo));
      this._lastHud.combo = state.combo;
    }
    if (this._lastHud.charge !== state.charge) {
      if (state.charge > 0) {
        h.charge.classList.remove('hidden');
        h.chargePips.forEach((p, i) => p.classList.toggle('on', i < state.charge));
        h.charge.querySelector('b').textContent = ['CHARGE', 'CHARGE I', 'CHARGE II', 'CHARGE III'][Math.min(3, state.charge)];
      } else {
        h.charge.classList.add('hidden');
      }
      this._lastHud.charge = state.charge;
    }
    if (this._lastHud.lock !== state.locked) {
      h.lock.classList.toggle('hidden', !state.locked);
      h.touchLock.classList.toggle('active', !!state.locked);
      this._lastHud.lock = state.locked;
    }
    if (this._parts && this._lastHud.parts !== state.partsVersion) {
      const map = new Map((state.brokenParts || []).map((p) => [p.id, p]));
      for (const p of this._parts) {
        const chip = h.partChips.querySelector(`[data-part="${p.id}"]`);
        if (!chip) continue;
        chip.classList.toggle('broken', map.has(p.id));
      }
      this._lastHud.parts = state.partsVersion;
    }
  }

  announce(text, cls = '', dur = 2.2) {
    const el = this.huntEls.announce;
    el.textContent = text;
    el.className = 'announce show ' + cls;
    clearTimeout(this._announceTimer);
    this._announceTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
  }

  subtitle(text, dur = 2.2) {
    const el = this.huntEls.subtitle;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._subTimer);
    this._subTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
  }

  hint(text, dur = 2.4) {
    const el = this.huntEls.hint;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
  }

  damage(screenPos, text, cls = '', label = '') {
    if (!screenPos || !screenPos.visible) return;
    const el = document.createElement('div');
    el.className = 'dmg ' + cls;
    el.textContent = text;
    const jitter = (Math.random() - 0.5) * 26;
    el.style.left = `${screenPos.x + jitter}px`;
    el.style.top = `${screenPos.y}px`;
    this.damageLayer.appendChild(el);
    if (label) {
      const lb = document.createElement('div');
      lb.className = 'dmg-label';
      lb.textContent = label;
      lb.style.left = `${screenPos.x + jitter}px`;
      lb.style.top = `${screenPos.y - 22}px`;
      this.damageLayer.appendChild(lb);
      setTimeout(() => lb.remove(), 850);
    }
    setTimeout(() => el.remove(), 950);
  }

  flash(kind = 'hurt') {
    const el = this.flashEl;
    el.className = 'flash ' + kind;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove(kind)));
  }

  toast(text, dur = 2.6) {
    const el = this.toastEl;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
  }

  setFade(on) {
    this.fadeEl.classList.toggle('on', on);
  }

  showPause(show) {
    document.getElementById('screen-pause').classList.toggle('hidden', !show);
  }

  // ---------------- result ----------------
  showResult(data) {
    const { won, quest, rewards, zenny, stats, reason } = data;
    document.getElementById('result-eyebrow').textContent = won ? 'QUEST COMPLETE' : 'QUEST FAILED';
    document.getElementById('result-title').textContent = won ? 'Victory' : reason === 'timeout' ? 'Time Expired' : 'Fallen Hunter';
    document.getElementById('result-sub').textContent = won
      ? `${quest.monsterName} has fallen. The guild will remember this hunt.`
      : reason === 'timeout'
        ? 'The monster slipped away as the last light faded. Bring a sharper blade next time.'
        : 'The wilds are unforgiving. Rest, reforge, and return.';
    const crest = document.getElementById('result-crest');
    crest.className = 'result-crest' + (won ? '' : ' defeat');
    crest.innerHTML = `<svg viewBox="0 0 64 64"><path d="M32 3 40 21 60 23 45 37 50 60 32 48 14 60 19 37 4 23 24 21Z"/></svg>`;

    const statsHTML = [
      ['TIME', stats.time],
      ['PARTS BROKEN', stats.breaks],
      ['DAMAGE DEALT', Math.round(stats.damage)],
      ['POTIONS LEFT', stats.potions],
    ].map(([k, v]) => `<div class="rs"><span>${k}</span><b>${v}</b></div>`).join('');
    document.getElementById('result-stats').innerHTML = statsHTML;

    const rows = Object.entries(rewards).filter(([, v]) => v > 0).map(([id, v]) =>
      `<div class="reward-row"><i class="mat-dot" style="background:${matColor(id)}"></i>${MATERIALS[id].name}<b>+${v}</b></div>`).join('');
    document.getElementById('reward-list').innerHTML = rows || '<div class="reward-row" style="opacity:.6">No materials recovered.</div>';
    document.getElementById('reward-zenny').textContent = won ? `+${zenny} ZENNY` : 'NO REWARD';
    document.getElementById('part-note').textContent = won
      ? `${stats.breaks} part${stats.breaks === 1 ? '' : 's'} broken · bonus materials awarded for each break.`
      : 'Complete the hunt to keep your spoils.';
    this.hideAllScreens();
    this.screenEls.forEach((el) => el.classList.add('hidden'));
    document.getElementById('screen-result').classList.remove('hidden');
    this.screen = 'result';
    this.showHuntHud(false);
  }

  hideResult() {
    document.getElementById('screen-result').classList.add('hidden');
  }
}
