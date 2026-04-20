'use strict';
// ═══════════════════════════════════════════════════════════════════
//  COZY CAT  —  Ordinary Game Jam #1
//  Virtual pet cat care game
// ═══════════════════════════════════════════════════════════════════

// ── Canvas ─────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
canvas.width  = 480;
canvas.height = 320;
const W = canvas.width, H = canvas.height;
ctx.imageSmoothingEnabled = false;

// ── Asset loading ──────────────────────────────────────────────────
const IMG  = {};
const SRCS = {
  mochi:     'assets/Idle.png',            // 320×32  — 10 frames @ 32×32  (Mochi walk)
  pochi:     'assets/FreeSprites.png',     // 256×435 — bowl sprite row (kept for bowl)
  retro:     'assets/RetroCatsFree.png',   // 256×435 — primary cat art (sit/sad/sleep)
  box:       'assets/Box3.png',            // 128×32  — 4 frames @ 32×32  (cat in box)
  furniture: 'assets/Furnitures.png',      // 512×512 — room furniture atlas
  ui:        'assets/free.png',            // 256×128 — CatUIFree: portrait, faces, buttons
};
let loadedCount = 0;
for (const [key, src] of Object.entries(SRCS)) {
  const img = new Image();
  img.onload  = () => { IMG[key] = img; loadedCount++; };
  img.onerror = () => { console.warn('[asset] failed to load:', src); loadedCount++; };
  img.src = src;
}
const TOTAL_ASSETS = Object.keys(SRCS).length;
const allLoaded = () => loadedCount >= TOTAL_ASSETS;

// ── Sprite sheet constants ─────────────────────────────────────────
// RetroCatsFree.png / FreeSprites.png share the same 256×435 layout:
// Frame width = 256/4 = 64 px.  Row heights: 3 cat rows×64 + bowl 48 + items 195.
const P = {
  FW:     64,
  SIT_Y:   0, SIT_H:  64,   // row 0  – sitting / idle   (4 frames)
  SAD_Y:  64, SAD_H:  64,   // row 1  – unhappy / alert  (4 frames)
  SLP_Y: 128, SLP_H:  64,   // row 2  – sleeping         (4 frames)
  BWL_Y: 192, BWL_H:  48,   // row 3  – food bowls       (4 variants)
};

// ── free.png (CatUIFree, 256×128) sprite positions ─────────────────
// Left section (x 0–90): cat portrait + mood faces + sleeping cat
// Right section (x 92–256): button grid — 14×14 buttons, 16px pitch
const UI_SRC = {
  portrait:   { x:  2, y:  2, w: 36, h: 36 },   // large cat face
  face_happy: { x:  2, y: 40, w: 28, h: 28 },   // small happy face
  face_meh:   { x: 32, y: 40, w: 28, h: 28 },   // small neutral face
  face_sad:   { x:  2, y: 70, w: 28, h: 28 },   // small sad face
  sleep_cat:  { x: 34, y: 70, w: 54, h: 36 },   // sleeping white cat
  // btn(col, row): x = 92 + col*16,  y = row*16,  w=14, h=14
};
function uiBtn(col, row) {
  return { x: 92 + col * 16, y: row * 16, w: 14, h: 14 };
}
// Map each action to a button column (row 0 = normal, row 1 = active/lit)
const BTN_ICON = { feed: 4, play: 0, pet: 5, sleep: 2 };

// Furnitures.png atlas crops  (x, y, w, h) — tweak if visually off
const FURN = {
  window:  { x:   3, y:   3, w:  95, h: 105 },   // light blue window
  post:    { x: 198, y:   3, w:  88, h: 118 },   // beige scratch post
  bed:     { x: 232, y: 115, w: 128, h: 108 },   // blue cat bed
  shelf:   { x:   3, y: 328, w: 115, h: 130 },   // bookshelf
  plant:   { x: 118, y: 330, w:  88, h: 145 },   // large plant
};

// ── Portal ─────────────────────────────────────────────────────────
const portal = (typeof Portal !== 'undefined')
  ? Portal.readPortalParams()
  : { fromPortal: false, username: 'Guest', color: 'ff88cc', speed: 5, ref: null };

const catName = portal.username.length > 12
  ? portal.username.slice(0, 11) + '…'
  : portal.username;

