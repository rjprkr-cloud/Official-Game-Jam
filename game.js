// 3-D game-jam starter — Three.js edition
// Portal Protocol (mandatory for the jam) + optional Trystero P2P multiplayer.
//
// To make your own game: replace the Three.js scene below with your own.
// Just keep the Portal.* calls intact, and optionally keep the multiplayer block.

import * as THREE from 'https://esm.sh/three@0.169';

// ── Renderer ──────────────────────────────────────────────────────────────────
const container = document.getElementById('game-container');
const W = 960, H = 540;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

// ── Scene & camera ────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120826);
scene.fog = new THREE.Fog(0x120826, 32, 62);

const camera = new THREE.PerspectiveCamera(65, W / H, 0.1, 200);

// ── Portal Protocol ───────────────────────────────────────────────────────────
const incoming = Portal.readPortalParams();
document.getElementById('username').textContent = incoming.username;
const nextTarget = await Portal.pickPortalTarget();

// ── World layout ──────────────────────────────────────────────────────────────
const HW = 10;   // play-area half-width  (world units)
const HD = 6;    // play-area half-depth

// ── Lighting ──────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x2a0f50, 4));

const sun = new THREE.DirectionalLight(0xd0aaff, 1.2);
sun.position.set(6, 18, 6);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(1024);
sun.shadow.camera.near   = 1;
sun.shadow.camera.far    = 50;
sun.shadow.camera.left   = -(HW + 2);
sun.shadow.camera.right  =   HW + 2;
sun.shadow.camera.top    =   HD + 2;
sun.shadow.camera.bottom = -(HD + 2);
scene.add(sun);

// ── Ground + grid ─────────────────────────────────────────────────────────────
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(HW * 2, HD * 2),
  new THREE.MeshStandardMaterial({ color: 0x160820, roughness: 0.95, metalness: 0.05 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

scene.add(new THREE.GridHelper(HW * 2, 18, 0x3d1870, 0x1e0a40));

// ── Stars ─────────────────────────────────────────────────────────────────────
{
  const N = 500;
  const p = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    p[i*3]   = (Math.random() - 0.5) * 120;
    p[i*3+1] = 10 + Math.random() * 50;
    p[i*3+2] = (Math.random() - 0.5) * 120;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.2, transparent: true, opacity: 0.8,
  })));
}

// ── Player ────────────────────────────────────────────────────────────────────
const pColorStr = incoming.color ? '#' + incoming.color : '#c64bff';
const pColor    = new THREE.Color(pColorStr);

const playerMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.44, 24, 24),
  new THREE.MeshStandardMaterial({
    color: pColor, emissive: pColor, emissiveIntensity: 0.7,
    roughness: 0.2, metalness: 0.6,
  })
);
playerMesh.position.y = 0.44;
playerMesh.castShadow = true;
scene.add(playerMesh);
playerMesh.add(new THREE.PointLight(pColor, 3, 4));

const player = {
  x: 0,
  z: 0,
  r: 0.44,
  speed: (incoming.speed || 5) * 1.5,  // world units / second
};

// ── Portal helpers ────────────────────────────────────────────────────────────
function makeLabel(text, colorHex) {
  const cv = Object.assign(document.createElement('canvas'), { width: 320, height: 64 });
  const cx = cv.getContext('2d');
  cx.fillStyle = colorHex;
  cx.font = 'bold 24px ui-sans-serif, system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillText(text, 160, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true,
  }));
  sp.scale.set(3.5, 0.7, 1);
  return sp;
}

function mkPortal(wx, wz, colorHex, labelText, target) {
  const col = new THREE.Color(colorHex);
  const grp = new THREE.Group();
  grp.position.set(wx, 0, wz);

  // Glowing ring (torus in XY plane — faces camera naturally)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.1, 16, 90),
    new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 2.2,
      roughness: 0.1, metalness: 0.9,
    })
  );
  grp.add(ring);

  // Translucent portal face
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 48),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
  );
  grp.add(disc);

  // Point light
  const pl = new THREE.PointLight(col, 5, 7);
  pl.position.y = 0.5;
  grp.add(pl);

  // Floating label sprite
  const lsp = makeLabel(labelText, colorHex);
  lsp.position.y = 1.85;
  grp.add(lsp);

  scene.add(grp);
  return { grp, ring, disc, pl, x: wx, z: wz, r: 1.15, target, pulse: 0 };
}

const exitPortal = mkPortal(
  HW - 1.5, 0,
  '#c64bff',
  nextTarget ? `→ ${nextTarget.title}` : 'no destinations yet',
  nextTarget?.url || null
);

const returnPortal = incoming.ref
  ? mkPortal(-(HW - 1.5), 0, '#4ff0ff', '← back', incoming.ref)
  : null;

if (incoming.fromPortal && returnPortal) {
  player.x = returnPortal.x + returnPortal.r + 1.0;
}
playerMesh.position.set(player.x, 0.44, player.z);

// ── Multiplayer via Trystero (optional — delete this block to go solo-only) ───
// Network sends {x, y} where y maps to world-z for backwards-compat with 2-D clients.

