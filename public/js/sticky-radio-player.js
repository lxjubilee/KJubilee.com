/*
 * sticky-radio-player.js
 *
 * Cross-page sticky radio footer for jubileeverse.com.
 *
 * When the listener pins the player on /radio, the radio page writes
 * their selection (station, play state, volume) into localStorage.
 * Any other page on the site that includes this script will:
 *
 *   1. Read the saved state.
 *   2. If pinned with a valid station, render a compact footer with the
 *      same dark + gold theme as the full radio player.
 *   3. Auto-resume audio if the browser's autoplay policy permits.
 *      Otherwise show the play icon and let the listener tap to resume.
 *   4. Stay in sync with future pin changes via the `storage` event so
 *      pinning/unpinning in one tab cascades to the others immediately.
 *
 * To enable on a page, add:
 *
 *     <script src="/js/sticky-radio-player.js" defer></script>
 *
 * The script is a no-op on /radio itself — that page has its own
 * full-featured player.
 *
 * State keys it reads:
 *   jubileeRadio.pin.enabled  -> 'true' | 'false'
 *   jubileeRadio.pin.station  -> {slug, name, hm, image, streamUrl,
 *                                musicManifestUrl, mode, host}
 *                                (streamUrl for an Icecast mount, or
 *                                 musicManifestUrl for a catalog station)
 *   jubileeRadio.pin.playing  -> 'true' | 'false'
 *   jubileeRadio.pin.volume   -> '0.0' .. '1.0'
 */