let portalTarget = null;
if (typeof Portal !== 'undefined') {
  Promise.race([
    Portal.pickPortalTarget(),
    new Promise(r => setTimeout(() => r(null), 1200)),
  ]).then(t => { portalTarget = t; }).catch(() => {});
}

// ── Game states ────────────────────────────────────────────────────
const GS = Object.freeze({ LOADING: 0, PLAYING: 1 });
let gameState = GS.LOADING;

// Cat behavioural states
const CS = Object.freeze({
  ROAM: 'roam', SIT: 'sit',   EAT:  'eat',
  SLEEP:'sleep', PLAY:'play', PET:  'pet',
  BOX:  'box',  HUNGRY:'hungry',
});

// ── Stats ──────────────────────────────────────────────────────────
const stat = { hunger: 75, happy: 70, energy: 85 };

// Drain per second (hunger depletes fully in ~4 min, etc.)
const DRAIN = {
  hunger: 100 / (4 * 60),
  happy:  100 / (5 * 60),
  energy: 100 / (7 * 60),
};

// ── Room geometry ──────────────────────────────────────────────────
const WALL_Y    = 155;   // y where wall meets floor
const FLOOR_BOT = 275;   // y where floor ends (UI below this)
const GROUND_Y  = 246;   // y for cat's feet while roaming
const ROAM_X    = [88, 382];

// Fixed object foot positions
const OBJ = {
  bowl: { x: 108, y: 242 },
  bed:  { x: 368, y: 232 },
  post: { x: 208, y: 235 },
  box:  { x: 300, y: 244 },
};

// ── Animation definitions ──────────────────────────────────────────
// sheet: key into IMG.  sy: source row Y.  sw/sh: source frame size.
// dw/dh: draw size (logical px).  fps: frames per second.
const ANIM = {
  walk:  { sheet:'mochi', sy:   0,        sw: 32,   sh: 32,       frames: 10, fps: 10, dw: 48, dh: 48 },
  sit:   { sheet:'retro', sy:   P.SIT_Y,  sw: P.FW, sh: P.SIT_H,  frames:  4, fps:  4, dw: 56, dh: 56 },
  sad:   { sheet:'retro', sy:   P.SAD_Y,  sw: P.FW, sh: P.SAD_H,  frames:  4, fps:  3, dw: 56, dh: 56 },
  sleep: { sheet:'retro', sy:   P.SLP_Y,  sw: P.FW, sh: P.SLP_H,  frames:  4, fps:  2, dw: 72, dh: 56 },
  box:   { sheet:'box',   sy:   0,        sw: 32,   sh: 32,        frames:  4, fps:  4, dw: 64, dh: 44 },
};

// ── Cat object ─────────────────────────────────────────────────────
const cat = {
  x: 230, y: GROUND_Y,
  dir: 1,           // 1 = right, -1 = left
  speed: 0,
  targetX: 230,
  atTarget: true,

  state: CS.SIT,
  stateTimer: 3,

  anim: 'sit',
  animFrame: 0,
  animTimer: 0,

  floatEmoji: '',
  floatTimer: 0,
  floatOY: 0,
};

// ── Care tracking ──────────────────────────────────────────────────
let careTime  = 0;   // seconds cat has been well-cared for
let totalTime = 0;

// ── UI buttons ─────────────────────────────────────────────────────
const BTNS = [
  { id:'feed',  label:'🍖 Feed',  x:  52, y: 284, w: 90, h: 26, col: '#b85520' },
  { id:'play',  label:'🎾 Play',  x: 155, y: 284, w: 90, h: 26, col: '#257a45' },
  { id:'pet',   label:'💝 Pet',   x: 258, y: 284, w: 90, h: 26, col: '#8a33a0' },
  { id:'sleep', label:'💤 Sleep', x: 361, y: 284, w: 90, h: 26, col: '#2255a0' },
];

// ── Input ──────────────────────────────────────────────────────────
canvas.addEventListener('click', e => {
  if (gameState !== GS.PLAYING) return;
  const r  = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (W / r.width);
  const my = (e.clientY - r.top)  * (H / r.height);

  // Action buttons
  for (const b of BTNS) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      onAction(b.id); return;
    }
  }

  // Click-on-cat → pet
  const a  = ANIM[cat.anim];
  const cx = cat.x - a.dw / 2, cy = cat.y - a.dh;
  if (mx >= cx && mx <= cx + a.dw && my >= cy && my <= cy + a.dh) {
    onAction('pet'); return;
  }

  // Portal button (top-right, appears after enough care)
  if (careTime >= 90 && portalTarget) {
    if (mx >= W - 82 && mx <= W - 4 && my >= 6 && my <= 28) {
      Portal.sendPlayerThroughPortal(portalTarget.url, {
        username: portal.username,
        color:    portal.color,
        speed:    Math.min(10, 5 + Math.floor(careTime / 60)),
      });
    }
  }
});

