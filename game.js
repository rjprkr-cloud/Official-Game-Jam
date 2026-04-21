'use strict';
// ═══════════════════════════════════════════════════════════════════
//  READ RECEIPTS  —  Ordinary Game Jam #1
//  A narrative game played entirely on a simulated smartphone.
// ═══════════════════════════════════════════════════════════════════

const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
canvas.width  = 270;
canvas.height = 480;
const W = canvas.width, H = canvas.height;
ctx.imageSmoothingEnabled = false;

// ── Contact photo sprite sheet ────────────────────────────────────
// contacts.jpg is a 3×3 grid: Morgan/Alex/Riley · Casey/Taylor/Quinn · Drew/Jordan/Sam
const CONTACTS_GRID = {
  morgan:[0,0], alex:[1,0], riley:[2,0],
  casey:[0,1],  taylor:[1,1], quinn:[2,1],
  drew:[0,2],   jordan:[1,2], sam:[2,2],
};
const contactsImg = new Image();
contactsImg.src = 'contacts.jpg';

function drawContactPhoto(key, cx, cy, radius) {
  const pos = CONTACTS_GRID[key];
  const r   = rel[key];
  if (pos && contactsImg.complete && contactsImg.naturalWidth) {
    const cw = contactsImg.naturalWidth  / 3;
    const ch = contactsImg.naturalHeight / 3;
    const [col, row] = pos;
    const cropH    = ch * 0.83;           // skip bottom ~17% where name labels are
    const cropSize = Math.min(cw, cropH);
    const sx = col * cw + (cw - cropSize) / 2;
    const sy = row * ch;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(contactsImg, sx, sy, cropSize, cropSize,
                  cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  } else {
    // Fallback: coloured initial circle
    ctx.fillStyle = r?.color || '#555';
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
    const fs = Math.max(6, Math.round(radius * 0.75));
    ctx.font = `bold ${fs}px Arial Narrow, Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText((r?.name || key)[0].toUpperCase(), cx, cy + Math.round(fs * 0.35));
    ctx.textAlign = 'left';
  }
}

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

const LOBBY_URL = 'https://callumhyoung.github.io/gamejam-lobby/';
function returnToLobby() {
  const target = portal.ref || LOBBY_URL;
  if (typeof Portal !== 'undefined') Portal.sendPlayerThroughPortal(target, portal);
  else window.location.href = target;
}

// ── Power button ───────────────────────────────────────────────────
// Physical side button on the right edge of the phone — returns to lobby.
const PWR = { x:265, y:160, w:5, h:26 };   // logical canvas coordinates

// ── Layout ─────────────────────────────────────────────────────────
const STATUS_H  = 20;
const NAV_H     = 30;
const CONTENT_Y = STATUS_H;

// ── Screens ────────────────────────────────────────────────────────
const SCR = Object.freeze({
  LOCK:'lock', HOME:'home',
  MESSAGES:'messages', THREAD:'thread',
  NOTES:'notes', PHOTOS:'photos',
  CALLS:'calls', SETTINGS:'settings',
  MUSIC:'music', END:'end',
});
let screen = SCR.LOCK;

// ── Story phases ───────────────────────────────────────────────────
const PHASE = Object.freeze({ NIGHT:0, MORNING:1, AFTERNOON:2, EVENING:3, LATE:4 });
let timePhase      = PHASE.NIGHT;
let phaseTimer     = -1;
let afternoonTimer = -1;
let eveningTimer   = -1;
let lateTimer      = -1;
let phaseStartTime = 0;

// ── Interpretation profile ─────────────────────────────────────────
const profile = { defensive:0, trusting:0, avoidant:0 };

// ── Relationships ──────────────────────────────────────────────────
const rel = {
  morgan:  { name:'Morgan',  trust:50, tension:0,  tone:'worried',  color:'#7c6cd6' },
  alex:    { name:'Alex',    trust:55, tension:0,  tone:'neutral',  color:'#c07050' },
  riley:   { name:'Riley',   trust:45, tension:0,  tone:'guarded',  color:'#4a9c7a' },
  jordan:  { name:'Jordan',  trust:40, tension:0,  tone:'breezy',   color:'#c08020' },
  casey:   { name:'Casey',   trust:50, tension:5,  tone:'worried',  color:'#9060c8' },
  sam:     { name:'Sam',     trust:35, tension:25, tone:'hostile',  color:'#c04040' },
  taylor:  { name:'Taylor',  trust:60, tension:0,  tone:'neutral',  color:'#3a9aaa' },
  drew:    { name:'Drew',    trust:55, tension:0,  tone:'careful',  color:'#4878b0' },
  quinn:   { name:'Quinn',   trust:45, tension:0,  tone:'blunt',    color:'#b07848' },
  unknown: { name:'???',     trust:30, tension:0,  tone:'unknown',  color:'#707080' },
};

// ── Settings ───────────────────────────────────────────────────────
const settings = { readReceipts:true, doNotDisturb:false, locationSharing:true };

// ── Flags ──────────────────────────────────────────────────────────
const flags = new Set();

// ── Notification toast ─────────────────────────────────────────────
let notifToast = null;
function pushNotif(sender, text) {
  if (settings.doNotDisturb) return;
  notifToast = { sender, text, timer:3.5 };
}

// ── Notes ──────────────────────────────────────────────────────────
// recovered = shown with corrupted styling
const notes = [
  { time:'11:59 PM', body:"jordan's being jordan. riley looks stressed. been here an hour.\n[47 chars deleted]" },
  { time:'3:14 AM',  body:"ne ed to re mem ber to ap olo gize for\n[corrupted — partial recovery only]", recovered:true },
];

// ── Photos ─────────────────────────────────────────────────────────
let photoZoom = false;

// ── Voicemail ──────────────────────────────────────────────────────
const voicemails = [
  {
    from:'morgan', name:'Morgan', time:'1:22 AM', duration:'0:18',
    listened:false,
    transcript:"hey. it's me. I don't know where you went. you seemed like a lot and I just — I wanted to make sure you got home ok. call me back or text me when you wake up. please.",
  },
  {
    from:'riley', name:'Riley', time:'2:47 AM', duration:'0:09',
    listened:false,
    transcript:"hey. just. tonight was a lot and yeah. we can talk about it later. hope you got home.",
  },
];
let callsVoicemailOpen = false;

// ── Music ──────────────────────────────────────────────────────────
const TRACKS = [
  { title:'Sunlit Strum',            file:'music/Sunlit Strum.mp3',            col:'#c8a030' },
  { title:'Arcade Corsage',          file:'music/Arcade Corsage.mp3',          col:'#c040a0' },
  { title:'Arcade Corsage 2',        file:'music/Arcade Corsage 2.mp3',        col:'#a020c0' },
  { title:'Brass Subwave',           file:'music/Brass Subwave.mp3',           col:'#c06820' },
  { title:'Tin-Kiss Harmony',        file:'music/Tin-Kiss Harmony.mp3',        col:'#30a080' },
  { title:'Valve Fireworks',         file:'music/Valve Fireworks.mp3',         col:'#c03040' },
  { title:'Neon Overdrive',          file:'music/Neon Overdrive.mp3',          col:'#3060e0' },
  { title:'Midnight Loop in Tokyo',  file:'music/Midnight Loop in Tokyo.mp3',  col:'#6040c0' },
  { title:'Paper Cup Afternoon',     file:'music/Paper Cup Afternoon.mp3',     col:'#70a030' },
  { title:'Quest Start',             file:'music/Quest Start.mp3',             col:'#3090c0' },
  { title:'Rain On Glass',           file:'music/Rain On Glass.mp3',           col:'#4878b0' },
];

const musicState = { idx:-1, playing:false, audio:null, view:'list', volume:0.75, volDragging:false };

function musicPlay(idx) {
  if (musicState.audio) { musicState.audio.pause(); musicState.audio.src=''; }
  musicState.idx = idx;
  const audio = new Audio(TRACKS[idx].file);
  audio.volume = musicState.volume;
  audio.addEventListener('ended', ()=>musicPlay((idx+1)%TRACKS.length));
  audio.play().catch(()=>{});
  musicState.audio   = audio;
  musicState.playing = true;
  musicState.view    = 'player';
}
function musicToggle() {
  if (!musicState.audio) return;
  if (musicState.playing) { musicState.audio.pause(); musicState.playing=false; }
  else { musicState.audio.play().catch(()=>{}); musicState.playing=true; }
}
function musicSkip(dir) {
  if (musicState.idx<0) return;
  musicPlay((musicState.idx+dir+TRACKS.length)%TRACKS.length);
}
function fmtTime(s) {
  if (!s||isNaN(s)) return '0:00';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

// ── Call-back overlay ──────────────────────────────────────────────
let callBack = {
  active: false,
  state: 'idle',   // 'calling' | 'connected' | 'ended'
  timer: 0,
  lineTimer: 0,
  lineIdx: 0,
  lines: [],
};
const CALLOUT_DELAY = 1.6;   // seconds before answer
const LINE_DELAY    = 1.4;   // seconds between transcript lines

// Call log entries — evidence of last night
const callLog = [
  { type:'outgoing', name:'Casey',  time:'1:15 AM',  key:'casey',   note:'no answer' },
  { type:'missed',   name:'Morgan', time:'1:22 AM',  key:'morgan' },
  { type:'outgoing', name:'Jordan', time:'1:14 AM',  key:'jordan' },
  { type:'outgoing', name:'Jordan', time:'1:17 AM',  key:'jordan',  note:'no answer' },
  { type:'incoming', name:'Riley',  time:'2:47 AM',  key:'riley'  },
  { type:'missed',   name:'Sam',    time:'2:33 AM',  key:'sam' },
  { type:'outgoing', name:'???',    time:'3:22 AM',  key:'unknown' },
  { type:'outgoing', name:'Alex',   time:'9:22 AM',  key:'alex'   },
];

// ── Conversation script ────────────────────────────────────────────
// Premise: you blacked out at Riley's party last night. You woke up and
// you don't remember anything after about midnight. Your phone does though.
const SCRIPT = {

  // ── Morgan — morning opener ───────────────────────────────────
  morgan_0: {
    incoming: { text:'hey. how are you feeling this morning', time:'9:02 AM' },
    choices: [
      { text:'rough. I don\'t remember much of last night', next:'mo_1a', fx:()=>{ profile.trusting++;  flags.add('admitted_blackout'); flags.add('admitted_to_morgan'); } },
      { text:'I\'m fine. why',                              next:'mo_1b', fx:()=>{ profile.defensive++; } },
      { text:'still processing honestly',                   next:'mo_1c', fx:()=>{ profile.trusting++;  } },
      { text:'(leave on read)',       silent:true,           next:'mo_1d', fx:()=>{ profile.avoidant++;  rel.morgan.tension+=15; } },
    ],
  },
  mo_1a: { // admitted blackout
    incoming: { text:'yeah. I figured. there\'s some stuff we should probably talk about at some point', time:'9:04 AM' },
    choices: [
      { text:'what stuff',   next:'mo_2_truth', fx:()=>{ profile.trusting++; } },
      { text:'not yet. I\'m still piecing it together', next:'mo_2_wait', fx:()=>{} },
    ],
  },
  mo_1b: { // defensive
    incoming: { text:'just checking. you seemed like a lot last night', time:'9:04 AM' },
    choices: [
      { text:'I was having fun',                       next:'mo_2_cover', fx:()=>{ profile.defensive++; } },
      { text:'ok yeah. I don\'t actually remember it', next:'mo_2_truth', fx:()=>{ profile.trusting++; flags.add('admitted_blackout'); flags.add('admitted_to_morgan'); } },
    ],
  },
  mo_1c: { // still processing
    incoming: { text:'take your time. I\'m here', time:'9:04 AM' },
    choices: [
      { text:'did I do anything bad',  next:'mo_2_probe', fx:()=>{} },
      { text:'ok thanks',              next:'mo_2_deflect', fx:()=>{} },
    ],
  },
  mo_1d: { // on read
    incoming: { text:'ok.', time:'9:28 AM' },
    choices: [
      { text:'sorry. rough morning',    next:'mo_1a', fx:()=>{ profile.trusting++; } },
      { text:'(still nothing)',silent:true, next:'mo_1d_end', fx:()=>{ profile.avoidant+=2; rel.morgan.tension+=20; rel.morgan.trust-=10; } },
    ],
  },
  mo_1d_end: { incoming:null, choices:null, onEnd:()=>{ flags.add('morgan_silence_am'); rel.morgan.trust-=10; queueMorning(); } },
  mo_2_truth: {
    incoming: { text:'you texted me some things last night. I wasn\'t sure if you meant them or if it was just the alcohol talking', time:'9:06 AM' },
    choices: [
      { text:'what did I say',                next:'mo_3_reveal',  fx:()=>{ profile.trusting++;  } },
      { text:'I\'m sorry. you can ignore it', next:'mo_3_dismiss', fx:()=>{ profile.defensive++; rel.morgan.trust-=8; } },
      { text:'...I think I meant it',         next:'mo_3_own',     fx:()=>{ profile.trusting+=2; rel.morgan.trust+=10; flags.add('admitted_drunk_texts'); } },
    ],
  },
  mo_2_cover: { incoming:{ text:'ok.', time:'9:05 AM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_am_closed'); queueMorning(); } },
  mo_2_wait: { incoming:{ text:'ok. I\'ll be here', time:'9:05 AM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_am_deferred'); queueMorning(); } },
  mo_2_probe: {
    incoming: { text:'define "bad"', time:'9:05 AM' },
    choices: [
      { text:'like. anything I should apologize for', next:'mo_2b_probe2', fx:()=>{ profile.trusting++; } },
      { text:'forget it. I\'m fine',                  next:'mo_2_cover',   fx:()=>{ profile.defensive++; } },
    ],
  },
  mo_2b_probe2: {
    incoming: { text:'I mean. I don\'t think you meant any harm', time:'9:06 AM' },
    choices: [
      { text:'but something happened', next:'mo_2_truth',   fx:()=>{ profile.trusting++; } },
      { text:'ok. that\'s something',  next:'mo_2_deflect', fx:()=>{} },
    ],
  },
  mo_2_deflect: { incoming:{ text:'text me later if you want to talk', time:'9:06 AM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_am_deflected'); queueMorning(); } },
  mo_3_reveal: {
    incoming: { text:'you said I was the realest person you know. and then an hour later you told everyone I\'d been lying to you about something.', time:'9:07 AM' },
    choices: [
      { text:'...what did I say you lied about',     next:'mo_4_lie',    fx:()=>{ profile.trusting++;  flags.add('morgan_confrontation_known'); } },
      { text:'I don\'t remember saying that',        next:'mo_4_blank',  fx:()=>{ profile.trusting++;  flags.add('admitted_blackout'); } },
      { text:'I meant the first part',               next:'mo_4a',       fx:()=>{ profile.trusting++;  } },
      { text:'I was drunk. I wasn\'t thinking',      next:'mo_3_dismiss', fx:()=>{ profile.defensive++; } },
    ],
  },
  mo_4_lie: {
    incoming: { text:'that I\'d been acting like things were fine between us when they weren\'t. in front of everyone.', time:'9:08 AM' },
    choices: [
      { text:'...was I wrong',                           next:'mo_4c_lie2',  fx:()=>{ profile.trusting+=2; flags.add('morgan_confrontation_known'); } },
      { text:'I shouldn\'t have done it like that',      next:'mo_end_warm', fx:()=>{ profile.trusting++;  rel.morgan.trust+=8; flags.add('morgan_lie_addressed'); } },
      { text:'I was drunk. I didn\'t mean to hurt you',  next:'mo_3_dismiss', fx:()=>{ profile.defensive++; } },
    ],
  },
  mo_4c_lie2: {
    incoming: { text:'no. you weren\'t wrong. that\'s the part I\'ve been sitting with all morning.', time:'9:09 AM' },
    choices: [
      { text:'I meant it. I\'m sorry for how it came out', next:'mo_end_warm', fx:()=>{ profile.trusting++; rel.morgan.trust+=10; flags.add('morgan_connection_started'); flags.add('morgan_lie_addressed'); } },
      { text:'ok. I\'m glad you heard it',                 next:'mo_end_warm', fx:()=>{ rel.morgan.trust+=6; flags.add('morgan_lie_addressed'); } },
    ],
  },
  mo_4_blank: {
    incoming: { text:'you said I\'d been pretending things were normal between us. I think you meant it.', time:'9:08 AM' },
    choices: [
      { text:'was I right',                 next:'mo_4c_lie2',  fx:()=>{ profile.trusting++; } },
      { text:'I\'m sorry. about all of it', next:'mo_end_warm', fx:()=>{ rel.morgan.trust+=6; } },
    ],
  },
  mo_3_dismiss: { incoming:{ text:'ok.', time:'9:07 AM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_hurt'); rel.morgan.trust-=10; rel.morgan.tension+=10; queueMorning(); } },
  mo_3_own: { incoming:{ text:'ok. I think we should probably talk for real at some point then', time:'9:07 AM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_connection_started'); rel.morgan.trust+=5; queueMorning(); } },
  mo_4a: {
    incoming: { text:'I didn\'t know what to do with it honestly. it was a lot.', time:'9:08 AM' },
    choices: [
      { text:'I know. I\'m sorry.',              next:'mo_end_warm',   fx:()=>{ rel.morgan.trust+=8; profile.trusting++; } },
      { text:'I was drunk. it doesn\'t mean anything', next:'mo_3_dismiss', fx:()=>{ profile.defensive++; } },
    ],
  },
  mo_4b: { incoming:{ text:'it\'s ok. just. maybe we talk when things are less weird', time:'9:08 AM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_am_awkward'); queueMorning(); } },
  mo_4c: { incoming:{ text:'ok then. yeah.', time:'9:08 AM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_connection_started'); rel.morgan.trust+=8; queueMorning(); } },
  mo_end_warm: { incoming:{ text:'I know you are.', time:'9:09 AM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_connection_started'); rel.morgan.trust+=5; queueMorning(); } },

  // ── Morgan — afternoon ────────────────────────────────────────
  morgan_aft: {
    incoming: { text:'hey. is now an ok time to talk', time:'2:34 PM' },
    choices: [
      { text:'yeah. what\'s up',        next:'maft_1a', fx:()=>{ profile.trusting++; } },
      { text:'what about',              next:'maft_1a', fx:()=>{} },
      { text:'not really',              next:'maft_hold', fx:()=>{ profile.avoidant++; } },
      { text:'(seen)',silent:true,      next:'maft_silence', fx:()=>{ profile.avoidant++; rel.morgan.tension+=10; } },
    ],
  },
  maft_hold: { incoming:{ text:'ok. I\'m around if that changes.', time:'2:35 PM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_aft_neutral'); } },
  maft_silence: { incoming:{ text:'ok.', time:'2:50 PM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_aft_ignored'); rel.morgan.trust-=8; } },
  maft_1a: {
    incoming: { text:'I\'ve been going back and forth about what you said last night. in front of everyone. I know we touched on it this morning but I keep coming back to it.', time:'2:35 PM' },
    choices: [
      { text:'what do you keep landing on',         next:'maft_2_land',  fx:()=>{ profile.trusting++; } },
      { text:'I\'m sorry it happened like that',    next:'maft_2_apol',  fx:()=>{ profile.trusting++; rel.morgan.trust+=5; } },
      { text:'what do you want me to say',          next:'maft_2_push',  fx:()=>{ profile.defensive++; } },
    ],
  },
  maft_2_land: {
    incoming: { text:'that you weren\'t wrong. that\'s the part I can\'t shake. you said something true in the worst possible way and now I have to figure out what to do with that.', time:'2:36 PM' },
    choices: [
      { text:'what do you want to do with it',          next:'maft_3_open',  fx:()=>{ profile.trusting++; rel.morgan.trust+=5; } },
      { text:'I\'m sorry I put you in that position',   next:'maft_3_sorry', fx:()=>{ profile.trusting++; rel.morgan.trust+=8; flags.add('morgan_lie_addressed'); } },
    ],
  },
  maft_2_apol: { incoming:{ text:'I know. it still landed. I\'m not sure I would\'ve heard it any other way though, honestly.', time:'2:36 PM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_aft_neutral'); rel.morgan.trust+=5; flags.add('morgan_lie_addressed'); } },
  maft_2_push: { incoming:{ text:'nothing. I just wanted to tell you I\'m still thinking about it.', time:'2:36 PM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_aft_neutral'); } },
  maft_3_open: { incoming:{ text:'I don\'t know yet. somewhere better than where we were, maybe.', time:'2:37 PM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_aft_honest'); rel.morgan.trust+=8; flags.add('morgan_lie_addressed'); } },
  maft_3_sorry: { incoming:{ text:'I know. that actually helps more than I expected.', time:'2:37 PM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_aft_honest'); rel.morgan.trust+=5; flags.add('morgan_lie_addressed'); } },

  // ── Morgan — evening (truth path) ────────────────────────────
  morgan_eve: {
    incoming: { text:'can I be honest with you about something', time:'7:28 PM' },
    choices: [
      { text:'yeah of course',     next:'meve_1a',      fx:()=>{ profile.trusting++;  } },
      { text:'...ok',              next:'meve_1a',      fx:()=>{} },
      { text:'not tonight',        next:'meve_defer',   fx:()=>{ profile.avoidant++; } },
      { text:'(seen)',silent:true, next:'meve_ignore',  fx:()=>{ profile.avoidant+=2; rel.morgan.tension+=15; } },
    ],
  },
  meve_defer:  { incoming:{ text:'ok. whenever you\'re ready.', time:'7:29 PM' }, choices:null, onEnd:()=>{} },
  meve_ignore: { incoming:null, choices:null, onEnd:()=>{ rel.morgan.trust-=10; flags.add('eve_silence'); } },
  meve_1a: {
    incoming: { text:'when you were talking to me last night — the things you said — I don\'t think you know how much I actually felt that too', time:'7:30 PM' },
    choices: [
      { text:'...are you serious',          next:'meve_2a', fx:()=>{ profile.trusting++;  rel.morgan.trust+=10; } },
      { text:'I was drunk. you don\'t have to say that', next:'meve_2b', fx:()=>{ profile.defensive++; } },
      { text:'(say nothing)',silent:true,   next:'meve_2c', fx:()=>{ profile.avoidant++; } },
    ],
  },
  meve_2a: {
    incoming: { text:'I\'m serious. I just didn\'t know how to say it sober.', time:'7:31 PM' },
    choices: [
      { text:'me neither. clearly.',               next:'meve_end_warm',   fx:()=>{ rel.morgan.trust+=10; flags.add('morgan_told_the_truth'); } },
      { text:'I still don\'t know what to do with that', next:'meve_end_honest', fx:()=>{ rel.morgan.trust+=6;  flags.add('morgan_told_the_truth'); } },
    ],
  },
  meve_2b: { incoming:{ text:'I know you were drunk. that doesn\'t mean it wasn\'t real.', time:'7:31 PM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_told_the_truth'); rel.morgan.trust+=5; } },
  meve_2c: { incoming:null, choices:null, onEnd:()=>{ flags.add('morgan_eve_silence'); } },
  meve_end_warm: { incoming:{ text:'same.', time:'7:32 PM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_connection'); rel.morgan.trust+=5; } },
  meve_end_honest: { incoming:{ text:'I don\'t either. but I wanted you to know.', time:'7:32 PM' }, choices:null,
    onEnd:()=>{ flags.add('morgan_connection'); rel.morgan.trust+=3; } },

  // ── Morgan — ambient ─────────────────────────────────────────
  morgan_am1: {
    incoming: { text:'also your jacket is at riley\'s btw. brown one.', time:'9:45 AM' },
    choices: [
      { text:'ugh ok thanks',      next:'mam1_a', fx:()=>{} },
      { text:'(seen)',silent:true, next:'mam1_b', fx:()=>{ profile.avoidant++; } },
    ],
  },
  mam1_a: { incoming:{ text:'it\'s safe don\'t worry', time:'9:45 AM' }, choices:null, onEnd:()=>flags.add('jacket_at_riley') },
  mam1_b: { incoming:null, choices:null, onEnd:()=>{} },

  morgan_pm1: {
    incoming: { text:'random but — I\'ve been listening to this album all day and I don\'t know if it\'s helping', time:'3:22 PM' },
    choices: [
      { text:'same energy honestly',       next:'mpm1_a', fx:()=>{ rel.morgan.trust+=4; profile.trusting++; } },
      { text:'which album',                next:'mpm1_b', fx:()=>{ rel.morgan.trust+=3; } },
      { text:'(don\'t reply)',silent:true, next:'mpm1_c', fx:()=>{ profile.avoidant++; } },
    ],
  },
  mpm1_a:    { incoming:{ text:'right? that\'s where I am.', time:'3:23 PM' }, choices:null, onEnd:()=>{} },
  mpm1_b:    { incoming:{ text:'you\'d know it. I\'ll send it to you sometime.', time:'3:23 PM' }, choices:null, onEnd:()=>{} },
  mpm1_c:    { incoming:null, choices:null, onEnd:()=>{} },

  morgan_eve_soft: {
    incoming: { text:'hey. still up?', time:'9:14 PM' },
    choices: [
      { text:'yeah',               next:'mes_a', fx:()=>{ rel.morgan.trust+=3; } },
      { text:'(seen)',silent:true, next:'mes_b', fx:()=>{ profile.avoidant++; } },
    ],
  },
  mes_a: { incoming:{ text:'ok good. just wanted to check. night.', time:'9:15 PM' }, choices:null, onEnd:()=>{} },
  mes_b: { incoming:null, choices:null, onEnd:()=>{} },

  // ── Alex — morning ────────────────────────────────────────────
  alex_0: {
    incoming: { text:'hey you ok? you were pretty gone last night lol', time:'9:18 AM' },
    choices: [
      { text:'yeah I literally don\'t remember the second half',  next:'al_1a', fx:()=>{ profile.trusting++;  flags.add('admitted_blackout'); } },
      { text:'I\'m fine. it wasn\'t that bad',                    next:'al_1b', fx:()=>{ profile.defensive++; } },
      { text:'(seen)',                           silent:true,      next:'al_1c', fx:()=>{ profile.avoidant++;  rel.alex.tension+=10; } },
    ],
  },
  al_1a: {
    incoming: { text:'yeah after like 1 it got intense. Jordan was really going for it — and I don\'t think yours were the same as what everyone else was drinking', time:'9:20 AM' },
    choices: [
      { text:'wait — mine were different?',        next:'al_2_jordan', fx:()=>{ profile.trusting++;  flags.add('jordan_stronger_shots'); flags.add('jordan_feeding_shots'); } },
      { text:'what happened exactly',              next:'al_2_what',   fx:()=>{ profile.trusting++;  } },
      { text:'yeah. Jordan\'s always like that',   next:'al_2_shrug',  fx:()=>{} },
    ],
  },
  al_1b: {
    incoming: { text:'I mean I\'m not judging but last night was kind of a lot', time:'9:20 AM' },
    choices: [
      { text:'I know. what do you remember',  next:'al_2_what',      fx:()=>{ profile.trusting++;  } },
      { text:'I\'m fine. it wasn\'t that bad', next:'al_2_riley_fine', fx:()=>{ profile.defensive++; } },
    ],
  },
  al_1c: { incoming:{ text:'ok lmk if you need anything', time:'9:31 AM' }, choices:null,
    onEnd:()=>{ flags.add('alex_ignored'); queueMorning(); } },
  al_2_jordan: {
    incoming: { text:'yeah. like multiple rounds. yours were stronger. I noticed because I had the same thing at one point and it didn\'t hit like that', time:'9:22 AM' },
    choices: [
      { text:'and nobody said anything',        next:'al_3_nobody', fx:()=>{ profile.trusting++;  } },
      { text:'I mean I could have said no',      next:'al_3_self',   fx:()=>{ profile.trusting++;  } },
      { text:'Jordan was just being Jordan',     next:'al_3_excuse', fx:()=>{ profile.defensive++; } },
    ],
  },
  al_2_what: {
    incoming: { text:'you went at Morgan pretty hard. said something about them lying. Morgan looked like they\'d been waiting for it honestly', time:'9:22 AM' },
    choices: [
      { text:'what did I say about lying',  next:'al_3_morgan', fx:()=>{ profile.trusting++; flags.add('morgan_confrontation_known'); } },
      { text:'was anyone filming it',       next:'al_3_film',   fx:()=>{ profile.trusting++; } },
    ],
  },
  al_2_riley_fine: { incoming:{ text:'I mean riley would say they\'re fine either way.', time:'9:21 AM' }, choices:null,
    onEnd:()=>{ queueMorning(); } },
  al_2_shrug: { incoming:{ text:'haha yeah. anyway just making sure you got home ok', time:'9:21 AM' }, choices:null,
    onEnd:()=>{ queueMorning(); } },
  al_3_nobody: {
    incoming: { text:'I was going to say something. I didn\'t. that\'s on me.', time:'9:24 AM' },
    choices:null, onEnd:()=>{ flags.add('alex_admits_inaction'); rel.alex.trust+=5; queueMorning(); } },
  al_3_self: { incoming:{ text:'sure. but Jordan knows when to stop. they didn\'t stop.', time:'9:24 AM' }, choices:null,
    onEnd:()=>{ flags.add('alex_blames_jordan'); queueMorning(); } },
  al_3_excuse: { incoming:{ text:'yeah. anyway. hope you feel better', time:'9:24 AM' }, choices:null,
    onEnd:()=>{ queueMorning(); } },
  al_3_morgan: {
    incoming: { text:'something about them pretending everything was fine when it wasn\'t. Morgan went quiet. everyone went quiet.', time:'9:24 AM' },
    choices: [
      { text:'how did Morgan react',       next:'al_4_morgan', fx:()=>{ profile.trusting++; } },
      { text:'was anyone filming it',      next:'al_3_film',   fx:()=>{ profile.trusting++; } },
    ],
  },
  al_3_film: {
    incoming: { text:'Jordan had their phone out yeah.', time:'9:24 AM' },
    choices: [
      { text:'Jordan was filming it?',  next:'al_4_filming', fx:()=>{ flags.add('filming_revealed'); profile.trusting++; } },
      { text:'of course Jordan was',    next:'al_4_film_ok', fx:()=>{} },
    ],
  },
  al_4_morgan: { incoming:{ text:'they didn\'t say anything. just looked at you. I don\'t know if that\'s good or bad.', time:'9:26 AM' }, choices:null,
    onEnd:()=>{ flags.add('alex_morgan_scene'); queueMorning(); } },
  al_4_filming: { incoming:{ text:'yeah. I don\'t know if they kept it.', time:'9:25 AM' }, choices:null,
    onEnd:()=>{ flags.add('filming_revealed'); queueMorning(); } },
  al_4_film_ok: { incoming:{ text:'yeah. anyway. feel better', time:'9:25 AM' }, choices:null,
    onEnd:()=>{ queueMorning(); } },

  // ── Alex — ambient ────────────────────────────────────────────
  alex_pm1: {
    incoming: { text:'ok genuine question — do you think Jordan actually feels bad or just says they do', time:'3:44 PM' },
    choices: [
      { text:'I think they feel bad',      next:'apm1_a', fx:()=>{ profile.trusting++; } },
      { text:'hard to tell with Jordan',   next:'apm1_b', fx:()=>{} },
      { text:'(seen)',       silent:true,  next:'apm1_c', fx:()=>{ profile.avoidant++; } },
    ],
  },
  apm1_a: { incoming:{ text:'yeah maybe. I hope so.', time:'3:45 PM' }, choices:null, onEnd:()=>{} },
  apm1_b: { incoming:{ text:'yeah. same.', time:'3:45 PM' }, choices:null, onEnd:()=>{} },
  apm1_c: { incoming:null, choices:null, onEnd:()=>{} },

  alex_eve1: {
    incoming: { text:'hey. you\'ve been quiet today. you doing ok?', time:'7:40 PM' },
    choices: [
      { text:'yeah just processing',   next:'aev1_a', fx:()=>{ profile.trusting++; } },
      { text:'not really',             next:'aev1_b', fx:()=>{ profile.trusting++; rel.alex.trust+=8; } },
      { text:'(seen)',  silent:true,   next:'aev1_c', fx:()=>{ profile.avoidant++; rel.alex.tension+=5; } },
    ],
  },
  aev1_a: { incoming:{ text:'yeah. makes sense. lmk if you need anything', time:'7:41 PM' }, choices:null, onEnd:()=>{} },
  aev1_b: { incoming:{ text:'yeah I figured. I\'m here if you want to talk', time:'7:41 PM' }, choices:null, onEnd:()=>flags.add('alex_available') },
  aev1_c: { incoming:null, choices:null, onEnd:()=>{} },

  // ── Riley — morning ───────────────────────────────────────────
  riley_0: {
    incoming: { text:'hey. just wanted to make sure we\'re good', time:'10:14 AM' },
    choices: [
      { text:'yeah of course. are you?',                         next:'ri_1a', fx:()=>{ profile.trusting++;  } },
      { text:'I\'m sorry about last night',                      next:'ri_1b', fx:()=>{ profile.trusting++;  rel.riley.trust+=5; } },
      { text:'I honestly don\'t remember a lot of it',           next:'ri_1c', fx:()=>{ profile.trusting++;  flags.add('admitted_blackout'); } },
      { text:'(don\'t open)',              silent:true,           next:'ri_1d', fx:()=>{ profile.avoidant++;  rel.riley.tension+=10; } },
    ],
  },
  ri_1a: {
    incoming: { text:'yeah I\'m fine. the lamp thing is nothing. I just. it got kind of intense toward the end.', time:'10:15 AM' },
    choices: [
      { text:'I know. I\'m sorry.',           next:'ri_2_check', fx:()=>{ profile.trusting++;  rel.riley.trust+=5; } },
      { text:'intense how',                   next:'ri_2_check', fx:()=>{ profile.trusting++;  } },
    ],
  },
  ri_1b: {
    incoming: { text:'don\'t worry about the lamp, seriously. I just wanted to check in.', time:'10:15 AM' },
    choices: [
      { text:'I appreciate that',   next:'ri_2_check', fx:()=>{ rel.riley.trust+=3; } },
      { text:'I\'m ok. really.',    next:'ri_2_ok',    fx:()=>{} },
    ],
  },
  ri_1c: {
    incoming: { text:'yeah. the lamp thing is nothing. but you said some real stuff last night. how are you actually doing', time:'10:15 AM' },
    choices: [
      { text:'still piecing it together', next:'ri_2_check', fx:()=>{ profile.trusting++; } },
      { text:'I\'m ok',                   next:'ri_2_ok',   fx:()=>{} },
    ],
  },
  ri_1d: { incoming:{ text:'ok. lmk if you wanna talk.', time:'10:29 AM' }, choices:null, onEnd:()=>flags.add('riley_ignored') },
  ri_2_check: {
    incoming: { text:'you said some things people needed to hear. it just came out sideways.', time:'10:17 AM' },
    choices: [
      { text:'who did I say it to',            next:'ri_3_who',    fx:()=>{ profile.trusting++; } },
      { text:'sideways is one way to put it',  next:'ri_end_warm', fx:()=>{ profile.trusting++;  rel.riley.trust+=5; } },
    ],
  },
  ri_2_ok: { incoming:{ text:'ok. you know where I am.', time:'10:16 AM' }, choices:null, onEnd:()=>{ queueMorning(); } },
  ri_3_who: {
    incoming: { text:'Morgan mostly. and Sam. I think everyone in the room heard it.', time:'10:18 AM' }, choices:null,
    onEnd:()=>{ flags.add('riley_connection'); rel.riley.trust+=5; queueMorning(); } },
  ri_end_warm: { incoming:{ text:'yeah. but you meant it. that counts for something.', time:'10:18 AM' }, choices:null,
    onEnd:()=>{ flags.add('riley_connection'); rel.riley.trust+=5; queueMorning(); } },

  // ── Riley — evening ───────────────────────────────────────────
  riley_eve: {
    incoming: { text:'hey one more thing. about last night.', time:'7:55 PM' },
    choices: [
      { text:'yeah?',               next:'reve_1a',     fx:()=>{ profile.trusting++; } },
      { text:'(seen)',silent:true,  next:'reve_silence', fx:()=>{ profile.avoidant++; } },
    ],
  },
  reve_silence: { incoming:null, choices:null, onEnd:()=>{ flags.add('riley_eve_ignored'); } },
  reve_1a: {
    incoming: { text:'you said sorry to me. like actually sorry. not just about the lamp. and I think I know what you meant but I wanted you to know I heard it.', time:'7:56 PM' },
    choices: [
      { text:'what did you think I meant', next:'reve_2a', fx:()=>{ profile.trusting++;  } },
      { text:'I\'m glad',                  next:'reve_2b', fx:()=>{ profile.trusting++;  } },
      { text:'I\'m not sure I do',         next:'reve_2c', fx:()=>{ profile.trusting++;  flags.add('admitted_blackout'); } },
    ],
  },
  reve_2a: {
    incoming: { text:'that you\'ve been kind of checked out lately. and that last night was you trying.', time:'7:58 PM' },
    choices: [
      { text:'yeah. that\'s right.',  next:'reve_end_honest', fx:()=>{ rel.riley.trust+=8; profile.trusting++;  flags.add('riley_sees_you'); } },
      { text:'maybe.',                next:'reve_end_soft',   fx:()=>{ flags.add('riley_sees_you'); } },
    ],
  },
  reve_2b: { incoming:{ text:'ok. good. that\'s all I wanted to say.', time:'7:58 PM' }, choices:null,
    onEnd:()=>{ flags.add('riley_eve_ok'); rel.riley.trust+=5; } },
  reve_2c: { incoming:{ text:'me neither. I just wanted to make sure I said it.', time:'7:58 PM' }, choices:null,
    onEnd:()=>{ flags.add('riley_eve_ok'); rel.riley.trust+=3; } },
  reve_end_honest: { incoming:{ text:'yeah. I know. I see you.', time:'7:59 PM' }, choices:null,
    onEnd:()=>{ flags.add('riley_sees_you'); rel.riley.trust+=5; } },
  reve_end_soft: { incoming:{ text:'yeah. ok.', time:'7:59 PM' }, choices:null,
    onEnd:()=>{ flags.add('riley_eve_ok'); } },

  // ── Riley — ambient ───────────────────────────────────────────
  riley_am1: {
    incoming: { text:'also you left your jacket. brown? I\'ll hold it for you', time:'9:52 AM' },
    choices: [
      { text:'yes thank you',      next:'ram1_a', fx:()=>{ rel.riley.trust+=3; } },
      { text:'(seen)',silent:true, next:'ram1_b', fx:()=>{ profile.avoidant++; } },
    ],
  },
  ram1_a: { incoming:{ text:'it\'s safe :)', time:'9:53 AM' }, choices:null, onEnd:()=>flags.add('jacket_at_riley') },
  ram1_b: { incoming:null, choices:null, onEnd:()=>{} },

  riley_pm1: {
    incoming: { text:'random but you were actually really funny last night before the whole. you know. part', time:'4:18 PM' },
    choices: [
      { text:'I\'ll take it',             next:'rp1_a', fx:()=>{ rel.riley.trust+=4; } },
      { text:'what was the "you know" part', next:'rp1_b', fx:()=>{ profile.trusting++; } },
      { text:'(don\'t reply)',silent:true, next:'rp1_c', fx:()=>{ profile.avoidant++; } },
    ],
  },
  rp1_a: { incoming:{ text:'lol. you\'re fine. just check in next time', time:'4:19 PM' }, choices:null, onEnd:()=>{} },
  rp1_b: { incoming:{ text:'the Morgan thing mostly. but that\'s not mine to say', time:'4:20 PM' }, choices:null,
    onEnd:()=>{ flags.add('riley_noticed_morgan_scene'); } },
  rp1_c: { incoming:null, choices:null, onEnd:()=>{} },

  // ── Jordan — morning ─────────────────────────────────────────
  jordan_0: {
    incoming: { text:'dude last night was actually insane hahahaha', time:'9:47 AM' },
    choices: [
      { text:'Jordan what happened last night',  next:'jo_1a', fx:()=>{ profile.trusting++;  flags.add('admitted_blackout'); } },
      { text:'define insane',                    next:'jo_1b', fx:()=>{ profile.trusting++;  } },
      { text:'yeah it was a lot',                next:'jo_1c', fx:()=>{ profile.defensive++; } },
      { text:'(ignore)',         silent:true,    next:'jo_1d', fx:()=>{ profile.avoidant++;  rel.jordan.tension+=10; } },
    ],
  },
  jo_1a: {
    incoming: { text:'you don\'t remember?? oh my god', time:'9:49 AM' },
    choices: [
      { text:'not really. what did I do',  next:'jo_2_tell',  fx:()=>{} },
      { text:'I remember most of it',      next:'jo_2_cover', fx:()=>{ profile.defensive++; } },
    ],
  },
  jo_1b: {
    incoming: { text:'you were just being you lol. it was good', time:'9:49 AM' },
    choices: [
      { text:'Jordan I need to know what actually happened', next:'jo_2_tell', fx:()=>{ profile.trusting++; } },
      { text:'ok. good.',                                   next:'jo_2_accept', fx:()=>{} },
    ],
  },
  jo_1c: {
    incoming: { text:'a lot!! in a fun way though. you were great', time:'9:49 AM' },
    choices: [
      { text:'I knocked over riley\'s lamp',  next:'jo_2_lamp', fx:()=>{ flags.add('knows_about_lamp'); } },
      { text:'I really don\'t remember',      next:'jo_2_tell', fx:()=>{ profile.trusting++;  flags.add('admitted_blackout'); } },
    ],
  },
  jo_1d: { incoming:{ text:'ok let me know how you\'re feeling lol', time:'10:04 AM' }, choices:null,
    onEnd:()=>{ flags.add('jordan_ignored'); queueMorning(); } },
  jo_2_tell: {
    incoming: { text:'I mean you were just kind of doing your thing. talking to Morgan a lot. it was cute honestly lol', time:'9:51 AM' },
    choices: [
      { text:'Jordan did you keep giving me shots', next:'jo_3_shots',  fx:()=>{ profile.trusting++;  flags.add('confronted_jordan'); } },
      { text:'what was I saying to Morgan',         next:'jo_3_morgan', fx:()=>{ profile.trusting++;  } },
      { text:'ok',                                  next:'jo_3_ok',     fx:()=>{} },
    ],
  },
  jo_2_cover: { incoming:{ text:'yeah you seemed a little hazy lol. you\'re good though', time:'9:51 AM' }, choices:null,
    onEnd:()=>{ queueMorning(); } },
  jo_2_accept: { incoming:{ text:'don\'t stress it. these things happen', time:'9:50 AM' }, choices:null,
    onEnd:()=>{ queueMorning(); } },
  jo_2_lamp: {
    incoming: { text:'the lamp! ok yes that happened. but riley said it was fine', time:'9:51 AM' },
    choices: [
      { text:'Jordan did you keep pouring me shots', next:'jo_3_shots', fx:()=>{ profile.trusting++;  flags.add('confronted_jordan'); } },
      { text:'riley was upset though',               next:'jo_3_riley', fx:()=>{} },
    ],
  },
  jo_3_shots: {
    incoming: { text:'I mean... you wanted them?? I wasn\'t forcing anything', time:'9:53 AM' },
    choices: [
      { text:'Jordan. were mine the same as everyone else\'s', next:'jo_3b_diff',     fx:()=>{ profile.trusting++;  flags.add('confronted_jordan'); } },
      { text:'Jordan.',                                         next:'jo_4_confront', fx:()=>{ profile.trusting++;  } },
      { text:'I know. forget it.',                              next:'jo_4_drop',     fx:()=>{ profile.defensive++; } },
      { text:'but you kept going after I was clearly already gone', next:'jo_4_confront', fx:()=>{ profile.trusting++;  flags.add('confronted_jordan'); } },
    ],
  },
  jo_3b_diff: {
    incoming: { text:'...they were a little stronger. I thought you\'d be fine. I misjudged.', time:'9:54 AM' },
    choices: [
      { text:'a little stronger. Jordan.',         next:'jo_4_confront', fx:()=>{ profile.trusting++; flags.add('jordan_stronger_shots'); flags.add('jordan_feeding_shots'); flags.add('confronted_jordan'); } },
      { text:'ok. at least you said it.',          next:'jo_end_honest', fx:()=>{ rel.jordan.trust+=3; flags.add('jordan_stronger_shots'); flags.add('jordan_feeding_shots'); } },
    ],
  },
  jo_3_morgan: {
    incoming: { text:'I genuinely couldn\'t hear. looked intense though haha', time:'9:53 AM' },
    choices: [
      { text:'were you filming it',  next:'jo_3_filming', fx:()=>{ profile.trusting++;  flags.add('confronted_jordan'); } },
      { text:'ok.',                  next:'jo_3_ok',      fx:()=>{} },
    ],
  },
  jo_3_ok: { incoming:{ text:'you\'re good man. just a night. happens to everyone', time:'9:53 AM' }, choices:null,
    onEnd:()=>{ queueMorning(); } },
  jo_3_riley: { incoming:{ text:'riley is ALWAYS upset. that\'s just riley. you know how they are', time:'9:52 AM' }, choices:null,
    onEnd:()=>{ queueMorning(); } },
  jo_3_filming: {
    incoming: { text:'I took like one video but I deleted it. calm down', time:'9:54 AM' },
    choices: [
      { text:'what was on it',  next:'jo_4_video', fx:()=>{ profile.trusting++;  flags.add('jordan_filming_revealed'); } },
      { text:'ok. thank you.',  next:'jo_4_drop',  fx:()=>{ flags.add('jordan_filming_revealed'); } },
    ],
  },
  jo_4_confront: {
    incoming: { text:'...ok. yeah. maybe I went a little far. I thought you were having fun.', time:'9:56 AM' },
    choices: [
      { text:'I\'m not mad. I just needed to know.',  next:'jo_end_honest', fx:()=>{ rel.jordan.trust+=5;  profile.trusting++; } },
      { text:'it\'s fine.',                           next:'jo_end_ok',     fx:()=>{} },
    ],
  },
  jo_4_drop: { incoming:{ text:'yeah. anyway. hope you feel better', time:'9:55 AM' }, choices:null,
    onEnd:()=>{ queueMorning(); } },
  jo_4_video: {
    incoming: { text:'just you and Morgan talking. you were being kind of real with her. I swear I wasn\'t being a dick about it', time:'9:56 AM' },
    choices: [
      { text:'but you filmed it.',   next:'jo_4_confront', fx:()=>{ profile.trusting++; flags.add('confronted_jordan'); } },
      { text:'ok. I believe you.',   next:'jo_end_ok',     fx:()=>{ rel.jordan.trust+=3; } },
    ],
  },
  jo_end_honest: { incoming:{ text:'yeah. I know. I\'m sorry.', time:'9:57 AM' }, choices:null,
    onEnd:()=>{ flags.add('jordan_accountable'); rel.jordan.trust+=8; queueMorning(); } },
  jo_end_ok: { incoming:{ text:'yeah. these things happen. you\'re good.', time:'9:57 AM' }, choices:null,
    onEnd:()=>{ queueMorning(); } },

  // ── Jordan — ambient ─────────────────────────────────────────
  jordan_pm1: {
    incoming: { text:'hey also I talked to riley and they\'re seriously not mad about the lamp', time:'2:11 PM' },
    choices: [
      { text:'how do you know',         next:'jpm1_a', fx:()=>{ profile.trusting++; } },
      { text:'ok thanks for checking',  next:'jpm1_b', fx:()=>{ rel.jordan.trust+=3; } },
      { text:'(seen)',     silent:true,  next:'jpm1_c', fx:()=>{ profile.avoidant++; } },
    ],
  },
  jpm1_a: { incoming:{ text:'I just texted them. they said so. so.', time:'2:12 PM' }, choices:null, onEnd:()=>{} },
  jpm1_b: { incoming:{ text:'yeah of course. we\'re good.', time:'2:12 PM' }, choices:null, onEnd:()=>{} },
  jpm1_c: { incoming:null, choices:null, onEnd:()=>{} },

  jordan_eve1: {
    incoming: { text:'ok real talk — you doing ok? like actually', time:'8:10 PM' },
    choices: [
      { text:'honestly not great',    next:'jev1_a', fx:()=>{ profile.trusting++;  rel.jordan.trust+=6; flags.add('jordan_checks_in'); } },
      { text:'I\'m fine. why',        next:'jev1_b', fx:()=>{ profile.defensive++; } },
      { text:'(seen)',  silent:true,  next:'jev1_c', fx:()=>{ profile.avoidant++; } },
    ],
  },
  jev1_a: {
    incoming: { text:'yeah. I figured. for what it\'s worth — last night wasn\'t all bad. some of it was real.', time:'8:11 PM' },
    choices: [
      { text:'which part',  next:'jev1_a2', fx:()=>{ profile.trusting++; } },
      { text:'ok.',         next:'jev1_end', fx:()=>{} },
    ],
  },
  jev1_a2: { incoming:{ text:'you and Morgan. the part before everything went sideways. that was real.', time:'8:12 PM' }, choices:null,
    onEnd:()=>{ flags.add('jordan_saw_it_too'); } },
  jev1_end: { incoming:{ text:'ok. you\'re good man.', time:'8:12 PM' }, choices:null, onEnd:()=>{} },
  jev1_b: { incoming:{ text:'no reason. just checking.', time:'8:11 PM' }, choices:null, onEnd:()=>{} },
  jev1_c: { incoming:null, choices:null, onEnd:()=>{} },

  // ── Casey — the one you spammed ───────────────────────────────────
  casey_0: {
    incoming: { text:'hey. I read all of that this morning. are you ok', time:'9:33 AM' },
    choices: [
      { text:'I\'m so sorry. I don\'t remember sending most of that', next:'ca_1a', fx:()=>{ profile.trusting++; flags.add('admitted_spam_casey'); } },
      { text:'how many messages did I send',                          next:'ca_1b', fx:()=>{ profile.trusting++;  } },
      { text:'I was having a rough night. just ignore it',           next:'ca_1c', fx:()=>{ profile.defensive++; rel.casey.trust-=5; } },
      { text:'(seen)',                           silent:true,         next:'ca_1d', fx:()=>{ profile.avoidant++;  rel.casey.tension+=15; } },
    ],
  },
  ca_1a: {
    incoming: { text:'it\'s ok. it\'s a lot but it\'s ok. I heard something happened at the party', time:'9:34 AM' },
    choices: [
      { text:'yeah. I\'m still figuring out what',  next:'ca_2_figuring', fx:()=>{ profile.trusting++; flags.add('admitted_blackout'); } },
      { text:'it wasn\'t a big deal',               next:'ca_2_dismiss',  fx:()=>{ profile.defensive++; } },
    ],
  },
  ca_1b: {
    incoming: { text:'eleven texts and a voice note. it\'s fine. what happened', time:'9:34 AM' },
    choices: [
      { text:'eleven. oh god',                next:'ca_2_figuring', fx:()=>{ profile.trusting++; flags.add('admitted_spam_casey'); } },
      { text:'did I say anything bad',        next:'ca_2_read_it',  fx:()=>{ profile.trusting++;  } },
    ],
  },
  ca_1c: {
    incoming: { text:'ok. just. you said some stuff. I\'m not going to ignore it.', time:'9:35 AM' },
    choices: [
      { text:'what did I say',        next:'ca_2_read_it', fx:()=>{ profile.trusting++; flags.add('admitted_spam_casey'); } },
      { text:'it was the alcohol',    next:'ca_2_excuse',  fx:()=>{ profile.defensive++; rel.casey.trust-=5; } },
    ],
  },
  ca_1d: { incoming:{ text:'ok. let me know when you\'re ready to talk', time:'9:48 AM' }, choices:null,
    onEnd:()=>{ flags.add('casey_ignored'); rel.casey.tension+=10; } },
  ca_2_figuring: {
    incoming: { text:'you kept saying you felt like nobody actually knew you. like the real you.', time:'9:35 AM' },
    choices: [
      { text:'I mean. I don\'t think that\'s wrong',           next:'ca_3_honest',  fx:()=>{ profile.trusting+=2; rel.casey.trust+=8;  flags.add('casey_confession_owned'); } },
      { text:'that\'s embarrassing. sorry you had to read that', next:'ca_3_deflect', fx:()=>{ profile.defensive++; } },
    ],
  },
  ca_2_read_it: {
    incoming: { text:'you said you\'ve been a bad friend. and something about standing at the edge of something', time:'9:35 AM' },
    choices: [
      { text:'I still don\'t know which way I fell', next:'ca_3_honest',  fx:()=>{ profile.trusting++; rel.casey.trust+=5; } },
      { text:'that doesn\'t sound like me',          next:'ca_3_doubt',   fx:()=>{ profile.defensive++; } },
    ],
  },
  ca_2_dismiss: { incoming:{ text:'ok.', time:'9:36 AM' }, choices:null,
    onEnd:()=>{ flags.add('casey_pushed_away'); rel.casey.trust-=8; } },
  ca_2_excuse: {
    incoming: { text:'I know you were drunk. that\'s kind of the point.', time:'9:36 AM' },
    choices: [
      { text:'...yeah. ok. what did I say',     next:'ca_2_read_it', fx:()=>{ profile.trusting++; } },
      { text:'I\'m not having this conversation', next:'ca_shut_down', fx:()=>{ profile.avoidant++; rel.casey.tension+=15; } },
    ],
  },
  ca_3_honest: {
    incoming: { text:'I know. I\'ve thought that for a while. you\'ve seemed off.', time:'9:37 AM' },
    choices: [
      { text:'why didn\'t you say anything',            next:'ca_end_warm',    fx:()=>{ profile.trusting++; rel.casey.trust+=8; flags.add('casey_real_talk'); } },
      { text:'I\'m ok. I think last night was just a lot', next:'ca_end_deflect', fx:()=>{ profile.defensive++; } },
    ],
  },
  ca_3_deflect: { incoming:{ text:'it\'s fine. don\'t worry about it.', time:'9:37 AM' }, choices:null,
    onEnd:()=>{ flags.add('casey_let_it_drop'); } },
  ca_3_doubt: { incoming:{ text:'I have screenshots if that helps.', time:'9:36 AM' }, choices:null,
    onEnd:()=>{ flags.add('casey_has_receipts'); rel.casey.trust-=3; } },
  ca_shut_down: { incoming:{ text:'ok.', time:'9:37 AM' }, choices:null,
    onEnd:()=>{ flags.add('casey_pushed_away'); rel.casey.trust-=10; rel.casey.tension+=10; } },
  ca_end_warm: {
    incoming: { text:'because you always seem fine. I didn\'t want to be the one who said you weren\'t.', time:'9:38 AM' }, choices:null,
    onEnd:()=>{ flags.add('casey_connection'); rel.casey.trust+=8; } },
  ca_end_deflect: { incoming:{ text:'ok. just text me next time instead of waiting until 1am', time:'9:38 AM' }, choices:null,
    onEnd:()=>{ rel.casey.trust+=3; } },

  casey_pm1: {
    incoming: { text:'hey. you seem like you\'re doing ok. are you actually ok', time:'4:02 PM' },
    choices: [
      { text:'honestly? not really. but I\'m working on it', next:'cpm1_a', fx:()=>{ rel.casey.trust+=5; profile.trusting++; flags.add('casey_honest_pm'); } },
      { text:'yeah I think so',                              next:'cpm1_b', fx:()=>{} },
      { text:'(seen)',              silent:true,             next:'cpm1_c', fx:()=>{ profile.avoidant++; } },
    ],
  },
  cpm1_a: { incoming:{ text:'ok. that\'s the right answer.', time:'4:03 PM' }, choices:null, onEnd:()=>{ flags.add('casey_connection'); rel.casey.trust+=5; } },
  cpm1_b: { incoming:{ text:'ok. good.', time:'4:03 PM' }, choices:null, onEnd:()=>{} },
  cpm1_c: { incoming:null, choices:null, onEnd:()=>{} },

  // ── Sam — tried to warn you ───────────────────────────────────────
  sam_0: {
    incoming: { text:'hey. did you see my call last night', time:'9:55 AM' },
    choices: [
      { text:'I missed it. what was it about',      next:'sa_1a',  fx:()=>{ profile.trusting++; } },
      { text:'I think my phone died. I\'m sorry',   next:'sa_1b',  fx:()=>{ profile.trusting++; } },
      { text:'I saw it. I couldn\'t get to it',     next:'sa_1c',  fx:()=>{ profile.trusting++; flags.add('admitted_blackout'); } },
      { text:'(ignore)',          silent:true,      next:'sa_1d',  fx:()=>{ profile.avoidant++; rel.sam.tension+=20; } },
    ],
  },
  sa_1a: {
    incoming: { text:'I saw Jordan giving you something from a separate bottle. not the same as what everyone else had. I was trying to get to you but you were across the room.', time:'9:57 AM' },
    choices: [
      { text:'wait — a different bottle',              next:'sa_2_bottle', fx:()=>{ profile.trusting++; flags.add('jordan_stronger_shots'); flags.add('jordan_feeding_shots'); flags.add('sam_saw_jordan'); } },
      { text:'you saw that and you called',            next:'sa_2_yes',    fx:()=>{ profile.trusting++; flags.add('sam_saw_jordan'); rel.sam.trust+=5; } },
      { text:'why didn\'t you just come find me',      next:'sa_2_why',    fx:()=>{ profile.trusting++; } },
    ],
  },
  sa_1b: {
    incoming: { text:'I left a voicemail. I saw Jordan handing you something that wasn\'t what everyone else was drinking and I was trying to warn you.', time:'9:57 AM' },
    choices: [
      { text:'what was it',                 next:'sa_2_bottle', fx:()=>{ profile.trusting++; flags.add('jordan_stronger_shots'); flags.add('jordan_feeding_shots'); flags.add('sam_saw_jordan'); } },
      { text:'I wish I\'d gotten it',       next:'sa_2_yes',    fx:()=>{ profile.trusting++; rel.sam.trust+=5; flags.add('sam_saw_jordan'); } },
    ],
  },
  sa_1c: {
    incoming: { text:'I left a voicemail. I saw Jordan pouring you something and it wasn\'t the same as what everyone else was having. things went sideways fast after that.', time:'9:57 AM' },
    choices: [
      { text:'that explains a lot actually',    next:'sa_2_yes',    fx:()=>{ profile.trusting++; rel.sam.trust+=8; flags.add('sam_saw_jordan'); flags.add('jordan_stronger_shots'); flags.add('jordan_feeding_shots'); } },
      { text:'do you still have the voicemail', next:'sa_2_vm',     fx:()=>{ profile.trusting++; } },
    ],
  },
  sa_1d: { incoming:{ text:'ok.', time:'10:14 AM' }, choices:null,
    onEnd:()=>{ flags.add('sam_ghosted'); rel.sam.trust-=15; rel.sam.tension+=20; } },
  sa_2_bottle: {
    incoming: { text:'I don\'t know what it was. just that it came from somewhere different. you went from fine to really not fine in like twenty minutes.', time:'9:58 AM' },
    choices: [
      { text:'I should\'ve answered',      next:'sa_2_yes',    fx:()=>{ profile.trusting++; rel.sam.trust+=8; } },
      { text:'were you the only one who noticed', next:'sa_3_others', fx:()=>{ profile.trusting++; } },
    ],
  },
  sa_2_yes: {
    incoming: { text:'yeah. I mean. it is what it is now. how are you doing this morning', time:'9:59 AM' },
    choices: [
      { text:'not great. thank you for trying',     next:'sa_3_real_talk', fx:()=>{ profile.trusting++; rel.sam.trust+=8; flags.add('sam_real_talk_started'); } },
      { text:'still piecing it together',            next:'sa_3_piece',     fx:()=>{ profile.trusting++; } },
    ],
  },
  sa_2_why: {
    incoming: { text:'I was going to. and then it was already happening. I should\'ve moved faster.', time:'9:58 AM' },
    choices: [
      { text:'it\'s not your fault',         next:'sa_2_yes',    fx:()=>{ profile.trusting++; rel.sam.trust+=5; } },
      { text:'yeah. next time just come over', next:'sa_3_real_talk', fx:()=>{ rel.sam.trust+=3; flags.add('sam_real_talk_started'); } },
    ],
  },
  sa_2_vm: {
    incoming: { text:'yeah. it\'s just me going "hey jordan is being weird can you find me." not very helpful in hindsight.', time:'9:59 AM' },
    choices: [
      { text:'no it helps. it\'s something.',      next:'sa_3_real_talk', fx:()=>{ profile.trusting++; rel.sam.trust+=8; flags.add('sam_real_talk_started'); } },
      { text:'I appreciate you trying',            next:'sa_2_yes',       fx:()=>{ profile.trusting++; rel.sam.trust+=5; } },
    ],
  },
  sa_3_others: {
    incoming: { text:'drew might\'ve. I don\'t know who else. it wasn\'t exactly subtle but everyone was into their own thing.', time:'9:59 AM' },
    choices: [
      { text:'ok. thank you for calling.',   next:'sa_3_real_talk', fx:()=>{ rel.sam.trust+=8; flags.add('sam_real_talk_started'); flags.add('sam_acknowledged'); } },
    ],
  },
  sa_3_piece: {
    incoming: { text:'yeah. take your time. I\'m around.', time:'10:00 AM' }, choices:null,
    onEnd:()=>{ flags.add('sam_acknowledged'); rel.sam.trust+=3; }
  },
  sa_3_real_talk: { incoming:{ text:'yeah. I\'m glad you\'re ok.', time:'10:00 AM' }, choices:null,
    onEnd:()=>{ flags.add('sam_real_talk_started'); flags.add('sam_acknowledged'); rel.sam.trust+=5; } },
  sa_end_soft: { incoming:{ text:'ok.', time:'10:01 AM' }, choices:null, onEnd:()=>{ rel.sam.trust+=3; } },
  sa_end_open: { incoming:{ text:'later then.', time:'10:01 AM' }, choices:null,
    onEnd:()=>{ flags.add('sam_real_talk_started'); rel.sam.trust+=5; } },

  sam_eve1: {
    incoming: { text:'hey. I don\'t want to end the day weird with you.', time:'7:15 PM' },
    choices: [
      { text:'me neither. I\'m sorry.',  next:'sev1_a', fx:()=>{ profile.trusting++; rel.sam.trust+=8; flags.add('sam_evening_peace'); } },
      { text:'yeah. same.',              next:'sev1_b', fx:()=>{ rel.sam.trust+=4;  flags.add('sam_evening_peace'); } },
      { text:'(seen)', silent:true,      next:'sev1_c', fx:()=>{ profile.avoidant++; rel.sam.tension+=10; } },
    ],
  },
  sev1_a: { incoming:{ text:'it\'s ok. we\'ll figure it out.', time:'7:16 PM' }, choices:null, onEnd:()=>{ flags.add('sam_evening_peace'); } },
  sev1_b: { incoming:{ text:'yeah.', time:'7:16 PM' }, choices:null, onEnd:()=>{ flags.add('sam_evening_peace'); } },
  sev1_c: { incoming:null, choices:null, onEnd:()=>{ rel.sam.trust-=5; } },

  // ── Taylor — the camera person ────────────────────────────────────
  taylor_0: {
    incoming: { text:'hey I have a bunch of footage from last night if you want any of it', time:'10:02 AM' },
    choices: [
      { text:'yes. I need to see what happened',       next:'ta_1a', fx:()=>{ profile.trusting++;  flags.add('asked_for_footage'); } },
      { text:'what kind of footage',                   next:'ta_1b', fx:()=>{ profile.trusting++;  } },
      { text:'I\'m a little scared to look honestly',  next:'ta_1c', fx:()=>{ profile.trusting++;  } },
      { text:'(seen)',              silent:true,        next:'ta_1d', fx:()=>{ profile.avoidant++;  rel.taylor.tension+=5; } },
    ],
  },
  ta_1a: {
    incoming: { text:'I have some really sweet stuff from early on. and then some of the later part too. including the Morgan thing.', time:'10:04 AM' },
    choices: [
      { text:'what\'s the sweet stuff',           next:'ta_2_sweet',  fx:()=>{ profile.trusting++; } },
      { text:'what did you get of the Morgan thing', next:'ta_3_after', fx:()=>{ profile.trusting++; flags.add('morgan_confrontation_known'); } },
      { text:'did Jordan have their phone out',   next:'ta_2_jordan', fx:()=>{ profile.trusting++; } },
    ],
  },
  ta_1b: {
    incoming: { text:'normal party stuff mostly. some nice early bits. some of the louder parts later. a gap in the middle.', time:'10:04 AM' },
    choices: [
      { text:'what\'s missing',    next:'ta_2_missing', fx:()=>{ profile.trusting++; flags.add('footage_gap_known'); } },
      { text:'I\'ll take what you have', next:'ta_2_sweet', fx:()=>{ flags.add('asked_for_footage'); } },
    ],
  },
  ta_1c: {
    incoming: { text:'honestly it\'s not that bad. some rough parts but a lot of it is fine. there\'s one bit that\'s kind of sweet actually.', time:'10:04 AM' },
    choices: [
      { text:'what\'s the rough part',         next:'ta_3_after', fx:()=>{ profile.trusting++; flags.add('morgan_confrontation_known'); } },
      { text:'show me the sweet part first',   next:'ta_2_sweet', fx:()=>{ profile.trusting++; } },
    ],
  },
  ta_1d: { incoming:{ text:'ok lmk', time:'10:15 AM' }, choices:null,
    onEnd:()=>{ flags.add('taylor_ignored'); } },
  ta_2_sweet: {
    incoming: { text:'there\'s a clip around 11:30 where you and Morgan are talking on the stairs and you\'re both laughing. it\'s genuinely nice.', time:'10:06 AM' },
    choices: [
      { text:'I don\'t remember that at all',  next:'ta_3_gap',   fx:()=>{ flags.add('saw_morgan_stairs_clip'); flags.add('admitted_blackout'); } },
      { text:'can you send it?',               next:'ta_3_send',  fx:()=>{ flags.add('saw_morgan_stairs_clip'); } },
      { text:'what happens after that',        next:'ta_3_after', fx:()=>{ profile.trusting++; flags.add('saw_morgan_stairs_clip'); } },
    ],
  },
  ta_2_lamp: {
    incoming: { text:'ok it\'s not as bad as it sounds. you knock into it, it goes over, you look genuinely horrified. timestamp says 1:03 AM.', time:'10:06 AM' },
    choices: [
      { text:'1:03. that fills in a gap',   next:'ta_3_timeline', fx:()=>{ profile.trusting++; flags.add('lamp_timestamp_known'); flags.add('knows_about_lamp'); } },
      { text:'was I the only one filmed',   next:'ta_3_others',   fx:()=>{ profile.trusting++; } },
    ],
  },
  ta_2_missing: {
    incoming: { text:'there\'s a 45-minute gap between 1:30 and 2:15 where I don\'t have anything. phone died or I was inside.', time:'10:07 AM' },
    choices: [
      { text:'that\'s exactly the gap I can\'t account for', next:'ta_3_gap',         fx:()=>{ flags.add('footage_gap_known'); flags.add('timeline_gap_confirmed'); profile.trusting++; } },
      { text:'do you know where I was during that',          next:'ta_3_whereabouts', fx:()=>{ profile.trusting++; } },
    ],
  },
  ta_2_jordan: {
    incoming: { text:'yeah Jordan had their phone out around the same time I did. not sure if they kept anything.', time:'10:06 AM' },
    choices: [
      { text:'what was Jordan filming',  next:'ta_3_jordan_cam', fx:()=>{ profile.trusting++; flags.add('filming_revealed'); } },
      { text:'ok. what do you have',     next:'ta_2_sweet',      fx:()=>{} },
    ],
  },
  ta_3_gap: { incoming:{ text:'yeah. I don\'t have that part. sorry.', time:'10:08 AM' }, choices:null,
    onEnd:()=>{ flags.add('footage_gap_known'); flags.add('timeline_gap_confirmed'); } },
  ta_3_send: { incoming:{ text:'sent. and I didn\'t share the other stuff with anyone. just so you know.', time:'10:07 AM' }, choices:null,
    onEnd:()=>{ flags.add('taylor_trustworthy'); rel.taylor.trust+=8; } },
  ta_3_after: {
    incoming: { text:'about half an hour later you\'re in the middle of the room saying something to Morgan. loud. I couldn\'t make out the words but everyone stopped.', time:'10:07 AM' },
    choices: [
      { text:'was Morgan saying anything back',    next:'ta_4_morgan_resp', fx:()=>{ profile.trusting++; flags.add('morgan_confrontation_known'); } },
      { text:'did you get it on video',            next:'ta_4_filmed',      fx:()=>{ profile.trusting++; } },
      { text:'that tracks unfortunately',         next:'ta_3_send',        fx:()=>{ flags.add('morgan_confrontation_known'); } },
    ],
  },
  ta_4_morgan_resp: {
    incoming: { text:'Morgan went really still. and then kind of nodded. it was strange. didn\'t look like a fight exactly.', time:'10:08 AM' },
    choices: [
      { text:'like they were expecting it',   next:'ta_4_jordan_disc', fx:()=>{ profile.trusting++; flags.add('morgan_confrontation_known'); } },
      { text:'ok. can you send what you have', next:'ta_3_send',       fx:()=>{ flags.add('taylor_trustworthy'); rel.taylor.trust+=5; } },
    ],
  },
  ta_4_filmed: {
    incoming: { text:'my phone was inside at that point. I only saw it. I\'m sorry.', time:'10:08 AM' },
    choices: [
      { text:'it\'s ok. thanks for telling me',  next:'ta_3_send', fx:()=>{ rel.taylor.trust+=5; flags.add('taylor_trustworthy'); } },
    ],
  },
  ta_3_timeline: { incoming:{ text:'yeah. the stuff before that was actually pretty chill for what it\'s worth.', time:'10:07 AM' }, choices:null,
    onEnd:()=>{ flags.add('lamp_timestamp_known'); rel.taylor.trust+=3; } },
  ta_3_others: {
    incoming: { text:'I got Riley looking stressed around 12:45. and Jordan handing you something around then too.', time:'10:08 AM' },
    choices: [
      { text:'handing me what',                     next:'ta_4_jordan_shot',  fx:()=>{ flags.add('taylor_saw_jordan_shots'); flags.add('jordan_feeding_shots'); } },
      { text:'Riley was already stressed at 12:45?', next:'ta_4_riley_early', fx:()=>{ profile.trusting++; } },
    ],
  },
  ta_3_whereabouts: { incoming:{ text:'no idea. you just kind of weren\'t around for a while.', time:'10:08 AM' }, choices:null,
    onEnd:()=>{ flags.add('timeline_gap_confirmed'); } },
  ta_3_jordan_cam: { incoming:{ text:'I don\'t know. they were filming you at some point. I assumed they\'d ask.', time:'10:07 AM' }, choices:null,
    onEnd:()=>{ flags.add('filming_revealed'); flags.add('jordan_has_footage'); } },
  ta_4_jordan_disc: { incoming:{ text:'yeah. that\'s interesting.', time:'10:09 AM' }, choices:null,
    onEnd:()=>{ flags.add('jordan_discrepancy_found'); rel.taylor.trust+=3; } },
  ta_4_jordan_shot: { incoming:{ text:'a drink. a shot glass I think. around 12:50.', time:'10:09 AM' }, choices:null,
    onEnd:()=>{ flags.add('taylor_saw_jordan_shots'); flags.add('jordan_feeding_shots'); } },
  ta_4_riley_early: { incoming:{ text:'yeah. before anything even happened. I noticed because it seemed off.', time:'10:09 AM' }, choices:null,
    onEnd:()=>{ flags.add('riley_was_stressed_early'); } },

  taylor_pm1: {
    incoming: { text:'hey — for what it\'s worth I don\'t think it was as bad as you probably think it was', time:'4:45 PM' },
    choices: [
      { text:'you might be the first person to say that', next:'tpm1_a', fx:()=>{ rel.taylor.trust+=5; } },
      { text:'how bad was it actually',                   next:'tpm1_b', fx:()=>{ profile.trusting++; } },
      { text:'(seen)',              silent:true,          next:'tpm1_c', fx:()=>{ profile.avoidant++; } },
    ],
  },
  tpm1_a: { incoming:{ text:'lol. night is long. be kind to yourself.', time:'4:46 PM' }, choices:null, onEnd:()=>{} },
  tpm1_b: { incoming:{ text:'like a 6 out of 10. people have done worse at better parties.', time:'4:46 PM' }, choices:null, onEnd:()=>{} },
  tpm1_c: { incoming:null, choices:null, onEnd:()=>{} },

  // ── Drew — left early ──────────────────────────────────────────────
  drew_0: {
    incoming: { text:'hey. heard about last night. I left around 1 so I missed the end but I was there for the beginning', time:'2:08 PM' },
    choices: [
      { text:'what did you see before you left',           next:'dr_1a', fx:()=>{ profile.trusting++; flags.add('asked_drew'); } },
      { text:'when did things start going wrong',          next:'dr_1b', fx:()=>{ profile.trusting++;  } },
      { text:'I\'m still trying to figure out what happened', next:'dr_1c', fx:()=>{ flags.add('admitted_blackout'); } },
      { text:'(seen)',                    silent:true,      next:'dr_1d', fx:()=>{ profile.avoidant++;  } },
    ],
  },
  dr_1a: {
    incoming: { text:'you were fine at 11. like genuinely fine. somewhere around midnight you hit a wall and it went fast.', time:'2:10 PM' },
    choices: [
      { text:'did you see what I was drinking',  next:'dr_2_drinks', fx:()=>{ profile.trusting++;  } },
      { text:'who was around when I hit that wall', next:'dr_2_who', fx:()=>{ profile.trusting++; } },
    ],
  },
  dr_1b: {
    incoming: { text:'maybe 12:30? I remember thinking you seemed off but I didn\'t say anything. I should have.', time:'2:10 PM' },
    choices: [
      { text:'what seemed off',              next:'dr_2_off',     fx:()=>{ profile.trusting++; } },
      { text:'it\'s not your responsibility', next:'dr_2_deflect', fx:()=>{} },
    ],
  },
  dr_1c: {
    incoming: { text:'yeah that tracks. you were already pretty far gone by the time I left.', time:'2:09 PM' },
    choices: [
      { text:'when you left, was I ok',    next:'dr_2_ok',     fx:()=>{ profile.trusting++; } },
      { text:'what do you mean far gone',  next:'dr_2_drinks', fx:()=>{ profile.trusting++; flags.add('admitted_blackout'); } },
    ],
  },
  dr_1d: { incoming:null, choices:null, onEnd:()=>{ flags.add('drew_ignored'); } },
  dr_2_drinks: {
    incoming: { text:'Jordan kept handing you things. and they weren\'t the same as what everyone else was drinking — I noticed because the bottle was different.', time:'2:12 PM' },
    choices: [
      { text:'wait — a different bottle',           next:'dr_2b_bottle', fx:()=>{ profile.trusting++; flags.add('jordan_stronger_shots'); flags.add('jordan_feeding_shots'); } },
      { text:'did Jordan know I was already drunk', next:'dr_3_jordan',  fx:()=>{ profile.trusting++; flags.add('jordan_knew'); } },
      { text:'nobody stopped it?',                  next:'dr_3_nobody',  fx:()=>{ profile.trusting++;  } },
    ],
  },
  dr_2b_bottle: {
    incoming: { text:'yeah. I don\'t know what it was. stronger, I assume. you went from fine to not fine very fast.', time:'2:13 PM' },
    choices: [
      { text:'did Jordan know what they were giving me',  next:'dr_3_jordan',  fx:()=>{ profile.trusting++; flags.add('jordan_knew'); } },
      { text:'nobody said anything',                      next:'dr_3_nobody',  fx:()=>{ profile.trusting++; } },
    ],
  },
  dr_2_who: {
    incoming: { text:'Jordan was there. you were talking to Sam earlier but I think that got tense.', time:'2:11 PM' },
    choices: [
      { text:'Sam. what did you see',  next:'dr_3_sam',    fx:()=>{ profile.trusting++; flags.add('drew_saw_sam_tension'); } },
      { text:'Jordan again. ok.',      next:'dr_3_jordan', fx:()=>{ profile.trusting++;  } },
    ],
  },
  dr_2_off: {
    incoming: { text:'you were talking louder than you thought you were. saying true things in the wrong way.', time:'2:11 PM' },
    choices: [
      { text:'yeah. that makes sense',   next:'dr_3_truth', fx:()=>{ profile.trusting++;  } },
      { text:'what kind of true things', next:'dr_3_sam',   fx:()=>{ profile.trusting++;  } },
    ],
  },
  dr_2_deflect: { incoming:{ text:'maybe not. but I still feel it a little.', time:'2:11 PM' }, choices:null, onEnd:()=>{} },
  dr_2_ok: {
    incoming: { text:'I mean. upright, yes. I don\'t know if ok is the right word.', time:'2:10 PM' },
    choices: [
      { text:'what happened between 1 and 2:30',  next:'dr_3_gap',   fx:()=>{ profile.trusting++; flags.add('timeline_gap_confirmed'); } },
      { text:'ok. that\'s something.',            next:'dr_3_truth', fx:()=>{} },
    ],
  },
  dr_3_jordan: { incoming:{ text:'I think Jordan thought it was funny. or didn\'t think. I\'m not sure which is worse.', time:'2:13 PM' }, choices:null,
    onEnd:()=>{ flags.add('jordan_knew'); flags.add('drew_saw_jordan'); } },
  dr_3_nobody: { incoming:{ text:'I was about to. then I got pulled into another conversation. I\'m sorry.', time:'2:13 PM' }, choices:null,
    onEnd:()=>{ flags.add('drew_admits_inaction'); rel.drew.trust+=5; } },
  dr_3_sam: {
    incoming: { text:'Sam was trying to get your attention and you were kind of — not there. like you heard them but didn\'t stop. Sam looked frustrated.', time:'2:13 PM' },
    choices: [
      { text:'Sam was trying to warn me about something',   next:'dr_end_sam_know', fx:()=>{ profile.trusting++; flags.add('sam_saw_jordan'); flags.add('drew_saw_sam_tension'); } },
      { text:'I didn\'t even register that',                next:'dr_end_sam',      fx:()=>{ profile.trusting++; flags.add('drew_saw_sam_tension'); } },
    ],
  },
  dr_3_truth: { incoming:{ text:'you were saying real things in a room full of people who weren\'t ready for them.', time:'2:13 PM' }, choices:null,
    onEnd:()=>{ rel.drew.trust+=5; } },
  dr_3_gap: { incoming:{ text:'I don\'t know. that\'s after I left. I\'m sorry I can\'t help more.', time:'2:13 PM' }, choices:null,
    onEnd:()=>{ flags.add('timeline_gap_confirmed'); } },
  dr_end_sam: { incoming:{ text:'yeah. that whole stretch was a lot.', time:'2:14 PM' }, choices:null,
    onEnd:()=>{ flags.add('drew_saw_sam_tension'); rel.drew.trust+=3; } },
  dr_end_sam_know: { incoming:{ text:'I don\'t know what about. but yeah. Sam definitely wanted your attention.', time:'2:14 PM' }, choices:null,
    onEnd:()=>{ flags.add('drew_saw_sam_tension'); flags.add('sam_saw_jordan'); rel.drew.trust+=5; } },

  // ── Quinn — friend-of-a-friend ────────────────────────────────────
  quinn_0: {
    incoming: { text:'hey. I don\'t think we\'ve talked much but I was at that party last night. just wanted to make sure you\'re ok', time:'3:17 PM' },
    choices: [
      { text:'yeah I remember you. what did you see?',  next:'qu_1a', fx:()=>{ profile.trusting++;  } },
      { text:'who is this?',                            next:'qu_1b', fx:()=>{} },
      { text:'honestly no. what happened out there?',   next:'qu_1c', fx:()=>{ profile.trusting++;  flags.add('admitted_blackout'); } },
      { text:'(ignore)',            silent:true,         next:'qu_1d', fx:()=>{ profile.avoidant++;  } },
    ],
  },
  qu_1a: {
    incoming: { text:'ok so. genuinely I don\'t have a stake in this. I just noticed some stuff.', time:'3:19 PM' },
    choices: [
      { text:'say it',            next:'qu_2_blunt', fx:()=>{ profile.trusting++; } },
      { text:'what kind of stuff', next:'qu_2_blunt', fx:()=>{ profile.trusting++; } },
    ],
  },
  qu_1b: {
    incoming: { text:'Quinn. I know Riley through Jamie. I was there for most of it.', time:'3:19 PM' },
    choices: [
      { text:'what did you see?',         next:'qu_2_blunt', fx:()=>{ profile.trusting++; } },
      { text:'ok. and you\'re texting because?', next:'qu_2_why', fx:()=>{} },
    ],
  },
  qu_1c: {
    incoming: { text:'ok. I\'ll just tell you then. you probably need an outside view.', time:'3:19 PM' },
    choices: [
      { text:'yeah. go ahead', next:'qu_2_blunt', fx:()=>{ profile.trusting++; } },
    ],
  },
  qu_1d: { incoming:null, choices:null, onEnd:()=>{ flags.add('quinn_ignored'); } },
  qu_2_why: {
    incoming: { text:'because everyone else there is going to tell you a version that protects themselves. I don\'t know you well enough to do that.', time:'3:20 PM' },
    choices: [
      { text:'ok. fair. tell me', next:'qu_2_blunt', fx:()=>{ profile.trusting++; } },
    ],
  },
  qu_2_blunt: {
    incoming: { text:'at some point you weren\'t just drunk. you were a completely different version of yourself. not worse necessarily. just like something broke open.', time:'3:21 PM' },
    choices: [
      { text:'what do you mean broke open',   next:'qu_3_broke',   fx:()=>{ profile.trusting++; } },
      { text:'when did you notice the shift',  next:'qu_3_shift',  fx:()=>{ profile.trusting++; } },
      { text:'was it bad',                     next:'qu_3_bad',    fx:()=>{ profile.trusting++; } },
    ],
  },
  qu_3_broke: {
    incoming: { text:'like you\'d been holding something in all night and the drinks just — opened the valve. the Morgan thing wasn\'t random. it\'d been building.', time:'3:23 PM' },
    choices: [
      { text:'could everyone tell it was building',   next:'qu_end_b', fx:()=>{ profile.trusting++; flags.add('quinn_saw_it'); } },
      { text:'yeah. it had been.',                    next:'qu_end_a', fx:()=>{ profile.trusting++; flags.add('quinn_saw_it'); flags.add('morgan_confrontation_known'); } },
    ],
  },
  qu_3_shift: {
    incoming: { text:'around 1 AM? before the really loud part. your body language changed. like you stopped caring what the room thought.', time:'3:23 PM' },
    choices: [
      { text:'and then I said something to Morgan',  next:'qu_end_a', fx:()=>{ profile.trusting++; flags.add('quinn_saw_it'); flags.add('morgan_confrontation_known'); } },
      { text:'what does that look like from outside', next:'qu_end_b', fx:()=>{ profile.trusting++; } },
    ],
  },
  qu_3_bad: {
    incoming: { text:'not exactly. honest, mostly. the kind of honest that\'s overdue and just happened at the wrong volume.', time:'3:23 PM' },
    choices: [
      { text:'the Morgan thing',             next:'qu_end_a', fx:()=>{ profile.trusting++; flags.add('quinn_saw_it'); flags.add('morgan_confrontation_known'); } },
      { text:'yeah. that\'s a good way to put it.', next:'qu_end_b', fx:()=>{ profile.trusting++; } },
    ],
  },
  qu_end_a: { incoming:{ text:'yeah. that\'s what it looked like from where I was standing.', time:'3:24 PM' }, choices:null,
    onEnd:()=>{ flags.add('quinn_saw_it'); rel.quinn.trust+=5; } },
  qu_end_b: { incoming:{ text:'like someone who stopped performing. it\'s rare, honestly. even when it\'s messy.', time:'3:24 PM' }, choices:null,
    onEnd:()=>{ flags.add('quinn_saw_it'); rel.quinn.trust+=8; } },
  qu_end_c: { incoming:{ text:'yeah. most people at parties are.', time:'3:24 PM' }, choices:null, onEnd:()=>{} },

  // ── Unknown Number ─────────────────────────────────────────────────
  unk_0: {
    incoming: { text:'hey. you don\'t have me saved. you texted me last night.', time:'11:18 PM' },
    choices: [
      { text:'I\'m sorry — who is this?',  next:'un_1a', fx:()=>{ profile.trusting++; } },
      { text:'...what did I say',           next:'un_1b', fx:()=>{ profile.trusting++;  flags.add('unknown_engaged'); } },
      { text:'(don\'t reply)', silent:true, next:'un_1c', fx:()=>{ profile.avoidant++;  flags.add('unknown_ignored'); } },
    ],
  },
  un_1a: {
    incoming: { text:'we talked for like 20 minutes at the party. I don\'t think you\'d remember.', time:'11:20 PM' },
    choices: [
      { text:'I\'m sorry. what did I say to you', next:'un_2_what', fx:()=>{ flags.add('unknown_engaged'); } },
      { text:'why are you texting now',           next:'un_2_why',  fx:()=>{ profile.trusting++;  } },
    ],
  },
  un_1b: {
    incoming: { text:'you were kind. it was a weird night and you were just kind.', time:'11:20 PM' },
    choices: [
      { text:'what did you say back',        next:'un_2_good', fx:()=>{ flags.add('unknown_was_kind'); } },
      { text:'what were we talking about',   next:'un_2_what', fx:()=>{ profile.trusting++; flags.add('unknown_engaged'); } },
    ],
  },
  un_1c: { incoming:null, choices:null, onEnd:()=>{ flags.add('unknown_ignored'); } },
  un_2_what: {
    incoming: { text:'you said you weren\'t sure if you\'d made a mess of things. then you said sorry for the mess.', time:'11:22 PM' },
    choices: [
      { text:'did I say what mess',  next:'un_3_mess', fx:()=>{ profile.trusting++; } },
      { text:'what did you say',     next:'un_2_good', fx:()=>{ flags.add('unknown_was_kind'); } },
    ],
  },
  un_2_why: {
    incoming: { text:'I don\'t know. you seemed like you needed someone to tell you it was ok. I\'m not sure it was.', time:'11:21 PM' },
    choices: [
      { text:'ok or not ok?',              next:'un_3_okornot', fx:()=>{ profile.trusting++; } },
      { text:'why are you telling me now', next:'un_3_now',     fx:()=>{ profile.trusting++; } },
    ],
  },
  un_2_good: {
    incoming: { text:'I said it seemed like you were being really honest with yourself. even if it looked like a mess from the outside.', time:'11:22 PM' },
    choices: [
      { text:'that\'s a generous way to put it', next:'un_end_warm', fx:()=>{ profile.trusting++; flags.add('unknown_connection'); } },
      { text:'I think it was mostly just a mess', next:'un_end_real', fx:()=>{ profile.trusting++; } },
    ],
  },
  un_3_mess: { incoming:{ text:'no. you just kept saying sorry for the mess. I think you meant a lot of things at once.', time:'11:23 PM' }, choices:null,
    onEnd:()=>{ flags.add('unknown_was_kind'); flags.add('unknown_connection'); rel.unknown.trust+=5; } },
  un_3_okornot: { incoming:{ text:'I don\'t know. honestly. but you seemed like someone trying.', time:'11:22 PM' }, choices:null,
    onEnd:()=>{ flags.add('unknown_connection'); rel.unknown.trust+=5; } },
  un_3_now: { incoming:{ text:'because you texted me again at 3am. just "I\'m home". I figured you\'d want to know you made it.', time:'11:23 PM' }, choices:null,
    onEnd:()=>{ flags.add('unknown_anchor'); flags.add('unknown_connection'); rel.unknown.trust+=8; } },
  un_end_warm: { incoming:{ text:'I tried to be. sleep well.', time:'11:24 PM' }, choices:null,
    onEnd:()=>{ flags.add('unknown_connection'); rel.unknown.trust+=5; } },
  un_end_real: { incoming:{ text:'yeah. it happens. sleep well though.', time:'11:24 PM' }, choices:null,
    onEnd:()=>{ rel.unknown.trust+=3; } },

  // ── Morgan — call-back transcript variants (for getCallBackLines) ─
  // (handled separately in getCallBackLines function)


};

// ── Message history (scrollable past context) ──────────────────────
// Each entry is prepended to the thread so players can scroll up to find it.
// { from:'date', text:'label' } entries render as centered date chip separators.
const HISTORY = {
  morgan: [
    { from:'date', text:'4 days ago', time:'', read:true },
    { from:'me',   text:'hey are you around tonight', time:'8:41 PM', read:true },
    { from:'them', text:'yeah whats up', time:'8:43 PM', read:true },
    { from:'me',   text:'nothing just wanted to talk', time:'8:44 PM', read:true },
    { from:'them', text:'you ok?', time:'8:44 PM', read:true },
    { from:'me',   text:'yeah I think so', time:'8:45 PM', read:true },
    { from:'them', text:'ok well I\'m here', time:'8:45 PM', read:true },
    { from:'date', text:'yesterday', time:'', read:true },
    { from:'them', text:'you seemed kind of off today. you good?', time:'2:17 PM', read:true },
    { from:'me',   text:'I\'m fine', time:'2:44 PM', read:true },
    { from:'them', text:'you don\'t have to be fine with me', time:'2:45 PM', read:true },
    { from:'me',   text:'I know', time:'2:46 PM', read:true },
  ],
  casey: [
    { from:'date', text:'5 days ago', time:'', read:true },
    { from:'them', text:'how\'d the thing go', time:'4:12 PM', read:true },
    { from:'me',   text:'not great', time:'4:38 PM', read:true },
    { from:'them', text:'ugh I\'m sorry. what happened', time:'4:39 PM', read:true },
    { from:'me',   text:'I\'ll tell you later', time:'4:40 PM', read:true },
    { from:'them', text:'whenever you\'re ready', time:'4:40 PM', read:true },
    { from:'date', text:'2 days ago', time:'', read:true },
    { from:'me',   text:'have you ever felt like you\'re doing everything right but it still feels wrong', time:'11:43 PM', read:true },
    { from:'them', text:'yes. that\'s called being alive I think', time:'11:51 PM', read:true },
    { from:'me',   text:'that\'s not helpful', time:'11:52 PM', read:true },
    { from:'them', text:'lol sorry. what\'s going on', time:'11:52 PM', read:true },
    { from:'me',   text:'idk forget it', time:'11:54 PM', read:true },
    { from:'them', text:'ok. I\'m here though', time:'11:55 PM', read:true },
  ],
  sam: [
    { from:'date', text:'2 weeks ago', time:'', read:true },
    { from:'me',   text:'hey can we talk about the thing from last weekend', time:'7:14 PM', read:true },
    { from:'them', text:'what thing', time:'8:02 PM', read:true },
    { from:'me',   text:'you know what thing', time:'8:03 PM', read:true },
    { from:'them', text:'I said I was sorry', time:'8:05 PM', read:true },
    { from:'me',   text:'I know I just feel like it keeps happening', time:'8:07 PM', read:true },
    { from:'them', text:'I think you\'re reading into it', time:'8:21 PM', read:true },
    { from:'me',   text:'ok. forget it', time:'8:22 PM', read:true },
    { from:'date', text:'6 days ago', time:'', read:true },
    { from:'them', text:'you coming to riley\'s friday', time:'1:34 PM', read:true },
    { from:'me',   text:'yeah', time:'3:08 PM', read:true },
    { from:'them', text:'ok cool', time:'3:09 PM', read:true },
  ],
  alex: [
    { from:'date', text:'last week', time:'', read:true },
    { from:'them', text:'you coming to riley\'s friday', time:'2:18 PM', read:true },
    { from:'me',   text:'probably yeah', time:'2:45 PM', read:true },
    { from:'them', text:'nice. gonna be good', time:'2:46 PM', read:true },
    { from:'me',   text:'who\'s all going', time:'2:47 PM', read:true },
    { from:'them', text:'the usual. jordan\'s coming so it\'ll either be great or a disaster', time:'2:48 PM', read:true },
    { from:'me',   text:'ha. yeah', time:'2:49 PM', read:true },
    { from:'date', text:'2 days ago', time:'', read:true },
    { from:'them', text:'wait are you and sam good?', time:'6:11 PM', read:true },
    { from:'me',   text:'why', time:'6:30 PM', read:true },
    { from:'them', text:'idk saw something weird at the thing last week', time:'6:31 PM', read:true },
    { from:'me',   text:'yeah we\'re fine', time:'6:32 PM', read:true },
    { from:'them', text:'ok cool', time:'6:33 PM', read:true },
  ],
  riley: [
    { from:'date', text:'1 week ago', time:'', read:true },
    { from:'them', text:'ok I\'m doing the thing on friday', time:'11:22 AM', read:true },
    { from:'me',   text:'yesss', time:'11:34 AM', read:true },
    { from:'them', text:'tell people to actually be on time this time', time:'11:35 AM', read:true },
    { from:'me',   text:'I\'ll try lol', time:'11:36 AM', read:true },
    { from:'them', text:'and tell jordan not to bring randos again please', time:'11:36 AM', read:true },
    { from:'me',   text:'jordan does what jordan wants', time:'11:37 AM', read:true },
    { from:'them', text:'unfortunately', time:'11:37 AM', read:true },
    { from:'date', text:'4 days ago', time:'', read:true },
    { from:'me',   text:'need anything for friday', time:'3:44 PM', read:true },
    { from:'them', text:'just yourself and maybe not your drama lol', time:'4:02 PM', read:true },
    { from:'me',   text:'lol rude', time:'4:03 PM', read:true },
    { from:'them', text:'love you though', time:'4:04 PM', read:true },
  ],
  jordan: [
    { from:'date', text:'1 week ago', time:'', read:true },
    { from:'them', text:'riley\'s friday. you IN', time:'12:44 PM', read:true },
    { from:'me',   text:'yeah', time:'12:51 PM', read:true },
    { from:'them', text:'ok good I\'m bringing stuff', time:'12:52 PM', read:true },
    { from:'me',   text:'jordan', time:'12:52 PM', read:true },
    { from:'them', text:'what', time:'12:53 PM', read:true },
    { from:'me',   text:'please don\'t make it a whole thing', time:'12:53 PM', read:true },
    { from:'them', text:'it\'s always a whole thing with me you know this', time:'12:54 PM', read:true },
    { from:'me',   text:'...yeah I know', time:'12:55 PM', read:true },
    { from:'them', text:'it\'ll be fun I promise', time:'12:55 PM', read:true },
    { from:'date', text:'yesterday', time:'', read:true },
    { from:'them', text:'tomorrow night gonna be GOOD. trust', time:'9:14 PM', read:true },
    { from:'me',   text:'that\'s ominous', time:'9:27 PM', read:true },
    { from:'them', text:':)', time:'9:28 PM', read:true },
  ],
  taylor: [
    { from:'date', text:'2 weeks ago', time:'', read:true },
    { from:'them', text:'[photo from the last thing — you looked good here]', time:'3:14 PM', read:true },
    { from:'me',   text:'omg no I look horrified', time:'3:22 PM', read:true },
    { from:'them', text:'you look alive. that\'s something', time:'3:23 PM', read:true },
    { from:'me',   text:'send it anyway', time:'3:24 PM', read:true },
    { from:'them', text:'already did', time:'3:24 PM', read:true },
    { from:'date', text:'3 days ago', time:'', read:true },
    { from:'them', text:'going to riley\'s friday?', time:'1:58 PM', read:true },
    { from:'me',   text:'yeah, you?', time:'2:14 PM', read:true },
    { from:'them', text:'yeah. bringing my phone obviously', time:'2:15 PM', read:true },
    { from:'me',   text:'of course you are', time:'2:16 PM', read:true },
    { from:'them', text:'history needs to be documented', time:'2:17 PM', read:true },
  ],
  drew: [
    { from:'date', text:'2 weeks ago', time:'', read:true },
    { from:'them', text:'hey. haven\'t heard from you in a bit. you good?', time:'11:04 AM', read:true },
    { from:'me',   text:'yeah I\'ve just been kind of in my head', time:'2:33 PM', read:true },
    { from:'them', text:'anything specific', time:'2:34 PM', read:true },
    { from:'me',   text:'not really. just. a lot', time:'2:35 PM', read:true },
    { from:'them', text:'ok. you know where to find me', time:'2:36 PM', read:true },
    { from:'date', text:'6 days ago', time:'', read:true },
    { from:'them', text:'going to riley\'s friday?', time:'4:47 PM', read:true },
    { from:'me',   text:'yeah', time:'5:02 PM', read:true },
    { from:'them', text:'me too. I\'ll probably head out early though', time:'5:03 PM', read:true },
    { from:'me',   text:'lol that\'s so you', time:'5:04 PM', read:true },
    { from:'them', text:'I have a dog. sue me', time:'5:04 PM', read:true },
    { from:'me',   text:'fair', time:'5:05 PM', read:true },
  ],
  quinn: [
    { from:'date', text:'3 days ago', time:'', read:true },
    { from:'them', text:'hey riley said to add you. I\'m coming to the thing friday', time:'6:33 PM', read:true },
    { from:'me',   text:'oh hey yeah riley mentioned you. should be a good time', time:'7:02 PM', read:true },
    { from:'them', text:'yeah hopefully. I don\'t really know anyone there', time:'7:03 PM', read:true },
    { from:'me',   text:'you\'ll be fine, it\'s a pretty laid back group', time:'7:04 PM', read:true },
    { from:'them', text:'ok. see you there', time:'7:05 PM', read:true },
  ],
  // unknown: intentionally no history — that's the mystery
};

// ── Threads ────────────────────────────────────────────────────────
// All contacts pre-created with history so the message list is populated from
// the very start. Ambient seeds and seedMorning/Afternoon deliver new messages
// at the right phase — they won't overwrite existing threads.
const threads = {
  morgan: { contact:'morgan', messages:[...(HISTORY.morgan||[])], unread:0, scriptNode:'morgan_0' },
  casey:  { contact:'casey',  messages:[...(HISTORY.casey||[])],  unread:0, scriptNode:null },
  riley:  { contact:'riley',  messages:[...(HISTORY.riley||[])],  unread:0, scriptNode:null },
  alex:   { contact:'alex',   messages:[...(HISTORY.alex||[])],   unread:0, scriptNode:null },
  sam:    { contact:'sam',    messages:[...(HISTORY.sam||[])],    unread:0, scriptNode:null },
  jordan: { contact:'jordan', messages:[...(HISTORY.jordan||[])], unread:0, scriptNode:null },
  taylor: { contact:'taylor', messages:[...(HISTORY.taylor||[])], unread:0, scriptNode:null },
  drew:   { contact:'drew',   messages:[...(HISTORY.drew||[])],   unread:0, scriptNode:null },
  quinn:  { contact:'quinn',  messages:[...(HISTORY.quinn||[])],  unread:0, scriptNode:null },
};

(function seedNight() {
  // Pre-seed drunk texts from last night — the player wakes up and sees these

  // Morgan — drunk confessions
  threads.morgan.messages.push(
    { from:'me',   text:"you're the realest person i know. i'm serious. why don't we ever just SAY things", time:'12:47 AM', read:true },
    { from:'them', text:"hey are you ok? where are you right now", time:'12:48 AM', read:false },
    { from:'me',   text:"I'm fine!! I'm great!! this night is great!!", time:'12:49 AM', read:true },
    { from:'them', text:"ok. just... text me when you're home?", time:'12:51 AM', read:false },
  );
  const mNode = SCRIPT[threads.morgan.scriptNode];
  if (mNode?.incoming) {
    threads.morgan.messages.push({ from:'them', text:mNode.incoming.text, time:mNode.incoming.time, read:false });
  }
  threads.morgan.unread = 3;

  // Casey — push the drunk spam into the already-created thread
  threads.casey.messages.push(
    { from:'me', text:"hey are you still up",                                                                       time:'12:52 AM', read:true },
    { from:'me', text:"casey I've been thinking about this for a while and I need to tell you something",            time:'12:53 AM', read:true },
    { from:'me', text:"I think I've been really bad at being a friend lately. like really bad. I don't say that enough", time:'12:54 AM', read:true },
    { from:'me', text:"also I'm at riley's and something happened but I don't want to talk about it yet but I'm fine I promise", time:'12:56 AM', read:true },
    { from:'me', text:"do you ever feel like you're standing at the edge of something but you don't know if you should jump", time:'1:03 AM',  read:true },
    { from:'me', text:"[voice note · 2:14]",                                                                        time:'1:07 AM',  read:true },
    { from:'me', text:"sorry about the voice note. that was too much",                                              time:'1:09 AM',  read:true },
    { from:'me', text:"I just feel like nobody actually knows me. like they know the version I show them",           time:'1:11 AM',  read:true },
  );
  threads.casey.scriptNode = 'casey_0';
  const cNode = SCRIPT['casey_0'];
  if (cNode?.incoming) {
    threads.casey.messages.push({ from:'them', text:cNode.incoming.text, time:cNode.incoming.time, read:false });
  }
  threads.casey.unread = 1;
})();

// ── Ambient interactions ───────────────────────────────────────────
// Each fires once when: correct phase, delay elapsed, condition met, thread free.
const ambientSeeds = [
  // ── Morning: initial texts (staggered so they don't all land at once) ──
  { phase:PHASE.MORNING, thread:'riley',  node:'riley_0',  delay:8,   fired:false, cond:()=>true },
  { phase:PHASE.MORNING, thread:'alex',   node:'alex_0',   delay:25,  fired:false, cond:()=>true },
  { phase:PHASE.MORNING, thread:'sam',    node:'sam_0',    delay:48,  fired:false, cond:()=>true },
  { phase:PHASE.MORNING, thread:'jordan', node:'jordan_0', delay:75,  fired:false, cond:()=>true },
  { phase:PHASE.MORNING, thread:'taylor', node:'taylor_0', delay:115, fired:false, cond:()=>true },
  // ── Morning: follow-ups ──
  { phase:PHASE.MORNING, thread:'morgan', node:'morgan_am1', delay:35,  fired:false, cond:()=>!flags.has('morgan_am_closed') },
  { phase:PHASE.MORNING, thread:'riley',  node:'riley_am1',  delay:90,  fired:false, cond:()=>!flags.has('riley_ignored') },
  // ── Afternoon: initial texts ──
  { phase:PHASE.AFTERNOON, thread:'morgan', nodeFunc:()=>getMorganAftNode(), delay:15,  fired:false, cond:()=>!!getMorganAftNode() },
  { phase:PHASE.AFTERNOON, thread:'drew',   node:'drew_0',                   delay:38,  fired:false, cond:()=>true },
  { phase:PHASE.AFTERNOON, thread:'quinn',  node:'quinn_0',                  delay:72,  fired:false, cond:()=>true },
  // ── Afternoon: follow-ups ──
  { phase:PHASE.AFTERNOON, thread:'jordan', node:'jordan_pm1', delay:30,  fired:false, cond:()=>!flags.has('jordan_ignored') },
  { phase:PHASE.AFTERNOON, thread:'morgan', node:'morgan_pm1', delay:90,  fired:false, cond:()=>!flags.has('morgan_am_closed') },
  { phase:PHASE.AFTERNOON, thread:'casey',  node:'casey_pm1',  delay:110, fired:false, cond:()=>(flags.has('casey_real_talk')||flags.has('casey_connection'))&&!flags.has('casey_ignored') },
  { phase:PHASE.AFTERNOON, thread:'taylor', node:'taylor_pm1', delay:140, fired:false, cond:()=>flags.has('taylor_trustworthy')&&!flags.has('taylor_ignored') },
  { phase:PHASE.AFTERNOON, thread:'alex',   node:'alex_pm1',   delay:165, fired:false, cond:()=>!flags.has('alex_ignored') },
  { phase:PHASE.AFTERNOON, thread:'riley',  node:'riley_pm1',  delay:195, fired:false, cond:()=>!flags.has('riley_ignored') },
  // ── Evening: initial + follow-ups ──
  { phase:PHASE.EVENING, thread:'morgan', nodeFunc:()=>getMorganEveNode(), delay:20,  fired:false, cond:()=>!!getMorganEveNode() },
  { phase:PHASE.EVENING, thread:'riley',  node:'riley_eve',                 delay:55,  fired:false, cond:()=>rel.riley.trust>=45&&!flags.has('riley_ignored') },
  { phase:PHASE.EVENING, thread:'sam',    node:'sam_eve1',                  delay:80,  fired:false, cond:()=>flags.has('sam_real_talk_started')&&!flags.has('sam_ghosted') },
  { phase:PHASE.EVENING, thread:'alex',   node:'alex_eve1',                 delay:110, fired:false, cond:()=>!flags.has('alex_ignored') },
  { phase:PHASE.EVENING, thread:'jordan', node:'jordan_eve1',               delay:150, fired:false, cond:()=>!flags.has('jordan_ignored') },
];

function tickAmbientSeeds() {
  const elapsed = totalTime - phaseStartTime;
  for (const seed of ambientSeeds) {
    if (seed.fired) continue;
    if (seed.phase !== timePhase) continue;
    if (elapsed < seed.delay) continue;
    if (seed.cond && !seed.cond()) { seed.fired = true; continue; } // condition failed — skip
    const t = threads[seed.thread];
    if (!t) { seed.fired = true; continue; }
    if (t.scriptNode !== null) continue; // thread busy — wait
    seed.fired = true;
    const nodeId = seed.nodeFunc ? seed.nodeFunc() : seed.node;
    if (!nodeId) continue;
    const node = SCRIPT[nodeId];
    if (!node) continue;
    t.scriptNode = nodeId;
    if (node.incoming) {
      t.messages.push({ from:'them', text:node.incoming.text, time:node.incoming.time||clockStr(), read:false });
      t.unread++;
      if (seed.thread !== activeThreadKey) pushNotif(rel[seed.thread]?.name||seed.thread, node.incoming.text);
    }
    if (!node.choices) {
      if (node.onEnd) node.onEnd();
      t.scriptNode = null;
    }
  }
}

// ── Phase transitions ──────────────────────────────────────────────
function queueMorning() {
  if (timePhase >= PHASE.MORNING || phaseTimer >= 0) return;
  phaseTimer = 3.0;
}

function seedMorning() {
  if (timePhase >= PHASE.MORNING) return;
  timePhase = PHASE.MORNING;
  phaseStartTime = totalTime;

  // Create threads empty — ambient seeds will deliver the first message at staggered times
  // Threads already exist from init — don't overwrite them
  notes.push({ time:'8:47 AM', body:morningNoteBody() });
}

function morningNoteBody() {
  if (flags.has('morgan_connection_started')) return "morgan said what I needed to hear. I think. I'm still not sure I deserved it.";
  if (flags.has('morgan_am_closed') || flags.has('morgan_hurt')) return "I shut it down again. I always shut it down.";
  if (flags.has('morgan_silence_am'))  return "didn't answer morgan. didn't answer a lot of things last night.";
  return "woke up and the first thing I did was check my phone. that's probably not a good sign.";
}

function queueAfternoon() {
  if (timePhase >= PHASE.AFTERNOON || afternoonTimer >= 0) return;
  afternoonTimer = 4.0;
}

function seedAfternoon() {
  if (timePhase >= PHASE.AFTERNOON) return;
  timePhase = PHASE.AFTERNOON;
  phaseStartTime = totalTime;

  // Threads already exist from init — don't overwrite them

  // Drunk note — written at 2am, only discovered now
  notes.push({ time:'2:14 AM', body:"wrote this around 2am apparently. can't tell if I was trying to remember or trying to forget.", recovered:true });
}

function getMorganAftNode() {
  return 'morgan_aft';
}

function queueEvening() {
  if (timePhase >= PHASE.EVENING || eveningTimer >= 0) return;
  eveningTimer = 5.0;
}

function seedEvening() {
  if (timePhase >= PHASE.EVENING) return;
  timePhase = PHASE.EVENING;
  phaseStartTime = totalTime;

  notes.push({ time:'7:22 PM', body:eveningNoteBody() });
  // Morgan evening message delivered by ambient seed at delay:20
}

function getMorganEveNode() {
  if (flags.has('eve_silence') || flags.has('morgan_aft_ignored')) return null;
  if (rel.morgan.trust < 30) return null;
  if (flags.has('morgan_told_the_truth') || flags.has('morgan_connection_started') || rel.morgan.trust >= 55)
    return 'morgan_eve';
  return 'morgan_eve_soft';
}

function queueLate() {
  if (timePhase >= PHASE.LATE || lateTimer >= 0) return;
  lateTimer = 8.0;
}

function seedLate() {
  if (timePhase >= PHASE.LATE) return;
  timePhase = PHASE.LATE;

  notes.push({ time:'3:02 AM', body:lateNoteBody(), recovered:true });

  // Unknown number — texts from someone you met at the party (player had already texted them)
  threads.unknown = { contact:'unknown', messages:[], unread:0, scriptNode:'unk_0' };
  threads.unknown.messages.push(
    { from:'me', text:"hey. random but I think you said something to me earlier and I didn't get a chance to say something back", time:'3:22 AM', read:true },
    { from:'me', text:"I'm home",                                                                                                 time:'3:31 AM', read:true },
  );
  const unNode = SCRIPT['unk_0'];
  if (unNode?.incoming) {
    threads.unknown.messages.push({ from:'them', text:unNode.incoming.text, time:unNode.incoming.time, read:false });
    threads.unknown.unread = 1;
  }
  pushNotif('???', unNode?.incoming?.text || '');

  // If morgan connection reached, she sends a quiet goodnight
  if (flags.has('morgan_connection') && !flags.has('morgan_eve_silence')) {
    threads.morgan.messages.push({ from:'them', text:'hey. goodnight.', time:'11:42 PM', read:false });
    threads.morgan.unread += 1;
    pushNotif('Morgan', 'hey. goodnight.');
  }
}

function lateNoteBody() {
  if (flags.has('morgan_connection'))    return "I don't know who I was last night. but I think I know who I want to be.";
  if (flags.has('unknown_anchor'))       return "a stranger texted to say I made it home. I didn't know I needed to hear that.";
  if (flags.has('casey_connection'))     return "casey knew I wasn't ok. I just never asked them to say it out loud before.";
  if (flags.has('sam_real_talk_started'))return "sam tried to warn me last night. I didn't pick up. I need to sit with what that means.";
  if (flags.has('jordan_accountable'))   return "jordan admitted it. that's more than I expected. don't know if it changes anything.";
  if (flags.has('riley_sees_you'))       return "riley said they see me. I wonder if that's true. I wonder if I want it to be.";
  if (flags.has('admitted_blackout'))    return "so I was a mess. that's just a fact now. the question is what I do with it.";
  return "some nights you don't get to understand. you just have to carry them.";
}

function eveningNoteBody() {
  if (flags.has('morgan_told_the_truth'))  return "told her I wasn't ok. it was the most honest thing I said all day.";
  if (flags.has('morgan_connection_started') && flags.has('admitted_drunk_texts'))
                                           return "maybe the things I said drunk were the things I actually meant.";
  if (flags.has('riley_sees_you'))         return "riley said they see me. didn't know what to say to that.";
  if (flags.has('riley_connection'))       return "riley and I are ok. I think. whatever ok means right now.";
  if (flags.has('jordan_accountable'))     return "jordan admitted something. not sure if I forgive them yet. not sure that's the point.";
  if (flags.has('eve_silence') || flags.has('morgan_aft_ignored'))
                                           return "I went quiet again. I don't know if that's self-preservation or something worse.";
  return "the phone's quiet now. probably for the best.";
}

function getCallBackLines() {
  if (flags.has('morgan_connection') || flags.has('morgan_told_the_truth')) {
    return [
      "Morgan: hey.",
      "you: hey. I just... wanted to actually talk.",
      "Morgan: yeah.",
      "Morgan: I'm glad you called.",
    ];
  }
  if (flags.has('morgan_connection_started') || flags.has('admitted_drunk_texts')) {
    return [
      "Morgan: oh. hey.",
      "you: I know. I'm sorry I didn't pick up.",
      "Morgan: are you ok?",
      "you: I don't know yet.",
      "Morgan: ok. that's honest.",
    ];
  }
  if (flags.has('eve_silence') || flags.has('morgan_silence_am')) {
    return [
      "Morgan: ...",
      "Morgan: you called.",
      "you: yeah.",
      "Morgan: ok.",
    ];
  }
  return [
    "Morgan: hey.",
    "you: hey.",
    "Morgan: ...",
    "you: I don't know what to say.",
    "Morgan: you called. that's something.",
  ];
}

// ── Active thread state ────────────────────────────────────────────
let activeThreadKey = null;
let choiceAnim      = 0;
let choiceMade      = false;
let typingActive    = false;
let typingTimer     = 0;
let typingNextNode  = null;

// Thread scroll state
let threadScrollY  = 0;    // pixels scrolled up from bottom (0 = most recent visible)
let msgListScrollY = 0;    // pixels scrolled down in the message list (0 = top)
const threadDrag   = { active:false, startY:0, startScroll:0, totalDelta:0, screen:'' };

function msgListMaxScroll() {
  const rowH = 56, headerH = STATUS_H + 36, navH = NAV_H;
  const contentH = Object.keys(threads).length * rowH;
  return Math.max(0, contentH - (H - headerH - navH));
}

function openThread(key) {
  activeThreadKey = key;
  screen = SCR.THREAD;
  choiceAnim = 0;
  choiceMade = false;
  typingActive = false;
  threadScrollY = 0;
  threadDrag.active = false;
  threadDrag.totalDelta = 0;
  const t = threads[key];
  t.messages.forEach(m => m.read = true);
  t.unread = 0;
}

function submitChoice(choice) {
  if (choiceMade || !activeThreadKey) return;
  choiceMade = true;
  const t = threads[activeThreadKey];
  if (!choice.silent) t.messages.push({ from:'me', text:choice.text, time:clockStr(), read:false });
  if (choice.fx) choice.fx();
  refreshTone(activeThreadKey);
  if (choice.next) {
    const next = SCRIPT[choice.next];
    t.scriptNode = choice.next;
    if (next?.incoming) {
      typingActive = true; typingTimer = 0.9 + Math.random()*1.1; typingNextNode = choice.next;
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
  if (node?.incoming) t.messages.push({ from:'them', text:node.incoming.text, time:node.incoming.time||clockStr(), read:false });
  if (!node?.choices) {
    if (node?.onEnd) node.onEnd();
    t.scriptNode = null;
  } else {
    choiceAnim = 0; choiceMade = false;
  }
  typingActive = false; typingNextNode = null;
}

function refreshTone(key) {
  const r = rel[key]; if (!r) return;
  const p = profile;
  if      (p.avoidant >=3 && p.avoidant >=p.defensive && p.avoidant >=p.trusting) r.tone='distant';
  else if (p.defensive>=3 && p.defensive>=p.trusting)                              r.tone='guarded';
  else if (p.trusting >=3)                                                          r.tone='warm';
}

// ── App grid ───────────────────────────────────────────────────────
const APP_SZ = 52;
const APP_GRID = (function(){
  const list = [
    { id:'messages', label:'Messages', col:'#3c8c4a', icon:'💬' },
    { id:'photos',   label:'Photos',   col:'#b87020', icon:'🖼️'  },
    { id:'notes',    label:'Notes',    col:'#b8a020', icon:'📝'  },
    { id:'calls',    label:'Calls',    col:'#2878c0', icon:'📞'  },
    { id:'music',    label:'Music',    col:'#8030a0', icon:'🎵'  },
    { id:'settings', label:'Settings', col:'#607080', icon:'⚙️'  },
  ];
  const cols=4, gX=10, gY=22, labelH=14;
  const rowH = APP_SZ + gY;
  const rows = Math.ceil(list.length / cols);
  const totalW = cols*APP_SZ+(cols-1)*gX;
  const totalH = rows*(APP_SZ+labelH)+(rows-1)*(gY-labelH);
  const contentH = H - STATUS_H - NAV_H;
  const sY = STATUS_H + Math.round((contentH - totalH) / 2);
  // Centre each row independently so partial last rows aren't left-aligned
  return list.map((a,i)=>{
    const row = Math.floor(i/cols), col = i%cols;
    const inRow = Math.min(cols, list.length - row*cols);
    const rowW  = inRow*APP_SZ + (inRow-1)*gX;
    const rowX  = Math.round((W - rowW) / 2);
    return { ...a, x: rowX + col*(APP_SZ+gX), y: sY + row*rowH };
  });
})();

const SETTING_ROWS = [
  { key:'readReceipts',    label:'Read Receipts',    sub:'Let others see when you\'ve read their messages' },
  { key:'doNotDisturb',    label:'Do Not Disturb',   sub:'Silence notifications'                           },
  { key:'locationSharing', label:'Location Sharing', sub:'Share your location with contacts'               },
];

// ── Slide-to-unlock ────────────────────────────────────────────────
const SLIDE_W  = 200, SLIDE_H = 28, SLIDE_TR = 12;
const SLIDE_X  = Math.round((W - SLIDE_W) / 2);
const SLIDE_Y  = H - 52;
const lockSlide = { progress: 0, dragging: false, snapBack: false };
let   lockDragOriginX = 0;

function lockThumbCX() {
  return SLIDE_X + SLIDE_TR + lockSlide.progress * (SLIDE_W - SLIDE_TR * 2 - 4);
}

function canvasCoords(e) {
  const r = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return [(src.clientX-r.left)*(W/r.width), (src.clientY-r.top)*(H/r.height)];
}

function threadContentBottom() {
  if (!activeThreadKey) return H - NAV_H;
  const t = threads[activeThreadKey];
  const node = t.scriptNode ? SCRIPT[t.scriptNode] : null;
  const hasChoices = node?.choices && !choiceMade && !typingActive;
  const choiceH    = hasChoices ? node.choices.length * 26 + 10 : 0;
  const typingH    = typingActive ? 28 : 0;
  return H - NAV_H - choiceH - typingH - 4;
}

canvas.addEventListener('mousedown', e => {
  const [mx, my] = canvasCoords(e);
  if (screen === SCR.LOCK) {
    const tx = lockThumbCX(), cy = SLIDE_Y + SLIDE_H / 2;
    if (Math.abs(mx - tx) <= SLIDE_TR + 8 && Math.abs(my - cy) <= SLIDE_H) {
      lockSlide.dragging  = true;
      lockSlide.snapBack  = false;
      lockDragOriginX     = mx - lockSlide.progress * (SLIDE_W - SLIDE_TR * 2 - 4);
      e.preventDefault();
    }
  } else if (screen === SCR.MUSIC && musicState.view === 'player') {
    const {x:vx,y:vy,w:vw}=musicVolRect();
    if (my>=vy-10&&my<=vy+14&&mx>=vx-4&&mx<=vx+vw+4) {
      musicState.volDragging = true; e.preventDefault();
    }
  } else if (screen === SCR.THREAD && my < threadContentBottom()) {
    threadDrag.active      = true;
    threadDrag.screen      = SCR.THREAD;
    threadDrag.startY      = my;
    threadDrag.startScroll = threadScrollY;
    threadDrag.totalDelta  = 0;
  } else if (screen === SCR.MESSAGES) {
    threadDrag.active      = true;
    threadDrag.screen      = SCR.MESSAGES;
    threadDrag.startY      = my;
    threadDrag.startScroll = msgListScrollY;
    threadDrag.totalDelta  = 0;
  }
});
canvas.addEventListener('touchstart', e => {
  const [mx, my] = canvasCoords(e);
  if (screen === SCR.LOCK) {
    const tx = lockThumbCX(), cy = SLIDE_Y + SLIDE_H / 2;
    if (Math.abs(mx - tx) <= SLIDE_TR + 12 && Math.abs(my - cy) <= SLIDE_H + 4) {
      lockSlide.dragging  = true;
      lockSlide.snapBack  = false;
      lockDragOriginX     = mx - lockSlide.progress * (SLIDE_W - SLIDE_TR * 2 - 4);
      e.preventDefault();
    }
  } else if (screen === SCR.MUSIC && musicState.view === 'player') {
    const {x:vx,y:vy,w:vw}=musicVolRect();
    if (my>=vy-10&&my<=vy+14&&mx>=vx-4&&mx<=vx+vw+4) {
      musicState.volDragging = true; e.preventDefault();
    }
  } else if (screen === SCR.THREAD && my < threadContentBottom()) {
    threadDrag.active      = true;
    threadDrag.screen      = SCR.THREAD;
    threadDrag.startY      = my;
    threadDrag.startScroll = threadScrollY;
    threadDrag.totalDelta  = 0;
  } else if (screen === SCR.MESSAGES) {
    threadDrag.active      = true;
    threadDrag.screen      = SCR.MESSAGES;
    threadDrag.startY      = my;
    threadDrag.startScroll = msgListScrollY;
    threadDrag.totalDelta  = 0;
  }
}, { passive: false });

function onSlideMove(mx, my) {
  if (lockSlide.dragging) {
    const raw = (mx - lockDragOriginX) / (SLIDE_W - SLIDE_TR * 2 - 4);
    lockSlide.progress = Math.max(0, Math.min(1, raw));
  }
  if (musicState.volDragging) {
    const {x:vx,w:vw}=musicVolRect();
    musicState.volume = Math.max(0, Math.min(1, (mx - vx) / vw));
    if (musicState.audio) musicState.audio.volume = musicState.volume;
  }
  if (threadDrag.active) {
    const dy = threadDrag.startY - my;
    threadDrag.totalDelta = Math.abs(dy);
    if (threadDrag.screen === SCR.MESSAGES) {
      // Drag up (dy > 0) → scroll list down to see more contacts
      msgListScrollY = Math.max(0, Math.min(msgListMaxScroll(), threadDrag.startScroll + dy));
    } else {
      // Thread: drag up → show older messages
      threadScrollY = Math.max(0, threadDrag.startScroll + dy);
    }
  }
}
function onSlideEnd() {
  if (lockSlide.dragging) {
    lockSlide.dragging = false;
    if (lockSlide.progress >= 0.75) {
      lockSlide.progress = 0;
      screen = SCR.HOME;
    } else {
      lockSlide.snapBack = true;
    }
  }
  musicState.volDragging = false;
  threadDrag.active = false;
}

window.addEventListener('mousemove',  e => { const [mx,my]=canvasCoords(e); onSlideMove(mx,my); });
window.addEventListener('mouseup',    () => onSlideEnd());
window.addEventListener('touchmove',  e => { const [mx,my]=canvasCoords(e); onSlideMove(mx,my); e.preventDefault(); }, { passive: false });
window.addEventListener('touchend',   () => onSlideEnd());

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY;
  if (screen === SCR.THREAD) {
    // Scroll up (deltaY < 0) → increase threadScrollY to reveal older messages
    threadScrollY = Math.max(0, threadScrollY - delta * 0.6);
  } else if (screen === SCR.MESSAGES) {
    msgListScrollY = Math.max(0, Math.min(msgListMaxScroll(), msgListScrollY + delta * 0.6));
  }
}, { passive: false });

// ── Input ──────────────────────────────────────────────────────────
canvas.addEventListener('click', e => {
  const r = canvas.getBoundingClientRect();
  handleClick((e.clientX-r.left)*(W/r.width), (e.clientY-r.top)*(H/r.height));
});

function handleClick(mx, my) {
  // Power button — right side of phone, works on every screen
  if (mx >= PWR.x - 10 && my >= PWR.y - 10 && my <= PWR.y + PWR.h + 10) {
    returnToLobby(); return;
  }
  if (screen===SCR.END) { onClickEnd(mx,my); return; }
  if (screen!==SCR.LOCK && screen!==SCR.HOME && my>=H-NAV_H) { goBack(); return; }
  switch(screen) {
    case SCR.LOCK:     onClickLock();           break;
    case SCR.HOME:     onClickHome(mx,my);      break;
    case SCR.MESSAGES: onClickMessages(mx,my);  break;
    case SCR.THREAD:   onClickThread(mx,my);    break;
    case SCR.CALLS:    onClickCalls(mx,my);     break;
    case SCR.PHOTOS:   onClickPhotos(mx,my);    break;
    case SCR.MUSIC:    onClickMusic(mx,my);     break;
    case SCR.SETTINGS: onClickSettings(mx,my);  break;
  }
}

function goBack() {
  if      (screen===SCR.THREAD) { screen=SCR.MESSAGES; activeThreadKey=null; }
  else if (screen===SCR.PHOTOS) { photoZoom=false; screen=SCR.HOME; }
  else if (screen===SCR.MUSIC && musicState.view==='player') { musicState.view='list'; }
  else                          { screen=SCR.HOME; }
}

function onClickLock() { /* unlock via slide only */ }

function onClickHome(mx,my) {
  // Evening quiet-phone epilogue button
  if (timePhase>=PHASE.EVENING && Object.values(threads).every(t=>!t.scriptNode)) {
    const qy=H-NAV_H-30;
    if (my>=qy && my<=qy+22) { screen=SCR.END; return; }
  }
  for (const app of APP_GRID) {
    if (mx>=app.x && mx<=app.x+APP_SZ && my>=app.y && my<=app.y+APP_SZ+14) {
      switch(app.id) {
        case 'messages': screen=SCR.MESSAGES; msgListScrollY=0; break;
        case 'notes':    screen=SCR.NOTES;    break;
        case 'photos':   screen=SCR.PHOTOS; photoZoom=false; break;
        case 'calls':    screen=SCR.CALLS; callsVoicemailOpen=false; break;
        case 'music':    screen=SCR.MUSIC; break;
        case 'settings': screen=SCR.SETTINGS; break;
      }
      return;
    }
  }
}

function onClickMessages(mx,my) {
  if (threadDrag.totalDelta > 8) { threadDrag.totalDelta = 0; return; }
  let ry = CONTENT_Y + 36 - msgListScrollY;
  for (const key of Object.keys(threads)) {
    if (my>=ry && my<ry+56) { openThread(key); return; }
    ry+=56;
  }
}

function onClickThread(mx,my) {
  if (!activeThreadKey) return;
  // If the pointer moved more than 8px it was a scroll gesture, not a tap
  if (threadDrag.totalDelta > 8) { threadDrag.totalDelta = 0; return; }
  const t=threads[activeThreadKey], node=t.scriptNode?SCRIPT[t.scriptNode]:null;
  if (!node?.choices||choiceMade||typingActive) return;
  const bH=22,gap=4;
  let by=H-NAV_H-node.choices.length*(bH+gap)+gap-6;
  for (const c of node.choices) {
    if (mx>=8&&mx<=W-8&&my>=by&&my<=by+bH) { submitChoice(c); return; }
    by+=bH+gap;
  }
}

function onClickCalls(mx,my) {
  // Call-back overlay buttons
  if (callBack.active) {
    if (callBack.state==='connected' && callBack.lineIdx>=callBack.lines.length) {
      // "hang up" button
      if (my>=H-NAV_H-44 && my<=H-NAV_H-16) { callBack.active=false; callBack.state='idle'; }
    }
    return;
  }
  // Call-back initiate
  if (timePhase>=PHASE.EVENING && !flags.has('called_morgan_back')) {
    const cby=H-NAV_H-36;
    if (my>=cby && my<=cby+28) {
      callBack.active=true; callBack.state='calling';
      callBack.timer=0; callBack.lineIdx=0; callBack.lineTimer=0; callBack.lines=[];
      return;
    }
  }
  // Voicemail section tap
  const vmRowY = STATUS_H+36+callLog.length*43+18;
  if (!callsVoicemailOpen) {
    if (my>=vmRowY && my<vmRowY+36) { callsVoicemailOpen=true; return; }
  } else {
    const vm = voicemails[0];
    if (!vm.listened && my>=vmRowY && my<vmRowY+60) {
      vm.listened=true;
      flags.add('voicemail_listened');
    }
    if (my<vmRowY) callsVoicemailOpen=false;
  }
}

function onClickPhotos(mx,my) {
  const py=CONTENT_Y+32, ph=H-NAV_H-py-26;
  if (my>=py && my<=py+ph) photoZoom=!photoZoom;
}

function onClickSettings(mx,my) {
  let ry=CONTENT_Y+44;
  for (const row of SETTING_ROWS) {
    if (my>=ry && my<ry+38) {
      settings[row.key]=!settings[row.key];
      if (row.key==='readReceipts') flags.add(settings.readReceipts?'receipts_on':'receipts_off');
      return;
    }
    ry+=38;
  }
}

// ── Update ─────────────────────────────────────────────────────────
let totalTime=0, lastTs=0;

function update(dt) {
  totalTime+=dt;
  if (phaseTimer>=0)     { phaseTimer-=dt;     if (phaseTimer<=0)     { phaseTimer=-1;     seedMorning();   } }
  if (afternoonTimer>=0) { afternoonTimer-=dt;  if (afternoonTimer<=0) { afternoonTimer=-1; seedAfternoon(); } }
  if (eveningTimer>=0)   { eveningTimer-=dt;    if (eveningTimer<=0)   { eveningTimer=-1;   seedEvening();   } }
  if (lateTimer>=0)      { lateTimer-=dt;       if (lateTimer<=0)      { lateTimer=-1;      seedLate();      } }
  // Auto-queue evening once all afternoon threads go quiet
  if (timePhase===PHASE.AFTERNOON && eveningTimer<0) {
    if (Object.values(threads).every(t=>!t.scriptNode)) queueEvening();
  }
  tickAmbientSeeds();
  if (screen===SCR.THREAD&&!choiceMade&&!typingActive) choiceAnim=Math.min(1,choiceAnim+dt*2.8);
  if (typingActive) { typingTimer-=dt; if (typingTimer<=0) deliverPending(); }
  if (notifToast)   { notifToast.timer-=dt; if (notifToast.timer<=0) notifToast=null; }
  // Slide snap-back
  if (lockSlide.snapBack) {
    lockSlide.progress = Math.max(0, lockSlide.progress - dt * 5);
    if (lockSlide.progress <= 0) lockSlide.snapBack = false;
  }
  // Call-back animation
  if (callBack.active) {
    callBack.timer += dt;
    if (callBack.state === 'calling' && callBack.timer >= CALLOUT_DELAY) {
      callBack.state = 'connected';
      callBack.lines  = getCallBackLines();
      callBack.lineIdx = 0;
      callBack.lineTimer = 0;
      flags.add('called_morgan_back');
      rel.morgan.trust = Math.min(100, rel.morgan.trust + 10);
    }
    if (callBack.state === 'connected') {
      callBack.lineTimer += dt;
      if (callBack.lineTimer >= LINE_DELAY && callBack.lineIdx < callBack.lines.length) {
        callBack.lineIdx++;
        callBack.lineTimer = 0;
      }
    }
  }
}

// ── Draw ───────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0,0,W,H);
  ctx.imageSmoothingEnabled=false;
  switch(screen) {
    case SCR.LOCK:     drawLock();     break;
    case SCR.HOME:     drawHome();     break;
    case SCR.MESSAGES: drawMsgList();  break;
    case SCR.THREAD:   drawThread();   break;
    case SCR.NOTES:    drawNotes();    break;
    case SCR.PHOTOS:   drawPhotos();   break;
    case SCR.CALLS:    drawCalls();    break;
    case SCR.MUSIC:    drawMusic();    break;
    case SCR.SETTINGS: drawSettings(); break;
    case SCR.END:      drawEnd();      break;
  }
  if (screen!==SCR.LOCK && screen!==SCR.END) {
    drawStatusBar();
    drawBottomNav();
    if (notifToast&&screen===SCR.HOME) drawNotifToast();
  }
  drawPowerButton();
}

function drawPowerButton() {
  const {x,y,w,h} = PWR;
  // Drop shadow (offset right+down)
  ctx.fillStyle='rgba(0,0,0,0.55)';
  roundRect(x+1,y+1,w,h,2); ctx.fill();
  // Button body
  ctx.fillStyle='#120820';
  roundRect(x,y,w,h,2); ctx.fill();
  // Left-edge highlight to look raised
  ctx.fillStyle='rgba(255,255,255,0.09)';
  ctx.fillRect(x,y+3,1,h-6);
  // Border
  ctx.strokeStyle='rgba(100,55,160,0.65)'; ctx.lineWidth=0.5;
  roundRect(x,y,w,h,2); ctx.stroke();
}

// ── Status bar ─────────────────────────────────────────────────────
function drawStatusBar() {
  ctx.fillStyle='rgba(5,5,12,0.78)'; ctx.fillRect(0,0,W,STATUS_H);
  ctx.font='bold 9px Arial Narrow, Arial, sans-serif'; ctx.textAlign='left'; ctx.fillStyle='#ddd';
  ctx.fillText(clockStr(),8,13);
  ctx.textAlign='right'; ctx.font='8px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#aaa';
  let rx=W-6; ctx.fillText('▮▮▮▯',rx,13); rx-=34;
  if (settings.doNotDisturb) ctx.fillText('🌙',rx,13);
  // Missed call indicator
  if (timePhase>=PHASE.AFTERNOON && !voicemails[0].listened) {
    rx-=20; ctx.fillStyle='#e53935'; ctx.fillText('📵',rx,13);
  }
  ctx.textAlign='left';
}

// ── Bottom nav ─────────────────────────────────────────────────────
function drawBottomNav() {
  const y=H-NAV_H;
  ctx.fillStyle='rgba(8,8,16,0.93)'; ctx.fillRect(0,y,W,NAV_H);
  ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(0,y,W,1);
  if (screen!==SCR.HOME) {
    ctx.font='10px Arial Narrow, Arial, sans-serif'; ctx.textAlign='left';
    ctx.fillStyle='#6aacff'; ctx.fillText('‹  back',12,y+17);
  }
  ctx.fillStyle='rgba(255,255,255,0.3)';
  roundRect(W/2-22,y+8,44,5,3); ctx.fill();
}

// ── Notification toast ─────────────────────────────────────────────
function drawNotifToast() {
  if (!notifToast) return;
  const fade=Math.min(1,notifToast.timer/0.4);
  ctx.save(); ctx.globalAlpha=fade;
  const tx=8,ty=STATUS_H+4,tw=W-16,th=34;
  ctx.fillStyle='rgba(30,30,45,0.97)'; roundRect(tx,ty,tw,th,8); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=1; roundRect(tx,ty,tw,th,8); ctx.stroke();
  ctx.fillStyle='#3c8c4a'; roundRect(tx+6,ty+6,22,22,5); ctx.fill();
  ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.fillText('💬',tx+17,ty+22);
  ctx.textAlign='left';
  ctx.font='bold 7px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#fff'; ctx.fillText(notifToast.sender,tx+34,ty+13);
  ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.6)';
  const pv=notifToast.text.length>46?notifToast.text.slice(0,45)+'…':notifToast.text;
  ctx.fillText(pv,tx+34,ty+25);
  ctx.restore();
}

// ── Wallpaper ──────────────────────────────────────────────────────
// Pre-baked bokeh dots using a simple xorshift so positions are
// identical every run (no asset loading required).
const BOKEH = (function() {
  let s = 0x9e3779b9;
  const r = () => { s ^= s<<13; s ^= s>>17; s ^= s<<5; return (s>>>0)/0xffffffff; };
  const dots = [];
  for (let i = 0; i < 24; i++) {
    dots.push({ x:r(), y:r()*0.86, rad:7+r()*22,
      hue: Math.floor(r()*3),   // 0=blue  1=purple  2=amber
      a:   0.10+r()*0.18 });
  }
  return dots;
})();

// Skyline silhouette (fixed proportions, drawn dark over wallpaper)
const SKYLINE = [
  [0.00,0.15,0.22],[0.13,0.10,0.15],[0.21,0.18,0.28],
  [0.37,0.12,0.19],[0.47,0.16,0.32],[0.60,0.14,0.23],
  [0.72,0.15,0.17],[0.85,0.14,0.26],
];

const BOKEH_COLS = [
  [[70,110,255],[40,55,180]],    // blue-violet
  [[150,75,225],[100,35,185]],   // purple
  [[225,140,65],[175,80,25]],    // amber
];

function drawWallpaper(dimAmt) {
  // ── 1. Sky gradient — distinct per phase ─────────────────────────
  // [top, bottom]
  const skyStops = {
    [PHASE.NIGHT]:     ['#000308','#0a0422'],   // near-black → deep violet
    [PHASE.MORNING]:   ['#0b1828','#b84214'],   // dark blue → burnt amber (sunrise)
    [PHASE.AFTERNOON]: ['#0e1e52','#3464a8'],   // deep navy → open sky blue
    [PHASE.EVENING]:   ['#06021c','#881e04'],   // dark violet → deep burnt orange (sunset)
    [PHASE.LATE]:      ['#000102','#03020a'],   // near-absolute black
  };
  const [c0,c1] = skyStops[timePhase] || skyStops[PHASE.NIGHT];
  const bg = ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,c0); bg.addColorStop(1,c1);
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

  // ── 2. Horizon glow — sunrise / sunset / atmospheric ─────────────
  // Radial gradient centred at the skyline to simulate light source
  const hGlow = {
    [PHASE.MORNING]:   [255,115,30,  0.50, 0.80],   // r,g,b, alpha, y-frac
    [PHASE.EVENING]:   [255,65, 10,  0.58, 0.78],
    [PHASE.AFTERNOON]: [100,165,255, 0.18, 0.68],   // subtle atmospheric haze
  }[timePhase];
  if (hGlow) {
    const [hr,hg,hb,ha,hyf] = hGlow;
    const gy = Math.round(hyf * H);
    const rg = ctx.createRadialGradient(W/2,gy,0, W/2,gy, W*0.9);
    rg.addColorStop(0,   `rgba(${hr},${hg},${hb},${ha})`);
    rg.addColorStop(0.50,`rgba(${hr},${hg},${hb},${(ha*0.28).toFixed(2)})`);
    rg.addColorStop(1,   `rgba(${hr},${hg},${hb},0)`);
    ctx.fillStyle = rg; ctx.fillRect(0,0,W,H);
  }

  // ── 3. Bokeh — colour palette keyed by phase ─────────────────────
  // Three hue slots per phase: [inner, outer] rgb
  const phaseBokeh = {
    [PHASE.NIGHT]:     [[[70,110,255],[40,55,180]],[[150,75,225],[100,35,185]],[[225,140,65],[175,80,25]]],
    [PHASE.MORNING]:   [[[255,148,45],[200,88,10]],[[255,205,95],[185,125,28]],[[185,95,235],[125,45,190]]],
    [PHASE.AFTERNOON]: [[[75,148,255],[38,88,210]],[[145,208,255],[85,148,210]],[[255,208,75],[198,148,18]]],
    [PHASE.EVENING]:   [[[255,78,18],[200,32,4]], [[218,58,178],[148,14,128]],[[255,158,28],[198,78,4]]],
    [PHASE.LATE]:      [[[32,22,68],[15,10,42]], [[52,16,72],[25,6,45]],   [[68,40,12],[40,18,6]]],
  };
  const phMult = {[PHASE.NIGHT]:1.0,[PHASE.MORNING]:0.65,[PHASE.AFTERNOON]:0.45,[PHASE.EVENING]:0.85,[PHASE.LATE]:0.28}[timePhase]??1;
  const bCols = phaseBokeh[timePhase] || phaseBokeh[PHASE.NIGHT];
  for (const d of BOKEH) {
    const px = d.x*W, py = d.y*H;
    const [[r1,g1,b1],[r2,g2,b2]] = bCols[d.hue];
    const a = d.a * phMult;
    const rg = ctx.createRadialGradient(px,py,0,px,py,d.rad);
    rg.addColorStop(0,`rgba(${r1},${g1},${b1},${a.toFixed(2)})`);
    rg.addColorStop(1,`rgba(${r2},${g2},${b2},0)`);
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(px,py,d.rad,0,Math.PI*2); ctx.fill();
  }

  // ── 4. Stars — night full, late dim, evening just-appearing ──────
  if (timePhase === PHASE.NIGHT || timePhase === PHASE.LATE || timePhase === PHASE.EVENING) {
    const starA = timePhase===PHASE.LATE ? 0.22 : timePhase===PHASE.EVENING ? 0.18 : 0.55;
    ctx.fillStyle = `rgba(255,255,255,${starA})`;
    for (const d of BOKEH) {
      if (d.y < 0.55) ctx.fillRect(Math.round(d.x*W), Math.round(d.y*H*0.65), 1, 1);
    }
  }

  // ── 5. Skyline silhouette ─────────────────────────────────────────
  const hY = Math.round(H * 0.78);
  // Slightly more opaque against bright afternoon sky so buildings read clearly
  const silAlpha = timePhase === PHASE.AFTERNOON ? 0.97 : 0.92;
  for (const [fx,fw,fh] of SKYLINE) {
    const bx=Math.round(fx*W), bw=Math.round(fw*W);
    const bh=Math.round(fh*H), by=hY-bh;
    ctx.fillStyle=`rgba(4,3,8,${silAlpha})`;
    ctx.fillRect(bx, by, bw, hY-by+1);
  }
  ctx.fillStyle='rgba(3,2,7,0.97)';
  ctx.fillRect(0, hY, W, H-hY);

  // ── 6. Dim overlay — keeps content readable ───────────────────────
  if (dimAmt > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dimAmt})`;
    ctx.fillRect(0,0,W,H);
  }
}

// ── Lock screen ────────────────────────────────────────────────────
function drawLock() {
  drawWallpaper(0.10);   // light dim — wallpaper shows through behind clock
  // Cracked screen overlay — appears in late phase (this isn't your phone)
  if (timePhase>=PHASE.LATE) {
    ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(W*0.55,0); ctx.lineTo(W*0.62,H*0.18);
    ctx.lineTo(W*0.58,H*0.32); ctx.lineTo(W*0.68,H*0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W*0.62,H*0.18); ctx.lineTo(W*0.72,H*0.22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W*0.58,H*0.32); ctx.lineTo(W*0.48,H*0.38); ctx.stroke();
  }
  const now=new Date();
  // Notch pill
  ctx.fillStyle='rgba(0,0,0,0.5)';
  roundRect(W/2-18,6,36,8,4); ctx.fill();

  // -- Game title -----------------------------------------------
  ctx.save();
  ctx.textAlign='center';
  ctx.lineJoin='round';
  ctx.miterLimit=2;
  ctx.font='22px Arial Narrow, Arial, sans-serif';
  // Outer glow
  ctx.shadowColor='#7040c0';
  ctx.shadowBlur=10;
  ctx.strokeStyle='#7040c0';
  ctx.lineWidth=5;
  ctx.strokeText('Read',W/2,44);
  ctx.strokeText('Receipts',W/2,68);
  // Crisp purple outline
  ctx.shadowBlur=0;
  ctx.lineWidth=3;
  ctx.strokeStyle='#9050e0';
  ctx.strokeText('Read',W/2,44);
  ctx.strokeText('Receipts',W/2,68);
  // White fill
  ctx.fillStyle='#ffffff';
  ctx.fillText('Read',W/2,44);
  ctx.fillText('Receipts',W/2,68);
  ctx.restore();

  ctx.font='bold 52px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#fff';
  ctx.fillText(`${now.getHours()%12||12}:${String(now.getMinutes()).padStart(2,'0')}`,W/2,130);
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  ctx.font='9px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.5)';
  ctx.fillText(`${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`,W/2,148);
  let cy=170;
  for (const t of Object.values(threads).filter(t=>t.unread>0).slice(0,3)) {
    const msg=t.messages.findLast(m=>!m.read)||t.messages[t.messages.length-1];
    drawLockCard(8,cy,W-16,t.contact,rel[t.contact]?.name||t.contact,msg?.text||''); cy+=62;
  }
  drawLockSlider();
}

function drawLockSlider() {
  const tx = lockThumbCX(), cy = SLIDE_Y + SLIDE_H / 2;

  // Track background
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  roundRect(SLIDE_X, SLIDE_Y, SLIDE_W, SLIDE_H, SLIDE_H / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
  roundRect(SLIDE_X, SLIDE_Y, SLIDE_W, SLIDE_H, SLIDE_H / 2); ctx.stroke();

  // Progress glow fill
  if (lockSlide.progress > 0) {
    const fillW = tx - SLIDE_X;
    ctx.save();
    ctx.beginPath();
    roundRect(SLIDE_X, SLIDE_Y, SLIDE_W, SLIDE_H, SLIDE_H / 2); ctx.clip();
    const fg = ctx.createLinearGradient(SLIDE_X, 0, SLIDE_X + fillW, 0);
    fg.addColorStop(0, 'rgba(90,140,255,0.0)');
    fg.addColorStop(1, 'rgba(90,140,255,0.3)');
    ctx.fillStyle = fg; ctx.fillRect(SLIDE_X, SLIDE_Y, fillW, SLIDE_H);
    ctx.restore();
  }

  // Label — fades as thumb moves right
  ctx.globalAlpha = Math.max(0, 1 - lockSlide.progress * 2.5);
  ctx.font = '8px Arial Narrow, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fillText('slide to unlock  ›', SLIDE_X + SLIDE_W / 2 + SLIDE_TR, cy + 3);
  ctx.globalAlpha = 1;

  // Thumb
  ctx.fillStyle = lockSlide.dragging ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.88)';
  ctx.beginPath(); ctx.arc(tx, cy, SLIDE_TR, 0, Math.PI * 2); ctx.fill();
  // Arrow chevron on thumb
  ctx.fillStyle = 'rgba(30,30,50,0.6)';
  ctx.font = 'bold 11px Arial Narrow, Arial, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('›', tx + 1, cy + 4);
  ctx.textAlign = 'left';
}

function drawLockCard(x,y,w,contactKey,sender,preview) {
  ctx.fillStyle='rgba(255,255,255,0.09)'; roundRect(x,y,w,50,10); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.13)'; ctx.lineWidth=1; roundRect(x,y,w,50,10); ctx.stroke();
  // Card centre is y+25. Avatar sits on that centre line.
  drawContactPhoto(contactKey, x+22, y+25, 13);
  // Use textBaseline='middle' so y coords ARE the visual centres — no baseline guesswork.
  // Two lines tight around centre: name at y+19, preview at y+31 (6px either side).
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font='bold 8px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#fff';
  ctx.fillText(sender, x+44, y+19);
  ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.58)';
  ctx.fillText(preview.length>28?preview.slice(0,27)+'…':preview, x+44, y+31);
  ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.28)';
  ctx.textAlign='right'; ctx.fillText('now', x+w-8, y+19); ctx.textAlign='left';
  ctx.restore();
}

