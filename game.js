'use strict';
// ═══════════════════════════════════════════════════════════════════
//  READ RECEIPTS  —  Ordinary Game Jam #1
//  A narrative game played entirely on a simulated smartphone.
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

// ── Layout ─────────────────────────────────────────────────────────
const STATUS_H  = 18;
const NAV_H     = 26;
const CONTENT_Y = STATUS_H;

// ── Screens ────────────────────────────────────────────────────────
const SCR = Object.freeze({
  LOCK: 'lock', HOME: 'home',
  MESSAGES: 'messages', THREAD: 'thread',
  NOTES: 'notes', PHOTOS: 'photos',
  SETTINGS: 'settings',
});
let screen = SCR.LOCK;

// ── Story phase ────────────────────────────────────────────────────
const PHASE = Object.freeze({ NIGHT: 0, MORNING: 1 });
let timePhase     = PHASE.NIGHT;
let phaseTimer    = -1;   // counts down to seedMorning, -1 = idle

// ── Interpretation profile ─────────────────────────────────────────
const profile = { defensive: 0, trusting: 0, avoidant: 0 };

// ── Relationships ──────────────────────────────────────────────────
const rel = {
  morgan: { name: 'Morgan', trust: 50, tension: 0, tone: 'neutral', color: '#7c6cd6' },
  alex:   { name: 'Alex',   trust: 60, tension: 0, tone: 'warm',    color: '#c07050' },
};

// ── Settings ───────────────────────────────────────────────────────
const settings = {
  readReceipts:    true,
  doNotDisturb:    false,
  locationSharing: true,
};

// ── Flags ──────────────────────────────────────────────────────────
const flags = new Set();

// ── Notification toast ─────────────────────────────────────────────
let notifToast = null;   // { sender, text, timer }

function pushNotif(sender, text) {
  if (settings.doNotDisturb) return;
  notifToast = { sender, text, timer: 3.5 };
}

// ── Notes ──────────────────────────────────────────────────────────
const notes = [
  {
    time: '11:12 PM',
    body: "can't keep doing this. riley's was a mistake probably. but I stayed anyway.",
  },
];

// ── Photos ─────────────────────────────────────────────────────────
// One photo. Timestamp contradicts the texts.
const photos = [
  {
    timestamp: '12:31 AM',
    location: null,   // revealed on zoom
    zoomed: false,
  },
];
let photoZoom = false;