// ── Action handler ─────────────────────────────────────────────────
function onAction(id) {
  // Wake sleeping cat if player clicks anything except sleep
  if (cat.state === CS.SLEEP && id !== 'sleep') {
    setState(CS.SIT); return;
  }
  switch (id) {
    case 'feed':  setState(CS.EAT);   break;
    case 'play':  setState(CS.PLAY);  break;
    case 'pet':   setState(CS.PET);   break;
    case 'sleep': setState(CS.SLEEP); break;
  }
}

// ── State machine ──────────────────────────────────────────────────
function setState(s) {
  cat.state     = s;
  cat.animFrame = 0;
  cat.animTimer = 0;
  cat.atTarget  = false;

  switch (s) {
    case CS.ROAM:
      cat.stateTimer = 3 + Math.random() * 4;
      cat.targetX    = ROAM_X[0] + Math.random() * (ROAM_X[1] - ROAM_X[0]);
      cat.speed = 55;
      cat.anim  = 'walk';
      break;

    case CS.SIT:
      cat.stateTimer = 2 + Math.random() * 6;
      cat.speed = 0; cat.atTarget = true;
      cat.anim  = stat.happy < 25 ? 'sad' : 'sit';
      break;

    case CS.EAT:
      cat.stateTimer = 5;
      cat.targetX    = OBJ.bowl.x;
      cat.speed = 70;
      cat.anim  = 'walk';
      break;

    case CS.SLEEP:
      cat.stateTimer = 9 + Math.random() * 6;
      cat.targetX    = OBJ.bed.x;
      cat.speed = 50;
      cat.anim  = 'walk';
      break;

    case CS.PLAY:
      cat.stateTimer = 5;
      cat.targetX    = ROAM_X[0] + Math.random() * (ROAM_X[1] - ROAM_X[0]);
      cat.speed = 115;
      cat.anim  = 'walk';
      break;

    case CS.PET:
      cat.stateTimer = 2.5;
      cat.speed = 0; cat.atTarget = true;
      cat.anim  = 'sit';
      float('💝');
      break;

    case CS.BOX:
      cat.stateTimer = 6;
      cat.targetX    = OBJ.box.x;
      cat.speed = 60;
      cat.anim  = 'walk';
      break;

    case CS.HUNGRY:
      cat.stateTimer = 3;
      cat.speed = 0; cat.atTarget = true;
      cat.anim  = 'sad';
      float('🍖');
      break;
  }
}

function float(emoji) {
  cat.floatEmoji = emoji;
  cat.floatTimer = 2.2;
  cat.floatOY    = 0;
}

// ── Update ─────────────────────────────────────────────────────────
let lastTs = 0;

