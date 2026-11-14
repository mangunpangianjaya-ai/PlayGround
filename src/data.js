// ============================================================
// IRONFANG — game data: weapons, quests, materials
// ============================================================

export const MATERIALS = {
  mossScale:   { name: 'Moss Scale',    color: '#6fbf6a', tier: 1 },
  drakeFang:   { name: 'Drake Fang',    color: '#e6d7a3', tier: 1 },
  emberScale:  { name: 'Ember Scale',   color: '#e2763f', tier: 2 },
  wyvernWing:  { name: 'Wyvern Wing',   color: '#ff9a63', tier: 2 },
  frostPlate:  { name: 'Frost Plate',   color: '#8fd0e8', tier: 3 },
  behemothHorn:{ name: 'Behemoth Horn', color: '#d8ecff', tier: 3 },
};

export const WEAPON_ORDER = ['greatsword', 'dualblades', 'swordshield'];

export const WEAPONS = {
  greatsword: {
    id: 'greatsword',
    name: 'Great Sword',
    short: 'GS',
    subtitle: 'The Avalanche',
    desc: 'Slow, enormous arcs. Hold Attack to charge three tiers, or hold Special to guard.',
    speed: 2, power: 5, range: 4,
    moveSpeed: 4.5, sprintSpeed: 6.5,
    blockReduction: 0.78, blockStamina: 14,
    canGuard: true,
    materials: { own1: 'mossScale', own2: 'drakeFang', next1: 'emberScale', next2: 'wyvernWing' },
    colors: { trail: 0xffcf7a, ui: '#e8b45a' },
    combo: [
      { name: 'Overhead Slash', dmg: 34, windup: 0.34, active: 0.16, recover: 0.38, arc: 1.95, reach: 3.25, lunge: 1.4, anim: 'vertical', shake: 0.35 },
      { name: 'Wide Slash', dmg: 28, windup: 0.28, active: 0.16, recover: 0.34, arc: 2.65, reach: 3.4, lunge: 1.0, anim: 'horizontal', shake: 0.32 },
      { name: 'Rising Cut', dmg: 40, windup: 0.38, active: 0.18, recover: 0.48, arc: 2.0, reach: 3.55, lunge: 1.7, anim: 'uppercut', shake: 0.4 },
    ],
    finisher: { name: 'Wide Sweep', dmg: 50, windup: 0.32, active: 0.2, recover: 0.5, arc: 3.15, reach: 3.6, lunge: 1.2, anim: 'spin', shake: 0.5, stagger: 34 },
    charge: {
      times: [0.0, 0.62, 1.3, 2.05],
      dmg: [46, 70, 100, 132],
      name: ['Charged Slash', 'Charged Slash II', 'Charged Slash III', 'TRUE CHARGED SLASH'],
      windup: 0.3, active: 0.2, recover: 0.52, reach: 3.85, arc: 2.15, lunge: 1.9, anim: 'vertical', shake: 0.7,
    },
    skins: [
      { name: 'Iron Cleaver', blade: 0xc2ccd0, accent: 0xe8b45a, grip: 0x3a2f28, cost: null, reqLevel: 1 },
      { name: 'Mossbone', blade: 0x8fae72, accent: 0xe2efb8, grip: 0x4b3a2a, cost: { mossScale: 4, drakeFang: 1 }, reqLevel: 2 },
      { name: 'Cinder Edge', blade: 0x7a3b32, accent: 0xff8a3d, grip: 0x2a1b18, cost: { emberScale: 5, wyvernWing: 2 }, reqLevel: 3, glow: 0xff5a1e },
    ],
  },
  dualblades: {
    id: 'dualblades',
    name: 'Dual Blades',
    short: 'DB',
    subtitle: 'Twin Comets',
    desc: 'A blur of steel. Tap Special to enter Demon Mode — faster strikes and a whirling flurry.',
    speed: 5, power: 2, range: 2,
    moveSpeed: 5.6, sprintSpeed: 7.6,
    blockReduction: 0, blockStamina: 0,
    canGuard: false,
    materials: { own1: 'emberScale', own2: 'wyvernWing', next1: 'frostPlate', next2: 'behemothHorn' },
    colors: { trail: 0x93f5e3, ui: '#6fd6c2' },
    combo: [
      { name: 'Cross Slash', dmg: 11, windup: 0.07, active: 0.09, recover: 0.13, arc: 2.5, reach: 2.2, lunge: 0.7, anim: 'dbl1', shake: 0.14 },
      { name: 'Twin Rend', dmg: 12, windup: 0.07, active: 0.09, recover: 0.13, arc: 2.7, reach: 2.2, lunge: 0.5, anim: 'dbl2', shake: 0.14 },
      { name: 'Rising Fang', dmg: 15, windup: 0.1, active: 0.12, recover: 0.22, arc: 2.6, reach: 2.3, lunge: 0.9, anim: 'dbl3', shake: 0.2 },
    ],
    finisher: { name: 'Blade Dance', dmg: 9, windup: 0.12, active: 0.72, recover: 0.35, arc: 3.6, reach: 2.4, lunge: 0.15, anim: 'dance', shake: 0.16, hits: 7, hitInterval: 0.09, moveLock: 0.35 },
    demon: { drain: 7.5, speed: 1.32, damage: 1.22, flurry: { hits: 4, dmg: 7, interval: 0.1 } },
    skins: [
      { name: 'Twin Fangs', blade: 0xd8e2e4, accent: 0x6fd6c2, grip: 0x2c3b3d, cost: null, reqLevel: 1 },
      { name: 'Gloamfang', blade: 0x9d86d8, accent: 0xc7aeff, grip: 0x2a2138, cost: { emberScale: 4, wyvernWing: 1 }, reqLevel: 2 },
      { name: 'Cinder Fangs', blade: 0xe9784e, accent: 0xffc06a, grip: 0x3a2118, cost: { frostPlate: 5, behemothHorn: 2 }, reqLevel: 3, glow: 0xff7a2a },
    ],
  },
  swordshield: {
    id: 'swordshield',
    name: 'Sword & Shield',
    short: 'S&S',
    subtitle: 'Oathkeeper',
    desc: 'Never off balance. Guard with Special, bash with a finisher, and drink potions while moving.',
    speed: 4, power: 3, range: 3,
    moveSpeed: 5.2, sprintSpeed: 7.0,
    blockReduction: 0.55, blockStamina: 10,
    canGuard: true,
    materials: { own1: 'frostPlate', own2: 'behemothHorn', next1: 'mossScale', next2: 'drakeFang' },
    colors: { trail: 0x9fc7ff, ui: '#9fc7ff' },
    combo: [
      { name: 'Quick Slash', dmg: 16, windup: 0.14, active: 0.1, recover: 0.2, arc: 2.3, reach: 2.6, lunge: 0.8, anim: 'sn1', shake: 0.2 },
      { name: 'Backhand', dmg: 15, windup: 0.13, active: 0.1, recover: 0.2, arc: 2.4, reach: 2.6, lunge: 0.7, anim: 'sn2', shake: 0.2 },
      { name: 'Lunge Cut', dmg: 22, windup: 0.2, active: 0.12, recover: 0.3, arc: 2.0, reach: 2.8, lunge: 1.5, anim: 'sn3', shake: 0.26 },
    ],
    finisher: { name: 'Shield Rush', dmg: 36, windup: 0.2, active: 0.16, recover: 0.36, arc: 1.35, reach: 2.9, lunge: 2.2, anim: 'bash', shake: 0.45, stagger: 42 },
    skins: [
      { name: 'Oathkeeper', blade: 0xc8d4dd, accent: 0xe8b45a, grip: 0x3a3f44, shield: 0x365b70, cost: null, reqLevel: 1 },
      { name: 'Frostguard', blade: 0xaedcf2, accent: 0xd8f2ff, grip: 0x2d4653, shield: 0x3d7a95, cost: { frostPlate: 4, behemothHorn: 1 }, reqLevel: 2 },
      { name: 'Ashen Aegis', blade: 0x9a6a52, accent: 0xffab5e, grip: 0x2a1e19, shield: 0x55302a, cost: { mossScale: 5, drakeFang: 2 }, reqLevel: 3, glow: 0xff7a2a },
    ],
  },
};

