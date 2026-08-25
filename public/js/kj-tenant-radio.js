/* kj-tenant-radio.js — the tenant radio engine.
 *
 * Plays a channel as a BROADCAST without a broadcast server: the day's
 * programming is published in advance, and the player works out what should be
 * sounding right now and seeks into it. Two listeners who tune in at the same
 * instant hear the same song at the same offset, which is the property a
 * shuffled playlist cannot give and an Icecast mount charges 192 kbps per
 * listener for.
 *
 *   KJRadio.tune('HM332.16-RO')            // resolve now, start playing
 *   KJRadio.stop()
 *   KJRadio.nowPlaying()                   // { title, artist, offset, duration, next }
 *   KJRadio.on('track', fn)                // fires on every change of track
 *
 * ── the day file ────────────────────────────────────────────────────────────
 *   https://cdn.kjubilee.com/radio/HM332.16-RO/delivery/HM332.16RO-20260822.json
 *
 * One file per tenant per BROADCAST day — midnight to midnight Pacific, not
 * UTC. ~80 KB, ~350 entries of `{t,d,u,ti,ar,al}`: seconds from the start of the
 * day, duration, CDN-relative path, title, artist, album. The audio comes from
 * the same CDN, so a listening browser never touches the origin.
 *
 * The file carries `startsAt` (the UTC instant the day begins) and `seconds`
 * (its length), which is what lets the player do zone-correct arithmetic with no
 * timezone code: a Pacific day is 23 hours the morning the clocks go forward and
 * 25 the morning they go back.
 *
 * ── the four things that make the illusion hold ─────────────────────────────
 * 1. NEVER TRUST THE DEVICE CLOCK. Skew of minutes is common and puts a
 *    listener in the wrong song entirely. The server's Date header on the day
 *    file is authoritative; everything below runs on `now()`, not Date.now().
 * 2. RE-DERIVE, DON'T ADVANCE. At every track end the position is recomputed
 *    from the clock rather than stepping to the next entry, so error can never
 *    accumulate across a long session and a paused tab rejoins live.
 * 3. PRELOAD THE NEXT TRACK. A gap at a boundary reads instantly as "playlist",
 *    not "station".
 * 4. ASK FOR A MISSING DAY. If the file 404s the player requests one be built
 *    rather than failing silently — see requestDay().
 */
