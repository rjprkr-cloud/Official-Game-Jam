// Cruise — Phase 4: UI Shell, State Machine, Car Select, HUD
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
renderer.setClearColor(0x08040f);
container.appendChild(renderer.domElement);

// ── Scene & Camera ─────────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
scene.fog    = new THREE.Fog(0xf0a060, 55, 170);
const camera = new THREE.PerspectiveCamera(70, W / H, 0.1, 220);

// ── Portal Protocol ────────────────────────────────────────────────────────────
const incoming   = Portal.readPortalParams();
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
      uniforms: { uTop: { value: new THREE.Color(0xf5a060) }, uBot: { value: new THREE.Color(0x5c8de0) } },
      vertexShader:   `varying float vY; void main(){ vY=normalize(position).y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop,uBot; varying float vY; void main(){ gl_FragColor=vec4(mix(uTop,uBot,clamp(vY*1.9,0.0,1.0)),1.0); }`,
    })
  ),
  { renderOrder: -1 }
));
const skyMesh = scene.children[scene.children.length - 1];

// ── Road curve ─────────────────────────────────────────────────────────────────
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

// ── Textures ───────────────────────────────────────────────────────────────────
function makeRoadTex() {
  const cw=256,ch=512,cv=Object.assign(document.createElement('canvas'),{width:cw,height:ch}),cx=cv.getContext('2d');
  cx.fillStyle='#3b3d42'; cx.fillRect(0,0,cw,ch);
  for(let i=0;i<2500;i++){const v=55+(Math.random()*22|0);cx.fillStyle=`rgba(${v},${v},${v},0.22)`;cx.fillRect(Math.random()*cw,Math.random()*ch,1,1);}
  cx.fillStyle='#dcdcda'; cx.fillRect(10,0,7,ch); cx.fillRect(cw-17,0,7,ch);
  cx.fillStyle='#f0cc30'; cx.fillRect(cw/2-4,0,8,185);
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
function makeCurbTex() {
  const cv=Object.assign(document.createElement('canvas'),{width:16,height:64}),cx=cv.getContext('2d');
  cx.fillStyle='#cc2020'; cx.fillRect(0,0,16,32);
  cx.fillStyle='#f0f0f0'; cx.fillRect(0,32,16,32);
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
buildRibbon(-ROAD_W/2, ROAD_W/2, 0.006, makeRoadTex(), 20);
buildRibbon(-ROAD_W/2-CURB_W, -ROAD_W/2, 0.010, makeCurbTex(), 6);
buildRibbon(ROAD_W/2, ROAD_W/2+CURB_W, 0.010, makeCurbTex(), 6);

// Grass
{
  const cv=Object.assign(document.createElement('canvas'),{width:64,height:64}),cx=cv.getContext('2d');
  cx.fillStyle='#50b044'; cx.fillRect(0,0,64,64);
  for(let i=0;i<180;i++){const v=Math.random()*28|0;cx.fillStyle=`rgb(${58+v},${152+v},${44+v})`;cx.fillRect(Math.random()*64,Math.random()*64,2,3);}
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(50,500);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(600,ROAD_LEN+50),new THREE.MeshLambertMaterial({map:t}));
  m.rotation.x=-Math.PI/2; m.position.set(0,0,ROAD_START-ROAD_LEN/2); m.receiveShadow=true; scene.add(m);
}

// Trees
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5228 });
function makePine(x,z,sc=1){
  const g=new THREE.Group();
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.13*sc,0.20*sc,1.3*sc,6),trunkMat),{castShadow:true,position:new THREE.Vector3(0,0.65*sc,0)}));
  const col=new THREE.MeshLambertMaterial({color:[0x2d7535,0x358040,0x3d8b45,0x256f30][Math.random()*4|0]});
  for(const[r,y]of[[1.55,2.55],[1.2,2.05],[0.85,1.55]]){const c=new THREE.Mesh(new THREE.ConeGeometry(r*sc,r*1.7*sc,7),col);c.position.y=y*sc;c.castShadow=true;g.add(c);}
  g.position.set(x,0,z); scene.add(g);
}
function makeRoundTree(x,z,sc=1){
  const g=new THREE.Group();
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.15*sc,0.22*sc,1.6*sc,6),trunkMat),{castShadow:true,position:new THREE.Vector3(0,0.8*sc,0)}));
  const col=new THREE.MeshLambertMaterial({color:[0x3d9e38,0x44b040,0x55c050,0x2e8232][Math.random()*4|0]});
  const f=new THREE.Mesh(new THREE.SphereGeometry((0.9+Math.random()*0.55)*sc,6,5),col);
  f.position.y=(2.1+Math.random()*0.4)*sc; f.castShadow=true; g.add(f);
  g.position.set(x,0,z); scene.add(g);
}
for(let z=ROAD_START;z>ROAD_END;z-=8+Math.random()*6){
  const cx=curveX(z),edge=ROAD_W/2+CURB_W+0.8,sc=0.8+Math.random()*0.65;
  const fn=Math.random()>0.45?makePine:makeRoundTree;
  fn(cx-edge-1-Math.random()*9,z,sc); fn(cx+edge+1+Math.random()*9,z,sc);
  if(Math.random()>0.5){fn(cx-edge-11-Math.random()*16,z+Math.random()*4-2,0.7+Math.random()*0.5);fn(cx+edge+11+Math.random()*16,z+Math.random()*4-2,0.7+Math.random()*0.5);}
}

