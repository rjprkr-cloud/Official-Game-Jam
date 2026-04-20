// Pulse//Drive — Phase 1: Dodge & Flow
// Portal Protocol preserved.

import * as THREE from 'https://esm.sh/three@0.169';
import { OBJLoader } from 'https://esm.sh/three@0.169/examples/jsm/loaders/OBJLoader';
import { MTLLoader } from 'https://esm.sh/three@0.169/examples/jsm/loaders/MTLLoader';

// ── Renderer ───────────────────────────────────────────────────────────────────
const container = document.getElementById('game-container');
const W = 960, H = 540;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x08040f);
container.appendChild(renderer.domElement);

// ── Scene & Camera ─────────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
scene.fog    = new THREE.Fog(0x0d0d22, 55, 160);
const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 220);

// ── Portal Protocol ────────────────────────────────────────────────────────────
const incoming = (typeof Portal !== 'undefined')
  ? Portal.readPortalParams()
  : { fromPortal:false, username:`guest-${Math.floor(Math.random()*9999)}`, color:'4ff0ff', speed:5, ref:null };
let nextTarget = null;
try {
  nextTarget = await Promise.race([
    Portal.pickPortalTarget(),
    new Promise(r => setTimeout(() => r(null), 800))
  ]);
} catch (e) { nextTarget = null; }

// ══ STATE + DOM + BUTTONS — wired first so they work even if 3D setup fails ════

// ── Game state ─────────────────────────────────────────────────────────────────
const STATE = {
  MENU:       'menu',
  SETTINGS:   'settings',
  EXIT:       'exit',
  CAR_SELECT: 'car-select',
  PLAYING:    'playing',
  UPGRADE:    'upgrade',
  GAME_OVER:  'game-over',
};
let gameState      = STATE.MENU;
let selectedCar    = 0;
let hp             = 3.0;
let maxHp          = 3;    // tracks highest hp reached this run (for heart display)
let score          = 0;
let nearMissCount  = 0;
let flowBurstCount = 0;
let collisionCount = 0;
let menuTime = 0, redirecting = false;

// ── DOM references ─────────────────────────────────────────────────────────────
const hud             = document.getElementById('hud');
const beatBar         = document.getElementById('beat-bar');
const hitFlash        = document.getElementById('hit-flash');
const screenMenu      = document.getElementById('screen-menu');
const screenSettings  = document.getElementById('screen-settings');
const screenExit      = document.getElementById('screen-exit');
const screenCarSelect = document.getElementById('screen-car-select');
const screenGameOver  = document.getElementById('screen-game-over');
const damageFlash     = document.getElementById('damage-flash');
let hitFlashTimer = 0;

// ── Upgrade system ─────────────────────────────────────────────────────────────
const CHECKPOINT_INTERVAL = 500;  // metres between upgrade offers
let nextCheckpoint = CHECKPOINT_INTERVAL;

// Live upgrade multipliers — reset each run
const upgradeVars = {
  maxSpd:            0,     // flat bonus to MAX_SPD
  accel:             0,     // flat bonus to ACCEL_RATE
  flowDrainMult:     1.0,   // multiplier on FLOW_DRAIN_RATE  (<1 = slower drain)
  nearMissBonus:     0,     // flat bonus to NEAR_MISS_RADIUS
  ghostHits:         0,     // stacks: adds post-hit invincibility
  ironSkin:          0,     // stacks: halves damage per stack
  burstDurationBonus:0,     // seconds added to FLOW_BURST_DURATION
};
let ghostTimer = 0;   // seconds of post-hit invincibility remaining

const UPGRADE_POOL = [
  {
    id: 'afterburner', icon: '🔥', name: 'Afterburner',
    desc: 'Top speed +12\nAcceleration +8',
    apply() { upgradeVars.maxSpd += 12; upgradeVars.accel += 8; },
  },
  {
    id: 'plating', icon: '🛡️', name: 'Reactive Plating',
    desc: 'Restore 1 heart\n(max 5)',
    apply() { hp = Math.min(5, hp + 1); maxHp = Math.max(maxHp, hp); updateHearts(); },
  },
  {
    id: 'slipstream', icon: '💨', name: 'Slipstream',
    desc: 'Flow drains\n40% slower',
    apply() { upgradeVars.flowDrainMult *= 0.60; },
  },
  {
    id: 'hairtrigger', icon: '⚡', name: 'Hair Trigger',
    desc: 'Near-miss window\nwidens by 1.6 m',
    apply() { upgradeVars.nearMissBonus += 1.6; },
  },
  {
    id: 'ghostdrive', icon: '👻', name: 'Ghost Drive',
    desc: '1.5 s invincibility\nafter each hit',
    apply() { upgradeVars.ghostHits += 1; },
  },
  {
    id: 'ironskin', icon: '⚙️', name: 'Iron Skin',
    desc: 'Collisions deal\nhalf damage',
    apply() { upgradeVars.ironSkin += 1; },
  },
  {
    id: 'overclock', icon: '📡', name: 'Overclock',
    desc: 'Flow Burst\nlasts 2 s longer',
    apply() { upgradeVars.burstDurationBonus += 2.0; },
  },
];

// ── Screen map & simple show/hide ──────────────────────────────────────────────
const SCREEN_MAP = {
  [STATE.MENU]:       screenMenu,
  [STATE.SETTINGS]:   screenSettings,
  [STATE.EXIT]:       screenExit,
  [STATE.CAR_SELECT]: screenCarSelect,
  [STATE.GAME_OVER]:  screenGameOver,
};

// ── Button wiring (before Three.js so they work even if scene init fails) ──────
function wireBtn(id, fn) {
  const el = document.getElementById(id);
  if (el) { el.addEventListener('click', fn); }
  else { console.error('[PulseDrive] button not found: #' + id); }
}

wireBtn('btn-new-game',  () => setState(STATE.CAR_SELECT));
wireBtn('btn-settings',  () => setState(STATE.SETTINGS));
wireBtn('btn-exit',      () => setState(STATE.EXIT));

wireBtn('settings-back', () => setState(STATE.MENU));
wireBtn('exit-back',     () => setState(STATE.MENU));
wireBtn('exit-go', () => {
  const dest = 'https://callumhyoung.github.io/gamejam/';
  try {
    Portal.sendPlayerThroughPortal(dest, {
      username: incoming.username, color: incoming.color, speed: incoming.speed,
    });
  } catch(_) { window.location.href = dest; }
});

document.getElementById('sl-master')?.addEventListener('input', e => {
  volMaster = e.target.value / 100;
  if (masterGain) masterGain.gain.value = volMaster;
});
document.getElementById('sl-music')?.addEventListener('input', e => {
  volMusic = e.target.value / 100;
  if (musicGain) musicGain.gain.value = volMusic;
});

wireBtn('cs-prev',   () => setPreviewCar(previewCarIdx - 1));
wireBtn('cs-next',   () => setPreviewCar(previewCarIdx + 1));
wireBtn('cs-select', () => { selectedCar = previewCarIdx; setState(STATE.PLAYING); });
wireBtn('cs-back',   () => setState(STATE.MENU));
wireBtn('go-menu',   () => setState(STATE.MENU));

// ── Upgrade screen ─────────────────────────────────────────────────────────────
const screenUpgrade  = document.getElementById('screen-upgrade');
const upgradeCardsEl = document.getElementById('upgrade-cards');
const upgradeDistEl  = document.getElementById('upgrade-dist');

function showUpgradeScreen() {
  // Pick 3 unique random upgrades from the pool
  const shuffled = [...UPGRADE_POOL].sort(() => Math.random() - 0.5);
  const picks = shuffled.slice(0, 3);

  upgradeCardsEl.innerHTML = '';
  upgradeDistEl.textContent = `${(score | 0).toLocaleString()} m`;

  picks.forEach(upg => {
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.innerHTML = `
      <div class="upgrade-icon">${upg.icon}</div>
      <div class="upgrade-name">${upg.name}</div>
      <div class="upgrade-desc">${upg.desc.replace(/\n/g, '<br>')}</div>
    `;
    card.addEventListener('click', () => {
      sfxPlay('upgrade', 0.8);
      upg.apply();
      setState(STATE.PLAYING);
    });
    upgradeCardsEl.appendChild(card);
  });

  slCtx.clearRect(0, 0, W, H);
  sfxPlay('checkpoint', 0.7);
  setState(STATE.UPGRADE);
}

