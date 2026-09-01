#!/usr/bin/env node
/**
 * drill-station-health.js — prove the health watch actually catches a dead
 * station, on demand, without breaking anything.
 *
 *   node tools/drill-station-health.js                  # HM361.90-EN
 *   node tools/drill-station-health.js HM350.00-EN
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 *
 * check-station-health.js is the thing standing between a station going quiet
 * and a listener being the one who notices. A monitor nobody has ever seen
 * catch anything is a promise, not a fix — and a monitor that has silently
 * stopped working looks exactly like a healthy network.
 *
 * So this hands it a real failure. An origin is stood up that proxies
 * cdn.kjubilee.com faithfully in every respect except one, and the watch is
 * pointed at it. Two failures are drilled, because they are different faults
 * needing different fixes:
 *
 *   1. THE DAY FILE IS GONE — a publish that failed, an object deleted or
 *      expired. The watch can and does repair this one itself.
 *
 *   2. THE SCHEDULE IS PERFECT AND EVERY TRACK 404s — the silent one. The
 *      station reports ON AIR, the player is handed a full day of programming,
 *      and the listener hears nothing. Until this watch existed there was no
 *      detector for it at all; it was found by somebody tuning in.
 *
 * THE CONTROL RUN MATTERS AS MUCH AS THE DRILL. The same station is checked
 * through the same proxy with nothing broken first. Without it a "FAIL" proves
 * nothing — it could just as easily be the proxy as the fault being drilled.
 *
 * Nothing in production is touched: no object is written, deleted or moved.
 * Run it after changing anything in check-station-health.js, and any time you
 * want to see the alarm work rather than assume it does.
 *
 * Exit codes: 0 the watch is trustworthy · 1 it is not.
 */
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const tenants = require(path.join(ROOT, 'tools', 'lib', 'tenants'));
const zone = require(path.join(ROOT, 'tools', 'lib', 'zone'));

const STATION = process.argv[2] || 'HM361.90-EN';   // the one that went quiet
const TODAY = zone.localDate(Date.now());
const BREAK = tenants.deliveryKey(STATION, TODAY);
const PORT = 8477;

/* Two failure modes, because they are genuinely different faults:
     'schedule' — the day file is gone      (the watch can repair this)
     'audio'    — the day file is perfect and every track behind it 404s
                  (the silent one: the station reports ON AIR, the player
                   gets a 551-entry schedule, and the listener hears nothing) */
let breakOn = null;
let proxied = 0, denied = 0;

const server = http.createServer(async (req, res) => {
    const key = req.url.replace(/^\//, '').split('?')[0];
    if (breakOn === 'schedule' && key === BREAK) {
        denied++;
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found (fire drill)');
        return;
    }
    /* Serve a REAL day file with its afternoon cut off. Everything the older
       checks look at still passes — it is valid JSON, it has hundreds of
       entries, every track in it plays — and the station is silent from early
       afternoon to midnight. */
    if (breakOn === 'coverage' && key === BREAK) {
        try {
            const up = await fetch('https://cdn.kjubilee.com/' + key);
            const j = await up.json();
            j.entries = (j.entries || []).filter(e => Number(e.t || 0) < 20000);   // ~5.5 hours
            denied++;
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(j));
        } catch (e) { res.writeHead(502); res.end(String(e.message)); }
        return;
    }
    if (breakOn === 'audio' && key.indexOf('music/') === 0) {
        denied++;
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found (fire drill)');
        return;
    }
    try {
        const up = await fetch('https://cdn.kjubilee.com/' + key, {
            headers: req.headers.range ? { Range: req.headers.range } : {},
        });
        proxied++;
        const buf = Buffer.from(await up.arrayBuffer());
        res.writeHead(up.status, { 'content-type': up.headers.get('content-type') || 'application/octet-stream' });
        res.end(buf);
    } catch (e) {
        res.writeHead(502);
        res.end(String(e.message));
    }
});