// Mountains
for(let i=0;i<40;i++){
  const side=Math.random()>0.5?1:-1,z=-(Math.random()*(ROAD_LEN-100));
  const cx=curveX(z),w=18+Math.random()*28,h=14+Math.random()*24;
  const m=new THREE.Mesh(new THREE.ConeGeometry(w,h,4+(Math.random()*3|0)),new THREE.MeshLambertMaterial({color:[0xb05890,0xc060a0,0xa04880,0x904898][Math.random()*4|0]}));
  m.position.set(cx+side*(48+Math.random()*65),h/2-2,z); m.rotation.y=Math.random()*Math.PI; scene.add(m);
}

// ── Car model definitions ──────────────────────────────────────────────────────
const CARS = [
  { id:'street',  name:'Street Car', desc:'Balanced · Fast · Agile',      color: 0x2266ee },
  { id:'truck',   name:'Truck',      desc:'Heavy · Wide · Tough',          color: 0xcc3311 },
  { id:'luxury',  name:'Luxury',     desc:'Elegant · Smooth · Refined',    color: 0xd0d4dd },
  { id:'muscle',  name:'Muscle',     desc:'Raw Power · Aggressive',        color: 0xff6600 },
  { id:'compact', name:'Compact',    desc:'Small · Nimble · Responsive',   color: 0x22bb44 },
];

function makeCarMats(hexColor) {
  const col  = new THREE.Color(hexColor);
  return {
    body:   new THREE.MeshLambertMaterial({ color: col }),
    dark:   new THREE.MeshLambertMaterial({ color: col.clone().multiplyScalar(0.6) }),
    glass:  new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent:true, opacity:0.65 }),
    wheel:  new THREE.MeshLambertMaterial({ color: 0x232323 }),
    rim:    new THREE.MeshLambertMaterial({ color: 0xbbbbbb }),
    hl:     new THREE.MeshLambertMaterial({ color: 0xffffc8, emissive:0xffff44, emissiveIntensity:0.55 }),
    tl:     new THREE.MeshLambertMaterial({ color: 0xff1100, emissive:0xff0000, emissiveIntensity:0.5  }),
    stripe: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  };
}

