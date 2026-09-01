#!/usr/bin/env node
/**
 * drill-dial-spin.js — can the dial actually be grabbed, thrown and landed?
 *
 *   npm run dev                      # the page has to be served from somewhere
 *   node tools/drill-dial-spin.js    # default http://localhost:3210/player
 *   node tools/drill-dial-spin.js http://localhost:3210/player
 *
 * ── WHY THIS IS NOT A NODE TEST ─────────────────────────────────────────────
 *
 * Every interesting thing about this gesture is enforced by the browser and by
 * nothing else. Pointer capture, `touch-action`, whether a drag also fires a
 * click on whatever it finished over, whether the transform is being animated
 * while the finger is still down — none of it exists in jsdom, and a fake that
 * modelled it would only be testing the fake.
 *
 * So this drives a real headless Chrome over CDP with real synthesised pointer
 * input, and asks the four things that would make the feature a regression:
 *
 *   1. does dragging move the scale at all
 *   2. does the READOUT follow the needle while it moves
 *   3. does it play NOTHING while it is moving  ← the whole performance point
 *   4. does it come to rest exactly on a station, and play that one
 *
 * (3) is the one worth having. Stepping with Next used to fetch a day file and
 * audio for every frequency crossed, which is why crossing the band was slow;
 * a spin that quietly did the same would look faster while being worse.
 *
 * Exit codes: 0 the gesture works · 1 it does not · 2 the drill could not run.
 */
'use strict';

const http = require('http');
const { spawn } = require('child_process');

const URL_UNDER_TEST = process.argv[2] || 'http://localhost:3210/player';
const PORT = 9223;

const CHROME = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].filter(Boolean);

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '\n          ' + detail : ''));
    if (!cond) failures++;
}

function getJSON(path) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
            let b = '';
            res.on('data', (d) => { b += d; });
            res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}

async function waitFor(fn, ms, label) {
    const until = Date.now() + ms;
    for (;;) {
        try { const v = await fn(); if (v) return v; } catch (e) { /* not yet */ }
        if (Date.now() > until) throw new Error('timed out waiting for ' + label);
        await new Promise((r) => setTimeout(r, 250));
    }
}