console.log('[PulseDrive] ✓ buttons wired early');

// ══ THREE.JS WORLD SETUP ═══════════════════════════════════════════════════════
console.log('[PulseDrive] building world...');

// ── Lighting ───────────────────────────────────────────────────────────────────
const ambLight = new THREE.AmbientLight(0x334466, 1.6);
scene.add(ambLight);
const sun = new THREE.DirectionalLight(0xffe8b0, 2.8);
sun.position.set(18, 35, 25);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 250;
sun.shadow.camera.left = sun.shadow.camera.bottom = -90;
sun.shadow.camera.right = sun.shadow.camera.top   =  90;
scene.add(sun);

const beatLight = new THREE.PointLight(0x4ff0ff, 0, 22);
scene.add(beatLight);

// ── Sky gradient dome ──────────────────────────────────────────────────────────
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: {
    uTop: { value: new THREE.Color(0x080818) },
    uBot: { value: new THREE.Color(0x0f1a3a) },
  },
  vertexShader:   `varying float vY; void main(){ vY=normalize(position).y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 uTop,uBot; varying float vY; void main(){ gl_FragColor=vec4(mix(uTop,uBot,clamp(vY*1.9,0.0,1.0)),1.0); }`,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(190,16,8), skyMat);
skyDome.renderOrder = -1;
scene.add(skyDome);

// ── Road curve ─────────────────────────────────────────────────────────────────
function curveX(z)  { return 14*Math.sin(z*0.013) + 5*Math.sin(z*0.034+1.5); }
function curveDX(z) { return 14*0.013*Math.cos(z*0.013) + 5*0.034*Math.cos(z*0.034+1.5); }

// ── World & lane constants ─────────────────────────────────────────────────────
const ROAD_LEN     = 6000;
const ROAD_W       = 18;
const CURB_W       = 1.6;
const ROAD_START   = 25;
const ROAD_END     = -(ROAD_LEN - 25);
const MAX_SPD      = 48;    // top speed (units/s)
const ACCEL_RATE   = 30;    // units/s² when ↑ held
const DECEL_RATE   = 20;    // units/s² when ↑ released
const LANE_OFFSETS = [-6.75, -2.25, 2.25, 6.75];

// ── Traffic constants ──────────────────────────────────────────────────────────
const TRAFFIC_SPAWN_DIST   = 140;   // units ahead to spawn (reaction window)
const TRAFFIC_DESPAWN_DIST = 25;    // units behind player before removal
const TRAFFIC_SPEED_BASE   = 22;    // oncoming speed (closing ~50 u/s total)
const TRAFFIC_POOL_SIZE    = 20;
const HIT_RADIUS           = 1.9;   // collision radius (cars ~2 wide at scale 1.3)
const NEAR_MISS_RADIUS     = 4.8;   // lateral radius to score a near-miss
const NEAR_MISS_WINDOW     = 4.0;   // Z window around player for detection

// ── Flow constants ─────────────────────────────────────────────────────────────
const FLOW_FILL_CLOSE      = 0.40;  // razor-close near-miss fill
const FLOW_FILL_NORMAL     = 0.25;  // standard near-miss fill
const FLOW_DRAIN_RATE      = 0.032; // passive drain per second
const FLOW_BURST_DURATION  = 5.0;

// ── Difficulty scaling ─────────────────────────────────────────────────────────
// 0.0 at start → 1.0 at 2000 m, stays 1.0 beyond
function diffScale() { return Math.min(1.0, score / 2000); }

// Spawn interval shrinks 2.4 s → 0.75 s
function trafficSpawnInterval() { return (2.4 - diffScale() * 1.65) + Math.random() * 0.45; }

// Traffic closing speed climbs 22 → 44 u/s
function trafficSpawnSpeed() { return TRAFFIC_SPEED_BASE + diffScale() * 22 + (Math.random() - 0.5) * 8; }

// Zone callouts
const ZONES = [
  { dist:    0, name: 'CITY STREETS' },
  { dist:  600, name: 'OUTSKIRTS'    },
  { dist: 1200, name: 'HIGHWAY'      },
  { dist: 2000, name: 'RUSH HOUR'    },
  { dist: 3200, name: 'GRIDLOCK'     },
];
let lastZoneIdx = -1;

// ── Ribbon mesh builder ────────────────────────────────────────────────────────
function buildRibbon(halfWL, halfWR, yOff, tex, tileLen) {
  const step = 2, n = Math.ceil((ROAD_START - ROAD_END) / step) + 1;
  const pos = new Float32Array(n*2*3), uv = new Float32Array(n*2*2), idx = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const z = ROAD_START - i*step, cx = curveX(z), dx = curveDX(z);
    const len = Math.sqrt(1+dx*dx), nx = 1/len, nz = -dx/len, b = i*6;
    pos[b  ] = cx+nx*halfWL; pos[b+1] = 0; pos[b+2] = z+nz*halfWL;
    pos[b+3] = cx+nx*halfWR; pos[b+4] = 0; pos[b+5] = z+nz*halfWR;
    const v = dist/tileLen;
    uv[i*4]=0; uv[i*4+1]=v; uv[i*4+2]=1; uv[i*4+3]=v;
    if (i > 0) dist += step;
    if (i < n-1) { const a=i*2; idx.push(a,a+1,a+2,a+1,a+3,a+2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uv,2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  m.position.y = yOff; m.receiveShadow = true; scene.add(m);
}

// Variant that emits solid colour — used for neon road stripes
function buildEmissiveRibbon(halfWL, halfWR, yOff, color) {
  const step = 4, n = Math.ceil((ROAD_START - ROAD_END) / step) + 1;
  const pos = new Float32Array(n*2*3), idx = [];
  for (let i = 0; i < n; i++) {
    const z = ROAD_START - i*step, cx = curveX(z), dx = curveDX(z);
    const len = Math.sqrt(1+dx*dx), nx = 1/len, b = i*6;
    pos[b  ] = cx+nx*halfWL; pos[b+1] = 0; pos[b+2] = z;
    pos[b+3] = cx+nx*halfWR; pos[b+4] = 0; pos[b+5] = z;
    if (i < n-1) { const a=i*2; idx.push(a,a+1,a+2,a+1,a+3,a+2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  m.position.y = yOff; scene.add(m);
}

function makeRoadTex() {
  const cw=256, ch=512;
  const cv = Object.assign(document.createElement('canvas'), { width:cw, height:ch });
  const cx = cv.getContext('2d');
  // Dark asphalt base
  cx.fillStyle = '#0d0d18'; cx.fillRect(0, 0, cw, ch);
  // Subtle surface noise
  for (let i=0; i<1800; i++) {
    const v = 18+(Math.random()*14|0);
    cx.fillStyle = `rgba(${v},${v},${v+4},0.28)`;
    cx.fillRect(Math.random()*cw, Math.random()*ch, 1+(Math.random()*1.5|0), 1);
  }
  // Neon edge lines (cyan)
  cx.fillStyle = 'rgba(79,240,255,0.72)';
  cx.fillRect(8, 0, 4, ch); cx.fillRect(cw-12, 0, 4, ch);
  // Dashed center dividers (purple)
  cx.fillStyle = 'rgba(198,75,255,0.60)';
  for (const tx of [64, 128, 192]) {
    for (let y=0; y<ch; y+=32) cx.fillRect(tx-2, y, 4, 20);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeCurbTex() {
  const cv = Object.assign(document.createElement('canvas'), { width:16, height:64 });
  const cx = cv.getContext('2d');
  cx.fillStyle = '#cc2020'; cx.fillRect(0,0,16,32);
  cx.fillStyle = '#f0f0f0'; cx.fillRect(0,32,16,32);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

buildRibbon(-ROAD_W/2, ROAD_W/2, 0.006, makeRoadTex(), 20);
buildRibbon(-ROAD_W/2-CURB_W, -ROAD_W/2, 0.010, makeCurbTex(), 6);
buildRibbon(ROAD_W/2, ROAD_W/2+CURB_W, 0.010, makeCurbTex(), 6);
// Neon road glow strips (emissive, sit just above road surface)
buildEmissiveRibbon(-0.18, 0.18,          0.015, 0x2a88bb); // centre line glow
buildEmissiveRibbon(-ROAD_W/2-0.05, -ROAD_W/2+0.10, 0.015, 0x6622bb); // left kerb glow
buildEmissiveRibbon( ROAD_W/2-0.10,  ROAD_W/2+0.05, 0.015, 0x6622bb); // right kerb glow

// ── Urban ground (dark concrete) ───────────────────────────────────────────────
{
  const cv = Object.assign(document.createElement('canvas'), { width:64, height:64 });
  const cx = cv.getContext('2d');
  cx.fillStyle = '#0c0c14'; cx.fillRect(0,0,64,64);
  for (let i=0; i<220; i++) {
    const v = Math.random()*10|0;
    cx.fillStyle = `rgba(${14+v},${14+v},${20+v},0.55)`;
    cx.fillRect(Math.random()*64, Math.random()*64, 2+(Math.random()*2|0), 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(50, 500);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, ROAD_LEN+50),
    new THREE.MeshLambertMaterial({ map:tex })
  );
  ground.rotation.x = -Math.PI/2;
  ground.position.set(0, -0.01, ROAD_START - ROAD_LEN/2);
  ground.receiveShadow = true;
  scene.add(ground);
}

// ── Neon city props ────────────────────────────────────────────────────────────

// Shared building window textures (3 accent variants)
function makeBuildingTex(accentHex) {
  const cw=64, ch=128;
  const cv = Object.assign(document.createElement('canvas'), {width:cw, height:ch});
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#07070f'; ctx.fillRect(0,0,cw,ch);
  for (let r=0; r<8; r++) for (let c=0; c<4; c++) {
    if (Math.random() > 0.36) {
      const col = Math.random() > 0.70 ? accentHex
                : Math.random() > 0.50 ? '#ffe890' : '#cc88ff';
      ctx.fillStyle = col;
      ctx.fillRect(c*14+3, r*15+3, 9, 9);
    }
  }
  return new THREE.CanvasTexture(cv);
}
const bldMatA = new THREE.MeshBasicMaterial({ map: makeBuildingTex('#4ff0ff') });
const bldMatB = new THREE.MeshBasicMaterial({ map: makeBuildingTex('#c64bff') });
const bldMatC = new THREE.MeshBasicMaterial({ map: makeBuildingTex('#ff44cc') });
const bldMats = [bldMatA, bldMatB, bldMatC];

const NEON_ACCENT_COLORS = [0x4ff0ff, 0xc64bff, 0xff44cc, 0xffcc00, 0xff3366];

function makeBuilding(x, z) {
  const w = 4+Math.random()*10, d = 3+Math.random()*8, h = 5+Math.random()*22;
  const mat = bldMats[Math.random()*bldMats.length|0];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  mesh.position.set(x, h/2, z);
  scene.add(mesh);
  // Neon rooftop accent strip
  if (Math.random() > 0.42) {
    const ac = NEON_ACCENT_COLORS[Math.random()*NEON_ACCENT_COLORS.length|0];
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(w+0.2, 0.35, d+0.2),
      new THREE.MeshBasicMaterial({ color: ac })
    );
    strip.position.set(x, h+0.18, z);
    scene.add(strip);
  }
  // Occasional vertical neon sign bar
  if (Math.random() > 0.72) {
    const ac = NEON_ACCENT_COLORS[Math.random()*NEON_ACCENT_COLORS.length|0];
    const sh = 3+Math.random()*4;
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, sh, 0.25),
      new THREE.MeshBasicMaterial({ color: ac })
    );
    sign.position.set(x + (Math.random()-0.5)*w*0.6, h*0.55, z + d/2 + 0.15);
    scene.add(sign);
  }
}

// Streetlights every ~40 m
const poleMat = new THREE.MeshLambertMaterial({ color: 0x1a2233 });
function makeStreetlight(x, z, side) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.13,8,5), poleMat);
  pole.position.y = 4; g.add(pole);
  // Horizontal arm
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,2.2,4), poleMat);
  arm.rotation.z = Math.PI/2; arm.position.set(side*1.1, 8.1, 0); g.add(arm);
  // Lamp head (emissive — no real light cost)
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.55,0.28,0.55),
    new THREE.MeshBasicMaterial({ color: 0x88eeff })
  );
  lamp.position.set(side*2.25, 8.0, 0); g.add(lamp);
  g.position.set(x, 0, z);
  scene.add(g);
}