// Returns array of wheel groups (index 0,1=front, 2,3=rear)
function buildCarIntoGroup(group, carCfg) {
  // Clear existing children
  while (group.children.length) group.remove(group.children[0]);

  const m = makeCarMats(carCfg.color);
  function box(mat, w,h,d, x,y,z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    mesh.position.set(x,y,z); mesh.castShadow = true; group.add(mesh);
  }

  const wheels = [];
  function wheel(wx, wy, wz, wScale=1) {
    const wg = new THREE.Group();
    wg.position.set(wx, wy, wz);
    const r = 0.33 * wScale, t = 0.28 * wScale;
    wg.add(new THREE.Mesh(new THREE.BoxGeometry(t, r*2, r*2), m.wheel));
    wg.add(new THREE.Mesh(new THREE.BoxGeometry(t+0.02, r*1.4, r*1.4), m.rim));
    wg.children[0].castShadow = true;
    group.add(wg);
    wheels.push(wg);
  }

  switch (carCfg.id) {
    case 'street':
      box(m.body,   2.22,0.58,4.30, 0,0.52, 0.00);
      box(m.dark,   2.38,0.24,4.50, 0,0.22, 0.00);
      box(m.dark,   1.78,0.48,2.15, 0,0.98,+0.18);
      box(m.glass,  1.72,0.38,0.07, 0,0.94,-1.02);
      box(m.glass,  1.72,0.34,0.07, 0,0.94,+1.28);
      box(m.stripe, 0.34,0.59,1.90, 0,0.52,-0.82);
      box(m.dark,   2.14,0.25,0.18, 0,0.28,-2.22);
      box(m.dark,   2.14,0.25,0.18, 0,0.28,+2.22);
      for(const x of[-0.7,0.7]) box(m.hl, 0.38,0.18,0.08, x,0.52,-2.22);
      for(const x of[-0.7,0.7]) box(m.tl, 0.44,0.20,0.08, x,0.52,+2.22);
      wheel(-1.19,0.35,-1.36); wheel(1.19,0.35,-1.36);
      wheel(-1.19,0.35,+1.36); wheel(1.19,0.35,+1.36);
      break;

    case 'truck':
      box(m.body,   2.60,0.90,4.00, 0,0.65, 0.00);
      box(m.dark,   2.76,0.28,4.20, 0,0.22, 0.00);
      box(m.dark,   2.20,0.82,2.00, 0,1.36,+0.30);
      box(m.glass,  2.10,0.52,0.07, 0,1.40,-0.72);
      box(m.glass,  2.10,0.46,0.07, 0,1.38,+1.30);
      box(m.dark,   2.52,0.28,0.20, 0,0.26,-2.02);
      box(m.dark,   2.52,0.28,0.20, 0,0.26,+2.02);
      for(const x of[-0.8,0.8]) box(m.hl, 0.44,0.22,0.08, x,0.70,-2.02);
      for(const x of[-0.8,0.8]) box(m.tl, 0.50,0.24,0.08, x,0.70,+2.02);
      wheel(-1.25,0.46,-1.30,1.12); wheel(1.25,0.46,-1.30,1.12);
      wheel(-1.25,0.46,+1.30,1.12); wheel(1.25,0.46,+1.30,1.12);
      break;

    case 'luxury':
      box(m.body,   2.08,0.48,5.20, 0,0.48, 0.00);
      box(m.dark,   2.22,0.22,5.40, 0,0.22, 0.00);
      box(m.dark,   1.68,0.44,2.60, 0,0.88,+0.30);
      box(m.glass,  1.60,0.36,0.07, 0,0.90,-0.98);
      box(m.glass,  1.60,0.32,0.07, 0,0.88,+1.60);
      box(m.stripe, 0.26,0.49,2.10, 0,0.48,-0.70);
      box(m.dark,   2.00,0.22,0.18, 0,0.26,-2.62);
      box(m.dark,   2.00,0.22,0.18, 0,0.26,+2.62);
      for(const x of[-0.62,0.62]) box(m.hl, 0.36,0.14,0.08, x,0.48,-2.62);
      for(const x of[-0.62,0.62]) box(m.tl, 0.44,0.16,0.08, x,0.48,+2.62);
      wheel(-1.00,0.30,-1.80,0.90); wheel(1.00,0.30,-1.80,0.90);
      wheel(-1.00,0.30,+1.80,0.90); wheel(1.00,0.30,+1.80,0.90);
      break;

    case 'muscle':
      box(m.body,   2.78,0.58,4.20, 0,0.52, 0.00);
      box(m.dark,   2.94,0.24,4.40, 0,0.22, 0.00);
      box(m.dark,   2.00,0.50,1.92, 0,0.98,+0.50);
      box(m.glass,  1.90,0.40,0.07, 0,0.94,-0.64);
      box(m.glass,  1.90,0.36,0.07, 0,0.94,+1.44);
      box(m.stripe, 0.52,0.59,2.40, 0,0.52,-0.50);
      box(m.dark,   0.52,0.14,1.80, 0,0.80,-0.50);
      box(m.dark,   2.70,0.26,0.20, 0,0.28,-2.12);
      box(m.dark,   2.70,0.26,0.20, 0,0.28,+2.12);
      for(const x of[-0.80,0.80]) box(m.hl, 0.42,0.20,0.08, x,0.52,-2.12);
      for(const x of[-0.80,0.80]) box(m.tl, 0.50,0.22,0.08, x,0.52,+2.12);
      wheel(-1.32,0.36,-1.30,1.06); wheel(1.32,0.36,-1.30,1.06);
      wheel(-1.32,0.36,+1.30,1.06); wheel(1.32,0.36,+1.30,1.06);
      break;

    case 'compact':
      box(m.body,   1.82,0.62,3.20, 0,0.50, 0.00);
      box(m.dark,   1.96,0.22,3.38, 0,0.22, 0.00);
      box(m.dark,   1.52,0.58,1.90, 0,0.98,+0.10);
      box(m.glass,  1.44,0.44,0.07, 0,0.98,-0.84);
      box(m.glass,  1.44,0.38,0.07, 0,0.96,+1.06);
      box(m.dark,   1.74,0.24,0.16, 0,0.26,-1.62);
      box(m.dark,   1.74,0.24,0.16, 0,0.26,+1.62);
      for(const x of[-0.52,0.52]) box(m.hl, 0.34,0.16,0.08, x,0.50,-1.62);
      for(const x of[-0.52,0.52]) box(m.tl, 0.40,0.18,0.08, x,0.50,+1.62);
      wheel(-0.90,0.30,-0.95,0.90); wheel(0.90,0.30,-0.95,0.90);
      wheel(-0.90,0.30,+0.95,0.90); wheel(0.90,0.30,+0.95,0.90);
      break;
  }

  return wheels;
}