(function (global) {
    'use strict';

    var CDN = 'https://cdn.kjubilee.com';
    // The dial's broadcast zone. The day file confirms it in `tz`, but the
    // player needs it BEFORE the first fetch to know which date to ask for.
    var ZONE = 'America/Los_Angeles';
    var PRELOAD_LEAD = 20;      // seconds before the end to fetch the next track
    var RESYNC_EVERY = 30000;   // ms between drift checks
    var MAX_DRIFT = 2;          // seconds out before we seek rather than let it ride

    var clockOffset = 0;        // serverNow - clientNow, in ms
    var clockSynced = false;
    var days = {};              // 'HM332.16-RO|20260822' -> day document
    var pending = {};           // in-flight fetches, so ten calls make one request

    var tenantId = null;
    var audio = null, nextAudio = null;
    var currentEntry = null;
    var timer = null;
    var listeners = { track: [], state: [], error: [] };

    // ── clock ────────────────────────────────────────────────────────────────

    function now() { return Date.now() + clockOffset; }

    function syncClockFrom(response) {
        var header = response && response.headers && response.headers.get('date');
        if (!header) return;
        var server = Date.parse(header);
        if (!server) return;
        // The Date header is whole seconds and the response took time to arrive,
        // so this is good to about a second — which is all that is needed when
        // the thing being corrected is a clock that can be minutes out.
        clockOffset = server - Date.now();
        clockSynced = true;
    }

    /**
     * The broadcast date at an instant, as YYYYMMDD.
     *
     * PACIFIC, NOT UTC. The dial's day runs midnight to midnight in
     * America/Los_Angeles, so at 5pm Pacific the UTC date is already tomorrow
     * and asking for it would fetch a day that has not started. en-CA is used
     * because it formats as YYYY-MM-DD.
     */
    function broadcastDate(ms) {
        try {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date(ms)).replace(/-/g, '');
        } catch (e) {
            // No Intl timezone support: fall back to UTC rather than refusing to
            // play. Worst case the listener is on the wrong day for a few hours.
            return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
        }
    }

    /**
     * Seconds into the broadcast day, straight off the file.
     *
     * The generator put the day's starting INSTANT in `startsAt`, so the player
     * needs no timezone rules of its own — which matters because a Pacific day
     * is 23 hours the morning the clocks go forward and 25 the morning they go
     * back, and a client re-deriving that independently would disagree with the
     * schedule exactly when it is hardest to notice.
     */
    function secondsInto(doc, ms) {
        return Math.floor((ms - Date.parse(doc.startsAt)) / 1000);
    }

    // ── the day file ─────────────────────────────────────────────────────────

    function dayUrl(id, yyyymmdd) {
        return CDN + '/radio/' + id + '/delivery/' + id.replace(/-/g, '') + '-' + yyyymmdd + '.json';
    }

    /**
     * Ask the origin to build a day that is not published yet.
     *
     * The player is the only thing that reliably notices: the nightly job runs
     * three days ahead, so a 404 here means that job has been failing for days
     * and nobody was watching. Fire-and-forget on purpose — a listener must not
     * wait on a build, and the retry below covers the case where it succeeds.
     */
    function requestDay(id, yyyymmdd) {
        try {
            fetch('/api/radio/request-day', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant: id, date: yyyymmdd })
            }).catch(function () { /* best effort */ });
        } catch (e) { /* no fetch, no request */ }
        emit('error', { kind: 'missing-day', tenant: id, date: yyyymmdd });
    }

    function loadDay(id, yyyymmdd) {
        var key = id + '|' + yyyymmdd;
        if (days[key]) return Promise.resolve(days[key]);
        if (pending[key]) return pending[key];

        pending[key] = fetch(dayUrl(id, yyyymmdd), { cache: 'default' })
            .then(function (res) {
                syncClockFrom(res);
                if (res.status === 404) { requestDay(id, yyyymmdd); return null; }
                if (!res.ok) throw new Error('day file HTTP ' + res.status);
                return res.json();
            })
            .then(function (doc) {
                if (doc) days[key] = doc;
                delete pending[key];
                return doc;
            })
            .catch(function (err) {
                delete pending[key];
                emit('error', { kind: 'day-fetch', tenant: id, date: yyyymmdd, message: err.message });
                return null;
            });
        return pending[key];
    }

    // ── resolution ───────────────────────────────────────────────────────────

    /**
     * Which entry covers `sec`, by binary search. Linear would be fine at 350
     * entries and wrong the moment a tenant publishes a week in one file.
     */
    function entryAt(doc, sec) {
        var lo = 0, hi = doc.entries.length - 1;
        while (lo <= hi) {
            var mid = (lo + hi) >> 1, e = doc.entries[mid];
            if (sec < e.t) hi = mid - 1;
            else if (sec >= e.t + e.d) lo = mid + 1;
            else return { entry: e, index: mid, offset: sec - e.t };
        }
        return null;
    }

    function trackUrl(doc, entry) {
        return doc.cdnBase + '/' + doc.prefix +
            entry.u.split('/').map(encodeURIComponent).join('/');
    }

    // ── playback ─────────────────────────────────────────────────────────────

    function emit(name, payload) {
        (listeners[name] || []).forEach(function (fn) {
            try { fn(payload); } catch (e) { /* a bad listener must not stop the radio */ }
        });
    }

    function makeAudio() {
        var a = new Audio();
        a.preload = 'auto';
        a.crossOrigin = 'anonymous';
        return a;
    }

    /**
     * Put the player where the clock says it should be.
     *
     * Called on tune, on every track end, and every 30s. It is deliberately the
     * ONLY thing that decides what plays: there is no "advance to the next
     * track" path, because that is how drift accumulates and how a backgrounded
     * tab wakes up playing something the rest of the audience finished ten
     * minutes ago.
     */
    function resync(force) {
        if (!tenantId) return Promise.resolve();
        var ms = now();
        var stamp = broadcastDate(ms);

        return loadDay(tenantId, stamp).then(function (doc) {
            if (!doc) return;
            if (doc.tz) ZONE = doc.tz;      // the file is authoritative
            var sec = secondsInto(doc, ms);
            // A clock correction can land us either side of a day boundary.
            // Follow it rather than sitting on a day that is over.
            if (sec < 0 || sec >= doc.seconds) {
                var other = broadcastDate(ms);
                if (other !== stamp) return loadDay(tenantId, other).then(function (d2) {
                    if (!d2) return;
                    var h2 = entryAt(d2, secondsInto(d2, ms));
                    if (h2) play(d2, h2);
                });
                return;
            }
            var hit = entryAt(doc, sec);
            if (!hit) return;

            var sameTrack = currentEntry && currentEntry.t === hit.entry.t;
            var drift = sameTrack && audio ? Math.abs(audio.currentTime - hit.offset) : Infinity;

            if (sameTrack && !force && drift <= MAX_DRIFT) {
                schedulePreload(doc, hit);
                return;
            }

            if (sameTrack && audio) {
                // Right track, wrong place — nudge rather than reload, which
                // would re-download a file already in the buffer.
                audio.currentTime = hit.offset;
                schedulePreload(doc, hit);
                return;
            }

            play(doc, hit);
        });
    }

    function play(doc, hit) {
        var url = trackUrl(doc, hit.entry);
        var a = (nextAudio && nextAudio.dataset && nextAudio.dataset.src === url) ? nextAudio : makeAudio();
        if (a !== nextAudio) a.src = url;
        nextAudio = null;

        if (audio) { try { audio.pause(); } catch (e) {} }
        audio = a;
        currentEntry = hit.entry;

        var startAt = hit.offset;
        var begin = function () {
            try { if (Math.abs(a.currentTime - startAt) > 0.5) a.currentTime = startAt; } catch (e) {}
            a.play().catch(function (err) {
                // Autoplay policy blocks the first play until a gesture. Not a
                // fault: the UI surfaces it and a click gets through.
                emit('error', { kind: 'autoplay', message: err && err.message });
            });
        };
        if (a.readyState >= 1) begin();
        else a.addEventListener('loadedmetadata', begin, { once: true });

        a.addEventListener('ended', function () { resync(true); }, { once: true });
        a.addEventListener('error', function () {
            // One bad object must not end the broadcast — rejoin the clock,
            // which by then is almost certainly on the following track.
            emit('error', { kind: 'audio', url: url });
            setTimeout(function () { resync(true); }, 1000);
        }, { once: true });

        emit('track', nowPlaying());
        schedulePreload(doc, hit);
    }

    /** Fetch the next track before this one ends, or the boundary gaps. */
    function schedulePreload(doc, hit) {
        var remaining = hit.entry.d - hit.offset;
        if (remaining > PRELOAD_LEAD) return;
        var next = doc.entries[hit.index + 1];
        if (!next) return;
        var url = trackUrl(doc, next);
        if (nextAudio && nextAudio.dataset.src === url) return;
        nextAudio = makeAudio();
        nextAudio.dataset.src = url;
        nextAudio.src = url;
    }

    // ── api ──────────────────────────────────────────────────────────────────

    function nowPlaying() {
        if (!tenantId || !currentEntry) return null;
        var doc = days[tenantId + '|' + broadcastDate(now())];
        var idx = doc ? doc.entries.indexOf(currentEntry) : -1;
        var next = idx >= 0 ? doc.entries[idx + 1] : null;
        return {
            tenant: tenantId,
            name: doc ? doc.name : null,
            hm: doc ? doc.hm : null,
            format: doc ? doc.format : null,
            title: currentEntry.ti,
            album: currentEntry.al || '',
            artist: currentEntry.ar,
            duration: currentEntry.d,
            offset: audio ? Math.floor(audio.currentTime) : 0,
            next: next ? { title: next.ti, album: next.al || '', artist: next.ar } : null,
            clockSynced: clockSynced,
            // The two lines the player renders, assembled here so every surface
            // that shows "what is on" reads identically:
            //
            //   God's Amazing Grace (JubiLujah)
            //   kJubilee Radio HM 308.70 (Jubilee Praise & Worship)
            //
            // The album is in parentheses only when there is one; a track with
            // no album must not render a bare "( )".
            line1: currentEntry.ti + (currentEntry.al ? ' (' + currentEntry.al + ')' : ''),
            line2: doc ? (doc.name + ' HM ' + doc.hm + (doc.format ? ' (' + doc.format + ')' : '')) : ''
        };
    }

    function tune(id) {
        tenantId = id;
        currentEntry = null;
        if (timer) clearInterval(timer);
        timer = setInterval(function () { resync(false); }, RESYNC_EVERY);
        // A tab that was asleep wakes with a stale position; rejoin immediately
        // rather than at the next tick.
        document.addEventListener('visibilitychange', onVisible);
        return resync(true);
    }

    function onVisible() { if (!document.hidden) resync(true); }

    function stop() {
        if (timer) { clearInterval(timer); timer = null; }
        document.removeEventListener('visibilitychange', onVisible);
        if (audio) { try { audio.pause(); } catch (e) {} }
        audio = null; nextAudio = null; currentEntry = null; tenantId = null;
        emit('state', { playing: false });
    }

    function on(name, fn) {
        if (!listeners[name]) listeners[name] = [];
        listeners[name].push(fn);
        return function () {
            listeners[name] = listeners[name].filter(function (f) { return f !== fn; });
        };
    }

    global.KJRadio = {
        tune: tune,
        stop: stop,
        resync: resync,
        nowPlaying: nowPlaying,
        on: on,
        dayUrl: dayUrl,
        get audio() { return audio; },
        get clockOffset() { return clockOffset; }
    };
})(window);