// Spawn buildings + streetlights along road
for (let z=ROAD_START; z>ROAD_END; z -= 16+Math.random()*12) {
  const cx = curveX(z), edge = ROAD_W/2+CURB_W+1.2;
  // Close-row buildings
  makeBuilding(cx - edge - 2  - Math.random()*6, z);
  makeBuilding(cx + edge + 2  + Math.random()*6, z);
  // Mid-row buildings (denser city feel)
  if (Math.random() > 0.44) {
    makeBuilding(cx - edge - 10 - Math.random()*10, z + (Math.random()-0.5)*8);
    makeBuilding(cx + edge + 10 + Math.random()*10, z + (Math.random()-0.5)*8);
  }
}

for (let z=ROAD_START-5; z>ROAD_END; z -= 38+Math.random()*18) {
  const cx = curveX(z), edge = ROAD_W/2+CURB_W+1.5;
  makeStreetlight(cx - edge, z, -1);
  makeStreetlight(cx + edge, z,  1);
}

// ── Distant city skyline ───────────────────────────────────────────────────────
for (let i=0; i<70; i++) {
  const side = Math.random()>0.5 ? 1:-1, z = -(Math.random()*(ROAD_LEN-100));
  const cx = curveX(z);
  const w = 10+Math.random()*24, d = 10+Math.random()*18, h = 22+Math.random()*55;
  const dist = 90+Math.random()*90;
  const mat = bldMats[Math.random()*bldMats.length|0];
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(cx + side*dist, h/2-2, z);
  scene.add(m);
  // Skyline rooftop accent
  if (Math.random() > 0.5) {
    const ac = NEON_ACCENT_COLORS[Math.random()*NEON_ACCENT_COLORS.length|0];
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w+0.3,0.5,d+0.3), new THREE.MeshBasicMaterial({ color: ac }));
    cap.position.set(cx + side*dist, h-1.5, z);
    scene.add(cap);
  }
}

// ── Car definitions ────────────────────────────────────────────────────────────
const CARS = [
  { file:'NormalCar1',  name:'City Cruiser',  desc:'Balanced · Reliable',       accent:'#4a6eb5', scale:1.30, stats:{ speed:6, handling:7, armor:5 } },
  { file:'NormalCar2',  name:'Street Runner', desc:'Nimble · Quick · Responsive',accent:'#55bb33', scale:1.30, stats:{ speed:7, handling:8, armor:4 } },
  { file:'SportsCar',   name:'Sports Car',    desc:'Fast · Low · Aggressive',    accent:'#cc4422', scale:1.30, stats:{ speed:9, handling:7, armor:3 } },
  { file:'SportsCar2',  name:'Speed Demon',   desc:'Track-Ready · Raw Power',    accent:'#c64bff', scale:1.30, stats:{ speed:10,handling:6, armor:2 } },
  { file:'SUV',         name:'SUV',           desc:'Wide · Tough · Heavy',       accent:'#55aa33', scale:1.10, stats:{ speed:5, handling:4, armor:9 } },
  { file:'Cop',         name:'Police',        desc:'Authority · Built Tough',    accent:'#4488cc', scale:1.30, stats:{ speed:8, handling:7, armor:7 } },
  { file:'Taxi',        name:'Yellow Cab',    desc:'Classic · Boxy · Bold',      accent:'#ffcc00', scale:1.30, stats:{ speed:5, handling:6, armor:6 } },
];

// ── OBJ model loader & cache ───────────────────────────────────────────────────
const modelCache = new Map();

function centerMeshGeometry(mesh) {
  const geo = mesh.geometry;
  if (!geo) return;
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox.getCenter(c);
  geo.translate(-c.x, -c.y, -c.z);
  mesh.position.add(c);
}

function findWheelMeshes(root) {
  const info = { back: null, frontLeft: null, frontRight: null };
  root.traverse(child => {
    if (!child.isMesh) return;
    const n = child.name.toLowerCase();
    if      (n.includes('backwheel'))  info.back       = child;
    else if (n.includes('frontleft'))  info.frontLeft  = child;
    else if (n.includes('frontright')) info.frontRight = child;
  });
  return info;
}

