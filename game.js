// Cruise — Phase 3: Drift · Suspension · Skid Marks · Speed Lines
// Portal Protocol preserved.

import * as THREE from 'https://esm.sh/three@0.169';

// ── Renderer ───────────────────────────────────────────────────────────────────
const container = document.getElementById('game-container');
const W = 960, H = 540;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0xf0a060);
container.appendChild(renderer.domElement);

// ── Scene ──────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf0a060, 55, 170);

// ── Camera ─────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(70, W / H, 0.1, 220);

// ── Portal Protocol ────────────────────────────────────────────────────────────
const incoming = Portal.readPortalParams();
document.getElementById('username').textContent = incoming.username;
const nextTarget = await Portal.pickPortalTarget();

// ── Lighting ───────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffd8a0, 2.2));
const sun = new THREE.DirectionalLight(0xffe8b0, 2.8);
sun.position.set(18, 35, 25);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 250;
sun.shadow.camera.left = sun.shadow.camera.bottom = -90;
sun.shadow.camera.right = sun.shadow.camera.top   =  90;
scene.add(sun);

// ── Sky gradient dome ──────────────────────────────────────────────────────────
scene.add(Object.assign(
  new THREE.Mesh(
    new THREE.SphereGeometry(190, 16, 8),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader:   `varying float vY; void main(){ vY=normalize(position).y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying float vY; void main(){ vec3 h=vec3(0.97,0.64,0.36),z=vec3(0.36,0.55,0.88); gl_FragColor=vec4(mix(h,z,clamp(vY*1.9,0.0,1.0)),1.0); }`,
    })
  ),
  { renderOrder: -1 }
));

// ── Road curve ─────────────────────────────────────────────────────────────────
// Two superimposed sine waves give natural S-bends
function curveX(z)  { return 14*Math.sin(z*0.013) + 5*Math.sin(z*0.034+1.5); }
function curveDX(z) { return 14*0.013*Math.cos(z*0.013) + 5*0.034*Math.cos(z*0.034+1.5); }

// ── World constants ────────────────────────────────────────────────────────────
const ROAD_LEN   = 2500;
const ROAD_W     = 18;
const CURB_W     = 1.6;
const ROAD_START = 25;
const ROAD_END   = -(ROAD_LEN - 25);

