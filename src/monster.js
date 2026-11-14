// ============================================================
// IRONFANG — monsters: models, parts, phases, attack AI
// ============================================================
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
const angleDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const rng = (a, b) => a + Math.random() * (b - a);

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.08, flatShading: true, ...opts });
}

function wingMesh(color, boneColor) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(1.4, 0.85);
  s.lineTo(2.8, 0.55);
  s.lineTo(2.2, 0.05);
  s.lineTo(2.6, -0.55);
  s.lineTo(1.5, -0.35);
  s.lineTo(0.75, -0.6);
  s.lineTo(0.2, -0.15);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 3 });
  const membrane = new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide, transparent: true, opacity: 0.94 }));
  membrane.rotation.x = -Math.PI / 2;
  membrane.castShadow = true;
  const g = new THREE.Group();
  g.add(membrane);
  const boneMat = mat(boneColor);
  const bones = [
    [[0, 0, 0], [1.4, 0.42, 0.85]],
    [[0, 0, 0], [2.8, 0.28, 0.55]],
    [[0, 0, 0], [2.55, 0.28, -0.55]],
  ];
  for (const [a, b] of bones) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, len, 4), boneMat);
    cyl.position.copy(va.clone().add(vb).multiplyScalar(0.5));
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.add(cyl);
  }
  return g;
}

// ------------------------------------------------------------------
// models
// ------------------------------------------------------------------
function buildForestDrake(p) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const baseY = 1.7;
  body.position.y = baseY;
  root.add(body);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), mat(p.body));
  torso.scale.set(0.95, 0.88, 1.55);
  torso.castShadow = true;
  body.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.85, 6, 4), mat(p.belly));
  belly.scale.set(0.9, 0.55, 1.3);
  belly.position.y = -0.4;
  body.add(belly);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.85, 6, 4), mat(p.body));
  chest.scale.set(0.9, 0.85, 0.9);
  chest.position.set(0, 0.16, 0.85);
  body.add(chest);

  // back spikes
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.17 - i * 0.015, 0.55, 4), mat(p.spikes));
    spike.position.set(0, 0.78 - i * 0.05, 0.75 - i * 0.42);
    spike.rotation.x = -0.3;
    body.add(spike);
  }
  // moss patches
  for (let i = 0; i < 4; i++) {
    const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(rng(0.2, 0.38), 0), mat(0x5c8a4a, { roughness: 1 }));
    moss.position.set(rng(-0.6, 0.6), 0.55 + rng(-0.2, 0.2), rng(-0.8, 0.9));
    moss.scale.y = 0.4;
    body.add(moss);
  }

  // neck + head
  const neck = new THREE.Group();
  neck.position.set(0, 0.32, 1.25);
  neck.rotation.x = -0.82;
  body.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 1.25, 6), mat(p.body));
  neckMesh.position.y = 0.6;
  neckMesh.castShadow = true;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.y = 1.28;
  head.rotation.x = 0.82;
  neck.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.58, 0.9), mat(p.body));
  skull.position.z = 0.28;
  skull.castShadow = true;
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.55), mat(p.belly));
  snout.position.set(0, -0.08, 0.9);
  head.add(snout);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.2, 0.38);
  head.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.85), mat(p.belly));
  jawMesh.position.z = 0.38;
  jaw.add(jawMesh);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 4), mat(p.spikes));
    horn.position.set(s * 0.3, 0.3, 0.0);
    horn.rotation.set(-1.0, 0, s * -0.35);
    head.add(horn);
    const brow = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), mat(p.spikes));
    brow.position.set(s * 0.32, 0.14, 0.5);
    brow.rotation.x = 0.8;
    head.add(brow);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 5, 4), new THREE.MeshStandardMaterial({ color: 0x1a1a10, emissive: p.eyes, emissiveIntensity: 1.3, roughness: 0.3 }));
    eye.position.set(s * 0.33, 0.06, 0.55);
    head.add(eye);
  }

  // legs
  const legs = [];
  const legPositions = [
    [0.58, -0.28, 0.92, 1], [-0.58, -0.28, 0.92, 1],
    [0.6, -0.28, -0.88, 0], [-0.6, -0.28, -0.88, 0],
  ];
  for (const [x, y, z, front] of legPositions) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    body.add(pivot);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.8, 5), mat(p.bodyDark));
    thigh.position.y = -0.36;
    thigh.castShadow = true;
    pivot.add(thigh);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.72, 5), mat(p.bodyDark));
    shin.position.y = -1.0;
    pivot.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.55), mat(p.claw));
    foot.position.set(0, -1.36, 0.13);
    pivot.add(foot);
    for (let c = 0; c < 3; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 4), mat(p.claw));
      claw.position.set((c - 1) * 0.1, -1.4, 0.42);
      claw.rotation.x = 1.2;
      pivot.add(claw);
    }
    legs.push({ pivot, front, phase: (front ? 0 : Math.PI) + (x > 0 ? Math.PI : 0) });
  }

  // tail
  const tail = [];
  let tailParent = body;
  let tailPos = new THREE.Vector3(0, 0.1, -1.3);
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.copy(tailPos);
    tailParent.add(seg);
    const len = 0.95 - i * 0.12;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34 - i * 0.06, 0.25 - i * 0.05, len, 5), mat(i === 0 ? p.body : p.bodyDark));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = -len / 2;
    mesh.castShadow = true;
    seg.add(mesh);
    if (i > 0) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16 - i * 0.02, 0.5, 4), mat(p.spikes));
      spike.position.set(0, 0.28, -len / 2);
      spike.rotation.x = -0.5;
      seg.add(spike);
    }
    tail.push(seg);
    tailParent = seg;
    tailPos = new THREE.Vector3(0, 0, -len);
  }
  const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 4), mat(p.spikes));
  tailTip.rotation.x = -Math.PI / 2;
  tailTip.position.z = -0.4;
  tail[3].add(tailTip);

  // wing stubs
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.72, 0.42, 0.25);
    pivot.scale.x = s;
    body.add(pivot);
    const wing = wingMesh(p.wing, p.spikes);
    wing.scale.setScalar(0.62);
    pivot.add(wing);
    pivot.rotation.z = s * 0.25;
    wings.push({ pivot, side: s });
  }

  const headHit = new THREE.Object3D(); headHit.position.set(0, 0.18, 0.35); head.add(headHit);
  const bodyHit = new THREE.Object3D(); bodyHit.position.set(0, 0, 0); body.add(bodyHit);
  const tailHit = new THREE.Object3D(); tailHit.position.set(0, 0.1, -0.55); tail[1].add(tailHit);
  const wingHit = new THREE.Object3D(); wingHit.position.set(0.6, 0.1, 0); wings[0].pivot.add(wingHit);

  return { root, body, baseY, head, jaw, neck, legs, wings, tail, headHit, bodyHit, tailHit, wingHit, eyes: [] };
}