function runCheck() {
    return new Promise((resolve) => {
        execFile(process.execPath,
            [path.join(ROOT, 'tools', 'check-station-health.js'),
             '--station', STATION, '--days', '1', '--sample', '3'],
            { cwd: ROOT, env: { ...process.env, KJ_CDN_URL: 'http://127.0.0.1:' + PORT } },
            (err, stdout, stderr) => resolve({
                code: err ? err.code : 0,
                out: String(stdout || '') + String(stderr || ''),
            }));
    });
}

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '\n          ' + detail : ''));
    if (!cond) failures++;
}

server.listen(PORT, async () => {
    console.log('fire drill — ' + STATION + ' · Pacific day ' + TODAY);
    console.log('breaking key: ' + BREAK + '\n');

    console.log('CONTROL — nothing broken, the watch must pass:');
    breakOn = null;
    const control = await runCheck();
    ok('a healthy station reports healthy (exit 0)', control.code === 0,
       control.out.trim().split('\n').pop());

    console.log('\nDRILL — that station\'s day file is now missing:');
    breakOn = 'schedule';
    const drill = await runCheck();
    ok('the watch fails (exit 1)', drill.code === 1, 'exit code = ' + drill.code);
    ok('it names the right station', drill.out.indexOf(STATION) >= 0);
    ok('it names the right reason (SCHEDULE, not audio)',
       /SCHEDULE\s+HM/.test(drill.out), (drill.out.match(/SCHEDULE.*/) || [''])[0]);
    ok('it names the day that is missing', drill.out.indexOf(TODAY.replace(/-/g, '')) >= 0);
    ok('the 404 was actually served (the drill really broke something)', denied > 0,
       'denied ' + denied + ' request(s), proxied ' + proxied);

    /* ── THE SILENT FAILURE ──────────────────────────────────────────────
       This is the one that has never had a detector. The schedule publishes
       cleanly, the station shows ON AIR, and every file it names is gone. It
       is indistinguishable from a healthy station to everything except a
       listener pressing play — which is how it has always been found. */
    console.log('\nDRILL 2 — the schedule is perfect and the AUDIO is all gone:');
    breakOn = 'audio';
    denied = 0;
    const dead = await runCheck();
    ok('the watch fails on dead audio (exit 1)', dead.code === 1, 'exit code = ' + dead.code);
    ok('it says AUDIO, not SCHEDULE — the two need different fixes',
       /AUDIO\s+HM/.test(dead.out) && !/SCHEDULE\s+HM/.test(dead.out),
       (dead.out.match(/(AUDIO|SCHEDULE).*/) || [''])[0]);
    ok('it names a track that did not serve', /404 /.test(dead.out),
       (dead.out.match(/404 [^ |]+/) || [''])[0]);
    ok('the audio 404s were actually served', denied > 0, 'denied ' + denied + ' request(s)');

    /* ── THE HALF-DAY ────────────────────────────────────────────────────
       The subtlest of the three, and the reason entry count is not health: a
       schedule can be present, valid, fully playable AND still leave most of
       the day silent. */
    console.log('\nDRILL 3 — the day file stops at lunchtime:');
    breakOn = 'coverage';
    denied = 0;
    const half = await runCheck();
    ok('the watch fails on a short day (exit 1)', half.code === 1, 'exit code = ' + half.code);
    ok('it says COVERAGE — not missing, not dead audio',
       /COVERAGE\s+HM/.test(half.out), (half.out.match(/(COVERAGE|SCHEDULE|AUDIO).*/) || [''])[0]);
    ok('it says how much of the day is silent', /min early/.test(half.out),
       (half.out.match(/.*min early.*/) || [''])[0].trim());
    ok('the truncated file was actually served', denied > 0, 'served ' + denied + ' truncated file(s)');

    console.log('\n' + (failures ? failures + ' CHECK(S) FAILED — the watch is not trustworthy'
                                 : 'DRILL PASSED — the watch catches a missing schedule, a half-day\n' +
                                   'of programming, and audio that does not serve.'));
    server.close();
    process.exit(failures ? 1 : 0);
});
