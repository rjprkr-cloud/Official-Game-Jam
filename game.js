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

// ── Layout constants ───────────────────────────────────────────────
const STATUS_H = 18;
const NAV_H    = 26;
const CONTENT_Y = STATUS_H;
const CONTENT_H = H - STATUS_H - NAV_H;

// ── Screens ────────────────────────────────────────────────────────
const SCR = Object.freeze({
  LOCK: 'lock', HOME: 'home',
  MESSAGES: 'messages', THREAD: 'thread',
  SETTINGS: 'settings',
});

let screen = SCR.LOCK;

// ── Interpretation profile ─────────────────────────────────────────
// Hidden — shapes how the phone (and others) respond over time
const profile = { defensive: 0, trusting: 0, avoidant: 0 };

// ── Relationships ──────────────────────────────────────────────────
const rel = {
  morgan: { name: 'Morgan', trust: 50, tension: 0, tone: 'neutral', color: '#7c6cd6' },
  alex:   { name: 'Alex',   trust: 60, tension: 0, tone: 'warm',    color: '#c07050' },
};

// ── Settings (meta-choices with narrative weight) ──────────────────
const settings = {
  readReceipts:    true,
  doNotDisturb:    false,
  locationSharing: true,
};

// ── Story flags ────────────────────────────────────────────────────
const flags = new Set();

// ── Conversation script ────────────────────────────────────────────
// Each node: incoming message + array of choices (or null to end chain)
const SCRIPT = {

  // ── Morgan, night of ──────────────────────────────────────────
  morgan_0: {
    incoming: { text: 'hey did you get home ok last night', time: '11:42 PM' },
    choices: [
      {
        text: 'Yeah all good 👍',
        sub:  'Casual, unbothered',
        next: 'morgan_1a',
        fx:   () => { rel.morgan.trust += 5; profile.trusting++; },
      },
      {
        text: 'why are you asking',
        sub:  'Guarded',
        next: 'morgan_1b',
        fx:   () => { rel.morgan.tension += 10; profile.defensive++; },
      },
      {
        text: '(leave on read)',
        sub:  'Say nothing',
        next: 'morgan_1c',
        fx:   () => { rel.morgan.tension += 15; profile.avoidant++; },
        silent: true,
      },
    ],
  },

  morgan_1a: {
    incoming: { text: 'ok good :) you seemed off', time: '11:44 PM' },
    choices: [
      {
        text: 'I was just tired',
        sub:  'Honest but closed',
        next: 'morgan_2a',
        fx:   () => { profile.trusting++; },
      },
      {
        text: 'what do you mean "off"',
        sub:  'Pressing it',
        next: 'morgan_2b',
        fx:   () => { profile.defensive++; rel.morgan.tension += 5; },
      },
    ],
  },

  morgan_1b: {
    incoming: { text: 'just checking in lol', time: '11:44 PM' },
    choices: [
      {
        text: 'oh ok. yeah I\'m fine',
        sub:  'Downplay it',
        next: 'morgan_2a',
        fx:   () => {},
      },
      {
        text: 'you don\'t have to do that',
        sub:  'Push away',
        next: 'morgan_2c',
        fx:   () => { profile.defensive++; rel.morgan.tension += 10; },
      },
    ],
  },

  morgan_1c: {
    incoming: { text: '...ok', time: '11:58 PM' },
    choices: [
      {
        text: 'sorry fell asleep',
        sub:  'Cover it',
        next: 'morgan_2a',
        fx:   () => { profile.trusting++; },
      },
      {
        text: '(still nothing)',
        sub:  'Let it sit',
        next: 'morgan_2d',
        fx:   () => { profile.avoidant += 2; rel.morgan.tension += 20; },
        silent: true,
      },
    ],
  },

  morgan_2a: {
    incoming: { text: 'ok. sleep well', time: '11:45 PM' },
    choices: null,
    onEnd: () => flags.add('morgan_night_ok'),
  },

  morgan_2b: {
    incoming: { text: 'idk you were just quiet. nvm forget I said anything', time: '11:46 PM' },
    choices: [
      {
        text: 'no tell me',
        sub:  'Open up',
        next: 'morgan_2e',
        fx:   () => { profile.trusting++; },
      },
      {
        text: 'yeah nvm',
        sub:  'Drop it',
        next: 'morgan_2f',
        fx:   () => { profile.avoidant++; },
      },
    ],
  },

  morgan_2c: {
    incoming: { text: 'ok. noted.', time: '11:45 PM' },
    choices: null,
    onEnd: () => { flags.add('morgan_pushed_away'); rel.morgan.trust -= 10; },
  },

  morgan_2d: {
    incoming: null,
    choices: null,
    onEnd: () => { flags.add('morgan_silence'); rel.morgan.trust -= 20; },
  },

  morgan_2e: {
    incoming: { text: 'you just seemed sad. I dunno. it doesn\'t matter', time: '11:47 PM' },
    choices: [
      {
        text: 'I\'m ok. thanks for noticing',
        sub:  'Let someone in',
        next: 'morgan_end_warm',
        fx:   () => { rel.morgan.trust += 10; profile.trusting++; },
      },
      {
        text: 'I\'m fine',
        sub:  'Shut it down',
        next: 'morgan_end_flat',
        fx:   () => { profile.defensive++; },
      },
    ],
  },

  morgan_2f: {
    incoming: { text: 'ok.', time: '11:46 PM' },
    choices: null,
    onEnd: () => flags.add('morgan_night_tense'),
  },

  morgan_end_warm: {
    incoming: { text: '❤️', time: '11:48 PM' },
    choices: null,
    onEnd: () => { flags.add('morgan_connected'); rel.morgan.trust += 5; },
  },

  morgan_end_flat: {
    incoming: { text: 'ok. night', time: '11:48 PM' },
    choices: null,
    onEnd: () => flags.add('morgan_night_flat'),
  },

};

