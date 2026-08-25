/*
 * kj-footer-player.js — the persistent station player.
 *
 * A fixed bar across the bottom of every page that can tune any station the
 * catalog marks ON AIR, and keeps playing as the listener moves around the
 * site. Modelled on the Jubilujah.com footer player (cover on the left,
 * transport in the middle, volume on the right, animated top border while
 * playing) with the differences a radio dial forces:
 *
 *   - The cover is the STATION's picture, not an album's. Stations are the
 *     unit here; there is no album to show.
 *   - No seek bar. A live mount has no duration and nowhere to seek to, so the
 *     centre column carries an ON AIR indicator instead of a scrubber.
 *   - No previous/next either. Those belong to a queue, and a dial has none:
 *     the buttons stepped through the ON AIR stations in frequency order,
 *     which looks like "the next track" and is not. Stations are chosen from
 *     the cards and the table, so the centre column is one control — play or
 *     pause — with the ON AIR lamp beside it saying what that control did.
 *
 * Stations play from their published day file — client-side delivery, per
 * station-guidelines 2.5. The file lists which track covers which second of
 * the broadcast day; the player resolves the clock against it, seeks into the
 * track that is sounding right now, and streams that file from the CDN. Two
 * listeners who tune at the same second hear the same song at the same offset,
 * so it is a broadcast without a broadcast server in the path — and without
 * the listener ceiling one imposes (2.5.2).
 *
 * Nothing here connects to a mount. The older paths remain for stations with
 * no published programming, and are tried strictly in this order:
 *
 *   day       the tenant's published programming file  <- every live station
 *   manifest  a catalog station — fetch music.json, shuffle it, and run the
 *             tracks back to back, reshuffling on each pass.
 *   stream    an Icecast mount — one connection, straight to <audio>.
 *
 * State lives in localStorage so a page navigation resumes rather than
 * restarts, and so pressing play on one tab is visible to the others.
 *
 * To enable on a page:  <script src="/js/kj-footer-player.js" defer></script>
 * It is a no-op on /radio, which has its own full player.
 */