// ── Player car group ───────────────────────────────────────────────────────────
const carGroup = new THREE.Group();
carGroup.rotation.order = 'YXZ';
scene.add(carGroup);
let carWheels = buildCarIntoGroup(carGroup, CARS[0]);

// ── Preview renderer ───────────────────────────────────────────────────────────
const PREV_W = 360, PREV_H = 240;
const prevRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
prevRenderer.setSize(PREV_W, PREV_H);
prevRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
prevRenderer.setClearColor(0x000000, 0);

const prevScene  = new THREE.Scene();
const prevCamera = new THREE.PerspectiveCamera(32, PREV_W / PREV_H, 0.1, 50);
prevCamera.position.set(5.5, 3.2, 7.5);
prevCamera.lookAt(0, 0.8, 0);
prevScene.add(new THREE.AmbientLight(0xffeedd, 3.0));
const prevSun = new THREE.DirectionalLight(0xffffff, 4.5);
prevSun.position.set(5, 10, 8);
prevScene.add(prevSun);
const prevRim = new THREE.PointLight(0x4ff0ff, 5, 18);
prevRim.position.set(-4, 2, -3);
prevScene.add(prevRim);
const prevRim2 = new THREE.PointLight(0xc64bff, 3, 14);
prevRim2.position.set(3, -1, 3);
prevScene.add(prevRim2);

const prevCarGroup = new THREE.Group();
prevCarGroup.rotation.order = 'YXZ';
prevScene.add(prevCarGroup);
buildCarIntoGroup(prevCarGroup, CARS[0]);

let previewCarIdx = 0;
let previewAngle  = 0;

function setPreviewCar(idx) {
  previewCarIdx = ((idx % CARS.length) + CARS.length) % CARS.length;
  buildCarIntoGroup(prevCarGroup, CARS[previewCarIdx]);
  document.getElementById('cs-name').textContent = CARS[previewCarIdx].name;
  document.getElementById('cs-desc').textContent = CARS[previewCarIdx].desc;
  // Update dots
  document.querySelectorAll('.cs-dot').forEach((d, i) => d.classList.toggle('active', i === previewCarIdx));
}

// ── Speed lines overlay ────────────────────────────────────────────────────────
const slCanvas = document.createElement('canvas');
slCanvas.className = 'sl-canvas';
slCanvas.width = W; slCanvas.height = H;
Object.assign(slCanvas.style, { position:'absolute', top:'0', left:'0', width:W+'px', height:H+'px', pointerEvents:'none', zIndex:'5' });
container.appendChild(slCanvas);
const slCtx = slCanvas.getContext('2d');
const SPEED_LINES = Array.from({length:30}, ()=>({ angle:Math.random()*Math.PI*2, len:0.05+Math.random()*0.13, width:0.4+Math.random()*1.5, phase:Math.random() }));
function drawSpeedLines(spd) {
  slCtx.clearRect(0,0,W,H);
  const intensity = Math.max(0, Math.min(1, (spd-18)/26));
  if (intensity < 0.02) return;
  const t=performance.now()/1000, cx=W/2, cy=H/2, R=Math.min(W,H);
  slCtx.save();
  for(const sl of SPEED_LINES){
    const f=(t*(1.0+intensity*2.5)+sl.phase)%1, r0=(0.22+f*0.48)*R, r1=r0+sl.len*R*intensity;
    slCtx.strokeStyle=`rgba(255,255,255,${(0.15+intensity*0.45)*(1-f*0.55)})`;
    slCtx.lineWidth=sl.width*intensity;
    slCtx.beginPath(); slCtx.moveTo(cx+Math.cos(sl.angle)*r0,cy+Math.sin(sl.angle)*r0);
    slCtx.lineTo(cx+Math.cos(sl.angle)*r1,cy+Math.sin(sl.angle)*r1); slCtx.stroke();
  }
  if(intensity>0.25){
    const g=slCtx.createRadialGradient(cx,cy,R*0.12,cx,cy,R*0.68);
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,`rgba(0,0,0,${(intensity-0.25)*0.52})`);
    slCtx.globalAlpha=1; slCtx.fillStyle=g; slCtx.fillRect(0,0,W,H);
  }
  slCtx.restore();
}

