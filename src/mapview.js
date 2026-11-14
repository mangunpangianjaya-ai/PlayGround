// ============================================================
// IRONFANG — world map painting (minimap + full map screen)
// ============================================================
import { heightAt, isWater } from './world.js';

const HALF = 160;
const SIZE = 320;

const KIND_COLORS = {
  camp: '#ffd98a',
  quest: '#ffe1a0',
  forge: '#ff9a5a',
  item: '#9fc7ff',
  bed: '#b28bff',
  bridge: '#9fc7ff',
  ruins: '#d8cfae',
  cave: '#8fd0e8',
  lair: '#8fe36f',
};

export class MapRenderer {
  constructor(world) {
    this.world = world;
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = 320;
    this.waypoint = null;
    this._paintBase();
  }

  _paintBase() {
    const ctx = this.base.getContext('2d');
    const img = ctx.createImageData(320, 320);
    const d = img.data;
    for (let py = 0; py < 320; py++) {
      for (let px = 0; px < 320; px++) {
        const x = -HALF + (px / 320) * SIZE;
        const z = -HALF + (py / 320) * SIZE;
        const h = heightAt(x, z);
        const water = isWater(x, z) || h < -0.32;
        let r, g, b;
        if (water) {
          const depth = Math.min(1, (-0.35 - h) / 3);
          r = 38 - depth * 12; g = 92 - depth * 22; b = 112 - depth * 14;
        } else {
          const high = Math.max(0, Math.min(1, (h - 2) / 22));
          const n = Math.sin(x * 0.37) * Math.cos(z * 0.41) * 0.5 + 0.5;
          r = 58 + n * 18 + high * 48;
          g = 84 + n * 26 + high * 38;
          b = 48 + n * 12 + high * 44;
          const cinder = Math.max(0, Math.min(1, (x - 42) / 38)) * Math.max(0, Math.min(1, (-z - 20) / 58));
          r = r * (1 - cinder * 0.55) + 104 * cinder * 0.55;
          g = g * (1 - cinder * 0.55) + 68 * cinder * 0.55;
          b = b * (1 - cinder * 0.55) + 52 * cinder * 0.55;
          const ice = Math.max(0, Math.min(1, (-x - 25) / 60)) * Math.max(0, Math.min(1, (-z - 40) / 60));
          r = r * (1 - ice * 0.4) + 148 * ice * 0.4;
          g = g * (1 - ice * 0.4) + 172 * ice * 0.4;
          b = b * (1 - ice * 0.4) + 176 * ice * 0.4;
          const camp = Math.max(0, 1 - Math.hypot(x, z) / 22);
          r = r * (1 - camp * 0.72) + 122 * camp * 0.72;
          g = g * (1 - camp * 0.72) + 104 * camp * 0.72;
          b = b * (1 - camp * 0.72) + 72 * camp * 0.72;
          const ruin = Math.max(0, 1 - Math.hypot(x - 70, z - 52) / 20);
          r = r * (1 - ruin * 0.55) + 150 * ruin * 0.55;
          g = g * (1 - ruin * 0.55) + 146 * ruin * 0.55;
          b = b * (1 - ruin * 0.55) + 128 * ruin * 0.55;
          const edge = Math.max(0, 1 - (145 - Math.hypot(x, z)) / 26);
          r = r * (1 - edge * 0.75) + 50 * edge * 0.75;
          g = g * (1 - edge * 0.75) + 53 * edge * 0.75;
          b = b * (1 - edge * 0.75) + 46 * edge * 0.75;
        }
        const idx = (py * 320 + px) * 4;
        d[idx] = r; d[idx + 1] = g; d[idx + 2] = b; d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // trails between camp and the main landmarks
    const trails = [
      [[0, 0], [17, 0], [52, -20], [72, -58]],
      [[0, 0], [-34, 18], [-78, 62]],
      [[0, 0], [-32, -26], [-74, -80]],
      [[0, 0], [28, 14], [70, 52]],
    ];
    ctx.save();
    ctx.strokeStyle = 'rgba(208,192,145,.3)';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([5, 5]);
    for (const t of trails) {
      ctx.beginPath();
      for (let i = 0; i < t.length; i++) {
        const px = ((t[i][0] + HALF) / SIZE) * 320;
        const py = ((t[i][1] + HALF) / SIZE) * 320;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _chunk(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h, dpr };
  }

  _drawMarker(ctx, kind, x, y, size, color, filled = true) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(6,12,10,.9)';
    ctx.lineWidth = Math.max(1.5, size * 0.42);
    ctx.fillStyle = color;
    if (kind === 'camp') {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        const b = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
        ctx.lineTo(Math.cos(b) * size * 0.45, Math.sin(b) * size * 0.45);
      }
      ctx.closePath();
    } else if (kind === 'lair') {
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.9, size * 0.8);
      ctx.lineTo(-size * 0.9, size * 0.8);
      ctx.closePath();
    } else if (kind === 'forge') {
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size, 0);
      ctx.closePath();
    } else if (kind === 'item') {
      ctx.beginPath();
      ctx.rect(-size * 0.85, -size * 0.85, size * 1.7, size * 1.7);
    } else if (kind === 'bed') {
      ctx.beginPath();
      ctx.arc(0, 0, size, 0.4, Math.PI * 1.9);
      ctx.strokeStyle = color;
      ctx.lineWidth = size * 0.55;
      ctx.stroke();
      ctx.restore();
      return;
    } else if (kind === 'cave') {
      ctx.beginPath();
      ctx.arc(0, size * 0.25, size, Math.PI, 0);
      ctx.lineTo(size, size * 0.8);
      ctx.lineTo(-size, size * 0.8);
      ctx.closePath();
    } else if (kind === 'ruins') {
      ctx.beginPath();
      ctx.rect(-size * 0.85, -size * 0.5, size * 0.38, size * 1.4);
      ctx.rect(size * 0.45, -size * 0.5, size * 0.38, size * 1.4);
      ctx.rect(-size * 0.5, -size * 0.9, size, size * 0.34);
    } else if (kind === 'bridge') {
      ctx.beginPath();
      ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
      ctx.lineWidth = size * 0.5;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
      return;
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
    }
    if (filled) ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawMinimap(canvas, player, facing) {
    const { ctx, w, h } = this._chunk(canvas);
    if (w < 8 || h < 8) return;
    const cx = w / 2, cy = h / 2;
    const R = Math.max(1, Math.min(w, h) / 2 - 2);
    const radiusWorld = 62;
    const span = (radiusWorld / SIZE) * 320;
    const px = ((player.x + HALF) / SIZE) * 320;
    const py = ((player.z + HALF) / SIZE) * 320;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#12231c';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, px - span, py - span, span * 2, span * 2, 0, 0, w, h);

    // subtle grid
    ctx.strokeStyle = 'rgba(220,240,230,.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((w / 4) * i, 0); ctx.lineTo((w / 4) * i, h);
      ctx.moveTo(0, (h / 4) * i); ctx.lineTo(w, (h / 4) * i);
      ctx.stroke();
    }

    // markers within view
    const scale = R / radiusWorld;
    for (const m of this.world.markers) {
      const dx = m.x - player.x;
      const dz = m.z - player.z;
      if (Math.hypot(dx, dz) > radiusWorld - 2) continue;
      const x = cx + dx * scale;
      const y = cy + dz * scale;
      const size = m.kind === 'camp' ? 5.5 : 4;
      this._drawMarker(ctx, m.kind, x, y, size, m.color || KIND_COLORS[m.kind] || '#fff');
    }

    // waypoint
    if (this.waypoint) {
      const dx = this.waypoint.x - player.x;
      const dz = this.waypoint.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > 2) {
        const x = cx + (dx / d) * (R - 10);
        const y = cy + (dz / d) * (R - 10);
        this._drawMarker(ctx, 'lair', x, y, 4, '#ffe9a8');
      }
    }