function loadCarModel(carCfg) {
  if (modelCache.has(carCfg.file)) return Promise.resolve(modelCache.get(carCfg.file));
  return new Promise((resolve, reject) => {
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath('assets/cars/');
    mtlLoader.load(carCfg.file + '.mtl', mats => {
      mats.preload();
      const objLoader = new OBJLoader();
      objLoader.setMaterials(mats);
      objLoader.setPath('assets/cars/');
      objLoader.load(carCfg.file + '.obj', obj => {
        obj.traverse(child => {
          if (!child.isMesh) return;
          child.castShadow = true;
          if (child.name.toLowerCase().includes('wheel') ||
              child.name.toLowerCase().includes('front')) {
            centerMeshGeometry(child);
          }
        });
        const wheels = findWheelMeshes(obj);
        if (wheels.frontLeft)  wheels.frontLeft.rotation.order  = 'YXZ';
        if (wheels.frontRight) wheels.frontRight.rotation.order = 'YXZ';
        const result = { obj, wheels };
        modelCache.set(carCfg.file, result);
        resolve(result);
      }, undefined, reject);
    }, undefined, reject);
  });
}

function cloneForScene(cached) {
  const group = cached.obj.clone(true);
  const wheels = findWheelMeshes(group);
  if (wheels.frontLeft)  wheels.frontLeft.rotation.order  = 'YXZ';
  if (wheels.frontRight) wheels.frontRight.rotation.order = 'YXZ';
  return { group, wheels };
}

// ── Player car group ───────────────────────────────────────────────────────────
const carGroup = new THREE.Group();
carGroup.rotation.order = 'YXZ';
scene.add(carGroup);
let carWheelInfo    = { back: null, frontLeft: null, frontRight: null };
let carModelGroup   = null;   // the cloned OBJ mesh inside carGroup; lights live separately

// ── Flow burst car glow light ──────────────────────────────────────────────────
const carGlowLight = new THREE.PointLight(0x4ff0ff, 0, 14);
carGlowLight.position.set(0, -0.4, 0);
carGroup.add(carGlowLight);

// ── Headlights ────────────────────────────────────────────────────────────────
function makeHeadlight(xOff) {
  const sl = new THREE.SpotLight(0xddeeff, 0, 42, Math.PI * 0.14, 0.55, 1.8);
  sl.position.set(xOff, 0.55, -2.0);
  sl.target.position.set(xOff * 0.8, -1.5, -20);
  carGroup.add(sl);
  carGroup.add(sl.target);
  return sl;
}
const headL = makeHeadlight(-0.72);
const headR = makeHeadlight( 0.72);

// ── Preview renderer ───────────────────────────────────────────────────────────
const PREV_W = 360, PREV_H = 240;
const prevRenderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
prevRenderer.setSize(PREV_W, PREV_H);
prevRenderer.setPixelRatio(1);
prevRenderer.setClearColor(0x000000, 0);
const prevScene  = new THREE.Scene();
const prevCamera = new THREE.PerspectiveCamera(34, PREV_W/PREV_H, 0.1, 50);
prevCamera.position.set(5.5, 3.2, 7.5); prevCamera.lookAt(0, 0.8, 0);
prevScene.add(new THREE.AmbientLight(0xffeedd, 3.0));
const prevSun = new THREE.DirectionalLight(0xffffff, 4.5);
prevSun.position.set(5,10,8); prevScene.add(prevSun);
const prevFillA = new THREE.PointLight(0x4ff0ff, 5, 18);
prevFillA.position.set(-4, 2, -3); prevScene.add(prevFillA);
const prevFillB = new THREE.PointLight(0xc64bff, 3, 14);
prevFillB.position.set(3, -1, 3); prevScene.add(prevFillB);
const prevCarGroup = new THREE.Group();
prevScene.add(prevCarGroup);
let previewCarIdx = 0, previewAngle = 0;
let prevCarWheelInfo = { back: null, frontLeft: null, frontRight: null };

function setPreviewCar(idx) {
  previewCarIdx = ((idx % CARS.length) + CARS.length) % CARS.length;
  const carCfg  = CARS[previewCarIdx];
  document.getElementById('cs-name').textContent = carCfg.name;
  document.getElementById('cs-desc').textContent = carCfg.desc;
  document.querySelectorAll('.cs-dot').forEach((d,i) => d.classList.toggle('active', i === previewCarIdx));

  const statsEl = document.getElementById('cs-stats');
  if (statsEl) {
    statsEl.innerHTML = [
      ['Speed',    carCfg.stats.speed],
      ['Handling', carCfg.stats.handling],
      ['Armor',    carCfg.stats.armor],
    ].map(([label, val]) =>
      `<div class="cs-stat-row">` +
        `<span class="cs-stat-label">${label}</span>` +
        `<div class="cs-stat-track">` +
          `<div class="cs-stat-fill" style="width:${val*10}%;background:${carCfg.accent};box-shadow:0 0 6px ${carCfg.accent}"></div>` +
        `</div>` +
      `</div>`
    ).join('');
  }

  const overlay = document.getElementById('cs-load-overlay');
  if (overlay) overlay.style.display = 'flex';
  while (prevCarGroup.children.length) prevCarGroup.remove(prevCarGroup.children[0]);
  prevCarWheelInfo = { back: null, frontLeft: null, frontRight: null };

  loadCarModel(carCfg).then(cached => {
    const { group, wheels } = cloneForScene(cached);
    group.scale.setScalar(carCfg.scale);
    prevCarGroup.add(group);
    prevCarWheelInfo = wheels;
    if (overlay) overlay.style.display = 'none';
  }).catch(err => {
    console.warn('Car preview load failed:', err);
    if (overlay) overlay.style.display = 'none';
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.9, 3.8),
      new THREE.MeshLambertMaterial({ color: parseInt(carCfg.accent.replace('#',''), 16) })
    );
    box.position.y = 0.45;
    prevCarGroup.add(box);
  });
}

// ── Traffic system ─────────────────────────────────────────────────────────────
// Cars that come toward the player — dodge or take damage.
const TRAFFIC_CAR_FILES = ['NormalCar1', 'NormalCar2', 'Taxi', 'SUV', 'Cop'];
const trafficCfgList    = CARS.filter(c => TRAFFIC_CAR_FILES.includes(c.file));

// Build pool of empty slots (models populated async after load)
const trafficPool = Array.from({ length: TRAFFIC_POOL_SIZE }, () => {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  return {
    group,
    wheels:      { back: null, frontLeft: null, frontRight: null },
    active:      false,
    lane:        0,
    worldZ:      0,
    prevZ:       0,
    judged:      false,
    wheelRot:    0,
    speed:       TRAFFIC_SPEED_BASE,
    loadedFile:  null,
  };
});

// Pre-load all traffic car models and assign to pool slots
async function populateTrafficPool() {
  for (let i = 0; i < TRAFFIC_POOL_SIZE; i++) {
    const cfg = trafficCfgList[i % trafficCfgList.length];
    try {
      const cached = await loadCarModel(cfg);
      const { group: model, wheels } = cloneForScene(cached);
      model.scale.setScalar(cfg.scale);
      model.rotation.y = 0;          // front faces +Z (toward player — oncoming)
      trafficPool[i].group.add(model);
      trafficPool[i].wheels      = wheels;
      trafficPool[i].loadedFile  = cfg.file;
    } catch (_) {
      // Coloured box fallback
      const colors = [0xcc3322, 0x228844, 0x224488, 0xcc9922, 0x882288];
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.9, 4.0),
        new THREE.MeshLambertMaterial({ color: colors[i % colors.length] })
      );
      box.position.y = 0.45;
      box.castShadow = true;
      trafficPool[i].group.add(box);
      trafficPool[i].loadedFile = 'fallback';
    }
  }
}
populateTrafficPool(); // fire-and-forget

let trafficSpawnTimer = 0;

function getFreeTrafficSlot() {
  return trafficPool.find(t => !t.active) || null;
}