// ── Skid marks ─────────────────────────────────────────────────────────────────
const SKID_MAX = 800;
function makeSkidTrail() {
  const positions=new Float32Array(SKID_MAX*2*3);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geo.setDrawRange(0,0);
  const line=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x111111,transparent:true,opacity:0.55}));
  line.frustumCulled=false; line.position.y=0.013; scene.add(line);
  return {positions,geo,count:0,head:0};
}
const skidL=makeSkidTrail(), skidR=makeSkidTrail();
let prevWheelL=null, prevWheelR=null;
function pushSkid(trail,prev,curr){
  if(!prev)return;
  const i=trail.head*6;
  trail.positions[i]=prev.x;trail.positions[i+1]=0;trail.positions[i+2]=prev.z;
  trail.positions[i+3]=curr.x;trail.positions[i+4]=0;trail.positions[i+5]=curr.z;
  trail.geo.attributes.position.needsUpdate=true;
  trail.head=(trail.head+1)%SKID_MAX;
  trail.count=Math.min(trail.count+1,SKID_MAX);
  trail.geo.setDrawRange(0,trail.count*2);
}
function wheelWorldPos(lx,lz){
  const c=Math.cos(car.heading),s=Math.sin(car.heading);
  return{x:car.x+lx*c+lz*s, z:car.z-lx*s+lz*c};
}

// ── Physics state ──────────────────────────────────────────────────────────────
const car = {
  x:0, z:0, heading:0, vx:0, vz:0, speed:0,
  maxSpd:52, accel:24, brakeF:40, frict:10, steerK:1.65,
  lean:0, wheelRot:0, suspY:0, suspVel:0, pitch:0,
};
if (incoming.fromPortal) car.z = -5;

// ── Input ──────────────────────────────────────────────────────────────────────
const keys = {};
addEventListener('keydown', e => {
  keys[e.key] = true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.key] = false; });

// ── Portal gates ───────────────────────────────────────────────────────────────
function makeGate(colorHex, zPos, label, target) {
  const col=new THREE.Color(colorHex);
  const mat=new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:0.55});
  const grp=new THREE.Group();
  for(const x of[-(ROAD_W/2+2.8),ROAD_W/2+2.8]){const p=new THREE.Mesh(new THREE.BoxGeometry(1.1,10,1.1),mat);p.position.set(x,5,0);p.castShadow=true;grp.add(p);}
  grp.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(ROAD_W+8.6,1.3,1.1),mat),{position:new THREE.Vector3(0,10.3,0)}));
  const face=new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W+6,9.2),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.07,side:THREE.DoubleSide}));
  face.position.set(0,5,0); grp.add(face);
  grp.add(Object.assign(new THREE.PointLight(col,6,20),{position:new THREE.Vector3(0,5.5,0)}));
  if(label){
    const cv=Object.assign(document.createElement('canvas'),{width:320,height:64}),lx=cv.getContext('2d');
    lx.fillStyle=colorHex; lx.font='bold 26px ui-sans-serif,system-ui,sans-serif';
    lx.textAlign='center'; lx.textBaseline='middle'; lx.fillText(label,160,32);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true}));
    sp.scale.set(5.5,1.1,1); sp.position.set(0,12.5,0); grp.add(sp);
  }
  grp.rotation.y=Math.atan2(-curveDX(zPos),1);
  grp.position.set(curveX(zPos),0,zPos);
  scene.add(grp);
  return{z:zPos, cx:curveX(zPos), target};
}
const exitGate   = makeGate('#c64bff', ROAD_END+30, nextTarget?`→ ${nextTarget.title}`:'→ portal', nextTarget?.url||null);
const returnGate = incoming.ref ? makeGate('#4ff0ff', 18, '← back', incoming.ref) : null;

// ── Game state ─────────────────────────────────────────────────────────────────
const STATE = { MENU:'menu', CAR_SELECT:'car-select', PLAYING:'playing', GAME_OVER:'game-over' };
let gameState   = STATE.MENU;
let selectedCar = 0;
let hp          = 3.0;
let score       = 0;
let combo       = 0;
let menuTime    = 0;
let redirecting = false;

// ── DOM: build once ────────────────────────────────────────────────────────────
// HUD
const hud = document.createElement('div');
hud.id = 'hud'; hud.className = 'hidden';
hud.innerHTML = `
  <div id="hud-hearts">
    <span class="heart full" id="h1">♥</span>
    <span class="heart full" id="h2">♥</span>
    <span class="heart full" id="h3">♥</span>
  </div>
  <div id="hud-score-wrap">
    <div id="hud-score">0</div>
    <div id="hud-combo"></div>
  </div>
  <div id="hud-username">${incoming.username}</div>
  <div id="hud-speedo">0 MPH</div>
  <div id="hud-hint">← → switch lanes · Space handbrake</div>
`;
document.body.appendChild(hud);