// ── Ribbon mesh builder ────────────────────────────────────────────────────────
function buildRibbon(halfWL, halfWR, yOff, tex, tileLen) {
  const step = 2;
  const n    = Math.ceil((ROAD_START - ROAD_END) / step) + 1;
  const pos  = new Float32Array(n * 2 * 3);
  const uv   = new Float32Array(n * 2 * 2);
  const idx  = [];
  let dist = 0;

  for (let i = 0; i < n; i++) {
    const z   = ROAD_START - i * step;
    const cx  = curveX(z);
    const dx  = curveDX(z);
    const len = Math.sqrt(1 + dx * dx);
    const nx  =  1 / len;
    const nz  = -dx / len;
    const b   = i * 6;

    pos[b  ] = cx + nx * halfWL;  pos[b+1] = 0;  pos[b+2] = z + nz * halfWL;
    pos[b+3] = cx + nx * halfWR;  pos[b+4] = 0;  pos[b+5] = z + nz * halfWR;

    const v = dist / tileLen;
    uv[i*4  ] = 0;  uv[i*4+1] = v;
    uv[i*4+2] = 1;  uv[i*4+3] = v;

    if (i > 0) dist += step;
    if (i < n - 1) { const a = i*2; idx.push(a, a+1, a+2,  a+1, a+3, a+2); }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uv,  2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  mesh.position.y = yOff;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// ── Textures ───────────────────────────────────────────────────────────────────
function makeRoadTex() {
  const cw = 256, ch = 512;
  const cv = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const cx = cv.getContext('2d');
  cx.fillStyle = '#3b3d42'; cx.fillRect(0, 0, cw, ch);
  for (let i = 0; i < 2500; i++) {
    const v = 55 + (Math.random() * 22 | 0);
    cx.fillStyle = `rgba(${v},${v},${v},0.22)`;
    cx.fillRect(Math.random() * cw, Math.random() * ch, 1, 1);
  }
  cx.fillStyle = '#dcdcda'; cx.fillRect(10, 0, 7, ch); cx.fillRect(cw-17, 0, 7, ch);
  cx.fillStyle = '#f0cc30'; cx.fillRect(cw/2-4, 0, 8, 185);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeCurbTex() {
  const cv = Object.assign(document.createElement('canvas'), { width: 16, height: 64 });
  const cx = cv.getContext('2d');
  cx.fillStyle = '#cc2020'; cx.fillRect(0,  0, 16, 32);
  cx.fillStyle = '#f0f0f0'; cx.fillRect(0, 32, 16, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

buildRibbon(-ROAD_W/2,          ROAD_W/2,          0.006, makeRoadTex(), 20);
buildRibbon(-ROAD_W/2 - CURB_W, -ROAD_W/2,         0.010, makeCurbTex(),  6);
buildRibbon( ROAD_W/2,           ROAD_W/2 + CURB_W, 0.010, makeCurbTex(),  6);

// ── Grass ──────────────────────────────────────────────────────────────────────
{
  const cv = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const cx = cv.getContext('2d');
  cx.fillStyle = '#50b044'; cx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 180; i++) {
    const v = Math.random() * 28 | 0;
    cx.fillStyle = `rgb(${58+v},${152+v},${44+v})`;
    cx.fillRect(Math.random() * 64, Math.random() * 64, 2, 3);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(50, 500);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(600, ROAD_LEN + 50),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0, ROAD_START - ROAD_LEN / 2);
  m.receiveShadow = true;
  scene.add(m);
}

// ── Trees ──────────────────────────────────────────────────────────────────────
const trunkMat   = new THREE.MeshLambertMaterial({ color: 0x7a5228 });
const PINE_COLS  = [0x2d7535, 0x358040, 0x3d8b45, 0x256f30];
const ROUND_COLS = [0x3d9e38, 0x44b040, 0x55c050, 0x2e8232];

function makePine(x, z, sc = 1) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.13*sc, 0.20*sc, 1.3*sc, 6), trunkMat);
  t.position.y = 0.65*sc; t.castShadow = true; g.add(t);
  const col = new THREE.MeshLambertMaterial({ color: PINE_COLS[Math.random()*4|0] });
  for (const [r, y] of [[1.55, 2.55], [1.2, 2.05], [0.85, 1.55]]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r*sc, r*1.7*sc, 7), col);
    c.position.y = y*sc; c.castShadow = true; g.add(c);
  }
  g.position.set(x, 0, z); scene.add(g);
}

function makeRoundTree(x, z, sc = 1) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15*sc, 0.22*sc, 1.6*sc, 6), trunkMat);
  t.position.y = 0.8*sc; t.castShadow = true; g.add(t);
  const col = new THREE.MeshLambertMaterial({ color: ROUND_COLS[Math.random()*4|0] });
  const f = new THREE.Mesh(new THREE.SphereGeometry((0.9 + Math.random()*0.55)*sc, 6, 5), col);
  f.position.y = (2.1 + Math.random()*0.4)*sc; f.castShadow = true; g.add(f);
  g.position.set(x, 0, z); scene.add(g);
}

for (let z = ROAD_START; z > ROAD_END; z -= 8 + Math.random() * 6) {
  const cx   = curveX(z);
  const edge = ROAD_W / 2 + CURB_W + 0.8;
  const sc   = 0.8 + Math.random() * 0.65;
  const fn   = Math.random() > 0.45 ? makePine : makeRoundTree;
  fn(cx - edge - 1 - Math.random() * 9,  z, sc);
  fn(cx + edge + 1 + Math.random() * 9,  z, sc);
  if (Math.random() > 0.5) {
    fn(cx - edge - 11 - Math.random()*16, z + Math.random()*4 - 2, 0.7 + Math.random()*0.5);
    fn(cx + edge + 11 + Math.random()*16, z + Math.random()*4 - 2, 0.7 + Math.random()*0.5);
  }
}

// ── Mountains ──────────────────────────────────────────────────────────────────
const MT_COLS = [0xb05890, 0xc060a0, 0xa04880, 0x904898];
for (let i = 0; i < 40; i++) {
  const side = Math.random() > 0.5 ? 1 : -1;
  const z    = -(Math.random() * (ROAD_LEN - 100));
  const cx   = curveX(z);
  const w = 18 + Math.random() * 28, h = 14 + Math.random() * 24;
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(w, h, 4 + (Math.random()*3|0)),
    new THREE.MeshLambertMaterial({ color: MT_COLS[Math.random()*4|0] })
  );
  m.position.set(cx + side*(48 + Math.random()*65), h/2 - 2, z);
  m.rotation.y = Math.random() * Math.PI;
  scene.add(m);
}