function spawnTraffic() {
  const slot = getFreeTrafficSlot();
  if (!slot || !slot.loadedFile) return; // pool not ready yet

  // Avoid spawning in a lane that already has a car close ahead
  const busyLanes = new Set();
  for (const t of trafficPool) {
    if (!t.active) continue;
    const distAhead = car.z - t.worldZ; // positive = t is ahead of player
    if (distAhead > -30 && distAhead < TRAFFIC_SPAWN_DIST * 0.8) {
      busyLanes.add(t.lane);
    }
  }
  const freeLanes = [0,1,2,3].filter(l => !busyLanes.has(l));
  const lane = freeLanes.length > 0
    ? freeLanes[Math.floor(Math.random() * freeLanes.length)]
    : Math.floor(Math.random() * 4);

  const spawnZ = car.z - TRAFFIC_SPAWN_DIST;
  slot.lane     = lane;
  slot.worldZ   = spawnZ;
  slot.prevZ    = spawnZ;
  slot.active   = true;
  slot.judged   = false;
  slot.wheelRot = 0;
  slot.speed    = trafficSpawnSpeed();

  const worldX  = curveX(spawnZ) + LANE_OFFSETS[lane];
  slot.group.position.set(worldX, 0, spawnZ);
  slot.group.rotation.y = Math.atan2(curveDX(spawnZ), 1);
  slot.group.visible = true;
}

function clearAllTraffic() {
  for (const t of trafficPool) {
    t.active = false;
    t.group.visible = false;
  }
}

function updateTraffic(dt) {
  for (const slot of trafficPool) {
    if (!slot.active) continue;

    slot.prevZ    = slot.worldZ;
    slot.worldZ  += slot.speed * dt;   // moving toward player (+Z)

    const worldX = curveX(slot.worldZ) + LANE_OFFSETS[slot.lane];
    slot.group.position.set(worldX, 0, slot.worldZ);
    slot.group.rotation.y = Math.atan2(curveDX(slot.worldZ), 1);

    // Wheel spin — traffic moves in +Z, same spin direction as player (forward)
    slot.wheelRot += slot.speed * dt * 2.2;
    if (slot.wheels.back)       slot.wheels.back.rotation.x       = slot.wheelRot;
    if (slot.wheels.frontLeft)  slot.wheels.frontLeft.rotation.x  = slot.wheelRot;
    if (slot.wheels.frontRight) slot.wheels.frontRight.rotation.x = slot.wheelRot;

    // Despawn when it has passed well behind the player
    if (slot.worldZ > car.z + TRAFFIC_DESPAWN_DIST) {
      slot.active = false;
      slot.group.visible = false;
      continue;
    }

    if (slot.judged) continue;

    const dx  = Math.abs(worldX - car.x);
    const dz  = Math.abs(slot.worldZ - car.z);

    // ── Collision ────────────────────────────────────────────────────────────
    if (dx < HIT_RADIUS && dz < HIT_RADIUS * 1.6) {
      slot.judged = true;
      takeDamage();
      continue;
    }

    // ── Near-miss window: traffic Z just crossed player Z ────────────────────
    if (slot.prevZ < car.z && slot.worldZ >= car.z) {
      slot.judged = true;
      if (dx < NEAR_MISS_RADIUS + upgradeVars.nearMissBonus) {
        const razor = dx < HIT_RADIUS * 2.2;
        nearMissCount++;
        nearMissStreak++;
        flowMeter = Math.min(1, flowMeter + (razor ? FLOW_FILL_CLOSE : FLOW_FILL_NORMAL));
        const streakSuffix = nearMissStreak > 1 ? ` ×${nearMissStreak}` : '';
        showHitFeedback('close', razor ? `RAZOR!${streakSuffix}` : `CLOSE!${streakSuffix}`);
        sfxPlay('nearMiss', 0.55);
        if (_combo) _combo.textContent = nearMissStreak > 1 ? `×${nearMissStreak}` : '';
      }
    }
  }
}

// ── Speed lines overlay ────────────────────────────────────────────────────────
const slCanvas = document.createElement('canvas');
slCanvas.width = W; slCanvas.height = H;
Object.assign(slCanvas.style, { position:'absolute', top:'0', left:'0', width:W+'px', height:H+'px', pointerEvents:'none', zIndex:'5' });
container.appendChild(slCanvas);
const slCtx = slCanvas.getContext('2d');
const SPEED_LINES = Array.from({length:30}, ()=>({ angle:Math.random()*Math.PI*2, len:0.05+Math.random()*0.13, width:0.4+Math.random()*1.5, phase:Math.random() }));

function drawSpeedLines(intensity, hexColor) {
  slCtx.clearRect(0,0,W,H);
  if (intensity < 0.02) return;
  const t=performance.now()/1000, cx=W/2, cy=H/2, R=Math.min(W,H);
  // Parse hex color to rgb for rgba() lines
  const hc = (hexColor||'#ffffff').replace('#','');
  const sr = parseInt(hc.slice(0,2),16), sg = parseInt(hc.slice(2,4),16), sb = parseInt(hc.slice(4,6),16);
  slCtx.save();
  for (const sl of SPEED_LINES) {
    const f=(t*(1.0+intensity*2.5)+sl.phase)%1, r0=(0.22+f*0.48)*R, r1=r0+sl.len*R*intensity;
    const alpha = (0.15+intensity*0.45)*(1-f*0.55);
    slCtx.strokeStyle=`rgba(${sr},${sg},${sb},${alpha})`;
    slCtx.lineWidth=sl.width*intensity; slCtx.beginPath();
    slCtx.moveTo(cx+Math.cos(sl.angle)*r0, cy+Math.sin(sl.angle)*r0);
    slCtx.lineTo(cx+Math.cos(sl.angle)*r1, cy+Math.sin(sl.angle)*r1);
    slCtx.stroke();
  }
  if (intensity > 0.3) {
    const g=slCtx.createRadialGradient(cx,cy,R*0.12,cx,cy,R*0.68);
    g.addColorStop(0,'rgba(0,0,0,0)');
    g.addColorStop(1,`rgba(0,0,0,${(intensity-0.3)*0.45})`);
    slCtx.globalAlpha=1; slCtx.fillStyle=g; slCtx.fillRect(0,0,W,H);
  }
  slCtx.restore();
}

// ── Web Audio (background atmosphere — beats still drive visual pulse) ─────────
let audioCtx    = null, audioBuffer = null, audioSource = null;
let masterGain  = null, musicGain   = null;
let beatMap     = null, audioReady  = false;
let songStartTime = 0,  songTime    = 0;
let nextBeatIdx = 0,    beatPulse   = 0;
let volMaster = 0.8,    volMusic    = 0.9;

// ── SFX system (HTMLAudioElement — no AudioContext needed) ─────────────────────
const SFX_FILES = {
  damage:     'assets/sfx/Damage_1.mp3',
  die:        'assets/sfx/Die_1.mp3',
  checkpoint: 'assets/sfx/Checkpoint_1.mp3',
  upgrade:    'assets/sfx/Powerup_1.mp3',
  nearMiss:   'assets/sfx/Coin_1.mp3',
  burst:      'assets/sfx/Level_Complete_1.mp3',
  laneSwitch: 'assets/sfx/Switch_1.mp3',
};
const SFX = {};
for (const [key, path] of Object.entries(SFX_FILES)) {
  const a = new Audio(path);
  a.preload = 'auto';
  SFX[key] = a;
}
function sfxPlay(key, vol = 1.0) {
  const snd = SFX[key];
  if (!snd) return;
  try {
    snd.currentTime = 0;
    snd.volume = Math.min(1, vol * volMaster);
    snd.play().catch(() => {});
  } catch(_) {}
}

// ── Near-miss streak ────────────────────────────────────────────────────────────
let nearMissStreak = 0;

const skyLerpTop = new THREE.Color(0x080818), skyLerpBot = new THREE.Color(0x0f1a3a);
const skyLerpFog = new THREE.Color(0x0d0d22), skyLerpAmb = new THREE.Color(0x334466);
let skyLerpAmbInt = 1.6;

async function initAudio() {
  try {
    const r = await fetch('beatmaps/chrome-rain-over-midtown.json');
    if (!r.ok) throw new Error('map 404');
    beatMap = await r.json();
    // Generate beats array from bpm/offset if not pre-baked in the JSON
    if (!beatMap.beats && beatMap.beatInterval && beatMap.offset != null) {
      const interval = beatMap.beatInterval;
      const end      = beatMap.songEndTime ?? beatMap.duration ?? 300;
      const arr = [];
      for (let t = beatMap.offset; t < end; t += interval) arr.push(t);
      beatMap.beats = arr;
    }
  } catch(e) { console.warn('Beat map:', e); return; }
  try {
    const tmp = new AudioContext();
    const ar  = await fetch(beatMap.file);
    if (!ar.ok) throw new Error('audio 404');
    audioBuffer = await tmp.decodeAudioData(await ar.arrayBuffer());
    await tmp.close();
    audioReady = true;
  } catch(e) { console.warn('Audio:', e); }
}
initAudio();