function buildFireWyvern(p) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const baseY = 2.35;
  body.position.y = baseY;
  root.add(body);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), mat(p.body));
  torso.scale.set(0.9, 1.1, 1.0);
  torso.castShadow = true;
  body.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 4), mat(p.belly));
  belly.scale.set(0.85, 1.05, 0.9);
  belly.position.set(0, -0.18, 0.25);
  body.add(belly);
  const hip = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 4), mat(p.bodyDark));
  hip.scale.set(1, 0.9, 1);
  hip.position.set(0, -0.35, -0.55);
  body.add(hip);

  // neck + head
  const neck = new THREE.Group();
  neck.position.set(0, 0.55, 0.55);
  neck.rotation.x = -0.62;
  body.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 1.25, 6), mat(p.body));
  neckMesh.position.y = 0.62;
  neck.add(neckMesh);
  for (let i = 0; i < 3; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 4), mat(p.spikes));
    spike.position.set(0, 0.25 + i * 0.3, -0.28);
    spike.rotation.x = -0.8;
    neck.add(spike);
  }
  const head = new THREE.Group();
  head.position.y = 1.3;
  head.rotation.x = 0.62;
  neck.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.5, 0.8), mat(p.body));
  skull.position.z = 0.24;
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.7), mat(p.bodyDark));
  snout.position.set(0, -0.05, 0.85);
  head.add(snout);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.2, 0.32);
  head.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.9), mat(p.belly));
  jawMesh.position.z = 0.42;
  jaw.add(jawMesh);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.85, 4), mat(p.spikes));
    horn.position.set(s * 0.24, 0.28, 0.05);
    horn.rotation.set(-1.15, 0, s * -0.25);
    head.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), new THREE.MeshStandardMaterial({ color: 0x1a1008, emissive: p.eyes, emissiveIntensity: 1.5, roughness: 0.3 }));
    eye.position.set(s * 0.27, 0.06, 0.48);
    head.add(eye);
  }
  // crest
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 4), mat(p.spikes));
  crest.position.set(0, 0.35, -0.1);
  crest.rotation.x = -0.4;
  head.add(crest);

  // legs
  const legs = [];
  for (const [x, front] of [[0.48, 1], [-0.48, 1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.55, 0.08);
    body.add(pivot);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.17, 0.9, 5), mat(p.bodyDark));
    thigh.position.y = -0.4;
    thigh.castShadow = true;
    pivot.add(thigh);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.85, 5), mat(p.bodyDark));
    shin.position.y = -1.15;
    pivot.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.6), mat(p.claw));
    foot.position.set(0, -1.6, 0.18);
    pivot.add(foot);
    for (let c = 0; c < 3; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), mat(p.claw));
      claw.position.set((c - 1) * 0.1, -1.64, 0.5);
      claw.rotation.x = 1.3;
      pivot.add(claw);
    }
    legs.push({ pivot, front, phase: x > 0 ? 0 : Math.PI });
  }
  // arms
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.78, 0.15, 0.5);
    body.add(pivot);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.6, 4), mat(p.bodyDark));
    upper.position.y = -0.3;
    pivot.add(upper);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 4), mat(p.claw));
    claw.position.y = -0.66;
    claw.rotation.x = 0.8;
    pivot.add(claw);
    pivot.rotation.z = s * 0.3;
  }

  // tail
  const tail = [];
  let parent = body;
  let pos = new THREE.Vector3(0, -0.15, -1.0);
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.copy(pos);
    parent.add(seg);
    const len = 0.9 - i * 0.1;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22 - i * 0.04, 0.17 - i * 0.035, len, 5), mat(i === 0 ? p.body : p.bodyDark));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = -len / 2;
    seg.add(mesh);
    tail.push(seg);
    parent = seg;
    pos = new THREE.Vector3(0, 0, -len);
  }
  const spade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 4), mat(p.spikes));
  spade.rotation.x = -Math.PI / 2;
  spade.position.z = -0.35;
  spade.scale.set(0.6, 1, 1.7);
  tail[3].add(spade);

  // wings
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.65, 0.55, 0.1);
    pivot.scale.x = s;
    body.add(pivot);
    const wing = wingMesh(p.wing, p.spikes);
    wing.scale.set(1.45, 1.1, 1.45);
    pivot.add(wing);
    pivot.rotation.z = s * 0.45;
    pivot.rotation.x = -0.15;
    wings.push({ pivot, side: s });
  }

  const headHit = new THREE.Object3D(); headHit.position.set(0, 0.15, 0.35); head.add(headHit);
  const bodyHit = new THREE.Object3D(); body.add(bodyHit);
  const tailHit = new THREE.Object3D(); tailHit.position.set(0, 0, -0.5); tail[1].add(tailHit);
  const wingHit = new THREE.Object3D(); wingHit.position.set(1.4, 0.3, 0.3); wings[0].pivot.add(wingHit);

  return { root, body, baseY, head, jaw, neck, legs, wings, tail, headHit, bodyHit, tailHit, wingHit };
}

