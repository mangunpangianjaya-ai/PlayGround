import { TAU, rgba, mix, clamp, hash, mulberry32 } from './util.js';

/**
 * Layered, hand-drawn feeling parallax sky. Drawn in CSS pixels, before the
 * world transform, so it always fills the screen.
 */
export class Background {
  constructor(theme, seed = 1) {
    this.theme = theme;
    const rng = mulberry32(seed * 7919 + 3);
    this.clouds = Array.from({ length: 7 }, (_, i) => ({
      x: rng() * 2600,
      y: 60 + rng() * 240,
      s: 0.55 + rng() * 0.85,
      speed: 2.4 + rng() * 3.6,
      alpha: 0.4 + rng() * 0.4,
      puffs: 3 + Math.floor(rng() * 3),
    }));
    this.stars = Array.from({ length: 90 }, () => ({
      x: rng(),
      y: rng() * 0.55,
      size: 0.6 + rng() * 1.6,
      phase: rng() * TAU,
      speed: 0.4 + rng() * 1.1,
    }));
    this.birdSeed = rng() * 100;
    this.treeSeed = Math.floor(rng() * 999);
    this.foreground = Array.from({ length: 30 }, (_, i) => ({
      i,
      y: 0.93 + rng() * 0.09,
      h: 18 + rng() * 34,
      lean: (rng() - 0.5) * 0.5,
    }));

    // The sky layers are soft and low-frequency, so they can be painted into
    // a smaller buffer and reused for a couple of frames. This keeps the
    // parallax look while leaving plenty of headroom for the world itself.
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d', { alpha: false });
    this.bufScale = 0.62;
    this._lastPaint = -Infinity;
    this._lastZoom = 0;
  }