// ── Car model ─────────────────────────────────────────────────────────────────
// Orientation: car faces -Z (forward). Camera sits at +Z (behind).
// Taillights at +Z face the camera; headlights at -Z face away.
const carColor  = new THREE.Color(incoming.color ? '#' + incoming.color : '#2266ee');
const bodyMat   = new THREE.MeshLambertMaterial({ color: carColor });
const darkMat   = new THREE.MeshLambertMaterial({ color: carColor.clone().multiplyScalar(0.62) });
const glassMat  = new THREE.MeshLambertMaterial({ color: 0x88c8ee, transparent: true, opacity: 0.65 });
const wheelMat  = new THREE.MeshLambertMaterial({ color: 0x232323 });
const rimMat    = new THREE.MeshLambertMaterial({ color: 0xbcbcbc });
const hlMat     = new THREE.MeshLambertMaterial({ color: 0xffffc8, emissive: 0xffff44, emissiveIntensity: 0.55 });
const tlMat     = new THREE.MeshLambertMaterial({ color: 0xff1100, emissive: 0xff0000, emissiveIntensity: 0.5  });
const stripeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

const carGroup = new THREE.Group();
carGroup.rotation.order = 'YXZ';

function box(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; carGroup.add(m);
}

box(bodyMat,   2.22, 0.58, 4.30,  0, 0.52,  0.00);  // main body
box(darkMat,   2.38, 0.24, 4.50,  0, 0.22,  0.00);  // bottom skirt
box(darkMat,   1.78, 0.48, 2.15,  0, 0.98, +0.18);  // cabin top (biased rearward)
box(glassMat,  1.72, 0.38, 0.07,  0, 0.94, -1.02);  // windshield (front)
box(glassMat,  1.72, 0.34, 0.07,  0, 0.94, +1.28);  // rear window (faces camera)
box(stripeMat, 0.34, 0.59, 1.90,  0, 0.52, -0.82);  // hood stripe (front half)
box(darkMat,   2.14, 0.25, 0.18,  0, 0.28, -2.22);  // front bumper
box(darkMat,   2.14, 0.25, 0.18,  0, 0.28, +2.22);  // rear bumper (faces camera)
for (const x of [-0.7, 0.7]) box(hlMat, 0.38, 0.18, 0.08, x, 0.52, -2.22); // headlights (front)
for (const x of [-0.7, 0.7]) box(tlMat, 0.44, 0.20, 0.08, x, 0.52, +2.22); // taillights (rear)

// Wheels [0,1] = front (z=-1.36), [2,3] = rear (z=+1.36, toward camera)
const carWheels = [];
for (const [wx, wz] of [[-1.19,-1.36],[1.19,-1.36],[-1.19,+1.36],[1.19,+1.36]]) {
  const wg = new THREE.Group();
  wg.position.set(wx, 0.35, wz);
  const tire = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.66, 0.66), wheelMat);
  tire.castShadow = true;
  wg.add(tire, new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.40, 0.40), rimMat));
  carGroup.add(wg);
  carWheels.push(wg);
}
scene.add(carGroup);

// ── Skid marks ─────────────────────────────────────────────────────────────────
const SKID_MAX = 800;

function makeSkidTrail() {
  const positions = new Float32Array(SKID_MAX * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 });
  const line = new THREE.LineSegments(geo, mat);
  line.frustumCulled = false;
  line.position.y = 0.013;
  scene.add(line);
  return { positions, geo, count: 0, head: 0 };
}

const skidL = makeSkidTrail();
const skidR = makeSkidTrail();
let prevWheelL = null, prevWheelR = null;

function pushSkid(trail, prev, curr) {
  if (!prev) return;
  const i = trail.head * 6;
  trail.positions[i  ] = prev.x;  trail.positions[i+1] = 0;  trail.positions[i+2] = prev.z;
  trail.positions[i+3] = curr.x;  trail.positions[i+4] = 0;  trail.positions[i+5] = curr.z;
  trail.geo.attributes.position.needsUpdate = true;
  trail.head = (trail.head + 1) % SKID_MAX;
  trail.count = Math.min(trail.count + 1, SKID_MAX);
  trail.geo.setDrawRange(0, trail.count * 2);
}

