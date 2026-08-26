#!/usr/bin/env node
/**
 * Tests what a listener HEARS — the half of the radio engine the other tests
 * cannot reach.
 *
 *   node tests/footer-player-playback.test.js
 *
 * tenant-radio.test.js checks that the published day files resolve correctly:
 * given an instant, which entry covers it. That is the arithmetic, and it was
 * never what broke. What broke was everything the player does BETWEEN those
 * answers — when a file ends a second before its slot, when one runs a minute
 * past it, when the network stalls — and none of it is visible from the day
 * file. It is only visible as sound.
 *
 * So this runs the REAL public/js/kj-footer-player.js, unmodified, against a
 * REAL schedule built from the fixture pool, on a virtual clock. Everything the
 * player touches is faked: a fake <audio> that advances its own position while
 * it is unpaused and fires 'ended' at the file's TRUE duration — which is NOT
 * the whole-second `d` the schedule carries, and that half-second is the whole
 * story — plus a fake DOM, localStorage and fetch.
 *
 * Then it asserts the three things that make a station sound broken, because
 * all three were happening and all three were reported as "songs skip or
 * randomly repeat, especially in the middle of a song":
 *
 *   CUT SHORT    a song stopped part-way to obey the schedule
 *   JUMPED       a song's position moved while it was sounding
 *   DEAD AIR     silence between songs
 *
 * The faults it runs them under are not hypothetical. Every published duration
 * is rounded to the second, so every file is up to half a second out of step
 * with its slot; the rest — a truncated object, a wrong duration, a buffering
 * stall — are the ordinary weather of a CDN.
 */
const path = require('path');
const { buildDay, poolFrom } = require('../tools/build-schedule-manifest');

const PLAYER = process.env.PLAYER_PATH ||
               path.join(__dirname, '..', 'public', 'js', 'kj-footer-player.js');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? '  — ' + detail : '')); }
}

// ── the schedule under test ─────────────────────────────────────────────────
const DATE = '2026-08-23';
const STATION = 'HM302.50-EN';
const pool = poolFrom(path.join(__dirname, 'fixtures', 'pool.json'), STATION);
const DAY_SECONDS = 86400;
const DOC = {
    schema: 'kj.tenant.day/1',
    tenant: STATION, name: 'Jubilee Gospel Fire', hm: '302.50', format: 'Gospel',
    slug: 'jubilee-gospel-fire', date: DATE, tz: 'America/Los_Angeles',
    startsAt: DATE + 'T07:00:00.000Z', seconds: DAY_SECONDS,
    cdnBase: 'https://cdn.kjubilee.com', prefix: 'music/',
    rev: 'testrev00001',
    entries: buildDay(pool, STATION, DATE, DAY_SECONDS),
};

/**
 * The true length of a file, which is never exactly its slot.
 *
 * Durations are published rounded to the whole second, so real audio sits up to
 * half a second either side — measured against the objects on cdn.kjubilee.com
 * and confirmed there: deltas of -0.44s to +0.47s across every station sampled.
 * Deterministic per url so a failure can be reproduced.
 */
function trueDuration(url, d, fault) {
    if (fault && fault.kind === 'short' && url === DOC.entries[fault.entry].u) return Math.max(5, d - fault.seconds);
    if (fault && fault.kind === 'long'  && url === DOC.entries[fault.entry].u) return d + fault.seconds;
    let h = 0;
    for (const c of url) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return d + ((h % 1000) / 1000 - 0.5);
}

// ── one session ─────────────────────────────────────────────────────────────
/**
 * Play the station for `minutes` of virtual time and report what was audible.
 *
 * The step is 100ms of virtual time; timers fire when due, the sounding element
 * advances, and after every step the audit asks the only question that matters:
 * is sound coming out, and is it the same sound as a moment ago?
 */