// ── Conversation script ────────────────────────────────────────────
const SCRIPT = {

  // ── Morgan — night ────────────────────────────────────────────
  morgan_0: {
    incoming: { text: 'hey did you get home ok last night', time: '11:42 PM' },
    choices: [
      { text: 'Yeah all good 👍',            next: 'morgan_1a', fx: () => { rel.morgan.trust += 5;  profile.trusting++;  } },
      { text: 'why are you asking',           next: 'morgan_1b', fx: () => { rel.morgan.tension += 10; profile.defensive++; } },
      { text: '(leave on read)', silent:true, next: 'morgan_1c', fx: () => { rel.morgan.tension += 15; profile.avoidant++;  } },
    ],
  },
  morgan_1a: {
    incoming: { text: 'ok good :) you seemed off', time: '11:44 PM' },
    choices: [
      { text: 'I was just tired',          next: 'morgan_2a', fx: () => { profile.trusting++;  } },
      { text: 'what do you mean "off"',    next: 'morgan_2b', fx: () => { profile.defensive++; rel.morgan.tension += 5; } },
    ],
  },
  morgan_1b: {
    incoming: { text: 'just checking in lol', time: '11:44 PM' },
    choices: [
      { text: 'oh ok. yeah I\'m fine',         next: 'morgan_2a', fx: () => {} },
      { text: 'you don\'t have to do that',    next: 'morgan_2c', fx: () => { profile.defensive++; rel.morgan.tension += 10; } },
    ],
  },
  morgan_1c: {
    incoming: { text: '...ok', time: '11:58 PM' },
    choices: [
      { text: 'sorry fell asleep',                  next: 'morgan_2a', fx: () => { profile.trusting++; } },
      { text: '(still nothing)', silent:true,        next: 'morgan_2d', fx: () => { profile.avoidant += 2; rel.morgan.tension += 20; } },
    ],
  },
  morgan_2a: {
    incoming: { text: 'ok. sleep well', time: '11:45 PM' },
    choices: null,
    onEnd: () => { flags.add('morgan_night_ok'); queueMorning(); },
  },
  morgan_2b: {
    incoming: { text: 'idk you were just quiet. nvm forget I said anything', time: '11:46 PM' },
    choices: [
      { text: 'no tell me',  next: 'morgan_2e', fx: () => { profile.trusting++; } },
      { text: 'yeah nvm',    next: 'morgan_2f', fx: () => { profile.avoidant++; } },
    ],
  },
  morgan_2c: {
    incoming: { text: 'ok. noted.', time: '11:45 PM' },
    choices: null,
    onEnd: () => { flags.add('morgan_pushed_away'); rel.morgan.trust -= 10; queueMorning(); },
  },
  morgan_2d: {
    incoming: null,
    choices: null,
    onEnd: () => { flags.add('morgan_silence'); rel.morgan.trust -= 20; queueMorning(); },
  },
  morgan_2e: {
    incoming: { text: 'you just seemed sad. I dunno. it doesn\'t matter', time: '11:47 PM' },
    choices: [
      { text: 'I\'m ok. thanks for noticing', next: 'morgan_end_warm', fx: () => { rel.morgan.trust += 10; profile.trusting++; } },
      { text: 'I\'m fine',                    next: 'morgan_end_flat', fx: () => { profile.defensive++; } },
    ],
  },
  morgan_2f: {
    incoming: { text: 'ok.', time: '11:46 PM' },
    choices: null,
    onEnd: () => { flags.add('morgan_night_tense'); queueMorning(); },
  },
  morgan_end_warm: {
    incoming: { text: '❤️', time: '11:48 PM' },
    choices: null,
    onEnd: () => { flags.add('morgan_connected'); rel.morgan.trust += 5; queueMorning(); },
  },
  morgan_end_flat: {
    incoming: { text: 'ok. night', time: '11:48 PM' },
    choices: null,
    onEnd: () => { flags.add('morgan_night_flat'); queueMorning(); },
  },

  // ── Alex — morning ────────────────────────────────────────────
  alex_0: {
    incoming: { text: 'hey you left your jacket at riley\'s last night lol', time: '9:03 AM' },
    choices: [
      { text: 'oh no lol thanks',              next: 'alex_1a', fx: () => { profile.trusting++;  } },
      { text: 'I wasn\'t there that long',     next: 'alex_1b', fx: () => { profile.defensive++; } },
      { text: '(seen, no reply)', silent:true, next: 'alex_1c', fx: () => { profile.avoidant++;  rel.alex.tension += 10; } },
    ],
  },
  alex_1a: {
    incoming: { text: 'yeah. riley asked about you btw', time: '9:05 AM' },
    choices: [
      { text: 'oh yeah? what did they say',         next: 'alex_2a', fx: () => { profile.trusting++; } },
      { text: 'I\'m fine if that\'s what they asked', next: 'alex_2b', fx: () => { profile.defensive++; } },
    ],
  },
  alex_1b: {
    incoming: { text: 'yeah you kind of disappeared. everything ok?', time: '9:05 AM' },
    choices: [
      { text: 'yeah I just needed air',            next: 'alex_2c', fx: () => { profile.trusting++; } },
      { text: 'why does everyone keep asking that', next: 'alex_2d', fx: () => { profile.defensive += 2; rel.alex.tension += 5; } },
    ],
  },
  alex_1c: {
    incoming: { text: 'ok lmk if you want it back', time: '9:18 AM' },
    choices: null,
    onEnd: () => flags.add('alex_ignored'),
  },
  alex_2a: {
    incoming: { text: 'just that you seemed like you were somewhere else all night', time: '9:07 AM' },
    choices: [
      { text: 'yeah. I was',       next: 'alex_3a', fx: () => { profile.trusting++;  rel.alex.trust += 5; } },
      { text: 'that\'s not true',  next: 'alex_3b', fx: () => { profile.defensive++; } },
    ],
  },
  alex_2b: {
    incoming: { text: 'I didn\'t say anything was wrong. did I?', time: '9:07 AM' },
    choices: [
      { text: 'no. sorry.',            next: 'alex_3c', fx: () => { profile.trusting++; } },
      { text: 'it\'s just a lot lately', next: 'alex_3d', fx: () => { rel.alex.trust += 5; } },
    ],
  },
  alex_2c: {
    incoming: { text: 'totally fair. it was a lot in there', time: '9:06 AM' },
    choices: null,
    onEnd: () => flags.add('alex_understood'),
  },
  alex_2d: {
    incoming: { text: 'I mean... morgan texted me this morning too so', time: '9:07 AM' },
    choices: [
      { text: 'what did she say',         next: 'alex_morgan_cross', fx: () => { profile.trusting++; } },
      { text: '(leave it)',  silent:true, next: 'alex_3e',           fx: () => { profile.avoidant++; } },
    ],
  },
  alex_3a: {
    incoming: { text: 'yeah. I could tell.', time: '9:09 AM' },
    choices: null,
    onEnd: () => { flags.add('alex_honest'); rel.alex.trust += 10; },
  },
  alex_3b: {
    incoming: { text: 'ok.', time: '9:09 AM' },
    choices: null,
    onEnd: () => { flags.add('alex_deflected'); rel.alex.tension += 5; },
  },
  alex_3c: {
    incoming: { text: 'don\'t apologize. just checking in.', time: '9:09 AM' },
    choices: null,
    onEnd: () => flags.add('alex_ok'),
  },
  alex_3d: {
    incoming: { text: 'yeah. I get that.', time: '9:09 AM' },
    choices: null,
    onEnd: () => { flags.add('alex_opened_up'); rel.alex.trust += 5; },
  },
  alex_3e: {
    incoming: null,
    choices: null,
    onEnd: () => flags.add('alex_left_hanging'),
  },
  alex_morgan_cross: {
    incoming: { text: 'just asked if you got home ok. I said I thought so.', time: '9:09 AM' },
    choices: [
      { text: 'what do you mean you thought so', next: 'alex_cross_2a', fx: () => { profile.defensive++; } },
      { text: 'ok thanks',                       next: 'alex_cross_2b', fx: () => {} },
    ],
  },
  alex_cross_2a: {
    incoming: { text: 'you left at like 12:30. I just didn\'t see you actually leave.', time: '9:10 AM' },
    choices: null,
    onEnd: () => { flags.add('alex_timeline_revealed'); },
  },
  alex_cross_2b: {
    incoming: { text: 'yeah. anyway. jacket\'s at mine whenever.', time: '9:10 AM' },
    choices: null,
    onEnd: () => flags.add('alex_end_neutral'),
  },

};