// ── Home screen ────────────────────────────────────────────────────
function drawHome() {
  drawWallpaper(0.42);   // heavier dim so app icons stay readable
  // Notch pill
  ctx.fillStyle='rgba(0,0,0,0.45)';
  roundRect(W/2-18,5,36,8,4); ctx.fill();
  for (const app of APP_GRID) drawAppIcon(app);
  // Evening: show quiet-phone / epilogue prompt
  if (timePhase>=PHASE.EVENING && Object.values(threads).every(t=>!t.scriptNode)) {
    const qy=H-NAV_H-30;
    ctx.fillStyle='rgba(255,255,255,0.05)'; roundRect(8,qy,W-16,22,6); ctx.fill();
    ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,0.28)';
    ctx.fillText('the phone goes quiet  ·  tap to reflect',W/2,qy+14);
    ctx.textAlign='left';
  }
}

function drawAppIcon(app) {
  const {x,y} = app;

  // 1 � Drop shadow
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=10; ctx.shadowOffsetY=4;
  ctx.fillStyle=app.col; roundRect(x,y,APP_SZ,APP_SZ,13); ctx.fill();
  ctx.restore();

  // 2 � Base colour
  ctx.fillStyle=app.col; roundRect(x,y,APP_SZ,APP_SZ,13); ctx.fill();

  // 3 � Gradient overlay: bright top, dark bottom
  ctx.save(); roundRect(x,y,APP_SZ,APP_SZ,13); ctx.clip();
  const grad=ctx.createLinearGradient(x,y,x,y+APP_SZ);
  grad.addColorStop(0,'rgba(255,255,255,0.30)');
  grad.addColorStop(0.45,'rgba(255,255,255,0.05)');
  grad.addColorStop(1,'rgba(0,0,0,0.28)');
  ctx.fillStyle=grad; ctx.fillRect(x,y,APP_SZ,APP_SZ);
  ctx.restore();

  // 4 � Gloss pill at top
  ctx.save(); roundRect(x,y,APP_SZ,APP_SZ,13); ctx.clip();
  ctx.fillStyle='rgba(255,255,255,0.20)';
  roundRect(x+4,y+3,APP_SZ-8,APP_SZ*0.38,8); ctx.fill();
  ctx.restore();

  // 5 � Outer highlight border + inner shadow line
  ctx.strokeStyle='rgba(255,255,255,0.22)'; ctx.lineWidth=1.5;
  roundRect(x,y,APP_SZ,APP_SZ,13); ctx.stroke();
  ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=1;
  roundRect(x+1,y+1,APP_SZ-2,APP_SZ-2,12); ctx.stroke();

  // 6 � Emoji
  ctx.font='24px sans-serif'; ctx.textAlign='center';
  ctx.fillText(app.icon,x+APP_SZ/2,y+APP_SZ/2+9);

  // 7 � Badges
  let badge=0;
  if (app.id==='messages') badge=Object.values(threads).reduce((s,t)=>s+(t.unread||0),0);
  if (app.id==='calls'&&timePhase>=PHASE.AFTERNOON&&!voicemails[0].listened) badge=1;
  if (app.id==='music'&&musicState.playing) {
    ctx.fillStyle=TRACKS[musicState.idx]?.col||'#8030a0';
    ctx.beginPath(); ctx.arc(x+APP_SZ-5,y+5,7,0,Math.PI*2); ctx.fill();
    ctx.font='bold 8px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#fff'; ctx.textAlign='center';
    ctx.fillText('\u266b',x+APP_SZ-5,y+9);
    badge=-1;
  }
  if (badge>0) {
    ctx.fillStyle='#e53935'; ctx.beginPath();
    ctx.arc(x+APP_SZ-5,y+5,7,0,Math.PI*2); ctx.fill();
    ctx.font='bold 7px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#fff'; ctx.textAlign='center';
    ctx.fillText(String(badge),x+APP_SZ-5,y+8);
  }

  // 8 � Label with shadow so it reads over wallpaper
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=5;
  ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#fff'; ctx.textAlign='center';
  ctx.fillText(app.label,x+APP_SZ/2,y+APP_SZ+13);
  ctx.restore();
  ctx.textAlign='left';
}