// Preload all car models (player + traffic) in the background
CARS.forEach(cfg => loadCarModel(cfg).catch(() => {}));

function ensureAudioCtx() {
  if (audioCtx) return;
  audioCtx   = new AudioContext();
  masterGain = audioCtx.createGain(); musicGain = audioCtx.createGain();
  musicGain.connect(masterGain); masterGain.connect(audioCtx.destination);
  masterGain.gain.value = volMaster; musicGain.gain.value = volMusic;
}
function startSong() {
  if (!audioReady) return;
  ensureAudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  stopSong();
  audioSource = audioCtx.createBufferSource();
  audioSource.buffer = audioBuffer; audioSource.connect(musicGain);
  audioSource.loop = true;
  songStartTime = audioCtx.currentTime; songTime = 0;
  nextBeatIdx = 0; beatPulse = 0;
  audioSource.onended = () => { audioSource = null; };
  audioSource.start(0);
}
function stopSong() {
  if (!audioSource) return;
  try { audioSource.stop(); } catch(_) {}
  audioSource.onended = null; audioSource = null;
}
function onBeat(idx) { beatPulse = idx % 4 === 0 ? 1.0 : 0.72; }

// ── Flow meter ─────────────────────────────────────────────────────────────────
let flowMeter      = 0;
let flowBurstActive = false;
let flowBurstTimer  = 0;

const _flowFill  = document.getElementById('hud-flow-fill');
const _flowWrap  = document.getElementById('hud-flow-wrap');
const _speedo    = document.getElementById('hud-speedo');
const _combo     = document.getElementById('hud-combo');
const _keyUp     = document.getElementById('key-up');
const _keyLeft   = document.getElementById('key-left');
const _keyRight  = document.getElementById('key-right');

// ── Burst vignette overlay ─────────────────────────────────────────────────────
const burstVignette = document.createElement('div');
Object.assign(burstVignette.style, {
  position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '6',
  opacity: '0', transition: 'opacity 0.25s ease',
  background: 'radial-gradient(ellipse at center, transparent 45%, rgba(79,240,255,0.18) 100%)',
  boxShadow: 'inset 0 0 120px rgba(79,240,255,0.22)',
});
document.body.appendChild(burstVignette);

function _burstAccent() { return beatMap?.theme?.accent ?? '#4ff0ff'; }

function triggerFlowBurst() {
  flowBurstActive = true;
  flowBurstTimer  = FLOW_BURST_DURATION + upgradeVars.burstDurationBonus;
  flowMeter       = 0;
  flowBurstCount++;
  showHitFeedback('burst', '⚡ FLOW BURST');
  sfxPlay('burst', 0.75);
  if (_flowWrap) _flowWrap.classList.add('burst');

  // ── Visual burst FX on ────────────────────────────────────────────────────
  const ac = _burstAccent();
  // Car glow colour
  carGlowLight.color.set(ac);
  // Vignette colour + show
  const vigColor = ac + '2e';  // 18% alpha hex
  burstVignette.style.background = `radial-gradient(ellipse at center, transparent 45%, ${ac}2e 100%)`;
  burstVignette.style.boxShadow  = `inset 0 0 140px ${ac}38`;
  burstVignette.style.opacity    = '1';
  // CSS filter on canvas — boost saturation & contrast
  renderer.domElement.style.filter = 'saturate(2.1) contrast(1.12) brightness(1.06)';
  // Sky shift: vivid neon version of theme
  if (beatMap?.theme) {
    const t = beatMap.theme;
    skyLerpTop.set(t.skyTop).multiplyScalar(0.4).addScalar(0.05);
    skyLerpBot.set(t.skyBot);
    skyLerpFog.set(t.fog);
    skyLerpAmb.set(ac); skyLerpAmbInt = 3.8;
  }
}

function updateFlowMeter(dt) {
  if (flowBurstActive) {
    flowBurstTimer -= dt;
    if (flowBurstTimer <= 0) {
      flowBurstActive = false;
      if (_flowWrap) _flowWrap.classList.remove('burst');

      // ── Visual burst FX off ────────────────────────────────────────────────
      burstVignette.style.opacity    = '0';
      renderer.domElement.style.filter = '';
      // Sky back to normal play theme
      if (beatMap?.theme) {
        const t = beatMap.theme;
        skyLerpTop.set(t.skyTop); skyLerpBot.set(t.skyBot);
        skyLerpFog.set(t.fog);   skyLerpAmb.set(t.accent); skyLerpAmbInt = 1.8;
      }
    }
    if (_flowFill) _flowFill.style.width = '100%';
  } else {
    flowMeter = Math.max(0, flowMeter - FLOW_DRAIN_RATE * upgradeVars.flowDrainMult * dt);
    if (flowMeter >= 1.0) triggerFlowBurst();
    if (_flowFill) _flowFill.style.width = (flowMeter * 100).toFixed(1) + '%';
  }
}

// ── Damage & camera shake ──────────────────────────────────────────────────────
let gameOverPending = false;
const camShake = { timer: 0, intensity: 0 };

let damageFlashTimer = 0;

function takeDamage() {
  if (gameOverPending || flowBurstActive || ghostTimer > 0) return; // invincible during burst or ghost
  const dmg = upgradeVars.ironSkin > 0 ? 0.5 / Math.pow(2, upgradeVars.ironSkin) : 0.5;
  hp = Math.max(0, hp - dmg);
  collisionCount++;
  nearMissStreak = 0;
  if (_combo) _combo.textContent = '';
  if (upgradeVars.ghostHits > 0) ghostTimer = 1.5;
  updateHearts();
  damageFlash.style.background = 'rgba(220,20,20,0.50)';
  damageFlashTimer = 0.40;
  camShake.timer     = 0.55;
  camShake.intensity = 0.40;
  document.querySelectorAll('.heart').forEach(el => {
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 220);
  });
  if (hp <= 0) {
    sfxPlay('die', 0.9);
    gameOverPending = true;
    setTimeout(() => { setState(STATE.GAME_OVER); gameOverPending = false; }, 900);
  } else {
    sfxPlay('damage', 0.8);
  }
}

// ── Car physics state ──────────────────────────────────────────────────────────
const car = { x:0, z:0, heading:0, lane:1, laneX:LANE_OFFSETS[1], lean:0, wheelRot:0, suspY:0, suspVel:0, pitch:0, speed:0 };

function resetCar() {
  car.z = 0; car.lane = 1; car.laneX = LANE_OFFSETS[1];
  car.x = curveX(0) + car.laneX; car.heading = Math.atan2(-curveDX(0), 1);
  car.lean = 0; car.wheelRot = 0; car.suspY = 0; car.suspVel = 0; car.pitch = 0; car.speed = 0;
}

function switchLane(dir) {
  if (gameState !== STATE.PLAYING) return;
  sfxPlay('laneSwitch', 0.35);
  car.lane = Math.max(0, Math.min(3, car.lane + dir));
  updateLanePips();
}

function updateLanePips() {
  document.querySelectorAll('.lane-pip').forEach((el,i) => el.classList.toggle('active', i === car.lane));
}

// ── Input ──────────────────────────────────────────────────────────────────────
const keys = {};
addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  if (e.repeat) return;
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') switchLane(-1);
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') switchLane(1);
});
addEventListener('keyup', e => { keys[e.key] = false; });


const csPreviewWrap = document.getElementById('cs-preview-wrap');
if (csPreviewWrap) {
  csPreviewWrap.appendChild(prevRenderer.domElement);
} else {
  console.error('[PulseDrive] #cs-preview-wrap not found — preview renderer not mounted');
}
document.getElementById('hud-username').textContent = incoming.username || '';
document.getElementById('hud-speedo').textContent   = '0 MPH';
// ── HUD helpers ────────────────────────────────────────────────────────────────
function updateHearts() {
  const full = Math.floor(hp), half = (hp % 1) >= 0.5 ? 1 : 0;
  const totalHearts = Math.min(5, Math.max(3, Math.ceil(maxHp)));
  ['h1','h2','h3','h4','h5'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display  = i < totalHearts ? '' : 'none';
    el.className      = 'heart ' + (i < full ? 'full' : i < full + half ? 'half' : 'empty');
    el.textContent    = i < full + half ? '♥' : '♡';
  });
}

function updateScore() {
  score = Math.max(0, -car.z);
  document.getElementById('hud-score').textContent = (score | 0).toLocaleString() + ' m';
}