// ── Threads ────────────────────────────────────────────────────────
const threads = {
  morgan: {
    contact: 'morgan', messages: [], unread: 0, scriptNode: 'morgan_0',
  },
};

(function seedNight() {
  const node = SCRIPT[threads.morgan.scriptNode];
  if (node?.incoming) {
    threads.morgan.messages.push({ from:'them', text:node.incoming.text, time:node.incoming.time, read:false });
    threads.morgan.unread = 1;
  }
})();

// ── Phase transition ───────────────────────────────────────────────
function queueMorning() {
  if (timePhase === PHASE.MORNING || phaseTimer >= 0) return;
  phaseTimer = 3.0;
}

function seedMorning() {
  if (timePhase === PHASE.MORNING) return;
  timePhase = PHASE.MORNING;

  // Alex thread appears
  threads.alex = {
    contact: 'alex', messages: [], unread: 0, scriptNode: 'alex_0',
  };
  const aNode = SCRIPT['alex_0'];
  if (aNode?.incoming) {
    threads.alex.messages.push({ from:'them', text:aNode.incoming.text, time:aNode.incoming.time, read:false });
    threads.alex.unread = 1;
  }

  // Morning note
  notes.push({
    time: '8:47 AM',
    body: morningNoteBody(),
  });

  // Photo unlocked
  photos[0].unlocked = true;

  // Toast notification
  pushNotif('Alex', "hey you left your jacket at riley's last night lol");
}

function morningNoteBody() {
  if (flags.has('morgan_connected'))   return "morgan texted last night. I told her I was fine. I think I believed it at the time.";
  if (flags.has('morgan_pushed_away')) return "I pushed morgan away again. I'm starting to think that's what I do.";
  if (flags.has('morgan_silence'))     return "didn't answer morgan. didn't answer a lot of things last night.";
  return "woke up and the first thing I did was check my phone. that's probably not a good sign.";
}

// ── Active thread state ────────────────────────────────────────────
let activeThreadKey = null;
let choiceAnim      = 0;
let choiceMade      = false;
let typingActive    = false;
let typingTimer     = 0;
let typingNextNode  = null;

function openThread(key) {
  activeThreadKey = key;
  screen = SCR.THREAD;
  choiceAnim = 0;
  choiceMade = false;
  typingActive = false;
  const t = threads[key];
  t.messages.forEach(m => m.read = true);
  t.unread = 0;
}

function submitChoice(choice) {
  if (choiceMade || !activeThreadKey) return;
  choiceMade = true;
  const t = threads[activeThreadKey];
  if (!choice.silent) {
    t.messages.push({ from:'me', text:choice.text, time:clockStr(), read:false });
  }
  if (choice.fx) choice.fx();
  refreshTone(activeThreadKey);
  if (choice.next) {
    const next = SCRIPT[choice.next];
    t.scriptNode = choice.next;
    if (next?.incoming) {
      typingActive   = true;
      typingTimer    = 0.9 + Math.random() * 1.1;
      typingNextNode = choice.next;
    } else {
      if (next?.onEnd) next.onEnd();
      t.scriptNode = null;
    }
  } else {
    t.scriptNode = null;
  }
}

function deliverPending() {
  if (!typingNextNode || !activeThreadKey) return;
  const t    = threads[activeThreadKey];
  const node = SCRIPT[typingNextNode];
  if (node?.incoming) {
    t.messages.push({ from:'them', text:node.incoming.text, time:node.incoming.time || clockStr(), read:false });
  }
  if (!node?.choices) {
    if (node?.onEnd) node.onEnd();
    t.scriptNode = null;
  } else {
    choiceAnim = 0;
    choiceMade = false;
  }
  typingActive   = false;
  typingNextNode = null;
}

function refreshTone(key) {
  const r = rel[key];
  if (!r) return;
  const p = profile;
  if      (p.avoidant  >= 3 && p.avoidant  >= p.defensive && p.avoidant  >= p.trusting) r.tone = 'distant';
  else if (p.defensive >= 3 && p.defensive >= p.trusting)                                r.tone = 'guarded';
  else if (p.trusting  >= 3)                                                              r.tone = 'warm';
}

// ── App grid ───────────────────────────────────────────────────────
const APP_SZ = 54;
const APP_GRID = (function() {
  const list = [
    { id:'messages', label:'Messages', col:'#3c8c4a', icon:'💬' },
    { id:'photos',   label:'Photos',   col:'#b87020', icon:'🖼️'  },
    { id:'notes',    label:'Notes',    col:'#b8a020', icon:'📝'  },
    { id:'calls',    label:'Calls',    col:'#2878c0', icon:'📞'  },
    { id:'settings', label:'Settings', col:'#607080', icon:'⚙️'  },
  ];
  const cols = 4, gX = 14;
  const totalW = cols * APP_SZ + (cols - 1) * gX;
  const sX = Math.round((W - totalW) / 2);
  const sY = STATUS_H + 24;
  return list.map((a, i) => ({
    ...a,
    x: sX + (i % cols) * (APP_SZ + gX),
    y: sY + Math.floor(i / cols) * (APP_SZ + 20),
  }));
})();