// Hit flash
const hitFlash = document.createElement('div');
hitFlash.id = 'hit-flash';
document.body.appendChild(hitFlash);
let hitFlashTimer = 0;

// ── Screen: Main Menu ──────────────────────────────────────────────────────────
const screenMenu = document.createElement('div');
screenMenu.id = 'screen-menu';
screenMenu.className = 'screen';
screenMenu.innerHTML = `
  <div class="menu-title">CRUISE</div>
  <div class="menu-subtitle">Ordinary Game Jam #1</div>
  <nav class="menu-nav">
    <button class="menu-btn" id="btn-new-game">New Game</button>
    <button class="menu-btn" id="btn-load-game">Load Game</button>
    <button class="menu-btn" id="btn-settings">Settings</button>
    <button class="menu-btn" id="btn-exit">Exit</button>
  </nav>
`;
document.body.appendChild(screenMenu);

// ── Screen: Car Select ─────────────────────────────────────────────────────────
const screenCarSelect = document.createElement('div');
screenCarSelect.id = 'screen-car-select';
screenCarSelect.className = 'screen hidden';
screenCarSelect.innerHTML = `
  <div class="cs-title">Select Your Car</div>
  <div class="cs-row">
    <button class="cs-arrow" id="cs-prev">&#8592;</button>
    <div class="cs-preview" id="cs-preview-wrap"></div>
    <button class="cs-arrow" id="cs-next">&#8594;</button>
  </div>
  <div class="cs-info">
    <div class="cs-name" id="cs-name">${CARS[0].name}</div>
    <div class="cs-desc" id="cs-desc">${CARS[0].desc}</div>
  </div>
  <div class="cs-dots">
    ${CARS.map((_,i) => `<div class="cs-dot${i===0?' active':''}"></div>`).join('')}
  </div>
  <button class="cs-select-btn" id="cs-select">Select &amp; Race</button>
  <button class="cs-back" id="cs-back">← Back to Menu</button>
`;
document.body.appendChild(screenCarSelect);
document.getElementById('cs-preview-wrap').appendChild(prevRenderer.domElement);

// ── Screen: Game Over ──────────────────────────────────────────────────────────
const screenGameOver = document.createElement('div');
screenGameOver.id = 'screen-game-over';
screenGameOver.className = 'screen hidden';
screenGameOver.innerHTML = `
  <div class="go-title">Game Over</div>
  <ul class="go-stats">
    <li>Score <span id="go-score">0</span></li>
    <li>Max Combo <span id="go-combo">x0</span></li>
  </ul>
  <button class="menu-btn" id="go-menu">Back to Menu</button>
`;
document.body.appendChild(screenGameOver);