const peers   = new Map();
const peersEl = document.getElementById('peers');
let sendState = null;
let room      = null;

function setPeerStatus(text, isErr = false) {
  if (!peersEl) return;
  peersEl.textContent = text;
  peersEl.style.color = isErr ? '#ff6b6b' : '';
}
function refreshPeerCount() { setPeerStatus(`${peers.size + 1} online`); }

function broadcastSelf() {
  if (!sendState) return;
  sendState({ x: player.x, y: player.z, color: pColorStr, username: incoming.username });
}

async function loadTrystero() {
  const urls = [
    'https://esm.run/trystero@0.23',
    'https://cdn.jsdelivr.net/npm/trystero@0.23/+esm',
    'https://esm.sh/trystero@0.23',
  ];
  for (const url of urls) {
    try {
      const mod = await import(url);
      if (typeof mod.joinRoom === 'function') {
        console.log('[jam] loaded trystero from', url);
        return mod;
      }
    } catch (e) { console.warn('[jam] cdn failed:', url, e.message); }
  }
  throw new Error('could not load trystero');
}

const peerSphereGeo = new THREE.SphereGeometry(0.44, 12, 12);

function getOrMakePeerMesh(peer) {
  if (peer.mesh) return peer.mesh;
  const col = new THREE.Color(peer.color || '#888888');
  const m = new THREE.Mesh(peerSphereGeo, new THREE.MeshStandardMaterial({
    color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.3,
  }));
  m.position.y = 0.44;
  scene.add(m);
  peer.mesh = m;
  return m;
}

async function setupMultiplayer() {
  try {
    setPeerStatus('connecting…');
    const { joinRoom } = await loadTrystero();
    room = joinRoom({ appId: 'ordinary-game-jam-starter' }, 'demo-room');
    const [send, getState] = room.makeAction('state');
    sendState = send;

    room.onPeerJoin(id => {
      peers.set(id, null);
      broadcastSelf();
      refreshPeerCount();
    });
    room.onPeerLeave(id => {
      const p = peers.get(id);
      if (p?.mesh) scene.remove(p.mesh);
      peers.delete(id);
      refreshPeerCount();
    });
    getState((data, peerId) => {
      const ex = peers.get(peerId);
      peers.set(peerId, {
        ...data,
        renderX: ex?.renderX ?? data.x,
        renderZ: ex?.renderZ ?? data.y,
        mesh: ex?.mesh ?? null,
      });
    });

    refreshPeerCount();
    broadcastSelf();
    console.log('[jam] multiplayer ready (nostr)');
  } catch (err) {
    console.error('[jam] multiplayer failed:', err);
    setPeerStatus('multiplayer offline', true);
  }
}

setPeerStatus('connecting…');
setupMultiplayer();
addEventListener('beforeunload', () => { try { room?.leave(); } catch {} });

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

// ── Portal collision ──────────────────────────────────────────────────────────
let redirecting = false;
function tryPortal(portal) {
  if (redirecting || !portal?.target) return;
  if (Math.hypot(player.x - portal.x, player.z - portal.z) < portal.r + player.r - 0.1) {
    redirecting = true;
    Portal.sendPlayerThroughPortal(portal.target, {
      username: incoming.username,
      color: incoming.color,
      speed: incoming.speed,
    });
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
let lastBcast = 0;

function update(dt, now) {
  // Movement
  const v = player.speed * dt;
  if (keys['w'] || keys['arrowup'])    player.z -= v;
  if (keys['s'] || keys['arrowdown'])  player.z += v;
  if (keys['a'] || keys['arrowleft'])  player.x -= v;
  if (keys['d'] || keys['arrowright']) player.x += v;
  player.x = Math.max(-HW + player.r, Math.min(HW - player.r, player.x));
  player.z = Math.max(-HD + player.r, Math.min(HD - player.r, player.z));
  playerMesh.position.set(player.x, 0.44, player.z);

  // Follow camera
  camera.position.set(player.x, 16, player.z + 12);
  camera.lookAt(player.x, 0, player.z);

  // Portal animation
  for (const p of [exitPortal, returnPortal]) {
    if (!p) continue;
    p.pulse += dt * 2.8;
    p.ring.rotation.z += dt * 0.7;
    p.disc.material.opacity = 0.12 + 0.1 * Math.sin(p.pulse);
    p.pl.intensity = 4 + 2.5 * Math.sin(p.pulse);
  }

  tryPortal(exitPortal);
  if (returnPortal) tryPortal(returnPortal);

  if (now - lastBcast > 66) { lastBcast = now; broadcastSelf(); }

  // Peer interpolation
  for (const peer of peers.values()) {
    if (!peer) continue;
    const k = Math.min(1, dt * 12);
    peer.renderX = (peer.renderX ?? peer.x) + (peer.x - (peer.renderX ?? peer.x)) * k;
    peer.renderZ = (peer.renderZ ?? peer.y) + (peer.y - (peer.renderZ ?? peer.y)) * k;
    getOrMakePeerMesh(peer).position.set(peer.renderX, 0.44, peer.renderZ);
  }
}

// ── Loop ──────────────────────────────────────────────────────────────────────
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt, now);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