function showHitFeedback(type, text) {
  hitFlash.textContent = text;
  hitFlash.className   = `show ${type}`;
  hitFlashTimer        = type === 'burst' ? 1.2 : type === 'zone' ? 2.0 : 0.62;
}

// ── State machine ──────────────────────────────────────────────────────────────
function setState(s) {
  const prev = gameState;
  gameState  = s;

  if (s === STATE.PLAYING && prev !== STATE.PLAYING) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
  } else if (prev === STATE.PLAYING && s !== STATE.PLAYING) {
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
  }

  Object.values(SCREEN_MAP).forEach(el => el.classList.add('hidden'));
  if (SCREEN_MAP[s]) SCREEN_MAP[s].classList.remove('hidden');

  // Upgrade screen lives outside SCREEN_MAP — manage manually
  if (screenUpgrade) screenUpgrade.classList.toggle('hidden', s !== STATE.UPGRADE);

  // HUD visible during play AND during upgrade pause
  hud.classList.toggle('hidden', s !== STATE.PLAYING && s !== STATE.UPGRADE);

  if (s === STATE.CAR_SELECT) {
    previewAngle = 0;
    setPreviewCar(previewCarIdx);
  }

  if ((prev === STATE.PLAYING || prev === STATE.UPGRADE) && s !== STATE.PLAYING && s !== STATE.UPGRADE) {
    stopSong();
    clearAllTraffic();
    damageFlash.style.background = 'rgba(220,20,20,0)';
    if (_flowWrap) _flowWrap.classList.remove('burst');
    // Clear burst FX + lights
    burstVignette.style.opacity      = '0';
    renderer.domElement.style.filter = '';
    carGlowLight.intensity           = 0;
    headL.intensity = headR.intensity = 0;
    if (carModelGroup) carModelGroup.visible = true;
    skyLerpTop.set(0x080818); skyLerpBot.set(0x0f1a3a);
    skyLerpFog.set(0x0d0d22); skyLerpAmb.set(0x334466); skyLerpAmbInt = 1.4;
  }

  if (s === STATE.PLAYING) {
    if (prev === STATE.UPGRADE) {
      // ── Resume after upgrade — just unpause, no reset ────────────────────
      trafficSpawnTimer = 0.8;
      headL.intensity = headR.intensity = 3.5;
    } else {
    // ── Fresh run — reset everything ──────────────────────────────────────
    hp = 3.0; maxHp = 3; score = 0;
    nearMissCount = 0; flowBurstCount = 0; collisionCount = 0; nearMissStreak = 0;
    if (_combo) _combo.textContent = '';
    flowMeter = 0; flowBurstActive = false; flowBurstTimer = 0;
    if (_flowWrap) _flowWrap.classList.remove('burst');
    nextCheckpoint = CHECKPOINT_INTERVAL;
    lastZoneIdx = -1;
    // Reset upgrade vars
    upgradeVars.maxSpd = 0; upgradeVars.accel = 0;
    upgradeVars.flowDrainMult = 1.0; upgradeVars.nearMissBonus = 0;
    upgradeVars.ghostHits = 0; upgradeVars.ironSkin = 0;
    upgradeVars.burstDurationBonus = 0;
    ghostTimer = 0;
    updateHearts(); updateScore(); updateLanePips();
    resetCar(); redirecting = false;
    trafficSpawnTimer = 1.2;  // first car after 1.2 s

    // ── Apply player car model ───────────────────────────────────────────────
    // Remove only the mesh, leaving headlights & glow light attached to carGroup
    if (carModelGroup) { carGroup.remove(carModelGroup); carModelGroup = null; }
    carWheelInfo = { back: null, frontLeft: null, frontRight: null };

    const applyCarModel = cached => {
      if (carModelGroup) { carGroup.remove(carModelGroup); carModelGroup = null; }
      const { group, wheels } = cloneForScene(cached);
      group.scale.setScalar(CARS[selectedCar].scale);
      group.rotation.y = Math.PI;   // front faces -Z so camera behind sees the rear
      carGroup.add(group);
      carModelGroup = group;
      carWheelInfo  = wheels;
    };
    const cachedCar = modelCache.get(CARS[selectedCar].file);
    if (cachedCar) {
      applyCarModel(cachedCar);
    } else {
      const placeholder = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.85, 4.2),
        new THREE.MeshLambertMaterial({ color: parseInt(CARS[selectedCar].accent.replace('#',''), 16) })
      );
      placeholder.position.y = 0.43; placeholder.castShadow = true;
      carGroup.add(placeholder);
      carModelGroup = placeholder;   // tracked so applyCarModel removes it when ready
      loadCarModel(CARS[selectedCar]).then(applyCarModel).catch(() => {});
    }

    // ── Sky theme + music ────────────────────────────────────────────────────
    if (beatMap?.theme) {
      const t = beatMap.theme;
      skyLerpTop.set(t.skyTop); skyLerpBot.set(t.skyBot);
      skyLerpFog.set(t.fog);   skyLerpAmb.set(t.accent); skyLerpAmbInt = 1.8;
    }
    startSong();
    headL.intensity = headR.intensity = 3.5;
    } // end fresh-run else
  }

  if (s === STATE.GAME_OVER) {
    nearMissStreak = 0;
    document.getElementById('go-score').textContent = (Math.max(0,-car.z)|0).toLocaleString() + ' m';
    document.getElementById('go-combo').textContent = nearMissCount;
    document.getElementById('go-hits' ).textContent = flowBurstCount;
    document.getElementById('go-miss' ).textContent = collisionCount;
  }

  if (s === STATE.EXIT) {
    const nameEl = document.getElementById('exit-portal-name');
    if (nameEl) nameEl.textContent = '→ Jam Lobby';
  }
}

// ── Menu camera ────────────────────────────────────────────────────────────────
function updateMenuCamera(dt) {
  menuTime += dt;
  const t = menuTime * 0.055;
  camera.fov = 70; camera.updateProjectionMatrix();
  camera.position.set(curveX(-20)+Math.sin(t)*5, 7+Math.sin(t*0.7)*1.2, 16+Math.cos(t*0.4)*3);
  camera.lookAt(curveX(-40), 1.2, -40);
}

// ── Sky lerp ──────────────────────────────────────────────────────────────────
function lerpSky(dt) {
  const r = dt * 1.4;
  skyMat.uniforms.uTop.value.lerp(skyLerpTop, r);
  skyMat.uniforms.uBot.value.lerp(skyLerpBot, r);
  scene.fog.color.lerp(skyLerpFog, r);
  ambLight.color.lerp(skyLerpAmb, r);
  ambLight.intensity += (skyLerpAmbInt - ambLight.intensity) * r;
}