// ── Messages list ──────────────────────────────────────────────────
function drawMsgList() {
  ctx.fillStyle='#0d0d16'; ctx.fillRect(0,0,W,H);
  appHeader('Messages');
  const listTop = STATUS_H+36, listBot = H - NAV_H;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, listTop, W, listBot - listTop); ctx.clip();
  let ry = listTop - msgListScrollY;
  for (const [key,t] of Object.entries(threads)) { drawThreadRow(key,t,ry); ry+=56; }
  ctx.restore();
}

function drawThreadRow(key,t,y) {
  const r=rel[key], last=t.messages[t.messages.length-1];
  ctx.fillStyle=t.unread>0?'rgba(60,140,74,0.07)':'rgba(255,255,255,0.02)';
  ctx.fillRect(0,y,W,55);
  ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(52,y+54,W-52,1);
  drawContactPhoto(key, 28, y+27, 18);
  ctx.textAlign='left';
  ctx.font=t.unread>0?'bold 9px Arial Narrow, Arial, sans-serif':'9px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#fff';
  ctx.fillText(r?.name||key,54,y+22);
  ctx.font='8px Arial Narrow, Arial, sans-serif';
  ctx.fillStyle=t.unread>0?'rgba(255,255,255,0.8)':'rgba(255,255,255,0.38)';
  const prev=last?(last.from==='me'?'You: '+last.text:last.text):'';
  ctx.fillText(prev.length>26?prev.slice(0,25)+'…':prev,54,y+37);
  if (last) {
    ctx.textAlign='right'; ctx.font='6px Arial Narrow, Arial, sans-serif';
    ctx.fillStyle='rgba(255,255,255,0.28)'; ctx.fillText(last.time,W-10,y+22); ctx.textAlign='left';
  }
  if (t.unread>0) { ctx.fillStyle='#3c8c4a'; ctx.beginPath(); ctx.arc(W-13,y+33,5,0,Math.PI*2); ctx.fill(); }
}

