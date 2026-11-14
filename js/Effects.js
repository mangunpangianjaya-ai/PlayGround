/* ============================================================
   Effects — GPU point particles, ambient fields, shockwaves,
   slash arcs, lightning, camera shake and hit feedback.
   ============================================================ */
import * as THREE from 'three';
import { makeRadialTexture, rand, randInt, pick, clamp, lerp } from './Utils.js';

const GLOW = makeRadialTexture(128, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.16);
const PETAL = makeRadialTexture(64, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.55);

const POINT_VERT = /* glsl */`
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 1.0, 180.0);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;
const POINT_FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

class ParticlePool {
  constructor(scene, max = 1800) {
    this.max = max;
    this.cursor = 0;
    this.data = [];
    const positions = new Float32Array(max * 3);
    const colors = new Float32Array(max * 3);
    const sizes = new Float32Array(max);
    const alphas = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: GLOW },
        uScale: { value: 620 },
      },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }

  spawn(opts) {
    const {
      position, count = 12, speed = 4, speedVar = 0.7, direction = null, spread = 1,
      size = 0.2, sizeVar = 0.5, life = 0.6, lifeVar = 0.4, gravity = -6,
      drag = 1.4, colors = [0xffe3a0], posVar = 0.1,
    } = opts;
    const col = new THREE.Color();
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      let d;
      if (direction) {
        d = direction.clone().normalize();
        d.x += rand(-spread, spread);
        d.y += rand(-spread, spread);
        d.z += rand(-spread, spread);
        d.normalize();
      } else {
        const theta = rand(0, Math.PI * 2);
        const phi = Math.acos(rand(-1, 1));
        d = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      }
      const sp = speed * (1 + rand(-speedVar, speedVar));
      const p = this.data[i] || (this.data[i] = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0, color: new THREE.Color(), gravity: 0, drag: 1 });
      p.pos.set(
        position.x + rand(-posVar, posVar),
        position.y + rand(-posVar, posVar),
        position.z + rand(-posVar, posVar)
      );
      p.vel.copy(d).multiplyScalar(sp);
      p.life = p.maxLife = life * (1 + rand(-lifeVar, lifeVar));
      p.size = size * (1 + rand(-sizeVar, sizeVar));
      p.color.set(pick(colors));
      p.gravity = gravity;
      p.drag = drag;
    }
  }

  update(dt) {
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.aColor.array;
    const siz = this.geo.attributes.aSize.array;
    const alp = this.geo.attributes.aAlpha.array;
    for (let i = 0; i < this.max; i++) {
      const p = this.data[i];
      if (!p || p.life <= 0) {
        alp[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) { alp[i] = 0; continue; }
      const damp = Math.exp(-p.drag * dt);
      p.vel.multiplyScalar(damp);
      p.vel.y += p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      pos[i * 3] = p.pos.x; pos[i * 3 + 1] = p.pos.y; pos[i * 3 + 2] = p.pos.z;
      col[i * 3] = p.color.r; col[i * 3 + 1] = p.color.g; col[i * 3 + 2] = p.color.b;
      siz[i] = p.size * (0.5 + t * 0.6);
      alp[i] = Math.pow(t, 0.7);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

class AmbientField {
  constructor(scene, { count = 200, size = 0.05, color = 0xffe9b0, range = 38, height = 14, mode = 'dust', map = GLOW, opacity = 1 }) {
    this.scene = scene;
    this.count = count;
    this.range = range;
    this.height = height;
    this.mode = mode;
    this.opacity = opacity;
    this.base = [];
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const b = new THREE.Vector3(rand(-range, range), rand(0, height), rand(-range, range));
      this.base.push({
        pos: b.clone(),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.25, 1),
        size: size * rand(0.6, 1.6),
        color: c.clone().set(color).offsetHSL(rand(-0.03, 0.03), rand(-0.05, 0.05), rand(-0.08, 0.08)),
        alpha: rand(0.35, 1),
      });
      positions[i * 3] = b.x; positions[i * 3 + 1] = b.y; positions[i * 3 + 2] = b.z;
      colors[i * 3] = this.base[i].color.r; colors[i * 3 + 1] = this.base[i].color.g; colors[i * 3 + 2] = this.base[i].color.b;
      sizes[i] = this.base[i].size;
      alphas[i] = this.base[i].alpha;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 620 } },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.time = rand(0, 100);
  }

  update(dt, playerPos) {
    this.time += dt;
    const pos = this.geo.attributes.position.array;
    const alp = this.geo.attributes.aAlpha.array;
    for (let i = 0; i < this.count; i++) {
      const b = this.base[i];
      let x, y, z;
      if (this.mode === 'dust') {
        b.pos.x += Math.sin(this.time * 0.16 + b.phase) * dt * 0.22;
        b.pos.y += Math.cos(this.time * 0.22 + b.phase) * dt * 0.16;
        b.pos.z += Math.sin(this.time * 0.13 + b.phase * 2) * dt * 0.18;
        x = b.pos.x + playerPos.x; y = b.pos.y; z = b.pos.z + playerPos.z;
        // wrap horizontally around player
        const dx = x - playerPos.x, dz = z - playerPos.z;
        if (Math.abs(dx) > this.range) { b.pos.x -= Math.sign(dx) * this.range * 2; }
        if (Math.abs(dz) > this.range) { b.pos.z -= Math.sign(dz) * this.range * 2; }
        x = b.pos.x + playerPos.x; z = b.pos.z + playerPos.z;
        if (y < -2) b.pos.y += this.height + 2;
        alp[i] = b.alpha * (0.55 + 0.45 * Math.sin(this.time * 0.7 + b.phase)) * this.opacity;
      } else if (this.mode === 'firefly') {
        x = b.pos.x + Math.sin(this.time * 0.35 * b.speed + b.phase) * 2.2 + playerPos.x;
        y = b.pos.y + Math.sin(this.time * 0.6 * b.speed + b.phase * 2) * 0.9 + 0.4;
        z = b.pos.z + Math.cos(this.time * 0.3 * b.speed + b.phase) * 2.2 + playerPos.z;
        alp[i] = b.alpha * (0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(this.time * b.speed + b.phase)), 4)) * this.opacity;
      } else if (this.mode === 'petal') {
        b.pos.y -= dt * 0.45 * b.speed;
        b.pos.x += Math.sin(this.time * 0.5 + b.phase) * dt * 0.5;
        b.pos.z += Math.cos(this.time * 0.4 + b.phase) * dt * 0.35;
        if (b.pos.y < 0) b.pos.y = this.height;
        x = b.pos.x + playerPos.x; y = b.pos.y; z = b.pos.z + playerPos.z;
        alp[i] = b.alpha * 0.55 * this.opacity;
      } else if (this.mode === 'mote') {
        b.pos.y += dt * 0.28 * b.speed;
        if (b.pos.y > this.height) b.pos.y = 0;
        x = b.pos.x + playerPos.x + Math.sin(this.time * 0.4 + b.phase) * 0.8;
        y = b.pos.y;
        z = b.pos.z + playerPos.z + Math.cos(this.time * 0.3 + b.phase) * 0.8;
        alp[i] = b.alpha * (0.35 + 0.65 * Math.abs(Math.sin(this.time * 0.7 + b.phase))) * this.opacity;
      } else { // sparkle
        x = b.pos.x + playerPos.x;
        y = b.pos.y + Math.sin(this.time * 0.4 + b.phase) * 3;
        z = b.pos.z + playerPos.z;
        alp[i] = b.alpha * (0.1 + 0.9 * Math.pow(Math.max(0, Math.sin(this.time * 1.3 * b.speed + b.phase)), 8)) * this.opacity;
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.pool = new ParticlePool(scene, 2200);
    this.shockwaves = [];
    this.slashes = [];
    this.lines = [];
    this.shakeAmp = 0;
    this.shakeDur = 0;
    this.shakeTime = 0;
    this.shakePhase = 0;
    this.shakeOffset = new THREE.Vector3();
    this.time = 0;

    // ambient life fields
    this.dust = new AmbientField(scene, { count: 260, size: 0.055, color: 0xffe7b3, range: 34, height: 14, mode: 'dust', opacity: 0.55 });
    this.fireflies = new AmbientField(scene, { count: 95, size: 0.28, color: 0xb7ff9a, range: 28, height: 9, mode: 'firefly', opacity: 0.9 });
    this.petals = new AmbientField(scene, { count: 80, size: 0.16, color: 0xff9fb0, range: 30, height: 13, mode: 'petal', map: PETAL, opacity: 0.8 });
    this.motes = new AmbientField(scene, { count: 120, size: 0.17, color: 0x8ff9ff, range: 28, height: 16, mode: 'mote', opacity: 0.9 });
    this.sparkles = new AmbientField(scene, { count: 100, size: 0.22, color: 0xfff1c2, range: 26, height: 20, mode: 'sparkle', opacity: 0.7 });
    this.petals.points.visible = false;
    this.motes.points.visible = false;
    this.sparkles.points.visible = false;
    this.zone = 'meadow';
  }

  setZone(zone) {
    this.zone = zone;
    this.petals.points.visible = zone === 'ruins';
    this.motes.points.visible = zone === 'crystal';
    this.sparkles.points.visible = zone === 'sky';
    this.fireflies.points.visible = zone === 'meadow' || zone === 'sky';
    this.dust.points.visible = zone !== 'crystal';
    this.dust.mat.uniforms.uMap.value = GLOW;
  }

  /* ---------------- camera shake ---------------- */
  addShake(amount = 0.25, duration = 0.3) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeDur = Math.max(this.shakeDur, duration);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  getShakeOffset() {
    return this.shakeOffset;
  }

  /* ---------------- bursts ---------------- */
  burst(position, opts = {}) {
    this.pool.spawn({ position, ...opts });
  }

  hitSpark(position, color = 0xffe3a0, count = 24) {
    this.pool.spawn({
      position, count, speed: 8.5, speedVar: 0.9, size: 0.14, sizeVar: 0.8,
      life: 0.35, lifeVar: 0.6, gravity: -12, drag: 2.2,
      colors: [color, 0xffffff, 0xffcf7a],
    });
  }

  enemyDeath(position, color = 0x9ef2c0) {
    this.pool.spawn({
      position, count: 46, speed: 7, size: 0.25, sizeVar: 0.9,
      life: 0.9, lifeVar: 0.6, gravity: -8, drag: 1.2,
      colors: [color, 0xffffff, 0xd7ffb0],
    });
    this.burst(position, {
      count: 16, speed: 2, size: 0.7, life: 0.6, gravity: 0.4, drag: 2,
      colors: [color, 0xffffff],
    });
    this.shockwave(position, { color, radius: 2.4, duration: 0.5, y: position.y - 0.6 });
  }

  collect(position, color = 0x8ff7ec) {
    this.pool.spawn({
      position, count: 34, speed: 5, size: 0.18, sizeVar: 0.8,
      life: 0.7, lifeVar: 0.5, gravity: 1.2, drag: 2.4,
      colors: [color, 0xffffff, 0xfff1b0],
    });
    this.shockwave(position, { color, radius: 1.4, duration: 0.45, y: position.y - 0.4 });
  }

  doubleJump(position) {
    this.pool.spawn({
      position, count: 26, speed: 4, direction: new THREE.Vector3(0, 1, 0), spread: 0.9,
      size: 0.2, life: 0.5, gravity: -2, drag: 2.4, colors: [0x8ff7ec, 0xffffff, 0x9fdfff],
    });
    this.shockwave(position, { color: 0x8ff7ec, radius: 1.8, duration: 0.4 });
  }

  dashTrail(position, color = 0x8ff7ec) {
    this.pool.spawn({
      position, count: 4, speed: 1.4, posVar: 0.28, size: 0.28, sizeVar: 0.7,
      life: 0.38, lifeVar: 0.5, gravity: 0.4, drag: 3,
      colors: [color, 0xb8fff6, 0xffffff],
    });
  }

  footstep(position, color = 0xcdbf9a) {
    this.pool.spawn({
      position, count: 4, speed: 0.8, direction: new THREE.Vector3(0, 1, 0), spread: 1,
      posVar: 0.14, size: 0.12, life: 0.35, gravity: -1, drag: 2.5, colors: [color, 0xe6dcc3],
    });
  }

  splash(position) {
    this.pool.spawn({
      position, count: 16, speed: 3.4, direction: new THREE.Vector3(0, 1, 0), spread: 0.8,
      posVar: 0.45, size: 0.11, life: 0.55, gravity: -9, drag: 1, colors: [0xd9ffff, 0x9fe6e2, 0xffffff],
    });
  }

  /* ---------------- shockwave rings ---------------- */
  shockwave(position, { color = 0xffd38c, radius = 4, duration = 0.7, y = null } = {}) {
    const geo = new THREE.TorusGeometry(1, 0.035, 6, 64);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position);
    if (y !== null) mesh.position.y = y;
    mesh.scale.setScalar(0.2);
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, life: duration, maxLife: duration, radius });
  }

  /* ---------------- slash arcs ---------------- */
  slash(position, yaw, { color = 0x9ffff4, scale = 1 } = {}) {
    const geo = new THREE.RingGeometry(0.45, 1.28, 32, 1, 0.3, Math.PI * 1.35);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -yaw - Math.PI * 0.2;
    mesh.position.copy(position);
    mesh.position.y += 1.0;
    mesh.scale.setScalar(scale);
    mesh.renderOrder = 8;
    this.scene.add(mesh);
    this.slashes.push({ mesh, life: 0.22, maxLife: 0.22, yaw });
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.pool.spawn({
      position: position.clone().addScaledVector(fwd, 1.2).add(new THREE.Vector3(0, 1.0, 0)),
      count: 10, speed: 3.5, size: 0.1, life: 0.28, gravity: 0, drag: 4,
      colors: [color, 0xffffff],
    });
  }

  /* ---------------- lightning ---------------- */
  lightning(from, to, { color = 0xd8feff, bolts = 3 } = {}) {
    const group = new THREE.Group();
    for (let b = 0; b < bolts; b++) {
      const pts = [];
      const segments = 10;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const p = new THREE.Vector3().lerpVectors(from, to, t);
        if (i > 0 && i < segments) {
          p.x += rand(-1.5, 1.5) * (1 - Math.abs(t - 0.5));
          p.z += rand(-1.5, 1.5) * (1 - Math.abs(t - 0.5));
        }
        pts.push(p);
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      group.add(new THREE.Line(geo, mat));
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW, color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.position.copy(to);
    glow.scale.setScalar(5);
    group.add(glow);
    this.scene.add(group);
    this.lines.push({ group, life: 0.32, maxLife: 0.32 });
    this.addShake(0.2, 0.25);
    this.pool.spawn({ position: to, count: 26, speed: 7, size: 0.18, life: 0.5, gravity: -5, colors: [color, 0xffffff] });
  }

  /* ---------------- update ---------------- */
  setZoneVisibility(zone) { this.setZone(zone); }

  update(dt, playerPos) {
    this.time += dt;
    this.pool.update(dt);
    this.dust.update(dt, playerPos);
    this.fireflies.update(dt, playerPos);
    if (this.petals.points.visible) this.petals.update(dt, playerPos);
    if (this.motes.points.visible) this.motes.update(dt, playerPos);
    if (this.sparkles.points.visible) this.sparkles.update(dt, playerPos);

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt;
      const t = clamp(1 - s.life / s.maxLife, 0, 1);
      const ease = 1 - Math.pow(1 - t, 2);
      s.mesh.scale.setScalar(0.2 + s.radius * ease);
      s.mesh.material.opacity = (1 - t) * 0.8;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose(); s.mesh.material.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.life -= dt;
      const t = clamp(1 - s.life / s.maxLife, 0, 1);
      s.mesh.scale.setScalar(0.85 + t * 0.5);
      s.mesh.rotation.z += dt * 4;
      s.mesh.material.opacity = (1 - t) * 0.85;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose(); s.mesh.material.dispose();
        this.slashes.splice(i, 1);
      }
    }

    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.life -= dt;
      const a = clamp(l.life / l.maxLife, 0, 1);
      l.group.traverse((o) => { if (o.material) o.material.opacity = a; });
      if (l.life <= 0) {
        this.scene.remove(l.group);
        l.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
        this.lines.splice(i, 1);
      }
    }

    // camera shake
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const t = this.shakeTime / Math.max(0.0001, this.shakeDur);
      const amp = this.shakeAmp * t * t;
      this.shakePhase += dt * 57;
      this.shakeOffset.set(
        Math.sin(this.shakePhase * 1.7) * amp,
        Math.cos(this.shakePhase * 2.3) * amp * 0.8,
        Math.sin(this.shakePhase * 1.1) * amp * 0.6
      );
      if (this.shakeTime <= 0) { this.shakeAmp = 0; this.shakeDur = 0; this.shakeOffset.set(0, 0, 0); }
    } else {
      this.shakeOffset.set(0, 0, 0);
    }
  }

  updatePointScale(scale) {
    this.pool.mat.uniforms.uScale.value = scale;
    this.dust.mat.uniforms.uScale.value = scale;
    this.fireflies.mat.uniforms.uScale.value = scale;
    this.petals.mat.uniforms.uScale.value = scale;
    this.motes.mat.uniforms.uScale.value = scale;
    this.sparkles.mat.uniforms.uScale.value = scale;
  }
}
