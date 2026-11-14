/* ============================================================
   World objects — movable platforms, gates, portals,
   checkpoints and shard collectibles.
   ============================================================ */
import * as THREE from 'three';
import { makeRadialTexture, makeGlowSprite, damp, clamp, rand } from '../Utils.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GLOW_TEX = makeRadialTexture(96, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.15);

/* ---------------- moving platform ---------------- */
export class MovingPlatform {
  constructor(world, mesh, size, opts = {}) {
    this.world = world;
    this.mesh = mesh;
    this.size = size.clone();
    this.base = mesh.position.clone();
    this.axis = (opts.axis || V3(0, 1, 0)).clone().normalize();
    this.amplitude = opts.amplitude ?? 2;
    this.speed = opts.speed ?? 1;
    this.phase = opts.phase ?? 0;
    this.zone = opts.zone || 'meadow';
    this.delta = V3();
    this.prevPos = mesh.position.clone();
    this.collider = { box: new THREE.Box3(), kind: 'moving', active: true, platform: this };
    this._updateBox();
    world.colliders.push(this.collider);
    world.movingPlatforms.push(this);
  }

  _updateBox() {
    this.collider.box.setFromCenterAndSize(this.mesh.position, this.size);
  }

  update(time, dt) {
    this.prevPos.copy(this.mesh.position);
    const offset = Math.sin(time * this.speed + this.phase) * this.amplitude;
    this.mesh.position.copy(this.base).addScaledVector(this.axis, offset);
    this.delta.copy(this.mesh.position).sub(this.prevPos);
    this._updateBox();
  }
}

/* ---------------- ancient gate ---------------- */
export class Gate {
  constructor(world, {
    id, zone = 'meadow', position = V3(), width = 12, height = 7, depth = 1.0,
  }) {
    this.world = world;
    this.id = id;
    this.zone = zone;
    this.width = width;
    this.height = height;
    this.open = 0;
    this.target = 0;
    this.instant = false;

    const group = new THREE.Group();
    group.position.copy(position);
    const stone = world.materials.stoneDark;
    const metal = world.materials.darkMetal;

    // flanking pillars
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.5, height + 1.2, 1.8), stone);
      pillar.position.set(sx * (width / 2 + 0.2), (height + 1.2) / 2, 0);
      pillar.castShadow = pillar.receiveShadow = true;
      group.add(pillar);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 2.2), stone);
      cap.position.set(sx * (width / 2 + 0.2), height + 1.2, 0);
      cap.castShadow = true;
      group.add(cap);
      // glowing rune strip
      const rune = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, height * 0.55, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.65, toneMapped: false })
      );
      rune.position.set(sx * (width / 2 + 0.2) - sx * 0.77, height * 0.5, 0.9);
      group.add(rune);
    }

    // arch
    const arch = new THREE.Mesh(new THREE.BoxGeometry(width + 2.2, 1.2, 1.9), stone);
    arch.position.set(0, height + 1.35, 0);
    arch.castShadow = arch.receiveShadow = true;
    group.add(arch);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.2, 4), world.materials.gold);
    crest.rotation.y = Math.PI / 4;
    crest.position.set(0, height + 2.9, 0);
    crest.castShadow = true;
    group.add(crest);

    // portcullis
    this.bars = new THREE.Group();
    this.bars.position.y = 0;
    const barGeo = new THREE.BoxGeometry(0.18, height, 0.22);
    for (let i = 0; i < 9; i++) {
      const bar = new THREE.Mesh(barGeo, metal);
      bar.position.set(-width / 2 + 0.75 + i * ((width - 1.5) / 8), height / 2, 0);
      bar.castShadow = true;
      this.bars.add(bar);
    }
    const crossGeo = new THREE.BoxGeometry(width - 1.0, 0.16, 0.24);
    for (let j = 1; j <= 4; j++) {
      const cross = new THREE.Mesh(crossGeo, metal);
      cross.position.set(0, (height / 4) * j, 0);
      this.bars.add(cross);
    }
    // runes on the portcullis
    const runeMat = new THREE.MeshBasicMaterial({ color: 0xffb864, transparent: true, opacity: 0.7, toneMapped: false });
    for (let j = 0; j < 3; j++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.32 + j * 0.16, 0.035, 5, 18, Math.PI * 1.3), runeMat);
      r.rotation.z = 0.3 + j;
      r.position.set(0, height * 0.5 + j * 0.18, 0.18);
      this.bars.add(r);
    }
    group.add(this.bars);
    this.group = group;
    world.scene.add(group);

    // collision is wider than the bars so the player can't slip around
    this.collider = { box: new THREE.Box3(), kind: 'gate', active: true, gate: this };
    this.collider.box.setFromCenterAndSize(
      V3(position.x, position.y + height / 2, position.z),
      V3(width + 1.8, height, depth + 1.2)
    );
    world.colliders.push(this.collider);
    world.gates.push(this);
    this.runeMat = runeMat;
  }

  setOpen(open, instant = false) {
    this.target = open ? 1 : 0;
    if (instant) {
      this.open = this.target;
      this._apply();
    }
  }

  _apply() {
    this.bars.position.y = this.open * (this.height + 1.4);
    this.collider.active = this.open < 0.55;
    this.runeMat.opacity = (1 - this.open) * 0.7;
  }

  update(dt) {
    if (this.open !== this.target) {
      this.open = damp(this.open, this.target, 2.2, dt);
      if (Math.abs(this.open - this.target) < 0.002) this.open = this.target;
      this._apply();
    }
  }
}