// ── Thread view ────────────────────────────────────────────────────
function drawThread() {
  if (!activeThreadKey) return;
  const t=threads[activeThreadKey], r=rel[activeThreadKey];
  const node=t.scriptNode?SCRIPT[t.scriptNode]:null;
  ctx.fillStyle='#0d0d16'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(12,12,22,0.97)'; ctx.fillRect(0,STATUS_H,W,34);
  ctx.fillStyle='rgba(255,255,255,0.07)'; ctx.fillRect(0,STATUS_H+33,W,1);
  ctx.font='11px Arial Narrow, Arial, sans-serif'; ctx.textAlign='left'; ctx.fillStyle='#6aacff'; ctx.fillText('‹',8,STATUS_H+22);
  drawContactPhoto(activeThreadKey, W/2, STATUS_H+11, 9);
  ctx.font='bold 9px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#fff';
  ctx.fillText(r?.name||activeThreadKey,W/2,STATUS_H+30);
  ctx.textAlign='left';
  const hasChoices=node?.choices&&!choiceMade&&!typingActive;
  const choiceH=hasChoices?node.choices.length*26+10:0;
  const typingH=typingActive?28:0;
  const bubbleBot=H-NAV_H-choiceH-typingH-4;
  const bubbleTop=STATUS_H+36;
  // Clip the bubble area so scrolled content doesn't bleed over header or choices
  ctx.save();
  ctx.beginPath(); ctx.rect(0, bubbleTop, W, bubbleBot-bubbleTop); ctx.clip();
  drawBubbles(t, bubbleTop, bubbleBot + threadScrollY);
  ctx.restore();
  if (typingActive) drawTyping(bubbleBot+4);
  if (hasChoices)   drawChoices(node.choices,bubbleBot+typingH);
  // Scroll hint: fade + chevron at top of bubble area if there's more history above
  if (threadScrollY > 0) {
    const fadeG = ctx.createLinearGradient(0, bubbleTop, 0, bubbleTop+28);
    fadeG.addColorStop(0,'rgba(13,13,22,0.92)'); fadeG.addColorStop(1,'rgba(13,13,22,0)');
    ctx.fillStyle = fadeG; ctx.fillRect(0, bubbleTop, W, 28);
  }
  if (threadScrollY < 1) {
    ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center';
    ctx.fillStyle='rgba(255,255,255,0.15)';
    ctx.fillText('scroll up for history', W/2, bubbleBot - 6);
    ctx.textAlign='left';
  }
}