function buildIceBehemoth(p) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const baseY = 2.25;
  body.position.y = baseY;
  root.add(body);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), mat(p.body));
  torso.scale.set(1.25, 1.0, 1.75);
  torso.castShadow = true;
  body.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), mat(p.belly));
  belly.scale.set(1.15, 0.55, 1.55);
  belly.position.y = -0.55;
  body.add(belly);
  // shoulder plates
  for (const s of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat(p.plate));
    plate.scale.set(0.8, 0.6, 1.0);
    plate.position.set(s * 0.85, 0.35, 0.6);
    body.add(plate);
  }
  // ice crystals on back
  for (let i = 0; i < 7; i++) {
    const crystal = new THREE.Mesh(new THREE.ConeGeometry(rng(0.12, 0.25), rng(0.6, 1.5), 4), new THREE.MeshStandardMaterial({
      color: 0xbfeaff, emissive: 0x4fa8d8, emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.95,
    }));
    crystal.position.set(rng(-0.7, 0.7), 0.85 + rng(0, 0.2), 0.9 - i * 0.35);
    crystal.rotation.set(rng(-0.3, 0.3), rng(0, 2), rng(-0.3, 0.3));
    body.add(crystal);
  }

  // head
  const head = new THREE.Group();
  head.position.set(0, 0.35, 1.55);
  body.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 1.0), mat(p.body));
  skull.position.z = 0.25;
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.6), mat(p.belly));
  snout.position.set(0, -0.08, 0.85);
  head.add(snout);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.28, 0.3);
  head.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.18, 0.8), mat(p.belly));
  jawMesh.position.z = 0.4;
  jaw.add(jawMesh);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.1, 4), mat(p.spikes));
    horn.position.set(s * 0.4, 0.35, 0.05);
    horn.rotation.set(-1.25, 0, s * -0.4);
    head.add(horn);
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 4), mat(p.spikes));
    tusk.position.set(s * 0.28, -0.28, 0.75);
    tusk.rotation.x = -1.8;
    head.add(tusk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), new THREE.MeshStandardMaterial({ color: 0x101820, emissive: p.eyes, emissiveIntensity: 1.4, roughness: 0.3 }));
    eye.position.set(s * 0.36, 0.05, 0.56);
    head.add(eye);
  }

  // legs
  const legs = [];
  const legPositions = [
    [0.82, -0.5, 0.95, 1], [-0.82, -0.5, 0.95, 1],
    [0.9, -0.5, -0.95, 0], [-0.9, -0.5, -0.95, 0],
  ];
  for (const [x, y, z, front] of legPositions) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    body.add(pivot);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.9, 5), mat(p.plate));
    thigh.position.y = -0.4;
    thigh.castShadow = true;
    pivot.add(thigh);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.8, 5), mat(p.body));
    shin.position.y = -1.05;
    pivot.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.7), mat(p.claw));
    foot.position.set(0, -1.47, 0.15);
    pivot.add(foot);
    for (let c = 0; c < 3; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 4), mat(p.claw));
      claw.position.set((c - 1) * 0.15, -1.5, 0.55);
      claw.rotation.x = 1.25;
      pivot.add(claw);
    }
    legs.push({ pivot, front, phase: (front ? 0 : Math.PI) + (x > 0 ? Math.PI : 0) });
  }

  // tail
  const tail = [];
  let parent = body;
  let pos = new THREE.Vector3(0, 0.05, -1.55);
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.copy(pos);
    parent.add(seg);
    const len = 0.9 - i * 0.08;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4 - i * 0.06, 0.3 - i * 0.05, len, 5), mat(i === 0 ? p.body : p.plate));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = -len / 2;
    mesh.castShadow = true;
    seg.add(mesh);
    if (i > 0) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 4), mat(p.spikes));
      spike.position.set(0, 0.22, -len / 2);
      seg.add(spike);
    }
    tail.push(seg);
    parent = seg;
    pos = new THREE.Vector3(0, 0, -len);
  }
  const club = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0xcdeeff, emissive: 0x3fa6d4, emissiveIntensity: 0.4, roughness: 0.25, flatShading: true }));
  club.position.z = -0.4;
  tail[3].add(club);

  const headHit = new THREE.Object3D(); headHit.position.set(0, 0.15, 0.35); head.add(headHit);
  const bodyHit = new THREE.Object3D(); body.add(bodyHit);
  const tailHit = new THREE.Object3D(); tailHit.position.set(0, 0, -0.5); tail[1].add(tailHit);
  const wingHit = new THREE.Object3D(); wingHit.position.set(0, 0.9, -0.4); body.add(wingHit);

  return { root, body, baseY, head, jaw, neck: null, legs, wings: [], tail, headHit, bodyHit, tailHit, wingHit };
}

// ------------------------------------------------------------------
// configs
// ------------------------------------------------------------------
export const MONSTER_TYPES = {
  forestdrake: {
    id: 'forestdrake',
    name: 'Forest Drake',
    title: 'Emerald Terror',
    hp: 780,
    speed: 3.1,
    chaseSpeed: 5.0,
    turn: 2.6,
    radius: 1.8,
    preferred: 5.2,
    scale: 1.0,
    palette: { body: 0x3e6b46, bodyDark: 0x31563a, belly: 0x9aa26a, spikes: 0xd8c894, claw: 0xe8ddb8, wing: 0x466b4a, eyes: 0xffd84a },
    build: buildForestDrake,
    parts: [
      { id: 'head', label: 'HEAD', radius: 0.95, mult: 1.55, hp: 170, material: 'drakeFang', weak: true, node: 'headHit' },
      { id: 'body', label: 'BODY', radius: 1.55, mult: 1.0, hp: Infinity, material: null, node: 'bodyHit' },
      { id: 'tail', label: 'TAIL', radius: 1.0, mult: 1.18, hp: 150, material: 'mossScale', node: 'tailHit' },
      { id: 'wings', label: 'WINGS', radius: 0.95, mult: 0.92, hp: 120, material: 'mossScale', node: 'wingHit' },
    ],
    attacks: [
      { id: 'bite', anim: 'bite', min: 0, max: 6, windup: 0.72, active: 0.24, recover: 0.85, cd: 3.0, damage: 13, shape: { type: 'cone', radius: 5.4, angle: 1.25 }, telegraph: 'cone', lunge: 2.2 },
      { id: 'claw', anim: 'claw', min: 0, max: 6.5, windup: 0.62, active: 0.22, recover: 0.8, cd: 3.4, damage: 14, shape: { type: 'cone', radius: 5.0, angle: 1.7 }, telegraph: 'cone', lunge: 1.4 },
      { id: 'tail', anim: 'tail', min: 0, max: 8, windup: 0.8, active: 0.34, recover: 1.0, cd: 4.6, damage: 16, shape: { type: 'circle', radius: 5.4 }, telegraph: 'circle', center: 'self' },
      { id: 'charge', anim: 'charge', min: 8, max: 26, windup: 1.05, active: 0.72, recover: 1.2, cd: 6.8, damage: 20, shape: { type: 'line', length: 20, width: 3.6 }, telegraph: 'line', dash: 15.5, track: 0.25 },
      { id: 'roar', anim: 'roar', min: 0, max: 10, windup: 0.85, active: 0.5, recover: 0.9, cd: 15, damage: 0, shape: { type: 'circle', radius: 9 }, telegraph: 'circle', center: 'self', stun: 1.3 },
    ],
    partRewards: { head: 'drakeFang', tail: 'mossScale', wings: 'mossScale' },
  },
  firewyvern: {
    id: 'firewyvern',
    name: 'Fire Wyvern',
    title: 'Cinder Sovereign',
    hp: 1150,
    speed: 3.4,
    chaseSpeed: 5.4,
    turn: 2.4,
    radius: 1.9,
    preferred: 7.5,
    scale: 1.04,
    palette: { body: 0x8a3b2a, bodyDark: 0x5c2620, belly: 0xe0a05e, spikes: 0xf0c27a, claw: 0xf2e2c0, wing: 0xb04a2a, eyes: 0xff9a3c },
    build: buildFireWyvern,
    parts: [
      { id: 'head', label: 'HEAD', radius: 0.9, mult: 1.6, hp: 190, material: 'wyvernWing', weak: true, node: 'headHit' },
      { id: 'body', label: 'BODY', radius: 1.5, mult: 1.0, hp: Infinity, material: null, node: 'bodyHit' },
      { id: 'tail', label: 'TAIL', radius: 1.0, mult: 1.15, hp: 160, material: 'emberScale', node: 'tailHit' },
      { id: 'wings', label: 'WINGS', radius: 1.5, mult: 1.05, hp: 170, material: 'wyvernWing', node: 'wingHit' },
    ],
    attacks: [
      { id: 'bite', anim: 'bite', min: 0, max: 6.5, windup: 0.6, active: 0.22, recover: 0.8, cd: 2.8, damage: 13, shape: { type: 'cone', radius: 5.0, angle: 1.2 }, telegraph: 'cone', lunge: 2 },
      { id: 'breath', anim: 'breath', min: 5, max: 15, windup: 1.05, active: 0.95, recover: 1.0, cd: 6.0, damage: 9, shape: { type: 'cone', radius: 11, angle: 0.9 }, telegraph: 'cone', breath: true, tick: 0.3 },
      { id: 'fireball', anim: 'cast', min: 6, max: 28, windup: 0.95, active: 0.25, recover: 0.9, cd: 4.4, damage: 17, shape: { type: 'circle', radius: 2.6 }, telegraph: 'circle', center: 'target', projectile: 'fireball' },
      { id: 'dive', anim: 'dive', min: 7, max: 40, windup: 1.3, active: 0.5, recover: 1.25, cd: 8.5, damage: 22, shape: { type: 'circle', radius: 4.4 }, telegraph: 'circle', center: 'target', dive: true },
      { id: 'tail', anim: 'tail', min: 0, max: 7, windup: 0.7, active: 0.3, recover: 0.9, cd: 5.2, damage: 15, shape: { type: 'circle', radius: 5.0 }, telegraph: 'circle', center: 'self' },
    ],
    partRewards: { head: 'wyvernWing', tail: 'emberScale', wings: 'wyvernWing' },
  },
  icebehemoth: {
    id: 'icebehemoth',
    name: 'Ice Behemoth',
    title: 'The Frozen Crown',
    hp: 1520,
    speed: 2.3,
    chaseSpeed: 4.1,
    turn: 1.9,
    radius: 2.3,
    preferred: 4.8,
    scale: 1.12,
    palette: { body: 0x9fc4d6, bodyDark: 0x7798ac, belly: 0xe2f2f8, plate: 0x64889c, spikes: 0xeaf8ff, claw: 0xdff4ff, eyes: 0x7fe6ff },
    build: buildIceBehemoth,
    parts: [
      { id: 'head', label: 'HEAD', radius: 1.05, mult: 1.5, hp: 280, material: 'behemothHorn', weak: true, node: 'headHit' },
      { id: 'body', label: 'BODY', radius: 1.9, mult: 0.95, hp: Infinity, material: null, node: 'bodyHit' },
      { id: 'tail', label: 'TAIL', radius: 1.2, mult: 1.15, hp: 230, material: 'frostPlate', node: 'tailHit' },
      { id: 'wings', label: 'SPINES', radius: 1.2, mult: 0.92, hp: 210, material: 'frostPlate', node: 'wingHit' },
    ],
    attacks: [
      { id: 'slam', anim: 'slam', min: 0, max: 8.5, windup: 0.95, active: 0.32, recover: 1.05, cd: 3.6, damage: 18, shape: { type: 'circle', radius: 6.2 }, telegraph: 'circle', center: 'self' },
      { id: 'tail', anim: 'tail', min: 0, max: 8, windup: 0.85, active: 0.34, recover: 1.0, cd: 5.0, damage: 16, shape: { type: 'circle', radius: 5.6 }, telegraph: 'circle', center: 'self' },
      { id: 'shards', anim: 'stomp', min: 6, max: 26, windup: 1.0, active: 0.3, recover: 0.95, cd: 5.4, damage: 13, shape: { type: 'line', length: 22, width: 4.2 }, telegraph: 'line', shards: true },
      { id: 'freeze', anim: 'roar', min: 0, max: 16, windup: 1.25, active: 0.5, recover: 1.0, cd: 9.5, damage: 8, shape: { type: 'circle', radius: 8 }, telegraph: 'circle', center: 'target', freeze: true },
    ],
    partRewards: { head: 'behemothHorn', tail: 'frostPlate', wings: 'frostPlate' },
  },
};