function update(dt) {
  if (gameState === GS.LOADING) {
    if (allLoaded()) gameState = GS.PLAYING;
    return;
  }

  totalTime += dt;

  // ── Stat decay / recovery ──
  if (cat.state === CS.SLEEP) {
    stat.energy  = Math.min(100, stat.energy + 5 * dt);
    stat.hunger -= DRAIN.hunger * 0.25 * dt;
  } else {
    stat.hunger -= DRAIN.hunger * dt;
    stat.happy  -= DRAIN.happy  * dt;
    stat.energy -= DRAIN.energy * dt;
  }

  // Active state bonuses
  if (cat.state === CS.EAT && cat.atTarget) {
    stat.hunger  = Math.min(100, stat.hunger + 18 * dt);
  }
  if (cat.state === CS.PLAY) {
    stat.happy   = Math.min(100, stat.happy  +  8 * dt);
    stat.energy -= 4 * dt;
  }
  if (cat.state === CS.PET) {
    stat.happy   = Math.min(100, stat.happy  + 20 * dt);
  }

  // Clamp
  stat.hunger = Math.max(0, Math.min(100, stat.hunger));
  stat.happy  = Math.max(0, Math.min(100, stat.happy));
  stat.energy = Math.max(0, Math.min(100, stat.energy));

  // ── Auto-triggers ──
  if (stat.hunger < 12 && cat.state !== CS.EAT && cat.state !== CS.HUNGRY) {
    setState(CS.HUNGRY);
  }
  if (stat.energy < 4 && cat.state !== CS.SLEEP) {
    setState(CS.SLEEP);
  }

  // ── State timer ──
  if (cat.stateTimer > 0) cat.stateTimer -= dt;

  if (cat.stateTimer <= 0) {
    switch (cat.state) {
      case CS.EAT:
        setState(CS.SIT); float('😸'); break;
      case CS.PET: case CS.PLAY:
        setState(Math.random() > 0.5 ? CS.ROAM : CS.SIT); break;
      case CS.SLEEP:
        setState(CS.ROAM); float('😺'); break;
      case CS.ROAM:
        setState(Math.random() > 0.3 ? CS.SIT : CS.ROAM); break;
      case CS.SIT:
        setState(nextIdleState()); break;
      case CS.HUNGRY: case CS.BOX:
        setState(CS.SIT); break;
    }
  }

  // ── Movement ──
  if (cat.speed > 0 && !cat.atTarget) {
    const dx = cat.targetX - cat.x;
    if (Math.abs(dx) < 2) {
      cat.x = cat.targetX;
      cat.atTarget = true;
      // arrived — switch to destination anim
      switch (cat.state) {
        case CS.EAT:   cat.anim = 'sit';   break;
        case CS.SLEEP: cat.anim = 'sleep'; cat.y = OBJ.bed.y; break;
        case CS.BOX:   cat.anim = 'box';   break;
        default: break;
      }
    } else {
      cat.dir = dx > 0 ? 1 : -1;
      cat.x  += cat.dir * cat.speed * dt;
    }
  }

  // Reset y when not sleeping
  if (cat.state !== CS.SLEEP || !cat.atTarget) cat.y = GROUND_Y;

  // ── Animate ──
  const a = ANIM[cat.anim];
  if (a) {
    cat.animTimer += dt;
    if (cat.animTimer >= 1 / a.fps) {
      cat.animTimer -= 1 / a.fps;
      cat.animFrame  = (cat.animFrame + 1) % a.frames;
    }
  }

  // ── Float emoji ──
  if (cat.floatTimer > 0) {
    cat.floatTimer -= dt;
    cat.floatOY    += 28 * dt;
  }

  // ── Care score ──
  if (stat.hunger > 40 && stat.happy > 40 && stat.energy > 30) careTime += dt;
}

function nextIdleState() {
  const r = Math.random();
  if (r < 0.38) return CS.ROAM;
  if (r < 0.65) return CS.SIT;
  if (r < 0.78 && stat.energy < 55) return CS.SLEEP;
  if (r < 0.88) return CS.BOX;
  return CS.SIT;
}

// ── Draw helpers ───────────────────────────────────────────────────
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x+w, y,   x+w, y+r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x,   y+h, x,   y+h-r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x,   y,   x+r, y,   r);
  ctx.closePath();
}

function statBarColor(v) {
  if (v > 50) return '#55cc88';
  if (v > 25) return '#ddaa22';
  return '#ee3333';
}

// ── Draw room ──────────────────────────────────────────────────────
function drawRoom() {
  // Back wall
  ctx.fillStyle = '#c9bedd';
  ctx.fillRect(0, 0, W, WALL_Y);

  // Subtle wallpaper grid
  ctx.strokeStyle = 'rgba(180,160,220,0.25)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WALL_Y); ctx.stroke();
  }
  for (let y = 0; y < WALL_Y; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Baseboard
  ctx.fillStyle = '#e8dff5';
  ctx.fillRect(0, WALL_Y - 7, W, 7);
  ctx.fillStyle = '#b8a8d4';
  ctx.fillRect(0, WALL_Y - 1, W, 2);

  // Floor
  const fg = ctx.createLinearGradient(0, WALL_Y, 0, FLOOR_BOT);
  fg.addColorStop(0, '#d4b98a');
  fg.addColorStop(1, '#c4a878');
  ctx.fillStyle = fg;
  ctx.fillRect(0, WALL_Y, W, FLOOR_BOT - WALL_Y);

  // Floor planks
  ctx.strokeStyle = 'rgba(120,80,20,0.13)';
  ctx.lineWidth = 1;
  for (let y = WALL_Y + 14; y < FLOOR_BOT; y += 14) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Sunlight beam from window
  ctx.fillStyle = 'rgba(255,240,180,0.06)';
  ctx.beginPath();
  ctx.moveTo(172, WALL_Y); ctx.lineTo(280, WALL_Y);
  ctx.lineTo(340, FLOOR_BOT); ctx.lineTo(112, FLOOR_BOT);
  ctx.closePath(); ctx.fill();

  // UI strip
  ctx.fillStyle = '#1a0f2e';
  ctx.fillRect(0, FLOOR_BOT, W, H - FLOOR_BOT);
  ctx.fillStyle = '#7744bb';
  ctx.fillRect(0, FLOOR_BOT, W, 2);
}

