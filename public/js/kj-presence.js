/* ==========================================================================
   kj-presence.js — tells the server which frequency this browser is sitting
   on, so the dial can say "3 / 17".

   IT RIDES THE FOOTER PLAYER RATHER THAN THE DIAL PAGE. The player is mounted
   on every page and keeps the station across navigations, so presence follows
   the listener into the articles and the map instead of ending the moment they
   leave /player. That is also the only definition of "listener" that matches
   what a listener would say they are doing.

   A SEPARATE FILE, not an addition to kj-footer-player.js: that file is the
   audio path, and a heartbeat has no business inside the thing that must not
   stutter. It reads the player's public state and its state event, both of
   which already exist, and touches nothing else.

   WHAT IT SENDS: a random id minted here, a station slug, and — when somebody
   is signed in — the access token they are already sending to every other API
   on this site. The id lives in localStorage so two tabs are one listener, with
   a cookie mirror for the profiles where localStorage throws — the same
   belt-and-braces the console's pane widths use, and for the same reason: a
   store that silently fails would make every tab a separate listener and
   inflate the number it exists to report.

   THE TOKEN IS FOR ATTRIBUTION, NOT ACCESS. The endpoint answers the same
   integers with or without it; what it changes is which side of the dial's
   split this browser lands on, and whether the station operator's view at
   /listeners can put a name against a row instead of an IP. Sending it is not
   a new disclosure — it is the same header the header bar, the console and the
   studio already send, to the same origin.

   THE IP IS NOT SENT AND COULD NOT USEFULLY BE. The server reads the
   connecting address off the request, which is the only version of it worth
   having: a browser that could state its own address could state any.

   Publishes `window.KJ_PRESENCE = {here,total,accounts,anon,station}` and fires
   `kj-presence` on window. The dial page renders it; nothing else has to know
   this file exists.

   `accounts` and `anon` are the two halves of `total` — how many of the people
   listening are signed in, and how many are not. `accounts` counts real people
   only and cannot be moved by the stress fixture; see lib/presence.js. Both are
   `null`, not zero, when the server did not send them.
   ========================================================================== */
(function () {
    'use strict';

    if (window.__kjPresence) return;          // one heartbeat per document
    window.__kjPresence = true;

    var ENDPOINT = '/api/radio/listeners';
    var KEY = 'kjubilee.presence.id';
    /* 20s against the server's 62s TTL — three beats of grace, so one dropped
       request never blinks somebody out of their own count. */
    var BEAT_MS = 20000;

    function newId() {
        try {
            if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
        } catch (e) { /* fall through */ }
        return 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    function sessionId() {
        var id = null;
        try { id = localStorage.getItem(KEY); } catch (e) { /* blocked */ }
        if (!id) {
            var m = /(?:^|;\s*)kjubilee\.presence\.id=([A-Za-z0-9_-]{8,64})/.exec(document.cookie || '');
            if (m) id = m[1];
        }
        if (!id) id = newId();
        try { localStorage.setItem(KEY, id); } catch (e) { /* blocked */ }
        try { document.cookie = KEY + '=' + id + ';path=/;max-age=31536000;samesite=lax'; } catch (e) { /* blocked */ }
        return id;
    }

    var ID = sessionId();
    var timer = null;
    var lastStation = null;

    /* THE SAME TWO KEYS EVERY OTHER READER USES. `jubileeVerseAuth` is what
       radio and music write, `jv_auth` is what the home page writes, and every
       writer writes both — app/_session-store.js is the authority on the pair.
       Read afresh on each beat rather than once at load: a listener who signs
       in mid-song should become a named row on the next heartbeat, not on
       their next page load. */
    function authToken() {
        var keys = ['jv_auth', 'jubileeVerseAuth'];
        for (var i = 0; i < keys.length; i++) {
            try {
                var raw = localStorage.getItem(keys[i]);
                if (!raw) continue;
                var parsed = JSON.parse(raw);
                if (parsed && parsed.token) return parsed.token;
            } catch (e) { /* unreadable — try the other key */ }
        }
        return null;
    }

    function current() {
        try {
            var st = window.kjPlayer && window.kjPlayer.state ? window.kjPlayer.state() : null;
            return st && st.slug ? { slug: st.slug, playing: !!st.playing } : null;
        } catch (e) { return null; }
    }

    function publish(data, station) {
        var num = function (v) { return typeof v === 'number' ? v : null; };
        window.KJ_PRESENCE = {
            here: data && typeof data.here === 'number' ? data.here : 0,
            total: data && typeof data.total === 'number' ? data.total : 0,
            /* THE SPLIT, AND IT IS ALLOWED TO BE ABSENT. Null rather than zero
               when the server did not send it, so the dial can tell "nobody is
               signed in" from "this server predates the three-number readout"
               and fall back to the old two-number one instead of printing a
               confident and wrong zero. That gap is real for the length of a
               deploy: the browser gets the new script before the API restarts. */
            accounts: data ? num(data.accounts) : null,
            anon: data ? num(data.anon) : null,
            station: station || null,
        };
        try {
            window.dispatchEvent(new CustomEvent('kj-presence', { detail: window.KJ_PRESENCE }));
        } catch (e) { /* very old browser */ }
    }

    function beat() {
        var st = current();
        var station = st ? st.slug : '';
        lastStation = station || null;
        if (typeof fetch !== 'function') return;
        var headers = { 'Content-Type': 'application/json' };
        var token = authToken();
        if (token) headers.Authorization = 'Bearer ' + token;

        fetch(ENDPOINT, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ session: ID, station: station, playing: st ? st.playing : false }),
            cache: 'no-store',
            keepalive: true,
        }).then(function (r) {
            return r.ok ? r.json() : null;
        }).then(function (j) {
            if (j) publish(j, station);
        }).catch(function () {
            /* Offline, or the endpoint is not there yet. The dial simply shows
               nothing — a listener count that guesses is worse than none. */
        });
    }

    function start() {
        if (timer) clearInterval(timer);
        beat();
        timer = setInterval(beat, BEAT_MS);
    }

    /* Re-beat the moment the station changes, so the number moves with the
       needle instead of up to twenty seconds after it. */
    window.addEventListener('kj-player-state', function () {
        var st = current();
        var slug = st ? st.slug : null;
        if (slug !== lastStation) beat();
    });

    /* A backgrounded tab is still a listener — the audio keeps playing — so the
       beat continues. What stops is a tab that is going away: say so on the way
       out and the count drops now rather than in a minute. */
    window.addEventListener('pagehide', function () {
        try {
            var body = JSON.stringify({ session: ID, leaving: true });
            if (navigator.sendBeacon) {
                navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
            }
        } catch (e) { /* nothing to be done on the way out */ }
    });

    /* The player mounts a moment after this script runs; without waiting, the
       first beat reports no station and the listener is not counted until the
       next one. */
    if (current()) start();
    else {
        var waited = 0;
        var wait = setInterval(function () {
            waited += 250;
            if (current() || waited > 8000) { clearInterval(wait); start(); }
        }, 250);
    }
})();