(function () {
    'use strict';

    var path = (location.pathname || '').toLowerCase();
    // /radio.html now redirects to /radio, so the exact paths are enough.
    if (path === '/radio' || path === '/radio/') return;

    var KEY = {
        slug:    'kjubilee.player.slug',
        playing: 'kjubilee.player.playing',
        volume:  'kjubilee.player.volume',
    };

    function read(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
    function write(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }

    // ---- catalog ----------------------------------------------------------
    var ALL = (window.KJ_STATIONS || []).slice();
    // "ON AIR" is the catalog's own word for it — the same flag that draws the
    // badge on a card. Only these are tunable; everything else is a placeholder
    // whose programming has not been built yet.
    var LIVE = ALL.filter(function (s) { return s.prototype && (s.tenant || s.manifest || s.stream); })
                  .sort(function (a, b) { return parseFloat(a.hm) - parseFloat(b.hm); });
    if (!LIVE.length) return;

    function bySlug(slug) {
        for (var i = 0; i < ALL.length; i++) if (ALL[i].slug === slug) return ALL[i];
        return null;
    }
    function liveIndex(slug) {
        for (var i = 0; i < LIVE.length; i++) if (LIVE[i].slug === slug) return i;
        return -1;
    }

    // ---- audio ------------------------------------------------------------
    var audio = null;          // the single <audio> for this page
    var current = null;        // the station object being played
    var queue = [];            // manifest rotation
    var qi = 0;
    var manifestCache = {};

    function shuffle(a) {
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    // DOES THE LISTENER WANT SOUND RIGHT NOW?
    //
    // Not the same question as "is the element playing", and the gap between
    // the two is where a station goes quiet and stays quiet: a stall, an
    // interrupted stream or an OS interruption can leave the element paused
    // having fired neither 'ended' nor 'error', and nothing then asks it to
    // carry on. The periodic tick uses this to tell that silence apart from a
    // listener who pressed pause, and rejoins in the first case only.
    var wantPlaying = false;

    function destroy() {
        wantPlaying = false;
        stopWatchdog();
        if (audio) {
            try { audio.pause(); audio.src = ''; } catch (e) {}
            audio = null;
        }
        queue = []; qi = 0;
        dayIndex = -1;
        preload = null;
    }

    // The manifest stores production URLs; the dev server and the live host both
    // answer /cdn/*, so rewriting to a relative path works in either place.
    function localise(u) {
        return (u || '').replace(/^https:\/\/cdn\.(jubileeverse|kjubilee)\.com\//, '/cdn/');
    }

    // A day file's entries carry a path relative to the file's own base, so the
    // same programming can be repointed at another CDN without rewriting 350
    // entries. Join it here, once, and let localise() do the dev/live rewrite.
    function trackUrl(doc, e) {
        var u = String((e && e.u) || '');
        if (!u) return '';
        if (/^https?:\/\//i.test(u)) return localise(u);
        var base = String(doc && doc.cdnBase || 'https://cdn.kjubilee.com').replace(/\/+$/, '');
        var pre = String(doc && doc.prefix || '').replace(/^\/+/, '');
        return localise(base + '/' + pre + u);
    }

    function flatten(manifest) {
        var out = [], albums = (manifest && manifest.albums) || [];
        for (var a = 0; a < albums.length; a++) {
            var t = albums[a].tracks || [];
            for (var i = 0; i < t.length; i++) if (t[i].url) out.push(t[i]);
        }
        return out;
    }

    // ── what is playing ─────────────────────────────────────────────────────
    //
    // Two ways to know, and a station uses whichever it has:
    //
    //   manifest playback  the player picked the track, so it simply knows
    //   a published day    the station's daily programming file says what
    //                      should be sounding at this second (guidelines 2.5)
    //
    // A stream-backed station with neither knows nothing about the song, and
    // the bar falls back to the station name rather than inventing a title.
    var nowTrack = null;
    var dayCache = {};
    var dayTimer = null;
    // ── the clock ────────────────────────────────────────────────────────
    //
    // streaming-services.md §4.3, §4.4. Everything the player decides comes from
    // one question — what time is it, really — and the device cannot answer it.
    // A clock a few minutes out does not put the listener slightly off the beat;
    // it puts them in a different song.
    //
    // TWO SOURCES, IN ORDER OF PRECISION.
    //
    //   /api/time   milliseconds, asked for whenever it is wanted, with the
    //               round trip measured around it and halved (§4.3 step 4).
    //   Date header  whole seconds, and only when a day file happens to be
    //               fetched. Kept as the fallback for a page whose origin has
    //               no time endpoint, and never allowed to overwrite a
    //               measured sync — it is up to a second worse.
    var clockOffset = 0;
    var clockMeasured = false;      // did /api/time answer? then ignore Date headers
    var clockSyncedAt = 0;          // Date.now() of the last successful sync
    var CLOCK_RESYNC_MS = 5 * 60 * 1000;    // §13.3: every 5 minutes during playback

    // THE MONOTONIC GUARD (§4.4). performance.now() counts forward at a steady
    // rate no matter what happens to the wall clock, so the two disagreeing means
    // the system clock moved underneath us — an NTP correction, a manual change,
    // a laptop waking from four hours asleep. The stored offset is then measured
    // against a clock that no longer exists and has to be thrown away rather than
    // trusted.
    var monoAt = (typeof performance === 'object' && performance && performance.now) ? performance.now() : 0;
    var wallAt = Date.now();
    var MONO_TOLERANCE_MS = 2000;

    function monotonicJumped() {
        if (!(typeof performance === 'object' && performance && performance.now)) return false;
        var mono = performance.now(), wall = Date.now();
        var drift = Math.abs((wall - wallAt) - (mono - monoAt));
        monoAt = mono; wallAt = wall;
        return drift > MONO_TOLERANCE_MS;
    }

    /**
     * What time it is, corrected. Every position calculation goes through here.
     *
     * It also polices its own freshness: if the wall clock has jumped relative to
     * the monotonic clock, the offset is discarded on the spot and a fresh sync
     * requested, because a position derived from a dead offset is exactly the
     * "playing the wrong thing" the specification refuses to do (§6 governing
     * principle). Discarding is immediate; the re-sync is asynchronous, so the
     * worst case is one calculation against the raw device clock rather than
     * against a correction known to be wrong.
     */
    function now() {
        if (monotonicJumped()) {
            clockOffset = 0;
            clockMeasured = false;
            clockSyncedAt = 0;
            syncClock();
        }
        // The raw device clock plus the correction. NOT now() — this IS now().
        return Date.now() + clockOffset;
    }

    var clockInFlight = null;

    /**
     * Ask the origin what time it is and keep half the round trip.
     *
     * The estimate is server_time + rtt/2: the response was generated somewhere
     * inside the round trip, and the midpoint is the best guess available
     * without a second exchange. Good to a few tens of milliseconds on any
     * ordinary connection, which is two orders of magnitude better than the
     * whole-second Date header it replaces.
     *
     * A slow answer is a bad answer — half of a four-second round trip is two
     * seconds of error, which is worse than most device clocks — so anything
     * past SLOW_RTT is measured but not trusted, and the next attempt stands.
     */
    var SLOW_RTT_MS = 1500;
    function syncClock(force) {
        if (typeof fetch !== 'function') return Promise.resolve(false);
        if (clockInFlight) return clockInFlight;
        if (!force && clockSyncedAt && Date.now() - clockSyncedAt < CLOCK_RESYNC_MS) {
            return Promise.resolve(false);
        }
        var t0 = (typeof performance === 'object' && performance && performance.now)
            ? performance.now() : Date.now();

        clockInFlight = fetch('/api/time', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (body) {
                clockInFlight = null;
                if (!body || typeof body.now !== 'number') return false;
                var t1 = (typeof performance === 'object' && performance && performance.now)
                    ? performance.now() : Date.now();
                var rtt = Math.max(0, t1 - t0);
                if (rtt > SLOW_RTT_MS) return false;      // too slow to be worth trusting
                clockOffset = (body.now + rtt / 2) - Date.now();
                clockMeasured = true;
                clockSyncedAt = Date.now();
                // Re-baseline the guard: the pair it compares must both be read
                // after the correction, or the next check reads this sync as a jump.
                if (typeof performance === 'object' && performance && performance.now) monoAt = performance.now();
                wallAt = Date.now();
                return true;
            })
            .catch(function () { clockInFlight = null; return false; });
        return clockInFlight;
    }

    function setTrack(t) {
        nowTrack = t ? { title: t.title || t.ti, artist: t.artist || t.ar, album: t.album || t.al } : null;
        if (!current) return;
        setStation(stationName(current));
        setTitle(lineSong(nowTrack));
        setSub(lineStation(current));
    }

    function broadcastDate(ms) {
        try {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date(ms)).replace(/-/g, '');
        } catch (e) {
            return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
        }
    }

    // -- day-driven playback (station-guidelines 2.5) -----------------------
    //
    // The day file is the programme AND the source. Audio is fetched from the
    // CDN a track at a time; the origin serves one ~85 KB JSON per listener per
    // day and nothing else, which is what removes the concurrent-listener
    // ceiling (2.5.2). The four requirements in 2.5.4 are each implemented
    // below and marked, because each one is load-bearing.

    var dayIndex = -1;     // index of the entry currently loaded into <audio>
    var dayDate = '';      // which broadcast day dayIndex refers to
    var loadedUrl = '';    // the URL actually in the element right now
    var badRun = 0;        // consecutive tracks that failed to load

    // HOW FAR AHEAD OF THE PUBLISHED GRID THIS PLAYER IS RUNNING, in seconds.
    //
    // Zero for a player that is on the grid, which is the normal state. It grows
    // only when a file ends before its slot is over — a truncated object, or one
    // whose published duration is simply wrong — because the hole is filled by
    // starting the next entry rather than by silence. It is carried rather than
    // corrected: correcting it would mean moving a song that is already playing,
    // which is the thing that made the station sound broken.
    //
    // It is kept for two reasons: so the shortfall warning can name the file
    // that ACTUALLY came up short instead of blaming every track that follows
    // it, and so nowPlaying-style surfaces can tell honestly that this listener
    // is off the grid. It resets whenever the player rejoins from the clock.
    var lead = 0;

    // HOW OFTEN TO ASK WHETHER THE SCHEDULE HAS CHANGED UNDER US.
    //
    // A listener who leaves the page open all afternoon is holding a copy of the
    // day that was correct when they tuned in. If the schedule is regenerated —
    // a re-ingest, a rotation fixed, a station renamed — they carry on playing
    // the old one indefinitely, and nothing tells them or us.
    //
    // The check is CHEAP because it is conditional: the request goes out with
    // cache:'no-cache', which revalidates rather than re-downloads, so an
    // unchanged schedule costs a 304 of a couple of hundred bytes rather than
    // the ~85 KB file. That is what keeps the delivery model in section 2.5.2
    // honest — one file per listener per day, plus a handful of 304s.
    var REV_CHECK_MS = 20 * 60 * 1000;
    var revCheckedAt = {};
    var inflight = {};

    // THE DAY, KEPT ACROSS A PAGE LOAD.
    //
    // A refresh destroys the page and the <audio> with it — nothing can keep
    // sound going through that, and no cache changes it. What a cache changes is
    // how long the silence AFTERWARDS lasts: without one the player has to fetch
    // an 85 KB schedule before it knows what to play, and the listener hears
    // nothing until it lands. With one it resolves the clock against a copy it
    // already has and starts audio immediately, then checks the revision in the
    // background.
    //
    // ONE day, not a collection: the only case this serves is resuming the
    // station that was playing, so a single slot keeps the footprint bounded
    // (~130 KB worst case) no matter how many stations get tuned.
    var DAY_STORE = 'kjubilee.player.day';

    function storedDay(key) {
        try {
            var raw = localStorage.getItem(DAY_STORE);
            if (!raw) return null;
            var box = JSON.parse(raw);
            if (!box || box.key !== key || !box.doc || !box.doc.entries) return null;
            return box.doc;
        } catch (e) { return null; }
    }

    function storeDay(key, doc) {
        // Quota, private windows and "block site data" all throw here. None of
        // them are worth breaking playback over — the network path still works.
        try { localStorage.setItem(DAY_STORE, JSON.stringify({ key: key, doc: doc })); } catch (e) {}
    }
    var preload = null;    // 2.5.4(3) — the next entry, fetched early
    var asked = {};

    // Same-origin, by way of localise(). R2 sends no Access-Control-Allow-Origin,
    // so fetching cdn.kjubilee.com from the site origin is a cross-origin request
    // the browser blocks outright — the player never sees the file and the play
    // button does nothing. nginx proxies this path through to the same object.
    function dayUrl(id, stamp) {
        return localise('https://cdn.kjubilee.com/radio/' + id + '/delivery/' +
                        id.replace(/-/g, '') + '-' + stamp + '.json');
    }

    // 2.5.4(4) — the generator runs days ahead, so a 404 means it has been
    // failing long enough to burn the buffer. The browser is the first thing to
    // find out, so it says so instead of going quiet.
    function requestDay(id, stamp) {
        var k = id + '|' + stamp;
        if (asked[k]) return;
        asked[k] = 1;
        try {
            fetch('/api/radio/request-day', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant: id, date: stamp })
            }).catch(function () {});
        } catch (e) {}
    }

    function fetchDay(id, stamp) {
        var k = id + '|' + stamp;
        if (dayCache[k]) return Promise.resolve(dayCache[k]);

        // Kept from the last page. Keyed by day, so yesterday's copy can never
        // be mistaken for today's.
        var kept = storedDay(k);
        if (kept) {
            dayCache[k] = kept;
            // Trusted only as far as getting sound out. Check the revision at
            // once rather than waiting for the twenty-minute tick, so a listener
            // resuming onto a schedule that changed overnight is corrected in
            // the first second instead of the first twenty minutes.
            revCheckedAt[k] = 0;
            setTimeout(function () {
                maybeRefreshDay(id, stamp).then(function (changed) { if (changed) syncDay(true); });
            }, 0);
            return Promise.resolve(kept);
        }

        if (typeof fetch !== 'function') return Promise.resolve(null);

        // Tuning asks for the day twice at once — once to label the bar, once to
        // start the audio — and both used to go to the network. One request,
        // shared.
        if (inflight[k]) return inflight[k];

        inflight[k] = fetch(dayUrl(id, stamp)).then(function (r) {
            // 2.5.4(1) — never trust the device clock. The server's Date header
            // is authoritative; a clock out by minutes lands in the wrong song.
            clockFromHeader(r);
            if (!r.ok) { if (r.status === 404) requestDay(id, stamp); return null; }
            return r.json();
        }).then(function (doc) {
            if (doc) { dayCache[k] = doc; storeDay(k, doc); }
            delete inflight[k];
            return doc;
        }).catch(function () { delete inflight[k]; return null; });
        return inflight[k];
    }

    /**
     * Ask the CDN whether the day we are holding is still current.
     *
     * Resolves true only when the published revision differs from ours, which is
     * the signal to re-derive rather than carry on. Rate-limited per day file, so
     * calling it from the fifteen-second tick costs nothing between checks.
     */
    function maybeRefreshDay(id, stamp) {
        var k = id + '|' + stamp;
        var held = dayCache[k];
        if (!held || typeof fetch !== 'function') return Promise.resolve(false);

        var now = Date.now();
        if (revCheckedAt[k] && now - revCheckedAt[k] < REV_CHECK_MS) return Promise.resolve(false);
        revCheckedAt[k] = now;

        // no-cache means REVALIDATE, not re-download: the browser sends the
        // conditional headers it already has and the server answers 304 when
        // nothing moved.
        return fetch(dayUrl(id, stamp), { cache: 'no-cache' }).then(function (r) {
            clockFromHeader(r);
            return r.ok ? r.json() : null;
        }).then(function (doc) {
            if (!doc || !doc.entries || !doc.entries.length) return false;
            // No rev on either side means an older file; treat it as unchanged
            // rather than reloading on every check.
            if (!doc.rev || !held.rev || doc.rev === held.rev) return false;
            dayCache[k] = doc;
            storeDay(k, doc);
            return true;
        }).catch(function () { return false; });
    }

    /**
     * The whole-second fallback, for an origin with no time endpoint.
     *
     * Ignored once /api/time has answered: this is up to a second out by
     * construction — an HTTP Date header carries no fractions — and letting it
     * overwrite a measured sync would throw away the better number every time a
     * schedule was fetched.
     */
    function clockFromHeader(r) {
        if (clockMeasured) return;
        try {
            var d = Date.parse((r.headers && r.headers.get('date')) || '');
            if (d) { clockOffset = d - Date.now(); clockSyncedAt = Date.now(); }
        } catch (e) { /* no headers, no correction */ }
    }

    /** Which entry covers this instant, and how far into it we already are. */
    function resolveAt(doc, ms) {
        if (!doc || !doc.entries || !doc.entries.length) return null;
        var sec = Math.floor((ms - Date.parse(doc.startsAt)) / 1000);
        if (sec < 0 || sec >= doc.seconds) return null;
        var lo = 0, hi = doc.entries.length - 1;
        while (lo <= hi) {
            var mid = (lo + hi) >> 1, e = doc.entries[mid];
            if (sec < e.t) hi = mid - 1;
            else if (sec >= e.t + e.d) lo = mid + 1;
            else return { entry: e, index: mid, into: sec - e.t };
        }
        return null;
    }

    // A track started within this many seconds of its top starts AT its top.
    //
    // At a hand-over the clock has usually ticked a second or two past the new
    // entry's start — the file before it ran a moment long, the day file was
    // consulted, the metadata arrived — and seeking to that offset clipped the
    // opening of the song. Every listener heard songs beginning a second in,
    // which is audible on anything with a soft intro and buys nothing: a second
    // against a schedule whose durations are rounded to the second is noise.
    var START_SNAP = 2.5;

    // Joining a station mid-track is the normal case here, not the exception,
    // so the seek has to survive metadata not having arrived yet.
    function seekTo(el, into) {
        if (into > 0 && into < START_SNAP) return;      // start at the top
        if (!(into > 0)) return;
        if (el.readyState > 0) { try { el.currentTime = into; } catch (e) {} return; }
        el.addEventListener('loadedmetadata', function once() {
            el.removeEventListener('loadedmetadata', once);
            try { el.currentTime = into; } catch (e) {}
        });
    }

    // 2.5.4(3) — a gap at a boundary reads instantly as "playlist" rather than
    // "station", so the following entry is in cache before this one ends.
    function warm(doc, i) {
        var e = doc.entries[i + 1];
        if (!e || !e.u) { preload = null; return; }
        var url = trackUrl(doc, e);
        if (preload && preload.key === url) return;
        try {
            var a = new Audio();
            a.preload = 'auto';
            a.src = url;
            a.load();
            preload = { key: url, el: a };
        } catch (err) { preload = null; }
    }

    /**
     * Tune the station's day file and start playing at the live position.
     *
     * `el` is an <audio> the caller already created inside the click, if there
     * was one — see start(). Reusing it is what keeps Safari and iOS willing to
     * play, because the day file only arrives a fetch later.
     */
    function playDay(station, el) {
        var id = station.tenant;
        return fetchDay(id, broadcastDate(now())).then(function (doc) {
            if (!current || current.tenant !== id) throw new Error('tuned away');
            if (!doc) { setSub('Programming not published yet'); throw new Error('no day file'); }
            var at = resolveAt(doc, now());
            if (!at) { setSub('Off air'); throw new Error('outside the broadcast day'); }

            if (!el) el = new Audio();
            el.volume = volume();
            audio = el;
            dayIndex = at.index;
            dayDate = doc.date;
            badRun = 0;
            lead = 0;              // resolved straight off the clock: on the grid
            setTrack(at.entry);
            el.src = trackUrl(doc, at.entry);
            loadedUrl = trackUrl(doc, at.entry);
            seekTo(el, at.into);
            // 2.5.4(2) — there is no "play the next track" path. When one ends,
            // the clock is asked again. An error does the same, so a bad file
            // costs one track rather than the session.
            el.addEventListener('ended', function () { onTrackEnded(el); });
            el.addEventListener('error', function () { skipBadTrack(el); });
            el.addEventListener('playing', function () { badRun = 0; });
            hookWaves(el);
            warm(doc, at.index);
            announce();
            return el.play();
        });
    }

    /**
     * The one case where re-deriving is the WRONG answer.
     *
     * 2.5.4(2) says never advance a pointer, and for a track that ENDED that is
     * right. For a track that will not load it is not: the clock has barely
     * moved, so re-deriving resolves to the same broken entry, and because the
     * element is left paused by the error the periodic tick then refuses to
     * touch it. The station goes silent and stays silent — no error in the
     * console, nothing playing, exactly as if the button had done nothing.
     *
     * So a failed track is stepped over rather than re-derived. The next
     * periodic sync puts the position back on the clock, so the station rejoins
     * the broadcast on its own within fifteen seconds.
     */
    /** Load entry #index and play it from `into` seconds in. */
    function playEntry(doc, index, into) {
        if (!audio || !doc || index < 0 || index >= doc.entries.length) return false;
        dayIndex = index;
        dayDate = doc.date;
        loadedUrl = trackUrl(doc, doc.entries[index]);
        setTrack(doc.entries[index]);
        audio.src = trackUrl(doc, doc.entries[index]);
        seekTo(audio, into || 0);
        warm(doc, index);
        audio.play().catch(function () {});
        return true;
    }

    /**
     * A track has finished. Work out what should follow.
     *
     * The normal case is that the clock has already moved into the next entry
     * and syncDay does the rest. The case that has to be handled here is the
     * file being SHORTER than the slot the schedule gave it — encoder padding, a
     * duration rounded to the whole second, or a browser firing 'ended'
     * fractionally early — so the clock still resolves to the entry that just
     * finished and there is a hole to fill.
     *
     * THE HOLE IS FILLED BY STARTING THE NEXT ENTRY, ALWAYS.
     *
     * This used to wait the remainder out, so that a player whose file came up
     * short did not walk ahead of the rest of the audience (2.5.3). The waiting
     * is what a listener heard: a file ten seconds short of its slot bought
     * ELEVEN SECONDS OF SILENCE between two songs, which reads as a dead station
     * long before it reads as fidelity to a schedule. Sub-second shortfalls were
     * snapped over and everything up to half a minute was sat through.
     *
     * Being a few seconds ahead of the published grid is inaudible. A silence
     * between songs is not, and neither is the correction that used to follow it
     * (see syncDay: the drift rule then yanked the NEXT song backwards to catch
     * up, mid-play). Continuity wins; the drift is bounded by how wrong the
     * file's own duration is, it does not accumulate over ordinary rounding —
     * files run long as often as they run short — and re-tuning, a reload or the
     * next broadcast day all re-derive from the clock.
     *
     * A shortfall past SHORTFALL_REPORT is not rounding, it is a broken object:
     * the next entry still starts, and it is said out loud so it can be fixed at
     * the source rather than heard by listeners forever.
     */
    var SHORTFALL_REPORT = 5;

    function onTrackEnded(el) {
        if (el !== audio || !current || !current.tenant) return;
        var id = current.tenant;
        fetchDay(id, broadcastDate(now())).then(function (doc) {
            if (!doc || el !== audio || !current || current.tenant !== id) return;
            var at = resolveAt(doc, now());

            // The clock has moved on by itself: ordinary hand-over.
            if (!at || at.index !== dayIndex) { syncDay(true); return; }

            var remain = Math.max(0, at.entry.d - at.into);
            // What THIS file was short by, not what the player was already
            // carrying: a lead of a minute makes every following track end a
            // minute before its slot, and blaming each of them in turn would
            // bury the one file that is actually broken.
            var shortBy = remain - lead;
            if (shortBy > SHORTFALL_REPORT) {
                console.warn('[kj-player] ' + id + ' entry ' + dayIndex + ' (' +
                    (at.entry.ti || '?') + ') ran ' + Math.round(shortBy) +
                    's short of its ' + at.entry.d + 's slot — the published duration ' +
                    'does not match the audio. Playing on rather than leaving a hole.');
            }
            lead = remain;
            playEntry(doc, dayIndex + 1, 0);
        });
    }

    function skipBadTrack(el) {
        if (el !== audio || !current || !current.tenant) return;
        var id = current.tenant;
        // A whole run of dead files means something bigger is wrong than one
        // bad track; walking 500 entries one 404 at a time would hammer the CDN
        // and never produce audio.
        if (++badRun > 8) { setSub('Programming unavailable'); paintPlaying(false); return; }
        fetchDay(id, broadcastDate(now())).then(function (doc) {
            if (!doc || el !== audio || !current || current.tenant !== id) return;
            if (!playEntry(doc, dayIndex + 1, 0)) { setSub('Off air'); paintPlaying(false); }
        });
    }

    /**
     * 2.5.4(2) — re-derive the position, never advance it.
     *
     * Runs at every track boundary and on a periodic tick, so a backgrounded
     * tab, a throttled timer or a long stall all rejoin the live position
     * rather than resuming where they fell asleep. Error cannot accumulate
     * across a long session because nothing is ever counted forward.
     *
     * ── THE RULE THIS FUNCTION OBEYS ────────────────────────────────────────
     *
     * A SONG THAT IS SOUNDING IS NEVER TOUCHED. Not seeked, not reloaded, not
     * cut. Every change to the audio happens at a hand-over — a track that
     * ended or failed — or while nothing is playing. `force` is what says a
     * hand-over is in progress, and only a hand-over may move the audio.
     *
     * The periodic tick therefore updates the BAR and nothing else. That is a
     * deliberate reversal: the tick used to correct the audio too, and each of
     * the three ways it did so was audible in the middle of a song.
     *
     *   - drift over three seconds was corrected by seeking the element. A
     *     buffering stall, or the whole-second HTTP Date header moving the
     *     clock under it, was enough to trip it; the listener heard the song
     *     jump. Worse, after a short file had put the player legitimately ahead
     *     of the grid, this rule dragged the NEXT song BACKWARDS by that much —
     *     sixty-seven seconds into a track it restarted at eight. That is the
     *     "randomly repeats in the middle of a song" this fixes.
     *   - a schedule republished mid-listen reloaded whatever was playing.
     *   - an entry boundary crossed while a long file was still running cut it.
     *
     * None of the three is worth interrupting a song for, because all three
     * resolve themselves at the next hand-over, which is seconds or minutes
     * away and inaudible. What is lost is exactness against the published grid
     * between now and then — a listener may sit a few seconds off the rest of
     * the audience until the next track starts. That is the right trade: the
     * grid is a means to a station that sounds continuous, not the other way
     * round.
     *
     * The tick keeps one power over the audio, and it is the opposite of
     * interrupting: if the element is supposed to be playing and is NOT, it
     * takes that as a hand-over and rejoins. See the watchdog in followDay.
     */
    function syncDay(force) {
        if (!current || !current.tenant) return;
        var id = current.tenant;
        var stamp = broadcastDate(now());
        maybeRefreshDay(id, stamp).then(function (changed) {
        fetchDay(id, stamp).then(function (doc) {
            if (!doc || !current || current.tenant !== id) return;
            // The schedule moved under us. Re-derive against the new one — but
            // only reload the audio if the track that should be sounding is
            // actually a different file, or a revision that only renamed the
            // station would restart the song the listener is in the middle of.
            if (changed) {
                var at0 = resolveAt(doc, now());
                if (at0 && trackUrl(doc, at0.entry) === loadedUrl) { dayIndex = at0.index; dayDate = doc.date; }
                else dayIndex = -1;
            }
            var at = resolveAt(doc, now());
            if (!at) return;

            // THE BAR NAMES WHAT IS AUDIBLE, NOT WHAT THE GRID SAYS.
            //
            // Those are the same thing whenever the player is on the grid, which
            // is nearly always. They come apart exactly when a song is being left
            // alone to finish — a file that ran long, or one that came up short
            // and put the player a little ahead — and in that window naming the
            // grid's song would caption the audio with a track the listener
            // cannot hear. Whatever is loaded is what gets named.
            var sounding = audio && !audio.paused;
            if (!sounding || trackUrl(doc, at.entry) === loadedUrl) setTrack(at.entry);

            if (!audio || (audio.paused && !force)) return;
            // A song is sounding and this is not a hand-over: leave it alone.
            // Everything below changes what is coming out of the speakers.
            if (sounding && !force) return;
            if (at.index !== dayIndex) {
                // NEVER WALK BACKWARDS inside the same broadcast day. A file that
                // came up short of its slot leaves the player deliberately ahead
                // of the clock; without this the next hand-over would send it back
                // to the entry it just left and the two would fight, the listener
                // hearing the same two tracks alternate.
                //
                // Across a day boundary the indexes belong to different files and
                // a lower one is simply the new day starting, so the guard is
                // scoped to a matching date.
                if (doc.date === dayDate && at.index < dayIndex && !audio.paused) return;
                lead = 0;          // taking the entry the clock names: back on the grid
                playEntry(doc, at.index, at.into);
                return;
            }
            // SAME INDEX IS NOT THE SAME TRACK. A revision can renumber nothing
            // and still change which file entry N points at — a re-ingest does
            // exactly that. Comparing the URL rather than the index is what
            // catches it, and it catches every path into here rather than only
            // the one that happened to notice the revision change.
            if (trackUrl(doc, at.entry) !== loadedUrl) { playEntry(doc, at.index, at.into); return; }

            // Genuinely the same track, and this is a hand-over, so the element
            // has just ended or failed: put it back where the clock says. There
            // is deliberately no drift correction for a track that is SOUNDING —
            // see the rule above.
            if (audio.paused) { seekTo(audio, at.into); audio.play().catch(function () {}); }
        });
        });
    }

    /**
     * THE SILENT STALL WATCHDOG — streaming-services.md §9.11.
     *
     * "The worst failure mode is not an error, it is the silent stall: internal
     * state says playing, no audio is coming out, and no event ever fires."
     * Nothing in the element's own event vocabulary reports this. It does not
     * pause, it does not error, it does not stall; currentTime simply stops
     * moving and the station is over for that listener until they reload.
     *
     * So the clock is asked instead of the element. Every two seconds, has the
     * position advanced? Three consecutive misses and the player stops believing
     * the element and forces a full recovery: re-sync the clock, re-derive the
     * position, seek, resume. §9.11 is explicit that the watchdog is
     * authoritative over reported element state — if the element claims to be
     * playing and the clock disagrees, the clock wins.
     *
     * A SEEK HERE IS NOT A MID-SONG INTERRUPTION. This fires only when no sound
     * is coming out, so there is no listening experience to protect; the seek is
     * what ends the silence. That is the line between this and the drift
     * correction the player deliberately does not do (see syncDay).
     */
    var WATCHDOG_MS = 2000;
    var WATCHDOG_MISSES = 3;
    var watchTimer = null;
    var watchLast = -1;
    var watchMissed = 0;
    var watchRecoveries = 0;

    function startWatchdog() {
        if (watchTimer) return;
        watchLast = -1; watchMissed = 0;
        watchTimer = setInterval(function () {
            // Only meaningful while sound is supposed to be coming out. A paused
            // player is not stalled, it is paused.
            if (!wantPlaying || !audio || audio.paused) { watchLast = -1; watchMissed = 0; return; }

            var t = audio.currentTime;
            if (watchLast >= 0 && t <= watchLast + 0.01) {
                watchMissed++;
                if (watchMissed === 1) console.info('[kj-player] rebuffer: position has not advanced');
                if (watchMissed >= WATCHDOG_MISSES) {
                    watchMissed = 0;
                    watchRecoveries++;
                    console.warn('[kj-player] silent stall — forcing recovery (' + watchRecoveries + ')');
                    // §9.11 step 4, in order: clock first, because a position
                    // recomputed against a stale clock recovers to the wrong second.
                    syncClock(true).then(function () { syncDay(true); });
                    if (watchRecoveries >= 2) setSub('Reconnecting…');
                }
            } else {
                watchMissed = 0;
                if (watchRecoveries && t > watchLast) watchRecoveries = 0;   // sound is back
            }
            watchLast = t;
        }, WATCHDOG_MS);
    }

    function stopWatchdog() {
        if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
        watchLast = -1; watchMissed = 0;
    }

    /** Keep the bar — and, once playing, the audio — tied to the day file. */
    function followDay(station) {
        if (dayTimer) { clearInterval(dayTimer); dayTimer = null; }
        if (!station || !station.tenant || typeof fetch !== 'function') return;
        syncClock();                 // §4.3: a fresh sync before the first position
        startWatchdog();             // §9.11
        syncDay(false);
        dayTimer = setInterval(function () {
            // §4.3: every five minutes during active playback. syncClock()
            // rate-limits itself, so calling it on the fifteen-second tick costs
            // one comparison nineteen times out of twenty.
            if (wantPlaying) syncClock();
            // THE ONE POWER THE TICK HAS OVER THE AUDIO, and it is the opposite
            // of interrupting: sound was wanted and there is none. A hand-over
            // that never fired its event leaves the element paused mid-day, and
            // without this the station simply stops for good. Re-derive from the
            // clock, which is a hand-over in every sense that matters.
            if (wantPlaying && audio && audio.paused) { syncDay(true); return; }
            syncDay(false);
        }, 15000);
    }

    function nextTrack(el) {
        // A stale 'ended'/'error' from an element we already dropped must not
        // restart playback over the top of a newly tuned station.
        if (el !== audio || !queue.length) return;
        if (qi >= queue.length) { shuffle(queue); qi = 0; }
        var track = queue[qi++];
        setTrack(track);
        el.src = localise(track.url);
        el.play().catch(function () { /* skipped by the error handler */ });
    }

    function playManifest(station) {
        var url = station.manifest;
        var go = function (manifest) {
            queue = shuffle(flatten(manifest));
            qi = 0;
            if (!queue.length) { setSub('Nothing to play'); return Promise.reject(new Error('empty manifest')); }
            var el = new Audio();
            el.volume = volume();
            audio = el;
            el.addEventListener('ended', function () { nextTrack(el); });
            el.addEventListener('error', function () { nextTrack(el); });
            hookWaves(el);
            var first = queue[qi++];
            setTrack(first);
            el.src = localise(first.url);
            announce();
            return el.play();
        };
        if (manifestCache[url]) return go(manifestCache[url]);
        return fetch(url).then(function (r) {
            if (!r.ok) throw new Error('manifest HTTP ' + r.status);
            return r.json();
        }).then(function (m) {
            manifestCache[url] = m;
            // Same guard playDay uses at its own await: a manifest for the
            // station the listener has already left must not be allowed to
            // overwrite the shared queue for the one they are on now.
            if (!current || current.manifest !== url) throw new Error('tuned away');
            return go(m);
        });
    }

    function playStream(station) {
        var el = new Audio();
        el.volume = volume();
        audio = el;
        hookWaves(el);
        setSub(subFor(station));
        el.src = station.stream;
        announce();
        return el.play();
    }

    // Tell other in-page audio (article read-aloud, etc.) to yield.
    function announce() {
        try { window.dispatchEvent(new CustomEvent('jv-media-start', { detail: { source: 'radio' } })); } catch (e) {}
    }

    function volume() {
        var v = parseFloat(read(KEY.volume, '0.7'));
        return isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v));
    }

    /**
     * THE THREE LINES THE BAR SHOWS, each answering exactly one question:
     *
     *     Jubilee Kids Party                          what am I listening to
     *     Tiger Tango Jungle Swing (Tiger S Tango)    what is playing
     *     HM 329.12 (Kids)                            where on the dial
     *
     * It used to be two, with the station folded into the second line beside
     * the frequency and the format:
     *
     *     Tiger Tango Jungle Swing (Tiger S Tango)
     *     Jubilee Kids Party HM 329.12 (Kids)         <- the old shape
     *
     * That buried the station — the thing the listener actually chose — in the
     * smallest, dimmest text in the bar, and left line two carrying three
     * unrelated facts. Split, each line can be read at a glance.
     */

    /**
     * THE ONE PLACE THE STATION'S NAME IS READ FROM.
     *
     * Every surface on the site — the cards, the table, the hover preview, this
     * bar — takes the name off the catalogue record. The tenant record and the
     * published day file each carry a copy as well, and those are DERIVED: they
     * are written from the catalogue and never read back for display.
     *
     * That is not a style preference. The two were independent and had already
     * drifted: HM377.70 read "Hebraic Celebrations" on every page and "Hebraic
     * Celebrations (Messianic)" in its own day files. One source means renaming
     * a station renames it everywhere. See docs/STATION-NAMING.md.
     */
    function stationName(s) { return (s && s.name) || ''; }

    /** Line two. The album is parenthesised only when there is one, so a track
     *  without one never renders a bare "( )". Empty when the song is not known
     *  yet — line one already names the station, so there is nothing to fall
     *  back to and repeating it would read as a bug. */
    function lineSong(track) {
        if (!track || !track.title) return '';
        return track.title + (track.album ? ' (' + track.album + ')' : '');
    }

    /** Line three: where on the dial, and the format in brackets. */
    function lineStation(s) {
        return 'HM ' + s.hm + (s.format ? ' (' + s.format + ')' : '');
    }

    function subFor(s) { return lineStation(s); }

    // ---- the bar ----------------------------------------------------------
    var ICON = {
        play: 'M7 5v14l12-7z',
        pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
        vol: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z',
        mute: 'M16.5 12A4.5 4.5 0 0014 8v2.18l2.45 2.45c.03-.2.05-.41.05-.63zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25a7.06 7.06 0 01-2.25 1.21v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73 4.27 3z',
        expand: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
        prev: 'M6 6h2v12H6zm3 6 9-6v12z',
        next: 'M16 6h2v12h-2zM6 6l9 6-9 6z',
        wave: 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z',
    };
    function svg(d) { return '<svg viewBox="0 0 24 24"><path d="' + d + '"></path></svg>'; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function injectCss() {
        if (document.getElementById('kj-footer-player-css')) return;
        var css = [
'#kjPlayer{position:fixed;left:0;right:0;bottom:0;height:80px;z-index:90000;',
'  display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;padding:0 20px;',
'  background:linear-gradient(180deg,rgba(20,21,29,.97),rgba(10,11,16,.99));',
'  border-top:2px solid var(--kjp-accent,#3DA5FF);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
'  font-family:"Segoe UI",Tahoma,Geneva,Verdana,-apple-system,sans-serif;color:#f3f2ee;',
/* THE BAR IS VISIBLE BY DEFAULT. It used to start translated off-screen and
   be revealed by an .active class added on the LAST line of paintStation,
   which made "is the player on screen" depend on a paint completing without
   throwing. Now that the bar is permanent on every page, its resting state
   should be shown, and only an explicit .hidden can take it away. */
'  transition:transform .3s ease}',
'#kjPlayer.hidden{transform:translateY(100%)}',
/* While playing the solid border is replaced in place by a moving band - same
   2px, so the edge does not appear to thicken when playback starts. */
'#kjPlayer.playing{border-top-color:transparent}',
'#kjPlayer.playing::before{content:"";position:absolute;top:-2px;left:0;right:0;height:2px;',
'  background:linear-gradient(90deg,#3DA5FF,#7CC4FF,#4cc9f0,#a55eea,#feca57,#3DA5FF);',
'  background-size:300% 100%;animation:kjflow 4s linear infinite;pointer-events:none}',
'@keyframes kjflow{0%{background-position:0 50%}100%{background-position:300% 50%}}',
'@media (prefers-reduced-motion:reduce){#kjPlayer.playing::before{animation:none}}',
/* THE EQUALIZER.
   A canvas filling the bar, behind everything, drawn from the sound that is
   actually playing. It is the only decorative thing in this player and it earns
   its place by being true: every column is one band of the audio's own
   spectrum, so what a listener watches is what they are hearing rather than an
   animation playing alongside it.
   Under the controls, never over them. The bar's three columns are given a
   stacking context of their own so the text stays crisp on top, and the canvas
   is held to a low opacity because a legible station name matters more than a
   bright light show. */
'#kjPlayer .waves{position:absolute;inset:0;width:100%;height:100%;z-index:0;',
'  opacity:.5;pointer-events:none}',
'#kjPlayer .now,#kjPlayer .ctrls,#kjPlayer .right{position:relative;z-index:1}',
'#kjPlayer .now{display:flex;align-items:center;gap:12px;min-width:0}',
'#kjPlayer .cover{width:60px;height:60px;border-radius:6px;flex:none;overflow:hidden;position:relative;',
'  display:flex;align-items:center;justify-content:center;cursor:pointer;',
'  transition:transform .18s ease,box-shadow .18s ease}',
'#kjPlayer .cover:hover{transform:scale(1.04);box-shadow:0 4px 18px rgba(61,165,255,.35)}',
'#kjPlayer .cover img{width:100%;height:100%;object-fit:cover;display:block}',
'#kjPlayer .cover .hm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
'  font-family:"Orbitron","Segoe UI",sans-serif;font-weight:700;font-size:12px;color:hsla(0,0%,100%,.92)}',
'#kjPlayer .meta{min-width:0;display:flex;flex-direction:column;gap:2px}',
'#kjPlayer .station{font-weight:700;font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'#kjPlayer .title{font-size:12.5px;line-height:1.2;color:#d8dae4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'#kjPlayer .sub{font-size:11.5px;line-height:1.2;color:#a9abb8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
/* Nothing is playing yet, so the song line has no text. Collapse it rather
   than leaving a 15px gap between the station and its frequency. */
'#kjPlayer .title:empty{display:none}',
/* THE PLAY BUTTON IS ON THE BAR'S MIDLINE, AND NOTHING MOVES IT.
   The bar is a three column grid - 1fr auto 1fr - so the middle column centres
   itself between two equal sides. That centres the COLUMN, which is only the
   same thing as centring the button while the column is symmetrical about it.
   It now is, by construction: a stepper, the button, a stepper, all the same
   size. That is why the fixed width and the invisible mirror this rule used to
   carry are gone - they existed only to hold the button on the midline while
   the STREAMING lamp sat beside it, and the lamp has moved to the right-hand
   group, ahead of the speaker. */
'#kjPlayer .ctrls{display:flex;align-items:center;gap:14px}',
'#kjPlayer button.step{width:34px;height:34px;border-radius:50%;color:#c9cad4}',
'#kjPlayer button.step svg{width:17px;height:17px}',
'#kjPlayer button.step:hover{color:#fff;background:hsla(0,0%,100%,.08)}',
'#kjPlayer button{background:none;border:0;color:#f3f2ee;cursor:pointer;padding:6px;border-radius:4px;',
'  display:flex;align-items:center;justify-content:center;transition:color .15s ease,transform .15s ease}',
'#kjPlayer button:hover{color:#7CC4FF}',
'#kjPlayer button:active{transform:scale(.94)}',
'#kjPlayer button svg{width:18px;height:18px;fill:currentColor;pointer-events:none}',
'#kjPlayer button.play{background:var(--kjp-accent,#3DA5FF);border-radius:50%;width:36px;height:36px;padding:0;color:#052033}',
'#kjPlayer button.play:hover{background:#7CC4FF;color:#052033}',
'#kjPlayer button.play svg{width:16px;height:16px}',
/* In the right-hand group now, immediately ahead of the speaker. flex:none so
   it keeps its own width there and never squeezes the volume slider. */
'#kjPlayer .live{flex:none;white-space:nowrap;margin-right:2px;',
'  display:inline-flex;align-items:center;gap:6px;font-size:9.5px;font-weight:700;',
'  letter-spacing:.09em;text-transform:uppercase;color:#46D07A}',   /* STREAMING is green, not the site accent */
'#kjPlayer .live i{width:5px;height:5px;border-radius:50%;background:currentColor;display:block;',
'  animation:kjpulse 1.8s ease-in-out infinite}',
'#kjPlayer .live.off{color:#8c8d9c}',
'#kjPlayer .live.off i{animation:none}',
'@keyframes kjpulse{0%,100%{opacity:1}50%{opacity:.25}}',
'#kjPlayer .right{display:flex;align-items:center;justify-content:flex-end;gap:10px;min-width:0}',
'#kjPlayer .volume{display:flex;align-items:center;gap:6px}',
'#kjPlayer .volume input{width:88px;accent-color:var(--kjp-accent,#3DA5FF);cursor:pointer}',
// --kj-player-h lets a page size content against the bar (index.html's hero
// runs to exactly the top of it) without hard-coding 80px in a second place.
'body.kj-has-player{--kj-player-h:80px;padding-bottom:var(--kj-player-h,80px)}',
'@media (max-width:860px){',
'  #kjPlayer{grid-template-columns:1fr auto;gap:12px;padding:0 12px}',
     /* Two columns here, so the transport is right-aligned rather than centred
        and there is no midline to hold. The steppers go first: on a phone the
        station name needs the width more than a dial-stepping shortcut does,
        and play/pause is the control that has to survive. */
'  #kjPlayer .ctrls{gap:10px}',
'  #kjPlayer button.step{display:none}',
'  #kjPlayer .right .volume{display:none}',
'}',
'@media (max-width:560px){#kjPlayer .cover{width:46px;height:46px}#kjPlayer .right{display:none}}'
        ].join('');
        var el = document.createElement('style');
        el.id = 'kj-footer-player-css';
        el.textContent = css;
        document.head.appendChild(el);
    }

    /* ──────────────────────────────────────────────────────────────────────
     * THE WAVES — an audio-reactive background for the bar.
     *
     * Web Audio, driven by the element the player is already using: the source
     * is tapped, passed through an analyser, and passed straight on to the
     * speakers. The shapes drawn are that analyser's frequency bands, so the
     * motion is the music and not a loop pretending to be.
     *
     * THREE RULES, because a decoration must never cost the audio:
     *
     *  1. A media element routed into an AudioContext plays through that
     *     context and nothing else. If the context is SUSPENDED - which is its
     *     state until a gesture resumes it - connecting would silence the
     *     station. So nothing is connected until the context is confirmed
     *     running.
     *  2. A cross-origin resource without CORS makes the source node output
     *     SILENCE by specification. Every track here is same-origin through
     *     /cdn, but a station whose day file pointed elsewhere would go quiet
     *     for no visible reason, so the origin is checked before connecting.
     *  3. Any failure at all falls back to the time-driven idle wave below.
     *     The listener loses the reactivity, not the radio.
     *
     * Failing all of that, there is still something to watch: an idle wave that
     * breathes on a timer. Silence with a still canvas reads as broken; silence
     * with a moving line reads as a station between songs.
     * ────────────────────────────────────────────────────────────────────── */
    var wavesCanvas = null, wavesCtx = null, wavesRAF = null, wavesHue = 0;
    var audioCtx = null, analyser = null, freqData = null;
    var tapCount = 0;
    var tapped = (typeof WeakSet === 'function') ? new WeakSet() : null;
    var tappedFallback = [];

    function alreadyTapped(el) {
        if (tapped) return tapped.has(el);
        return tappedFallback.indexOf(el) >= 0;
    }
    function markTapped(el) {
        if (tapped) tapped.add(el); else tappedFallback.push(el);
    }

    function sameOrigin(url) {
        try { return new URL(url, location.href).origin === location.origin; }
        catch (e) { return false; }
    }

    /** Tap the element for analysis, or leave it completely alone. */
    function tapAudio(el) {
        if (!el || alreadyTapped(el)) return;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!sameOrigin(el.currentSrc || el.src)) return;      // rule 2

        try {
            if (!audioCtx) audioCtx = new AC();
            if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
            // rule 1 — never route audio into a context that is not running
            if (audioCtx.state !== 'running') return;

            var src = audioCtx.createMediaElementSource(el);
            if (!analyser) {
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 512;          // 256 bins - enough columns to read as a spectrum
                analyser.smoothingTimeConstant = 0.8;
                freqData = new Uint8Array(analyser.frequencyBinCount);
                analyser.connect(audioCtx.destination);
            }
            src.connect(analyser);
            tapCount++;
            markTapped(el);
        } catch (e) {
            // Already connected, blocked, or unsupported. The idle wave covers it.
            markTapped(el);
        }
    }

    /* Start the waves from the ELEMENT, not from the play promise.
       paintPlaying runs when play() RESOLVES, which can be a second after sound
       starts and may never happen on a stalled stream - the same gap that had
       the dial's lamp reading "Paused" over audible audio. The element's own
       'playing' event is the honest signal, and 'pause' is its counterpart. */
    function hookWaves(el) {
        if (!el) return;
        el.addEventListener('playing', function () {
            try { tapAudio(el); startWaves(); } catch (e) {}
        });
        el.addEventListener('pause', function () { try { stopWaves(); } catch (e) {} });
        el.addEventListener('ended', function () { /* the next track keeps them running */ });
    }

    function sizeWaves() {
        // Find the canvas here rather than waiting for playback to find it.
        // Sized only from startWaves, it kept the default 300x150 backing store
        // until the first press of play, so the first frames drawn were
        // stretched from a canvas a quarter of the bar's width.
        if (!wavesCanvas) wavesCanvas = document.getElementById('kjpWaves');
        if (!wavesCanvas || !bar) return;
        // No canvas support, or a context refused: there is simply no picture.
        if (typeof wavesCanvas.getContext !== 'function') { wavesCanvas = null; return; }
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = bar.clientWidth, h = bar.clientHeight;
        if (!w || !h) return;
        wavesCanvas.width = Math.round(w * dpr);
        wavesCanvas.height = Math.round(h * dpr);
        wavesCtx = wavesCanvas.getContext('2d');
        if (wavesCtx) wavesCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ── THE EQUALIZER ──────────────────────────────────────────────────
     *
     * This was four sine curves whose amplitude followed the music. It moved,
     * but it moved like an animation that happened to be near some audio: four
     * smooth lines cannot show what a mix is doing, because everything they
     * know about a whole band of frequencies is squeezed into one height.
     *
     * A column per band says far more with the same data. Forty-odd bars, each
     * reading its own slice of the spectrum, and the picture is the mix itself:
     * a kick lands as a stab on the left, a cymbal scatters the right, a held
     * chord stands the middle up. That is the difference between decoration and
     * a meter.
     *
     * FOUR THINGS MAKE IT READ AS AN EQUALIZER RATHER THAN A BAR CHART:
     *
     *   log-ish spacing   The FFT gives linear bins, and music is not linear:
     *                     half of a linear spectrum is content almost nothing
     *                     lands in, so the right-hand half of a linear meter
     *                     sits dead. The exponent spreads the low end out.
     *   fast up, slow down  Instant attack and a slow decay is what a real
     *                     meter does, and it is most of why one looks alive.
     *   peak caps         The little mark left behind at each column's highest
     *                     point, falling on its own. It is the detail that
     *                     makes a meter look like it is measuring something.
     *   mirrored          Around the middle, not standing on the floor: the
     *                     bar is 80px tall with text across it, and energy
     *                     spreading from the centre leaves the top and bottom
     *                     edges quiet where the type is.
     */
    /** The average energy of one slice of the spectrum, 0..1. */
    function bandEnergy(from, to) {
        if (!analyser || !freqData) return null;
        var n = freqData.length;
        var a = Math.floor(n * from), b = Math.max(a + 1, Math.floor(n * to));
        if (b > n) b = n;
        var sum = 0;
        for (var i = a; i < b; i++) sum += freqData[i];
        return (sum / (b - a)) / 255;
    }

    var eqLevels = [], eqPeaks = [];

    var EQ_BAR = 6;          // column width in px
    var EQ_GAP = 3;
    var EQ_ATTACK = 0.55;    // how much of a rise is taken immediately
    var EQ_DECAY = 0.055;    // how fast a column falls when the sound stops
    var EQ_PEAK_FALL = 0.011;

    function drawWaves(t) {
        wavesRAF = requestAnimationFrame(drawWaves);
        if (!wavesCtx || !bar) return;

        var w = bar.clientWidth, h = bar.clientHeight;
        if (!w || !h) return;
        wavesCtx.clearRect(0, 0, w, h);

        if (analyser && freqData) analyser.getByteFrequencyData(freqData);

        var n = Math.max(16, Math.floor(w / (EQ_BAR + EQ_GAP)));
        if (eqLevels.length !== n) {
            eqLevels = []; eqPeaks = [];
            for (var k = 0; k < n; k++) { eqLevels.push(0); eqPeaks.push(0); }
        }

        // The colour rotation, now swept ACROSS the bar as well as through
        // time: every column is a different hue and the whole spectrum walks.
        wavesHue = (wavesHue + 0.34) % 360;

        var mid = h / 2;
        var maxH = h * 0.44;
        var pad = (w - (n * (EQ_BAR + EQ_GAP) - EQ_GAP)) / 2;

        for (var i = 0; i < n; i++) {
            var target;
            if (analyser && freqData) {
                // Slice this column's own band, spaced so the low end - where
                // nearly all of the music is - gets most of the columns.
                var lo = Math.pow(i / n, 1.55);
                var hi = Math.pow((i + 1) / n, 1.55);
                target = bandEnergy(lo, Math.min(1, Math.max(hi, lo + 0.004)));
                if (target === null) target = 0;
                // The top of the spectrum is quiet on almost everything; lift it
                // so the right-hand columns are part of the picture.
                target = Math.min(1, target * (1 + 1.5 * (i / n)));
            } else {
                // No analyser: a slow travelling pattern, so the bar still has
                // life without pretending to be measuring anything.
                target = 0.20 + 0.15 * Math.sin(t / 430 + i * 0.5)
                              + 0.09 * Math.sin(t / 170 + i * 1.6);
            }

            // Fast attack, slow decay.
            eqLevels[i] = target > eqLevels[i]
                ? eqLevels[i] + (target - eqLevels[i]) * EQ_ATTACK
                : Math.max(0, eqLevels[i] - EQ_DECAY);

            eqPeaks[i] = eqLevels[i] > eqPeaks[i]
                ? eqLevels[i]
                : Math.max(eqLevels[i], eqPeaks[i] - EQ_PEAK_FALL);

            var x = pad + i * (EQ_BAR + EQ_GAP);
            var barH = Math.max(1.5, eqLevels[i] * maxH);
            var hue = (wavesHue + (i / n) * 300) % 360;

            wavesCtx.fillStyle = 'hsla(' + hue + ',95%,58%,.85)';
            wavesCtx.fillRect(x, mid - barH, EQ_BAR, barH * 2);

            // The cap: a thin mark at the highest point this column has
            // reached lately, falling on its own.
            var peakY = eqPeaks[i] * maxH;
            if (peakY > barH + 1.5) {
                wavesCtx.fillStyle = 'hsla(' + hue + ',100%,76%,.95)';
                wavesCtx.fillRect(x, mid - peakY - 2, EQ_BAR, 2);
                wavesCtx.fillRect(x, mid + peakY, EQ_BAR, 2);
            }
        }
    }

    function startWaves() {
        if (!bar) return;
        wavesCanvas = wavesCanvas || document.getElementById('kjpWaves');
        if (!wavesCanvas) return;
        if (!wavesCtx) sizeWaves();
        if (wavesRAF) return;
        wavesRAF = requestAnimationFrame(drawWaves);
    }

    function stopWaves() {
        if (wavesRAF) { cancelAnimationFrame(wavesRAF); wavesRAF = null; }
        // Leave the last frame rather than clearing to black: a bar that empties
        // the instant you pause looks like it broke rather than like it stopped.
    }

    var bar = null;

    /* Publishes the bar's measured height as --kj-player-h on <body>, where it
       beats the 80px starting value the stylesheet puts on body.kj-has-player.
       An inline property is the only place that can win against that rule while
       still being inherited by everything inside the page.

       Watched, not measured once: a ResizeObserver fires for every reason the
       height can change - the responsive layout switching at 860px and 560px,
       a browser zoom step changing where the rows round to whole pixels, a
       device rotating - so the value tracks the bar rather than describing it
       at one moment on one screen. */
    var barRO = null;

    function syncHeight() {
        if (!bar) return;
        /* Rounded up. Half a pixel short leaves a hairline of page background
           showing under content that is meant to meet the bar; half a pixel
           long is invisible. */
        var h = Math.ceil(bar.getBoundingClientRect().height);
        if (!h) return;                       /* display:none, or not laid out yet */
        document.body.style.setProperty('--kj-player-h', h + 'px');
        sizeWaves();                          /* the canvas is measured in the same breath */

        if (!barRO && typeof ResizeObserver === 'function') {
            barRO = new ResizeObserver(function () { syncHeight(); });
            barRO.observe(bar);
        }
    }
    /* Browsers without ResizeObserver still get the common cases. */
    window.addEventListener('resize', syncHeight);
    window.addEventListener('orientationchange', syncHeight);

    function build() {
        if (bar) return;
        injectCss();
        bar = document.createElement('div');
        bar.id = 'kjPlayer';
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'Radio player');
        bar.innerHTML =
            '<canvas class="waves" id="kjpWaves" aria-hidden="true"></canvas>' +
            '<div class="now">' +
              '<div class="cover" id="kjpCover" title="Open the full player"></div>' +
              '<div class="meta">' +
                // Three lines, in this order: the station, then what is playing
                // on it, then where it sits on the dial. paintStation() has
                // always written all three; the station line was missing from
                // the markup, and reading a null here took the other two down
                // with it.
                '<div class="station" id="kjpStation"></div>' +
                '<div class="title" id="kjpTitle"></div>' +
                '<div class="sub" id="kjpSub"></div>' +
              '</div>' +
            '</div>' +
            '<div class="ctrls">' +
              '<button class="step" id="kjpPrev" title="Previous station" aria-label="Previous station">' + svg(ICON.prev) + '</button>' +
              '<button class="play" id="kjpPlay" title="Play / pause" aria-label="Play or pause">' + svg(ICON.play) + '</button>' +
              '<button class="step" id="kjpNext" title="Next station" aria-label="Next station">' + svg(ICON.next) + '</button>' +
            '</div>' +
            '<div class="right">' +
              '<span class="live off" id="kjpLive"><i></i>Streaming</span>' +
              '<div class="volume" title="Volume">' +
                '<button id="kjpMute" aria-label="Mute">' + svg(ICON.vol) + '</button>' +
                '<input type="range" min="0" max="1" step="0.01" id="kjpVol" aria-label="Volume">' +
              '</div>' +
              '<button id="kjpOpen" title="Open the full radio player" aria-label="Open the full radio player">' + svg(ICON.expand) + '</button>' +
            '</div>';
        document.body.appendChild(bar);
        /* Reserves the 80px the fixed bar covers, so the last row of cards and
           the site footer are reachable rather than sitting under it forever.
           box-sizing:border-box is set by every page, so on the full-height
           flex layouts (map.html) this correctly shrinks the content box. */
        document.body.classList.add('kj-has-player');
        /* The 80px above is only the starting guess. What the bar ACTUALLY
           measures is what the rest of the page has to reserve, so the real
           height is measured and republished as --kj-player-h: the bar grows
           when a media query changes its layout, when the browser is zoomed to
           a percentage that lands the rows on different pixels, or when a long
           station name wraps. Pages that size content against the bar
           (index.html's hero runs to exactly its top edge) then stay exact at
           any resolution and any zoom instead of at 100% on one screen. */
        syncHeight();

        document.getElementById('kjpVol').value = String(volume());
        document.getElementById('kjpPlay').addEventListener('click', toggle);
        document.getElementById('kjpPrev').addEventListener('click', function () { step(-1); });
        document.getElementById('kjpNext').addEventListener('click', function () { step(1); });
        document.getElementById('kjpOpen').addEventListener('click', openFull);
        document.getElementById('kjpCover').addEventListener('click', openFull);
        document.getElementById('kjpMute').addEventListener('click', function () {
            if (!audio) return;
            audio.muted = !audio.muted;
            paintVolume();
        });
        document.getElementById('kjpVol').addEventListener('input', function () {
            var v = parseFloat(this.value);
            write(KEY.volume, v);
            if (audio) { audio.volume = v; audio.muted = false; }
            paintVolume();
        });
    }

    function openFull() {
        if (current) location.href = '/radio?station=' + encodeURIComponent(current.slug);
    }

    function paintVolume() {
        var b = document.getElementById('kjpMute');
        if (b) b.innerHTML = svg((audio && audio.muted) || volume() === 0 ? ICON.mute : ICON.vol);
    }

    function setStation(text) {
        var el = document.getElementById('kjpStation');
        if (el) el.textContent = text;
    }

    function setTitle(text) {
        var el = document.getElementById('kjpTitle');
        if (el) el.textContent = text;
    }

    function setSub(text) {
        var el = document.getElementById('kjpSub');
        if (el) el.textContent = text;
    }

    function paintStation(s) {
        build();
        var cover = document.getElementById('kjpCover');
        var grad = s.gradient || ['#2d2d2d', '#3a3a3a'];
        // The station picture if one has been generated, the ident gradient with
        // its frequency if not — the images are produced separately and a
        // station without one still has to look deliberate.
        cover.style.background = 'linear-gradient(135deg,' + grad[0] + ' 0%,' + grad[1] + ' 100%)';
        cover.innerHTML = '<span class="hm">' + esc(s.hm) + '</span>' +
            '<img alt="" src="/cdn/stations/' + encodeURIComponent(s.slug) + '.webp" ' +
            'onerror="this.remove()">';
        setStation(stationName(s));
        setTitle(lineSong(nowTrack));
        setSub(lineStation(s));
        // (the bar no longer needs revealing — it is visible from the moment
        // it is built; see the CSS note on #kjPlayer)
    }

    // `quiet` updates the bar without republishing the shared playing flag, so a
    // tab yielding to another one does not overwrite the state that other tab
    // has just set.
    function paintPlaying(on, quiet) {
        if (!bar) return;
        // The waves follow the sound, and this is the one function that knows
        // whether there is any. Tapping here also means the AudioContext is
        // created inside the gesture that started playback, which is the only
        // moment a browser will let it run.
        //
        // WRAPPED, AND THE RULE THIS ENFORCES IS THE POINT. paintPlaying runs
        // inside the promise chain that start() hangs its success on, so an
        // exception thrown in here does not just lose the picture: it rejects
        // that chain, the catch treats a playing station as a failed one, and
        // the flag saying the listener wants sound gets cleared. That is a
        // decoration reaching into playback, which is exactly what it is never
        // allowed to do. Caught here so it cannot.
        try {
            if (on) { tapAudio(audio); startWaves(); } else { stopWaves(); }
        } catch (e) { /* no waves; the radio does not care */ }
        bar.classList.toggle('playing', !!on);
        var b = document.getElementById('kjpPlay');
        if (b) b.innerHTML = svg(on ? ICON.pause : ICON.play);
        var live = document.getElementById('kjpLive');
        if (live) live.classList.toggle('off', !on);
        if (!quiet) write(KEY.playing, !!on);
        // Anything on the page that draws its own transport — the hover preview's
        // play button — needs to follow the bar rather than guess. Pausing from
        // the footer has to turn the card's button back into a play triangle.
        try {
            window.dispatchEvent(new CustomEvent('kj-player-state', {
                detail: { slug: current ? current.slug : null, playing: !!on },
            }));
        } catch (e) {}
    }

    // ---- tuning -----------------------------------------------------------
    function tune(slug, autoplay) {
        var s = bySlug(slug);
        if (!s || !(s.tenant || s.manifest || s.stream)) return;
        destroy();
        current = s;
        nowTrack = null;          // never carry the last station's song across
        write(KEY.slug, s.slug);
        paintStation(s);
        followDay(s);             // resolves the day file: the bar, then the audio
        paintPlaying(false);
        if (!autoplay) return;
        start();
    }

    function start() {
        if (!current) return;
        wantPlaying = true;
        // Safari and iOS grant playback only to an element touched inside the
        // gesture that asked for it, and the day file is a fetch away — by the
        // time it lands the click is off the stack. Creating the element here,
        // synchronously, is what carries the permission across that gap.
        var primed = null;
        try { primed = new Audio(); primed.volume = volume(); primed.load(); } catch (e) { primed = null; }

        // Day file first — it is how every live station is delivered. The other
        // two are only reached by a station with no published programming.
        var p = current.tenant ? playDay(current, primed)
              : current.manifest ? playManifest(current)
              : playStream(current);
        p.then(function () { paintPlaying(true); armResume(false); })
         .catch(function (err) {
             if (primed && primed !== audio) { try { primed.src = ''; } catch (e) {} }

             // A REFUSED AUTOPLAY IS NOT A FAILED STATION.
             //
             // This is the ordinary case after a refresh: the page is gone and
             // rebuilt, the listener has not touched the new one yet, and every
             // browser refuses to start audible sound until they do. Firefox
             // refuses by default everywhere; Chrome refuses until the site has
             // earned enough engagement. Nothing is broken — the sound is
             // waiting for a gesture.
             //
             // It used to be treated as a fault, and that made the SECOND
             // refresh worse than the first: the flag that says the listener
             // wants sound was cleared, so the next reload did not even attempt
             // to resume. A station playing before a refresh stayed silent
             // through every refresh after it until the play button was found.
             //
             // So a refusal keeps the intent and waits for the first touch
             // anywhere on the page. See armResume.
             if (err && err.name === 'NotAllowedError') {
                 paintPlaying(false, true);      // quiet: the intent flag stands
                 setSub('Press play to resume');
                 armResume(true);
                 return;
             }

             // Anything else is a real fault: the day file would not resolve, the
             // station is off air, the audio would not load. The listener is not
             // getting sound and the watchdog must not spend the session retrying.
             wantPlaying = false;
             console.info('[kj-player]', err && err.message);
             paintPlaying(false);
         });
    }

    /**
     * Resume at the listener's first touch, after a browser refused to autoplay.
     *
     * ON THE WAY IN, AND NOT A PROMPT. The listeners are capturing and passive,
     * on the three events a browser accepts as an activation gesture, so the
     * click that brings the station back is still free to do whatever it was
     * going to do — open a station, follow a link, scroll. Nobody is asked to
     * press anything in particular: the first thing they touch resumes the
     * sound, which is as close to "it kept playing" as a reloaded page can get.
     *
     * ONE HANDLER, HELD. Three events are armed together and any one of them
     * disarms all three, so the handler has to be the same object at add and at
     * remove — a fresh closure per call would leave two listeners attached for
     * the life of the page, and the next stray keypress would restart a station
     * the listener had since paused.
     */
    var resumeArmed = false;
    var resumeHandler = null;
    // Four, because "what counts as a gesture" is not the same everywhere:
    // pointerdown satisfies Chrome and Firefox, Safari has historically wanted a
    // click or a touchend, and keydown covers someone who never touches a mouse.
    // Whichever fires first disarms the other three.
    var RESUME_EVENTS = ['pointerdown', 'click', 'touchend', 'keydown'];

    function armResume(on) {
        var i;
        if (on) {
            if (resumeArmed) return;
            resumeArmed = true;
            resumeHandler = function () {
                armResume(false);
                // The gesture may have been the play button itself, or another
                // tab may have taken over in the meantime. Only step in if the
                // listener still wants sound and there is none.
                if (!wantPlaying || (audio && !audio.paused)) return;
                start();
            };
            for (i = 0; i < RESUME_EVENTS.length; i++) {
                document.addEventListener(RESUME_EVENTS[i], resumeHandler, { capture: true, passive: true });
            }
            return;
        }
        if (!resumeArmed) return;
        resumeArmed = false;
        for (i = 0; i < RESUME_EVENTS.length; i++) {
            document.removeEventListener(RESUME_EVENTS[i], resumeHandler, true);
        }
        resumeHandler = null;
    }

    /**
     * Step to the next or previous station ON THE DIAL.
     *
     * These buttons were taken off this bar once, on the grounds that previous
     * and next belong to a queue and a dial has none. That is right about a
     * QUEUE and wrong about this: LIVE is sorted by frequency, so stepping is
     * turning the dial one station, which is exactly what the buttons either
     * side of a tuner's play button have always done. They wrap, because a
     * band with an end you can fall off is not a band.
     */
    function step(dir) {
        if (!LIVE.length) return;
        var i = current ? liveIndex(current.slug) : -1;
        if (i < 0) i = 0; else i = (i + dir + LIVE.length) % LIVE.length;
        tune(LIVE[i].slug, true);
    }

    function toggle() {
        if (!current) return;
        if (audio && !audio.paused) { wantPlaying = false; audio.pause(); paintPlaying(false); return; }
        // A paused catalog station resumes where it was; a live mount has moved
        // on in the meantime, so it reconnects instead.
        if (audio && audio.paused && audio.src && current.manifest) {
            audio.play().then(function () { paintPlaying(true); })
                        .catch(function () { destroy(); start(); });
            return;
        }
        destroy();
        start();
    }

    // ---- public entry point ----------------------------------------------
    // Anything on the page can start a station: kjPlayer.play(<slug>).
    window.kjPlayer = {
        play: function (slug) { tune(slug, true); },
        stations: function () { return LIVE.slice(); },
        /* Whether the waves are reading real audio or breathing on a timer.
           Worth exposing: the two look similar in motion and completely
           different in meaning, and without this the only way to tell was to
           guess from the shapes. */
        visualiser: function () {
            var peak = 0;
            if (freqData) for (var i = 0; i < freqData.length; i++) if (freqData[i] > peak) peak = freqData[i];
            return {
                analysing: !!analyser,
                context: audioCtx ? audioCtx.state : null,
                drawing: !!wavesRAF,
                taps: tapCount,
                tappedCurrent: !!(audio && alreadyTapped(audio)),
                peakBin: peak                     // 0 means the analyser hears silence
            };
        },
        isLive: function (slug) { return liveIndex(slug) >= 0; },
        /** What is tuned, and whether it is sounding right now. */
        state: function () {
            return { slug: current ? current.slug : null, playing: !!(audio && !audio.paused) };
        },
        /**
         * Play this station, or pause it if it is the one already playing.
         *
         * The station a card offers is not necessarily the station the bar is on,
         * so a card cannot simply call toggle(): pressing play on a DIFFERENT
         * station while one is sounding must switch stations, not pause.
         */
        toggle: function (slug) {
            if (current && current.slug === slug) { toggle(); return; }
            tune(slug, true);
        },
    };

    // Delegated: any element carrying data-kj-play="<slug>" tunes that station.
    document.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-kj-play]') : null;
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        tune(t.getAttribute('data-kj-play'), true);
    });

    // Delegated: data-kj-toggle="<slug>" is the same control with a pause in it.
    //
    // Kept SEPARATE from data-kj-play rather than folded into it, because not
    // every control should pause. The station dialog's "Listen now" is a
    // commitment to start listening — pressing it on the station already playing
    // should not silence it. A transport button, which is what the hero and the
    // hover card have, is the opposite: it must show and do both.
    document.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-kj-toggle]') : null;
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        var slug = t.getAttribute('data-kj-toggle');
        if (current && current.slug === slug) { toggle(); return; }
        tune(slug, true);
    });

    /**
     * ONE TAB AT A TIME.
     *
     * Every page carries this bar and every page resumes what was playing, so a
     * listener who opens the site in a second tab — or who has half a dozen open
     * across a morning, which is the normal way people use it — ends up with two
     * copies of the same station running from two independent clocks. They are
     * never in step, because each resolved its position at a different second
     * and buffered differently: the same song arrives twice, a beat apart. It
     * sounds like the station is repeating itself, and no amount of care inside
     * one player can fix it, because each player is behaving perfectly.
     *
     * localStorage already carries the playing flag between tabs; a 'storage'
     * event fires in every tab EXCEPT the one that wrote it, so an incoming
     * "playing" can only mean another tab has taken over. This one steps back.
     * Quietly — the flag belongs to the tab that just claimed it.
     */
    window.addEventListener('storage', function (e) {
        if (!e || e.key !== KEY.playing || e.newValue !== 'true') return;
        if (audio && !audio.paused) {
            wantPlaying = false;
            try { audio.pause(); } catch (err) {}
            paintPlaying(false, true);
        }
    });

    /**
     * Coming back to the tab (§4.3, §9.5).
     *
     * WHAT THIS DOES NOT DO IS THE POINT. §9.5 asks for "re-sync clock, recompute
     * position, hard-seek" here, and the hard-seek half is deliberately left
     * out: a listener switching back to the tab is listening, and moving the
     * song they are in the middle of is the exact fault this player was rebuilt
     * to stop doing. Everything the seek would have fixed is fixed at the next
     * hand-over, seconds or minutes away, inaudibly.
     *
     * The clock re-sync is kept in full — it changes no audio, and a tab that
     * has been in the background for hours is where the device clock is most
     * likely to have moved. The watchdog above covers the case this really
     * guards: a backgrounded tab whose audio was suspended and never restarted.
     */
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;
        syncClock(true).then(function () {
            if (wantPlaying && audio && audio.paused) syncDay(true);
        });
    });

    // Yield to other audio on the page.
    window.addEventListener('jv-media-start', function (e) {
        if (!e || !e.detail || e.detail.source === 'radio') return;
        if (audio && !audio.paused) { audio.pause(); paintPlaying(false); }
    });

    // ---- boot -------------------------------------------------------------
    /**
     * THE BAR IS ALWAYS THERE.
     *
     * It used to appear only for someone who had already tuned something, which
     * meant a first-time visitor — the one person most in need of an obvious
     * way to start listening — saw no player at all. Now the bar is always
     * present, showing the flagship, paused, one click from sound.
     *
     * Which station that is comes from window.KJ_DEFAULT, emitted by the
     * catalogue generator from the same FLAGSHIP constant the hero and the
     * shelves order themselves by. Nothing is hardcoded here.
     *
     * NOTHING AUTOPLAYS on a first visit. The listener has not asked for audio
     * and browsers would refuse anyway; the bar simply stands ready. Only a
     * listener who WAS playing when they left a page gets a resume attempt.
     */
    function boot() {
        var slug = read(KEY.slug, '');
        var wasPlaying = read(KEY.playing, 'false') === 'true';

        if (slug && bySlug(slug)) {
            tune(slug, false);
            paintVolume();
            // Try to pick up where the last page left off. Browsers block
            // autoplay across a navigation often enough that this is best
            // effort: the bar simply shows paused and one click resumes.
            if (wasPlaying) start();
            return;
        }

        // No one has chosen yet. Show the flagship, silent.
        var fallback = window.KJ_DEFAULT;
        if (!fallback || !bySlug(fallback) || liveIndex(fallback) < 0) {
            // The flagship is missing or off air — take whatever is on air, in
            // dial order, rather than showing nothing.
            fallback = LIVE.length ? LIVE[0].slug : '';
        }
        if (!fallback) return;
        tune(fallback, false);
        paintVolume();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