// ── Draw furniture ─────────────────────────────────────────────────
function drawFurniture() {
  const F = IMG.furniture;

  if (F) {
    const sc = 0.82; // global furniture scale multiplier

    // Window (centred on back wall)
    const fw = FURN.window;
    ctx.drawImage(F, fw.x, fw.y, fw.w, fw.h,
      Math.round(W/2 - fw.w*sc/2), 8, Math.round(fw.w*sc), Math.round(fw.h*sc));

    // Scratch post (left side)
    const fp = FURN.post;
    ctx.drawImage(F, fp.x, fp.y, fp.w, fp.h,
      OBJ.post.x - Math.round(fp.w*sc*0.5), WALL_Y - Math.round(fp.h*sc*0.55),
      Math.round(fp.w*sc), Math.round(fp.h*sc));

    // Cat bed (right side)
    const fb = FURN.bed;
    ctx.drawImage(F, fb.x, fb.y, fb.w, fb.h,
      OBJ.bed.x - Math.round(fb.w*sc*0.5), OBJ.bed.y - Math.round(fb.h*sc*0.85),
      Math.round(fb.w*sc), Math.round(fb.h*sc));

    // Shelf (far left wall)
    const fsh = FURN.shelf;
    ctx.drawImage(F, fsh.x, fsh.y, fsh.w, fsh.h,
      8, WALL_Y - 30, Math.round(fsh.w*0.65), Math.round(fsh.h*0.65));

    // Plant (right side back)
    const fpl = FURN.plant;
    ctx.drawImage(F, fpl.x, fpl.y, fpl.w, fpl.h,
      W - Math.round(fpl.w*0.6) - 8, WALL_Y - Math.round(fpl.h*0.6) + 10,
      Math.round(fpl.w*0.6), Math.round(fpl.h*0.6));
  } else {
    // Fallback window
    ctx.fillStyle = '#a8d4f0';
    ctx.fillRect(194, 14, 90, 72);
    ctx.strokeStyle = '#d8c8f0'; ctx.lineWidth = 5;
    ctx.strokeRect(192, 12, 94, 76);
    ctx.strokeStyle = '#c8b8e8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(239,12); ctx.lineTo(239,88); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(192,50); ctx.lineTo(286,50); ctx.stroke();
  }

  // Food bowl (always drawn — uses pochi sprite sheet or fallback)
  drawBowl();

  // Cardboard box (always drawn)
  drawBox();
}