// ── Modal builder (shared for Load / Settings / Exit) ─────────────────────────
function showModal(title, bodyHTML) {
  const existing = document.getElementById('modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'screen';
  overlay.style.zIndex = '200';
  overlay.innerHTML = `
    <div class="modal-box">
      <h2>${title}</h2>
      ${bodyHTML}
      <button class="modal-close" id="modal-close">Close</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if(e.target === overlay) overlay.remove(); });
}

// ── HUD helpers ────────────────────────────────────────────────────────────────
function updateHearts() {
  const full  = Math.floor(hp);
  const half  = (hp % 1) >= 0.5 ? 1 : 0;
  const empty = 3 - full - half;
  ['h1','h2','h3'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.className = 'heart ' + (i < full ? 'full' : i < full + half ? 'half' : 'empty');
    el.textContent = i < full + half ? '♥' : '♡';
  });
}

function updateScore() {
  document.getElementById('hud-score').textContent = score.toLocaleString();
  document.getElementById('hud-combo').textContent = combo > 1 ? `× ${combo} COMBO` : '';
}

function showHitFeedback(type, text) {
  hitFlash.textContent = text;
  hitFlash.className = `show ${type}`;
  hitFlashTimer = 0.65;
}

let maxCombo = 0;

// ── State machine ──────────────────────────────────────────────────────────────
function setState(s) {
  // Exit
  if (gameState === STATE.MENU)       { /* nothing */ }
  if (gameState === STATE.CAR_SELECT) { /* nothing */ }
  if (gameState === STATE.PLAYING)    { hud.classList.add('hidden'); }

  gameState = s;

  // Enter
  screenMenu.classList.toggle('hidden',       s !== STATE.MENU);
  screenCarSelect.classList.toggle('hidden',  s !== STATE.CAR_SELECT);
  screenGameOver.classList.toggle('hidden',   s !== STATE.GAME_OVER);
  hud.classList.toggle('hidden',              s !== STATE.PLAYING);

  if (s === STATE.PLAYING) {
    hp = 3.0; score = 0; combo = 0; maxCombo = 0;
    updateHearts(); updateScore();
    // Reset car position
    car.x = 0; car.z = incoming.fromPortal ? -5 : 0;
    car.vx = 0; car.vz = 0; car.heading = 0;
    car.suspY = 0; car.suspVel = 0; car.pitch = 0; car.lean = 0;
    redirecting = false;
  }

  if (s === STATE.GAME_OVER) {
    document.getElementById('go-score').textContent = score.toLocaleString();
    document.getElementById('go-combo').textContent = `x${maxCombo}`;
  }
}

// ── Button wiring ──────────────────────────────────────────────────────────────
document.getElementById('btn-new-game').addEventListener('click', () => setState(STATE.CAR_SELECT));

document.getElementById('btn-load-game').addEventListener('click', () => {
  showModal('Load Game', '<p style="color:var(--muted);font-size:.88rem;letter-spacing:.06em">No saved game found.</p>');
});

document.getElementById('btn-settings').addEventListener('click', () => {
  showModal('Settings', `
    <div class="setting-row"><span>Master Volume</span><input type="range" min="0" max="100" value="80"></div>
    <div class="setting-row"><span>Music Volume</span> <input type="range" min="0" max="100" value="90"></div>
    <div class="setting-row"><span>SFX Volume</span>   <input type="range" min="0" max="100" value="70"></div>
    <p style="margin-top:1rem;color:var(--muted);font-size:.76rem;letter-spacing:.1em">← → SWITCH LANES &nbsp;·&nbsp; SPACE HANDBRAKE</p>
  `);
});

document.getElementById('btn-exit').addEventListener('click', () => {
  showModal('Exit', '<p style="color:var(--muted);font-size:.88rem;letter-spacing:.06em">Close this tab to exit the game.</p>');
});

document.getElementById('cs-prev').addEventListener('click', () => setPreviewCar(previewCarIdx - 1));
document.getElementById('cs-next').addEventListener('click', () => setPreviewCar(previewCarIdx + 1));

document.getElementById('cs-select').addEventListener('click', () => {
  selectedCar = previewCarIdx;
  carWheels = buildCarIntoGroup(carGroup, CARS[selectedCar]);
  setState(STATE.PLAYING);
});

document.getElementById('cs-back').addEventListener('click', () => setState(STATE.MENU));
document.getElementById('go-menu').addEventListener('click', () => setState(STATE.MENU));

// ── Portal collision (only while playing) ─────────────────────────────────────
function checkPortals() {
  if (redirecting || gameState !== STATE.PLAYING) return;
  const check = gate => {
    if (!gate?.target) return;
    if (Math.abs(car.z - gate.z) < 5 && Math.abs(car.x - gate.cx) < ROAD_W/2 + 3) {
      redirecting = true;
      Portal.sendPlayerThroughPortal(gate.target, { username:incoming.username, color:incoming.color, speed:incoming.speed });
    }
  };
  check(exitGate);
  if (car.speed < 0) check(returnGate);
}

// ── Menu camera ────────────────────────────────────────────────────────────────
function updateMenuCamera(dt) {
  menuTime += dt;
  const t = menuTime * 0.06;
  camera.position.set(
    curveX(-20) + Math.sin(t) * 4,
    7 + Math.sin(t * 0.7) * 1.2,
    16 + Math.cos(t * 0.4) * 3
  );
  camera.lookAt(curveX(-40), 1.2, -40);
}

// ── Gameplay update ────────────────────────────────────────────────────────────
function updatePlaying(dt) {
  const gas       = keys['w'] || keys['W'] || keys['ArrowUp'];
  const brake     = keys['s'] || keys['S'] || keys['ArrowDown'];
  const left      = keys['a'] || keys['A'] || keys['ArrowLeft'];
  const right     = keys['d'] || keys['D'] || keys['ArrowRight'];
  const handbrake = keys[' '];

  const fwdX= Math.sin(car.heading), fwdZ=-Math.cos(car.heading);
  const latX= Math.cos(car.heading), latZ= Math.sin(car.heading);
  const vFwd= car.vx*fwdX + car.vz*fwdZ;
  const vLat= car.vx*latX + car.vz*latZ;
  car.speed = vFwd;

  const grip = Math.min(1, Math.abs(vFwd)/5.5);
  const sdir = vFwd < 0 ? -1 : 1;
  if (left)  car.heading -= car.steerK*grip*dt*sdir;
  if (right) car.heading += car.steerK*grip*dt*sdir;

  let newVFwd = vFwd;
  if (gas)        newVFwd = Math.min(car.maxSpd, newVFwd + car.accel*dt);
  else if (brake) newVFwd = newVFwd>0 ? Math.max(0,newVFwd-car.brakeF*dt) : Math.max(-car.maxSpd*0.28,newVFwd-car.accel*0.42*dt);
  else            newVFwd += (0-newVFwd)*Math.min(1,car.frict*dt);

  const decay  = Math.exp(-(handbrake ? 1.8 : 11.0)*dt);
  const newVLat = vLat * decay;
  const isSkidding = Math.abs(newVLat) > 1.8 || (handbrake && Math.abs(vFwd) > 8);

  const fX2= Math.sin(car.heading), fZ2=-Math.cos(car.heading);
  const lX2= Math.cos(car.heading), lZ2= Math.sin(car.heading);
  car.vx = fX2*newVFwd + lX2*newVLat;
  car.vz = fZ2*newVFwd + lZ2*newVLat;
  car.x += car.vx*dt;
  car.z += car.vz*dt;

  const roadCX = curveX(car.z), maxOff = ROAD_W/2+CURB_W+2;
  if (Math.abs(car.x-roadCX) > maxOff) { car.x=roadCX+Math.sign(car.x-roadCX)*maxOff; car.vx*=0.5; }

  const totalSpd = Math.hypot(car.vx, car.vz);
  const offTrack = Math.abs(car.x-roadCX) > (ROAD_W/2+CURB_W);
  const vibe = offTrack ? (Math.random()-0.5)*170 : (Math.random()-0.5)*14*Math.min(1,totalSpd/18);
  car.suspVel += (-100*car.suspY - 18*car.suspVel + vibe)*dt;
  car.suspY   += car.suspVel*dt;
  car.suspY    = Math.max(-0.20, Math.min(0.16, car.suspY));

  const accelFwd = (newVFwd-vFwd)/Math.max(dt,0.001);
  car.pitch += (-accelFwd*0.0018 - car.pitch)*Math.min(1,dt*5);
  car.pitch  = Math.max(-0.08, Math.min(0.08, car.pitch));
  car.lean  += (-newVLat*0.010 - car.lean)*Math.min(1,dt*8);

  car.wheelRot += car.speed*dt*2.2;
  const steerVis = (left?-0.42:right?0.42:0)*Math.min(1,Math.abs(vFwd)/8);
  for(const[i,w] of carWheels.entries()){
    w.rotation.order='YXZ'; w.rotation.y=i<2?steerVis:0; w.rotation.x=car.wheelRot;
  }

  carGroup.position.set(car.x, car.suspY, car.z);
  carGroup.rotation.y = car.heading;
  carGroup.rotation.x = car.pitch;
  carGroup.rotation.z = car.lean;

  const wL=wheelWorldPos(-1.19,1.36), wR=wheelWorldPos(1.19,1.36);
  if(isSkidding){ pushSkid(skidL,prevWheelL,wL); pushSkid(skidR,prevWheelR,wR); }
  prevWheelL=wL; prevWheelR=wR;

  const pullBack = 8.5 + totalSpd*0.045;
  camera.fov = 70 + totalSpd*0.16;
  camera.updateProjectionMatrix();
  camera.position.set(
    car.x - Math.sin(car.heading)*pullBack,
    3.0 + totalSpd*0.018,
    car.z + Math.cos(car.heading)*pullBack
  );
  camera.lookAt(car.x+Math.sin(car.heading)*7, 1.6, car.z-Math.cos(car.heading)*7);

  scene.fog.far = 170 - totalSpd*0.4;
  document.getElementById('hud-speedo').textContent = `${(totalSpd*2.237)|0} MPH`;
  drawSpeedLines(totalSpd);
  checkPortals();

  // Hit flash decay
  if (hitFlashTimer > 0) {
    hitFlashTimer -= dt;
    if (hitFlashTimer <= 0) hitFlash.className = '';
  }
}

// ── Main loop ──────────────────────────────────────────────────────────────────
let last = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Always render main scene as background
  if (gameState === STATE.MENU || gameState === STATE.CAR_SELECT || gameState === STATE.GAME_OVER) {
    updateMenuCamera(dt);
  } else if (gameState === STATE.PLAYING) {
    updatePlaying(dt);
  }

  renderer.render(scene, camera);

  // Preview renderer (only needs to run in car-select)
  if (gameState === STATE.CAR_SELECT) {
    previewAngle += dt * 0.7;
    prevCarGroup.rotation.y = previewAngle;
    prevRenderer.render(prevScene, prevCamera);
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
