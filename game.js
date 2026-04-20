'use strict';
// ═══════════════════════════════════════════════════════════════════
//  Ordinary Game Jam #1
// ═══════════════════════════════════════════════════════════════════

const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
canvas.width  = 480;
canvas.height = 320;
const W = canvas.width, H = canvas.height;
ctx.imageSmoothingEnabled = false;

// ── Portal ─────────────────────────────────────────────────────────
const portal = (typeof Portal !== 'undefined')
  ? Portal.readPortalParams()
  : { fromPortal: false, username: 'Guest', color: 'ff88cc', speed: 5, ref: null };

let portalTarget = null;
if (typeof Portal !== 'undefined') {
  Promise.race([
    Portal.pickPortalTarget(),
    new Promise(r => setTimeout(() => r(null), 1200)),
  ]).then(t => { portalTarget = t; }).catch(() => {});
}

// ── Game loop ──────────────────────────────────────────────────────
let lastTs = 0;

function update(dt) {
  // TODO
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#150c22';
  ctx.fillRect(0, 0, W, H);
}

function loop(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.1);
  lastTs = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