function drawBubbles(t,top,bottom) {
  let y=bottom-2;
  for (let i=t.messages.length-1;i>=0;i--) {
    const msg=t.messages[i];

    // ── Date separator chip ──────────────────────────────────────
    if (msg.from==='date') {
      y-=22;
      if (y+16>=top) {
        ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center';
        const tw=ctx.measureText(msg.text).width+16;
        ctx.fillStyle='rgba(255,255,255,0.07)';
        roundRect(W/2-tw/2,y,tw,14,7); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,0.32)';
        ctx.fillText(msg.text,W/2,y+10);
        ctx.textAlign='left';
      }
      continue;
    }

    const isMe=msg.from==='me';
    const maxBW=190,padX=9,padY=7;
    const lines=wrapText(msg.text,maxBW-padX*2,'8px Arial Narrow, Arial, sans-serif');
    const bH=lines.length*12+padY*2;
    const bW=Math.min(maxBW,Math.ceil(longestLine(lines,'8px Arial Narrow, Arial, sans-serif'))+padX*2+4);
    y-=bH+7;
    if (y+bH<top) break;
    const bX=isMe?W-bW-10:10;
    ctx.fillStyle=isMe?'#1d5fa8':'#252535';
    ctx.beginPath();
    if (isMe) { ctx.moveTo(bX+bW,y+bH-10); ctx.lineTo(bX+bW+6,y+bH-4); ctx.lineTo(bX+bW-4,y+bH-4); }
    else       { ctx.moveTo(bX,y+bH-10);    ctx.lineTo(bX-6,y+bH-4);    ctx.lineTo(bX+4,y+bH-4);    }
    ctx.fill();
    ctx.fillStyle=isMe?'#1d5fa8':'#252535'; roundRect(bX,y,bW,bH,10); ctx.fill();
    ctx.font='8px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#f0f0f0'; ctx.textAlign='left';
    for (let li=0;li<lines.length;li++) ctx.fillText(lines[li],bX+padX,y+padY+10+li*12);
    if (isMe&&i===t.messages.length-1) {
      ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.28)'; ctx.textAlign='right';
      ctx.fillText(settings.readReceipts?'Read':'Delivered',W-10,y+bH+8);
    }
    if (i===0||i%4===0) {
      ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.2)';
      ctx.textAlign='center'; ctx.fillText(msg.time,W/2,y-3);
    }
    ctx.textAlign='left';
  }
}