// World position of a wheel at local coords (lx, lz)
// Three.js Y-rotation matrix: wx = lx*cos(h) + lz*sin(h), wz = -lx*sin(h) + lz*cos(h)
function wheelWorldPos(lx, lz) {
  const c = Math.cos(car.heading);
  const s = Math.sin(car.heading);
  return {
    x: car.x + lx * c + lz * s,
    z: car.z - lx * s + lz * c,
  };
}

// ── Speed lines overlay ────────────────────────────────────────────────────────
container.style.position = 'relative';
const slCanvas = document.createElement('canvas');
slCanvas.width = W; slCanvas.height = H;
Object.assign(slCanvas.style, {
  position: 'absolute', top: '0', left: '0',
  width: W + 'px', height: H + 'px',
  pointerEvents: 'none', zIndex: '5',
});
container.appendChild(slCanvas);
const slCtx = slCanvas.getContext('2d');

const SPEED_LINES = Array.from({ length: 30 }, () => ({
  angle: Math.random() * Math.PI * 2,
  len:   0.05 + Math.random() * 0.13,
  width: 0.4 + Math.random() * 1.5,
  phase: Math.random(),
}));

function drawSpeedLines(totalSpd) {
  slCtx.clearRect(0, 0, W, H);
  const intensity = Math.max(0, Math.min(1, (totalSpd - 18) / 26));
  if (intensity < 0.02) return;

  const t  = performance.now() / 1000;
  const cx = W / 2, cy = H / 2;
  const R  = Math.min(W, H);

  slCtx.save();
  for (const sl of SPEED_LINES) {
    const f  = (t * (1.0 + intensity * 2.5) + sl.phase) % 1;
    const r0 = (0.22 + f * 0.48) * R;
    const r1 = r0 + sl.len * R * intensity;
    slCtx.strokeStyle = `rgba(255,255,255,${(0.15 + intensity * 0.45) * (1 - f * 0.55)})`;
    slCtx.lineWidth = sl.width * intensity;
    slCtx.beginPath();
    slCtx.moveTo(cx + Math.cos(sl.angle) * r0, cy + Math.sin(sl.angle) * r0);
    slCtx.lineTo(cx + Math.cos(sl.angle) * r1, cy + Math.sin(sl.angle) * r1);
    slCtx.stroke();
  }

  // Radial vignette kicks in mid-speed
  if (intensity > 0.25) {
    const grad = slCtx.createRadialGradient(cx, cy, R * 0.12, cx, cy, R * 0.68);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${(intensity - 0.25) * 0.52})`);
    slCtx.globalAlpha = 1;
    slCtx.fillStyle = grad;
    slCtx.fillRect(0, 0, W, H);
  }

  slCtx.restore();
}

// ── Physics state ──────────────────────────────────────────────────────────────
const car = {
  x: 0, z: 0, heading: 0,
  vx: 0, vz: 0,            // world-space velocity vector
  speed: 0,                // signed forward speed (used for steer scaling)
  maxSpd: 52, accel: 24, brakeF: 40, frict: 10, steerK: 1.65,
  lean: 0, wheelRot: 0,
  suspY: 0, suspVel: 0,    // suspension spring-damper
  pitch: 0,                // body pitch from accel/brake
};
if (incoming.fromPortal) car.z = -5;

// ── Input ──────────────────────────────────────────────────────────────────────
const keys = {};
addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.key] = false; });

// ── Portal gates ───────────────────────────────────────────────────────────────
function makeGate(colorHex, zPos, label, target) {
  const col = new THREE.Color(colorHex);
  const mat = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.55 });
  const grp = new THREE.Group();

  for (const x of [-(ROAD_W/2+2.8), ROAD_W/2+2.8]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 10, 1.1), mat);
    p.position.set(x, 5, 0); p.castShadow = true; grp.add(p);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W+8.6, 1.3, 1.1), mat);
  bar.position.set(0, 10.3, 0); grp.add(bar);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_W+6, 9.2),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, side: THREE.DoubleSide })
  );
  face.position.set(0, 5, 0); grp.add(face);

  const pl = new THREE.PointLight(col, 6, 20);
  pl.position.set(0, 5.5, 0); grp.add(pl);

  if (label) {
    const cv = Object.assign(document.createElement('canvas'), { width: 320, height: 64 });
    const lx = cv.getContext('2d');
    lx.fillStyle = colorHex;
    lx.font = 'bold 26px ui-sans-serif, system-ui, sans-serif';
    lx.textAlign = 'center'; lx.textBaseline = 'middle';
    lx.fillText(label, 160, 32);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
    sp.scale.set(5.5, 1.1, 1); sp.position.set(0, 12.5, 0); grp.add(sp);
  }

  grp.rotation.y = Math.atan2(-curveDX(zPos), 1);
  grp.position.set(curveX(zPos), 0, zPos);
  scene.add(grp);
  return { z: zPos, cx: curveX(zPos), target };
}

const exitGate   = makeGate('#c64bff', ROAD_END + 30, nextTarget ? `→ ${nextTarget.title}` : '→ portal', nextTarget?.url || null);
const returnGate = incoming.ref ? makeGate('#4ff0ff', 18, '← back', incoming.ref) : null;

// ── Speedometer ────────────────────────────────────────────────────────────────
const speedoEl = document.createElement('div');
Object.assign(speedoEl.style, {
  position:'fixed', bottom:'1.2rem', right:'1.8rem',
  fontFamily:'ui-monospace,monospace', fontSize:'1.7rem', fontWeight:'bold',
  color:'#fff', textShadow:'0 0 12px rgba(198,75,255,0.9)',
  pointerEvents:'none', zIndex:'10', letterSpacing:'0.04em',
});
document.body.appendChild(speedoEl);

// ── Portal collision ───────────────────────────────────────────────────────────
let redirecting = false;
function checkPortals() {
  if (redirecting) return;
  const checkGate = (gate) => {
    if (!gate?.target) return;
    if (Math.abs(car.z - gate.z) < 5 && Math.abs(car.x - gate.cx) < ROAD_W / 2 + 3) {
      redirecting = true;
      Portal.sendPlayerThroughPortal(gate.target, {
        username: incoming.username, color: incoming.color, speed: incoming.speed,
      });
    }
  };
  checkGate(exitGate);
  if (car.speed < 0) checkGate(returnGate);
}

// ── Update ─────────────────────────────────────────────────────────────────────
function update(dt) {
  const gas       = keys['w'] || keys['W'] || keys['ArrowUp'];
  const brake     = keys['s'] || keys['S'] || keys['ArrowDown'];
  const left      = keys['a'] || keys['A'] || keys['ArrowLeft'];
  const right     = keys['d'] || keys['D'] || keys['ArrowRight'];
  const handbrake = keys[' '];

  // ── Basis vectors for current heading ─────────────────────────────────────
  // Forward = -Z local → world: (sin h, 0, -cos h)
  // Right   = +X local → world: (cos h, 0,  sin h)
  const fwdX =  Math.sin(car.heading);
  const fwdZ = -Math.cos(car.heading);
  const latX =  Math.cos(car.heading);
  const latZ =  Math.sin(car.heading);

  // ── Decompose velocity ─────────────────────────────────────────────────────
  const vFwd = car.vx * fwdX + car.vz * fwdZ;
  const vLat = car.vx * latX + car.vz * latZ;
  car.speed = vFwd;

  // ── Steering ───────────────────────────────────────────────────────────────
  const grip = Math.min(1, Math.abs(vFwd) / 5.5);
  const sdir = vFwd < 0 ? -1 : 1;
  if (left)  car.heading -= car.steerK * grip * dt * sdir;
  if (right) car.heading += car.steerK * grip * dt * sdir;

  // ── Forward acceleration / braking ─────────────────────────────────────────
  let newVFwd = vFwd;
  if (gas) {
    newVFwd = Math.min(car.maxSpd, newVFwd + car.accel * dt);
  } else if (brake) {
    newVFwd = newVFwd > 0
      ? Math.max(0, newVFwd - car.brakeF * dt)
      : Math.max(-car.maxSpd * 0.28, newVFwd - car.accel * 0.42 * dt);
  } else {
    newVFwd += (0 - newVFwd) * Math.min(1, car.frict * dt);
  }

  // ── Lateral grip — exponential decay (handbrake = drift mode) ─────────────
  const gripK  = handbrake ? 1.8 : 11.0;
  const decay  = Math.exp(-gripK * dt);
  const newVLat = vLat * decay;

  // ── Skid detection ─────────────────────────────────────────────────────────
  const isSkidding = Math.abs(newVLat) > 1.8 || (handbrake && Math.abs(vFwd) > 8);

  // ── Reconstruct world velocity using updated heading ───────────────────────
  const fwdX2 =  Math.sin(car.heading);
  const fwdZ2 = -Math.cos(car.heading);
  const latX2 =  Math.cos(car.heading);
  const latZ2 =  Math.sin(car.heading);
  car.vx = fwdX2 * newVFwd + latX2 * newVLat;
  car.vz = fwdZ2 * newVFwd + latZ2 * newVLat;

  // ── Move ───────────────────────────────────────────────────────────────────
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // ── Road boundary ──────────────────────────────────────────────────────────
  const roadCX = curveX(car.z);
  const maxOff = ROAD_W / 2 + CURB_W + 2;
  if (Math.abs(car.x - roadCX) > maxOff) {
    car.x   = roadCX + Math.sign(car.x - roadCX) * maxOff;
    car.vx *= 0.5;
  }

  const totalSpd = Math.hypot(car.vx, car.vz);

  // ── Suspension spring-damper ───────────────────────────────────────────────
  const offTrack = Math.abs(car.x - roadCX) > (ROAD_W / 2 + CURB_W);
  const speedVibe = Math.min(1, totalSpd / 18);
  const roadVibe  = offTrack
    ? (Math.random() - 0.5) * 170
    : (Math.random() - 0.5) * 14 * speedVibe;
  car.suspVel += (-100 * car.suspY - 18 * car.suspVel + roadVibe) * dt;
  car.suspY   += car.suspVel * dt;
  car.suspY    = Math.max(-0.20, Math.min(0.16, car.suspY));

  // ── Body pitch (nose lifts on gas, dips on brake) ──────────────────────────
  const accelFwd    = (newVFwd - vFwd) / Math.max(dt, 0.001);
  const targetPitch = -accelFwd * 0.0018;
  car.pitch += (targetPitch - car.pitch) * Math.min(1, dt * 5);
  car.pitch  = Math.max(-0.08, Math.min(0.08, car.pitch));

  // ── Body lean (rolls into lateral slip) ───────────────────────────────────
  const targetLean = -newVLat * 0.010;
  car.lean += (targetLean - car.lean) * Math.min(1, dt * 8);

  // ── Wheels ─────────────────────────────────────────────────────────────────
  car.wheelRot += car.speed * dt * 2.2;
  const steerVis = (left ? -0.42 : right ? 0.42 : 0) * Math.min(1, Math.abs(vFwd) / 8);
  for (const [i, w] of carWheels.entries()) {
    w.rotation.order = 'YXZ';
    w.rotation.y = i < 2 ? steerVis : 0;  // [0,1] = front wheels
    w.rotation.x = car.wheelRot;
  }

  // ── Car group transform ────────────────────────────────────────────────────
  carGroup.position.set(car.x, car.suspY, car.z);
  carGroup.rotation.y = car.heading;
  carGroup.rotation.x = car.pitch;
  carGroup.rotation.z = car.lean;

  // ── Skid marks (rear wheels at local z=+1.36) ──────────────────────────────
  const wL = wheelWorldPos(-1.19, 1.36);
  const wR = wheelWorldPos( 1.19, 1.36);
  if (isSkidding) {
    pushSkid(skidL, prevWheelL, wL);
    pushSkid(skidR, prevWheelR, wR);
  }
  prevWheelL = wL;
  prevWheelR = wR;

  // ── Camera ─────────────────────────────────────────────────────────────────
  const pullBack = 8.5 + totalSpd * 0.045;
  camera.fov = 70 + totalSpd * 0.16;
  camera.updateProjectionMatrix();
  camera.position.set(
    car.x - Math.sin(car.heading) * pullBack,
    3.0 + totalSpd * 0.018,
    car.z + Math.cos(car.heading) * pullBack,
  );
  camera.lookAt(
    car.x + Math.sin(car.heading) * 7,
    1.6,
    car.z - Math.cos(car.heading) * 7,
  );

  // ── Adaptive fog ───────────────────────────────────────────────────────────
  scene.fog.far = 170 - totalSpd * 0.4;

  // ── HUD ────────────────────────────────────────────────────────────────────
  speedoEl.textContent = `${(totalSpd * 2.237) | 0} MPH`;
  drawSpeedLines(totalSpd);

  checkPortals();
}

// ── Loop ───────────────────────────────────────────────────────────────────────
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