// ── Threads ────────────────────────────────────────────────────────
const threads = {
  morgan: {
    contact:    'morgan',
    messages:   [],
    unread:     0,
    scriptNode: 'morgan_0',
  },
};

// Seed first message
(function seedThread() {
  const node = SCRIPT[threads.morgan.scriptNode];
  if (node?.incoming) {
    threads.morgan.messages.push({
      from: 'them',
      text: node.incoming.text,
      time: node.incoming.time,
      read: false,
    });
    threads.morgan.unread = 1;
  }
})();

// ── Active thread state ────────────────────────────────────────────
let activeThreadKey  = null;
let choiceAnim       = 0;     // 0→1 fade-in
let choiceMade       = false;
let typingActive     = false;
let typingTimer      = 0;
let typingNextNode   = null;

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

  // Push player reply (unless silent/leave-on-read)
  if (!choice.silent) {
    t.messages.push({ from: 'me', text: choice.text, time: clockStr(), read: false });
  }

  if (choice.fx) choice.fx();
  refreshTone(activeThreadKey);

  // Advance script
  if (choice.next) {
    const nextNode = SCRIPT[choice.next];
    t.scriptNode = choice.next;
    if (nextNode?.incoming) {
      typingActive   = true;
      typingTimer    = 1.0 + Math.random() * 1.0;
      typingNextNode = choice.next;
    } else {
      // No incoming (silence or end)
      if (nextNode?.onEnd) nextNode.onEnd();
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
    t.messages.push({ from: 'them', text: node.incoming.text, time: node.incoming.time || clockStr(), read: false });
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
  if (p.avoidant  >= 3 && p.avoidant  > p.defensive && p.avoidant  > p.trusting)  r.tone = 'distant';
  else if (p.defensive >= 3 && p.defensive > p.trusting)                           r.tone = 'guarded';
  else if (p.trusting  >= 3)                                                        r.tone = 'warm';
}

// ── App grid ───────────────────────────────────────────────────────
const APP_SZ = 54;
const APP_ROWS = (function() {
  const list = [
    { id: 'messages', label: 'Messages', col: '#3c8c4a', icon: '💬' },
    { id: 'photos',   label: 'Photos',   col: '#b87020', icon: '🖼️'  },
    { id: 'notes',    label: 'Notes',    col: '#b8a020', icon: '📝'  },
    { id: 'calls',    label: 'Calls',    col: '#2878c0', icon: '📞'  },
    { id: 'settings', label: 'Settings', col: '#607080', icon: '⚙️'  },
  ];
  const cols = 4, gapX = 14, gapY = 14;
  const totalW = cols * APP_SZ + (cols - 1) * gapX;
  const startX = Math.round((W - totalW) / 2);
  const startY = STATUS_H + 24;
  return list.map((a, i) => ({
    ...a,
    x: startX + (i % cols) * (APP_SZ + gapX),
    y: startY + Math.floor(i / cols) * (APP_SZ + 18 + gapY),
  }));
})();

// ── Settings rows ──────────────────────────────────────────────────
const SETTING_ROWS = [
  { key: 'readReceipts',    label: 'Read Receipts',    sub: 'Let others see when you\'ve read their messages' },
  { key: 'doNotDisturb',    label: 'Do Not Disturb',   sub: 'Silence notifications'                          },
  { key: 'locationSharing', label: 'Location Sharing', sub: 'Share your location with contacts'              },
];

// ── Click routing ──────────────────────────────────────────────────
canvas.addEventListener('click', e => {
  const r  = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (W / r.width);
  const my = (e.clientY - r.top)  * (H / r.height);
  handleClick(mx, my);
});

function handleClick(mx, my) {
  // Bottom nav back tap
  if (screen !== SCR.LOCK && screen !== SCR.HOME && my >= H - NAV_H) {
    goBack(); return;
  }
  switch (screen) {
    case SCR.LOCK:     onClickLock(mx, my);     break;
    case SCR.HOME:     onClickHome(mx, my);     break;
    case SCR.MESSAGES: onClickMessages(mx, my); break;
    case SCR.THREAD:   onClickThread(mx, my);   break;
    case SCR.SETTINGS: onClickSettings(mx, my); break;
  }
}

function goBack() {
  if (screen === SCR.THREAD)   { screen = SCR.MESSAGES; activeThreadKey = null; }
  else                         { screen = SCR.HOME; }
}

function onClickLock()   { screen = SCR.HOME; }

function onClickHome(mx, my) {
  for (const app of APP_ROWS) {
    if (mx >= app.x && mx <= app.x + APP_SZ && my >= app.y && my <= app.y + APP_SZ + 18) {
      switch (app.id) {
        case 'messages': screen = SCR.MESSAGES; break;
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
  const bH = 28, gap = 4;
  const totalH = choices.length * (bH + gap) - gap;
  let by = H - NAV_H - totalH - 6;

  for (const c of choices) {
    if (mx >= 8 && mx <= W - 8 && my >= by && my <= by + bH) {
      submitChoice(c); return;
    }
    by += bH + gap;
  }
}

function onClickSettings(mx, my) {
  let ry = CONTENT_Y + 44;
  for (const row of SETTING_ROWS) {
    if (my >= ry && my < ry + 38) {
      settings[row.key] = !settings[row.key];
      if (row.key === 'readReceipts') {
        flags.add(settings.readReceipts ? 'receipts_on' : 'receipts_off');
      }
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

  if (screen === SCR.THREAD && !choiceMade && !typingActive) {
    choiceAnim = Math.min(1, choiceAnim + dt * 2.8);
  }

  if (typingActive) {
    typingTimer -= dt;
    if (typingTimer <= 0) deliverPending();
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
    case SCR.SETTINGS: drawSettings(); break;
  }

  if (screen !== SCR.LOCK) {
    drawStatusBar();
    drawBottomNav();
  }
}

// ── Status bar ─────────────────────────────────────────────────────
function drawStatusBar() {
  ctx.fillStyle = 'rgba(5,5,12,0.75)';
  ctx.fillRect(0, 0, W, STATUS_H);

  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ddd';
  ctx.fillText(clockStr(), 8, 13);

  ctx.textAlign = 'right';
  ctx.font = '8px monospace';
  ctx.fillStyle = '#bbb';
  let rx = W - 6;
  ctx.fillText('▮▮▮▯', rx, 13); rx -= 36;
  if (settings.doNotDisturb) { ctx.fillText('🌙', rx, 13); }
  ctx.textAlign = 'left';
}

// ── Bottom nav ─────────────────────────────────────────────────────
function drawBottomNav() {
  const y = H - NAV_H;
  ctx.fillStyle = 'rgba(8,8,16,0.92)';
  ctx.fillRect(0, y, W, NAV_H);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, y, W, 1);

  if (screen !== SCR.HOME) {
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6aacff';
    ctx.fillText('‹  back', 12, y + 17);
  }

  // Home pill
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  roundRect(W/2 - 22, y + 8, 44, 5, 3);
  ctx.fill();
}

// ── Lock screen ────────────────────────────────────────────────────
function drawLock() {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0c1520');
  g.addColorStop(1, '#17082a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Big clock
  const now = new Date();
  const hh = String(now.getHours() % 12 || 12);
  const mm = String(now.getMinutes()).padStart(2, '0');
  ctx.font = 'bold 56px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(`${hh}:${mm}`, W/2, 108);

  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`, W/2, 126);

  // Notification card
  const unread = Object.values(threads).find(t => t.unread > 0);
  if (unread) {
    const msg = unread.messages.find(m => !m.read) || unread.messages[unread.messages.length - 1];
    drawLockCard(W/2 - 140, 144, 280, rel[unread.contact]?.name || unread.contact, msg?.text || '');
  }

  ctx.font = '8px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillText('tap to unlock', W/2, H - 16);
}

function drawLockCard(x, y, w, sender, preview) {
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  roundRect(x, y, w, 52, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  roundRect(x, y, w, 52, 12);
  ctx.stroke();

  // Icon
  ctx.fillStyle = '#3c8c4a';
  roundRect(x + 10, y + 10, 30, 30, 7);
  ctx.fill();
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('💬', x + 25, y + 31);

  ctx.textAlign = 'left';
  ctx.font = 'bold 8px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(sender, x + 48, y + 22);

  ctx.font = '8px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  const p = preview.length > 36 ? preview.slice(0, 35) + '…' : preview;
  ctx.fillText(p, x + 48, y + 36);

  ctx.font = '7px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('now', x + w - 28, y + 22);
}

// ── Home screen ────────────────────────────────────────────────────
function drawHome() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0c1520');
  g.addColorStop(1, '#17082a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (const app of APP_ROWS) drawAppIcon(app);
}

function drawAppIcon(app) {
  // Icon bg
  ctx.fillStyle = app.col;
  roundRect(app.x, app.y, APP_SZ, APP_SZ, 13);
  ctx.fill();

  // Top shine
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  roundRect(app.x, app.y, APP_SZ, APP_SZ * 0.45, 13);
  ctx.fill();

  // Emoji
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(app.icon, app.x + APP_SZ/2, app.y + APP_SZ/2 + 9);

  // Unread badge
  const ub = app.id === 'messages'
    ? Object.values(threads).reduce((s, t) => s + (t.unread || 0), 0)
    : 0;
  if (ub > 0) {
    ctx.fillStyle = '#e53935';
    ctx.beginPath();
    ctx.arc(app.x + APP_SZ - 5, app.y + 5, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 7px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(String(ub), app.x + APP_SZ - 5, app.y + 8);
  }

  // Label
  ctx.font = '7px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'center';
  ctx.fillText(app.label, app.x + APP_SZ/2, app.y + APP_SZ + 13);
  ctx.textAlign = 'left';
}

// ── Messages list ──────────────────────────────────────────────────
function drawMsgList() {
  ctx.fillStyle = '#0d0d16';
  ctx.fillRect(0, 0, W, H);

  // Header bar
  ctx.fillStyle = 'rgba(12,12,22,0.97)';
  ctx.fillRect(0, STATUS_H, W, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, STATUS_H + 31, W, 1);
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText('Messages', W/2, STATUS_H + 21);
  ctx.textAlign = 'left';

  let ry = STATUS_H + 36;
  for (const [key, t] of Object.entries(threads)) {
    drawThreadRow(key, t, ry);
    ry += 56;
  }
}

function drawThreadRow(key, t, y) {
  const r   = rel[key];
  const last = t.messages[t.messages.length - 1];

  ctx.fillStyle = t.unread > 0 ? 'rgba(60,140,74,0.07)' : 'rgba(255,255,255,0.02)';
  ctx.fillRect(0, y, W, 55);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(52, y + 54, W - 52, 1);

  // Avatar circle
  ctx.fillStyle = r?.color || '#555';
  ctx.beginPath(); ctx.arc(28, y + 28, 18, 0, Math.PI * 2); ctx.fill();
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText((r?.name || key)[0].toUpperCase(), 28, y + 33);

  // Name
  ctx.textAlign = 'left';
  ctx.font = t.unread > 0 ? 'bold 9px monospace' : '9px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(r?.name || key, 54, y + 18);

  // Preview
  const prev = last
    ? (last.from === 'me' ? 'You: ' + last.text : last.text)
    : '';
  ctx.font = '8px monospace';
  ctx.fillStyle = t.unread > 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)';
  ctx.fillText(prev.length > 42 ? prev.slice(0, 41) + '…' : prev, 54, y + 34);

  // Timestamp
  if (last) {
    ctx.textAlign = 'right';
    ctx.font = '7px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText(last.time, W - 10, y + 18);
  }

  // Unread dot
  if (t.unread > 0) {
    ctx.fillStyle = '#3c8c4a';
    ctx.beginPath(); ctx.arc(W - 12, y + 34, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.textAlign = 'left';
}

// ── Thread / conversation view ─────────────────────────────────────
function drawThread() {
  if (!activeThreadKey) return;
  const t    = threads[activeThreadKey];
  const r    = rel[activeThreadKey];
  const node = t.scriptNode ? SCRIPT[t.scriptNode] : null;

  ctx.fillStyle = '#0d0d16';
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = 'rgba(12,12,22,0.97)';
  ctx.fillRect(0, STATUS_H, W, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, STATUS_H + 33, W, 1);

  // Back arrow
  ctx.font = '11px monospace';
  ctx.fillStyle = '#6aacff';
  ctx.textAlign = 'left';
  ctx.fillText('‹', 8, STATUS_H + 22);

  // Small avatar
  ctx.fillStyle = r?.color || '#555';
  ctx.beginPath(); ctx.arc(W/2, STATUS_H + 11, 9, 0, Math.PI * 2); ctx.fill();
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText((r?.name || activeThreadKey)[0].toUpperCase(), W/2, STATUS_H + 14);

  // Contact name
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(r?.name || activeThreadKey, W/2, STATUS_H + 30);

  // Tone badge
  const toneCol = { neutral:'#777', warm:'#d48050', guarded:'#8888cc', distant:'#555' };
  ctx.font = '7px monospace';
  ctx.fillStyle = toneCol[r?.tone] || '#777';
  ctx.fillText(`● ${r?.tone || 'neutral'}`, W/2 + 26, STATUS_H + 30);
  ctx.textAlign = 'left';

  // Determine area for bubbles
  const hasChoices = node?.choices && !choiceMade && !typingActive;
  const choiceH    = hasChoices ? node.choices.length * 32 + 10 : 0;
  const typingH    = typingActive ? 28 : 0;
  const bubbleBot  = H - NAV_H - choiceH - typingH - 4;
  const bubbleTop  = STATUS_H + 36;

  drawBubbles(t, bubbleTop, bubbleBot);

  if (typingActive) drawTyping(bubbleBot + 4, r);

  if (hasChoices) {
    drawChoices(node.choices, bubbleBot + typingH);
  }
}

function drawBubbles(t, top, bottom) {
  let y = bottom - 2;
  for (let i = t.messages.length - 1; i >= 0; i--) {
    const msg   = t.messages[i];
    const isMe  = msg.from === 'me';
    const maxBW = 230;
    const padX  = 9, padY = 7;
    const lines = wrapText(msg.text, maxBW - padX * 2, '8px monospace');
    const bH    = lines.length * 12 + padY * 2;
    const bW    = Math.min(maxBW, Math.ceil(longestLine(lines, '8px monospace')) + padX * 2 + 4);

    y -= bH + 7;
    if (y + bH < top) break;

    const bX = isMe ? W - bW - 10 : 10;

    // Tail nub
    ctx.fillStyle = isMe ? '#1d5fa8' : '#252535';
    if (isMe) {
      ctx.beginPath();
      ctx.moveTo(bX + bW, y + bH - 10);
      ctx.lineTo(bX + bW + 6, y + bH - 4);
      ctx.lineTo(bX + bW - 4, y + bH - 4);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(bX, y + bH - 10);
      ctx.lineTo(bX - 6, y + bH - 4);
      ctx.lineTo(bX + 4, y + bH - 4);
      ctx.fill();
    }

    // Bubble body
    ctx.fillStyle = isMe ? '#1d5fa8' : '#252535';
    roundRect(bX, y, bW, bH, 10);
    ctx.fill();

    // Text
    ctx.font = '8px monospace';
    ctx.fillStyle = '#f0f0f0';
    ctx.textAlign = 'left';
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], bX + padX, y + padY + 10 + li * 12);
    }

    // Read receipt on last outgoing message
    if (isMe && i === t.messages.length - 1) {
      ctx.font = '6px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'right';
      ctx.fillText(settings.readReceipts ? 'Read' : 'Delivered', W - 10, y + bH + 8);
    }

    // Timestamp on first message in a group (simplification: every other 3)
    if (i === 0 || i % 4 === 0) {
      ctx.font = '6px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.textAlign = 'center';
      ctx.fillText(msg.time, W/2, y - 2);
    }

    ctx.textAlign = 'left';
  }
}

function drawTyping(y, r) {
  const phase = (totalTime * 2.8) % 3;
  ctx.fillStyle = '#252535';
  roundRect(12, y + 2, 46, 20, 10);
  ctx.fill();
  for (let d = 0; d < 3; d++) {
    const a = Math.floor(phase) === d ? 1 : 0.25;
    ctx.fillStyle = `rgba(200,200,210,${a})`;
    ctx.beginPath(); ctx.arc(24 + d * 11, y + 12, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawChoices(choices, startY) {
  const bH = 28, gap = 4;
  ctx.globalAlpha = choiceAnim;
  let by = startY + 4;

  for (const c of choices) {
    const isSilent = !!c.silent;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(9, by + 2, W - 18, bH, 7);
    ctx.fill();
    // Body
    ctx.fillStyle = isSilent ? 'rgba(45,45,55,0.92)' : 'rgba(22,70,140,0.92)';
    roundRect(8, by, W - 16, bH, 7);
    ctx.fill();
    // Border
    ctx.strokeStyle = isSilent ? 'rgba(130,130,150,0.35)' : 'rgba(80,140,255,0.45)';
    ctx.lineWidth = 1;
    roundRect(8, by, W - 16, bH, 7);
    ctx.stroke();
    // Label
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = isSilent ? 'rgba(255,255,255,0.55)' : '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(c.text, 18, by + 11);
    // Subtext (interpretation hint)
    if (c.sub) {
      ctx.font = '7px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.fillText(c.sub, 18, by + 22);
    }
    by += bH + gap;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ── Settings ───────────────────────────────────────────────────────
function drawSettings() {
  ctx.fillStyle = '#0d0d16';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(12,12,22,0.97)';
  ctx.fillRect(0, STATUS_H, W, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, STATUS_H + 31, W, 1);
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText('Settings', W/2, STATUS_H + 21);
  ctx.textAlign = 'left';

  let ry = STATUS_H + 44;
  for (const row of SETTING_ROWS) {
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, ry, W, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, ry + 35, W, 1);

    ctx.font = '9px monospace';
    ctx.fillStyle = '#eee';
    ctx.fillText(row.label, 14, ry + 14);
    ctx.font = '7px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fillText(row.sub, 14, ry + 27);

    // Toggle
    const on = settings[row.key];
    const tx = W - 46, ty = ry + 10;
    ctx.fillStyle = on ? '#3c8c4a' : '#333';
    roundRect(tx, ty, 32, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(on ? tx + 24 : tx + 8, ty + 8, 6, 0, Math.PI * 2);
    ctx.fill();

    ry += 38;
  }

  // Consequence hints
  if (flags.has('receipts_off')) {
    ctx.font = '7px monospace';
    ctx.fillStyle = 'rgba(255,100,100,0.65)';
    ctx.textAlign = 'center';
    ctx.fillText('Morgan has noticed your read receipts are off.', W/2, ry + 14);
    ctx.textAlign = 'left';
  }
}

// ── Text utilities ─────────────────────────────────────────────────
function wrapText(text, maxW, font) {
  ctx.font = font;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line); line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function longestLine(lines, font) {
  ctx.font = font;
  return lines.reduce((mx, l) => Math.max(mx, ctx.measureText(l).width), 0);
}

// ── Misc helpers ───────────────────────────────────────────────────
function clockStr() {
  const now = new Date();
  const h   = String(now.getHours() % 12 || 12);
  const m   = String(now.getMinutes()).padStart(2, '0');
  const ap  = now.getHours() >= 12 ? 'PM' : 'AM';
  return `${h}:${m} ${ap}`;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x+w, y,   x+w, y+r,   r);
  ctx.lineTo(x + w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x + r, y+h);   ctx.arcTo(x,   y+h, x,   y+h-r, r);
  ctx.lineTo(x, y+r);       ctx.arcTo(x,   y,   x+r, y,     r);
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