function drawTyping(y) {
  const phase=(totalTime*2.8)%3;
  ctx.fillStyle='#252535'; roundRect(12,y+2,46,20,10); ctx.fill();
  for (let d=0;d<3;d++) {
    ctx.fillStyle=`rgba(200,200,210,${Math.floor(phase)===d?1:0.25})`;
    ctx.beginPath(); ctx.arc(24+d*11,y+12,3,0,Math.PI*2); ctx.fill();
  }
}

function drawChoices(choices,startY) {
  const bH=22,gap=4;
  ctx.globalAlpha=choiceAnim;
  let by=startY+4;
  for (const c of choices) {
    const silent=!!c.silent;
    ctx.fillStyle='rgba(0,0,0,0.35)'; roundRect(9,by+2,W-18,bH,6); ctx.fill();
    ctx.fillStyle=silent?'rgba(45,45,55,0.92)':'rgba(22,70,140,0.92)'; roundRect(8,by,W-16,bH,6); ctx.fill();
    ctx.strokeStyle=silent?'rgba(130,130,150,0.3)':'rgba(80,140,255,0.4)'; ctx.lineWidth=1;
    roundRect(8,by,W-16,bH,6); ctx.stroke();
    ctx.font='8px Arial Narrow, Arial, sans-serif'; ctx.fillStyle=silent?'rgba(255,255,255,0.45)':'#fff';
    ctx.textAlign='left'; ctx.fillText(c.text,16,by+bH/2+3);
    by+=bH+gap;
  }
  ctx.globalAlpha=1; ctx.textAlign='left';
}