const STUN_PARTICLES = 0x9fd8ff;

export class Monster {
  constructor(scene, game, typeId) {
    this.scene = scene;
    this.game = game;
    this.type = MONSTER_TYPES[typeId];
    if (!this.type) throw new Error('Unknown monster ' + typeId);
    this.id = typeId;
    this.maxHealth = this.type.hp;
    this.health = this.maxHealth;
    this.pos = this.game.arena.monsterStart.clone();
    this.yaw = 0;
    this.state = 'idle';
    this.timer = 0;
    this.think = 0.5;
    this.phase = 'normal';
    this.enraged = false;
    this.tired = false;
    this.dead = false;
    this.dying = false;
    this.deathTimer = 0;
    this.staggerTimer = 0;
    this.staggerMeter = 0;
    this.staggerThreshold = 150;
    this.height = 0;
    this.attack = null;
    this.telegraph = null;
    this.cooldowns = {};
    this.currentSpeed = 0;
    this.walkPhase = 0;
    this.animLean = 0;
    this.animRoll = 0;
    this.animJaw = 0;
    this.animHead = 0;
    this.eyeGlow = 1.3;
    this.flinchTimer = 0;
    this.restCooldown = 0;
    this.tiredTimer = 0;
    this.fleeTimer = 0;
    this.droolTimer = 0;
    this.hitFlash = 0;
    this.footstep = 0;
    this.time = 0;
    this._lastPartPositions = new Map();

    this.parts = this.type.parts.map((p) => ({
      ...p,
      hpMax: p.hp,
      broken: false,
      obj: null,
    }));

    this._construct();
    this._buildParts();
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.scene.add(this.root);
    this.game.ui.setParts(this.parts.map((p) => ({ id: p.id, label: p.label, weak: p.weak })));
  }

