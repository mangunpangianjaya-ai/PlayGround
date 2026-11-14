// ============================================================
// IRONFANG — entry point
// ============================================================
import { Game } from './game.js';

const canvas = document.getElementById('scene');
let game = null;

function fatal(message) {
  console.error('[IRONFANG]', message);
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999', 'display:grid', 'place-items:center',
    'padding:32px', 'background:#08110f', 'color:#e8e2d2', 'text-align:center',
    'font-family:system-ui,sans-serif', 'line-height:1.6',
  ].join(';');
  box.innerHTML = `
    <div style="max-width:420px">
      <div style="letter-spacing:.3em;font-size:11px;color:#e8b45a">IRONFANG</div>
      <h1 style="font-size:22px;margin:10px 0">This hunt needs WebGL</h1>
      <p style="color:#9fb0a8;font-size:14px">${String(message).replace(/[<>&]/g, '')}</p>
      <p style="color:#6f8379;font-size:12px">Try a modern browser with hardware acceleration enabled, then reload.</p>
    </div>`;
  document.body.appendChild(box);
}

window.addEventListener('error', (event) => {
  const message = event?.message || 'Unknown error';
  if (game?.ui?.toast) game.ui.toast(`ERROR: ${message}`);
});

try {
  game = new Game(canvas);
} catch (error) {
  fatal(error?.message || error);
}