// ── Gameplay update ────────────────────────────────────────────────────────────
function updatePlaying(dt) {
  if (gameOverPending) return;

  // ── Audio beat tracking (drives visual ambiance) ─────────────────────────
  if (audioCtx && audioSource) songTime = audioCtx.currentTime - songStartTime;
  if (beatMap?.beats) {
    const beats = beatMap.beats;
    while (nextBeatIdx < beats.length && beats[nextBeatIdx] <= songTime) onBeat(nextBeatIdx++);
  }
  beatPulse *= Math.pow(0.001, dt);

  if (beatPulse > 0.05) {
    const ac = beatMap?.theme?.accent ?? '#4ff0ff';
    beatBar.style.background = `linear-gradient(90deg,transparent,${ac},transparent)`;
    beatBar.style.opacity    = beatPulse;
    beatBar.style.boxShadow  = `0 0 ${(beatPulse*14)|0}px ${ac}`;
  } else { beatBar.style.opacity = '0'; }

  ambLight.intensity = skyLerpAmbInt + beatPulse * 2.2;
  beatLight.position.set(car.x, 4, car.z - 8);
  beatLight.intensity = beatPulse * 5.5;
  if (beatMap?.theme?.accent) beatLight.color.set(beatMap.theme.accent);

  if (damageFlashTimer > 0) {
    damageFlashTimer -= dt;
    if (damageFlashTimer <= 0) damageFlash.style.background = 'rgba(220,20,20,0)';
  }

  // ── Traffic ──────────────────────────────────────────────────────────────
  trafficSpawnTimer -= dt;
  if (trafficSpawnTimer <= 0) {
    spawnTraffic();
    // At high difficulty occasionally spawn a second car in a different lane
    if (diffScale() > 0.55 && Math.random() < (diffScale() - 0.55) * 1.8) {
      spawnTraffic();
    }
    trafficSpawnTimer = trafficSpawnInterval();
  }
  updateTraffic(dt);

  // ── Zone callouts ─────────────────────────────────────────────────────────
  let zi = 0;
  for (let i = 0; i < ZONES.length; i++) { if (score >= ZONES[i].dist) zi = i; }
  if (zi > lastZoneIdx) {
    lastZoneIdx = zi;
    showHitFeedback('zone', ZONES[zi].name);
  }

  // ── Ghost timer ──────────────────────────────────────────────────────────
  if (ghostTimer > 0) ghostTimer = Math.max(0, ghostTimer - dt);

  // ── Flow meter ────────────────────────────────────────────────────────────
  updateFlowMeter(dt);

  // ── Car movement ─────────────────────────────────────────────────────────
  // ── Key sprite feedback ───────────────────────────────────────────────────
  const accelInput = keys['ArrowUp'] || keys['w'] || keys['W'];
  const leftInput  = keys['ArrowLeft']  || keys['a'] || keys['A'];
  const rightInput = keys['ArrowRight'] || keys['d'] || keys['D'];
  if (_keyUp) {
    _keyUp.src = accelInput ? 'assets/keys/arrowup_pressed_paper.png'    : 'assets/keys/arrowup_paper.png';
    _keyUp.classList.toggle('pressed', accelInput);
  }
  if (_keyLeft) {
    _keyLeft.src = leftInput  ? 'assets/keys/arrowleft_pressed_paper.png'  : 'assets/keys/arrowleft_paper.png';
    _keyLeft.classList.toggle('pressed', leftInput);
  }
  if (_keyRight) {
    _keyRight.src = rightInput ? 'assets/keys/arrowright_pressed_paper.png' : 'assets/keys/arrowright_paper.png';
    _keyRight.classList.toggle('pressed', rightInput);
  }

  const effectiveMaxSpd = MAX_SPD + upgradeVars.maxSpd;
  const effectiveAccel  = ACCEL_RATE + upgradeVars.accel;
  if (accelInput) {
    car.speed = Math.min(effectiveMaxSpd, car.speed + effectiveAccel * dt);
  } else {
    car.speed = Math.max(0, car.speed - DECEL_RATE * dt);
  }

  car.z -= car.speed * dt;
  updateScore();

  // Update speedo + colour ramp (blue → green → yellow → red)
  const speedPct  = car.speed / (MAX_SPD + upgradeVars.maxSpd);
  const speedoCol = speedPct < 0.4 ? '#4ff0ff'
                  : speedPct < 0.7 ? '#88ff44'
                  : speedPct < 0.9 ? '#ffcc00'
                  :                  '#ff4444';
  if (_speedo) {
    _speedo.textContent      = `${(car.speed * 2.237) | 0} MPH`;
    _speedo.style.color      = speedoCol;
    _speedo.style.textShadow = `0 0 12px ${speedoCol}`;
  }

  // ── Checkpoint detection ──────────────────────────────────────────────────
  if (score >= nextCheckpoint) {
    nextCheckpoint += CHECKPOINT_INTERVAL;
    showUpgradeScreen();
    return; // skip rest of frame — we just changed state
  }

  const targetLaneX = LANE_OFFSETS[car.lane];
  const prevLaneX   = car.laneX;
  car.laneX += (targetLaneX - car.laneX) * Math.min(1, dt * 12);
  car.x = curveX(car.z) + car.laneX;

  const tH = Math.atan2(-curveDX(car.z), 1);
  let dH = tH - car.heading;
  while (dH >  Math.PI) dH -= Math.PI*2;
  while (dH < -Math.PI) dH += Math.PI*2;
  car.heading += dH * Math.min(1, dt * 10);

  const lateralVel = (car.laneX - prevLaneX) / Math.max(dt, 0.001);
  car.lean += (-lateralVel*0.011 - car.lean) * Math.min(1, dt*8);
  car.lean  = Math.max(-0.08, Math.min(0.08, car.lean));

  car.suspVel += (-100*car.suspY - 18*car.suspVel + (Math.random()-0.5)*9) * dt;
  car.suspY   += car.suspVel * dt;
  car.suspY    = Math.max(-0.12, Math.min(0.10, car.suspY));
  car.pitch   += (-car.suspY*0.055 - car.pitch) * Math.min(1, dt*4);
  car.pitch    = Math.max(-0.04, Math.min(0.04, car.pitch));

  car.wheelRot += car.speed * dt * 2.2;
  const steerVis = Math.max(-0.38, Math.min(0.38, lateralVel * 0.038));

  if (carWheelInfo.back)       carWheelInfo.back.rotation.x       = car.wheelRot;
  if (carWheelInfo.frontLeft)  { carWheelInfo.frontLeft.rotation.y  = steerVis; carWheelInfo.frontLeft.rotation.x  = car.wheelRot; }
  if (carWheelInfo.frontRight) { carWheelInfo.frontRight.rotation.y = steerVis; carWheelInfo.frontRight.rotation.x = car.wheelRot; }

  carGroup.position.set(car.x, car.suspY, car.z);
  carGroup.rotation.y = car.heading; carGroup.rotation.x = car.pitch; carGroup.rotation.z = car.lean;

  // ── Camera ───────────────────────────────────────────────────────────────
  camera.fov = 72; camera.updateProjectionMatrix();
  const pb = 9.2;
  let cx = car.x - Math.sin(car.heading)*pb;
  let cy = 3.4;
  if (camShake.timer > 0) {
    camShake.timer -= dt;
    const s = camShake.intensity * (camShake.timer / 0.55);
    cx += (Math.random()-0.5) * s;
    cy += (Math.random()-0.5) * s * 0.4;
  }
  camera.position.set(cx, cy, car.z + Math.cos(car.heading)*pb);
  camera.lookAt(car.x + Math.sin(car.heading)*8, 1.4, car.z - Math.cos(car.heading)*8);

  // ── Speed lines — intensify + recolour during flow burst ─────────────────
  const slIntensity = flowBurstActive ? 0.65 + beatPulse*0.3 : 0.28 + beatPulse*0.50;
  const slColor     = flowBurstActive ? _burstAccent() : '#ffffff';
  drawSpeedLines(slIntensity, slColor);

  // ── Car glow — burst accent, ghost white pulse, or off ───────────────────
  if (flowBurstActive) {
    carGlowLight.color.set(_burstAccent());
    carGlowLight.intensity = 7.0 + beatPulse * 6.0;
  } else if (ghostTimer > 0) {
    carGlowLight.color.set(0xffffff);
    carGlowLight.intensity = 3.5 + Math.sin(performance.now() * 0.012) * 2.0;
  } else {
    carGlowLight.intensity = 0;
  }

  // Ghost Drive blink — flash the car mesh while invincible
  if (carModelGroup) {
    carModelGroup.visible = ghostTimer <= 0 || Math.floor(performance.now() / 100) % 2 === 0;
  }

  if (hitFlashTimer > 0) { hitFlashTimer -= dt; if (hitFlashTimer <= 0) hitFlash.className = ''; }

}

// ── Main loop ──────────────────────────────────────────────────────────────────
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (gameState === STATE.PLAYING) {
    updatePlaying(dt);
  } else if (gameState === STATE.UPGRADE) {
    // World frozen — only tick beat pulse so lights stay alive
    beatPulse *= Math.pow(0.001, dt);
  } else {
    updateMenuCamera(dt);
  }

  lerpSky(dt); // always run once per frame
  renderer.render(scene, camera);

  if (gameState === STATE.CAR_SELECT) {
    previewAngle += dt * 0.7;
    prevCarGroup.rotation.y = previewAngle;
    const wSpin = dt * 2.5;
    if (prevCarWheelInfo.back)       prevCarWheelInfo.back.rotation.x      += wSpin;
    if (prevCarWheelInfo.frontLeft)  prevCarWheelInfo.frontLeft.rotation.x  += wSpin;
    if (prevCarWheelInfo.frontRight) prevCarWheelInfo.frontRight.rotation.x += wSpin;
    prevRenderer.render(prevScene, prevCamera);
  }

  if (gameState === STATE.PLAYING || gameState === STATE.UPGRADE) {
    requestAnimationFrame(loop);
  } else {
    setTimeout(() => requestAnimationFrame(loop), 33);
  }
}
requestAnimationFrame(loop);
