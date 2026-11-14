/* ============================================================
   Utils — math, procedural textures and small scene helpers
   ============================================================ */
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % TAU) - Math.PI;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
};
export const formatTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

/* ---------------- deterministic value noise ---------------- */
function hash2(x, y, seed) {
  let h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}
function smooth(t) { return t * t * (3 - 2 * t); }
export function valueNoise(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, octaves = 4, seed = 1, lacunarity = 2.03, gain = 0.5) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 13.7);
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

/* ---------------- canvas texture helpers ---------------- */
function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
function toTexture(canvas, { srgb = true, repeat = 1, aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** A mottled colour texture built from FBM, with flecks and painterly strokes. */
export function makeMottleTexture(size, opts = {}) {
  const {
    base = [88, 128, 62], variance = 30, scale = 5, seed = 1, strokes = 0,
    strokeColor = [140, 170, 90], darkSpots = 0, repeat = 1
  } = opts;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / size * scale, y / size * scale, 5, seed);
      const n2 = fbm(x / size * scale * 4 + 17, y / size * scale * 4 - 9, 3, seed + 8);
      const v = (n - 0.5) * 2 * variance + (n2 - 0.5) * variance * 0.45;
      const i = (y * size + x) * 4;
      img.data[i] = clamp(base[0] + v, 0, 255);
      img.data[i + 1] = clamp(base[1] + v * 0.9, 0, 255);
      img.data[i + 2] = clamp(base[2] + v * 0.7, 0, 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // painterly flecks
  for (let i = 0; i < strokes; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const len = rand(2, 7);
    const ang = rand(-0.9, 0.9) + Math.PI / 2;
    ctx.strokeStyle = `rgba(${strokeColor[0]},${strokeColor[1]},${strokeColor[2]},${rand(0.1, 0.35)})`;
    ctx.lineWidth = rand(0.6, 1.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  for (let i = 0; i < darkSpots; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = rand(1, size * 0.035);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(15,30,15,${rand(0.08, 0.22)})`);
    g.addColorStop(1, 'rgba(15,30,15,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(canvas, { repeat });
}

/** Height-derived tangent-space normal map. */
export function makeNormalTexture(size = 256, scale = 8, strength = 2.2, seed = 3, repeat = 1) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const h = (x, y) => fbm((x / size) * scale, (y / size) * scale, 5, seed) +
    0.25 * fbm((x / size) * scale * 3, (y / size) * scale * 3, 2, seed + 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const ym = (y - 1 + size) % size, yp = (y + 1) % size;
      const dx = (h(xp, y) - h(xm, y)) * strength;
      const dy = (h(x, yp) - h(x, ym)) * strength;
      const nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { srgb: false, repeat });
}

/** Roughness / AO detail map (grayscale). */
export function makeGrainTexture(size = 256, opts = {}) {
  const { base = 180, variance = 50, scale = 14, seed = 6, repeat = 1 } = opts;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * scale, (y / size) * scale, 3, seed);
      const v = clamp(base + (n - 0.5) * variance, 0, 255);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { srgb: false, repeat });
}

/* ---------------- sprites / gradients ---------------- */
export function makeRadialTexture(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', sharpness = 0.35) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.02, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(sharpness, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function makeCloudTexture(size = 256, seed = 2) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size, ny = y / size;
      const dx = nx - 0.5, dy = ny - 0.5;
      const falloff = clamp(1 - Math.hypot(dx, dy) * 2.15, 0, 1);
      const n = fbm(nx * 4.2, ny * 4.2, 5, seed);
      const a = clamp((n * 0.75 + 0.25) * Math.pow(falloff, 1.5), 0, 1);
      const i = (y * size + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function makeShaftTexture(size = 128) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(255,240,200,0)');
  g.addColorStop(0.22, 'rgba(255,240,200,0.7)');
  g.addColorStop(0.48, 'rgba(255,232,180,0.26)');
  g.addColorStop(0.78, 'rgba(255,228,172,0.08)');
  g.addColorStop(1, 'rgba(255,225,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // soften the sides
  const side = ctx.createLinearGradient(0, 0, size, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.32, 'rgba(0,0,0,0)');
  side.addColorStop(0.68, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- material / mesh helpers ---------------- */
export function setShadows(obj, cast = true, receive = true) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
  return obj;
}

export function makeGlowSprite({ color = 0x9ffff4, size = 1, opacity = 1, texture = null, blending = THREE.AdditiveBlending } = {}) {
  const mat = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    blending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size, size, 1);
  return sprite;
}

/** Simple billboard-friendly ribbon used for trails and slashes. */
export function createRibbon(points = 24, width = 0.5, color = 0x8ff7ec) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(points * 2 * 3);
  const alpha = new Float32Array(points * 2);
  const idx = [];
  for (let i = 0; i < points - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      attribute float aAlpha; varying float vA;
      void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main(){ gl_FragColor = vec4(uColor, vA); }
    `,
  });
  return { mesh: new THREE.Mesh(geo, mat), width, points };
}

export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        for (const key in m) {
          const val = m[key];
          if (val && val.isTexture) val.dispose();
        }
        m.dispose();
      });
    }
  });
}

export function makeCapsuleRadius(radius, height) {
  return new THREE.CapsuleGeometry(radius, height, 6, 12);
}

/** Simple AABB overlap test used by physics and abilities. */
export function overlapsAABB(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y &&
         a.z < b.z + b.d && a.z + a.d > b.z;
}

export function pointInBox(p, box, pad = 0) {
  return p.x > box.min.x - pad && p.x < box.max.x + pad &&
         p.y > box.min.y - pad && p.y < box.max.y + pad &&
         p.z > box.min.z - pad && p.z < box.max.z + pad;
}