const SETTING_ROWS = [
  { key:'readReceipts',    label:'Read Receipts',    sub:'Let others see when you\'ve read their messages' },
  { key:'doNotDisturb',    label:'Do Not Disturb',   sub:'Silence notifications'                           },
  { key:'locationSharing', label:'Location Sharing', sub:'Share your location with contacts'               },
];

// ── Input ──────────────────────────────────────────────────────────
canvas.addEventListener('click', e => {
  const r  = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (W / r.width);
  const my = (e.clientY - r.top)  * (H / r.height);
  handleClick(mx, my);
});

function handleClick(mx, my) {
  if (screen !== SCR.LOCK && screen !== SCR.HOME && my >= H - NAV_H) {
    goBack(); return;
  }
  switch (screen) {
    case SCR.LOCK:     onClickLock();              break;
    case SCR.HOME:     onClickHome(mx, my);        break;
    case SCR.MESSAGES: onClickMessages(mx, my);    break;
    case SCR.THREAD:   onClickThread(mx, my);      break;
    case SCR.NOTES:    /* read-only */             break;
    case SCR.PHOTOS:   onClickPhotos(mx, my);      break;
    case SCR.SETTINGS: onClickSettings(mx, my);    break;
  }
}

function goBack() {
  if      (screen === SCR.THREAD)  { screen = SCR.MESSAGES; activeThreadKey = null; }
  else if (screen === SCR.PHOTOS)  { photoZoom = false; screen = SCR.HOME; }
  else                             { screen = SCR.HOME; }
}

function onClickLock()  { screen = SCR.HOME; }

function onClickHome(mx, my) {
  for (const app of APP_GRID) {
    if (mx >= app.x && mx <= app.x + APP_SZ && my >= app.y && my <= app.y + APP_SZ + 20) {
      switch (app.id) {
        case 'messages': screen = SCR.MESSAGES; break;
        case 'notes':    screen = SCR.NOTES;    break;
        case 'photos':   screen = SCR.PHOTOS; photoZoom = false; break;
        case 'settings': screen = SCR.SETTINGS; break;
      }
      return;
    }
  }
}

function onClickMessages(mx, my) {
  let ry = CONTENT_Y + 36;
  for (const key of Object.keys(threads)) {
    if (my >= ry && my < ry + 56) { openThread(key); return; }
    ry += 56;
  }
}

function onClickThread(mx, my) {
  if (!activeThreadKey) return;
  const t    = threads[activeThreadKey];
  const node = t.scriptNode ? SCRIPT[t.scriptNode] : null;
  if (!node?.choices || choiceMade || typingActive) return;
  const choices = node.choices;
  const bH = 22, gap = 4;
  const totalH = choices.length * (bH + gap) - gap;
  let by = H - NAV_H - totalH - 6;
  for (const c of choices) {
    if (mx >= 8 && mx <= W - 8 && my >= by && my <= by + bH) { submitChoice(c); return; }
    by += bH + gap;
  }
}

function onClickPhotos(mx, my) {
  // Tap the photo area to toggle zoom
  const py = CONTENT_Y + 32;
  const ph = H - NAV_H - py - 26;
  if (my >= py && my <= py + ph) photoZoom = !photoZoom;
}

function onClickSettings(mx, my) {
  let ry = CONTENT_Y + 44;
  for (const row of SETTING_ROWS) {
    if (my >= ry && my < ry + 38) {
      settings[row.key] = !settings[row.key];
      if (row.key === 'readReceipts') flags.add(settings.readReceipts ? 'receipts_on' : 'receipts_off');
      return;
    }
    ry += 38;
  }
}

// ── Update ─────────────────────────────────────────────────────────
let totalTime = 0;
let lastTs    = 0;

function update(dt) {
  totalTime += dt;

  // Phase transition countdown
  if (phaseTimer >= 0) {
    phaseTimer -= dt;
    if (phaseTimer <= 0) { phaseTimer = -1; seedMorning(); }
  }

  // Choice fade-in
  if (screen === SCR.THREAD && !choiceMade && !typingActive) {
    choiceAnim = Math.min(1, choiceAnim + dt * 2.8);
  }

  // Typing → deliver
  if (typingActive) {
    typingTimer -= dt;
    if (typingTimer <= 0) deliverPending();
  }

  // Notification toast timeout
  if (notifToast) {
    notifToast.timer -= dt;
    if (notifToast.timer <= 0) notifToast = null;
  }
}

// ── Draw ───────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  switch (screen) {
    case SCR.LOCK:     drawLock();     break;
    case SCR.HOME:     drawHome();     break;
    case SCR.MESSAGES: drawMsgList();  break;
    case SCR.THREAD:   drawThread();   break;
    case SCR.NOTES:    drawNotes();    break;
    case SCR.PHOTOS:   drawPhotos();   break;
    case SCR.SETTINGS: drawSettings(); break;
  }

  if (screen !== SCR.LOCK) {
    drawStatusBar();
    drawBottomNav();
    if (notifToast && screen === SCR.HOME) drawNotifToast();
  }
}

// ── Status bar ─────────────────────────────────────────────────────
function drawStatusBar() {
  ctx.fillStyle = 'rgba(5,5,12,0.78)';
  ctx.fillRect(0, 0, W, STATUS_H);
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ddd';
  ctx.fillText(clockStr(), 8, 13);
  ctx.textAlign = 'right';
  ctx.font = '8px monospace';
  ctx.fillStyle = '#aaa';
  let rx = W - 6;
  ctx.fillText('▮▮▮▯', rx, 13); rx -= 34;
  if (settings.doNotDisturb) ctx.fillText('🌙', rx, 13);
  ctx.textAlign = 'left';
}

