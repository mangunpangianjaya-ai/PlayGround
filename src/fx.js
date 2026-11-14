// ============================================================
// IRONFANG — particles, slash trails, ground telegraphs
// ============================================================
import * as THREE from 'three';

const MAX_PARTICLES = 700;

let glowTexture = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.effects = [];
    this.trails = [];
    this.time = 0;
    this._initParticles();
  }

  _initParticles() {
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pPos[i * 3 + 1] = -999;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.2, vertexColors: true, transparent: true, opacity: 1,
      map: getGlowTexture(), alphaTest: 0.02,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this.parts = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1,
      r: 1, g: 1, b: 1, grav: 9,
    }));
    this.pIndex = 0;
  }

  burst(pos, color, count = 12, speed = 4, size = 1, opts = {}) {
    const c = new THREE.Color(color);
    const { gravity = 11, spread = 1, up = 0.6, life = 0.55 } = opts;
    for (let i = 0; i < count; i++) {
      const p = this.parts[this.pIndex];
      const idx = this.pIndex;
      this.pIndex = (this.pIndex + 1) % MAX_PARTICLES;
      p.active = true;
      p.x = pos.x + (Math.random() - 0.5) * spread;
      p.y = pos.y + (Math.random() - 0.5) * spread;
      p.z = pos.z + (Math.random() - 0.5) * spread;
      const theta = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.9);
      p.vx = Math.cos(theta) * sp;
      p.vz = Math.sin(theta) * sp;
      p.vy = (Math.random() * 0.9 + up) * speed * 0.7;
      p.grav = gravity;
      p.life = p.max = life * (0.6 + Math.random() * 0.8);
      p.r = c.r; p.g = c.g; p.b = c.b;
      this.pPos[idx * 3] = p.x;
      this.pPos[idx * 3 + 1] = p.y;
      this.pPos[idx * 3 + 2] = p.z;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;
  }

  dust(pos, count = 6, color = 0x9b8a6a) {
    this.burst(pos, color, count, 2.4, 1, { gravity: 2.5, up: 0.15, life: 0.75, spread: 1.4 });
  }

  spark(pos, color, strong = false) {
    this.burst(pos, color, strong ? 22 : 10, strong ? 6 : 4, 1, { gravity: 13, up: 0.5, life: strong ? 0.6 : 0.4 });
  }

  slashFlash(pos, yaw, color, scale = 1, tilt = 0) {
    const geo = new THREE.RingGeometry(0.55 * scale, 1.0 * scale, 20, 1, -0.7, 1.4);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.set(-Math.PI / 2 + tilt, yaw, 0);
    this.scene.add(mesh);
    this.effects.push({ mesh, life: 0.26, max: 0.26, kind: 'flash', scaleFrom: 0.7, scaleTo: 1.8 });
  }

  telegraphCircle(pos, radius, duration, color = 0xff3322) {
    const group = new THREE.Group();
    group.position.set(pos.x, 0.045, pos.z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.88, radius, 44),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = -0.01;
    group.add(ring, fill);
    this.scene.add(group);
    const e = { mesh: group, ring, fill, radius, life: duration, max: duration, kind: 'telegraph' };
    this.effects.push(e);
    return e;
  }

  telegraphCone(pos, yaw, radius, angle, duration, color = 0xff3b22) {
    const half = angle / 2;
    const seg = 24;
    const verts = [];
    for (let i = 0; i < seg; i++) {
      const a0 = -half + (angle * i) / seg;
      const a1 = -half + (angle * (i + 1)) / seg;
      verts.push(0, 0, 0, Math.sin(a0) * radius, 0, Math.cos(a0) * radius, Math.sin(a1) * radius, 0, Math.cos(a1) * radius);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 0.05, pos.z);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);
    const edgeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.01, 0),
      new THREE.Vector3(Math.sin(-half) * radius, 0.01, Math.cos(-half) * radius),
      new THREE.Vector3(Math.sin(half) * radius, 0.01, Math.cos(half) * radius),
      new THREE.Vector3(0, 0.01, 0),
    ]);
    const edge = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    mesh.add(edge);
    const e = { mesh, life: duration, max: duration, kind: 'telegraph', fill: mat, baseOpacity: 0.22 };
    this.effects.push(e);
    return e;
  }

  telegraphLine(start, yaw, length, width, duration, color = 0xff3b22) {
    const group = new THREE.Group();
    group.position.set(start.x, 0.05, start.z);
    group.rotation.y = yaw;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, length, 1, 1),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.z = length / 2;
    group.add(plane);
    // borders
    const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    for (const sx of [-1, 1]) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3((sx * width) / 2, 0.01, 0),
        new THREE.Vector3((sx * width) / 2, 0.01, length),
      ]);
      group.add(new THREE.Line(geo, edgeMat));
    }
    this.scene.add(group);
    const e = { mesh: group, life: duration, max: duration, kind: 'telegraph', fill: plane.material, baseOpacity: 0.2 };
    this.effects.push(e);
    return e;
  }

  shockwave(pos, radius = 3, color = 0xffd08a, duration = 0.5) {
    const geo = new THREE.RingGeometry(0.6, 1, 40);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.08, pos.z);
    mesh.scale.setScalar(radius / 2);
    this.scene.add(mesh);
    this.effects.push({ mesh, life: duration, max: duration, kind: 'wave', scaleFrom: radius / 3, scaleTo: radius * 1.2 });
  }

  createTrail(color, width = 0.55) {
    const maxPts = 22;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(maxPts * 2 * 3);
    const col = new Float32Array(maxPts * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx = [];
    for (let i = 0; i < maxPts - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 1,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const c = new THREE.Color(color);
    const trail = {
      mesh, geo, points: [], color: c, width,
      add(base, tip, life = 0.22) {
        this.points.push({ base: base.clone(), tip: tip.clone(), life, age: 0 });
        if (this.points.length > maxPts) this.points.shift();
      },
      update(dt) {
        for (const p of this.points) p.age += dt;
        this.points = this.points.filter((p) => p.age < p.life);
        const n = this.points.length;
        if (n < 2) { geo.setDrawRange(0, 0); return; }
        for (let i = 0; i < n; i++) {
          const p = this.points[i];
          const f = Math.max(0, 1 - p.age / p.life);
          const w = 0.12 + 0.5 * f;
          const dx = p.tip.x - p.base.x, dy = p.tip.y - p.base.y, dz = p.tip.z - p.base.z;
          const len = Math.hypot(dx, dz) || 1;
          const nx = (-dz / len) * w, nz = (dx / len) * w;
          const k = i * 6;
          pos[k] = p.base.x; pos[k + 1] = p.base.y; pos[k + 2] = p.base.z;
          pos[k + 3] = p.base.x + nx; pos[k + 4] = p.base.y + dy * 0.4; pos[k + 5] = p.base.z + nz;
          const gl = f * f;
          for (let j = 0; j < 2; j++) {
            col[k + j * 3] = this.color.r * gl;
            col[k + j * 3 + 1] = this.color.g * gl;
            col[k + j * 3 + 2] = this.color.b * gl;
          }
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
        geo.setDrawRange(0, (n - 1) * 6);
      },
      dispose() {
        mesh.parent?.remove(mesh);
        geo.dispose(); mat.dispose();
      },
    };
    this.trails.push(trail);
    return trail;
  }

  update(dt) {
    this.time += dt;
    // particles
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.parts[i];
      if (!p.active) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.pPos[i * 3 + 1] = -999;
        this.pCol[i * 3] = this.pCol[i * 3 + 1] = this.pCol[i * 3 + 2] = 0;
        continue;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 0.985; p.vz *= 0.985;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.28; p.vx *= 0.7; p.vz *= 0.7; }
      const f = p.life / p.max;
      this.pPos[i * 3] = p.x; this.pPos[i * 3 + 1] = p.y; this.pPos[i * 3 + 2] = p.z;
      this.pCol[i * 3] = p.r * f; this.pCol[i * 3 + 1] = p.g * f; this.pCol[i * 3 + 2] = p.b * f;
    }
    if (any) {
      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particles.geometry.attributes.color.needsUpdate = true;
    }
    for (const t of this.trails) t.update(dt);

    // telegraphs / flashes / waves
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      const f = Math.max(0, e.life / e.max);
      if (e.kind === 'telegraph') {
        const pulse = 0.7 + Math.sin(this.time * 16) * 0.22;
        if (e.fill) e.fill.opacity = (e.baseOpacity || 0.2) * pulse * (0.55 + 0.45 * (1 - f));
        if (e.ring) e.ring.material.opacity = 0.6 * pulse * f;
        e.mesh.scale.setScalar(1 + (1 - f) * 0.02);
      } else if (e.kind === 'wave') {
        const p = 1 - f;
        e.mesh.scale.setScalar(e.scaleFrom + (e.scaleTo - e.scaleFrom) * p);
        e.mesh.material.opacity = f * 0.85;
      } else if (e.kind === 'flash') {
        const p = 1 - f;
        e.mesh.scale.setScalar(e.scaleFrom + (e.scaleTo - e.scaleFrom) * p);
        e.mesh.material.opacity = f;
      }
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.traverse?.((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose?.();
        });
        if (e.mesh.geometry) e.mesh.geometry.dispose();
        if (e.mesh.material) e.mesh.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  clear() {
    for (const t of this.trails) t.dispose();
    this.trails = [];
    for (const e of this.effects) {
      this.scene.remove(e.mesh);
      e.mesh.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose?.();
      });
    }
    this.effects = [];
    for (const p of this.parts) p.active = false;
    for (let i = 0; i < MAX_PARTICLES; i++) { this.pPos[i * 3 + 1] = -999; this.pCol[i * 3] = 0; }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.particles);
    this.particles.geometry.dispose();
    this.particles.material.dispose();
  }
}
