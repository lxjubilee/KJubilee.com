/* ==========================================================================
   /analytics/start.html — the operator's console for the dial.

   Plain browser JavaScript with no build step, loaded by a static HTML file.
   It is NOT one of the page scripts under lib/use-page-script.js: those run
   inside the shared Next document and have to be unwound when the router
   leaves. This page is its own document, so a reload is the only teardown
   there is, and every listener below is allowed to live as long as it.

   TWO STATES, AND THE FIRST ONE IS NOT AN EMPTY FRAME.

   Nothing selected is the NETWORK DASHBOARD — the whole dial at a glance, which
   is what the header used to try to say in a row of tiles that wrapped on any
   laptop. Something selected is that station in three tabs: Analytics, Songs,
   Voice Scripts. The tabs are built once per station and toggled, not
   re-rendered, so switching to Songs and back keeps your scroll position and
   your search — on a 1,749-song station that IS your place in the work.

   WHERE THE DATA COMES FROM:

     /data/analytics-stations.json  the dial, the counts, the planned column and
                                    the voice-script file list. Generated — see
                                    tools/build-analytics-index.js.
     /cdn/radio/<ID>/delivery/music.json
                                    the songs and albums, fetched on click. This
                                    is the file the broadcast playlist is
                                    generated from. Copying its 8,697 track rows
                                    into the index would make this page's list a
                                    SECOND claim about what a station plays, and
                                    the day the two disagreed the page would be
                                    the convincing one and the wrong one.
     /cdn/radio/<ID>/<section>.txt  one voice script, fetched when opened.
     /api/radio/ratings             the A/B/C promotions, and whether the person
                                    reading may make one.
   ========================================================================== */
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };
    var num = function (n) { return (n == null ? 0 : n).toLocaleString(); };

    // mm:ss for a track, whole hours for a catalogue — nobody reads a rotation
    // as "403,549 seconds".
    function clock(s) {
        if (!s && s !== 0) return '';
        var m = Math.floor(s / 60), r = Math.round(s % 60);
        if (r === 60) { m++; r = 0; }
        return m + ':' + (r < 10 ? '0' : '') + r;
    }
    function hours(s) {
        if (!s) return '0';
        var h = s / 3600;
        return h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString();
    }
    function kb(b) {
        if (b == null) return '';
        return b < 1024 ? b + ' B' : (b / 1024).toFixed(1) + ' K';
    }

    // ── State ────────────────────────────────────────────────────────────
    var INDEX = null;            // analytics-stations.json
    var RATINGS = {};            // { stationId: { songId: {r,by,at} } }
    var CAN_RATE = false;        // is the reader an admin
    var CURRENT = null;          // selected station row, or null for the dashboard
    var TRACKS = [];             // flattened tracks for CURRENT
    var MANIFEST = null;         // the raw manifest for CURRENT (albums live here)
    var CACHE = {};              // stationId -> { manifest, tracks }
    var TAB = 'analytics';
    var stationFilter = 'all';
    var stationQuery = '';
    var songQuery = '';
    var rateFilter = 'all';
    var sortKey = 'i';           // manifest order
    var sortAsc = true;
    var openScript = null;       // url of the script being read

    // ── The access token, from wherever the session keeper last wrote it ──
    // Same two keys app/admin/client.js reads. The token is not the gate — the
    // route asks the database who is calling — this only decides whether to
    // draw controls that would 403 anyway.
    function authToken() {
        for (var i = 0, keys = ['jv_auth', 'jubileeVerseAuth']; i < keys.length; i++) {
            try {
                var raw = localStorage.getItem(keys[i]);
                if (!raw) continue;
                var t = (JSON.parse(raw) || {}).token;
                if (t) return t;
            } catch (e) { /* malformed entry — try the other key */ }
        }
        return null;
    }

    var toastTimer = null;
    function toast(msg, bad) {
        var el = $('an-toast');
        el.textContent = msg;
        el.classList.toggle('is-bad', Boolean(bad));
        el.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.hidden = true; }, bad ? 6000 : 3000);
    }

    function tile(n, label, cls, sub) {
        return '<div class="an-tile' + (cls ? ' ' + cls : '') + '">'
             + '<span class="an-tile-n">' + esc(n) + '</span>'
             + '<span class="an-tile-l">' + esc(label) + '</span>'
             + (sub ? '<span class="an-tile-s">' + esc(sub) + '</span>' : '')
             + '</div>';
    }

    // A label / bar / value row. The bar is the row's own background gradient,
    // so a long list does not reserve width for a track that is mostly empty.
    function barRow(label, value, pct, opts) {
        opts = opts || {};
        var cls = 'an-bar-row' + (opts.warn ? ' is-warn' : '') + (opts.key ? ' is-link' : '');
        var goto_ = opts.key ? ' data-goto="' + esc(opts.key) + '"' : '';
        var width = Math.max(0, Math.min(100, pct)).toFixed(1);
        return '<div class="' + cls + '"' + goto_ + ' style="--pct:' + width + '%">'
             + '<span class="an-bar-k">' + label + '</span>'
             + '<span class="an-bar-v">' + esc(value) + '</span></div>';
    }

    function card(title, note, body) {
        return '<section class="an-card"><h3 class="an-card-h">' + esc(title) + '</h3>'
             + (note ? '<p class="an-card-note">' + note + '</p>' : '')
             + body + '</section>';
    }

    // ── Header ───────────────────────────────────────────────────────────
    function renderTopMeta() {
        var built = INDEX.generated_at ? new Date(INDEX.generated_at) : null;
        $('an-top-meta').innerHTML =
            '<b>' + num(INDEX.stations.length) + '</b> frequencies · index built '
            + (built ? esc(built.toLocaleString()) : 'unknown') + ' · '
            + (CAN_RATE
                ? '<span class="an-admin">administrator — ratings editable</span>'
                : 'read-only');
    }

    // ── Dashboard ────────────────────────────────────────────────────────
    function groupBy(rows, keyFn) {
        var m = new Map();
        rows.forEach(function (s) {
            var k = keyFn(s) || '—';
            if (!m.has(k)) m.set(k, { key: k, stations: 0, songs: 0 });
            var e = m.get(k);
            e.stations++;
            e.songs += s.songs || 0;
        });
        return [...m.values()];
    }

    function networkRatings() {
        var c = { A: 0, B: 0, C: 0, stations: 0 };
        INDEX.stations.forEach(function (s) {
            var promos = s.id && RATINGS[s.id];
            if (!promos) { c.C += s.songs || 0; return; }
            var a = 0, b = 0;
            for (var k in promos) {
                if (!Object.prototype.hasOwnProperty.call(promos, k)) continue;
                if (promos[k].r === 'A') a++; else if (promos[k].r === 'B') b++;
            }
            if (a || b) c.stations++;
            c.A += a; c.B += b;
            c.C += Math.max(0, (s.songs || 0) - a - b);
        });
        return c;
    }

    function renderDashboard() {
        var n = INDEX.network;
        var onAir = INDEX.stations.filter(function (s) { return s.onAir; });
        var html = [];

        html.push('<h2 class="an-dash-head">The dial, all of it</h2>');
        html.push('<p class="an-dash-sub">Every frequency on the network, what it plays and what it '
            + 'still owes. Pick a station on the left for its own analytics, its full song list and '
            + 'its voice scripts.</p>');

        html.push('<div class="an-tiles an-tiles-lead">'
            + tile(num(n.stations_on_air), 'On air', 'is-ok', 'of ' + num(n.stations_total) + ' frequencies')
            + tile(num(n.stations_planned), 'Planned', 'is-warn', 'no catalogue yet')
            + tile(num(n.songs_distinct), 'Songs on air', '', 'distinct recordings')
            // NOT the same number as the one on its left, and the label has to
            // carry that on its own: one song is deliberately on several
            // stations, so the slots exceed the songs that exist. A reader who
            // expects these to match will go hunting a bug that is the design.
            + tile(num(n.songs_scheduled), 'Slots on dial', '', 'one song, several stations')
            + tile(hours(n.duration_s) + ' h', 'Runtime', '', 'across every station')
            + tile(num(n.albums_planned), 'Albums awaiting', n.albums_planned ? 'is-warn' : '', 'written, not recorded')
            + tile(num(n.voice_scripts), 'Voice scripts', '',
                   (n.stations_with_scripts || 0) + ' of ' + num(n.stations_on_air) + ' stations written')
            + '</div>');

        html.push('<div class="an-cards">');

        // ── Biggest catalogues ──
        var top = onAir.slice().sort(function (a, b) { return b.songs - a.songs; }).slice(0, 12);
        var max = top.length ? top[0].songs : 1;
        html.push(card('Biggest catalogues', 'Songs in rotation, straight from each delivery manifest.',
            '<div class="an-bars">' + top.map(function (s) {
                return barRow('<b>' + esc(s.name) + '</b> <span style="opacity:.55">' + esc(s.freq) + '</span>',
                    num(s.songs), (s.songs / max) * 100, { key: s.id || s.slug });
            }).join('') + '</div>'));

        // ── By band ──
        var bands = groupBy(onAir, function (s) { return s.pill || s.band; })
            .sort(function (a, b) { return b.songs - a.songs; });
        var bandMax = bands.length ? bands[0].songs : 1;
        html.push(card('By band', 'The five-fold blocks — stations on air, and what they carry.',
            '<div class="an-bars">' + bands.map(function (g) {
                return barRow('<b>' + esc(g.key) + '</b> <span style="opacity:.55">'
                    + g.stations + ' station' + (g.stations === 1 ? '' : 's') + '</span>',
                    num(g.songs), (g.songs / bandMax) * 100);
            }).join('') + '</div>'));

        // ── By language ──
        var langs = groupBy(onAir, function (s) { return s.lang; })
            .sort(function (a, b) { return b.songs - a.songs; }).slice(0, 12);
        var langMax = langs.length ? langs[0].songs : 1;
        html.push(card('By language', 'Every station is single-language by design — a listener who '
            + 'hears another tongue land mid-set leaves.',
            '<div class="an-bars">' + langs.map(function (g) {
                return barRow('<b>' + esc(g.key) + '</b> <span style="opacity:.55">'
                    + g.stations + '</span>', num(g.songs), (g.songs / langMax) * 100);
            }).join('') + '</div>'));

        // ── Ratings ──
        var r = networkRatings();
        var rTotal = r.A + r.B + r.C || 1;
        html.push(card('Rotation ratings', 'Every song is C until a human promotes it on that station. '
            + 'A rating is per station, not per song.',
            '<div class="an-bars">'
            + barRow('<b>A</b> — the anchors', num(r.A), (r.A / rTotal) * 100)
            + barRow('<b>B</b> — the regulars', num(r.B), (r.B / rTotal) * 100)
            + barRow('<b>C</b> — unrated', num(r.C), (r.C / rTotal) * 100)
            + '</div>'
            + '<div class="an-flags" style="margin-top:9px"><div class="an-flag">'
            + '<span class="an-flag-n' + (r.stations ? ' is-ok' : '') + '">' + r.stations + '</span>'
            + '<span class="an-flag-t">station' + (r.stations === 1 ? '' : 's')
            + ' with at least one promotion</span></div></div>'));

        // ── Needs attention ──
        // Every line here is a thing somebody has to DO, phrased as the thing
        // rather than as a metric. A dashboard that only counts is a dashboard
        // nobody opens twice.
        var noScripts = onAir.filter(function (s) { return !(s.scripts && s.scripts.total); }).length;
        // A station that HAS a tenant id and no manifest is genuinely half-built:
        // created, then never programmed. "Planned with no tenant" was the first
        // version of this line and it counted all 75, which is the Planned tile
        // again in a sentence — a flag that fires on every normal row is noise.
        var halfBuilt = INDEX.stations.filter(function (s) { return !s.onAir && s.id; }).length;
        var flags = [];
        if (n.songs_unaired) {
            flags.push(['warn', n.songs_unaired, 'ingested song(s) are on <b>no station at all</b> — '
                + 'a selection rule did not fire. A rule to look at, not a file to re-copy.']);
        }
        if (noScripts) {
            flags.push(['warn', noScripts, 'on-air station(s) have <b>no voice scripts</b> — nothing is '
                + 'said between the songs.']);
        }
        if (n.albums_planned) {
            flags.push(['warn', n.albums_planned, 'album(s) are <b>written and awaiting audio</b>. Each '
                + 'joins its station the day its audio is ingested.']);
        }
        if (halfBuilt) {
            flags.push(['warn', halfBuilt, 'station(s) have a <b>tenant id but no catalogue</b> — created, '
                + 'never programmed. Visible on the dial and permanently silent.']);
        }
        if (!flags.length) flags.push(['ok', '✓', 'Nothing is waiting. Every ingested song is on a station '
            + 'and every named album has its audio.']);
        html.push(card('Needs attention', '',
            '<div class="an-flags">' + flags.map(function (f) {
                return '<div class="an-flag"><span class="an-flag-n' + (f[0] === 'ok' ? ' is-ok' : '') + '">'
                     + esc(String(f[1])) + '</span><span class="an-flag-t">' + f[2] + '</span></div>';
            }).join('') + '</div>'));

        html.push('</div>');
        $('an-dash').innerHTML = html.join('');
    }

    // ── Left panel ───────────────────────────────────────────────────────
    function visibleStations() {
        var q = stationQuery.trim().toLowerCase();
        return INDEX.stations.filter(function (s) {
            if (stationFilter === 'onair' && !s.onAir) return false;
            if (stationFilter === 'planned' && s.onAir) return false;
            if (!q) return true;
            return (s.freq + ' ' + s.name + ' ' + (s.format || '') + ' '
                  + (s.lang || '') + ' ' + (s.id || '')).toLowerCase().indexOf(q) >= 0;
        });
    }

    function renderStations() {
        var list = visibleStations();

        // On air first, then planned — the operator's day is spent in the top
        // group, and sorting the whole dial by frequency would bury the
        // forty-one live stations among seventy-five that play nothing yet.
        var air = list.filter(function (s) { return s.onAir; });
        var plan = list.filter(function (s) { return !s.onAir; });
        var html = [];

        function group(label, rows) {
            if (!rows.length) return;
            html.push('<li class="an-group">' + esc(label) + ' · ' + rows.length + '</li>');
            rows.forEach(function (s) {
                var key = s.id || s.slug;
                html.push(
                    '<li class="an-st ' + (s.onAir ? 'is-air' : 'is-planned')
                        + (CURRENT && (CURRENT.id || CURRENT.slug) === key ? ' is-on' : '')
                        + '" data-key="' + esc(key) + '" tabindex="0">'
                    + '<span class="an-st-hm">' + esc(s.freq) + '</span>'
                    + (s.onAir
                        ? '<span class="an-st-count">' + num(s.songs) + '</span>'
                        : (s.planned_albums
                            ? '<span class="an-st-plan">' + s.planned_albums + ' alb</span>'
                            : '<span class="an-st-count">—</span>'))
                    + '<span class="an-st-name">' + esc(s.name) + '</span>'
                    + '<span class="an-st-tag">' + (s.onAir ? 'On air' : 'Planned') + '</span>'
                    + '</li>');
            });
        }
        group('On air', air);
        group('Planned', plan);

        $('an-stations').innerHTML = html.join('')
            || '<li class="an-group">Nothing matches that filter</li>';
        $('an-panel-foot').textContent =
            list.length + ' of ' + INDEX.stations.length + ' shown';
        $('an-clear').hidden = !CURRENT;
    }

    // ── Ratings ──────────────────────────────────────────────────────────
    function ratingOf(songId) {
        var st = CURRENT && RATINGS[CURRENT.id];
        var e = st && st[songId];
        // Everything is C unless a human promoted it. C is the absence of a
        // record, not a record — see the store's own note.
        return (e && e.r) || 'C';
    }

    function ratingCounts() {
        var c = { A: 0, B: 0, C: 0 };
        for (var i = 0; i < TRACKS.length; i++) c[ratingOf(TRACKS[i].track_id)]++;
        return c;
    }

    // ── The station bar ──────────────────────────────────────────────────
    function renderBar() {
        var s = CURRENT;
        var sub = [s.format, s.lang, s.pill ? s.pill + ' band' : null, s.hostCity]
            .filter(Boolean).map(esc).join(' · ');
        $('an-bar-id').innerHTML =
            '<span class="an-bar-hm">' + esc(s.freq) + '</span>'
            + '<span class="an-bar-name">' + esc(s.name) + '</span>'
            + '<span class="an-bar-badge' + (s.onAir ? '' : ' is-planned') + '">'
            + (s.onAir ? 'On air' : 'Planned') + '</span>'
            + '<span class="an-bar-sub">' + sub + '</span>';

        var tabs = $('an-tabs').children;
        tabs[1].innerHTML = 'Songs<span class="an-tab-n">' + num(TRACKS.length) + '</span>';
        tabs[2].innerHTML = 'Voice Scripts<span class="an-tab-n">'
            + num((s.scripts && s.scripts.total) || 0) + '</span>';
    }

    // ── Tab 1: analytics ─────────────────────────────────────────────────
    function fact(k, v) {
        return '<div class="an-fact"><span class="an-fact-k">' + esc(k) + '</span>'
             + '<span class="an-fact-v">' + (v == null || v === '' ? '—' : v) + '</span></div>';
    }

    function renderAnalytics() {
        var s = CURRENT;
        var host = $('an-pane-analytics');

        if (!s.onAir) {
            host.innerHTML = '<div class="an-note">'
                + '<p class="an-note-hd">This frequency plays nothing yet.</p>'
                + '<p>It is on the dial and has no <b>delivery/music.json</b> — which is the only thing '
                + 'that puts a station on air. Nobody sets an on-air flag by hand; it is derived from '
                + 'the presence of that file.</p>'
                + (s.planned_albums
                    ? '<p>Its selection already names <b>' + s.planned_albums + '</b> album(s) that are '
                      + 'written and awaiting audio. Each joins the moment its audio is ingested:</p>'
                      + '<p><code>' + (s.planned_album_ids || []).map(esc).join('</code> <code>') + '</code></p>'
                    : '<p>Nothing is named as pending for it either, so it is a frequency and a name and '
                      + 'not much else so far.</p>')
                + '</div>';
            return;
        }

        var c = ratingCounts();
        var albums = (MANIFEST && MANIFEST.albums) || [];

        // Artists, by how much of the rotation each one actually is. The
        // manifest reports an artist COUNT; which four, and in what proportion,
        // is the thing that tells you whether a station is one voice with three
        // guests or a genuine ensemble.
        var byArtist = new Map();
        TRACKS.forEach(function (t) {
            var k = t.artist || '—';
            byArtist.set(k, (byArtist.get(k) || 0) + 1);
        });
        var artists = [...byArtist.entries()].sort(function (a, b) { return b[1] - a[1]; });
        var artMax = artists.length ? artists[0][1] : 1;

        var topAlbums = albums.slice().sort(function (a, b) {
            return (b.track_count || 0) - (a.track_count || 0);
        }).slice(0, 12);
        var albMax = topAlbums.length ? (topAlbums[0].track_count || 1) : 1;

        var built = s.built_at ? new Date(s.built_at) : null;
        var html = [];

        html.push('<div class="an-tiles">'
            + tile(num(TRACKS.length), 'Songs on air', 'is-ok')
            + tile(num(s.albums), 'Albums')
            + tile(num(s.artists), 'Artists')
            + tile(hours(s.duration_s) + ' h', 'Runtime')
            + tile(num(c.A), 'A rated', 'is-a')
            + tile(num(c.B), 'B rated', 'is-b')
            + tile(num(c.C), 'C rated', 'is-c')
            // Albums, not songs, and the label says so. A record with no audio
            // has no track count anywhere in the repository, and inventing one
            // would put a number here that nothing could be checked against.
            + tile(num(s.planned_albums), 'Albums awaiting', s.planned_albums ? 'is-warn' : '')
            + tile(num((s.scripts && s.scripts.total) || 0), 'Voice scripts',
                   (s.scripts && s.scripts.total) ? '' : 'is-warn')
            + '</div>');

        if (s.selection) {
            html.push('<p class="an-rule" style="margin-top:13px"><b>Selects</b>' + esc(s.selection) + '</p>');
        }

        html.push('<div class="an-cards">');

        html.push(card('Who is actually on this station',
            'Share of the rotation by voice — not the artist count, which cannot show proportion.',
            '<div class="an-bars">' + artists.map(function (a) {
                return barRow('<b>' + esc(a[0]) + '</b>',
                    num(a[1]) + '  ' + Math.round((a[1] / TRACKS.length) * 100) + '%',
                    (a[1] / artMax) * 100);
            }).join('') + '</div>'));

        html.push(card('Biggest records', 'Albums by tracks in rotation.',
            '<div class="an-bars">' + topAlbums.map(function (a) {
                return barRow('<b>' + esc(a.title) + '</b> <span style="opacity:.55">'
                    + esc(a.artist || '') + '</span>', num(a.track_count || 0),
                    ((a.track_count || 0) / albMax) * 100);
            }).join('')
            + (albums.length > topAlbums.length
                ? '<p class="an-card-note" style="margin:8px 0 0">and ' + (albums.length - topAlbums.length)
                  + ' more — the full list is on the Songs tab.</p>'
                : '')
            + '</div>'));

        html.push(card('The record', '',
            '<div class="an-facts">'
            + fact('Tenant id', s.id ? '<code>' + esc(s.id) + '</code>' : null)
            + fact('Frequency', esc(s.freq))
            + fact('Slug', s.slug ? '<code>' + esc(s.slug) + '</code>' : null)
            + fact('Mount', s.mount ? '<code>' + esc(s.mount) + '</code>' : null)
            + fact('Pool', s.pool ? '<code>' + esc(s.pool) + '</code>' : null)
            + fact('Language', esc(s.lang || ''))
            + fact('Band', esc(s.pill || s.band || ''))
            + fact('Format', esc(s.format || ''))
            + fact('Mode', esc(s.mode || ''))
            + fact('Phase', s.phase == null ? null : esc(String(s.phase)))
            + fact('Broadcasts from', esc(s.hostCity || ''))
            + fact('Manifest built', built ? esc(built.toLocaleString()) : null)
            + fact('Manifest', s.manifest
                ? '<a href="' + esc(s.manifest) + '" target="_blank" rel="noopener">delivery/music.json ↗</a>'
                : null)
            + fact('Tune in', s.hm
                ? '<a href="/hm' + esc(s.hm) + '" target="_blank" rel="noopener">kjubilee.com/hm'
                  + esc(s.hm) + ' ↗</a>'
                : null)
            + '</div>'));

        if (s.planned_albums) {
            html.push(card('Written, not yet recorded',
                'Named as pending on this station. Each joins the day its audio is ingested — no edit needed.',
                '<p class="an-sc-path" style="margin:0">'
                + (s.planned_album_ids || []).map(esc).join(' · ') + '</p>'));
        }

        html.push('</div>');
        host.innerHTML = html.join('');
    }

    // ── Tab 2: songs ─────────────────────────────────────────────────────
    function renderSongsShell() {
        // A station with no catalogue gets a sentence, not an empty table with
        // headers over nothing — the headers imply the query returned zero rows,
        // when in fact there is no query to run.
        if (!CURRENT.onAir) {
            $('an-pane-songs').innerHTML = '<div class="an-note">'
                + '<p class="an-note-hd">No songs — this station is not on air.</p>'
                + '<p>See the Analytics tab for what it is still waiting on.</p></div>';
            return;
        }

        function chip(v, label, cls) {
            return '<button class="an-chip' + (rateFilter === v ? ' is-on' : '')
                 + (cls ? ' ' + cls : '') + '" data-rate="' + v + '">' + label + '</button>';
        }
        function th(key, label, cls) {
            var on = sortKey === key ? ' is-sort' + (sortAsc ? ' is-asc' : '') : '';
            return '<th data-sort="' + key + '" class="' + (cls || '') + on + '">' + label + '</th>';
        }
        $('an-pane-songs').innerHTML =
            '<div class="an-tools">'
                + '<input class="an-search" id="an-song-search" type="search" '
                    + 'placeholder="Filter songs, albums, artists…" autocomplete="off" spellcheck="false" '
                    + 'value="' + esc(songQuery) + '">'
                + '<div class="an-chips" id="an-rate-filters">'
                    + chip('all', 'All') + chip('A', 'A', 'is-a') + chip('B', 'B', 'is-b') + chip('C', 'C')
                + '</div>'
                + '<span class="an-tools-count" id="an-song-count"></span>'
            + '</div>'
            + '<div class="an-songs-scroll"><table class="an-songs"><thead><tr>'
                + th('i', '#', 'an-num')
                + th('title', 'Song')
                + th('album', 'Album')
                + th('artist', 'Artist')
                + th('duration_s', 'Time', 'an-t-time')
                + th('track_id', 'SongID', 'an-t-id')
                + th('rating', 'Rate', 'an-t-rate')
            + '</tr></thead><tbody id="an-song-rows"></tbody></table></div>';
        renderSongRows();
    }

    function visibleTracks() {
        var q = songQuery.trim().toLowerCase();
        var rows = TRACKS.filter(function (t) {
            if (rateFilter !== 'all' && ratingOf(t.track_id) !== rateFilter) return false;
            if (!q) return true;
            return (t.title + ' ' + t.album + ' ' + t.artist + ' ' + t.track_id)
                .toLowerCase().indexOf(q) >= 0;
        });

        if (sortKey !== 'i') {
            var dir = sortAsc ? 1 : -1;
            rows = rows.slice().sort(function (a, b) {
                var x, y;
                if (sortKey === 'rating') { x = ratingOf(a.track_id); y = ratingOf(b.track_id); }
                else if (sortKey === 'duration_s') { x = a.duration_s || 0; y = b.duration_s || 0; }
                else { x = a[sortKey] || ''; y = b[sortKey] || ''; }
                if (typeof x === 'string') return x.localeCompare(y) * dir;
                return (x - y) * dir;
            });
        } else if (!sortAsc) {
            rows = rows.slice().reverse();
        }
        return rows;
    }

    // The whole list in one write. A station with 1,749 songs is 1,749 rows,
    // which one innerHTML assignment does in a few milliseconds and a per-row
    // createElement loop does not — and the operator wants Ctrl-F over the whole
    // rotation, which is exactly what any windowing scheme would take away.
    function renderSongRows() {
        var rows = visibleTracks();
        var html = new Array(rows.length);
        for (var i = 0; i < rows.length; i++) {
            var t = rows[i], r = ratingOf(t.track_id);
            html[i] = '<tr data-song="' + esc(t.track_id) + '">'
                + '<td class="an-num">' + (i + 1) + '</td>'
                + '<td class="an-t-title">' + esc(t.title) + '</td>'
                + '<td class="an-t-album">' + esc(t.album) + '</td>'
                + '<td class="an-t-artist">' + esc(t.artist) + '</td>'
                + '<td class="an-t-time">' + clock(t.duration_s) + '</td>'
                + '<td class="an-t-id">' + esc(t.track_id) + '</td>'
                + '<td class="an-t-rate"><button class="an-rate" data-r="' + r + '"'
                    + (CAN_RATE ? '' : ' disabled')
                    + ' title="' + (CAN_RATE ? 'Promote or demote this song on this station'
                                             : 'Sign in as an administrator to change this') + '">'
                    + r + '</button></td>'
                + '</tr>';
        }
        $('an-song-rows').innerHTML = html.join('');
        $('an-song-count').textContent = rows.length === TRACKS.length
            ? num(TRACKS.length) + ' songs'
            : num(rows.length) + ' of ' + num(TRACKS.length) + ' songs';
    }

    // ── Tab 3: voice scripts ─────────────────────────────────────────────
    // The other half of a station. music.json says what PLAYS; these say what is
    // SAID — legal and persona IDs, the six break categories, the scripture
    // treatments, the donation copy. Nothing else in the toolchain reports on
    // them, which is why a station can be perfectly programmed and completely
    // silent between the songs without anything saying so.
    function renderScripts() {
        var s = CURRENT;
        var host = $('an-pane-scripts');
        var sc = s.scripts || { total: 0, groups: [] };

        if (!sc.total) {
            host.innerHTML = '<div class="an-note">'
                + '<p class="an-note-hd">Nothing is said on this station.</p>'
                + '<p>No voice scripts exist for <b>' + esc(s.name) + '</b>: no legal ID, no persona ID, '
                + 'no breaks, no scripture treatments, no donation copy. The music plays and the station '
                + 'never speaks.</p>'
                + '<p>Scripts live beside the delivery tree at '
                + '<code>' + esc(s.id ? '/cdn/radio/' + s.id + '/' : '<station>/') + '</code> — '
                + '<code>branded/</code>, <code>breaks/</code>, <code>scripture/</code>, '
                + '<code>donation/</code>, <code>delight/</code>. They are indexed by '
                + '<b>tools/build-analytics-index.js</b>, so writing them is all it takes for them to '
                + 'appear here.</p>'
                + '</div>';
            return;
        }

        var list = sc.groups.map(function (g) {
            return '<div class="an-sc-group">' + esc(g.label) + '<span>' + g.files.length + '</span></div>'
                 + g.files.map(function (f) {
                     return '<div class="an-sc-file' + (f.readme ? ' is-readme' : '')
                          + (openScript === f.url ? ' is-on' : '') + '" data-script="' + esc(f.url)
                          + '" data-name="' + esc(f.name) + '" data-label="' + esc(g.label) + '"'
                          + (f.readme ? ' data-readme="1"' : '') + ' tabindex="0">'
                          + '<span class="an-sc-name">' + esc(f.name) + '</span>'
                          + '<span class="an-sc-size">' + esc(kb(f.bytes)) + '</span></div>';
                 }).join('');
        }).join('');

        host.innerHTML = '<div class="an-scripts">'
            + '<div class="an-scripts-list" id="an-sc-list">' + list + '</div>'
            + '<div class="an-scripts-body" id="an-sc-body">'
                + '<div class="an-note"><p class="an-note-hd">' + num(sc.total) + ' scripts, '
                + sc.groups.length + ' categories.</p>'
                + '<p>Choose one on the left to read it. These are read aloud, so they are shown at '
                + 'reading-aloud size rather than packed like a table.</p></div>'
            + '</div></div>';
    }

    // Air copy is prose and is read ALOUD, so it gets a proportional face at
    // reading-aloud size. But this folder also holds documents that are TABLES —
    // LAUNCH-GATE.txt aligns four columns with runs of spaces, and rendering
    // that proportionally turns a pass/fail grid into a wall of words.
    //
    // Decided by the SHAPE of the text rather than by the filename: the gate
    // file is not called README, and the next aligned document somebody writes
    // will not be either. Three or more spaces mid-line is column padding —
    // prose does not do that, and a script that happens to double-space after a
    // full stop does not reach three.
    function fixedWidth(text, isReadme) {
        return isReadme || / {3,}\S/.test(text);
    }

    function openScriptFile(url, name, label, isReadme) {
        openScript = url;
        var list = $('an-sc-list');
        if (list) {
            Array.prototype.forEach.call(list.querySelectorAll('.an-sc-file'), function (el) {
                el.classList.toggle('is-on', el.getAttribute('data-script') === url);
            });
        }
        var body = $('an-sc-body');
        body.innerHTML = '<p class="an-sc-head">' + esc(name) + '</p>'
            + '<p class="an-sc-path">' + esc(url) + '</p>'
            + '<p class="an-sc-text">Loading…</p>';

        fetch(url, { cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
                return r.text();
            })
            .then(function (text) {
                if (openScript !== url) return;         // a faster click won
                body.innerHTML = '<p class="an-sc-head">' + esc(name) + '</p>'
                    + '<p class="an-sc-path">' + esc(label) + ' · ' + esc(url) + '</p>'
                    + '<pre class="an-sc-text' + (fixedWidth(text, isReadme) ? ' is-readme' : '') + '">'
                    + esc(text) + '</pre>';
            })
            .catch(function (err) {
                if (openScript !== url) return;
                body.innerHTML = '<div class="an-note">'
                    + '<p class="an-note-hd">Could not read that script.</p>'
                    + '<p><code>' + esc(url) + '</code> — ' + esc(err.message) + '.</p>'
                    + '<p>The index lists it, so either the file has not been published to this '
                    + 'environment’s CDN tree or the tree moved. The scripts are indexed from the '
                    + 'workstation’s <code>CDN_LOCAL_ROOT</code>; production serves its own copy.</p>'
                    + '</div>';
            });
    }

    // ── Tabs ─────────────────────────────────────────────────────────────
    function showTab(name) {
        TAB = name;
        Array.prototype.forEach.call($('an-tabs').children, function (b) {
            b.classList.toggle('is-on', b.getAttribute('data-tab') === name);
            b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false');
        });
        $('an-pane-analytics').hidden = name !== 'analytics';
        $('an-pane-songs').hidden = name !== 'songs';
        $('an-pane-scripts').hidden = name !== 'scripts';
        syncHash();
    }

    // ── Selecting ────────────────────────────────────────────────────────
    function syncHash() {
        // The frequency is the address of a station everywhere else on this
        // site, so it is the address here too. #308.70/songs is a link an
        // operator can paste into a message and land exactly where they were.
        var h = CURRENT ? '#' + CURRENT.hm + (TAB === 'analytics' ? '' : '/' + TAB) : '#';
        if (location.hash !== h) history.replaceState(null, '', h);
    }

    function showDashboard() {
        CURRENT = null;
        TRACKS = [];
        MANIFEST = null;
        $('an-station').hidden = true;
        $('an-dash').hidden = false;
        renderDashboard();
        renderStations();
        syncHash();
    }

    function flatten(manifest) {
        var out = [];
        (manifest.albums || []).forEach(function (a) {
            (a.tracks || []).forEach(function (t) {
                out.push({
                    track_id: t.track_id,
                    title: t.title || '',
                    album: t.album || a.title || '',
                    artist: t.artist || a.artist || '',
                    duration_s: t.duration_s || 0,
                });
            });
        });
        return out;
    }

    function buildPanes() {
        renderBar();
        renderAnalytics();
        renderSongsShell();
        renderScripts();
        showTab(TAB);
    }

    function selectStation(key, tab) {
        var s = null;
        for (var i = 0; i < INDEX.stations.length; i++) {
            if ((INDEX.stations[i].id || INDEX.stations[i].slug) === key) { s = INDEX.stations[i]; break; }
        }
        if (!s) return;

        // A fresh station is a fresh view of it: last station's search text
        // filtering this one's songs is a list that looks wrong for no visible
        // reason. The TAB is deliberately kept — an operator working through
        // the dial on the Songs tab wants the next station on the Songs tab.
        CURRENT = s;
        songQuery = '';
        rateFilter = 'all';
        sortKey = 'i';
        sortAsc = true;
        openScript = null;
        if (tab) TAB = tab;
        if (!s.onAir && TAB === 'songs') TAB = 'analytics';

        $('an-dash').hidden = true;
        $('an-station').hidden = false;
        renderStations();

        if (!s.onAir) { TRACKS = []; MANIFEST = null; buildPanes(); return; }
        if (CACHE[s.id]) { MANIFEST = CACHE[s.id].manifest; TRACKS = CACHE[s.id].tracks; buildPanes(); return; }

        renderBar();
        $('an-pane-analytics').innerHTML = '<div class="an-note">Loading ' + esc(s.name) + '…</div>';
        $('an-pane-songs').innerHTML = '';
        $('an-pane-scripts').innerHTML = '';
        showTab(TAB);

        fetch(s.manifest, { cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
                return r.json();
            })
            .then(function (m) {
                if (CURRENT !== s) return;              // a faster click won
                CACHE[s.id] = { manifest: m, tracks: flatten(m) };
                MANIFEST = m;
                TRACKS = CACHE[s.id].tracks;
                buildPanes();
            })
            .catch(function (err) {
                if (CURRENT !== s) return;
                $('an-pane-analytics').innerHTML = '<div class="an-note">'
                    + '<p class="an-note-hd">Could not read this station’s manifest.</p>'
                    + '<p><code>' + esc(s.manifest) + '</code> — ' + esc(err.message) + '.</p>'
                    + '<p>The index says this station is on air, so either the delivery tree moved or '
                    + 'the CDN is not reachable from here.</p></div>';
            });
    }

    // ── Promoting a song ─────────────────────────────────────────────────
    var menu = null;
    function closeMenu() { if (menu) { menu.remove(); menu = null; } }

    function openMenu(chip, songId) {
        closeMenu();
        var box = document.createElement('div');
        box.className = 'an-menu';
        box.innerHTML = ['A', 'B', 'C'].map(function (r) {
            return '<button data-r="' + r + '">' + r + '</button>';
        }).join('');
        document.body.appendChild(box);

        var rect = chip.getBoundingClientRect();
        var w = box.offsetWidth, h = box.offsetHeight;
        box.style.left = Math.max(6, Math.min(rect.right - w, window.innerWidth - w - 6)) + 'px';
        // Above the chip when there is no room below, so the last row of a
        // 1,749-song table is still ratable.
        box.style.top = (rect.bottom + h + 8 > window.innerHeight ? rect.top - h - 4 : rect.bottom + 4) + 'px';

        box.addEventListener('click', function (e) {
            var b = e.target.closest('button[data-r]');
            if (!b) return;
            closeMenu();
            setRating(songId, b.getAttribute('data-r'), chip);
        });
        menu = box;
    }

    function setRating(songId, rating, chip) {
        var token = authToken();
        if (!token) { toast('Sign in as an administrator to promote a song.', true); return; }

        var station = CURRENT.id;
        var before = ratingOf(songId);
        if (before === rating) return;

        // Optimistic, and reverted on failure. The alternative is a table that
        // does nothing for the length of a round trip on every click, and an
        // operator rating a rack of songs makes a lot of clicks.
        applyLocal(station, songId, rating);
        if (chip) { chip.setAttribute('data-r', rating); chip.textContent = rating; }
        refreshCounts();

        fetch('/api/radio/ratings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ station: station, ratings: (function () { var o = {}; o[songId] = rating; return o; })() }),
        })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
            .then(function (res) {
                if (res.ok) { toast(songId + ' → ' + rating); return; }
                applyLocal(station, songId, before);
                if (chip) { chip.setAttribute('data-r', before); chip.textContent = before; }
                refreshCounts();
                toast(res.status === 403
                    ? 'Not saved — this account is not an administrator.'
                    : 'Not saved — ' + ((res.body && res.body.error) || res.status), true);
            })
            .catch(function (err) {
                applyLocal(station, songId, before);
                if (chip) { chip.setAttribute('data-r', before); chip.textContent = before; }
                refreshCounts();
                toast('Not saved — ' + err.message, true);
            });
    }

    // Mirrors the store's own rule: C is the absence of an entry, so demoting to
    // C deletes rather than writes. Keeping them the same shape here is what
    // makes the optimistic count and the saved count agree.
    function applyLocal(station, songId, rating) {
        if (!RATINGS[station]) RATINGS[station] = {};
        if (rating === 'C') delete RATINGS[station][songId];
        else RATINGS[station][songId] = { r: rating };
    }

    // Only the three rating tiles change when a song is promoted, and they are
    // on the OTHER tab — so this touches them where they sit and leaves the song
    // table alone. Re-rendering the table would lose the scroll position, which
    // on a station this long is most of the operator's place in the work.
    function refreshCounts() {
        if (!CURRENT || !CURRENT.onAir) return;
        var c = ratingCounts();
        var map = { 'A rated': c.A, 'B rated': c.B, 'C rated': c.C };
        var tiles = $('an-pane-analytics').querySelectorAll('.an-tiles .an-tile');
        for (var i = 0; i < tiles.length; i++) {
            var label = tiles[i].querySelector('.an-tile-l').textContent;
            if (map[label] !== undefined) tiles[i].querySelector('.an-tile-n').textContent = num(map[label]);
        }
    }

    // ── Resizable panel ──────────────────────────────────────────────────
    var MIN_W = 220, MAX_W = 620;
    function setPanelWidth(px) {
        var w = Math.max(MIN_W, Math.min(MAX_W, Math.round(px)));
        document.documentElement.style.setProperty('--panel-w', w + 'px');
        try { localStorage.setItem('kj.analytics.panelWidth', String(w)); } catch (e) { /* private mode */ }
    }

    function initResize() {
        var stored = null;
        try { stored = localStorage.getItem('kj.analytics.panelWidth'); } catch (e) { /* private mode */ }
        if (stored) setPanelWidth(parseInt(stored, 10) || 320);

        var grip = $('an-grip');
        grip.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            grip.setPointerCapture(e.pointerId);
            grip.classList.add('is-drag');
            document.body.classList.add('is-resizing');
        });
        grip.addEventListener('pointermove', function (e) {
            if (!grip.classList.contains('is-drag')) return;
            setPanelWidth(e.clientX - $('an-split').getBoundingClientRect().left);
        });
        function stop(e) {
            if (!grip.classList.contains('is-drag')) return;
            try { grip.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
            grip.classList.remove('is-drag');
            document.body.classList.remove('is-resizing');
        }
        grip.addEventListener('pointerup', stop);
        grip.addEventListener('pointercancel', stop);
        // A separator that can only be dragged is a separator a keyboard cannot
        // reach — and this is the one control on the page that changes how much
        // of a song title you can read.
        grip.addEventListener('keydown', function (e) {
            var step = e.shiftKey ? 40 : 12;
            if (e.key === 'ArrowLeft') { setPanelWidth($('an-panel').offsetWidth - step); e.preventDefault(); }
            if (e.key === 'ArrowRight') { setPanelWidth($('an-panel').offsetWidth + step); e.preventDefault(); }
        });
        grip.addEventListener('dblclick', function () { setPanelWidth(320); });
    }

    // ── Wiring ───────────────────────────────────────────────────────────
    function initEvents() {
        $('an-station-search').addEventListener('input', function (e) {
            stationQuery = e.target.value; renderStations();
        });

        $('an-station-filters').addEventListener('click', function (e) {
            var b = e.target.closest('button[data-filter]');
            if (!b) return;
            stationFilter = b.getAttribute('data-filter');
            Array.prototype.forEach.call(this.children, function (c) {
                c.classList.toggle('is-on', c === b);
            });
            renderStations();
        });

        function pick(el) {
            var li = el.closest('.an-st');
            if (li) selectStation(li.getAttribute('data-key'));
        }
        $('an-stations').addEventListener('click', function (e) { pick(e.target); });
        $('an-stations').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e.target); }
        });
        $('an-clear').addEventListener('click', showDashboard);

        // The dashboard's station bars are shortcuts into the same selection.
        $('an-dash').addEventListener('click', function (e) {
            var row = e.target.closest('[data-goto]');
            if (row) selectStation(row.getAttribute('data-goto'));
        });

        $('an-tabs').addEventListener('click', function (e) {
            var b = e.target.closest('button[data-tab]');
            if (b) showTab(b.getAttribute('data-tab'));
        });

        // One listener for the whole station area. Its panes are replaced
        // wholesale on every station change, so anything bound to the inner
        // elements would have to be re-bound each time.
        $('an-station').addEventListener('input', function (e) {
            if (e.target.id === 'an-song-search') { songQuery = e.target.value; renderSongRows(); }
        });
        $('an-station').addEventListener('click', function (e) {
            var rateChip = e.target.closest('#an-rate-filters button[data-rate]');
            if (rateChip) {
                rateFilter = rateChip.getAttribute('data-rate');
                Array.prototype.forEach.call(rateChip.parentNode.children, function (c) {
                    c.classList.toggle('is-on', c === rateChip);
                });
                renderSongRows();
                return;
            }
            var th = e.target.closest('th[data-sort]');
            if (th) {
                var key = th.getAttribute('data-sort');
                if (key === sortKey) sortAsc = !sortAsc; else { sortKey = key; sortAsc = true; }
                Array.prototype.forEach.call(th.parentNode.children, function (c) {
                    c.classList.toggle('is-sort', c === th);
                    c.classList.toggle('is-asc', c === th && sortAsc);
                });
                renderSongRows();
                return;
            }
            var file = e.target.closest('.an-sc-file');
            if (file) {
                openScriptFile(file.getAttribute('data-script'), file.getAttribute('data-name'),
                               file.getAttribute('data-label'), file.hasAttribute('data-readme'));
                return;
            }
            var chip = e.target.closest('.an-rate');
            if (chip && CAN_RATE) {
                var row = chip.closest('tr[data-song]');
                if (row) openMenu(chip, row.getAttribute('data-song'));
            }
        });
        $('an-station').addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var file = e.target.closest('.an-sc-file');
            if (file) {
                e.preventDefault();
                openScriptFile(file.getAttribute('data-script'), file.getAttribute('data-name'),
                               file.getAttribute('data-label'), file.hasAttribute('data-readme'));
            }
        });

        document.addEventListener('click', function (e) {
            if (menu && !e.target.closest('.an-menu') && !e.target.closest('.an-rate')) closeMenu();
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
        window.addEventListener('resize', closeMenu);
    }

    // ── The address bar ──────────────────────────────────────────────────
    // #308.70 or #308.70/songs. NO HASH IS THE DASHBOARD, which is the point of
    // having a dashboard: the bare URL is the useful one.
    function routeFromHash() {
        var want = decodeURIComponent(location.hash.replace(/^#/, '')).trim();
        if (!want) { if (CURRENT) showDashboard(); return; }

        var parts = want.split('/');
        var tab = ['analytics', 'songs', 'scripts'].indexOf(parts[1]) >= 0 ? parts[1] : null;
        for (var i = 0; i < INDEX.stations.length; i++) {
            var s = INDEX.stations[i];
            if (s.hm === parts[0] || s.id === parts[0] || s.slug === parts[0]) {
                var key = s.id || s.slug;
                // Already here: switch the tab rather than re-fetching the
                // manifest and throwing away the operator's search.
                if (CURRENT && (CURRENT.id || CURRENT.slug) === key) {
                    if (tab && tab !== TAB) showTab(tab);
                } else {
                    selectStation(key, tab);
                }
                return;
            }
        }
    }

    // ── Boot ─────────────────────────────────────────────────────────────
    function fail(msg) {
        $('an-top-meta').textContent = msg;
        $('an-dash').innerHTML = '<div class="an-note"><p class="an-note-hd">The dial did not load.</p>'
            + '<p>' + esc(msg) + '</p></div>';
    }

    // The ratings are fetched alongside the index rather than after it: a page
    // that painted the C column before the promotions arrived would show every
    // song as unrated for a moment, which is the one thing on it that must not
    // be wrong even briefly.
    var token = authToken();
    Promise.all([
        fetch('/data/analytics-stations.json', { cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw new Error('analytics-stations.json: ' + r.status);
            return r.json();
        }),
        fetch('/api/radio/ratings', {
            cache: 'no-store',
            headers: token ? { 'Authorization': 'Bearer ' + token } : {},
        }).then(function (r) { return r.ok ? r.json() : { stations: {}, admin: false }; })
         .catch(function () { return { stations: {}, admin: false }; }),
    ]).then(function (res) {
        INDEX = res[0];
        RATINGS = res[1].stations || {};
        CAN_RATE = Boolean(res[1].admin);

        renderTopMeta();
        renderStations();
        renderDashboard();
        initResize();
        initEvents();

        routeFromHash();
        // A pasted link has to work in a tab that is ALREADY open. Changing only
        // the fragment never reloads the document, so without this the address
        // bar says #308.70/scripts and the page goes on showing whatever was
        // selected before — which is worse than a 404, because it looks right.
        // syncHash writes the same value it would read back, so this does not
        // fight the page's own updates.
        window.addEventListener('hashchange', routeFromHash);
    }).catch(function (err) {
        fail('Could not load the dial — ' + err.message
           + '. Run `node tools/build-analytics-index.js` if the index is missing.');
    });
})();
