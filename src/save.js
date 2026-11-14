// ============================================================
// IRONFANG — persistent progression
// ============================================================
const KEY = 'ironfang-save-v1';

export const DEFAULT_SAVE = {
  version: 1,
  weapon: 'greatsword',
  weaponLevels: { greatsword: 1, dualblades: 1, swordshield: 1 },
  skins: { greatsword: 0, dualblades: 0, swordshield: 0 },
  unlockedSkins: { greatsword: [0], dualblades: [0], swordshield: [0] },
  materials: {
    mossScale: 0, drakeFang: 0,
    emberScale: 0, wyvernWing: 0,
    frostPlate: 0, behemothHorn: 0,
  },
  zenny: 0,
  cleared: {},
  settings: {
    master: 80, music: 70, sfx: 85, sens: 100,
    lefty: false, touch: null, shake: true,
  },
  stats: { hunts: 0, wins: 0, bestTime: null, totalDamage: 0, breaks: 0 },
};

function merge(base, incoming) {
  if (!incoming || typeof incoming !== 'object') return structuredClone(base);
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(base)) {
    if (incoming[k] === undefined) continue;
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = merge(base[k], incoming[k]);
    else out[k] = incoming[k];
  }
  // preserve any new keys from incoming top-level structures (future proofing)
  if (!Array.isArray(out) && typeof incoming === 'object') {
    for (const k of Object.keys(incoming)) if (!(k in out)) out[k] = incoming[k];
  }
  return out;
}

export function loadSave() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (!raw) return structuredClone(DEFAULT_SAVE);
  try {
    const parsed = JSON.parse(raw);
    const s = merge(DEFAULT_SAVE, parsed);
    // sanitise
    s.zenny = Math.max(0, Number(s.zenny) || 0);
    for (const w of Object.keys(s.weaponLevels)) s.weaponLevels[w] = Math.min(5, Math.max(1, Number(s.weaponLevels[w]) || 1));
    return s;
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return structuredClone(DEFAULT_SAVE);
}