    // player arrow
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI - facing);
    ctx.fillStyle = '#ffe9b0';
    ctx.strokeStyle = 'rgba(4,10,8,.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // north tick
    ctx.fillStyle = 'rgba(255,235,180,.85)';
    ctx.font = `800 ${Math.round(9 * (w / 160))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, 12 * (h / 160));

    // edge shade
    const grad = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    grad.addColorStop(0, 'rgba(4,10,8,0)');
    grad.addColorStop(1, 'rgba(4,10,8,.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // border
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232,180,90,.55)';
    ctx.lineWidth = Math.max(2, 8 * (w / 320));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,205,.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawFullMap(canvas, player, facing) {
    const { ctx, w, h } = this._chunk(canvas);
    if (w < 8 || h < 8) return;
    ctx.fillStyle = '#0a1512';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, 0, 0, w, h);

    // grid
    ctx.strokeStyle = 'rgba(230,242,235,.08)';
    ctx.lineWidth = 1;
    const cell = w / 8;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(cell * i, 0); ctx.lineTo(cell * i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, cell * i); ctx.lineTo(w, cell * i); ctx.stroke();
    }

    const toPx = (x, z) => [((x + HALF) / SIZE) * w, ((z + HALF) / SIZE) * h];

    // waypoint line
    if (this.waypoint) {
      const [px, py] = toPx(player.x, player.z);
      const [wx, wy] = toPx(this.waypoint.x, this.waypoint.z);
      ctx.strokeStyle = 'rgba(255,225,150,.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(wx, wy); ctx.stroke();
      ctx.setLineDash([]);
      this._drawMarker(ctx, 'lair', wx, wy, 6, '#ffe9a8');
    }

    // markers
    const labelSize = Math.max(10, Math.round(w / 58));
    for (const m of this.world.markers) {
      const [x, y] = toPx(m.x, m.z);
      const size = m.kind === 'camp' ? 9 : m.kind === 'lair' ? 7 : 5.5;
      this._drawMarker(ctx, m.kind, x, y, size, m.color || KIND_COLORS[m.kind] || '#fff');
      ctx.font = `${m.kind === 'camp' ? 800 : 600} ${labelSize}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(7,14,11,.75)';
      const tw = ctx.measureText(m.label).width;
      ctx.fillRect(x + size + 4, y - labelSize * 0.72, tw + 6, labelSize * 1.45);
      ctx.fillStyle = m.kind === 'camp' ? '#ffe1a0' : 'rgba(236,242,238,.88)';
      ctx.fillText(m.label, x + size + 7, y);
    }

    // player
    const [px, py] = toPx(player.x, player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - facing);
    ctx.fillStyle = '#fff3c9';
    ctx.strokeStyle = 'rgba(5,12,9,.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4.5);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // compass
    ctx.save();
    ctx.translate(w - 28, 28);
    ctx.fillStyle = 'rgba(255,235,180,.9)';
    ctx.font = `800 ${Math.round(w / 42)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, 0);
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(5, -8); ctx.lineTo(-5, -8); ctx.closePath();
    ctx.fillStyle = 'rgba(232,180,90,.9)';
    ctx.fill();
    ctx.restore();
  }

  setWaypointFromMap(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * SIZE - HALF;
    const z = ((clientY - rect.top) / rect.height) * SIZE - HALF;
    this.waypoint = { x, z };
    return this.waypoint;
  }
}