  _construct() {
    const rig = this.type.build(this.type.palette);
    this.rig = rig;
    this.root = rig.root;
    this.root.scale.setScalar(this.type.scale);
    this.body = rig.body;
    this.baseY = rig.baseY;
    // eye material references
    this.eyeMats = [];
    rig.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive && o.material.emissive.getHex() === this.type.palette.eyes) {
        this.eyeMats.push(o.material);
      }
    });
  }

  _buildParts() {
    for (const part of this.parts) {
      part.obj = this.rig[part.node] || this.rig.bodyHit;
    }
  }

  getParts() {
    return this.parts;
  }

  get center() {
    return new THREE.Vector3(this.pos.x, 2.2, this.pos.z);
  }

  get barPhase() {
    return this.phase;
  }

  // ------------------------------------------------------------
  update(dt, player) {
    if (this.dead) return;
    this.eyeGlow = damp(this.eyeGlow, this.enraged ? 2.8 : 1.3, 5, dt);
    for (const m of this.eyeMats) m.emissiveIntensity = this.eyeGlow;
    this.flinchTimer = Math.max(0, this.flinchTimer - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);

    for (const k of Object.keys(this.cooldowns)) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
    this.restCooldown = Math.max(0, this.restCooldown - dt);

    if (this.dying) {
      this.deathTimer += dt;
      this._animate(dt, player);
      if (this.deathTimer > 3.6 && !this._deathNotified) {
        this._deathNotified = true;
        this.game.onMonsterDeathEnd?.();
      }
      return;
    }

    if (this.staggerTimer > 0) {
      this.staggerTimer -= dt;
      this.state = 'stagger';
      this.currentSpeed = damp(this.currentSpeed, 0, 8, dt);
      if (this.staggerTimer <= 0) {
        this.state = 'chase';
        this.think = 0.4;
      }
      this._animate(dt, player);
      return;
    }

    const pDist = this._distTo(player);
    const toPlayer = new THREE.Vector2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const ang = Math.atan2(toPlayer.x, toPlayer.y);

    // phase timers
    if (this.tired) {
      this.tiredTimer += dt;
      this.droolTimer += dt;
      if (this.droolTimer > 0.55 && this.state !== 'run') {
        this.droolTimer = 0;
        const mouth = this._mouthPos();
        this.game.fx.burst(mouth, 0xa8d8e8, 2, 0.8, 1, { life: 0.7, gravity: 8, up: 0 });
      }
    }

    switch (this.state) {
      case 'idle':
        this.think -= dt;
        this.currentSpeed = damp(this.currentSpeed, 0, 6, dt);
        if (this.think <= 0) this.state = 'chase';
        this._turnToward(ang, dt, 1.2);
        break;
      case 'chase': {
        this._chase(dt, player, pDist, ang);
        break;
      }
      case 'windup':
        this.currentSpeed = damp(this.currentSpeed, 0, 10, dt);
        this._updateWindup(dt, player);
        break;
      case 'active':
        this._updateActive(dt, player);
        break;
      case 'recover':
        this.currentSpeed = damp(this.currentSpeed, 0, 6, dt);
        this.timer += dt;
        if (this.timer >= (this.attack?.def.recover || 1)) {
          this.state = 'chase';
          this.attack = null;
          this.think = this.enraged ? 0.2 : 0.5;
        }
        break;
      case 'flee':
        this._flee(dt, player);
        break;
      case 'rest':
        this.currentSpeed = damp(this.currentSpeed, 0, 6, dt);
        this.timer += dt;
        this.health = Math.min(this.maxHealth * 0.34, this.health + 16 * dt);
        if (this.timer > 5.5 || this.health >= this.maxHealth * 0.34 - 0.5) {
          this.state = 'chase';
          this.timer = 0;
          this.restCooldown = 12;
          this.think = 0.5;
        }
        break;
      case 'roar':
        // same as windup-free scripted roar
        this.timer += dt;
        if (this.timer > 1.5) { this.state = 'chase'; this.attack = null; }
        break;
      case 'dying':
        break;
    }

    // movement collisions
    if (Math.abs(this.currentSpeed) > 0.05 && (this.state === 'chase' || this.state === 'flee')) {
      const forward = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
      this._move(forward.x * this.currentSpeed * dt, forward.y * this.currentSpeed * dt);
      this.walkPhase += dt * (3 + this.currentSpeed * 1.1);
      this.footstep += dt;
      if (this.footstep > (this.enraged ? 0.34 : 0.46)) {
        this.footstep = 0;
        this.game.audio.monsterStep(0, this.id === 'icebehemoth');
        this.game.fx.dust(new THREE.Vector3(this.pos.x, 0.1, this.pos.z), 2, this.id === 'ice' ? 0xccdde6 : 0x8f8168);
      }
    } else {
      this.walkPhase += dt * 1.2;
    }

    this._animate(dt, player);
  }

  _distTo(player) {
    return Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
  }

  _turnToward(ang, dt, mul = 1) {
    const speed = this.type.turn * mul * (this.enraged ? 1.3 : 1) * (this.tired ? 0.7 : 1);
    const d = angleDiff(ang, this.yaw);
    this.yaw += clamp(d, -speed * dt, speed * dt);
    this.root.rotation.y = this.yaw;
  }

  _move(dx, dz) {
    this.pos.x += dx;
    this.pos.z += dz;
    const arena = this.game.arena;
    const bounds = arena.bounds - 2;
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > bounds) {
      this.pos.x = (this.pos.x / d) * bounds;
      this.pos.z = (this.pos.z / d) * bounds;
    }
    for (const o of arena.obstacles) {
      const dx2 = this.pos.x - o.x, dz2 = this.pos.z - o.z;
      const dist = Math.hypot(dx2, dz2);
      const min = o.r + this.type.radius * 0.8;
      if (dist < min && dist > 0.0001) {
        this.pos.x = o.x + (dx2 / dist) * min;
        this.pos.z = o.z + (dz2 / dist) * min;
      }
    }
    this.root.position.set(this.pos.x, 0, this.pos.z);
  }

  _chase(dt, player, dist, ang) {
    this.think -= dt;
    const tiredMul = this.tired ? 0.62 : 1;
    const enrageMul = this.enraged ? 1.18 : 1;
    const speed = this.type.chaseSpeed * tiredMul * enrageMul;
    const pref = this.type.preferred;

    if (this.tired && this.restCooldown <= 0 && this.tiredTimer > 5) {
      this.state = 'flee';
      this.timer = 0;
      this.fleeDirection = 1;
      this.game.ui.announce('THE BEAST FLEES', 'tired', 1.8);
      return;
    }

    // movement
    if (dist > pref + 1.4) {
      this._turnToward(ang, dt, 1.4);
      this.currentSpeed = damp(this.currentSpeed, speed, 4, dt);
    } else if (dist < pref - 2.2) {
      this._turnToward(ang + Math.PI, dt, 0.6);
      this.currentSpeed = damp(this.currentSpeed, -speed * 0.5, 4, dt);
    } else {
      this._turnToward(ang, dt, 1.2);
      const strafe = Math.sin(this.time * 0.6) > 0 ? 0.55 : -0.55;
      this.currentSpeed = damp(this.currentSpeed, 0, 6, dt);
      // small circling
      const side = new THREE.Vector2(Math.cos(ang), -Math.sin(ang)).multiplyScalar(strafe * 1.1 * tiredMul);
      this._move(side.x * dt, side.y * dt);
    }

    if (this.think <= 0 && dist < 30) {
      const atk = this._chooseAttack(dist);
      if (atk) {
        this._beginAttack(atk, player);
        return;
      }
      this.think = 0.35;
    }
  }

  _flee(dt, player) {
    this.timer += dt;
    const awayAng = Math.atan2(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
    this._turnToward(awayAng, dt, 1.4);
    this.currentSpeed = damp(this.currentSpeed, (this.tired ? 4.4 : 6) * 0.95, 3, dt);
    if (this.timer > 3.4 || this._distTo(player) > 19) {
      this.currentSpeed = 0;
      this.state = 'rest';
      this.timer = 0;
      this.game.ui.announce('RESTING', 'tired', 1.4);
    }
  }

  _chooseAttack(dist) {
    const candidates = this.type.attacks.filter((a) => {
      if (dist < a.min || dist > a.max) return false;
      if ((this.cooldowns[a.id] || 0) > 0) return false;
      if (this.tired && a.id === 'roar') return false;
      return true;
    });
    if (!candidates.length) return null;
    // prefer attacks with good range fit and enrage combos
    candidates.sort((a, b) => {
      const sa = Math.abs(dist - (a.max + a.min) / 2) + Math.random() * 4;
      const sb = Math.abs(dist - (b.max + b.min) / 2) + Math.random() * 4;
      return sa - sb;
    });
    return candidates[0];
  }

  // ------------------------------------------------------------
  _beginAttack(atk, player) {
    this.state = 'windup';
    this.timer = 0;
    this.currentSpeed = 0;
    this.attack = {
      def: atk, phase: 'windup', timer: 0, hit: false, tick: 0,
      target: player.pos.clone(),
      center: atk.center || 'self',
      breathTicks: 0,
    };
    this._turnToward(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), 0.25, 2);
    this.think = 0.25;
    if (atk.telegraph) this._makeTelegraph(atk, player);
    if (atk.id === 'roar') {
      this.game.audio.roar();
      this.game.shake(0.4, 0.4);
    } else if (atk.id === 'fireball' || atk.id === 'breath') {
      this.game.audio.fire();
    } else if (atk.id === 'shards' || atk.id === 'freeze') {
      this.game.audio.ice();
    } else {
      this.game.audio.monsterStep(0, true);
    }
    this.cooldowns[atk.id] = atk.cd * (this.enraged ? 0.72 : 1) * (this.tired ? 1.35 : 1);
  }

  _makeTelegraph(atk, player) {
    const t = atk.shape;
    const yawAt = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    let center = this.pos.clone();
    if (atk.center === 'target') {
      center = this.attack.target.clone();
      // clamp target inside arena
      const d = Math.hypot(center.x, center.z);
      if (d > this.game.arena.bounds - 2) {
        center.x *= (this.game.arena.bounds - 2) / d;
        center.z *= (this.game.arena.bounds - 2) / d;
      }
    }
    const col = this.id === 'firewyvern' ? 0xff5a22 : this.id === 'icebehemoth' ? 0x4fc8ff : 0xff3b22;
    if (atk.telegraph === 'circle') {
      this.telegraph = this.game.fx.telegraphCircle(center, t.radius, atk.windup + atk.active * (atk.breath ? 0.6 : 0.4), col);
    } else if (atk.telegraph === 'cone') {
      this.telegraph = this.game.fx.telegraphCone(this.pos, yawAt, t.radius, t.angle, atk.windup + (atk.breath ? atk.active : 0.1), col);
    } else if (atk.telegraph === 'line') {
      this.telegraph = this.game.fx.telegraphLine(this.pos, yawAt, t.length, t.width, atk.windup + atk.active, col);
      this.attack.lineYaw = yawAt;
    }
    this.attack.telegraphYaw = yawAt;
  }

  _updateWindup(dt, player) {
    const a = this.attack;
    if (!a) { this.state = 'chase'; return; }
    a.timer += dt;
    const def = a.def;
    // slight tracking early in the windup
    if (a.timer < def.windup * (def.track ?? 0.5)) {
      const ang = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      this._turnToward(ang, dt, 0.7);
    }
    // dive rises
    if (def.dive) {
      const t = clamp(a.timer / def.windup, 0, 1);
      this.height = Math.sin(t * Math.PI * 0.5) * 4.2;
      // drift towards target
      if (t > 0.4) {
        const k = 1 - Math.exp(-dt * 3.5);
        this.pos.x = lerp(this.pos.x, a.target.x, k);
        this.pos.z = lerp(this.pos.z, a.target.z, k);
        this.root.position.set(this.pos.x, 0, this.pos.z);
        if (this.telegraph) this.telegraph.mesh.position.set(this.pos.x, 0.045, this.pos.z);
      }
      if (Math.random() < dt * 20) this.game.fx.burst(this._mouthPos(), 0xff8a3a, 2, 1.5, 1, { life: 0.5, gravity: -2 });
    }
    if (a.timer >= def.windup) {
      a.phase = 'active';
      a.timer = 0;
      this.state = 'active';
      this.timer = 0;
      this._removeTelegraph();
      this._attackActiveStart(player);
    }
  }

  _updateActive(dt, player) {
    const a = this.attack;
    if (!a) { this.state = 'recover'; return; }
    const def = a.def;
    a.timer += dt;

    if (def.dash) {
      // charging rush
      const fwd = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
      this._move(fwd.x * def.dash * dt, fwd.y * def.dash * dt);
      this.walkPhase += dt * 15;
      if (Math.random() < dt * 30) this.game.fx.dust(new THREE.Vector3(this.pos.x, 0.15, this.pos.z), 2, 0x8f8168);
      if (!a.hit) {
        const d = this._distTo(player);
        if (d < this.type.radius + 1.1) {
          a.hit = true;
          this.game.player.takeDamage(def.damage, this.pos, true);
          this.game.fx.shockwave(this.pos, 3, 0xffb875, 0.4);
        }
      }
      if (a.timer >= def.active) {
        this.game.fx.shockwave(this.pos, 3.2, 0xbbaa88, 0.5);
        this.game.shake(0.25, 0.2);
      }
    } else if (def.dive) {
      const t = clamp(a.timer / Math.max(0.28, def.active * 0.6), 0, 1);
      this.height = 4.2 * (1 - t);
      if (!a.hit && t >= 1) {
        a.hit = true;
        this.height = 0;
        this.game.fx.shockwave(this.pos, def.shape.radius * 1.4, 0xffa460, 0.6);
        this.game.fx.dust(new THREE.Vector3(this.pos.x, 0.2, this.pos.z), 24, 0x9a7a5a);
        this.game.shake(0.7, 0.4);
        if (this._distTo(player) <= def.shape.radius) this.game.player.takeDamage(def.damage, this.pos, true);
      }
    } else if (def.breath) {
      a.tickTimer = (a.tickTimer || 0) - dt;
      if (a.tickTimer <= 0) {
        a.tickTimer = def.tick || 0.3;
        this._spawnBreath(player);
        if (this._shapeHit(def.shape, player)) {
          this.game.player.takeDamage(def.damage, this.pos, false);
        }
      }
    } else if (def.shards) {
      if (!a.hit) {
        a.hit = true;
        this._spawnShards(player);
      }
    } else if (def.freeze) {
      if (!a.hit) {
        a.hit = true;
        this.game.spawnZone({ pos: a.target.clone(), radius: def.shape.radius, duration: 5.5, dps: def.damage, slow: true, color: 0x6fd8ff });
        this.game.fx.shockwave(a.target, def.shape.radius, 0x6fd8ff, 0.8);
        this.game.audio.ice();
      }
    } else if (!a.hit) {
      a.hit = true;
      if (def.projectile === 'fireball') {
        this._spawnFireball(player);
      } else {
        this._applyMelee(def, player);
      }
    }

    if (a.timer >= def.active) {
      this.state = 'recover';
      this.timer = 0;
      this.currentSpeed = 0;
    }
  }

  _attackActiveStart(player) {
    const def = this.attack.def;
    if (def.anim === 'roar') {
      this.game.audio.roar(true);
      this.game.shake(0.55, 0.5);
      if (this._distTo(player) <= def.shape.radius) this.game.player.stun?.(def.stun || 1.2);
      this.game.fx.shockwave(this.pos, def.shape.radius, 0xffdca0, 0.7);
    }
    if (def.anim === 'slam') {
      this.attack.impactTimer = 0;
    }
    if (def.anim === 'slam') {
      // delayed impact inside active
    }
    if (def.id === 'slam') {
      this.game.fx.dust(new THREE.Vector3(this.pos.x, 0.2, this.pos.z), 16, 0xbfd8e4);
    }
  }

  _applyMelee(def, player) {
    if (def.damage > 0 && this._shapeHit(def.shape, player)) {
      const heavy = !!def.freeze || def.damage >= 16;
      this.game.player.takeDamage(def.damage, this.pos, heavy);
    }
    if (def.shape.type === 'circle') {
      this.game.fx.shockwave(this.pos, def.shape.radius * 0.9, this.id === 'icebehemoth' ? 0x9fe4ff : 0xffb875, 0.45);
      this.game.shake(0.35, 0.22);
      this.game.fx.dust(new THREE.Vector3(this.pos.x, 0.15, this.pos.z), 10, 0x9a8a72);
    } else if (def.shape.type === 'cone') {
      this.game.fx.slashFlash(new THREE.Vector3(this.pos.x, 1.1, this.pos.z), this.yaw, 0xffd7a0, 2.2, 0.4);
    }
  }

  _shapeHit(shape, player) {
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (!shape) return false;
    if (shape.type === 'circle') {
      const center = this.attack?.center === 'target' ? this.attack.target : this.pos;
      const d = Math.hypot(player.pos.x - center.x, player.pos.z - center.z);
      return d <= shape.radius;
    }
    // unreachable guard below kept for shape extension
    if (shape.type === 'cone') {
      if (dist > shape.radius) return false;
      const ang = Math.atan2(dx, dz);
      return Math.abs(angleDiff(ang, this.yaw)) <= shape.angle / 2;
    }
    if (shape.type === 'line') {
      const fwd = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
      const rel = new THREE.Vector2(dx, dz);
      const along = rel.dot(fwd);
      if (along < 0 || along > shape.length) return false;
      const perp = Math.abs(rel.x * fwd.y - rel.y * fwd.x);
      return perp <= shape.width / 2;
    }
    return false;
  }

  _spawnFireball(player) {
    const from = this._mouthPos();
    const to = this.attack?.center === 'target'
      ? new THREE.Vector3(this.attack.target.x, 1.0, this.attack.target.z)
      : new THREE.Vector3(player.pos.x, 1.0, player.pos.z);
    const radius = this.attack?.def.shape.radius || 2.6;
    this.game.spawnProjectile({
      from, to, speed: 17, radius: 1.1, damage: this.attack.def.damage,
      color: 0xff7a2a, type: 'fire', onHit: (pos) => {
        this.game.fx.burst(pos, 0xff8a3a, 26, 7, 1, { life: 0.7, gravity: -2, spread: 1.4 });
        this.game.fx.shockwave(pos, radius * 1.3, 0xff7a2a, 0.55);
        this.game.shake(0.35, 0.25);
        this.game.audio.fire();
        if (Math.hypot(this.game.player.pos.x - pos.x, this.game.player.pos.z - pos.z) < radius + 0.5) {
          this.game.player.takeDamage(this.attack.def.damage, pos, true);
        }
      },
    });
    this.game.audio.fire();
  }

  _spawnBreath(player) {
    const from = this._mouthPos();
    const fwd = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
    for (let i = 1; i <= 8; i++) {
      const d = 1.5 + i * 1.15;
      const p = new THREE.Vector3(
        this.pos.x + fwd.x * d + rng(-0.6, 0.6),
        rng(0.5, 2.0),
        this.pos.z + fwd.y * d + rng(-0.6, 0.6)
      );
      this.game.fx.burst(p, i % 2 ? 0xff7a2a : 0xffc04a, 2, 1.6, 1, { life: 0.55, gravity: -3, up: 0.2 });
    }
    this.game.fx.burst(from, 0xffb04a, 4, 3, 1, { life: 0.35, gravity: 0, up: 0.4 });
  }

  _spawnShards(player) {
    const from = this._mouthPos();
    const dir = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z).normalize();
    const baseYaw = Math.atan2(dir.x, dir.z);
    for (let i = 0; i < 7; i++) {
      const offset = (i - 3) * 0.09;
      const yaw = baseYaw + offset;
      const d = 5 + i * 1.7;
      const pos = new THREE.Vector3(this.pos.x + Math.sin(yaw) * d, 0, this.pos.z + Math.cos(yaw) * d);
      setTimeout(() => {
        if (this.dead) return;
        this.game.fx.burst(new THREE.Vector3(pos.x, 0.4, pos.z), 0x9fe4ff, 10, 3.4, 1, { life: 0.55, gravity: 10, up: 0.9 });
        this.game.fx.shockwave(pos, 1.6, 0x8fdcff, 0.4);
        this.game.audio.ice();
        if (Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z) < 1.9) {
          this.game.player.takeDamage(this.attack?.def?.damage || 12, pos, false);
        }
      }, 120 + i * 55);
    }
    this.game.audio.ice();
  }

  _mouthPos() {
    const v = new THREE.Vector3(0, 0.2, 1.2);
    if (this.rig.head) this.rig.head.localToWorld(v);
    else v.set(this.pos.x, 2, this.pos.z + 2);
    return v;
  }

  // ------------------------------------------------------------
  damage(partId, amount, opts = {}) {
    if (this.dead || this.dying) return null;
    const part = this.parts.find((p) => p.id === partId) || this.parts[1];
    let dmg = amount * part.mult * (this.staggerTimer > 0 ? 1.18 : 1);
    this.health = Math.max(0, this.health - dmg);
    this.staggerMeter += amount * 0.42 * (opts.finisher ? 1.5 : 1) * (opts.charged ? 1.4 : 1);
    this.flinchTimer = 0.24;
    this.hitFlash = 1;

    let broke = false;
    if (!part.broken && part.hp !== Infinity) {
      part.hp -= dmg;
      if (part.hp <= 0) {
        part.broken = true;
        broke = true;
        this.staggerMeter += 60;
        this.game.onPartBreak?.(part, this);
        this.game.ui.announce(`${part.label} BROKEN`, '', 1.5);
        this.game.audio.partBreak();
        this.game.fx.burst(part.obj.getWorldPosition(new THREE.Vector3()), 0xffd98a, 24, 5, 1, { life: 0.8, gravity: 8, up: 0.8 });
        this.game.shake(0.4, 0.25);
      }
    }

    let staggered = false;
    if (this.staggerMeter >= this.staggerThreshold && !this.dying) {
      this.staggerMeter = 0;
      this.staggerThreshold += 25;
      this.staggerTimer = 2.1;
      this.state = 'stagger';
      staggered = true;
      this._cancelAttack();
      this._removeTelegraph();
      this.game.ui.announce('STAGGER!', '', 1.4);
      this.game.audio.roar();
      this.game.shake(0.5, 0.3);
      this.game.fx.burst(this.center, 0xffd98a, 18, 4, 1, { life: 0.6, gravity: 6 });
    }

    let enragedNow = false;
    if (!this.enraged && this.health <= this.maxHealth * 0.5) {
      this.enraged = true;
      this.phase = 'enraged';
      enragedNow = true;
      this.eyeGlow = 3;
      this._cancelAttack();
      this._removeTelegraph();
      this.state = 'roar';
      this.timer = 0;
      this.game.ui.announce('ENRAGED', 'enraged', 2.0);
      this.game.audio.roar(true);
      this.game.shake(0.65, 0.5);
      this.game.setMusicIntensity(2);
      this.game.fx.shockwave(this.pos, 9, 0xff5a2a, 0.8);
      this.game.fx.burst(this.center, 0xff5a2a, 30, 6, 1, { life: 0.9, gravity: -1 });
    }

    let tiredNow = false;
    if (!this.tired && this.health > 0 && this.health <= this.maxHealth * 0.2) {
      this.tired = true;
      this.phase = 'tired';
      tiredNow = true;
      this.state = 'chase';
      this.tiredTimer = 0;
      this.game.ui.announce('EXHAUSTED', 'tired', 2.0);
      this.game.audio.notify();
    }

    if (this.health <= 0 && !this.dying) {
      this._die();
    }

    return { damage: dmg, broke, staggered, enragedNow, tiredNow, health: this.health };
  }

  _cancelAttack() {
    this.attack = null;
    this.currentSpeed = 0;
    if (this.state === 'active' || this.state === 'windup') this.state = 'chase';
    this.timer = 0;
  }

  _removeTelegraph() {
    if (this.telegraph) {
      this.scene.remove(this.telegraph.mesh);
      this.game.fx.effects = this.game.fx.effects.filter((e) => e !== this.telegraph);
      this.telegraph = null;
    }
  }

  _die() {
    this.dying = true;
    this.state = 'dying';
    this.deathTimer = 0;
    this.health = 0;
    this._removeTelegraph();
    this._cancelAttack();
    this.game.onMonsterDeath(this);
    this.game.audio.roar();
    this.game.shake(0.8, 0.6);
  }

  // ------------------------------------------------------------
  _animate(dt, player) {
    const rig = this.rig;
    const t = this.time = (this.time || 0) + dt;
    const moving = Math.abs(this.currentSpeed) > 0.3;
    const step = moving ? Math.sin(this.walkPhase) : 0;
    const step2 = moving ? Math.cos(this.walkPhase) : 0;
    const tiredMul = this.tired ? 0.55 : 1;

    for (const leg of rig.legs) {
      const phase = Math.sin(this.walkPhase + leg.phase) * 0.5 * (moving ? 1 : 0.15) * tiredMul;
      const target = phase;
      leg.pivot.rotation.x = damp(leg.pivot.rotation.x, target, 10, dt);
    }

    // tail sway
    if (rig.tail) {
      for (let i = 0; i < rig.tail.length; i++) {
        const sway = Math.sin(t * (this.enraged ? 3.4 : 2.2) - i * 0.7) * (0.12 + i * 0.035);
        const charge = this.state === 'windup' && this.attack?.def.anim === 'tail' ? 0.35 : 0;
        rig.tail[i].rotation.y = damp(rig.tail[i].rotation.y, sway + (i === 0 ? charge : 0), 6, dt);
        rig.tail[i].rotation.x = damp(rig.tail[i].rotation.x, Math.sin(t * 1.3 - i * 0.5) * 0.04 - 0.05, 5, dt);
      }
    }
    // wings
    for (const w of rig.wings) {
      let flap = Math.sin(t * 1.6 * (this.enraged ? 1.6 : 1)) * 0.12;
      if (this.id === 'firewyvern') {
        if (this.state === 'windup' && this.attack?.def.dive) flap = Math.sin(t * 14) * 0.7;
        else if (this.state === 'windup') flap = Math.sin(t * 9) * 0.45;
        else if (this.height > 0.1) flap = Math.sin(t * 12) * 0.55;
      }
      w.pivot.rotation.z = damp(w.pivot.rotation.z, w.side * (0.45 + flap), 6, dt);
    }

    // body motion
    let bodyY = this.baseY + (this.height || 0);
    let lean = 0, roll = 0, headTilt = 0, jawOpen = 0.04;
    const bob = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : Math.sin(t * 1.7) * 0.02;
    bodyY += bob;
    if (this.tired) { headTilt += 0.28; lean += 0.04; }
    if (this.flinchTimer > 0) { lean -= this.flinchTimer * 0.6; roll += this.flinchTimer * 0.22; }
    if (this.staggerTimer > 0) { lean += 0.25; headTilt += 0.4; roll += 0.12; }
    if (this.state === 'roar') { headTilt -= 0.55; jawOpen = 0.7; lean -= 0.1; }
    if (this.state === 'windup' && this.attack) {
      const d = this.attack.def;
      lean -= 0.14;
      headTilt -= 0.3;
      jawOpen = 0.35;
      if (d.anim === 'slam') { lean -= 0.25; bodyY += 0.25; }
      if (d.anim === 'dive') { lean -= 0.2; }
      if (d.anim === 'tail') { roll += 0.18; }
    }
    if (this.state === 'active' && this.attack) {
      const d = this.attack.def;
      lean += 0.18;
      headTilt += 0.35;
      jawOpen = 0.5;
      if (d.anim === 'breath') { headTilt += 0.15; jawOpen = 0.75; }
      if (d.anim === 'slam') { lean += 0.2; bodyY -= 0.25; }
      if (d.anim === 'tail') { roll -= 0.25; }
      if (d.anim === 'charge') { lean += 0.25; }
    }
    if (this.dying || this.dead) {
      const p = Math.min(1, this.deathTimer / 1.4);
      roll = 1.25 * p;
      bodyY = this.baseY - 1.0 * p;
      headTilt += 0.5 * p;
    }

    rig.body.position.y = damp(rig.body.position.y, bodyY, this.height > 0.1 ? 12 : 8, dt);
    rig.body.rotation.x = damp(rig.body.rotation.x, lean, 8, dt);
    rig.body.rotation.z = damp(rig.body.rotation.z, roll, 7, dt);

    if (rig.head) {
      rig.head.rotation.x = damp(rig.head.rotation.x, (this.id === 'forestdrake' ? 0.82 : 0.62) + headTilt, 7, dt);
      rig.head.rotation.y = damp(rig.head.rotation.y, Math.sin(t * 0.9) * 0.08, 4, dt);
    }
    if (rig.jaw) rig.jaw.rotation.x = damp(rig.jaw.rotation.x, jawOpen, 9, dt);

    // mouth glow while charging fire
    if (this.state === 'windup' && (this.attack?.def.id === 'fireball' || this.attack?.def.id === 'breath') && Math.random() < dt * 30) {
      this.game.fx.burst(this._mouthPos(), 0xffa040, 2, 1.2, 1, { life: 0.4, gravity: -3 });
    }

    // ice aura / enraged embers
    if (this.enraged && Math.random() < dt * 12) {
      this.game.fx.burst(new THREE.Vector3(this.pos.x + rng(-1, 1), rng(1.5, 3.5), this.pos.z + rng(-1, 1)), 0xff6a2a, 1, 1.2, 1, { life: 0.7, gravity: -1.5 });
    }

    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.yaw;
  }

  destroy() {
    this._removeTelegraph();
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