function drawBowl() {
  // Use retro sheet if loaded (same bowl row as pochi), fall back to pochi, then procedural
  const bowlImg = IMG.retro || IMG.pochi;
  if (bowlImg) {
    ctx.drawImage(bowlImg,
      0, P.BWL_Y, P.FW, P.BWL_H,
      OBJ.bowl.x - 24, OBJ.bowl.y - 28, 48, 30);
  } else {
    ctx.fillStyle = '#dd8833';
    ctx.beginPath(); ctx.ellipse(OBJ.bowl.x, OBJ.bowl.y - 8, 20, 10, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#884400';
    ctx.beginPath(); ctx.ellipse(OBJ.bowl.x, OBJ.bowl.y - 8, 20, 6, 0, 0, Math.PI); ctx.fill();
  }
}

function drawBox() {
  // Just a simple cardboard box outline when cat is NOT in it
  // The box sprite itself comes from Box3.png when cat is in box state
  if (cat.state !== CS.BOX || !cat.atTarget) {
    ctx.fillStyle = '#d4a455';
    ctx.fillRect(OBJ.box.x - 20, OBJ.box.y - 22, 40, 24);
    ctx.strokeStyle = '#aa8833';
    ctx.lineWidth = 2;
    ctx.strokeRect(OBJ.box.x - 20, OBJ.box.y - 22, 40, 24);
    // flaps
    ctx.beginPath();
    ctx.moveTo(OBJ.box.x - 20, OBJ.box.y - 22);
    ctx.lineTo(OBJ.box.x - 6, OBJ.box.y - 30);
    ctx.lineTo(OBJ.box.x + 6, OBJ.box.y - 30);
    ctx.lineTo(OBJ.box.x + 20, OBJ.box.y - 22);
    ctx.stroke();
  }
}

// ── Draw cat ───────────────────────────────────────────────────────
function drawCat() {
  const a   = ANIM[cat.anim];
  const img = IMG[a.sheet];
  if (!img) return;

  const srcX = cat.animFrame * a.sw;
  const dstX = Math.round(cat.x - a.dw / 2);
  const dstY = Math.round(cat.y - a.dh);

  ctx.save();
  // Flip horizontally when walking left
  if (cat.anim === 'walk' && cat.dir === -1) {
    ctx.translate(Math.round(cat.x) * 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, srcX, a.sy, a.sw, a.sh, dstX, dstY, a.dw, a.dh);
  } else {
    ctx.drawImage(img, srcX, a.sy, a.sw, a.sh, dstX, dstY, a.dw, a.dh);
  }
  ctx.restore();
}

// ── Draw HUD ───────────────────────────────────────────────────────
function drawHUD() {
  const ui = IMG.ui;

  // ── HUD panel background (top-left) ──
  ctx.fillStyle = 'rgba(18,8,34,0.72)';
  roundRect(4, 4, 158, 50, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,130,255,0.35)';
  ctx.lineWidth = 1;
  roundRect(4, 4, 158, 50, 5);
  ctx.stroke();

  // ── Cat portrait (from free.png) ──
  if (ui) {
    const p = UI_SRC.portrait;
    ctx.drawImage(ui, p.x, p.y, p.w, p.h, 8, 8, 40, 40);
  } else {
    ctx.fillStyle = '#cc88aa';
    ctx.fillRect(8, 8, 40, 40);
  }

  // ── Stat bars ──
  const bars = [
    { icon: '🍖', val: stat.hunger, y: 10 },
    { icon: '😸', val: stat.happy,  y: 23 },
    { icon: '⚡', val: stat.energy, y: 36 },
  ];
  const BX = 53, BW = 102, BH = 8;

  for (const b of bars) {
    const frac = Math.max(0, Math.min(1, b.val / 100));
    // Track
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(BX, b.y, BW, BH);
    // Fill
    ctx.fillStyle = statBarColor(b.val);
    ctx.fillRect(BX, b.y, Math.round(BW * frac), BH);
    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(BX, b.y, Math.round(BW * frac), 3);
    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(BX, b.y, BW, BH);
    // Icon
    ctx.font = '9px serif';
    ctx.textAlign = 'left';
    ctx.fillText(b.icon, BX - 14, b.y + BH - 1);
    // Critical pulse overlay
    if (b.val < 20) {
      ctx.fillStyle = `rgba(255,50,50,${0.35 + 0.35 * Math.sin(totalTime * 7)})`;
      ctx.fillRect(BX, b.y, Math.round(BW * frac), BH);
    }
  }

  // ── Mood face (from free.png) — shown under portrait ──
  if (ui) {
    const avgStat = (stat.hunger + stat.happy + stat.energy) / 3;
    const face = avgStat > 60
      ? UI_SRC.face_happy
      : avgStat > 30
        ? UI_SRC.face_meh
        : UI_SRC.face_sad;
    // tiny mood face in portrait corner
    ctx.drawImage(ui, face.x, face.y, face.w, face.h, 32, 36, 16, 16);
  }

  // ── Cat name tag (top-centre) ──
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(catName).width + 12;
  ctx.fillStyle = 'rgba(40,12,72,0.82)';
  roundRect(W/2 - tw/2, 5, tw, 14, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,150,255,0.4)';
  ctx.lineWidth = 1;
  roundRect(W/2 - tw/2, 5, tw, 14, 4);
  ctx.stroke();
  ctx.fillStyle = '#ffe8ff';
  ctx.fillText(catName, W/2, 15);

  // ── Care timer (top-right) ──
  const mins = Math.floor(careTime / 60);
  const secs = Math.floor(careTime % 60);
  ctx.font = '8px monospace';
  ctx.textAlign = 'right';

  // Pill background
  ctx.fillStyle = 'rgba(18,8,34,0.72)';
  roundRect(W - 68, 4, 64, 14, 4);
  ctx.fill();
  ctx.fillStyle = '#cc99ff';
  ctx.fillText(`♥ ${mins}:${String(secs).padStart(2,'0')}`, W - 6, 14);

  // ── Portal button ──
  if (careTime >= 90 && portalTarget) {
    const px = W - 82, py = 20, pw = 78, ph = 22;
    ctx.fillStyle = '#5020a0';
    roundRect(px, py, pw, ph, 5);
    ctx.fill();
    ctx.strokeStyle = '#aa77ff';
    ctx.lineWidth = 1;
    roundRect(px, py, pw, ph, 5);
    ctx.stroke();
    // shimmer
    ctx.fillStyle = `rgba(180,120,255,${0.15 + 0.1 * Math.sin(totalTime * 4)})`;
    roundRect(px, py, pw, ph, 5);
    ctx.fill();
    ctx.fillStyle = '#ddc0ff';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🌀 Portal', px + pw/2, py + 14);
  }

  ctx.textAlign = 'left';
}

// ── Draw buttons ───────────────────────────────────────────────────
function drawButtons() {
  const ui = IMG.ui;

  for (const b of BTNS) {
    const active = cat.state === b.id;

    // ── Drop shadow ──
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(b.x + 2, b.y + 2, b.w, b.h, 4);
    ctx.fill();

    // ── Button body ──
    ctx.fillStyle = active ? lighten(b.col, 55) : b.col;
    roundRect(b.x, b.y, b.w, b.h, 4);
    ctx.fill();

    // ── Top-edge bevel ──
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(b.x, b.y, b.w, 4, 4);
    ctx.fill();

    // ── Sprite icon from free.png (left side of button) ──
    if (ui) {
      const col  = BTN_ICON[b.id];
      const row  = active ? 1 : 0;
      const src  = uiBtn(col, row);
      // Draw icon at 2× scale (28×28) centred vertically on the button
      const iconSz = 22;
      const ix = b.x + 4;
      const iy = b.y + Math.round((b.h - iconSz) / 2);
      ctx.drawImage(ui, src.x, src.y, src.w, src.h, ix, iy, iconSz, iconSz);
    }

    // ── Label text (right of icon) ──
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(b.label, b.x + b.w/2 + (ui ? 8 : 0) + 1, b.y + b.h/2 + 4);
    ctx.fillStyle = '#fff';
    ctx.fillText(b.label, b.x + b.w/2 + (ui ? 8 : 0),     b.y + b.h/2 + 3);
  }
  ctx.textAlign = 'left';
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const bv = Math.min(255, (n & 0xff) + amt);
  return `rgb(${r},${g},${bv})`;
}

// ── Draw floating emoji ────────────────────────────────────────────
function drawFloat() {
  if (!cat.floatEmoji || cat.floatTimer <= 0) return;
  const alpha = Math.min(1, cat.floatTimer / 0.5);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '18px serif';
  ctx.textAlign = 'center';
  ctx.fillText(cat.floatEmoji, cat.x, cat.y - 62 - cat.floatOY);
  ctx.restore();
}

// ── Draw loading ───────────────────────────────────────────────────
function drawLoading() {
  ctx.fillStyle = '#150c22';
  ctx.fillRect(0, 0, W, H);
  const prog = loadedCount / TOTAL_ASSETS;
  ctx.fillStyle = '#3a2060';
  ctx.fillRect(W/2 - 60, H/2 - 6, 120, 12);
  ctx.fillStyle = '#aa66ff';
  ctx.fillRect(W/2 - 60, H/2 - 6, Math.round(120 * prog), 12);
  ctx.strokeStyle = '#6633aa';
  ctx.lineWidth = 1;
  ctx.strokeRect(W/2 - 60, H/2 - 6, 120, 12);
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ccaaff';
  ctx.fillText('Loading…', W/2, H/2 + 22);
}

// ── Master draw ────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);

  if (gameState === GS.LOADING) { drawLoading(); return; }

  drawRoom();
  drawFurniture();
  drawCat();
  drawFloat();
  drawHUD();
  drawButtons();
}

// ── Game loop ──────────────────────────────────────────────────────
function loop(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.1);   // cap at 100 ms
  lastTs = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