/* ---------------- zone portal ---------------- */
const PORTAL_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uUnlocked;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
  }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float swirl = noise(vec2(a * 2.4 + uTime * 0.7, r * 6.0 - uTime * 1.4));
    float swirl2 = noise(vec2(a * 4.0 - uTime * 0.4, r * 11.0 + uTime * 0.9));
    vec3 col = mix(uColorA, uColorB, swirl * 0.8 + 0.15);
    col += uColorB * pow(swirl2, 3.0) * 0.9;
    float edge = smoothstep(1.0, 0.78, r);
    float core = smoothstep(0.6, 0.0, r) * 0.5;
    float alpha = (0.34 + swirl * 0.3 + core) * edge;
    if (uUnlocked < 0.5) alpha *= 0.25;
    gl_FragColor = vec4(col, alpha);
  }
`;

export class Portal {
  constructor(world, {
    id, zone, targetZone, position = V3(), unlocked = false, label = '',
    colorA = 0x6ff5e7, colorB = 0xffe2a0,
  }) {
    this.world = world;
    this.id = id;
    this.zone = zone;
    this.targetZone = targetZone;
    this.position = position.clone();
    this.unlocked = unlocked;
    this.label = label;
    this.cooldown = 0;
    this.time = rand(0, 10);

    const group = new THREE.Group();
    group.position.copy(position);
    this.group = group;

    const baseMat = world.materials.stoneDark;
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.5, 24), baseMat);
    dais.position.y = 0.25;
    dais.receiveShadow = dais.castShadow = true;
    group.add(dais);
    const ringBase = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.12, 6, 48), world.materials.gold);
    ringBase.rotation.x = Math.PI / 2;
    ringBase.position.y = 0.55;
    group.add(ringBase);

    // runic outer ring
    this.ringMat = new THREE.MeshStandardMaterial({
      color: 0xd8cbb0, emissive: new THREE.Color(0x2a6f73), emissiveIntensity: 0.3,
      metalness: 0.65, roughness: 0.35,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.85, 0.2, 8, 64), this.ringMat);
    ring.position.y = 3.4;
    group.add(ring);
    this.ring = ring;

    const glyphMat = new THREE.MeshBasicMaterial({ color: 0x8ff7ec, transparent: true, opacity: 0.25, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glyphs = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const g = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 4, 10, Math.PI * 1.4), glyphMat);
      g.position.set(Math.cos(angle) * 2.85, Math.sin(angle) * 2.85, 0);
      g.rotation.z = angle + Math.PI / 2;
      this.glyphs.add(g);
    }
    this.glyphs.position.y = 3.4;
    group.add(this.glyphs);
    this.glyphMat = glyphMat;

    // swirling face
    this.innerUniforms = {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uUnlocked: { value: unlocked ? 1 : 0 },
    };
    const innerMat = new THREE.ShaderMaterial({
      uniforms: this.innerUniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: PORTAL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const inner = new THREE.Mesh(new THREE.CircleGeometry(2.75, 48), innerMat);
    inner.position.set(0, 3.4, 0.08);
    group.add(inner);
    this.inner = inner;

    this.glow = makeGlowSprite({ color: colorA, size: 10, opacity: unlocked ? 0.36 : 0.06, texture: GLOW_TEX });
    this.glow.position.set(0, 3.4, 0.2);
    group.add(this.glow);

    this.light = new THREE.PointLight(colorA, unlocked ? 2.2 : 0.2, 20, 2);
    this.light.position.set(0, 3.4, 1.4);
    group.add(this.light);

    // marker beam visible from afar
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.6, 26, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: colorA, transparent: true, opacity: unlocked ? 0.11 : 0.02, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    this.beam.position.y = 14;
    group.add(this.beam);

    world.scene.add(group);
    world.portals.push(this);
    this.setUnlocked(unlocked, true);
  }

  setUnlocked(unlocked, instant = false) {
    this.unlocked = unlocked;
    this.innerUniforms.uUnlocked.value = unlocked ? 1 : 0;
    this.ringMat.emissive.set(unlocked ? 0x2fbdb8 : 0x1a2f33);
    this.ringMat.emissiveIntensity = unlocked ? 1.4 : 0.25;
    this.glyphMat.opacity = unlocked ? 0.9 : 0.15;
    this.glow.material.opacity = unlocked ? 0.38 : 0.05;
    this.light.intensity = unlocked ? 2.2 : 0.15;
    this.beam.material.opacity = unlocked ? 0.1 : 0.015;
  }

  update(dt) {
    this.time += dt;
    this.innerUniforms.uTime.value = this.time;
    this.glyphs.rotation.z += dt * (this.unlocked ? 0.4 : 0.06);
    this.ring.rotation.z -= dt * (this.unlocked ? 0.15 : 0.03);
    const pulse = 0.85 + Math.sin(this.time * 2.2) * 0.15;
    this.light.intensity = (this.unlocked ? 2.2 : 0.15) * pulse;
    this.glow.material.opacity = (this.unlocked ? 0.36 : 0.05) * pulse;
    if (this.beam) this.beam.material.opacity = (this.unlocked ? 0.11 : 0.012) * (0.8 + Math.sin(this.time * 1.3) * 0.2);
    if (this.cooldown > 0) this.cooldown -= dt;
  }

  isPlayerInside(pos) {
    if (this.cooldown > 0) return false;
    const dx = pos.x - this.position.x, dz = pos.z - this.position.z;
    return dx * dx + dz * dz < 3.2 * 3.2 && Math.abs(pos.y - this.position.y) < 5;
  }
}

/* ---------------- checkpoint shrine ---------------- */
export class Checkpoint {
  constructor(world, { id, zone, position = V3(), name = 'Shrine' }) {
    this.world = world;
    this.id = id;
    this.zone = zone;
    this.name = name;
    this.position = position.clone();
    this.activated = false;
    this.time = rand(0, 10);

    const group = new THREE.Group();
    group.position.copy(position);
    this.group = group;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.7, 0.35, 16), world.materials.stone);
    base.position.y = 0.17; base.castShadow = base.receiveShadow = true;
    group.add(base);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 16), world.materials.stoneDark);
    inner.position.y = 0.38; inner.receiveShadow = true;
    group.add(inner);

    this.crystalMat = new THREE.MeshStandardMaterial({
      color: 0x507a7c, emissive: new THREE.Color(0x2a6f73), emissiveIntensity: 0.4,
      roughness: 0.2, metalness: 0.25, transparent: true, opacity: 0.9,
    });
    this.shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), this.crystalMat);
    this.shard.position.y = 1.55;
    this.shard.castShadow = true;
    group.add(this.shard);

    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x7ff5e7, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.025, 4, 32), this.ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.45;
    group.add(this.ring);

    this.glow = makeGlowSprite({ color: 0x9ff9ee, size: 3.2, opacity: 0.2, texture: GLOW_TEX });
    this.glow.position.y = 1.5;
    group.add(this.glow);

    this.light = new THREE.PointLight(0x9ff9ee, 0.25, 10, 2);
    this.light.position.y = 1.5;
    group.add(this.light);

    world.scene.add(group);
    world.checkpoints.push(this);
  }

  activate() {
    if (this.activated) return false;
    this.activated = true;
    this.crystalMat.color.set(0xffd98a);
    this.crystalMat.emissive.set(0xffb35c);
    this.crystalMat.emissiveIntensity = 1.8;
    this.ringMat.color.set(0xffdc93);
    this.ringMat.opacity = 0.7;
    this.glow.material.color.set(0xffdda0);
    this.glow.material.opacity = 0.42;
    this.light.color.set(0xffce74);
    this.light.intensity = 1.1;
    return true;
  }

  reset() {
    this.activated = false;
    this.crystalMat.color.set(0x507a7c);
    this.crystalMat.emissive.set(0x2a6f73);
    this.crystalMat.emissiveIntensity = 0.4;
    this.ringMat.color.set(0x7ff5e7);
    this.ringMat.opacity = 0.25;
    this.glow.material.color.set(0x9ff9ee);
    this.glow.material.opacity = 0.2;
    this.light.color.set(0x9ff9ee);
    this.light.intensity = 0.25;
  }

  update(dt) {
    this.time += dt;
    this.shard.position.y = 1.55 + Math.sin(this.time * 1.6) * 0.12;
    this.shard.rotation.y += dt * 0.9;
    this.ring.rotation.z += dt * 0.6;
    const p = 0.75 + Math.sin(this.time * 2.4) * 0.25;
    this.glow.material.opacity = (this.activated ? 0.42 : 0.2) * p;
    this.light.intensity = (this.activated ? 1.1 : 0.25) * p;
  }
}

/* ---------------- collectible shard ---------------- */
export class Gem {
  constructor(world, { id, zone, position = V3(), color = 0x8ff7ec, kind = 'shard' }) {
    this.world = world;
    this.id = id;
    this.zone = zone;
    this.position = position.clone();
    this.collected = false;
    this.time = rand(0, 10);
    this.color = color;

    const group = new THREE.Group();
    group.position.copy(position);
    this.group = group;

    this.coreMat = new THREE.MeshPhysicalMaterial({
      color, emissive: new THREE.Color(color).multiplyScalar(0.55), emissiveIntensity: 1.6,
      metalness: 0.1, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04,
      transparent: true, opacity: 0.94, envMapIntensity: 1.8,
    });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(kind === 'heart' ? 0.4 : 0.32, 0), this.coreMat);
    this.core.castShadow = true;
    group.add(this.core);

    const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.018, 4, 28), haloMat);
    this.halo.rotation.x = Math.PI / 2.2;
    group.add(this.halo);

    this.glow = makeGlowSprite({ color, size: 2.3, opacity: 0.45, texture: GLOW_TEX });
    group.add(this.glow);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.11, 3.2, 5, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    beam.position.y = 1.3;
    group.add(beam);
    this.beam = beam;

    world.scene.add(group);
    world.gems.push(this);
  }

  collect() {
    if (this.collected) return false;
    this.collected = true;
    this.group.visible = false;
    return true;
  }

  restore() {
    this.collected = false;
    this.group.visible = true;
  }

  update(dt) {
    if (this.collected) return;
    this.time += dt;
    this.core.position.y = Math.sin(this.time * 2.1) * 0.16;
    this.core.rotation.y += dt * 1.8;
    this.core.rotation.z = Math.sin(this.time * 0.7) * 0.18;
    this.halo.position.y = this.core.position.y;
    this.halo.rotation.z -= dt * 0.9;
    this.halo.rotation.y += dt * 0.4;
    const p = 0.8 + Math.sin(this.time * 3.1) * 0.2;
    this.glow.material.opacity = 0.4 * p;
    this.beam.material.opacity = 0.1 * p;
  }
}

/* ---------------- world-space rune decal ---------------- */
export class RuneCircle {
  constructor(world, { position = V3(), radius = 9, color = 0xffd28a, opacity = 0.5, speed = 0.05 }) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.mat = mat;
    for (const r of [radius, radius * 0.72, radius * 0.34]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.035, r, 96), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      this.group.add(ring);
    }
    // radial glyphs
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const g = new THREE.Mesh(new THREE.PlaneGeometry(0.14, Math.min(0.9, radius * 0.12)), mat);
      g.rotation.x = -Math.PI / 2;
      g.rotation.z = -a;
      g.position.set(Math.cos(a) * radius * 0.85, 0.035, Math.sin(a) * radius * 0.85);
      this.group.add(g);
    }
    this.speed = speed;
    world.scene.add(this.group);
    world.runeCircles.push(this);
  }

  update(dt, time) {
    this.group.rotation.y = time * this.speed;
    const p = 0.65 + Math.sin(time * 1.1) * 0.2;
    this.mat.opacity = p * 0.65;
  }
}