function session(opts) {
    const minutes = opts.minutes || 15;
    const startSec = opts.startSec || 0;
    const fault = opts.fault || null;

    const RealDate = Date;
    const realSetImmediate = setImmediate;
    const realNow = Date.now;
    const realSetTimeout = global.setTimeout, realSetInterval = global.setInterval;
    const realClearTimeout = global.clearTimeout, realClearInterval = global.clearInterval;

    const T0 = RealDate.parse(DOC.startsAt) + startSec * 1000;
    let vnow = T0, seq = 0, timers = [];
    let stalling = false;
    // A browser that has not been touched yet refuses audible playback and
    // rejects with NotAllowedError. That is what a refresh looks like.
    let blockingAutoplay = !!opts.blockAutoplay;

    Date.now = () => vnow;
    global.setTimeout  = (fn, ms) => { const id = ++seq; timers.push({ id, due: vnow + (ms || 0), fn }); return id; };
    global.setInterval = (fn, ms) => { const id = ++seq; timers.push({ id, due: vnow + ms, fn, every: ms }); return id; };
    global.clearTimeout = global.clearInterval = (id) => { timers = timers.filter(t => t.id !== id); };

    const events = [];
    const log = (kind, detail) => events.push({ at: (vnow - T0) / 1000, kind, detail });
    const short = (u) => String(u).split('/').pop().slice(0, 44);

    class FakeAudio {
        constructor() {
            this._src = ''; this._ct = 0; this.paused = true; this.readyState = 0;
            this.volume = 1; this.muted = false; this.preload = ''; this.crossOrigin = null;
            this.dataset = {}; this._l = {}; this.duration = NaN; this._srcAt = 0;
            FakeAudio.all.push(this);
        }
        get src() { return this._src; }
        set src(v) {
            this._src = v; this._ct = 0; this.readyState = 0; this.duration = NaN; this._srcAt = vnow;
            const self = this;
            global.setTimeout(function () {                    // metadata, a moment later
                if (self._src !== v) return;
                self.readyState = 4;
                const dec = decodeURIComponent(self._src);
                const e = DOC.entries.find(x => dec.indexOf(x.u) >= 0);
                self.duration = e ? trueDuration(e.u, e.d, fault) : 180;
                self.fire('loadedmetadata');
                self.fire('canplay');
            }, 300);
        }
        get currentTime() { return this._ct; }
        set currentTime(v) {
            const from = this._ct;
            this._ct = isNaN(this.duration) ? v : Math.min(v, this.duration);
            if (Math.abs(this._ct - from) > 0.35) {
                // Positioning a freshly loaded track is a JOIN, which is what
                // tuning in does. Moving one that is already sounding is a JUMP,
                // and a jump is the listener hearing the song lurch.
                const settling = this.paused || (vnow - this._srcAt) < 3000;
                log(settling ? 'join' : 'JUMP',
                    { from: +from.toFixed(2), to: +this._ct.toFixed(2), track: short(this._src) });
            }
        }
        load() {}
        play() {
            if (blockingAutoplay) {
                const e = new Error("play() failed because the user didn't interact with the document first");
                e.name = 'NotAllowedError';
                return Promise.reject(e);
            }
            this.paused = false;
            return Promise.resolve();
        }
        pause() { this.paused = true; }
        addEventListener(n, f, o) { (this._l[n] = this._l[n] || []).push({ f, once: o && o.once }); }
        removeEventListener(n, f) { if (this._l[n]) this._l[n] = this._l[n].filter(x => x.f !== f); }
        fire(n) {
            for (const l of (this._l[n] || []).slice()) {
                if (l.once) this._l[n] = this._l[n].filter(x => x !== l);
                try { l.f({ type: n }); } catch (e) { log('listener-threw', { n, e: e.message }); }
            }
        }
        tick(dt) {
            if (this.paused || this.readyState < 1 || stalling) return;
            this._ct += dt / 1000;
            if (!isNaN(this.duration) && this._ct >= this.duration) {
                this._ct = this.duration; this.paused = true;
                log('ended', { track: short(this._src), at: +this._ct.toFixed(2) });
                this.fire('ended');
            }
        }
    }
    FakeAudio.all = [];

    const byId = {};
    class El {
        constructor(tag) {
            this.tagName = String(tag || 'div').toUpperCase();
            this.children = []; this.dataset = {}; this._attrs = {}; this._l = {};
            this.style = { setProperty() {}, removeProperty() {} };
            this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
            this.textContent = ''; this.value = ''; this._id = '';
        }
        get id() { return this._id; }
        set id(v) { this._id = v; byId[v] = this; }
        set innerHTML(html) { const re = /id="([^"]+)"/g; let m; while ((m = re.exec(html))) byId[m[1]] = new El('div'); }
        get innerHTML() { return ''; }
        setAttribute(k, v) { this._attrs[k] = v; if (k === 'id') this.id = v; }
        getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
        appendChild(c) { this.children.push(c); if (c && c._id) byId[c._id] = c; return c; }
        addEventListener(n, f, o) { (this._l[n] = this._l[n] || []).push({ f, once: o && o.once }); }
        removeEventListener() {}
        closest() { return null; }
        getBoundingClientRect() { return { height: 80, width: 1200, top: 0, left: 0, bottom: 80, right: 1200 }; }
        /* The equalizer's draw loop measures the bar and gives up if it has no
           size. Without these it returned on the first line of every frame and
           the whole visualiser was untested while appearing to pass. */
        get clientWidth() { return 1200; }
        get clientHeight() { return 80; }
        /* A canvas stub, so the visualiser's draw path RUNS here instead of
           being skipped. Not decoration in the test either: the waves live
           inside the promise chain that decides whether playback succeeded, and
           an exception in them once cleared the listener's intent flag and made
           a playing station report as failed. Exercising the path is what
           catches that. */
        getContext() {
            return {
                setTransform() {}, clearRect() {}, beginPath() {},
                moveTo() {}, lineTo() {}, stroke() {}, fillRect() {},
                strokeStyle: '', fillStyle: '', lineWidth: 1,
            };
        }
    }

    const store = {};
    const saved = {};
    const docListeners = {};
    const fireGesture = (name) => (docListeners[name] || []).slice().forEach(f => { try { f({ type: name }); } catch (e) {} });
    const fakes = {
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        },
        // `origin` matters: the visualiser refuses to tap a cross-origin element,
        // and a fake location without one made every source look cross-origin,
        // so the analysing path was never reached in any test.
        location: { pathname: '/', href: 'https://www.kjubilee.com/',
                    origin: 'https://www.kjubilee.com' },
        document: {
            readyState: 'complete', body: new El('body'), head: new El('head'),
            createElement: (t) => new El(t),
            getElementById: (id) => byId[id] || null,
            addEventListener: (n, f) => { (docListeners[n] = docListeners[n] || []).push(f); },
            removeEventListener: (n, f) => {
                if (docListeners[n]) docListeners[n] = docListeners[n].filter(x => x !== f);
            },
        },
        Audio: FakeAudio,
        /* A Web Audio stub, so the ANALYSING branch of the equalizer runs here.
           Without it the visualiser always took its silent fallback path, and a
           function the analysing path calls could go missing without a single
           test noticing - which is exactly what happened: bandEnergy was
           deleted in a refactor and every frame threw in the browser while the
           suite stayed green. */
        AudioContext: class {
            constructor() { this.state = 'running'; this.destination = {}; }
            resume() { return Promise.resolve(); }
            createMediaElementSource() { return { connect() {} }; }
            createAnalyser() {
                var node = {
                    fftSize: 2048,
                    smoothingTimeConstant: 0,
                    connect() {},
                    getByteFrequencyData(arr) {
                        // Something with shape to it, so the columns differ.
                        for (var i = 0; i < arr.length; i++) {
                            arr[i] = Math.max(0, 200 - i) + (i % 7) * 4;
                        }
                    },
                };
                Object.defineProperty(node, 'frequencyBinCount', {
                    get() { return node.fftSize / 2; },
                });
                return node;
            }
        },
        // The draw loop runs on rAF; without one the visualiser never starts
        // and the test would prove nothing about it. Driven by the virtual
        // clock like every other timer here.
        requestAnimationFrame: (fn) => global.setTimeout(function () { fn(vnow - T0); }, 16),
        cancelAnimationFrame: (id) => global.clearTimeout(id),
        CustomEvent: class { constructor(n, o) { this.type = n; Object.assign(this, o || {}); } },
        ResizeObserver: class { observe() {} disconnect() {} },
        window: global,
        addEventListener: () => {},
        dispatchEvent: () => {},
        KJ_STATIONS: [{ slug: 'sim', name: DOC.name, hm: DOC.hm, format: DOC.format,
                        tenant: DOC.tenant, prototype: true, image: '' }],
        KJ_DEFAULT: 'sim',
        fetch: function (url) {
            const headers = {
                // Whole seconds, exactly as an HTTP Date header carries them:
                // the player's clock is only ever this precise.
                get: (n) => (String(n).toLowerCase() === 'date'
                    ? new RealDate(Math.floor(vnow / 1000) * 1000).toUTCString() : null),
            };
            if (String(url).indexOf('/delivery/') >= 0) {
                return Promise.resolve({ ok: true, status: 200, headers,
                                         json: () => Promise.resolve(JSON.parse(JSON.stringify(DOC))) });
            }
            return Promise.resolve({ ok: true, status: 200, headers, json: () => Promise.resolve({}) });
        },
    };
    for (const k of Object.keys(fakes)) { saved[k] = global[k]; global[k] = fakes[k]; }
    store['kjubilee.player.slug'] = 'sim';
    store['kjubilee.player.playing'] = 'true';

    delete require.cache[require.resolve(PLAYER)];
    require(PLAYER);

    const flush = () => new Promise(r => realSetImmediate(() => realSetImmediate(() => realSetImmediate(r))));
    const STEP = 100;

    // AN ELEMENT THAT IS NOT ADVANCING IS NOT SOUNDING, whatever it claims.
    //
    // A stalled element reports paused === false and fires no event; that is the
    // silent stall 9.11 exists for, and a harness that counts it as playing can
    // neither see the fault nor judge the recovery. Position moved since the
    // last sample is the only honest test, and it is the one the watchdog uses.
    const lastCt = new Map();
    const isSounding = (a) => {
        if (a.paused || a.readyState < 1) return false;
        const prev = lastCt.has(a) ? lastCt.get(a) : -1;
        lastCt.set(a, a.currentTime);
        return prev < 0 ? true : a.currentTime > prev + 0.001;
    };

    let silentFrom = null, lastHeard = null;
    const silences = [], order = [];

    function drain() {
        let guard = 0;
        for (;;) {
            const due = timers.filter(t => t.due <= vnow).sort((a, b) => a.due - b.due);
            if (!due.length || ++guard > 2000) return;
            const t = due[0];
            if (t.every) t.due = vnow + t.every; else timers = timers.filter(x => x !== t);
            try { t.fn(); } catch (e) { log('timer-threw', { e: e.message }); }
        }
    }

    return (async () => {
        await flush();
        for (let el = 0; el < minutes * 60 * 1000; el += STEP) {
            vnow += STEP;
            if (fault && fault.kind === 'stall') {
                const s = (vnow - T0) / 1000;
                stalling = s >= fault.at && s < fault.at + fault.seconds;
            }
            if (opts.gestureAt && Math.abs((vnow - T0) / 1000 - opts.gestureAt) < 0.05) {
                blockingAutoplay = false;          // the touch is the permission
                fireGesture('pointerdown');
            }
            drain();
            for (const a of FakeAudio.all) a.tick(STEP);
            await flush();

            const sec = Math.floor((vnow - T0) / 1000) + startSec;
            const sounding = FakeAudio.all.filter(isSounding)[0];
            if (!sounding) { if (silentFrom === null) silentFrom = sec; continue; }
            if (silentFrom !== null) { silences.push({ from: silentFrom, to: sec, len: sec - silentFrom }); silentFrom = null; }
            const heard = short(sounding.src);
            if (heard !== lastHeard) {
                lastHeard = heard;
                order.push(heard);
                log('now-hearing', { track: heard, at: +sounding.currentTime.toFixed(2) });
            }
        }

        for (const k of Object.keys(fakes)) global[k] = saved[k];
        Date.now = realNow;
        global.setTimeout = realSetTimeout; global.setInterval = realSetInterval;
        global.clearTimeout = realClearTimeout; global.clearInterval = realClearInterval;

        // A TRACK THAT CHANGED WHILE THE PREVIOUS ONE WAS STILL SOUNDING was cut
        // off. Two qualifications, both of which cost the metric its teeth if
        // left out:
        //
        //   - the previous track must not have ENDED, or every ordinary
        //     hand-over counts as a cut;
        //   - there must have been no SILENCE between the two. A track that
        //     changed after the station went quiet - a network stall, a failed
        //     load - truncated nothing the listener was hearing. Counting it
        //     blames the player for the network, and worse, makes the correct
        //     recovery from a stall look like the fault it is fixing.
        let cut = 0;
        for (let i = 0; i < events.length; i++) {
            if (events[i].kind !== 'now-hearing') continue;
            const prev = events.slice(0, i).reverse().find(x => x.kind === 'ended' || x.kind === 'now-hearing');
            if (!prev || prev.kind !== 'now-hearing') continue;
            // SUBSTANTIAL silence only. The sub-second gap while the next file
            // loads IS the hand-over; discounting on that would excuse every cut
            // in the codebase, since cutting a track always leaves one.
            const quietBetween = silences.some(x => x.len >= 2 && x.from >= prev.at - 1 && x.to <= events[i].at + 1);
            if (!quietBetween) cut++;
        }
        // When the injected stall ended, how long until sound came back.
        let recoveredAfter = null;
        if (fault && fault.kind === 'stall') {
            const resumeAt = fault.at + fault.seconds;
            // The silence that spans the stall; sound is back when it ends. A
            // resumed track fires no new event, so an event-based measure would
            // read the NEXT hand-over as the recovery and slander the player.
            const gap = silences.find(x => x.to >= fault.at && x.from <= resumeAt + 5);
            recoveredAfter = gap ? +Math.max(0, gap.to - resumeAt).toFixed(1)
                                 : (silentFrom === null ? 0 : null);
        }
        return {
            events, order,
            threw: events.filter(e => e.kind === 'timer-threw' || e.kind === 'listener-threw'),
            recoveredAfter,
            playingFlag: store['kjubilee.player.playing'],
            armedListeners: (docListeners['pointerdown'] || []).length,
            heard: order.length,
            cut,
            jumps: events.filter(e => e.kind === 'JUMP').length,
            longestSilence: silences.length ? Math.max.apply(null, silences.map(x => x.len)) : 0,
            totalSilence: silences.reduce((n, s) => n + s, 0),
        };
    })();
}

