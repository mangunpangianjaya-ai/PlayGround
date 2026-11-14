// ============================================================
// IRONFANG — low-poly weapon models
// ============================================================
import * as THREE from 'three';

const metal = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color, metalness: 0.55, roughness: 0.38, flatShading: true, ...opts,
});
const dark = (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.85, flatShading: true });
const accent = (color, glow = 0) => new THREE.MeshStandardMaterial({
  color, metalness: 0.7, roughness: 0.3, flatShading: true,
  emissive: glow, emissiveIntensity: glow ? 1.6 : 0,
});

function bladeGeometry(width, length, thickness, taper = 0.55, curve = 0) {
  const s = new THREE.Shape();
  const w = width / 2;
  s.moveTo(-w, 0);
  s.lineTo(w, 0);
  if (curve) {
    s.quadraticCurveTo(w * (1 - curve), length * 0.55, w * 0.25 + curve * w, length * 0.92);
    s.lineTo(curve * w, length);
    s.quadraticCurveTo(-w * 0.7, length * 0.6, -w, 0);
  } else {
    s.lineTo(w * (1 - taper * 0.2), length * 0.72);
    s.lineTo(0, length);
    s.lineTo(-w * (1 - taper * 0.2), length * 0.72);
    s.closePath();
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 3 });
  g.translate(0, 0, -thickness / 2);
  g.computeVertexNormals();
  return g;
}

function addTip(group, x, y, z, name) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.name = name;
  group.add(o);
  return o;
}

function buildGreatsword(skin) {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(bladeGeometry(0.66, 2.5, 0.13, 0.5), metal(skin.blade));
  blade.position.y = 0.38;
  blade.castShadow = true;
  g.add(blade);

  // central fuller / accent
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.075, 1.75, 0.05), accent(skin.accent, skin.glow || 0));
  ridge.position.set(0, 1.45, 0.075);
  g.add(ridge);
  const ridge2 = ridge.clone(); ridge2.position.z = -0.075; g.add(ridge2);

  // edge highlights
  const edgeMat = accent(skin.accent, skin.glow || 0);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.95, 0.14), edgeMat);
    e.position.set(sx * 0.3, 1.4, 0);
    e.rotation.z = -sx * 0.018;
    g.add(e);
  }

  const guard = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.3), accent(skin.accent, skin.glow || 0));
  guard.position.y = 0.32;
  guard.castShadow = true;
  g.add(guard);

  for (const sx of [-1, 1]) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 4), metal(skin.blade));
    spike.position.set(sx * 0.55, 0.38, 0);
    spike.rotation.z = sx * Math.PI * 0.62;
    g.add(spike);
  }

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.62, 6), dark(skin.grip));
  grip.position.y = -0.02;
  g.add(grip);
  for (let i = 0; i < 4; i++) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.022, 3, 6), dark(0x1a1410));
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = -0.2 + i * 0.14;
    g.add(wrap);
  }
  const pommel = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), accent(skin.accent, skin.glow || 0));
  pommel.position.y = -0.38;
  g.add(pommel);

  addTip(g, 0, 2.9, 0, 'tip');
  addTip(g, 0, 0.5, 0, 'base');
  g.userData.length = 2.9;
  return g;
}

function buildDagger(skin, left) {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(bladeGeometry(0.2, 1.05, 0.055, 0.15, left ? -0.32 : 0.32), metal(skin.blade));
  blade.position.y = 0.2;
  blade.castShadow = true;
  g.add(blade);

  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.75, 0.02), accent(skin.accent, skin.glow || 0));
  glow.position.set(0, 0.65, 0.04);
  g.add(glow);

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.12), accent(skin.accent, skin.glow || 0));
  guard.position.y = 0.2;
  g.add(guard);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.3, 6), dark(skin.grip));
  grip.position.y = 0.02;
  g.add(grip);

  const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.065, 0), accent(skin.accent, skin.glow || 0));
  pom.position.y = -0.15;
  g.add(pom);

  addTip(g, 0, 1.3, 0, 'tip');
  addTip(g, 0, 0.2, 0, 'base');
  g.userData.length = 1.3;
  return g;
}

function buildShield(skin) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const r = 0.52;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  geo.translate(0, 0, -0.05);
  const face = new THREE.Mesh(geo, metal(skin.shield, { metalness: 0.35, roughness: 0.55 }));
  face.castShadow = true;
  g.add(face);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 4, 12), accent(skin.accent, skin.glow || 0));
  rim.position.z = 0.065;
  g.add(rim);

  const boss = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), accent(skin.accent, skin.glow || 0));
  boss.position.z = 0.1;
  g.add(boss);

  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const stud = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 4), metal(skin.blade));
    stud.position.set(Math.cos(a) * 0.39, Math.sin(a) * 0.39, 0.07);
    stud.rotation.x = Math.PI / 2;
    g.add(stud);
  }
  return g;
}

function buildSnS(skin) {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(bladeGeometry(0.22, 1.4, 0.07, 0.6), metal(skin.blade));
  blade.position.y = 0.22;
  blade.castShadow = true;
  g.add(blade);

  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.9, 0.02), accent(skin.accent, skin.glow || 0));
  fuller.position.set(0, 0.8, 0.045);
  g.add(fuller);

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.16), accent(skin.accent, skin.glow || 0));
  guard.position.y = 0.22;
  g.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.3, 6), dark(skin.grip));
  grip.position.y = 0.02;
  g.add(grip);
  const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), accent(skin.accent, skin.glow || 0));
  pom.position.y = -0.16;
  g.add(pom);

  addTip(g, 0, 1.68, 0, 'tip');
  addTip(g, 0, 0.35, 0, 'base');
  g.userData.length = 1.68;
  return g;
}

export function createWeaponModel(id, skin, level = 1) {
  const boost = level >= 4 ? 0.5 : 0;
  const s = { ...skin };
  if (boost && skin.glow) s.glow = skin.glow + 0x111111 * 0;
  let right = null, left = null;
  if (id === 'greatsword') right = buildGreatsword(s);
  else if (id === 'dualblades') { right = buildDagger(s, false); left = buildDagger(s, true); }
  else { right = buildSnS(s); left = buildShield(s); }

  if (level >= 5) {
    for (const grp of [right, left]) {
      if (!grp) continue;
      grp.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) {
          const m = o.material.clone();
          m.emissive = new THREE.Color(skin.accent || 0xe8b45a);
          m.emissiveIntensity = 0.22;
          o.material = m;
        }
      });
    }
  }
  return { right, left };
}

export function weaponRigHandFor(id) {
  return id === 'swordshield' ? 'left' : 'right';
}