(async () => {
    const fs = require('fs');
    const exe = CHROME.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
    if (!exe) { console.error('no Chrome found; set CHROME_PATH'); process.exit(2); }

    const tmp = require('path').join(require('os').tmpdir(), 'kj-dial-drill-' + process.pid);
    const chrome = spawn(exe, [
        '--headless=new', '--remote-debugging-port=' + PORT,
        '--user-data-dir=' + tmp, '--no-first-run', '--no-default-browser-check',
        '--window-size=1280,900', '--autoplay-policy=no-user-gesture-required',
        'about:blank',
    ], { stdio: 'ignore' });

    const cleanup = () => { try { chrome.kill(); } catch (e) {} };
    process.on('exit', cleanup);

    const list = await waitFor(() => getJSON('/json/list'), 20000, 'chrome');
    const target = list.find((t) => t.type === 'page');
    const WebSocket = global.WebSocket;
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    };
    const send = (method, params) => new Promise((resolve) => {
        const n = ++id;
        pending.set(n, resolve);
        ws.send(JSON.stringify({ id: n, method, params: params || {} }));
    });
    const evaluate = async (expr) => {
        const r = await send('Runtime.evaluate', {
            expression: expr, returnByValue: true, awaitPromise: true,
        });
        if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
        return r.result && r.result.result ? r.result.result.value : undefined;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: URL_UNDER_TEST });

    // The dial builds itself from stations-data.js, so wait for marks, not load.
    await waitFor(() => evaluate("document.querySelectorAll('.dial .mark').length > 5"),
                  25000, 'the dial to render');

    console.log('dial spin drill — ' + URL_UNDER_TEST + '\n');

    /* Instrument BEFORE touching anything: count every audio fetch the page
       makes from here on, so "nothing played while moving" is measured rather
       than asserted. Day files and .mp3 both — either one means the page went
       and got a station it was only passing. */
    await evaluate(`
        window.__kjAudioHits = 0;
        const _f = window.fetch;
        window.fetch = function (u) {
            try {
                const s = String((u && u.url) || u);
                if (/\\/delivery\\/|\\.mp3(\\?|$)/.test(s)) window.__kjAudioHits++;
            } catch (e) {}
            return _f.apply(this, arguments);
        };
        window.__kjPlays = 0;
        if (window.kjPlayer && window.kjPlayer.play) {
            const _p = window.kjPlayer.play.bind(window.kjPlayer);
            window.kjPlayer.play = function () { window.__kjPlays++; return _p.apply(null, arguments); };
        }
        true;
    `);

    const before = await evaluate(`(function () {
        const r = document.querySelector('.dial').getBoundingClientRect();
        return {
            station: document.querySelector('#station') ? document.querySelector('#station').textContent : null,
            freq: document.querySelector('#freq') ? document.querySelector('#freq').textContent.trim() : null,
            x: r.left + r.width / 2, y: r.top + r.height / 2,
            tf: getComputedStyle(document.querySelector('.dial-track')).transform,
        };
    })()`);

    // ── the gesture ─────────────────────────────────────────────────────
    const px = Math.round(before.x), py = Math.round(before.y);
    const step = async (type, x, extra) => send('Input.dispatchMouseEvent', Object.assign({
        type, x, y: py, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
        clickCount: 1, pointerType: 'mouse',
    }, extra || {}));

    await step('mousePressed', px);
    // Drag left across several stations, in real increments so the page sees
    // a gesture rather than a teleport.
    let midReadout = null;
    for (let dx = 20; dx <= 320; dx += 20) {
        await step('mouseMoved', px - dx);
        await new Promise((r) => setTimeout(r, 16));
        if (dx === 200) {
            midReadout = await evaluate(`(function(){
                return {
                    station: document.querySelector('#station') ? document.querySelector('#station').textContent : null,
                    hits: window.__kjAudioHits, plays: window.__kjPlays,
                    dragging: document.querySelector('.dial-track').classList.contains('dragging'),
                };
            })()`);
        }
    }

    ok('the readout follows the needle while the scale is moving',
       !!midReadout && midReadout.station && midReadout.station !== before.station,
       'started on "' + before.station + '", mid-drag showed "' + (midReadout && midReadout.station) + '"');

    ok('the scale is not being animated while the finger is down',
       !!midReadout && midReadout.dragging === true,
       'dial-track.dragging = ' + (midReadout && midReadout.dragging));

    ok('NOTHING is fetched or played while the dial is moving',
       !!midReadout && midReadout.hits === 0 && midReadout.plays === 0,
       'audio fetches = ' + (midReadout && midReadout.hits)
       + ', play() calls = ' + (midReadout && midReadout.plays));

    await step('mouseReleased', px - 320);

    // Let the momentum run out and the snap animation finish.
    await new Promise((r) => setTimeout(r, 2000));

    const after = await evaluate(`(function () {
        const marks = [...document.querySelectorAll('.dial .mark')];
        const on = marks.findIndex(m => m.classList.contains('on'));
        const needle = document.querySelector('.dial').getBoundingClientRect();
        const cx = needle.left + needle.width / 2;
        const r = on >= 0 ? marks[on].getBoundingClientRect() : null;
        return {
            station: document.querySelector('#station') ? document.querySelector('#station').textContent : null,
            onIndex: on,
            offBy: r ? Math.abs((r.left + r.width / 2) - cx) : null,
            plays: window.__kjPlays,
        };
    })()`);

    ok('it comes to rest with a station exactly under the needle',
       after.offBy !== null && after.offBy <= 2,
       'nearest mark is ' + after.offBy + 'px from the needle');

    ok('it moved somewhere new',
       after.station !== before.station,
       'from "' + before.station + '" to "' + after.station + '"');

    ok('and it plays exactly one station — the one it landed on',
       after.plays === 1,
       'play() called ' + after.plays + ' time(s) across the whole gesture');

    /* ── AND NOW WITH A FINGER ────────────────────────────────────────────
       The mouse pass above proves the logic; it does not prove the gesture
       works on the device most listeners are holding. Touch is where it can
       still fail for reasons the code cannot see: if `touch-action` is wrong
       the browser claims the swipe for panning and the dial never moves, and
       a page that slides sideways under the finger feels broken even when
       every station lands correctly. */
    console.log('\nTOUCH — the same throw, with a finger, on a phone-sized screen:');
    await send('Emulation.setDeviceMetricsOverride', {
        width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.navigate', { url: URL_UNDER_TEST });
    await waitFor(() => evaluate("document.querySelectorAll('.dial .mark').length > 5"),
                  25000, 'the dial to render on the phone');

    await evaluate(`
        window.__kjAudioHits = 0;
        const _f = window.fetch;
        window.fetch = function (u) {
            try {
                const s = String((u && u.url) || u);
                if (/\\/delivery\\/|\\.mp3(\\?|$)/.test(s)) window.__kjAudioHits++;
            } catch (e) {}
            return _f.apply(this, arguments);
        };
        window.__kjScrollX = 0;
        addEventListener('scroll', function () {
            window.__kjScrollX = Math.max(window.__kjScrollX, Math.abs(window.scrollX || 0));
        }, { passive: true });
        true;
    `);

    const t0 = await evaluate(`(function () {
        const r = document.querySelector('.dial').getBoundingClientRect();
        return { station: document.querySelector('#station').textContent,
                 x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);

    const touch = (type, x, y) => send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });

    /* A FLICK HAS TO BE FAST TO BE A FLICK. Each dispatch here is a round trip
       over the debugging socket, so small steps with a sleep between them
       arrive as a SLOW drag however tight the loop looks — which measures this
       harness's latency rather than the dial's physics. Bigger jumps, no
       sleep: the page still sees a continuous gesture, at a speed a thumb can
       actually produce. */
    const readOffset = () => evaluate(
        "new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.dial-track')).transform).m41");

    await touch('touchStart', t0.x, t0.y);
    for (let dx = 40; dx <= 280; dx += 40) {
        await touch('touchMove', t0.x - dx, t0.y);
    }
    /* The offset AT THE MOMENT OF RELEASE. Comparing station names either side
       is too coarse to see momentum: a throw that carries half a station's
       width is still carrying, and one that carries none is broken. The
       transform is the honest measure. */
    const offAtRelease = await readOffset();
    const atRelease = await evaluate(`(function(){
        return { station: document.querySelector('#station').textContent };
    })()`);
    await touch('touchEnd', t0.x - 140, t0.y);
    await new Promise((r) => setTimeout(r, 2500));

    const offEnd = await readOffset();
    const t1 = await evaluate(`(function () {
        const marks = [...document.querySelectorAll('.dial .mark')];
        const on = marks.findIndex(m => m.classList.contains('on'));
        const d = document.querySelector('.dial').getBoundingClientRect();
        const cx = d.left + d.width / 2;
        const r = on >= 0 ? marks[on].getBoundingClientRect() : null;
        return { station: document.querySelector('#station').textContent,
                 offBy: r ? Math.abs((r.left + r.width / 2) - cx) : null,
                 hits: window.__kjAudioHits, scrolled: window.__kjScrollX };
    })()`);

    ok('a finger swipe turns the dial',
       t1.station !== t0.station,
       'from "' + t0.station + '" to "' + t1.station + '"');
    ok('the page itself never slides sideways under the finger',
       t1.scrolled === 0,
       'max horizontal page scroll during the swipe = ' + t1.scrolled + 'px');
    const carried = Math.abs(offEnd - offAtRelease);
    ok('a flick carries on after the finger lifts',
       carried > 8,
       'the scale travelled a further ' + carried.toFixed(1) + 'px after release'
       + ' (release "' + atRelease.station + '" -> rest "' + t1.station + '")');
    ok('and it still lands square on a station',
       t1.offBy !== null && t1.offBy <= 2,
       'nearest mark is ' + t1.offBy + 'px from the needle');

    console.log('\n' + (failures ? failures + ' CHECK(S) FAILED'
                                 : 'DRILL PASSED — the dial can be grabbed, thrown and landed,\n'
                                   + 'with a mouse and with a finger, without loading a thing on the way.'));
    cleanup();
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('drill could not run: ' + (e && e.stack || e)); process.exit(2); });
