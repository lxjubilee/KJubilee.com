#!/usr/bin/env node
/**
 * play-check.js — press play on one station in a real browser and report what
 * actually comes out.
 *
 *   node tools/play-check.js <station-slug> [origin]
 *
 * The Node suites verify the day file and the schedule maths. Neither can see
 * CORS or the autoplay policy, because both are browser rules — a station can
 * pass every test in tests/ and still be silent for a listener. This drives a
 * headless Chrome, tunes the station through the player's own entry point with
 * a real user gesture, and reports what the bar ends up reading, whether the
 * analyser is hearing anything, and any console or network error on the way.
 *
 * Exit code is 0 only if sound is actually coming out, so it is usable as the
 * last gate of an import refresh:
 *
 *   node tools/play-check.js corner-cipher                     # production
 *   node tools/play-check.js corner-cipher http://localhost:3000
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SLUG = process.argv[2];
const ORIGIN = process.argv[3] || 'https://www.kjubilee.com';
if (!SLUG) { console.error('usage: node tools/play-check.js <station-slug> [origin]'); process.exit(2); }

const CHROME = (function () {
  const candidates = [
    process.env.CHROME_PATH,
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  console.error('No Chromium-based browser found. Set CHROME_PATH.');
  process.exit(2);
})();

const PORT = 9333 + (process.pid % 500);
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'kj-play-'));

// The autoplay policy is deliberately left at its default. Relaxing it here
// would hide the exact failure this script exists to catch; the click below is
// issued with userGesture, which is what a correctly-built player needs.
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });

let id = 0;
const pending = new Map();
const consoleErrors = [];
const netFails = [];

function send(ws, method, params) {
  const msg = { id: ++id, method: method, params: params || {} };
  ws.send(JSON.stringify(msg));
  return new Promise(function (res, rej) { pending.set(msg.id, { res: res, rej: rej }); });
}

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' });
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch (e) { /* not up yet */ }
    await new Promise(function (r) { setTimeout(r, 250); });
  }
  throw new Error('chrome devtools endpoint never came up');
}

function done(code) {
  try { chrome.kill(); } catch (e) { /* already gone */ }
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { /* windows lock */ }
  process.exit(code);
}

const wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

// Tune through the player's own entry point rather than by clicking a card.
//
// Cards are not a usable handle: /radio renders `.station-item` rows with an
// `onclick="selectStation(<index>)"` built from a filtered array — no slug
// anywhere — and for a signed-out visitor that list is not rendered at all,
// only an auth prompt. `window.kjPlayer.play(slug)` is what a card click ends
// up calling, so this exercises the same path on any page that loads the
// footer player, which is every page.
//
// It is still a real browser doing real work: the day file is fetched over the
// network, the mp3 is decoded by the media stack, and CORS and the autoplay
// policy apply exactly as they would to a listener. Only the click is skipped.
const CLICK_FN = function (slug) {
  const all = window.KJ_STATIONS || [];
  const st = all.find(function (s) { return s.slug === slug; });
  if (!st) return { ok: false, why: 'slug ' + slug + ' not in KJ_STATIONS (' + all.length + ' loaded)' };
  if (!window.kjPlayer || typeof window.kjPlayer.play !== 'function') {
    return { ok: false, why: 'window.kjPlayer.play is not available on this page' };
  }
  if (typeof window.kjPlayer.isLive === 'function' && !window.kjPlayer.isLive(slug)) {
    return { ok: false, why: st.name + ' is not in the player’s LIVE list — it has no tenant, or stations-data is stale' };
  }
  window.kjPlayer.play(slug);
  return { ok: true, tag: st.name + ' (HM ' + st.hm + ', tenant ' + st.tenant + ')' };
};

// What the player itself believes, alongside the audio element's own state.
// The two disagreeing is itself a finding.
const PLAY_FN = function () {
  return window.kjPlayer && window.kjPlayer.state ? window.kjPlayer.state() : { no: 'kjPlayer.state' };
};