// ── Notes app ──────────────────────────────────────────────────────
function drawNotes() {
  ctx.fillStyle='#0d0d16'; ctx.fillRect(0,0,W,H);
  appHeader('Notes');
  // Sort newest first
  const sorted=[...notes].reverse();
  let ry=STATUS_H+40;
  for (const note of sorted) {
    if (ry>H-NAV_H-10) break;
    const rec = note.recovered;
    ctx.fillStyle=rec?'rgba(255,80,60,0.04)':'rgba(255,220,80,0.04)';
    roundRect(8,ry,W-16,52,6); ctx.fill();
    ctx.strokeStyle=rec?'rgba(255,80,60,0.18)':'rgba(255,220,80,0.1)';
    ctx.lineWidth=1; roundRect(8,ry,W-16,52,6); ctx.stroke();
    ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.textAlign='right';
    ctx.fillStyle=rec?'rgba(255,120,80,0.5)':'rgba(255,255,255,0.25)';
    ctx.fillText(note.time,W-16,ry+12);
    if (rec) {
      ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.textAlign='left';
      ctx.fillStyle='rgba(255,100,60,0.45)';
      ctx.fillText('recovered',16,ry+12);
    }
    ctx.textAlign='left'; ctx.font='8px Arial Narrow, Arial, sans-serif';
    ctx.fillStyle=rec?'rgba(255,200,180,0.65)':'rgba(255,255,220,0.85)';
    const lines=wrapText(note.body,W-40,'8px Arial Narrow, Arial, sans-serif');
    for (let li=0;li<Math.min(lines.length,3);li++) ctx.fillText(lines[li],16,ry+14+li*12);
    ry+=58;
  }
}

// ── Photos app ─────────────────────────────────────────────────────
function drawPhotos() {
  ctx.fillStyle='#080810'; ctx.fillRect(0,0,W,H);
  appHeader('Photos');
  const py=STATUS_H+32, ph=H-NAV_H-py-24, pw=W-16;
  drawNightScene(8,py,pw,ph,photoZoom);
  ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center';
  ctx.fillStyle='rgba(255,255,255,0.28)';
  ctx.fillText(photoZoom?'tap to zoom out':'tap to zoom',W/2,H-NAV_H-6);
  ctx.textAlign='left';
}

function drawNightScene(x,y,w,h,zoomed) {
  ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
  const skyG=ctx.createLinearGradient(x,y,x,y+h*0.55);
  skyG.addColorStop(0,'#050a18'); skyG.addColorStop(1,'#0c1830');
  ctx.fillStyle=skyG; ctx.fillRect(x,y,w,h);
  const stars=[[0.12,0.08],[0.34,0.05],[0.55,0.12],[0.78,0.04],[0.9,0.09],
               [0.22,0.15],[0.66,0.07],[0.45,0.03],[0.85,0.14],[0.05,0.12]];
  ctx.fillStyle='rgba(255,255,255,0.6)';
  for (const [fx,fy] of stars) ctx.fillRect(Math.round(x+fx*w),Math.round(y+fy*h),1,1);
  const bldgs=[{fx:0,fw:0.18,fh:0.52,col:'#111820'},{fx:0.16,fw:0.14,fh:0.38,col:'#0e1520'},
               {fx:0.28,fw:0.22,fh:0.60,col:'#12181e'},{fx:0.48,fw:0.16,fh:0.44,col:'#0e1824'},
               {fx:0.62,fw:0.20,fh:0.55,col:'#111c22'},{fx:0.80,fw:0.22,fh:0.48,col:'#0e1620'}];
  const gY=y+h*0.58;
  for (const b of bldgs) {
    const bx=x+b.fx*w, by2=gY-b.fh*h, bw=b.fw*w, bh=b.fh*h;
    ctx.fillStyle=b.col; ctx.fillRect(Math.round(bx),Math.round(by2),Math.round(bw),Math.round(bh));
    const cols=Math.floor(bw/8), rows=Math.floor(bh/9);
    for (let r=1;r<rows-1;r++) for (let c=1;c<cols;c++) {
      if (((r*13+c*7)%5)>1) {
        ctx.fillStyle=((r*11+c*5)%4===0)?'rgba(255,240,140,0.7)':'rgba(255,240,140,0.2)';
        ctx.fillRect(Math.round(bx+c*8-2),Math.round(by2+r*9+2),3,4);
      }
    }
  }
  const pavG=ctx.createLinearGradient(x,gY,x,y+h);
  pavG.addColorStop(0,'#1c2028'); pavG.addColorStop(1,'#151820');
  ctx.fillStyle=pavG; ctx.fillRect(x,Math.round(gY),w,h-(gY-y));
  ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
  for (let py2=gY+8;py2<y+h;py2+=10) { ctx.beginPath(); ctx.moveTo(x,py2); ctx.lineTo(x+w,py2); ctx.stroke(); }
  const lX=x+w*0.62, lY=gY-h*0.28;
  ctx.strokeStyle='#334'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(lX,gY); ctx.lineTo(lX,lY); ctx.lineTo(lX+12,lY); ctx.stroke();
  ctx.fillStyle='#ffefa0'; ctx.beginPath(); ctx.arc(lX+12,lY,3,0,Math.PI*2); ctx.fill();
  const lg=ctx.createRadialGradient(lX+12,lY,0,lX+12,lY,40);
  lg.addColorStop(0,'rgba(255,240,140,0.18)'); lg.addColorStop(1,'rgba(255,240,140,0)');
  ctx.fillStyle=lg; ctx.beginPath(); ctx.arc(lX+12,lY,40,0,Math.PI*2); ctx.fill();
  const f1X=x+w*(zoomed?0.50:0.54), f2X=x+w*(zoomed?0.62:0.64);
  const fS=zoomed?1.6:1.0;
  drawFigure(f1X,gY,fS,'#1a1a2a'); drawFigure(f2X,gY,fS,'#1e1a28');
  if (zoomed) {
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(f1X+6*fS,gY-14*fS); ctx.lineTo(f2X-2*fS,gY-12*fS); ctx.stroke();
  }
  // Timestamp — the anomaly
  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(x+w-66,y+h-18,62,14);
  ctx.font='bold 7px Arial Narrow, Arial, sans-serif'; ctx.textAlign='right';
  ctx.fillStyle=zoomed?'#ffcc44':'rgba(255,255,255,0.6)';
  ctx.fillText('12:31 AM',x+w-6,y+h-6);
  // Location tag — only after timeline revealed
  if (flags.has('alex_timeline_revealed')) {
    ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.textAlign='left'; ctx.fillStyle='rgba(255,255,255,0.35)';
    ctx.fillText('near Riley St',x+8,y+h-6);
  }
  if (zoomed && flags.has('morgan_night_ok')) {
    ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='rgba(255,90,90,0.55)';
    ctx.fillText('Morgan texted at 11:42 PM',x+w/2,y+h-22);
  }
  ctx.restore();
}

