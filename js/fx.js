import { TAU, clamp, rgba, hash, ellipse } from './util.js';

/**
 * Tiny world-space particle system. Particles are spawned in level coordinates
 * and rendered inside the camera transform.
 */
export class FX {
  constructor() {
    this.list = [];
    this.max = 460;
  }

  spawn(p) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 1, size: 3,
      color: '#ffe9a6', type: 'dot', gravity: 0, drag: 0.9, rot: 0, vr: 0,
      fade: true, additive: true, ...p,
    });
  }

  burst(x, y, opts = {}) {
    const {
      color = '#ffe9a6', count = 10, speed = 90, spread = TAU,
      life = 0.9, size = 3.2, gravity = 80, type = 'dot', additive = true,
      angle = -Math.PI / 2, jitter = 0.35, drag = 0.92,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.9);
      this.spawn({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.65 + Math.random() * 0.7),
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color, type, gravity, additive, drag,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * (type === 'petal' ? 6 : 2) * jitter,
      });
    }
  }

  ring(x, y, color = '#ffe9b0', size = 14, life = 0.7) {
    this.spawn({ x, y, type: 'ring', color, size, life, maxLife: life, vx: 0, vy: 0, additive: true });
  }

  petalFall(x, y, color = '#f6c9c4') {
    this.spawn({
      x, y,
      vx: -20 + Math.random() * 40,
      vy: 16 + Math.random() * 26,
      life: 4 + Math.random() * 2,
      maxLife: 6,
      size: 3 + Math.random() * 2.6,
      color, type: 'petal', gravity: 2, additive: false, drag: 0.995,
      rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 2.4,
    });
  }

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) {
        l.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.type === 'petal') {
        p.x += Math.sin(p.life * 2.6 + p.rot) * 10 * dt;
      }
    }
  }

  draw(ctx) {
    const l = this.list;
    if (!l.length) return;

    // Soft additive layer (glows, sparkles, rings)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      if (!p.additive && p.type !== 'ring') continue;
      const t = clamp(p.life / p.maxLife, 0, 1);
      const alpha = p.fade ? Math.min(1, t * 1.6) : 1;

      if (p.type === 'ring') {
        const prog = 1 - t;
        ctx.globalAlpha = alpha * 0.55;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.2 * t + 0.4;
        ellipse(ctx, p.x, p.y, p.size + prog * 34, (p.size + prog * 34) * 0.55);
        ctx.stroke();
      } else if (p.type === 'sparkle') {
        ctx.globalAlpha = alpha;
        const s = p.size * (0.6 + t);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 4);
        g.addColorStop(0, p.color);
        g.addColorStop(0.35, rgba(p.color, 0.5));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 4, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = rgba('#fffdf0', 0.85);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x - s * 2.2, p.y);
        ctx.lineTo(p.x + s * 2.2, p.y);
        ctx.moveTo(p.x, p.y - s * 2.2);
        ctx.lineTo(p.x, p.y + s * 2.2);
        ctx.stroke();
      } else {
        const s = p.size * (0.45 + t * 0.8);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 3.2);
        g.addColorStop(0, rgba('#fffdf3', alpha));
        g.addColorStop(0.28, rgba(p.color, alpha * 0.9));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 3.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    // Non-additive layer (petals, dust)
    ctx.save();
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      if (p.additive || p.type === 'ring') continue;
      const t = clamp(p.life / p.maxLife, 0, 1);
      const alpha = Math.min(1, t * 2.4);
      ctx.globalAlpha = alpha;

      if (p.type === 'petal') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'leaf') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.quadraticCurveTo(p.size, -p.size * 0.2, 0, p.size);
        ctx.quadraticCurveTo(-p.size, -p.size * 0.2, 0, -p.size);
        ctx.fill();
        ctx.restore();
      } else {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
        g.addColorStop(0, rgba(p.color, alpha * 0.5));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}