// ── Bottom nav ─────────────────────────────────────────────────────
function drawBottomNav() {
  const y = H - NAV_H;
  ctx.fillStyle = 'rgba(8,8,16,0.93)';
  ctx.fillRect(0, y, W, NAV_H);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, y, W, 1);
  if (screen !== SCR.HOME) {
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6aacff';
    ctx.fillText('‹  back', 12, y + 17);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  roundRect(W/2 - 22, y + 8, 44, 5, 3);
  ctx.fill();
}

// ── Notification toast ─────────────────────────────────────────────
function drawNotifToast() {
  if (!notifToast) return;
  const fade = Math.min(1, notifToast.timer / 0.4);
  ctx.save();
  ctx.globalAlpha = fade;
  const tx = 8, ty = STATUS_H + 4, tw = W - 16, th = 34;
  ctx.fillStyle = 'rgba(30,30,45,0.97)';
  roundRect(tx, ty, tw, th, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  roundRect(tx, ty, tw, th, 8);
  ctx.stroke();
  // App icon dot
  ctx.fillStyle = '#3c8c4a';
  roundRect(tx + 6, ty + 6, 22, 22, 5);
  ctx.fill();
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('💬', tx + 17, ty + 22);
  // Text
  ctx.textAlign = 'left';
  ctx.font = 'bold 7px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(notifToast.sender, tx + 34, ty + 13);
  ctx.font = '7px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  const preview = notifToast.text.length > 46 ? notifToast.text.slice(0, 45) + '…' : notifToast.text;
  ctx.fillText(preview, tx + 34, ty + 25);
  ctx.restore();
}

// ── Lock screen ────────────────────────────────────────────────────
function drawLock() {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0c1520'); g.addColorStop(1, '#17082a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const now = new Date();
  ctx.font = 'bold 56px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(`${now.getHours()%12||12}:${String(now.getMinutes()).padStart(2,'0')}`, W/2, 108);

  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(`${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`, W/2, 126);

  // Most recent unread notification
  const unread = Object.values(threads).filter(t => t.unread > 0);
  let cy = 148;
  for (const t of unread.slice(0, 2)) {
    const msg = t.messages.findLast(m => !m.read) || t.messages[t.messages.length - 1];
    drawLockCard(W/2 - 140, cy, 280, rel[t.contact]?.name || t.contact, msg?.text || '');
    cy += 58;
  }

  ctx.font = '8px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillText('tap to unlock', W/2, H - 16);
}

function drawLockCard(x, y, w, sender, preview) {
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  roundRect(x, y, w, 50, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1;
  roundRect(x, y, w, 50, 10); ctx.stroke();

  ctx.fillStyle = '#3c8c4a';
  roundRect(x + 8, y + 9, 28, 28, 6); ctx.fill();
  ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('💬', x + 22, y + 28);

  ctx.textAlign = 'left';
  ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#fff';
  ctx.fillText(sender, x + 44, y + 20);
  ctx.font = '7px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.fillText(preview.length > 38 ? preview.slice(0, 37) + '…' : preview, x + 44, y + 34);
  ctx.font = '6px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.textAlign = 'right'; ctx.fillText('now', x + w - 8, y + 20);
  ctx.textAlign = 'left';
}

// ── Home screen ────────────────────────────────────────────────────
function drawHome() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0c1520'); g.addColorStop(1, '#17082a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const app of APP_GRID) drawAppIcon(app);
}

function drawAppIcon(app) {
  ctx.fillStyle = app.col;
  roundRect(app.x, app.y, APP_SZ, APP_SZ, 13); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(app.x, app.y, APP_SZ, APP_SZ * 0.44, 13); ctx.fill();

  ctx.font = '24px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(app.icon, app.x + APP_SZ/2, app.y + APP_SZ/2 + 9);

  const ub = app.id === 'messages'
    ? Object.values(threads).reduce((s, t) => s + (t.unread || 0), 0) : 0;
  if (ub > 0) {
    ctx.fillStyle = '#e53935'; ctx.beginPath();
    ctx.arc(app.x + APP_SZ - 5, app.y + 5, 7, 0, Math.PI*2); ctx.fill();
    ctx.font = 'bold 7px monospace'; ctx.fillStyle = '#fff';
    ctx.fillText(String(ub), app.x + APP_SZ - 5, app.y + 8);
  }

  ctx.font = '7px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(app.label, app.x + APP_SZ/2, app.y + APP_SZ + 13);
  ctx.textAlign = 'left';
}

// ── Messages list ──────────────────────────────────────────────────
function drawMsgList() {
  ctx.fillStyle = '#0d0d16'; ctx.fillRect(0, 0, W, H);
  appHeader('Messages');

  let ry = STATUS_H + 36;
  for (const [key, t] of Object.entries(threads)) {
    drawThreadRow(key, t, ry); ry += 56;
  }
}

function drawThreadRow(key, t, y) {
  const r    = rel[key];
  const last = t.messages[t.messages.length - 1];

  ctx.fillStyle = t.unread > 0 ? 'rgba(60,140,74,0.07)' : 'rgba(255,255,255,0.02)';
  ctx.fillRect(0, y, W, 55);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(52, y + 54, W - 52, 1);

  ctx.fillStyle = r?.color || '#555';
  ctx.beginPath(); ctx.arc(28, y + 27, 18, 0, Math.PI*2); ctx.fill();
  ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText((r?.name || key)[0].toUpperCase(), 28, y + 32);

  ctx.textAlign = 'left';
  ctx.font = t.unread > 0 ? 'bold 9px monospace' : '9px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(r?.name || key, 54, y + 18);

  ctx.font = '8px monospace';
  ctx.fillStyle = t.unread > 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.38)';
  const prev = last ? (last.from === 'me' ? 'You: ' + last.text : last.text) : '';
  ctx.fillText(prev.length > 42 ? prev.slice(0, 41) + '…' : prev, 54, y + 34);

  if (last) {
    ctx.textAlign = 'right'; ctx.font = '6px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillText(last.time, W - 10, y + 18); ctx.textAlign = 'left';
  }
  if (t.unread > 0) {
    ctx.fillStyle = '#3c8c4a'; ctx.beginPath();
    ctx.arc(W - 13, y + 33, 5, 0, Math.PI*2); ctx.fill();
  }
}