// ── the run ─────────────────────────────────────────────────────────────────
(async () => {
    console.log('\nfooter player — what a listener hears\n');
    console.log('  schedule: ' + DOC.entries.length + ' entries from a ' + pool.length + '-track pool\n');

    const CASES = [
        { name: 'ordinary day (every duration rounded to the second)', fault: null },
        { name: 'a file 10s shorter than its slot',   fault: { kind: 'short', entry: 1, seconds: 10 } },
        { name: 'a file 60s shorter than its slot',   fault: { kind: 'short', entry: 1, seconds: 60 } },
        { name: 'a file 45s longer than its slot',    fault: { kind: 'long',  entry: 1, seconds: 45 } },
        { name: 'a 20s buffering stall mid-track',    fault: { kind: 'stall', at: 100, seconds: 20 } },
        { name: 'a 2min buffering stall mid-track',   fault: { kind: 'stall', at: 100, seconds: 120 } },
    ];

    for (const c of CASES) {
        const r = await session({ minutes: 20, fault: c.fault });
        if (process.env.DUMP_STALL && c.fault && c.fault.kind === 'stall' && c.fault.seconds === 120) {
            for (const e of r.events.filter(x => x.at > 95 && x.at < 240)) {
                console.log('    ' + String(Math.round(e.at)).padStart(4) + 's ' + e.kind + ' ' + JSON.stringify(e.detail));
            }
        }
        console.log('\n  ── ' + c.name);
        console.log('     ' + r.heard + ' tracks, ' + r.cut + ' cut short, ' + r.jumps +
                    ' jumped, longest silence ' + r.longestSilence + 's');

        // THE THREE RULES. A song that is sounding is never cut and never moved,
        // and the station is never quiet for long enough to sound dead.
        ok(c.name + ': no song is cut off part-way', r.cut === 0, r.cut + ' cut');
        ok(c.name + ': no song jumps while it is playing', r.jumps === 0, r.jumps + ' jumps');

        if (c.fault && c.fault.kind === 'stall') {
            // The silence during a network stall belongs to the network. What
            // the player owes is a recovery once the bytes come back — §9.11 —
            // and it must not need a listener to press anything to get it.
            ok(c.name + ': sound comes back after the stall ends',
               r.recoveredAfter !== null && r.recoveredAfter <= 15,
               r.recoveredAfter === null ? 'never recovered' : r.recoveredAfter + 's');
        } else {
            ok(c.name + ': no dead air over 2s', r.longestSilence <= 2, r.longestSilence + 's');
        }
        ok(c.name + ': the station keeps playing', r.heard >= 4, r.heard + ' tracks heard');
        // Nothing may throw in a timer or a listener. The player steps over such
        // an error by design so one bad callback cannot stop the radio, which is
        // exactly why a test has to look for it - the visualiser's draw loop
        // runs on a timer, and a broken one would otherwise fail invisibly.
        ok(c.name + ': nothing throws in a callback', r.threw.length === 0,
           r.threw.length ? JSON.stringify(r.threw[0]).slice(0, 90) : '');
    }

    // Tuning in at an arbitrary second of the day must land inside the right
    // song rather than at the top of one: that is what makes it a broadcast.
    const mid = await session({ minutes: 8, startSec: 44_000 });
    const firstJoin = mid.events.find(e => e.kind === 'join');
    ok('tuning in mid-day joins a song already in progress',
       !!firstJoin && firstJoin.detail.to > 2, firstJoin ? String(firstJoin.detail.to) : 'no join');
    ok('tuning in mid-day then runs clean',
       mid.cut === 0 && mid.jumps === 0, mid.cut + ' cut / ' + mid.jumps + ' jumps');

    // ---- a refresh -------------------------------------------------------
    //
    // A reload destroys the page and the <audio> with it; nothing can carry
    // sound across that. What the player CAN do is come back on the listener's
    // first touch instead of making them find the play button, and not give up
    // on the second refresh because the first one was refused.
    const refused = await session({ minutes: 6, blockAutoplay: true, gestureAt: 90 });
    const firstSound = refused.events.find(e => e.kind === 'now-hearing');
    ok('a refused autoplay leaves the station silent, not broken',
       !!firstSound && firstSound.at >= 90, firstSound ? 'first sound at ' + firstSound.at + 's' : 'never played');
    ok('the first touch anywhere resumes the station',
       !!firstSound && firstSound.at < 95, firstSound ? String(firstSound.at) : 'never played');
    ok('a refusal keeps the listener\'s intent, so the NEXT refresh still tries',
       refused.playingFlag === 'true', String(refused.playingFlag));
    ok('the resume listeners are disarmed once sound is back',
       refused.armedListeners === 0, refused.armedListeners + ' still attached');
    ok('and it then plays on normally',
       refused.cut === 0 && refused.jumps === 0 && refused.heard >= 1,
       refused.heard + ' heard / ' + refused.cut + ' cut / ' + refused.jumps + ' jumps');

    // Order is the schedule's order: the player never re-picks or re-shuffles.
    const plain = await session({ minutes: 30 });
    const scheduled = DOC.entries.slice(0, plain.order.length)
        .map(e => e.u.split('/').pop().slice(0, 44));
    ok('tracks are heard in the schedule\'s order',
       plain.order.every((t, i) => t === scheduled[i]),
       plain.order.slice(0, 3).join(' | '));

    console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
    process.exit(fail ? 1 : 0);
})();