  hillPath(ctx, w, h, camOffset, baseY, amp, freq, color, alpha = 1) {
    ctx.beginPath();
    ctx.moveTo(-30, h + 30);
    const step = 16;
    for (let x = -30; x <= w + 30; x += step) {
      const xx = x + camOffset;
      const y =
        baseY -
        (Math.sin(xx * freq) * amp +
          Math.sin(xx * freq * 2.37 + 1.9) * amp * 0.42 +
          Math.sin(xx * freq * 0.51 + 4.2) * amp * 0.72);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w + 30, h + 30);
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  cloud(ctx, x, y, scale, alpha, color, puffs) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    for (let i = 0; i < puffs; i++) {
      const px = (i - (puffs - 1) / 2) * 34;
      const py = Math.sin(i * 1.7) * 7;
      const r = 24 + hash(i + puffs * 3.1) * 18;
      ctx.beginPath();
      ctx.ellipse(px, py, r * 1.18, r * 0.72, 0, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(0, 13, 56, 15, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  tree(ctx, x, baseY, scale, color, dark, sway, variant = 0) {
    const h1 = hash(variant * 1.73 + 3.1);
    const h2 = hash(variant * 2.91 + 7.7);
    ctx.save();
    ctx.translate(x, baseY);
    ctx.rotate(sway * 0.012);
    ctx.fillStyle = dark;
    ctx.fillRect(-4.5 * scale, -52 * scale, 9 * scale, 54 * scale);
    ctx.beginPath();
    ctx.ellipse(0, -50 * scale, 7 * scale, 4 * scale, 0, 0, TAU);
    ctx.fill();
    // branches
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.6 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -34 * scale);
    ctx.lineTo(-15 * scale, -49 * scale);
    ctx.moveTo(0, -42 * scale);
    ctx.lineTo(14 * scale, -55 * scale);
    ctx.stroke();

    ctx.fillStyle = color;
    const blobs = [
      [0, -66 - h1 * 7, 30 + h2 * 8, 26 + h1 * 6],
      [-22 - h1 * 6, -52 - h2 * 8, 22 + h1 * 6, 18 + h2 * 4],
      [22 + h2 * 5, -55 - h1 * 5, 21 + h2 * 7, 18 + h1 * 5],
      [-4 + h1 * 8, -85 - h2 * 10, 19 + h1 * 5, 16 + h2 * 4],
      [13 - h2 * 7, -71 + h1 * 4, 15 + h1 * 4, 12 + h2 * 3],
      [-13 + h2 * 5, -73 - h1 * 3, 14 + h2 * 3, 12 + h1 * 3],
    ];
    for (const [bx, by, rx, ry] of blobs) {
      ctx.beginPath();
      ctx.ellipse(bx * scale, by * scale, rx * scale, ry * scale, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
    ctx.beginPath();
    ctx.ellipse((-6 + h1 * 6) * scale, (-80 - h2 * 6) * scale, 16 * scale, 9 * scale, -0.25, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  bush(ctx, x, y, scale, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const puffs = 3;
    for (let i = 0; i < puffs; i++) {
      const px = (i - 1) * 18 * scale;
      const r = (15 + hash(i * 4.7 + x) * 7) * scale;
      ctx.beginPath();
      ctx.ellipse(x + px, y - r * 0.3, r * 1.25, r * 0.8, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx, cam, w, h, t, zoom) {
    const scale = this.bufScale;
    const bw = Math.max(1, Math.round(w * scale));
    const bh = Math.max(1, Math.round(h * scale));
    let resized = false;
    if (this.buffer.width !== bw || this.buffer.height !== bh) {
      this.buffer.width = bw;
      this.buffer.height = bh;
      this._lastPaint = -Infinity;
      resized = true;
    }

    // Reuse the last backdrop for a frame or two unless the view changed size.
    // Background motion is deliberately slow, so 30 fps reads as perfectly
    // smooth, while expensive gradient and hill rasterisation is halved.
    if (resized || this._lastZoom !== zoom || t - this._lastPaint >= 1 / 31) {
      const bctx = this.bctx;
      bctx.setTransform(scale, 0, 0, scale, 0, 0);
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = 'source-over';
      this._paint(bctx, cam, w, h, t, zoom);
      this._lastPaint = t;
      this._lastZoom = zoom;
    }

    ctx.drawImage(this.buffer, 0, 0, this.buffer.width, this.buffer.height, 0, 0, w, h);
  }

  _paint(ctx, cam, w, h, t, zoom) {
    const th = this.theme;
    const camX = cam.x * zoom;
    const camY = cam.y * zoom;

    // Defensive reset in case a previous layer left a state behind.
    ctx.save();
    // ---- sky
    const sky = ctx.createLinearGradient(0, 0, 0, h * 1.05);
    sky.addColorStop(0, th.sky[0]);
    sky.addColorStop(0.52, th.sky[1]);
    sky.addColorStop(1, th.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // ---- stars
    if (th.stars > 0) {
      for (const s of this.stars) {
        const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.globalAlpha = clamp(th.stars * tw * 0.9, 0, 1);
        ctx.fillStyle = '#fff3d8';
        const x = s.x * w;
        const y = s.y * h * 0.82;
        ctx.beginPath();
        ctx.arc(x, y, s.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ---- sun / moon
    const orb = th.orb;
    if (orb) {
      const ox = w * orb.x - camX * 0.006 + Math.sin(t * 0.03) * 10;
      const oy = h * orb.y - camY * 0.02;
      const radius = orb.r * Math.min(1.25, w / 1100);
      const glow = ctx.createRadialGradient(ox, oy, radius * 0.2, ox, oy, radius * 4.2);
      glow.addColorStop(0, rgba(orb.glow, 0.45));
      glow.addColorStop(0.35, rgba(orb.glow, 0.16));
      glow.addColorStop(1, rgba(orb.glow, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(ox, oy, radius * 4.2, 0, TAU);
      ctx.fill();
      const disc = ctx.createRadialGradient(ox - radius * 0.25, oy - radius * 0.3, radius * 0.1, ox, oy, radius);
      disc.addColorStop(0, '#fffdf2');
      disc.addColorStop(0.7, orb.color);
      disc.addColorStop(1, rgba(orb.color, 0.75));
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(ox, oy, radius, 0, TAU);
      ctx.fill();

      if (orb.craters) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ox, oy, radius, 0, TAU);
        ctx.clip();
        ctx.fillStyle = 'rgba(199, 188, 163, 0.22)';
        for (const [cxr, cyr, rr] of [[-0.28, -0.1, 0.2], [0.2, 0.24, 0.13], [0.12, -0.32, 0.09], [-0.4, 0.32, 0.08]]) {
          ctx.beginPath();
          ctx.arc(ox + cxr * radius, oy + cyr * radius, rr * radius, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }

      if (orb.crescent) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(ox + radius * 0.42, oy - radius * 0.18, radius * 0.92, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // ---- soft clouds
    const cloudColor = mix(th.cloud, th.sky[1], th.dusk ? 0.45 : 0.15);
    for (const c of this.clouds) {
      const span = w + 700;
      let x = (c.x + t * c.speed - camX * 0.05) % span;
      if (x < 0) x += span;
      x -= 350;
      const y = c.y * (h / 720) - camY * 0.03;
      this.cloud(ctx, x, y, c.s * Math.min(1.15, w / 900), c.alpha * th.cloudAlpha, cloudColor, c.puffs);
    }

    // ---- birds
    if (th.birds) {
      ctx.strokeStyle = rgba(th.birdColor || '#8d7b86', 0.35);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const speed = 12 + i * 5;
        let x = ((t * speed + i * 420 + this.birdSeed * 10) % (w + 340)) - 170;
        const y = h * (0.14 + i * 0.055) + Math.sin(t * 0.5 + i) * 8 - camY * 0.02;
        const flap = Math.sin(t * 2.2 + i * 1.7) * 4;
        ctx.beginPath();
        ctx.moveTo(x - 9, y + flap);
        ctx.quadraticCurveTo(x - 4, y - 3, x, y);
        ctx.quadraticCurveTo(x + 4, y - 3, x + 9, y + flap);
        ctx.stroke();
      }
    }

    // ---- mist glow at horizon
    if (th.mist > 0.05) {
      const hy = h * 0.6 + camY * 0.02;
      const g = ctx.createLinearGradient(0, hy - 100, 0, hy + 130);
      g.addColorStop(0, rgba(th.mistColor, 0));
      g.addColorStop(0.5, rgba(th.mistColor, 0.28 * th.mist));
      g.addColorStop(1, rgba(th.mistColor, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, hy - 100, w, 230);
    }

    // ---- water horizon (creek)
    if (th.water) {
      const wy = th.waterWorldY * zoom - camY;
      if (wy < h + 80) {
        const wg = ctx.createLinearGradient(0, wy - 20, 0, wy + 260);
        wg.addColorStop(0, rgba(th.water, 0.55));
        wg.addColorStop(0.3, rgba(th.water, 0.75));
        wg.addColorStop(1, rgba(th.waterDeep || th.water, 0.92));
        ctx.fillStyle = wg;
        ctx.fillRect(0, wy, w, h - wy + 40);
        // shimmer
        ctx.strokeStyle = rgba('#ffffff', 0.22);
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 9; i++) {
          const ly = wy + 22 + i * 13;
          const off = Math.sin(t * 0.7 + i * 1.4) * 24;
          ctx.beginPath();
          ctx.moveTo(off + (i * 87) % Math.max(1, w), ly);
          ctx.lineTo(off + (i * 87) % Math.max(1, w) + 60, ly);
          ctx.stroke();
        }
        // distant reflections
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#fff6e4';
        for (let i = 0; i < 5; i++) {
          const rx = (i * 173 + Math.sin(t * 0.2 + i) * 10) % w;
          ctx.beginPath();
          ctx.ellipse(rx, wy + 30 + i * 17, 22, 3, 0, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // ---- far hills
    const horizon = h * 0.55 + camY * 0.035;
    const shift = camX * 0.1;
    this.hillPath(ctx, w, h, shift, horizon + h * 0.1, h * 0.035, 0.0032, th.hillFar, 0.85);
    this.hillPath(ctx, w, h, camX * 0.2, horizon + h * 0.175, h * 0.045, 0.0041, th.hillMid, 0.92);

    // ---- mid tree line
    const spacing = 196;
    const tf = 0.34;
    const off = camX * tf;
    const start = Math.floor(off / spacing) - 2;
    const count = Math.ceil(w / spacing) + 5;
    for (let i = start; i < start + count; i++) {
      if (hash(i * 1.37 + this.treeSeed) < 0.12) continue;
      const x = i * spacing - off + (hash(i) - 0.5) * 60;
      const scale = 0.72 + hash(i * 2.1) * 0.58;
      const baseY = horizon + h * 0.045 + (hash(i * 3.3) - 0.5) * 10 + camY * 0.01;
      if (x < -120 || x > w + 120) continue;
      this.tree(ctx, x, baseY, scale, th.treeColor, th.treeDark || th.hillMid, Math.sin(t * 0.4 + i), i);
    }

    // ---- near bushes
    const bushSpacing = 168;
    const bf = 0.56;
    const boff = camX * bf;
    const bstart = Math.floor(boff / bushSpacing) - 2;
    const bcount = Math.ceil(w / bushSpacing) + 5;
    for (let i = bstart; i < bstart + bcount; i++) {
      const x = i * bushSpacing - boff + (hash(i * 1.9) - 0.5) * 40;
      if (x < -80 || x > w + 80) continue;
      const baseY = h * 0.78 + (hash(i * 2.7) - 0.5) * 22 + camY * 0.05;
      const scale = 0.7 + hash(i * 4.1) * 0.55;
      this.bush(ctx, x, baseY, scale, th.bushColor, 0.5);
    }

    // ---- near hill silhouette
    this.hillPath(ctx, w, h, camX * 0.62, h * 0.86 + camY * 0.06, h * 0.04, 0.0052, th.hillNear, 0.95);

    // ---- scarce drifting pollen / light motes (background)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const x = (hash(i * 3.1) * w + t * (3 + (i % 3)) - camX * 0.16) % (w + 40);
      const y = (hash(i * 7.7) * h * 0.7 + Math.sin(t * 0.3 + i) * 14 + camY * 0.04) % h;
      const a = 0.1 + 0.08 * Math.sin(t * 0.9 + i);
      const r = 1 + hash(i) * 1.6;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4);
      g.addColorStop(0, rgba(th.mote || '#ffe9b0', a));
      g.addColorStop(1, rgba(th.mote || '#ffe9b0', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // ---- foreground grass silhouettes
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = th.foregroundColor || th.hillNear;
    const fgSpacing = 88;
    const foff = camX * 1.12;
    const fstart = Math.floor(foff / fgSpacing) - 2;
    for (let i = fstart; i < fstart + Math.ceil(w / fgSpacing) + 4; i++) {
      if (hash(i * 5.3) < 0.32) continue;
      const x = i * fgSpacing - foff + hash(i) * 50;
      const baseY = h + 16;
      const hh = 24 + hash(i * 2.2) * 48;
      if (x < -40 || x > w + 40) continue;
      const sway = Math.sin(t * 1.1 + i * 0.7) * 9;
      ctx.beginPath();
      ctx.moveTo(x - 10, baseY);
      ctx.quadraticCurveTo(x - 7 + sway * 0.4, baseY - hh * 0.6, x - 2 + sway, baseY - hh);
      ctx.quadraticCurveTo(x - 2 + sway * 0.3, baseY - hh * 0.55, x + 4, baseY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }
}