// ── Thread view ────────────────────────────────────────────────────
function drawThread() {
  if (!activeThreadKey) return;
  const t    = threads[activeThreadKey];
  const r    = rel[activeThreadKey];
  const node = t.scriptNode ? SCRIPT[t.scriptNode] : null;

  ctx.fillStyle = '#0d0d16'; ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = 'rgba(12,12,22,0.97)';
  ctx.fillRect(0, STATUS_H, W, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, STATUS_H + 33, W, 1);

  ctx.font = '11px monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = '#6aacff'; ctx.fillText('‹', 8, STATUS_H + 22);

  ctx.fillStyle = r?.color || '#555';
  ctx.beginPath(); ctx.arc(W/2, STATUS_H + 11, 9, 0, Math.PI*2); ctx.fill();
  ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText((r?.name || activeThreadKey)[0].toUpperCase(), W/2, STATUS_H + 14);

  ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#fff';
  ctx.fillText(r?.name || activeThreadKey, W/2, STATUS_H + 30);
  ctx.textAlign = 'left';

  const hasChoices = node?.choices && !choiceMade && !typingActive;
  const choiceH    = hasChoices ? node.choices.length * 26 + 10 : 0;
  const typingH    = typingActive ? 28 : 0;
  const bubbleBot  = H - NAV_H - choiceH - typingH - 4;

  drawBubbles(t, STATUS_H + 36, bubbleBot);
  if (typingActive) drawTyping(bubbleBot + 4);
  if (hasChoices)   drawChoices(node.choices, bubbleBot + typingH);
}

function drawBubbles(t, top, bottom) {
  let y = bottom - 2;
  for (let i = t.messages.length - 1; i >= 0; i--) {
    const msg  = t.messages[i];
    const isMe = msg.from === 'me';
    const maxBW = 230, padX = 9, padY = 7;
    const lines = wrapText(msg.text, maxBW - padX*2, '8px monospace');
    const bH    = lines.length * 12 + padY * 2;
    const bW    = Math.min(maxBW, Math.ceil(longestLine(lines, '8px monospace')) + padX*2 + 4);

    y -= bH + 7;
    if (y + bH < top) break;

    const bX = isMe ? W - bW - 10 : 10;

    // Tail
    ctx.fillStyle = isMe ? '#1d5fa8' : '#252535';
    ctx.beginPath();
    if (isMe) {
      ctx.moveTo(bX + bW, y + bH - 10);
      ctx.lineTo(bX + bW + 6, y + bH - 4);
      ctx.lineTo(bX + bW - 4, y + bH - 4);
    } else {
      ctx.moveTo(bX, y + bH - 10);
      ctx.lineTo(bX - 6, y + bH - 4);
      ctx.lineTo(bX + 4, y + bH - 4);
    }
    ctx.fill();

    ctx.fillStyle = isMe ? '#1d5fa8' : '#252535';
    roundRect(bX, y, bW, bH, 10); ctx.fill();

    ctx.font = '8px monospace'; ctx.fillStyle = '#f0f0f0'; ctx.textAlign = 'left';
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], bX + padX, y + padY + 10 + li * 12);
    }

    if (isMe && i === t.messages.length - 1) {
      ctx.font = '6px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.textAlign = 'right';
      ctx.fillText(settings.readReceipts ? 'Read' : 'Delivered', W - 10, y + bH + 8);
    }
    if (i === 0 || i % 4 === 0) {
      ctx.font = '6px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.textAlign = 'center'; ctx.fillText(msg.time, W/2, y - 3);
    }
    ctx.textAlign = 'left';
  }
}

function drawTyping(y) {
  const phase = (totalTime * 2.8) % 3;
  ctx.fillStyle = '#252535';
  roundRect(12, y + 2, 46, 20, 10); ctx.fill();
  for (let d = 0; d < 3; d++) {
    ctx.fillStyle = `rgba(200,200,210,${Math.floor(phase) === d ? 1 : 0.25})`;
    ctx.beginPath(); ctx.arc(24 + d*11, y + 12, 3, 0, Math.PI*2); ctx.fill();
  }
}