function drawFigure(cx,gY,s,col) {
  ctx.fillStyle=col;
  ctx.fillRect(Math.round(cx-3*s),Math.round(gY-20*s),Math.round(6*s),Math.round(14*s));
  ctx.beginPath(); ctx.arc(Math.round(cx),Math.round(gY-22*s),Math.round(4*s),0,Math.PI*2); ctx.fill();
  ctx.fillRect(Math.round(cx-3*s),Math.round(gY-6*s),Math.round(2*s),Math.round(6*s));
  ctx.fillRect(Math.round(cx+1*s),Math.round(gY-6*s),Math.round(2*s),Math.round(6*s));
}

// ── Calls app ──────────────────────────────────────────────────────
function drawCalls() {
  ctx.fillStyle='#0d0d16'; ctx.fillRect(0,0,W,H);
  appHeader('Calls');

  let ry=STATUS_H+36;

  // Call log
  for (const entry of callLog) {
    ctx.fillStyle='rgba(255,255,255,0.02)'; ctx.fillRect(0,ry,W,42);
    ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(14,ry+41,W-14,1);

    // Avatar
    drawContactPhoto(entry.key, 28, ry+21, 14);

    // Type icon + name
    ctx.textAlign='left';
    const typeCol = entry.type==='missed'?'#e53935': entry.type==='outgoing'?'#6aacff':'rgba(255,255,255,0.5)';
    const typeIcon = entry.type==='missed'?'↙':'↗';
    ctx.font='8px Arial Narrow, Arial, sans-serif'; ctx.fillStyle=typeCol;
    ctx.fillText(typeIcon,50,ry+16);
    ctx.font=entry.type==='missed'?'bold 9px Arial Narrow, Arial, sans-serif':'9px Arial Narrow, Arial, sans-serif';
    ctx.fillStyle=entry.type==='missed'?'#e87070':'#fff';
    ctx.fillText(entry.name,62,ry+16);
    ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.35)';
    ctx.fillText(entry.time,62,ry+30);
    if (entry.note) {
      ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(220,120,80,0.65)';
      ctx.fillText(entry.note, 62 + ctx.measureText(entry.time).width + 6, ry+30);
    }
    ry+=43;
  }

  // Voicemail section
  ry+=8;
  ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.textAlign='left';
  ctx.fillText('VOICEMAIL',14,ry);
  ry+=10;

  const vm=voicemails[0];
  const vmBg=vm.listened?'rgba(255,255,255,0.02)':'rgba(232,80,80,0.07)';
  ctx.fillStyle=vmBg; roundRect(8,ry,W-16,callsVoicemailOpen?72:34,6); ctx.fill();
  ctx.strokeStyle=vm.listened?'rgba(255,255,255,0.06)':'rgba(232,80,80,0.3)'; ctx.lineWidth=1;
  roundRect(8,ry,W-16,callsVoicemailOpen?72:34,6); ctx.stroke();

  // VM header row
  drawContactPhoto('morgan', 26, ry+17, 10);
  ctx.font=vm.listened?'9px Arial Narrow, Arial, sans-serif':'bold 9px Arial Narrow, Arial, sans-serif';
  ctx.fillStyle=vm.listened?'#aaa':'#fff'; ctx.fillText('Morgan',44,ry+13);
  ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.35)';
  ctx.fillText(`${vm.time}  ·  ${vm.duration}`,44,ry+26);
  if (!vm.listened) {
    ctx.fillStyle='#e53935'; ctx.beginPath(); ctx.arc(W-18,ry+17,5,0,Math.PI*2); ctx.fill();
  }

  if (callsVoicemailOpen) {
    // Transcript or listen prompt
    ry+=36;
    ctx.fillStyle='rgba(0,0,0,0)';
    if (vm.listened) {
      ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,220,0.75)';
      const lines=wrapText(vm.transcript,W-44,'7px Arial Narrow, Arial, sans-serif');
      for (let li=0;li<Math.min(lines.length,4);li++) ctx.fillText(lines[li],18,ry+li*11);
    } else {
      ctx.fillStyle='rgba(100,160,255,0.8)'; roundRect(W/2-40,ry,80,22,5); ctx.fill();
      ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#fff';
      ctx.fillText('▶  Listen',W/2,ry+14);
      ctx.textAlign='left';
    }
  }

  // Call-back section — appears in evening phase if not already called
  if (timePhase>=PHASE.EVENING && !flags.has('called_morgan_back')) {
    const cby=H-NAV_H-36;
    ctx.fillStyle='rgba(60,140,74,0.12)'; roundRect(8,cby,W-16,28,6); ctx.fill();
    ctx.strokeStyle='rgba(60,140,74,0.35)'; ctx.lineWidth=1; roundRect(8,cby,W-16,28,6); ctx.stroke();
    ctx.font='8px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#7ed87f';
    ctx.fillText('📞  Call Morgan back',W/2,cby+17);
    ctx.textAlign='left';
  }

  // Call-back overlay
  if (callBack.active) drawCallOverlay();
}

// ── Music app ──────────────────────────────────────────────────────
// Returns the volume slider track rect {x,y,w} for both draw and hit-test
function musicVolRect() {
  const artY = STATUS_H + 44, artS = 130;
  const infoY = artY + artS + 16;
  const progY = infoY + 24;
  const ctrlY = progY + 28;
  return { x:26, y:ctrlY + 52, w:W - 52 };
}

function drawMusic() {
  ctx.fillStyle='#0d0d16'; ctx.fillRect(0,0,W,H);
  if (musicState.view==='player' && musicState.idx>=0) drawMusicPlayer();
  else drawMusicList();
}

function drawMusicList() {
  appHeader('Music');
  let ry = STATUS_H+36;

  // Mini now-playing bar
  if (musicState.idx>=0) {
    const t=TRACKS[musicState.idx];
    ctx.fillStyle=t.col+'28'; ctx.fillRect(0,ry,W,38);
    ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(0,ry+37,W,1);
    ctx.fillStyle=t.col; roundRect(10,ry+7,24,24,5); ctx.fill();
    ctx.font='13px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#fff';
    ctx.fillText(musicState.playing?'⏸':'▶',22,ry+25);
    ctx.textAlign='left';
    ctx.font='bold 8px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#fff';
    const titleStr = t.title.length>22 ? t.title.slice(0,21)+'…' : t.title;
    ctx.fillText(titleStr,42,ry+17);
    ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.fillStyle=t.col;
    ctx.fillText(musicState.playing?'♫ now playing':'paused',42,ry+30);
    ry+=42;
  }

  for (let i=0;i<TRACKS.length;i++) {
    if (ry+34>H-NAV_H) break;
    const t=TRACKS[i], active=i===musicState.idx;
    ctx.fillStyle=active?t.col+'20':'rgba(255,255,255,0.015)';
    ctx.fillRect(0,ry,W,34);
    ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(44,ry+33,W-44,1);
    // Color swatch
    ctx.fillStyle=t.col; roundRect(10,ry+7,20,20,4); ctx.fill();
    ctx.font='bold 8px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.fillText(i+1,20,ry+21);
    ctx.textAlign='left';
    ctx.font=active?'bold 8px Arial Narrow, Arial, sans-serif':'8px Arial Narrow, Arial, sans-serif';
    ctx.fillStyle=active?'#fff':'rgba(255,255,255,0.75)';
    ctx.fillText(t.title.length>26?t.title.slice(0,25)+'…':t.title,40,ry+22);
    // Playing dots animation
    if (active&&musicState.playing) {
      const d='.'.repeat(Math.floor(totalTime*3)%4);
      ctx.font='8px Arial Narrow, Arial, sans-serif'; ctx.textAlign='right'; ctx.fillStyle=t.col;
      ctx.fillText('♫'+d,W-10,ry+22); ctx.textAlign='left';
    }
    ry+=34;
  }
}

function drawMusicPlayer() {
  appHeader('Music');
  const t=TRACKS[musicState.idx];
  const audio=musicState.audio;

  // Album art
  const artX=Math.round((W-130)/2), artY=STATUS_H+44, artS=130, artR=14;
  // Glow
  const glow=ctx.createRadialGradient(artX+artS/2,artY+artS/2,0,artX+artS/2,artY+artS/2,artS*0.9);
  glow.addColorStop(0,t.col+'44'); glow.addColorStop(1,t.col+'00');
  ctx.fillStyle=glow; ctx.fillRect(artX-20,artY-20,artS+40,artS+40);
  // Art background
  const artG=ctx.createLinearGradient(artX,artY,artX+artS,artY+artS);
  artG.addColorStop(0,t.col+'cc'); artG.addColorStop(1,t.col+'55');
  ctx.save(); roundRect(artX,artY,artS,artS,artR); ctx.clip();
  ctx.fillStyle=artG; ctx.fillRect(artX,artY,artS,artS);
  // Abstract shapes
  ctx.globalAlpha=0.18; ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.arc(artX+artS*0.28,artY+artS*0.32,artS*0.22,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(artX+artS*0.76,artY+artS*0.70,artS*0.16,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=1;
  // Spinning vinyl grooves
  const cx2=artX+artS/2, cy2=artY+artS/2;
  const spin=musicState.playing?totalTime*1.2:0;
  ctx.save(); ctx.translate(cx2,cy2); ctx.rotate(spin);
  ctx.fillStyle='rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.arc(0,0,artS*0.35,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1;
  for (let r=artS*0.12;r<artS*0.34;r+=5) { ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke(); }
  ctx.fillStyle='rgba(20,16,30,0.9)';
  ctx.beginPath(); ctx.arc(0,0,artS*0.07,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=t.col+'cc';
  ctx.beginPath(); ctx.arc(0,0,artS*0.04,0,Math.PI*2); ctx.fill();
  ctx.restore(); ctx.restore();

  // Track info
  const infoY=artY+artS+16;
  ctx.font='bold 10px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#fff';
  const displayTitle = t.title.length>24 ? t.title.slice(0,23)+'…' : t.title;
  ctx.fillText(displayTitle,W/2,infoY);
  ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.3)';
  ctx.fillText(`${musicState.idx+1}  /  ${TRACKS.length}`,W/2,infoY+13);

  // Progress bar
  const progX=16, progY=infoY+24, progW=W-32;
  const dur=audio?.duration, cur=audio?.currentTime||0;
  const pct=(dur&&!isNaN(dur))?cur/dur:0;
  ctx.fillStyle='rgba(255,255,255,0.1)'; roundRect(progX,progY,progW,4,2); ctx.fill();
  if (pct>0) { ctx.fillStyle=t.col; roundRect(progX,progY,Math.round(progW*pct),4,2); ctx.fill(); }
  // Scrubber thumb
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(progX+Math.round(progW*pct),progY+2,5,0,Math.PI*2); ctx.fill();
  // Times
  ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.28)';
  ctx.textAlign='left';  ctx.fillText(fmtTime(cur),progX,progY+14);
  ctx.textAlign='right'; ctx.fillText(fmtTime(dur),progX+progW,progY+14);

  // Controls
  const ctrlY=progY+28, cx=W/2;
  // Prev
  ctx.font='20px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,0.65)';
  ctx.fillText('⏮',cx-52,ctrlY+16);
  // Play/Pause button
  ctx.fillStyle=t.col; ctx.beginPath(); ctx.arc(cx,ctrlY+12,20,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(cx,ctrlY+12,20,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='18px Arial Narrow, Arial, sans-serif';
  ctx.fillText(musicState.playing?'⏸':'▶',cx+(musicState.playing?0:1),ctrlY+18);
  // Next
  ctx.fillStyle='rgba(255,255,255,0.65)'; ctx.font='20px Arial Narrow, Arial, sans-serif';
  ctx.fillText('⏭',cx+52,ctrlY+16);

  // ── Volume slider ──────────────────────────────────────────────────
  const {x:vx, y:vy, w:vw} = musicVolRect();
  const vol = musicState.volume;
  const volFill = Math.round(vw * vol);
  const btnR = 8, btnCY = vy + 2;

  // Label + percentage
  ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.35)';
  ctx.textAlign='left';  ctx.fillText('VOLUME', vx, vy - 9);
  ctx.textAlign='right'; ctx.fillText(Math.round(vol*100)+'%', vx+vw, vy - 9);

  // Track (inactive)
  ctx.fillStyle='rgba(255,255,255,0.10)';
  roundRect(vx, vy, vw, 4, 2); ctx.fill();
  // Track (filled)
  if (volFill > 0) {
    ctx.fillStyle = t.col;
    roundRect(vx, vy, volFill, 4, 2); ctx.fill();
  }
  // Thumb
  const thumbX = vx + volFill;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = t.col; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(thumbX, btnCY, 5, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
}

function onClickMusic(mx,my) {
  if (musicState.view==='player') { onClickMusicPlayer(mx,my); return; }
  // List view
  let ry=STATUS_H+36;
  if (musicState.idx>=0) {
    if (my>=ry&&my<ry+42) {
      if (mx>=10&&mx<=34) { musicToggle(); return; }
      musicState.view='player'; return;
    }
    ry+=42;
  }
  for (let i=0;i<TRACKS.length;i++) {
    if (my>=ry&&my<ry+34) {
      if (i===musicState.idx) { musicState.view='player'; }
      else musicPlay(i);
      return;
    }
    ry+=34;
    if (ry>H-NAV_H) break;
  }
}

function onClickMusicPlayer(mx,my) {
  const artS=130, artY=STATUS_H+44;
  const infoY=artY+artS+16;
  const progX=16, progY=infoY+24, progW=W-32;
  const ctrlY=progY+28, cx=W/2;
  const audio=musicState.audio;

  // Seek — tap on progress bar
  if (my>=progY-6&&my<=progY+16&&audio?.duration) {
    const t=Math.max(0,Math.min(1,(mx-progX)/progW));
    audio.currentTime=t*audio.duration; return;
  }
  // Prev
  if (mx>=cx-68&&mx<=cx-32&&my>=ctrlY&&my<ctrlY+32) { musicSkip(-1); return; }
  // Play/Pause
  if (Math.hypot(mx-cx,my-(ctrlY+12))<=22) { musicToggle(); return; }
  // Next
  if (mx>=cx+32&&mx<=cx+68&&my>=ctrlY&&my<ctrlY+32) { musicSkip(1); return; }
  // Volume — tap anywhere on the track area to set
  const {x:vx,y:vy,w:vw}=musicVolRect();
  if (my>=vy-10&&my<=vy+14&&mx>=vx&&mx<=vx+vw) {
    musicState.volume=Math.max(0,Math.min(1,(mx-vx)/vw));
    if (musicState.audio) musicState.audio.volume=musicState.volume;
  }
}

// ── Settings ───────────────────────────────────────────────────────
function drawSettings() {
  ctx.fillStyle='#0d0d16'; ctx.fillRect(0,0,W,H);
  appHeader('Settings');
  let ry=STATUS_H+44;
  for (const row of SETTING_ROWS) {
    ctx.fillStyle='rgba(255,255,255,0.02)'; ctx.fillRect(0,ry,W,36);
    ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(0,ry+35,W,1);
    ctx.font='9px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#eee'; ctx.fillText(row.label,14,ry+14);
    ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.fillText(row.sub,14,ry+27);
    const on=settings[row.key], tx=W-46, ty=ry+10;
    ctx.fillStyle=on?'#3c8c4a':'#2a2a3a'; roundRect(tx,ty,32,16,8); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(on?tx+24:tx+8,ty+8,6,0,Math.PI*2); ctx.fill();
    ry+=38;
  }
  if (flags.has('receipts_off')) {
    ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='rgba(255,80,80,0.55)';
    ctx.fillText('Morgan noticed your read receipts are off',W/2,ry+14);
    ctx.textAlign='left';
  }
}

// ── Call overlay ───────────────────────────────────────────────────
function drawCallOverlay() {
  // Full-screen dark overlay
  ctx.fillStyle='rgba(10,8,20,0.96)'; ctx.fillRect(0,0,W,H);
  // Avatar
  drawContactPhoto('morgan', W/2, 100, 28);
  ctx.font='bold 11px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='#fff'; ctx.fillText('Morgan',W/2,148);

  if (callBack.state==='calling') {
    // Pulsing ring
    const pulse=0.5+0.5*Math.sin(totalTime*4);
    ctx.strokeStyle=`rgba(${rel.morgan.color.slice(1).match(/../g).map(h=>parseInt(h,16)).join(',')},${0.2+0.3*pulse})`;
    ctx.lineWidth=2+pulse*3;
    ctx.beginPath(); ctx.arc(W/2,100,(30+pulse*8),0,Math.PI*2); ctx.stroke();
    ctx.font='8px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.45)';
    ctx.fillText('calling…',W/2,170);
  } else {
    // Transcript lines
    ctx.font='8px Arial Narrow, Arial, sans-serif'; ctx.textAlign='left';
    let ly=185;
    for (let i=0;i<callBack.lineIdx;i++) {
      const line=callBack.lines[i];
      const isMe=line.startsWith('you:');
      ctx.fillStyle=isMe?'rgba(100,160,255,0.85)':'rgba(255,255,255,0.72)';
      ctx.fillText(line,14,ly); ly+=14;
    }
    // Hang up button once all lines shown
    if (callBack.lineIdx>=callBack.lines.length) {
      ctx.fillStyle='rgba(220,60,60,0.85)'; ctx.beginPath(); ctx.arc(W/2,H-NAV_H-30,16,0,Math.PI*2); ctx.fill();
      ctx.font='13px sans-serif'; ctx.textAlign='center'; ctx.fillText('📵',W/2,H-NAV_H-23);
    }
  }
  ctx.textAlign='left';
}

// ── Epilogue screen ────────────────────────────────────────────────
function drawEnd() {
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#080612'); g.addColorStop(1,'#0e0820');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  // Soft ambient glow
  const ag=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,160);
  ag.addColorStop(0,'rgba(80,50,120,0.12)'); ag.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=ag; ctx.fillRect(0,0,W,H);

  // Title line
  ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,0.2)';
  ctx.fillText(timePhase>=PHASE.LATE?'end of day  ·  2:47 AM':'end of day',W/2,42);

  // Closing line based on final state
  ctx.font='bold 10px Arial Narrow, Arial, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.72)';
  ctx.fillText(endingLine(),W/2,72);

  // Relationship bars — show core cast always, extras once unlocked
  const rels=[
    { name:'Morgan',  r:rel.morgan  },
    { name:'Casey',   r:rel.casey   },
    { name:'Sam',     r:rel.sam,    cond: timePhase>=PHASE.MORNING },
    { name:'Riley',   r:rel.riley   },
    { name:'Alex',    r:rel.alex    },
    { name:'Jordan',  r:rel.jordan  },
    { name:'Taylor',  r:rel.taylor,  cond: timePhase>=PHASE.MORNING },
    { name:'Drew',    r:rel.drew,    cond: timePhase>=PHASE.AFTERNOON },
    { name:'Quinn',   r:rel.quinn,   cond: timePhase>=PHASE.AFTERNOON },
    { name:'???',     r:rel.unknown, cond: timePhase>=PHASE.LATE },
  ].filter(e => e.cond===undefined || e.cond);
  let ry=106;
  for (const {name,r} of rels) {
    ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.textAlign='left'; ctx.fillStyle='rgba(255,255,255,0.35)';
    ctx.fillText(name,14,ry);
    // Trust bar
    const bw=W-90, bx=60, trust=Math.max(0,Math.min(100,r.trust));
    ctx.fillStyle='rgba(255,255,255,0.06)'; roundRect(bx,ry-8,bw,6,3); ctx.fill();
    ctx.fillStyle=r.color||'#666'; roundRect(bx,ry-8,Math.round(bw*trust/100),6,3); ctx.fill();
    ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.textAlign='right'; ctx.fillStyle='rgba(255,255,255,0.22)';
    ctx.fillText(r.tone,W-10,ry);
    ry+=22;
  }

  // Profile breakdown
  ry+=8;
  ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(14,ry,W-28,1);
  ry+=12;
  ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.textAlign='left'; ctx.fillStyle='rgba(255,255,255,0.2)';
  ctx.fillText('how you communicate',14,ry); ry+=14;
  const total=Math.max(1,profile.defensive+profile.trusting+profile.avoidant);
  const bars=[
    { label:'open',      val:profile.trusting,  col:'#5aafff' },
    { label:'guarded',   val:profile.defensive, col:'#ffaa44' },
    { label:'withdrawn', val:profile.avoidant,  col:'#aa88cc' },
  ];
  for (const b of bars) {
    const pct=b.val/total, bw2=Math.round((W-70)*pct);
    ctx.font='7px Arial Narrow, Arial, sans-serif'; ctx.textAlign='left'; ctx.fillStyle='rgba(255,255,255,0.32)';
    ctx.fillText(b.label,14,ry);
    ctx.fillStyle=b.col+'44'; roundRect(58,ry-8,(W-70),6,3); ctx.fill();
    if (bw2>0) { ctx.fillStyle=b.col; roundRect(58,ry-8,bw2,6,3); ctx.fill(); }
    ry+=16;
  }

  // Restart hint
  ctx.font='6px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,0.12)';
  ctx.fillText('tap anywhere to go back',W/2,H-16);
}

function endingLine() {
  if (flags.has('morgan_connection'))           return "you let someone in.";
  if (flags.has('unknown_connection'))          return "a stranger saw you clearly.";
  if (flags.has('casey_connection'))            return "someone who knew you told you who you were.";
  if (flags.has('morgan_told_the_truth'))       return "you said the true thing.";
  if (flags.has('called_morgan_back'))          return "you called.";
  if (flags.has('riley_sees_you'))              return "someone saw you. you let them.";
  if (flags.has('sam_real_talk_started'))       return "you left a door open with Sam.";
  if (flags.has('jordan_accountable'))          return "you got an answer. maybe not the one you wanted.";
  if (flags.has('morgan_connection_started'))   return "maybe that was enough.";
  if (flags.has('riley_connection'))            return "you made something right.";
  if (flags.has('sam_ghosted') && flags.has('casey_pushed_away')) return "you went quiet on everyone. it's a choice.";
  if (flags.has('eve_silence') || flags.has('morgan_aft_ignored')) return "you said nothing. again.";
  if (flags.has('admitted_blackout'))           return "at least you were honest about it.";
  return "the phone is quiet now.";
}

function onClickEnd(mx, my) {
  if (timePhase >= PHASE.EVENING) queueLate();
  screen = SCR.HOME;
}

// ── Shared header ──────────────────────────────────────────────────
function appHeader(title) {
  ctx.fillStyle='rgba(12,12,22,0.97)'; ctx.fillRect(0,STATUS_H,W,32);
  ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(0,STATUS_H+31,W,1);
  ctx.font='bold 11px Arial Narrow, Arial, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#fff';
  ctx.fillText(title,W/2,STATUS_H+21); ctx.textAlign='left';
}

// ── Utilities ──────────────────────────────────────────────────────
function wrapText(text,maxW,font) {
  ctx.font=font;
  const words=text.split(' '), lines=[]; let line='';
  for (const w of words) {
    const test=line?line+' '+w:w;
    if (ctx.measureText(test).width>maxW&&line) { lines.push(line); line=w; } else line=test;
  }
  if (line) lines.push(line); return lines;
}

function longestLine(lines,font) {
  ctx.font=font; return lines.reduce((m,l)=>Math.max(m,ctx.measureText(l).width),0);
}

function clockStr() {
  const n=new Date();
  return `${n.getHours()%12||12}:${String(n.getMinutes()).padStart(2,'0')} ${n.getHours()>=12?'PM':'AM'}`;
}

function roundRect(x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,  x+w,y+r,  r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h);   ctx.arcTo(x,  y+h,x,  y+h-r,r);
  ctx.lineTo(x,y+r);     ctx.arcTo(x,  y,  x+r,y,    r);
  ctx.closePath();
}

// ── Game loop ──────────────────────────────────────────────────────
function loop(ts) {
  const dt=Math.min((ts-lastTs)/1000,0.1); lastTs=ts;
  update(dt); draw(); requestAnimationFrame(loop);
}
requestAnimationFrame(ts=>{ lastTs=ts; requestAnimationFrame(loop); });



