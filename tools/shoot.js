#!/usr/bin/env node
/**
 * shoot.js - drive a headless Chrome over CDP to screenshot a page at a given
 * device size and report layout problems. Uses Node's built-in WebSocket, so
 * there is no dependency to install.
 *
 *   node tools/shoot.js <url> <out.png> [width] [height] [mobile:0|1]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_ = process.argv[2];
const OUT = process.argv[3];
const W = Number(process.argv[4] || 1440);
const H = Number(process.argv[5] || 900);
const MOBILE = process.argv[6] === '1';

// Playwright's bundled Chromium if it is installed, otherwise whatever real
// browser this box has. CHROME_PATH overrides both.
const CHROME = (function () {
  const candidates = [
    process.env.CHROME_PATH,
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe'),
    // Forward slashes on purpose — Node accepts them on Windows and they
    // survive being edited from a shell without backslash-escaping games.
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
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'kj-shoot-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });

let id = 0;
const pending = new Map();

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

(async function () {
  const wsUrl = await endpoint();
  const ws = new WebSocket(wsUrl);

  ws.onmessage = function (ev) {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message));
      else p.res(m.result);
    }
  };

  await new Promise(function (r) { ws.onopen = r; });

  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 1, mobile: MOBILE
  });

  const loaded = new Promise(function (res) {
    const prev = ws.onmessage;
    ws.onmessage = function (ev) {
      prev(ev);
      const m = JSON.parse(ev.data);
      if (m.method === 'Page.loadEventFired') res();
    };
  });
  await send(ws, 'Page.navigate', { url: URL_ });
  await loaded;
  await new Promise(function (r) { setTimeout(r, 900); });   // let fonts + render settle

  // Layout report: horizontal overflow is the failure we actually care about.
  const probe = await send(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: '(' + function () {
      const de = document.documentElement;
      const wide = [];
      document.querySelectorAll('body *').forEach(function (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > de.clientWidth + 1 && wide.length < 8) {
          wide.push(el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0] +
            ' right=' + Math.round(r.right));
        }
      });
      return {
        viewport: de.clientWidth + 'x' + de.clientHeight,
        scrollWidth: de.scrollWidth,
        overflowX: de.scrollWidth > de.clientWidth,
        cardsPerRow: (function () {
          const row = document.querySelector('.row');
          if (!row) return 0;
          return getComputedStyle(row).gridTemplateColumns.split(' ').length;
        })(),
        cards: document.querySelectorAll('.card').length,
        shelves: document.querySelectorAll('.shelf').length,
        offenders: wide,
        // Every element actually showing a vertical scrollbar, with the screen
        // rect of that bar - handy for aiming CLIP at one.
        vscroll: (function () {
          const out = [];
          const all = [document.scrollingElement].concat(
            Array.prototype.slice.call(document.querySelectorAll('body *')));
          all.forEach(function (el) {
            if (!el) return;
            const barW = el.offsetWidth - el.clientWidth;
            if (barW < 2 || el.scrollHeight <= el.clientHeight + 2) return;
            const r = el.getBoundingClientRect();
            out.push({
              el: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
              barWidth: barW,
              clip: [Math.round(r.right - barW - 4), Math.round(Math.max(r.top, 0)), barW + 8,
                Math.round(Math.min(r.height, de.clientHeight))].join(',')
            });
          });
          return out;
        })()
      };
    } + ')()'
  });
  console.log(JSON.stringify(probe.result.value, null, 1));

  // Optional CLIP=x,y,w,h[,scale] to magnify a detail (e.g. a scrollbar).
  const params = { format: 'png' };
  if (process.env.CLIP) {
    const c = process.env.CLIP.split(',').map(Number);
    params.clip = { x: c[0], y: c[1], width: c[2], height: c[3], scale: c[4] || 1 };
  }
  const shot = await send(ws, 'Page.captureScreenshot', params);
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('wrote ' + OUT);
  done(0);
})().catch(function (e) { console.error('shoot failed: ' + e.message); done(1); });