function drawChoices(choices, startY) {
  const bH = 22, gap = 4;
  ctx.globalAlpha = choiceAnim;
  let by = startY + 4;
  for (const c of choices) {
    const silent = !!c.silent;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(9, by + 2, W - 18, bH, 6); ctx.fill();
    ctx.fillStyle = silent ? 'rgba(45,45,55,0.92)' : 'rgba(22,70,140,0.92)';
    roundRect(8, by, W - 16, bH, 6); ctx.fill();
    ctx.strokeStyle = silent ? 'rgba(130,130,150,0.3)' : 'rgba(80,140,255,0.4)';
    ctx.lineWidth = 1;
    roundRect(8, by, W - 16, bH, 6); ctx.stroke();
    ctx.font = '8px monospace';
    ctx.fillStyle = silent ? 'rgba(255,255,255,0.45)' : '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(c.text, 16, by + bH/2 + 3);
    by += bH + gap;
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

// ── Notes app ──────────────────────────────────────────────────────
function drawNotes() {
  ctx.fillStyle = '#0d0d16'; ctx.fillRect(0, 0, W, H);
  appHeader('Notes');

  let ry = STATUS_H + 40;
  for (const note of notes) {
    if (ry > H - NAV_H - 10) break;

    // Row bg
    ctx.fillStyle = 'rgba(255,220,80,0.04)';
    roundRect(8, ry, W - 16, 52, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,80,0.1)'; ctx.lineWidth = 1;
    roundRect(8, ry, W - 16, 52, 6); ctx.stroke();

    // Timestamp
    ctx.font = '6px monospace'; ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText(note.time, W - 16, ry + 12);

    // Body text
    ctx.textAlign = 'left';
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,220,0.85)';
    const lines = wrapText(note.body, W - 40, '8px monospace');
    for (let li = 0; li < Math.min(lines.length, 3); li++) {
      ctx.fillText(lines[li], 16, ry + 14 + li * 12);
    }

    ry += 58;
  }

  if (notes.length === 0) {
    ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText('No notes.', W/2, H/2);
    ctx.textAlign = 'left';
  }
}

// ── Photos app ─────────────────────────────────────────────────────
function drawPhotos() {
  ctx.fillStyle = '#080810'; ctx.fillRect(0, 0, W, H);
  appHeader('Photos');

  const py  = STATUS_H + 32;
  const ph  = H - NAV_H - py - 24;
  const pw  = W - 16;

  if (photoZoom) {
    // Detail/zoom view — fill full content area
    drawNightScene(8, py, pw, ph, true);
    // Zoom hint
    ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('tap to zoom out', W/2, H - NAV_H - 6);
    ctx.textAlign = 'left';
  } else {
    // Normal view
    drawNightScene(8, py, pw, ph, false);
    // Hint
    ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('tap to zoom', W/2, H - NAV_H - 6);
    ctx.textAlign = 'left';
  }
}

// Pixel-art night scene — the photo from last night
function drawNightScene(x, y, w, h, zoomed) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

  // Sky
  const skyG = ctx.createLinearGradient(x, y, x, y + h * 0.55);
  skyG.addColorStop(0, '#050a18'); skyG.addColorStop(1, '#0c1830');
  ctx.fillStyle = skyG; ctx.fillRect(x, y, w, h);

  // Stars (fixed seed)
  const starSeeds = [[0.12,0.08],[0.34,0.05],[0.55,0.12],[0.78,0.04],[0.9,0.09],
                     [0.22,0.15],[0.66,0.07],[0.45,0.03],[0.85,0.14],[0.05,0.12]];
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (const [fx,fy] of starSeeds) {
    ctx.fillRect(Math.round(x + fx*w), Math.round(y + fy*h), 1, 1);
  }

  // Buildings (back)
  const buildings = [
    { fx:0,    fw:0.18, fh:0.52, col:'#111820' },
    { fx:0.16, fw:0.14, fh:0.38, col:'#0e1520' },
    { fx:0.28, fw:0.22, fh:0.60, col:'#12181e' },
    { fx:0.48, fw:0.16, fh:0.44, col:'#0e1824' },
    { fx:0.62, fw:0.20, fh:0.55, col:'#111c22' },
    { fx:0.80, fw:0.22, fh:0.48, col:'#0e1620' },
  ];
  const groundY = y + h * 0.58;
  for (const b of buildings) {
    const bx = x + b.fx * w, by = groundY - b.fh * h;
    const bw = b.fw * w,     bh = b.fh * h;
    ctx.fillStyle = b.col; ctx.fillRect(Math.round(bx), Math.round(by), Math.round(bw), Math.round(bh));
    // Windows
    const cols = Math.floor(bw / 8), rows = Math.floor(bh / 9);
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols; c++) {
        const wx = Math.round(bx + c * 8 - 2), wy = Math.round(by + r * 9 + 2);
        // Deterministic "light on" based on position
        const seed = (b.fx * 100 + r * 7 + c * 3) % 1;
        if (((r * 13 + c * 7) % 5) > 1) {
          ctx.fillStyle = ((r * 11 + c * 5) % 4 === 0) ? 'rgba(255,240,140,0.7)' : 'rgba(255,240,140,0.2)';
          ctx.fillRect(wx, wy, 3, 4);
        }
      }
    }
  }

  // Ground / pavement
  const pavG = ctx.createLinearGradient(x, groundY, x, y + h);
  pavG.addColorStop(0, '#1c2028'); pavG.addColorStop(1, '#151820');
  ctx.fillStyle = pavG; ctx.fillRect(x, Math.round(groundY), w, h - (groundY - y));

  // Pavement lines (horizontal)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let py2 = groundY + 8; py2 < y + h; py2 += 10) {
    ctx.beginPath(); ctx.moveTo(x, py2); ctx.lineTo(x + w, py2); ctx.stroke();
  }

  // Streetlight
  const lightX = x + w * 0.62, lightY = groundY - h * 0.28;
  ctx.strokeStyle = '#334'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(lightX, groundY); ctx.lineTo(lightX, lightY);
  ctx.lineTo(lightX + 12, lightY); ctx.stroke();
  ctx.fillStyle = '#ffefa0';
  ctx.beginPath(); ctx.arc(lightX + 12, lightY, 3, 0, Math.PI*2); ctx.fill();
  // Glow cone
  const lgrd = ctx.createRadialGradient(lightX+12, lightY, 0, lightX+12, lightY, 40);
  lgrd.addColorStop(0, 'rgba(255,240,140,0.18)');
  lgrd.addColorStop(1, 'rgba(255,240,140,0)');
  ctx.fillStyle = lgrd;
  ctx.beginPath(); ctx.arc(lightX+12, lightY, 40, 0, Math.PI*2); ctx.fill();

  // Two figures (the key detail)
  const fig1X = x + w * (zoomed ? 0.50 : 0.54);
  const fig2X = x + w * (zoomed ? 0.62 : 0.64);
  const figY  = groundY;
  const figScale = zoomed ? 1.6 : 1.0;
  drawFigure(fig1X, figY, figScale, '#1a1a2a');
  drawFigure(fig2X, figY, figScale, '#1e1a28');

  if (zoomed) {
    // Extra detail on zoom: hand placement, proximity
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fig1X + 6 * figScale, figY - 14 * figScale);
    ctx.lineTo(fig2X - 2 * figScale, figY - 12 * figScale);
    ctx.stroke();
  }

  // Timestamp overlay — THE anomaly
  const tsW = 62, tsH = 14;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x + w - tsW - 4, y + h - tsH - 4, tsW, tsH);
  ctx.font = 'bold 7px monospace'; ctx.textAlign = 'right';
  ctx.fillStyle = zoomed ? '#ffcc44' : 'rgba(255,255,255,0.6)';
  ctx.fillText('12:31 AM', x + w - 6, y + h - 6);
  ctx.textAlign = 'left';

  if (zoomed && flags.has('morgan_night_ok')) {
    // Subtle contradiction note — only if you told Morgan you were home
    ctx.font = '6px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,100,100,0.5)';
    ctx.fillText('Morgan texted at 11:42 PM', x + w/2, y + h - 20);
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

function drawFigure(cx, groundY, scale, col) {
  const s = scale;
  ctx.fillStyle = col;
  // Body
  ctx.fillRect(Math.round(cx - 3*s), Math.round(groundY - 20*s), Math.round(6*s), Math.round(14*s));
  // Head
  ctx.beginPath();
  ctx.arc(Math.round(cx), Math.round(groundY - 22*s), Math.round(4*s), 0, Math.PI*2);
  ctx.fill();
  // Legs
  ctx.fillRect(Math.round(cx - 3*s), Math.round(groundY - 6*s), Math.round(2*s), Math.round(6*s));
  ctx.fillRect(Math.round(cx + 1*s), Math.round(groundY - 6*s), Math.round(2*s), Math.round(6*s));
}

// ── Settings ───────────────────────────────────────────────────────
function drawSettings() {
  ctx.fillStyle = '#0d0d16'; ctx.fillRect(0, 0, W, H);
  appHeader('Settings');

  let ry = STATUS_H + 44;
  for (const row of SETTING_ROWS) {
    ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(0, ry, W, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(0, ry + 35, W, 1);

    ctx.font = '9px monospace'; ctx.fillStyle = '#eee';
    ctx.fillText(row.label, 14, ry + 14);
    ctx.font = '7px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(row.sub, 14, ry + 27);

    const on = settings[row.key];
    const tx = W - 46, ty = ry + 10;
    ctx.fillStyle = on ? '#3c8c4a' : '#2a2a3a';
    roundRect(tx, ty, 32, 16, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.arc(on ? tx + 24 : tx + 8, ty + 8, 6, 0, Math.PI*2); ctx.fill();

    ry += 38;
  }

  if (flags.has('receipts_off')) {
    ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,80,80,0.55)';
    ctx.fillText('Morgan noticed your read receipts are off', W/2, ry + 14);
    ctx.textAlign = 'left';
  }
}

// ── Shared header ──────────────────────────────────────────────────
function appHeader(title) {
  ctx.fillStyle = 'rgba(12,12,22,0.97)';
  ctx.fillRect(0, STATUS_H, W, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, STATUS_H + 31, W, 1);
  ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(title, W/2, STATUS_H + 21);
  ctx.textAlign = 'left';
}

// ── Utilities ──────────────────────────────────────────────────────
function wrapText(text, maxW, font) {
  ctx.font = font;
  const words = text.split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function longestLine(lines, font) {
  ctx.font = font;
  return lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
}

function clockStr() {
  const now = new Date();
  return `${now.getHours()%12||12}:${String(now.getMinutes()).padStart(2,'0')} ${now.getHours()>=12?'PM':'AM'}`;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,   x+w,y+r,   r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h);   ctx.arcTo(x,  y+h,x,  y+h-r, r);
  ctx.lineTo(x,y+r);     ctx.arcTo(x,  y,  x+r,y,     r);
  ctx.closePath();
}

// ── Game loop ──────────────────────────────────────────────────────
function loop(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.1);
  lastTs = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