export const UPGRADE_COSTS = {
  2: { own1: 3, own2: 1 },
  3: { own1: 5, own2: 2, next1: 2 },
  4: { own1: 7, own2: 3, next1: 3, next2: 2 },
  5: { own1: 10, own2: 5, next1: 4, next2: 4 },
};

export function upgradeCost(weaponId, level) {
  const w = WEAPONS[weaponId];
  const spec = UPGRADE_COSTS[level];
  if (!spec || !w) return null;
  const cost = {};
  for (const [slot, qty] of Object.entries(spec)) cost[w.materials[slot]] = qty;
  return cost;
}

export function canAfford(cost, materials) {
  if (!cost) return false;
  return Object.entries(cost).every(([id, qty]) => (materials[id] || 0) >= qty);
}

export const QUESTS = [
  {
    id: 'forest',
    rank: '★☆☆',
    name: 'The Woodland Stalker',
    monster: 'forestdrake',
    monsterName: 'Forest Drake',
    arena: 'forest',
    hint: 'Charges · Tail sweep · Roar',
    desc: 'A moss-backed drake has claimed the old hunting ground. It charges in straight lines and sweeps its spiked tail when you crowd it.',
    timeLimit: 600,
    zenny: 700,
    palette: ['#2f6b46', '#8fc46d', '#0b1f1a'],
    rewards: { mossScale: [2, 4], drakeFang: [1, 2] },
    partRewards: { head: 'drakeFang', tail: 'mossScale', wings: 'mossScale' },
  },
  {
    id: 'volcano',
    rank: '★★☆',
    name: 'Cinders of the Peak',
    monster: 'firewyvern',
    monsterName: 'Fire Wyvern',
    arena: 'volcano',
    hint: 'Fire cone · Fireball · Dive',
    desc: 'The caldera has woken. A fire wyvern circles above the ash flats, raining flame before diving at the first opening it sees.',
    timeLimit: 600,
    zenny: 1150,
    palette: ['#7a2a1c', '#ff8a3d', '#1b0a07'],
    rewards: { emberScale: [2, 4], wyvernWing: [1, 2] },
    partRewards: { head: 'wyvernWing', tail: 'emberScale', wings: 'wyvernWing' },
  },
  {
    id: 'ice',
    rank: '★★★',
    name: 'Crown of the Frozen Deep',
    monster: 'icebehemoth',
    monsterName: 'Ice Behemoth',
    arena: 'ice',
    hint: 'Slam · Ice shards · Freeze',
    desc: 'Something enormous sleeps beneath the glacier. Wake it and the cave will shudder with every step. Break its crown before the cold takes you.',
    timeLimit: 600,
    zenny: 1700,
    palette: ['#2a6382', '#c8efff', '#081521'],
    rewards: { frostPlate: [2, 4], behemothHorn: [1, 2] },
    partRewards: { head: 'behemothHorn', tail: 'frostPlate', wings: 'frostPlate' },
  },
];

export const HUNT_POTIONS = 3;
export const POTION_HEAL = 45;

export function matName(id) { return MATERIALS[id]?.name || id; }
export function matColor(id) { return MATERIALS[id]?.color || '#ccc'; }