(function () {
    'use strict';

    // Hard guard — never inject on /radio (it has its own player).
    var path = (location.pathname || '').toLowerCase();
    if (path === '/radio' || path === '/radio/' || path.endsWith('/radio.html')) return;

    var KEY = {
        enabled: 'jubileeRadio.pin.enabled',
        station: 'jubileeRadio.pin.station',
        playing: 'jubileeRadio.pin.playing',
        volume:  'jubileeRadio.pin.volume',
    };

    function isPinned() {
        try { return localStorage.getItem(KEY.enabled) === 'true'; }
        catch (e) { return false; }
    }

    function loadStation() {
        try {
            var raw = localStorage.getItem(KEY.station);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function loadVolume() {
        try {
            var v = parseFloat(localStorage.getItem(KEY.volume));
            return isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v));
        } catch (e) { return 0.7; }
    }

    function loadPlaying() {
        try { return localStorage.getItem(KEY.playing) === 'true'; }
        catch (e) { return false; }
    }

    // ------------------------------------------------------------------
    // Module-scope audio state — single live <audio> reference per page
    // session. Held outside render() so teardown() (which is also
    // called by the cross-tab storage event when another tab unpins)
    // can reach it and stop playback cleanly.
    // ------------------------------------------------------------------

    var currentAudio = null;

    // Manifest-driven rotation state, mirroring radio.html. Stations with a
    // musicManifestUrl instead of a streamUrl (the language stations, whose
    // catalog is files on the CDN rather than an Icecast mount) need the
    // footer to run the same shuffle-and-advance loop, or pinning one of them
    // and navigating away would drop the listener into silence.
    var manifestQueue = [];
    var manifestIdx = 0;

    function destroyAudio() {
        if (currentAudio) {
            try { currentAudio.pause(); currentAudio.src = ''; } catch (e) {}
            currentAudio = null;
        }
        manifestQueue = [];
        manifestIdx = 0;
    }

    function shuffleInPlace(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    function flattenManifestTracks(manifest) {
        var out = [];
        var albums = (manifest && manifest.albums) || [];
        for (var a = 0; a < albums.length; a++) {
            var tracks = albums[a].tracks || [];
            for (var t = 0; t < tracks.length; t++) {
                if (tracks[t].url) out.push(tracks[t]);
            }
        }
        return out;
    }

    // Pause the sticky player without destroying the audio element, and
    // sync the visible button + live indicator to "paused". Used when
    // another in-page audio source (e.g. article.html's Read Aloud)
    // dispatches `jv-media-start` — we yield to it.
    function pauseSticky() {
        if (currentAudio && !currentAudio.paused) {
            try { currentAudio.pause(); } catch (e) {}
        }
        var btn = document.getElementById('srpPlayBtn');
        if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        var live = document.getElementById('srpLive');
        if (live) live.classList.add('inactive');
        try { localStorage.setItem(KEY.playing, 'false'); } catch (e) {}
    }

    // Cross-component audio coordination — pause sticky radio when another
    // source starts (e.g. Read Aloud on article.html). The reciprocal —
    // pausing Read Aloud when the radio starts — is handled by article
    // .html's own listener for the same event.
    window.addEventListener('jv-media-start', function (e) {
        if (!e || !e.detail || e.detail.source === 'radio') return;
        pauseSticky();
    });

    // ------------------------------------------------------------------
    // CSS — injected once, scoped under #stickyRadioPlayer to avoid
    // colliding with whatever the host page already styles.
    // ------------------------------------------------------------------

    function injectStyles() {
        if (document.getElementById('sticky-radio-player-styles')) return;
        var css = '\n#stickyRadioPlayer { position: fixed; bottom: 0; left: 0; right: 0; height: 64px; background: #181818; border-top: 1px solid rgba(255,255,255,0.08); z-index: 100000; display: flex; align-items: center; gap: 12px; padding: 8px 16px; box-shadow: 0 -2px 12px rgba(0,0,0,0.35); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #fff; }\n' +
            '#stickyRadioPlayer img.srp-art { width: 48px; height: 48px; border-radius: 6px; flex: 0 0 auto; object-fit: cover; }\n' +
            '#stickyRadioPlayer .srp-info { flex: 1 1 auto; min-width: 0; line-height: 1.3; }\n' +
            '#stickyRadioPlayer .srp-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; }\n' +
            '#stickyRadioPlayer .srp-meta { font-size: 12px; color: #c4c4c4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n' +
            '#stickyRadioPlayer .srp-meta .srp-hm { color: #E6AC00; font-weight: 600; margin-right: 6px; }\n' +
            '#stickyRadioPlayer button { background: transparent; border: 1px solid rgba(255,255,255,0.12); color: #fff; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.05s; }\n' +
            '#stickyRadioPlayer button:hover { background: rgba(230,172,0,0.08); border-color: rgba(230,172,0,0.5); color: #E6AC00; }\n' +
            '#stickyRadioPlayer button:active { transform: scale(0.95); }\n' +
            '#stickyRadioPlayer .srp-play { width: 40px; height: 40px; border-radius: 50%; background: #E6AC00; border-color: #E6AC00; color: #1b1b1b; }\n' +
            '#stickyRadioPlayer .srp-play:hover { background: #F5C518; border-color: #F5C518; color: #1b1b1b; }\n' +
            '#stickyRadioPlayer .srp-play svg { width: 18px; height: 18px; fill: currentColor; }\n' +
            '#stickyRadioPlayer .srp-skip { width: 32px; height: 32px; border-radius: 50%; }\n' +
            '#stickyRadioPlayer .srp-skip svg { width: 14px; height: 14px; fill: currentColor; }\n' +
            '#stickyRadioPlayer .srp-vol { width: 32px; height: 32px; border-radius: 6px; }\n' +
            '#stickyRadioPlayer .srp-vol svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; }\n' +
            '#stickyRadioPlayer .srp-pin { width: 32px; height: 32px; border-radius: 6px; }\n' +
            '#stickyRadioPlayer .srp-pin.pinned { background: rgba(230,172,0,0.12); border-color: #E6AC00; color: #E6AC00; }\n' +
            '#stickyRadioPlayer .srp-pin.pinned svg { fill: #E6AC00; transform: rotate(-20deg); }\n' +
            '#stickyRadioPlayer .srp-pin svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: fill 0.15s, transform 0.2s; }\n' +
            '#stickyRadioPlayer .srp-link { color: #E6AC00; text-decoration: none; font-size: 12px; font-weight: 600; padding: 4px 8px; border: 1px solid rgba(230,172,0,0.5); border-radius: 6px; }\n' +
            '#stickyRadioPlayer .srp-link:hover { background: rgba(230,172,0,0.08); }\n' +
            '#stickyRadioPlayer .srp-live { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: 1px; color: #22c55e; text-transform: uppercase; }\n' +
            '#stickyRadioPlayer .srp-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,0.25); animation: srp-pulse 1.5s ease-in-out infinite; }\n' +
            '#stickyRadioPlayer .srp-live.inactive { color: #8a8a8a; }\n' +
            '#stickyRadioPlayer .srp-live.inactive .srp-live-dot { background: #8a8a8a; box-shadow: none; animation: none; }\n' +
            '@keyframes srp-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }\n' +
            '@media (max-width: 640px) { #stickyRadioPlayer .srp-skip, #stickyRadioPlayer .srp-vol, #stickyRadioPlayer .srp-live { display: none; } #stickyRadioPlayer .srp-meta { display: none; } }\n' +
            'body.has-sticky-radio-player { padding-bottom: 64px; }\n';
        var style = document.createElement('style');
        style.id = 'sticky-radio-player-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ------------------------------------------------------------------
    // Render / teardown
    // ------------------------------------------------------------------

    function render(station, isPlayingNow) {
        if (document.getElementById('stickyRadioPlayer')) return; // already rendered
        injectStyles();
        document.body.classList.add('has-sticky-radio-player');

        var wrap = document.createElement('div');
        wrap.id = 'stickyRadioPlayer';
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', 'Radio player (pinned)');

        var artSrc = (station && station.image) || '/images/jubilee-profile.png';
        var stationName = (station && station.name) || 'Jubilee Praise';
        var hm = (station && station.hm) || '';
        var host = (station && station.host) || '';

        wrap.innerHTML =
            '<img class="srp-art" src="' + artSrc + '" alt="" onerror="this.src=\'/images/jubilee-profile.png\'">' +
            '<div class="srp-info">' +
                '<div class="srp-name">' + escapeHtml(stationName) + '</div>' +
                '<div class="srp-meta">' +
                    (hm ? '<span class="srp-hm">HM ' + escapeHtml(hm) + '</span>' : '') +
                    escapeHtml(host || 'Listening on Jubilee Radio') +
                '</div>' +
            '</div>' +
            '<span class="srp-live ' + (isPlayingNow ? '' : 'inactive') + '" id="srpLive">' +
                '<span class="srp-live-dot"></span>LIVE' +
            '</span>' +
            '<button class="srp-vol" id="srpVolBtn" type="button" title="Mute / unmute" aria-label="Mute / unmute">' +
                volumeIconSvg(loadVolume(), false) +
            '</button>' +
            '<button class="srp-play" id="srpPlayBtn" type="button" title="Play / pause" aria-label="Play / pause">' +
                (isPlayingNow ? pauseIconSvg() : playIconSvg()) +
            '</button>' +
            '<a class="srp-link" href="/radio" title="Open the full radio page">Open</a>' +
            '<button class="srp-pin pinned" id="srpPinBtn" type="button" title="Unpin player" aria-label="Unpin player" aria-pressed="true">' +
                pinIconSvg() +
            '</button>';

        document.body.appendChild(wrap);

        // Mirror radio.html's startAudioPlayback exactly:
        // - new Audio() (constructor form)
        // - NOT appended to the DOM (radio.html keeps a JS reference only)
        // - NO crossOrigin attribute (radio.html sets it but the codebase
        //   never uses Web Audio API, so it's a vestige; setting it
        //   forces stricter CORS on the load that cross-page navigation
        //   seems to trip on in some browsers).
        // currentAudio + destroyAudio live at module scope so teardown()
        // can also stop playback when another tab triggers an unpin.
        function startPlayback() {
            destroyAudio();
            if (station && station.musicManifestUrl) return startManifestPlayback();
            if (!station || !station.streamUrl) {
                console.warn('[sticky-radio-player] startPlayback: no streamUrl, station =', station);
                return Promise.reject(new Error('no streamUrl'));
            }
            console.log('[sticky-radio-player] startPlayback: creating Audio() for', station.streamUrl);
            currentAudio = new Audio();
            currentAudio.volume = loadVolume();
            currentAudio.src = station.streamUrl;
            // Tell other in-page audio sources (e.g. article.html's Read
            // Aloud) to pause. Their listener for this event reciprocates
            // by pausing themselves.
            window.dispatchEvent(new CustomEvent('jv-media-start', { detail: { source: 'radio' } }));
            return currentAudio.play();
        }

        // Advance the rotation. Reshuffles on wrap so a full pass through the
        // catalog does not replay in the same order.
        function playNextManifestTrack(audio) {
            // A stale 'ended'/'error' from an element teardown() already
            // dropped must not restart playback.
            if (audio !== currentAudio || !manifestQueue.length) return;
            if (manifestIdx >= manifestQueue.length) {
                shuffleInPlace(manifestQueue);
                manifestIdx = 0;
            }
            var track = manifestQueue[manifestIdx++];
            setNowPlaying(track);
            audio.src = track.url;
            audio.play().catch(function (err) {
                console.log('[sticky-radio-player] track failed, skipping:', track.url, err && err.message);
            });
        }

        // Surface the song in the footer's second line — for a manifest
        // station the useful label is the track, not a static host name.
        function setNowPlaying(track) {
            var el = document.querySelector('#stickyRadioPlayer .srp-meta');
            if (!el || !track) return;
            el.innerHTML = (hm ? '<span class="srp-hm">HM ' + escapeHtml(hm) + '</span>' : '') +
                escapeHtml('♪ ' + (track.title || '') + (track.artist ? ' · ' + track.artist : ''));
        }

        function startManifestPlayback() {
            return fetch(station.musicManifestUrl).then(function (res) {
                if (!res.ok) throw new Error('manifest HTTP ' + res.status);
                return res.json();
            }).then(function (manifest) {
                manifestQueue = shuffleInPlace(flattenManifestTracks(manifest));
                manifestIdx = 0;
                if (!manifestQueue.length) throw new Error('manifest has no playable tracks');

                var audio = new Audio();
                audio.volume = loadVolume();
                currentAudio = audio;
                // Skip forward on a finished track and on one that won't load.
                audio.addEventListener('ended', function () { playNextManifestTrack(audio); });
                audio.addEventListener('error', function () { playNextManifestTrack(audio); });

                if (manifestIdx >= manifestQueue.length) manifestIdx = 0;
                var first = manifestQueue[manifestIdx++];
                setNowPlaying(first);
                audio.src = first.url;
                window.dispatchEvent(new CustomEvent('jv-media-start', { detail: { source: 'radio' } }));
                return audio.play();
            });
        }

        function showPlaying() {
            setLiveActive(true);
            setPlaying(true);
            var btn = document.getElementById('srpPlayBtn');
            if (btn) btn.innerHTML = pauseIconSvg();
        }

        function showPaused() {
            setLiveActive(false);
            setPlaying(false);
            var btn = document.getElementById('srpPlayBtn');
            if (btn) btn.innerHTML = playIconSvg();
        }

        // Event wiring.
        document.getElementById('srpPlayBtn').addEventListener('click', function () {
            if (currentAudio && !currentAudio.paused) {
                // Currently playing → pause (don't destroy; user might resume)
                try { currentAudio.pause(); } catch (e) {}
                showPaused();
                return;
            }
            // A paused manifest station resumes the song it was on. (A live
            // stream can't be resumed — it has moved on — so those still
            // start fresh below.)
            if (currentAudio && currentAudio.paused && currentAudio.src && station && station.musicManifestUrl) {
                currentAudio.play().then(function () {
                    showPlaying();
                }).catch(function () {
                    destroyAudio();
                    showPaused();
                });
                return;
            }
            // Currently paused or no audio yet → start fresh.
            startPlayback().then(function () {
                showPlaying();
            }).catch(function (err) {
                console.warn('[sticky-radio-player] play rejected:', err && err.message, err);
                // Surface the failure visibly: keep the play icon, log to
                // console. The most common cause is autoplay policy on the
                // FIRST nav after pinning — but a click is a user gesture,
                // so this should now succeed. If it doesn't, the listener
                // can retry; the audio element is already torn down.
                destroyAudio();
                showPaused();
            });
        });

        document.getElementById('srpVolBtn').addEventListener('click', function () {
            if (currentAudio) {
                currentAudio.muted = !currentAudio.muted;
            }
            var btn = document.getElementById('srpVolBtn');
            if (btn) btn.innerHTML = volumeIconSvg(loadVolume(), currentAudio ? currentAudio.muted : false);
        });

        document.getElementById('srpPinBtn').addEventListener('click', function () {
            try { localStorage.setItem(KEY.enabled, 'false'); } catch (e) {}
            destroyAudio();
            teardown();
        });

        // Try to auto-resume if the listener was playing on the previous
        // page. Browser autoplay policy may block this on the first
        // navigation; the catch handler reverts to a clean paused state
        // so the next click starts fresh.
        if (isPlayingNow) {
            startPlayback().then(function () {
                showPlaying();
            }).catch(function (err) {
                console.info('[sticky-radio-player] auto-resume blocked (expected — click play to resume):',
                    err && err.message);
                destroyAudio();
                showPaused();
            });
        } else {
            showPaused();
        }
    }

    function teardown() {
        var el = document.getElementById('stickyRadioPlayer');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        destroyAudio();
        document.body.classList.remove('has-sticky-radio-player');
    }

    function setLiveActive(active) {
        var el = document.getElementById('srpLive');
        if (el) el.classList.toggle('inactive', !active);
    }

    function setPlaying(b) {
        try { localStorage.setItem(KEY.playing, String(!!b)); } catch (e) {}
    }

    // ------------------------------------------------------------------
    // SVG icons
    // ------------------------------------------------------------------

    function playIconSvg() {
        return '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    }

    function pauseIconSvg() {
        return '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    }

    function volumeIconSvg(vol, muted) {
        if (muted || vol === 0) {
            return '<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
        }
        return '<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
    }

    function pinIconSvg() {
        return '<svg viewBox="0 0 24 24"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ------------------------------------------------------------------
    // Boot + cross-tab sync
    // ------------------------------------------------------------------

    function evaluate() {
        if (isPinned()) {
            var s = loadStation();
            // Either source is playable: an Icecast mount or a catalog manifest.
            if (s && (s.streamUrl || s.musicManifestUrl)) {
                if (!document.getElementById('stickyRadioPlayer')) {
                    render(s, loadPlaying());
                }
            }
        } else {
            if (document.getElementById('stickyRadioPlayer')) teardown();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', evaluate);
    } else {
        evaluate();
    }

    // Cross-tab: if the listener pins/unpins on /radio in another tab,
    // reflect that here.
    window.addEventListener('storage', function (e) {
        if (e && e.key && (
            e.key === KEY.enabled || e.key === KEY.station || e.key === KEY.playing
        )) {
            evaluate();
        }
    });
})();