// The player builds its element with `new Audio()`, so it is never in the DOM
// and `document.querySelector('audio')` finds nothing even mid-song. Read the
// player's own state instead, and take the visualiser's peak bin as the
// evidence that sound is actually moving: the analyser is tapped off the live
// audio graph, so a non-zero peak cannot happen without decoded audio.
const STATE_FN = function () {
  const p = window.kjPlayer || {};
  const st = p.state ? p.state() : {};
  const vis = p.visualiser ? p.visualiser() : {};
  const txt = function (id) {
    const el = document.getElementById(id);
    return el ? String(el.innerText || '').replace(/\s+/g, ' ').trim() : '';
  };
  return {
    slug: st.slug || null,
    playing: !!st.playing,
    station: txt('kjpStation'),
    title: txt('kjpTitle'),
    sub: txt('kjpSub'),
    live: txt('kjpLive'),
    analysing: !!vis.analysing,
    audioContext: vis.context || null,
    peakBin: typeof vis.peakBin === 'number' ? vis.peakBin : null
  };
};

(async function () {
  const ws = new WebSocket(await endpoint());
  ws.onmessage = function (ev) {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push((m.params.args || []).map(function (a) {
        return a.value || a.description || a.type;
      }).join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('uncaught: ' + ((m.params.exceptionDetails.exception || {}).description || ''));
    }
    if (m.method === 'Network.loadingFailed') {
      netFails.push(m.params.type + ' ' + m.params.errorText);
    }
  };
  await new Promise(function (r) { ws.onopen = r; });

  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');
  await send(ws, 'Network.enable');

  const loaded = new Promise(function (res) {
    const prev = ws.onmessage;
    ws.onmessage = function (ev) {
      prev(ev);
      if (JSON.parse(ev.data).method === 'Page.loadEventFired') res();
    };
  });
  await send(ws, 'Page.navigate', { url: ORIGIN + '/' });
  await loaded;
  await wait(6000);

  const clicked = await send(ws, 'Runtime.evaluate', {
    returnByValue: true, userGesture: true,
    expression: '(' + CLICK_FN.toString() + ')(' + JSON.stringify(SLUG) + ')'
  });
  const c = clicked.result.value;
  if (!c || !c.ok) { console.log('CLICK FAILED: ' + JSON.stringify(c)); return done(1); }
  console.log('tuned: ' + c.tag);

  await wait(3000);
  const played = await send(ws, 'Runtime.evaluate', {
    returnByValue: true, userGesture: true,
    expression: '(' + PLAY_FN.toString() + ')()'
  });
  console.log('player state: ' + JSON.stringify(played.result.value));

  await wait(9000);

  const state = await send(ws, 'Runtime.evaluate', {
    returnByValue: true, expression: '(' + STATE_FN.toString() + ')()'
  });
  const s = state.result.value;

  console.log('');
  console.log('  tuned slug    : ' + s.slug);
  console.log('  player says   : ' + (s.playing ? 'playing' : 'PAUSED'));
  console.log('  bar reads     : ' + (s.station || '(blank)') + '  —  ' + (s.title || '(blank)'));
  console.log('                  ' + (s.sub || '') + '   [' + (s.live || '') + ']');
  console.log('  analyser      : ' + (s.analysing ? 'tapped' : 'NOT tapped') +
              '   ctx=' + s.audioContext + '   peakBin=' + s.peakBin +
              (s.peakBin === 0 ? '  (silence)' : ''));
  console.log('');
  console.log('  console errors: ' + (consoleErrors.length || 'none'));
  consoleErrors.slice(0, 6).forEach(function (e) { console.log('     ! ' + String(e).slice(0, 160)); });
  const cors = consoleErrors.filter(function (e) { return /CORS|Access-Control/i.test(String(e)); });
  console.log('  CORS problems : ' + (cors.length || 'none'));
  console.log('  failed loads  : ' + (netFails.length ? netFails.slice(0, 4).join(' | ') : 'none'));

  // Sound, not intent: the player claiming to play is not enough, the analyser
  // has to be hearing something and the bar has to name a track.
  const playing = s.playing && !!s.title && s.peakBin > 0 && cors.length === 0;
  console.log('');
  console.log(playing ? '  RESULT: PLAYING — sound is coming out.' : '  RESULT: NOT PLAYING.');
  done(playing ? 0 : 1);
})().catch(function (e) { console.error(e); done(1); });
