/* ==========================================================================
   /analytics/todo.html — the recording queue.

   Plain browser JavaScript with no build step, loaded by a static HTML file.
   It is NOT one of the page scripts under lib/use-page-script.js: those run
   inside the shared Next document and have to be unwound when the router
   leaves. This page is its own document, so a reload is the only teardown
   there is, and every listener below is allowed to live as long as it.

   THREE PANES, ONE QUESTION EACH. Where it would air → which record → the
   words. Selecting a station rebuilds the middle; selecting an album fetches
   the right. Nothing is fetched before it is asked for.

   WHERE THE DATA COMES FROM:

     /data/todo-index.json     the dial, the album rows and every count, built
                               by tools/build-todo-index.js from the nine
                               authoring trees joined to the ledger. 424 KB —
                               it holds no lyrics at all, only the shape of the
                               backlog.
     /cdn/lyrics/<CODE>.json   one album's sheet: every track's body, its
                               `Styles:` prompt and its metadata trailer.
                               Fetched on click and cached for the session.
                               Sixty megabytes of lyric sheets are not going
                               into an index that every visit downloads.

   THE COUNT THAT MATTERS IS `needs`, and it is deliberately the only number
   rendered in amber. A track is `needs-audio` when a lyric sheet has it and no
   mp3 exists anywhere; `recorded` when the mp3 is on disk and the ledger has
   never seen it; `ingested` when it is in the ledger. Those are three different
   jobs — write/render, ingest, done — and collapsing the first two would hide
   the cheapest work on the page behind the most expensive.
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
    var pct = function (a, b) { return b ? Math.round((a / b) * 100) : 0; };

    // ── State ────────────────────────────────────────────────────────────
    var INDEX = null;          // todo-index.json
    var STATION = null;        // selected station row

    /* ── ONE STATION, OR THE WHOLE DIAL ──────────────────────────────────
       Set `window.TD_LOCK_STATION` in the page to pin this console to a single
       frequency: the station pane and its grip disappear, the albums pane
       becomes the left-hand column, and the URL drops the station segment so a
       shared link is `#<ALBUM>` rather than `#<STATION>/<ALBUM>`.

       A FLAG RATHER THAN A SECOND COPY OF THIS FILE. /todo/gospel_by_music.html
       wants exactly what /analytics/todo.html does with the first pane already
       answered, and the honest way to say that is one implementation with a
       parameter. Forking forty kilobytes of console so one initiative could
       have its own page would mean every future fix to the lyric sheet, the
       rail or the clipboard had to be made twice, and the second copy would be
       the one nobody remembered. */
    var LOCK = (typeof window !== 'undefined' && window.TD_LOCK_STATION) || null;

    /* ── OR PIN IT TO ONE ARTIST ─────────────────────────────────────────
       The twelve Inspire personas are not stations. Each records a body of
       work that lands on several frequencies and shares every one of them with
       the others, so there is no station whose album list is "everything Caleb
       has written" — and that is exactly the list somebody producing for Caleb
       needs.

       Rather than build twelve more index files that would each need
       regenerating whenever anything is written, this reads the network index
       already on the page and gathers the albums whose artist matches. One
       source, always as current as the index itself, and a new persona is a new
       HTML file with one word changed rather than another builder. */
    var LOCK_ARTIST = (typeof window !== 'undefined' && window.TD_LOCK_ARTIST) || null;
    var ALBUM = null;          // selected album code
    var SHEETS = {};           // code -> fetched bundle, for the session
    var TRACK = 'A';           // rail selection: 'A' for the album, or a track number
    /* The page opens on WAITING — the frequencies with something outstanding,
       which is the working list and the reason the page exists. `All` is one
       click away and holds the whole dial including the planned frequencies,
       so nothing is hidden so much as not yet asked for. */
    var stationFilter = 'waiting';
    /* THE PAGE CHOOSES, not this file. The dial-wide console is a backlog and
       opens on what is unfinished; a single-initiative page is a catalogue and
       opens on everything. Reading the chip the page marked `is-on` means the
       default lives beside the buttons that show it, so the two cannot drift.
       Falls back to `needs` when a page says nothing. */
    var albumFilter = (function () {
        var on = document.querySelector('#td-album-filters .td-chip.is-on');
        return (on && on.getAttribute('data-filter')) || 'needs';
    })();

    /* 'code' sorts the catalogue the way it is numbered — 4001 first — which is
       the order somebody works through a body of records. The default puts the
       emptiest albums on top, which is the right answer for a backlog and the
       wrong one for a producer looking for the next record to cut. */
    var ALBUM_SORT = (typeof window !== 'undefined' && window.TD_ALBUM_SORT) || 'needs';

    /* Which albums have every track actually serving from the CDN, written by
       tools/verify-album-audio.js. Optional by design: if the file is missing
       no album shows a tick, which is the safe failure — never a green one. */
    var VERIFIED = null;

    /* ── CORRECTING THE WORDS ────────────────────────────────────────────
       An administrator can fix a lyric from here. Four pieces of state, and
       the first is the only one that decides anything:

         MAY_EDIT  whether to PAINT the Edit buttons. Not a permission —
                   /api/todo/lyrics asks the database for itself on every save,
                   so a browser that sets this to true in the console gains a
                   textarea and a 403.
         EDITS     album code -> the corrections already saved for it, laid over
                   the bundle as it renders. The bundle is derived from the
                   authoring trees and is rewritten whenever they are re-read,
                   so a correction cannot live in it; see the note at the top of
                   app/api/todo/lyrics/route.js.
         DRAFTS    "<code>|<n>" -> the text in an OPEN editor. Held out here
                   rather than in the DOM because the lyric pane re-renders
                   wholesale — picking a track on the rail rebuilds it — and an
                   editor that lived only in the markup would lose an unsaved
                   correction to a click on the rail.
         HISTORY   "<code>|<n>" -> every revision, once somebody has asked. */
    var MAY_EDIT = false;
    var EDITS = {};
    var DRAFTS = {};
    var HISTORY = {};

    function ekey(code, n) { return code + '|' + n; }

    var toastTimer = null;
    function toast(msg) {
        var el = $('td-toast');
        el.textContent = msg;
        el.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
    }

    function tile(n, label, cls) {
        return '<div class="td-tile' + (cls ? ' ' + cls : '') + '">'
             + '<span class="td-tile-n">' + esc(n) + '</span>'
             + '<span class="td-tile-l">' + esc(label) + '</span>'
             + '</div>';
    }

    // ── Left: the stations ───────────────────────────────────────────────
    /* The flagship carries 1,373 of the network's 7,176 outstanding tracks. In
       any order that respects that number it sits on top and the other forty
       frequencies read as a footnote to it, so it is pinned to the foot and the
       rest run up the dial. `_unassigned` is not a frequency at all and goes
       below even that. */
    var PIN_LAST = 'HM308.70-EN';

    function rank(s) {
        if (s.id === '_unassigned') return 3;
        if (s.id === PIN_LAST) return 2;
        return 1;
    }

    function stationsFor() {
        return INDEX.stations.filter(function (s) {
            if (stationFilter === 'planned') return !!s.planned;
            if (s.planned) return stationFilter === 'all';
            if (stationFilter === 'waiting') return s.counts.needs > 0;
            if (stationFilter === 'done') return s.counts.needs === 0;
            return true;
        }).sort(function (a, b) {
            return rank(a) - rank(b) || parseFloat(a.hm) - parseFloat(b.hm);
        });
    }

    function renderStations() {
        var rows = stationsFor();
        var head = '<div class="td-cols"><span>Freq</span><span>Station</span>'
                 + '<span>Waiting</span></div>';
        var html = rows.map(function (s) {
            var c = s.counts;
            /* A planned frequency selects nothing, so every count on it is a
               zero that MEANS "unknown", not "finished". Rendering the bar and
               the tick would file it under done — it gets a dash instead. */
            if (s.planned) {
                return '<li class="td-row td-st is-planned" data-id="' + esc(s.id) + '"'
                     + ' tabindex="0" role="button" title="' + esc(s.freq + ' · ' + s.name
                         + ' — planned. No entry in the STATIONS table yet, so it selects nothing '
                         + 'and no backlog can be computed for it.') + '">'
                     + '<span class="td-c-hm"><span class="u">HM</span>' + esc(s.hm) + '</span>'
                     + '<span class="td-c-name">' + esc(s.name) + '</span>'
                     + '<span class="td-c-n is-plan">planned</span>'
                     + '</li>';
            }
            // The full breakdown belongs in the tooltip, not the row. A grid
            // stops being scannable the moment every cell is a sentence.
            var tip = s.freq + ' · ' + s.name + ' — ' + num(c.needs) + ' of ' + num(c.tracks)
                    + ' written tracks still need an mp3 · ' + num(c.recorded) + ' awaiting ingest · '
                    + num(c.ingested) + ' on the ledger · ' + num(c.albums) + ' albums';
            return '<li class="td-row td-st'
                 + (s.id === (STATION && STATION.id) ? ' is-on' : '')
                 + (s.id === '_unassigned' ? ' is-orphan' : '') + '"'
                 + ' data-id="' + esc(s.id) + '" tabindex="0" role="button" title="' + esc(tip) + '">'
                 + '<span class="td-c-hm">' + (s.hm === '—' ? '—'
                     : '<span class="u">HM</span>' + esc(s.hm)) + '</span>'
                 + '<span class="td-c-name">' + esc(s.name) + '</span>'
                 + '<span class="td-c-n' + (c.needs === 0 ? (c.recorded ? ' is-ingest' : ' is-done') : '') + '">'
                 + (c.needs === 0 ? '✓' : num(c.needs)) + '</span>'
                 + '</li>';
        }).join('');
        $('td-stations').innerHTML = head
            + (html || '<li class="td-row td-st"><span></span><span class="td-c-name">No station matches.</span></li>');
        $('td-panel-foot').textContent = rows.length + ' of ' + INDEX.stations.length + ' stations';
    }

    // ── Middle: the albums ───────────────────────────────────────────────
    function albumsFor() {
        if (!STATION) return [];
        return STATION.albums.map(function (c) { return INDEX.albums[c]; }).filter(function (a) {
            if (!a) return false;
            /* Two filters and no more. `needs` is the working list and the
               default; `all` is everything, which subsumes every finer slice
               anyone asked for — "never recorded" and "awaiting ingest" were
               both readable off the number in the row (`0/12` and a green
               `12/12`) without costing a chip each. */
            if (albumFilter === 'needs' && a.needs === 0) return false;
            return true;
        }).sort(function (x, y) {
            if (ALBUM_SORT === 'code') return x.code.localeCompare(y.code);
            return y.needs - x.needs || x.code.localeCompare(y.code);
        });
    }

    function renderAlbums() {
        var bar = $('td-albums-id');
        if (!STATION) {
            bar.innerHTML = '<span class="td-bar-name">Pick a station</span>';
            $('td-albums-head').hidden = true;
            $('td-albums-scroll').innerHTML = '';
            $('td-albums-foot').textContent = '';
            return;
        }
        $('td-albums-head').hidden = false;
        bar.innerHTML = '<span class="td-bar-hm">' + esc(STATION.freq) + '</span>'
                      + '<span class="td-bar-name">' + esc(STATION.name) + '</span>';

        var rows = albumsFor();
        var head = '<div class="td-cols"><span>Code</span><span>Album</span>'
                 + '<span>Done</span></div>';
        $('td-albums-scroll').innerHTML = head + (rows.map(function (a) {
            var doneN = a.tracks - a.needs;
            // "No lyric sheet" is a genuine finding, not a rendering gap: the
            // album folder exists, the words do not, and that is the earliest
            // possible state of the work. One glyph, because it is rare — a
            // chip on every row would out-shout the numbers the row is for.
            var flag = !a.lyrics ? '<span class="td-warn" title="No lyric sheet in this album folder">⚠</span>' : '';
            var tip = a.code + ' · ' + a.title + ' · ' + a.artist
                    + ' — ' + doneN + ' of ' + a.tracks + ' tracks have audio'
                    + (a.recorded ? ' (' + a.recorded + ' awaiting ingest)' : '')
                    + (a.blueprint ? '' : ' · no blueprint.md')
                    + (a.dupes ? ' · ' + a.dupes + ' duplicate sheet track(s)' : '');
            /* ── THE TICK MEANS THE AUDIO IS THERE ───────────────────
               Not that the ledger says so. tools/verify-album-audio.js asks
               the CDN for every track on the record and this is green only
               when all of them answered — the same distinction the station
               health watch exists for, because an album marked finished off
               the ledger while its objects are missing is a record nobody
               will ever go back and re-cut. No verification file, no tick. */
            var v = VERIFIED && VERIFIED[a.code];
            var tick = (v && v.verified)
                ? '<span class="td-ok" title="All ' + v.tracks
                  + ' tracks verified on the CDN">✓</span>'
                : '<span class="td-ok is-off" aria-hidden="true"></span>';
            return '<div class="td-row td-al' + (a.code === ALBUM ? ' is-on' : '') + '"'
                 + ' data-code="' + esc(a.code) + '" tabindex="0" role="button" title="' + esc(tip)
                 + (v ? ' · ' + v.ok + '/' + v.tracks + ' serving from the CDN' : '') + '">'
                 + '<span class="td-c-code">' + tick + esc(a.code) + '</span>'
                 + '<span class="td-c-t">' + esc(a.title) + flag + '</span>'
                 + '<span class="td-c-n' + (a.needs === 0 ? (a.recorded ? ' is-ingest' : ' is-done') : '') + '">'
                 + doneN + '/' + a.tracks + '</span>'
                 + '</div>';
        }).join('') || '<div class="td-row td-al"><span></span>'
            + '<span class="td-c-t">No album matches.</span></div>');

        var needs = rows.reduce(function (n, a) { return n + a.needs; }, 0);
        $('td-albums-foot').textContent = rows.length + ' album' + (rows.length === 1 ? '' : 's')
            + ' · ' + num(needs) + ' track' + (needs === 1 ? '' : 's') + ' needing audio';
    }

    // ── Right: the words ─────────────────────────────────────────────────
    function renderEmpty() {
        renderRail(null);
        var n = INDEX.network;
        $('td-lyrics').innerHTML =
            '<div class="td-scroll">'
          + '<div class="td-tiles">'
          + tile(num(n.needs), 'need an mp3', 'is-warn')
          + tile(num(n.recorded), 'awaiting ingest', 'is-accent')
          + tile(num(n.ingested), 'on the ledger', 'is-ok')
          + tile(num(n.albums_needing_audio) + ' / ' + num(n.albums), 'albums waiting')
          + '</div>'
          + '<div class="td-empty" style="padding:0">'
          + '<h2>' + num(n.needs) + ' written songs have never been recorded.</h2>'
          + '<p>Every album folder across <b>' + n.trees + ' authoring trees</b> was read for a lyric '
          + 'sheet, then joined to the music ledger. A track counts as needing audio when the words '
          + 'exist and no <code>.mp3</code> does — not on the CDN, not in the source tree, nowhere. '
          + '<b>' + num(n.albums_silent) + '</b> albums have no audio at all.</p>'
          + '<p>Pick a frequency on the left to see what it is waiting on, then an album to read its '
          + 'sheet. The <b>Styles</b> block on each track is the generation prompt — it is what the '
          + 'render is made from, so it is shown first and is one click to copy.</p>'
          + '<p>The left panel is the <b>whole dial, all ' + num(n.stations) + ' frequencies</b>, up the '
          + 'numbers. <b>' + num(n.stations_planned) + '</b> of them are marked <b>planned</b>: they are on '
          + 'the shelf with no entry in the <code>STATIONS</code> table yet, so they select nothing and no '
          + 'backlog can be computed for them — what those are waiting on is a selection rule, not a '
          + 'recording. <b>Year of Jubilee</b> sits at the foot rather than in frequency order: it carries '
          + 'about a fifth of everything outstanding, and on top it makes the other forty read as a '
          + 'footnote to it. The last row, <b>Unassigned</b>, is written work that matches no station’s '
          + 'rule at all — a record nobody has given a frequency to, which is a different job again.</p>'
          + '</div></div>';
    }

    /* Section tags and production cues are scaffolding, not words. `[Chorus]`
       is structure and `[brass fanfare]` is an instruction to the renderer;
       both are dimmed so the lyric itself is what the eye lands on. */
    var SECTIONS = /^(intro|verse|pre-chorus|prechorus|chorus|final chorus|bridge|outro|hook|refrain|breakdown|key change|interlude|tag|vamp|coda|drop)/i;
    function lyricHtml(text) {
        return esc(text).replace(/\[([^\]\n]{1,80})\]/g, function (m, inner) {
            return '<span class="' + (SECTIONS.test(inner) ? 'sec' : 'cue') + '">[' + inner + ']</span>';
        });
    }

    /* ── THE SESSION, AND WHETHER IT MAY EDIT ────────────────────────────
       The same two localStorage keys the whole site keeps one session under —
       app/_session-store.js is the authority on the pair — so signing in on the
       home page is signing in here, and nothing about this page has its own
       idea of who you are.

       THE ROLE IS ASKED OF THE SERVER, NEVER READ FROM THE STORED SESSION.
       /api/auth/login writes {id, email, name} with no role at all, so there is
       nothing there to read, and a role copied into localStorage would keep
       claiming admin long after the role was taken away. Verbatim the reasoning
       in app/_use-is-admin.js, which is the React half of this.

       /todo/<project>.html loads /js/kj-static-header.js, which has already
       asked by the time this runs and leaves the answer on the window;
       /analytics/todo.html carries no site header, so this asks for itself.
       One request either way. */
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

    function askRole() {
        if (window.KJ_ROLE_PROMISE) return window.KJ_ROLE_PROMISE;
        var token = authToken();
        if (!token) return Promise.resolve(null);
        return fetch('/api/auth/me', {
            headers: { Authorization: 'Bearer ' + token },
            cache: 'no-store',
        }).then(function (r) {
            return r.ok ? r.json() : null;
        }).then(function (body) {
            return String((body && body.user && body.user.role) || '').toLowerCase() || null;
        }).catch(function () {
            // Offline, or the token expired. No buttons is the safe answer — it
            // costs an admin one reload and tells a stranger nothing.
            return null;
        });
    }

    /* Executives reach the console too where an admin has granted them the
       albums section, so the test is the same one the header's Admin pill
       makes. What they may actually SAVE is /api/todo/lyrics's question, and it
       asks kj_role_permissions rather than trusting this. */
    function resolveMayEdit() {
        askRole().then(function (role) {
            var next = role === 'admin' || role === 'executive';
            if (next === MAY_EDIT) return;
            MAY_EDIT = next;
            // The answer arrives after the first paint, so whatever is on
            // screen is redrawn with its Edit buttons rather than waiting for
            // the reader to click something.
            if (ALBUM && SHEETS[ALBUM]) renderSheet(SHEETS[ALBUM]);
        });
    }

    // ── The corrections, laid over the bundle ────────────────────────────
    /* Never rejects. A console that refused to open an album because the
       overlay could not be read would be a worse console than one showing the
       sheet as it was built — which is what null means here. */
    function fetchEdits(code) {
        return fetch('/api/todo/lyrics?album=' + encodeURIComponent(code), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { return (j && j.edits) || null; })
            .catch(function () { return null; });
    }

    /* `sheetLyrics` is the bundle's own words, kept beside the corrected ones so
       "Restore the sheet's words" has something to restore and so a re-render
       after a save does not treat the correction as the original. Captured once
       per track, on the first merge — capturing it again after a save would
       quietly promote the correction to being the sheet. */
    function mergeEdits(sheet) {
        var edits = EDITS[sheet.code] || {};
        sheet.tracks.forEach(function (t) {
            if (t.sheetLyrics === undefined) t.sheetLyrics = t.lyrics || '';
            var e = edits[String(t.n)];
            t.edit = e || null;
            t.lyrics = e ? e.lyrics : t.sheetLyrics;
        });
    }

    /* WHEN, IN WORDS SOMEBODY CAN CHECK. A bare ISO timestamp reads as machine
       output and nobody can tell at a glance whether it was this morning. */
    function whenText(iso) {
        var d = new Date(iso);
        return isNaN(d.getTime()) ? String(iso || '') : d.toLocaleString();
    }

    function editorName(e) {
        return (e && (e.editedByName || e.editedByEmail)) || 'somebody';
    }

    /* WHO SINGS THIS IS A PER-TRACK FACT, and the album is the wrong place to
       read it from. Torah Sings is credited to the catalogue; its individual
       songs are performed by whichever of thirteen personas the casting called
       for — track 1 of ANSMX01001EN is Elias Inspire, not "torah-sings".
       Gospel By Music has the same shape. So the byline comes off the track's
       own `ARTIST:` line, and falls back to the album credit only for a track
       with no lyric sheet at all: an mp3 the ledger knows and nobody wrote up. */
    function titleCase(slug) {
        return String(slug || '').split('-').map(function (w) {
            return w ? w[0].toUpperCase() + w.slice(1) : w;
        }).join(' ');
    }

    /* ── THE FACE THAT GOES WITH THE NAME ────────────────────────────────
       From window.KJ_MEMBERS — the roster the rest of the site already draws
       from — rather than a map written here. That matters more than it looks:
       Eliana Inspire's portrait is filed as `JubileeElina-Circle-200.png`, and
       a lookup built by guessing the filename from the name would quietly show
       the wrong person, or nobody. The roster carries the pairing, so this
       cannot disagree with the cards, the dial or the shelf.

       The LEAD takes the picture. A credit reads "Caleb Inspire feat. Imani
       Inspire" and there is one 18px circle to give, so it goes to the artist
       the track belongs to; the full credit is still printed beside it.

       Absent roster, no image and just the name — never a broken portrait. */
    function memberImage(credit) {
        var roster = (typeof window !== 'undefined' && window.KJ_MEMBERS) || null;
        if (!roster || !credit) return '';
        var lead = String(credit).split(/\s+feat\.?\s+/i)[0].trim();
        for (var i = 0; i < roster.length; i++) {
            if (roster[i] && roster[i].name === lead) return roster[i].image || '';
        }
        return '';
    }

    /* Set by the page. One name for everything on it, because an initiative is
       assigned to a producer, not a track at a time — see
       /todo/gospel_by_music.html. Unset on the dial-wide console, where the
       question has no single answer and the pill simply does not appear. */
    var ASSIGNED = (typeof window !== 'undefined' && window.TD_ASSIGNED_TO) || '';

    /* Per-album credits, pinned by tools/assign-completed-albums.js when a
       record's audio was verified on the CDN. Read as FACT, never recomputed:
       a finished album keeps the name of whoever finished it even if a later
       verification run cannot reach the CDN, because credit for work already
       done does not expire with the network. Anything not pinned falls through
       to the page's own assignee, who holds the outstanding work. */
    var PINNED = null;

    function assignedFor(sheet) {
        var code = sheet && sheet.code;
        var pin = PINNED && code && PINNED[code];
        return (pin && pin.assignedTo) || ASSIGNED;
    }

    function performerOf(t, sheet) {
        var m = /^ARTIST:[ \t]*(.+)$/m.exec(t.intro || '');
        var name = m ? m[1].trim() : '';
        return name || titleCase(sheet && sheet.artist);
    }

    /* `01 Sky Splits Open` — two digits, a space, the title. This is the form the
       lyric sheets themselves use in their `Song Title:` trailer, and the form
       a rendered file is expected to come back named in, so it is what the
       clipboard hands over. Zero-padding is what keeps a folder of them in
       track order rather than 1, 10, 11, 2. Three-digit track numbers pass
       through unpadded; nothing in the catalogue is that long, and truncating
       would be worse than a ragged column. */
    function trackNo(n) {
        return (n < 10 ? '0' : '') + n;
    }

    function numberedTitle(t) {
        return trackNo(t.n) + ' ' + t.title;
    }

    /* WHERE THIS SONG LIVES ON J:. Two paths, at the foot of every song,
       because they answer the two questions the page raises and cannot answer
       itself: where do I go to edit these words, and where does the rendered
       file have to land.

       The album folder comes from the builder rather than being assembled here
       from property + folder — three of the nine source trees file albums under
       an intervening book directory, so an assembled path would be wrong for a
       quarter of the catalogue. Sent to the clipboard on click, because a path
       you retype is a path you mistype. */
    function pathsHtml(t, sheet) {
        if (!sheet || !sheet.dir) return '';
        var sheetFile = t.sheet || (sheet.sheets && sheet.sheets[0] && sheet.sheets[0].file);
        var rows = [];
        if (sheetFile) {
            rows.push(['Lyrics', sheet.dir + '\\lyrics\\' + sheetFile]);
        }
        // Where the mp3 goes. Named for every track, not only the unrecorded
        // ones — on a finished song it is where the file already is.
        rows.push([t.status === 'needs-audio' ? 'Audio goes' : 'Audio', sheet.dir + '\\tracks']);
        return '<div class="td-paths">' + rows.map(function (r) {
            return '<button class="td-path" data-path="' + esc(r[1]) + '" '
                 + 'title="Copy this path">'
                 + '<span class="td-path-k">' + esc(r[0]) + '</span>'
                 + '<span class="td-path-v">' + esc(r[1]) + '</span></button>';
        }).join('') + '</div>';
    }

    /* ── THE LYRIC BLOCK, IN ONE OF THREE STATES ─────────────────────────
       The words as built, the words as corrected, or a textarea over the top of
       either. Split out of trackHtml because it is the one part of a track that
       has more than one shape, and inlining three of them in the middle of a
       twelve-line template is how the byline above it became unreadable. */
    function editorOpen(sheet, t) {
        return sheet && Object.prototype.hasOwnProperty.call(DRAFTS, ekey(sheet.code, t.n));
    }

    /* A BARE TEXTAREA, AND DELIBERATELY SO. The words are stored as plain text
       in a sheet on the J: share and are read back by a parser that counts
       lines; every piece of markup a rich editor would add is a character that
       has to be stripped out again before the file can be written. Nothing here
       formats, and nothing here touches the title, the `Styles:` prompt or the
       metadata trailer — those are not this page's to change. */
    function editorHtml(t, sheet) {
        var draft = DRAFTS[ekey(sheet.code, t.n)];
        return '<div class="td-editor" data-n="' + t.n + '">'
             + '<textarea class="td-editor-area" data-n="' + t.n + '" spellcheck="true"'
             + ' aria-label="Lyrics for ' + esc(numberedTitle(t)) + '">'
             + esc(draft) + '</textarea>'
             + '<div class="td-editor-bar">'
             + '<span class="td-editor-msg" data-msg="' + t.n + '">'
             + 'Plain text. The words only — the title, the styles prompt and the '
             + 'metadata are not editable here.</span>'
             + '<button class="td-btn" data-act="restore" data-n="' + t.n + '"'
             + ' title="Put back the words as the sheet on J: has them">Sheet’s words</button>'
             + '<button class="td-btn" data-act="cancel" data-n="' + t.n + '">Cancel</button>'
             + '<button class="td-btn is-primary" data-act="save" data-n="' + t.n + '">Save</button>'
             + '</div></div>';
    }

    /* Newest first, and every row says whether it has reached the sheet on the
       J: share yet — a correction that is live on this page and not yet written
       back is the state that matters, because a re-render made from the sheet
       would not have it. tools/apply-lyric-edits.js is what clears it. */
    function historyHtml(revs) {
        if (!revs || !revs.length) {
            return '<div class="td-hist"><div class="td-hist-h">No saves recorded</div></div>';
        }
        return '<div class="td-hist"><div class="td-hist-h">Every save, newest first</div>'
             + revs.map(function (r) {
                 return '<div class="td-hist-r">'
                      + '<div class="td-hist-w">'
                      + '<span class="td-hist-rev">rev ' + esc(r.revision) + '</span>'
                      + '<span>' + esc(editorName(r)) + '</span>'
                      + '<span class="td-hist-when">' + esc(whenText(r.editedAt)) + '</span>'
                      + (r.appliedAt
                          ? '<span class="td-hist-applied">written back ' + esc(whenText(r.appliedAt)) + '</span>'
                          : '<span class="td-hist-pending">not yet in the sheet</span>')
                      + '</div>'
                      + (r.prevLyrics
                          ? '<pre class="td-hist-was">' + esc(r.prevLyrics) + '</pre>'
                          : '<p class="td-none">Nothing recorded of what it said before this save.</p>')
                      + '</div>';
             }).join('')
             + '</div>';
    }

    function lyricBlockHtml(t, sheet) {
        if (editorOpen(sheet, t)) return editorHtml(t, sheet);

        var key = ekey(sheet.code, t.n);
        var body = t.lyrics
            ? '<pre class="td-lyric' + (t.edit ? ' is-edited' : '') + '">'
                + lyricHtml(t.lyrics) + '</pre>'
            : '<p class="td-none">This track has no lyric block in the sheet.</p>';
        if (!t.edit) return body;

        /* WHO AND WHEN, UNDER THE WORDS THEY CHANGED. Shown to everybody, not
           only to an administrator: the point of the note is that the next
           person to open the sheet on J: and find it disagreeing with this page
           can tell which of the two is the newer. The history behind it names
           people and is gated, so only somebody who may edit is offered it. */
        return body
             + '<p class="td-edited-note">Corrected by <b>' + esc(editorName(t.edit)) + '</b> · '
             + esc(whenText(t.edit.editedAt)) + ' · revision ' + esc(t.edit.revision)
             + (MAY_EDIT
                 ? '<button class="td-hist-open" data-hist="' + t.n + '">'
                     + (HISTORY[key] ? 'Hide history' : 'History') + '</button>'
                 : '')
             + '</p>'
             + (MAY_EDIT && HISTORY[key] ? historyHtml(HISTORY[key]) : '');
    }

    function trackHtml(t, sheet) {
        var meta = (t.meta || []).map(function (kv) {
            return '<div class="td-meta-r"><span class="td-meta-k">' + esc(kv[0])
                 + '</span><span class="td-meta-v">' + esc(kv[1]) + '</span></div>';
        }).join('');
        var label = t.status === 'needs-audio' ? 'needs mp3'
                  : t.status === 'recorded' ? 'awaiting ingest' : 'on air';
        var cls = t.status === 'needs-audio' ? 'needs' : t.status;

        var who = performerOf(t, sheet);
        var img = memberImage(who);
        var assignee = assignedFor(sheet);

        return '<article class="td-track is-' + cls + '" id="t-' + t.n + '">'
             + '<div class="td-track-h">'
             + '<span class="td-track-n">' + trackNo(t.n) + '</span>'
             + '<span class="td-track-t">' + esc(t.title) + '</span>'
             + (t.songId ? '<span class="td-track-n">' + esc(t.songId) + '</span>' : '')
             // Title, lyrics, styles — the order they get used in. You name the
             // song first, then paste the words, then paste the prompt.
             + '<button class="td-copy" data-copy="title" data-n="' + t.n + '">Copy title</button>'
             + (t.lyrics ? '<button class="td-copy" data-copy="lyrics" data-n="' + t.n + '">Copy lyrics</button>' : '')
             + (t.styles ? '<button class="td-copy" data-copy="styles" data-n="' + t.n + '">Copy styles</button>' : '')
             /* LAST IN THE ROW, after the three copy buttons. Copying is what
                every visit to this page is for and editing is what a handful of
                them are, so the common controls keep the position the hand
                already knows. Painted only for an administrator — the save
                itself is gated again on the server. */
             + (MAY_EDIT
                 ? '<button class="td-edit' + (editorOpen(sheet, t) ? ' is-on' : '') + '"'
                     + ' data-edit="' + t.n + '">'
                     + (editorOpen(sheet, t) ? 'Editing' : 'Edit lyrics') + '</button>'
                 : '')
             + '</div>'
             + '<div class="td-track-b">'
             /* WHO SINGS IT on the left, WHAT IS OUTSTANDING on the right.
                The two halves answer different people: the left is the artist
                this song belongs to, the right is its state and whose desk it
                is on. Splitting them to opposite ends means a column of tracks
                reads as two aligned lists rather than one ragged sentence.

                The vocal-gender note that used to trail the name is gone from
                this line — it is still in the metadata below, under VOCAL
                GENDER, which is where a detail that long belongs. */
             + '<div class="td-byline">'
             + '<span class="td-by-who">'
             + (img ? '<img class="td-by-img" src="' + esc(img) + '" alt="" width="18" height="18" '
                    + 'loading="lazy" onerror="this.remove()">' : '')
             + (who ? '<span class="td-by-a">' + esc(who) + '</span>' : '')
             + '</span>'
             + '<span class="td-by-tail">'
             + '<span class="td-pill is-' + cls + '">' + label + '</span>'
             /* THE WORDS ON SCREEN ARE NOT THE WORDS IN THE SHEET. Said in the
                byline as well as under the lyric, because this is the line a
                reader scans down a column of thirteen tracks — and somebody
                about to render one needs to know before they copy, not after. */
             + (t.edit ? '<span class="td-pill is-edited">corrected</span>' : '')
             + (assignee ? '<span class="td-pill is-assigned">Assigned to: '
                         + esc(assignee) + '</span>' : '')
             + '</span>'
             + '</div>'
             /* ── THE ORDER THE WORK IS DONE IN ──────────────────────────
                Lyrics, then the prompt, then everything about them, then where
                the file lives. The song used to arrive last, under its own
                styles and a wall of metadata, so the one thing every visit is
                for was the one thing you had to scroll past six rows of
                Faith-Focus scores to reach. Now the words are the first thing
                under the title, the generation prompt sits directly beneath
                them where it is pasted next, and the numbers and the J: path —
                which are reference, consulted rarely — are at the foot. */
             + lyricBlockHtml(t, sheet)
             /* THE NAME THE RENDERED FILE COMES BACK AS, inside the prompt
                block and indented to the same edge as the prompt itself. The
                two are one instruction — paste this, name the result that —
                and as a separate row below the box it read as a separate step.

                WHEN THERE IS NO PROMPT it stands on its own instead of being
                wrapped in an otherwise empty box. Not every track in the
                catalogue carries styles, and this file also renders the
                dial-wide console, where that is commoner.

                numberedTitle() and not a second bit of formatting here, because
                this is the same string the Copy title button hands over. Two
                places building "01 Song Title" independently is two places to
                drift, and a title on screen that did not match the one on the
                clipboard would be worse than no title at all. */
             + (function () {
                 var line = '<div class="td-songtitle">'
                          + '<span class="td-songtitle-k">Song Title:</span>'
                          + '<span class="td-songtitle-v">' + esc(numberedTitle(t)) + '</span>'
                          + '</div>';
                 if (!t.styles) return line;
                 return '<div class="td-styles">'
                      + '<span class="td-styles-k">Styles — the generation prompt</span>'
                      + '<p>' + esc(t.styles) + '</p>'
                      + line
                      + '</div>';
             })()
             + (meta ? '<div class="td-meta">' + meta + '</div>' : '')
             + (t.intro ? '<details class="td-fold"><summary>Casting &amp; archetype</summary>'
                        + '<pre>' + esc(t.intro) + '</pre></details>' : '')
             + pathsHtml(t, sheet)
             + '</div></article>';
    }

    /* ── The track rail ──────────────────────────────────────────────────
       One dot per song plus `A` for the whole record. Built from the sheet's
       real track count rather than a fixed thirteen: a twelve-track album gets
       the thirteen dots, and Party Giggles' twenty-six-track records get
       twenty-seven instead of quietly losing half their songs.

       Each dot carries its track's state, so the rail doubles as the album at
       a glance — a column of amber is a record nobody has recorded yet. */
    function renderRail(sheet) {
        var rail = $('td-rail');
        if (!sheet || !sheet.tracks.length) { rail.hidden = true; rail.innerHTML = ''; return; }
        rail.hidden = false;

        var needs = sheet.tracks.filter(function (t) { return t.status === 'needs-audio'; }).length;
        var html = '<button class="td-dot is-all' + (TRACK === 'A' ? ' is-on' : '') + '"'
                 + ' data-track="A" title="' + esc('The whole record — all ' + sheet.tracks.length
                     + ' tracks (' + needs + ' still need an mp3)') + '">A</button>'
                 + '<span class="td-rail-sep"></span>';

        html += sheet.tracks.map(function (t) {
            var cls = t.status === 'needs-audio' ? 'is-needs'
                    : t.status === 'recorded' ? 'is-recorded' : 'is-ingested';
            var label = t.status === 'needs-audio' ? 'needs an mp3'
                      : t.status === 'recorded' ? 'awaiting ingest' : 'on the ledger';
            return '<button class="td-dot ' + cls + (TRACK === t.n ? ' is-on' : '') + '"'
                 + ' data-track="' + t.n + '"'
                 + ' title="' + esc(t.n + '. ' + t.title + ' — ' + label) + '">'
                 + t.n + '</button>';
        }).join('');

        rail.innerHTML = html;
    }

    /* Which record the pane is currently showing, so a re-render of the SAME
       record can put the scroll back where it was. Opening an editor on track
       nine rebuilds the pane, and without this it reopened at the top of the
       album with the box the reader had just asked for somewhere below the
       fold. Only the same album qualifies — moving to another record should
       start at its first track, not at the last one's offset. */
    var shownCode = null;

    function renderSheet(sheet) {
        var a = INDEX.albums[sheet.code] || {};
        var prior = $('td-sheet-scroll');
        var keepScroll = (prior && shownCode === sheet.code) ? prior.scrollTop : 0;
        var needs = sheet.tracks.filter(function (t) { return t.status === 'needs-audio'; }).length;
        var rec = sheet.tracks.filter(function (t) { return t.status === 'recorded'; }).length;
        var ing = sheet.tracks.filter(function (t) { return t.status === 'ingested'; }).length;

        var notes = [];
        if (sheet.dupes) {
            notes.push('<b>note</b>' + sheet.dupes + ' track' + (sheet.dupes === 1 ? '' : 's')
                + ' appeared twice across ' + sheet.sheets.length + ' sheets in this folder — an older '
                + 'sheet left beside its renamed copy. The first sheet won; nothing was merged.');
        }
        if (!sheet.blueprint) {
            notes.push('<b>note</b>No <code>blueprint.md</code> in this album folder. The lyrics exist; '
                + 'the production brief they were written against does not.');
        }

        // The identity line stays whatever the rail says — a lyric sheet with
        // no album name on it is a page you cannot cite. Everything else that
        // describes the RECORD rather than the SONG goes when one song is
        // picked: the tiles, the sheet-level notes and the sheet header are
        // album facts, and on a single track they are just noise above it.
        var one = TRACK !== 'A';
        var shown = one ? sheet.tracks.filter(function (t) { return t.n === TRACK; }) : sheet.tracks;
        var album =
            '<h1 class="td-al-head">' + esc(sheet.title) + '</h1>'
          + '<p class="td-al-sub">' + esc(sheet.code) + ' · ' + esc(sheet.artist) + ' · '
          + esc(sheet.lang) + ' · ' + esc(sheet.property) + '/…/' + esc(sheet.folder) + '</p>';

        $('td-lyrics').innerHTML =
            '<div class="td-scroll" id="td-sheet-scroll">'
          + album
          + (one ? '' :
                '<div class="td-tiles">'
              + tile(num(needs), 'need an mp3', 'is-warn')
              + tile(num(rec), 'awaiting ingest', 'is-accent')
              + tile(num(ing), 'on the ledger', 'is-ok')
              + tile(num(sheet.tracks.length), 'tracks')
              + '</div>'
              + notes.map(function (n) { return '<p class="td-note">' + n + '</p>'; }).join('')
              + (sheet.header ? '<details class="td-fold"><summary>Album sheet header — '
                  + esc(sheet.sheets.map(function (x) { return x.file; }).join(', ')) + '</summary>'
                  + '<pre>' + esc(sheet.header) + '</pre></details>' : ''))
          + shown.map(function (t) { return trackHtml(t, sheet); }).join('')
          + (sheet.tracks.length ? '' : '<p class="td-none">No lyric sheet was found in this album folder.</p>')
          + (one && !shown.length ? '<p class="td-none">This album has no track ' + TRACK + '.</p>' : '')
          + '</div>';

        shownCode = sheet.code;
        if (keepScroll) {
            var pane = $('td-sheet-scroll');
            if (pane) pane.scrollTop = keepScroll;
        }

        renderRail(sheet);
        void a;
    }

    /* A pasted link, or a filter change, can leave the chosen row a hundred
       entries down a list nobody has scrolled. `nearest` moves only when it has
       to; `scroll-margin-top` keeps it clear of the sticky column header. */
    function reveal(containerId) {
        var row = $(containerId).querySelector('.td-row.is-on');
        if (row) row.scrollIntoView({ block: 'nearest' });
    }

    /* ── THE SYNTHETIC ARTIST STATION ────────────────────────────────────
       Gathers every album in the index by this artist and hands the console one
       station shaped like any other, pushed into INDEX.stations so the album
       pane, the counts and the hash all find it where they expect. Returns its
       id. Called at boot AND on refresh, because a refresh brings a new index
       and the old row would still describe the old album list. */
    function synthesiseArtist(j) {
        var mine = Object.keys(j.albums || {}).filter(function (c) {
            return j.albums[c] && j.albums[c].artist === LOCK_ARTIST;
        }).sort();
        var sum = function (f) {
            return mine.reduce(function (n, c) { return n + (f(j.albums[c]) || 0); }, 0);
        };
        var pretty = LOCK_ARTIST.split('-').map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1);
        }).join(' ');
        var id = 'ARTIST-' + LOCK_ARTIST;
        var row = {
            id: id, hm: '', freq: pretty, name: pretty, slug: LOCK_ARTIST,
            lang: 'EN', langName: 'English', planned: false,
            counts: {
                albums: mine.length,
                albumsNeeding: mine.filter(function (c) { return j.albums[c].needs > 0; }).length,
                tracks: sum(function (x) { return x.tracks; }),
                needs: sum(function (x) { return x.needs; }),
                recorded: sum(function (x) { return x.recorded; }),
                ingested: sum(function (x) { return x.ingested; })
            },
            albums: mine
        };
        j.stations = (j.stations || []).filter(function (x) { return x.id !== id; }).concat([row]);
        return id;
    }

    /* The header line, in one place. Boot and refresh both need it and it used
       to be written inline in two, which is two places to change it. */
    function paintMeta(j) {
        var el = $('td-top-meta');
        if (!el) return;
        var c = STATION ? STATION.counts : null;
        var n = c || {
            needs: j.network.needs, albumsNeeding: j.network.albums_needing_audio,
            albums: j.network.albums, recorded: j.network.recorded, ingested: j.network.ingested
        };
        el.innerHTML =
            '<span class="is-warn">' + num(n.needs) + '</span> tracks need an mp3 · '
          + '<b>' + num(n.albumsNeeding) + '</b> of ' + num(n.albums) + ' albums · '
          + '<b>' + num(n.recorded) + '</b> awaiting ingest · '
          + '<b>' + num(n.ingested) + '</b> on the ledger · built '
          + new Date(j.generated_at).toLocaleString();
    }

    /* ── REFRESH ─────────────────────────────────────────────────────────
       WHAT IT DOES: re-reads the published index, the CDN verification and the
       pinned credits, and redraws — so anything a rebuild has published since
       this page opened shows up without a reload. New albums, changed counts,
       tracks that have since been ingested, ticks that have since been earned.

       WHAT IT CANNOT DO, said plainly because a button that implied otherwise
       would be worse than no button: it cannot see the J: drive. Nothing in a
       browser can. Words written five minutes ago are found by
       tools/build-todo-index.js walking the authoring trees on a machine that
       can see the share — until that has run and been deployed, there is
       nothing here to fetch. This button reports what has been PUBLISHED, and
       tells you when that was built. */
    var refreshing = false;

    function setRefreshState(text, busy) {
        var btn = $('td-refresh');
        if (!btn) return;
        btn.disabled = !!busy;
        btn.classList.toggle('is-busy', !!busy);
        btn.textContent = text;
    }

    function refreshQueue() {
        if (refreshing) return;
        refreshing = true;
        setRefreshState('Checking…', true);

        var keepAlbum = ALBUM, keepTrack = TRACK;
        var wasBuilt = INDEX && INDEX.generated_at;

        Promise.all([
            fetch(INDEX_URL, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch('/data/audio-verified.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch('/data/album-assignments.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        ]).then(function (got) {
            if (!got[0]) { setRefreshState('Could not reach the index', false); refreshing = false; return; }
            INDEX = got[0];
            if (got[1] && got[1].albums) VERIFIED = got[1].albums;
            if (got[2] && got[2].albums) PINNED = got[2].albums;

            if (LOCK_ARTIST) LOCK = synthesiseArtist(INDEX);
            if (LOCK) STATION = INDEX.stations.filter(function (x) { return x.id === LOCK; })[0] || STATION;

            // The sheets are re-fetched on open, so drop the session cache or a
            // reopened album would render the words this page loaded with.
            SHEETS = {};

            paintMeta(INDEX);
            if (!LOCK) renderStations();
            renderAlbums();
            renderStationSummary();
            if (keepAlbum && INDEX.albums[keepAlbum]) { ALBUM = null; TRACK = keepTrack; openAlbum(keepAlbum); }
            else renderEmpty();

            var changed = wasBuilt !== INDEX.generated_at;
            setRefreshState(changed ? 'Updated' : 'Already current', false);
            refreshing = false;
            setTimeout(function () { setRefreshState('Refresh', false); }, 5000);
        }).catch(function () {
            setRefreshState('Refresh failed', false);
            refreshing = false;
            setTimeout(function () { setRefreshState('Refresh', false); }, 5000);
        });
    }

    function openAlbum(code) {
        if (code !== ALBUM) TRACK = 'A';
        ALBUM = code;
        renderAlbums();
        reveal('td-albums-scroll');
        syncHash();
        if (SHEETS[code]) { renderSheet(SHEETS[code]); return; }
        renderRail(null);
        $('td-lyrics').innerHTML = '<div class="td-scroll"><p class="td-none">Reading the sheet…</p></div>';
        /* TWO SOURCES, ONE RECORD. The bundle is the sheet as the last index
           build parsed it out of the authoring trees; the overlay is whatever
           has been corrected since. Fetched together rather than in sequence —
           they are independent and the second is a single indexed row lookup —
           and the overlay is allowed to fail without taking the album with it,
           which is why only the bundle's rejection reaches the catch below. */
        Promise.all([
            fetch(INDEX.lyrics_base + '/' + encodeURIComponent(code) + '.json', { cache: 'no-store' })
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                }),
            fetchEdits(code),
        ])
            .then(function (got) {
                var j = got[0];
                EDITS[code] = got[1] || {};
                mergeEdits(j);
                SHEETS[code] = j;
                if (ALBUM === code) renderSheet(j);
            })
            .catch(function (e) {
                if (ALBUM !== code) return;
                // The bundles live on the CDN, not in public/. A 404 here is
                // almost always "the lyric tree was rebuilt and not copied
                // across", which is a deploy step, not a missing album.
                $('td-lyrics').innerHTML = '<div class="td-scroll">'
                  + '<h1 class="td-al-head">' + esc(code) + '</h1>'
                  + '<p class="td-note"><b>not fetched</b>' + esc(String(e.message || e))
                  + ' — <code>' + esc(INDEX.lyrics_base + '/' + code + '.json')
                  + '</code>. Re-run <code>node tools/build-todo-index.js</code> and copy '
                  + '<code>&lt;CDN_LOCAL_ROOT&gt;/lyrics/</code> to the server.</p></div>';
            });
    }

    function openStation(id) {
        STATION = INDEX.stations.filter(function (s) { return s.id === id; })[0] || null;
        ALBUM = null;
        renderStations();
        reveal('td-stations');
        renderAlbums();
        renderStationSummary();
        syncHash();
    }

    /* The selection lives in the URL. A backlog is something two people argue
       about, and "the 601 Melody is waiting on" has to be a link you can paste
       — otherwise it is a description of four clicks. `#<STATION>/<ALBUM>`. */
    function syncHash() {
        var tail = ALBUM ? ALBUM + (TRACK === 'A' ? '' : '/' + TRACK) : '';
        var want = LOCK
            ? (tail ? '#' + tail : '')
            : (STATION ? '#' + STATION.id + (tail ? '/' + tail : '') : '');
        if ((location.hash || '') !== want) {
            history.replaceState(null, '', location.pathname + want);
        }
    }

    function applyHash() {
        var parts = (location.hash || '').replace(/^#/, '').split('/');
        var id, code, track;
        if (LOCK) {
            // The station is not in the URL because it cannot vary.
            id = LOCK; code = parts[0]; track = parts[1];
        } else {
            id = parts[0]; code = parts[1]; track = parts[2];
        }
        if (!id) { STATION = null; ALBUM = null; renderStations(); renderAlbums(); renderEmpty(); return; }
        if (!STATION || STATION.id !== id) openStation(id);
        if (!code || !INDEX.albums[code]) return;
        /* A pasted link names an album, and the default filter is "needs audio"
           — so a link to a FINISHED album would open a sheet whose row is not in
           the list beside it. Widen the filter rather than leave the middle pane
           disagreeing with the right one. */
        if (INDEX.albums[code].needs === 0 && albumFilter === 'needs') {
            albumFilter = 'all';
            var kids = $('td-album-filters').querySelectorAll('.td-chip');
            for (var i = 0; i < kids.length; i++) {
                kids[i].classList.toggle('is-on', kids[i].getAttribute('data-filter') === 'all');
            }
        }
        openAlbum(code);
        // A link can name one song. `#<STATION>/<ALBUM>/7` is how you send
        // somebody the track you actually mean rather than the record it is on.
        if (track && /^\d+$/.test(track)) {
            TRACK = parseInt(track, 10);
            if (SHEETS[code]) renderSheet(SHEETS[code]);
        }
    }

    function renderStationSummary() {
        if (!STATION) { renderEmpty(); return; }
        renderRail(null);

        /* A planned frequency has no rule, so it has no albums, no backlog and
           nothing to record. Showing four zero tiles would say "finished". What
           it needs is a sentence naming the actual blocker — which is an entry
           in a table in this repository, not a recording session. */
        if (STATION.planned) {
            $('td-lyrics').innerHTML =
                '<div class="td-scroll">'
              + '<h1 class="td-al-head">' + esc(STATION.name) + '</h1>'
              + '<p class="td-al-sub">' + esc(STATION.freq)
              + (STATION.langName ? ' · ' + esc(STATION.langName) : '')
              + (STATION.format ? ' · ' + esc(STATION.format) : '') + '</p>'
              + '<p class="td-note"><b>planned</b>This frequency is on the dial and has no entry in '
              + 'the <code>STATIONS</code> table in <code>tools/build-station-manifest.js</code>, so '
              + 'it selects no tracks and no backlog can be computed for it. Nothing here is waiting '
              + 'on a recording — it is waiting on a selection rule.</p>'
              + '<div class="td-empty" style="padding:0"><p>Activating a frequency is five steps and '
              + '<b>ON AIR is derived, not declared</b>: add it to <code>STATIONS</code>, build its '
              + 'manifest, give it a catalogue entry, run <code>build-home-data.js</code> and '
              + '<code>sync-tenants.js</code>, then publish its schedule. '
              + '<code>setup/import-refresh.md</code> carries the order.</p></div>'
              + '</div>';
            return;
        }

        var c = STATION.counts;
        var note = '';
        if (STATION.songCurated) {
            note = '<p class="td-note"><b>under-reported</b>This station is curated track by track '
                 + '(<code>select.songs</code>), and a written album has no SongIDs to match against — '
                 + 'so only its album-level matches are counted here. Its real backlog is larger. '
                 + 'Naming the albums in <code>select.pending</code> is what fixes it.</p>';
        }
        if (STATION.id === '_unassigned') {
            note = '<p class="td-note"><b>on no frequency</b>These albums match no station’s selection '
                 + 'rule — wrong language for every station that takes the artist, an act outside both '
                 + 'pools, or a body of work nobody has given a frequency to yet. Recording them is not '
                 + 'the blocker; deciding where they air is.</p>';
        }
        $('td-lyrics').innerHTML =
            '<div class="td-scroll">'
          + '<h1 class="td-al-head">' + esc(STATION.name) + '</h1>'
          + '<p class="td-al-sub">' + esc(STATION.id) + (STATION.langName ? ' · ' + esc(STATION.langName) : '')
          + (STATION.pool ? ' · pool ' + esc(STATION.pool) : '')
          + (STATION.hostCity ? ' · ' + esc(STATION.hostCity) : '') + '</p>'
          + '<div class="td-tiles">'
          + tile(num(c.needs), 'need an mp3', 'is-warn')
          + tile(num(c.recorded), 'awaiting ingest', 'is-accent')
          + tile(num(c.ingested), 'on the ledger', 'is-ok')
          + tile(num(c.albumsNeeding) + ' / ' + num(c.albums), 'albums waiting')
          + '</div>'
          + note
          + '<div class="td-empty" style="padding:0"><p>Pick an album in the middle pane to read its '
          + 'lyric sheet. Albums are ordered by how many of their tracks are still waiting.</p></div>'
          + '</div>';
    }

    // ── Resizable panes ──────────────────────────────────────────────────
    /* Two dividers, one function. The left pane is a fixed list and stays
       narrow; the middle is what gets scanned and starts widest. Both persist,
       because an operator who widened a pane did it for a reason and should not
       have to do it again after a reload. */
    var LIMITS = { panel: [200, 480], albums: [260, 900] };
    var VARS = { panel: '--panel-w', albums: '--albums-w' };
    var KEYS = { panel: 'kj.todo.panelWidth', albums: 'kj.todo.albumsWidth' };

    /* WRITTEN TWICE, ON PURPOSE. A dragged divider has to still be there after a
       reload — an operator who widened a pane did it for a reason and should not
       have to do it again every visit. localStorage is the natural home for it
       and is also the one that silently throws: a hardened profile, a blocked
       third-party context, private mode. The cookie is the belt to that
       braces. Read cookie first, mirror to both on write, and a failure of
       either on its own is invisible. */
    function saveWidth(key, w) {
        try { localStorage.setItem(key, String(w)); } catch (e) { /* private mode */ }
        try {
            document.cookie = key + '=' + w + ';path=/;max-age=31536000;samesite=lax';
        } catch (e) { /* cookies off */ }
    }

    function loadWidth(key) {
        var m = new RegExp('(?:^|;\\s*)' + key.replace(/\./g, '\\.') + '=(\\d+)').exec(document.cookie || '');
        if (m) return parseInt(m[1], 10);
        try {
            var v = localStorage.getItem(key);
            return v ? parseInt(v, 10) : null;
        } catch (e) { return null; }
    }

    function setWidth(which, px) {
        var lim = LIMITS[which];
        // A stored value that has gone bad (a cleared cookie, a half-written
        // key) must not reach the CSS as `NaNpx`, which silently drops the
        // declaration and leaves the pane at whatever the stylesheet says.
        if (!isFinite(px)) return;
        var w = Math.max(lim[0], Math.min(lim[1], Math.round(px)));
        document.documentElement.style.setProperty(VARS[which], w + 'px');
        saveWidth(KEYS[which], w);
    }

    function initResize() {
        ['panel', 'albums'].forEach(function (which) {
            var stored = loadWidth(KEYS[which]);
            if (stored) setWidth(which, stored);
        });

        [['td-grip-1', 'panel', 'td-panel'], ['td-grip-2', 'albums', 'td-albums']].forEach(function (g) {
            var grip = $(g[0]), which = g[1], pane = $(g[2]);
            grip.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                grip.setPointerCapture(e.pointerId);
                grip.classList.add('is-drag');
                document.body.classList.add('is-resizing');
            });
            grip.addEventListener('pointermove', function (e) {
                if (!grip.classList.contains('is-drag')) return;
                setWidth(which, e.clientX - pane.getBoundingClientRect().left);
            });
            function stop(e) {
                if (!grip.classList.contains('is-drag')) return;
                try { grip.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
                grip.classList.remove('is-drag');
                document.body.classList.remove('is-resizing');
            }
            grip.addEventListener('pointerup', stop);
            grip.addEventListener('pointercancel', stop);
            // A separator that can only be dragged is one a keyboard cannot reach.
            grip.addEventListener('keydown', function (e) {
                var step = e.shiftKey ? 40 : 12;
                if (e.key === 'ArrowLeft') { setWidth(which, pane.offsetWidth - step); e.preventDefault(); }
                if (e.key === 'ArrowRight') { setWidth(which, pane.offsetWidth + step); e.preventDefault(); }
            });
            grip.addEventListener('dblclick', function () {
                setWidth(which, which === 'panel' ? 300 : 420);
            });
        });
    }

    // ── Wiring ───────────────────────────────────────────────────────────
    function chips(containerId, onPick) {
        $(containerId).addEventListener('click', function (e) {
            var b = e.target.closest('.td-chip');
            if (!b) return;
            var kids = $(containerId).querySelectorAll('.td-chip');
            for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('is-on', kids[i] === b);
            onPick(b.getAttribute('data-filter'));
        });
    }

    function activate(el, fn) {
        el.addEventListener('click', fn);
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
        });
    }

    function initEvents() {
        chips('td-station-filters', function (f) { stationFilter = f; renderStations(); });
        chips('td-album-filters', function (f) { albumFilter = f; renderAlbums(); });
        var rb = $('td-refresh');
        if (rb) rb.addEventListener('click', refreshQueue);

        activate($('td-stations'), function (e) {
            var li = e.target.closest('.td-st');
            if (li && li.getAttribute('data-id')) openStation(li.getAttribute('data-id'));
        });
        activate($('td-albums-scroll'), function (e) {
            var row = e.target.closest('.td-al');
            if (row && row.getAttribute('data-code')) openAlbum(row.getAttribute('data-code'));
        });

        // A path is only useful in a shell or an Explorer bar, so clicking it
        // puts it on the clipboard rather than making you select it by hand.
        $('td-lyrics').addEventListener('click', function (e) {
            var b = e.target.closest('.td-path');
            if (!b) return;
            var v = b.getAttribute('data-path');
            navigator.clipboard.writeText(v).then(function () {
                toast('Path copied — ' + v);
            }, function () { toast('Clipboard refused — select and copy by hand'); });
        });

        // The rail filters the sheet in place. No fetch — the bundle is already
        // in hand, so this is a re-render of what is on screen.
        $('td-rail').addEventListener('click', function (e) {
            var b = e.target.closest('.td-dot');
            if (!b || !SHEETS[ALBUM]) return;
            var v = b.getAttribute('data-track');
            TRACK = v === 'A' ? 'A' : parseInt(v, 10);
            renderSheet(SHEETS[ALBUM]);
            syncHash();
            var pane = $('td-sheet-scroll');
            if (pane) pane.scrollTop = 0;
        });

        // Copy is the point of the Styles block: it is the prompt the render is
        // made from, and retyping eight hundred characters of it is how a track
        // gets rendered against the wrong brief.
        $('td-lyrics').addEventListener('click', function (e) {
            var b = e.target.closest('.td-copy');
            if (!b || !SHEETS[ALBUM]) return;
            var n = parseInt(b.getAttribute('data-n'), 10);
            var t = SHEETS[ALBUM].tracks.filter(function (x) { return x.n === n; })[0];
            if (!t) return;
            var what = b.getAttribute('data-copy');
            var text = what === 'title' ? numberedTitle(t)
                     : what === 'styles' ? (t.styles || '')
                     : (t.lyrics || '');
            if (!text) return;
            // The toast quotes what actually landed on the clipboard, so a
            // wrong track number is visible at the moment of the copy rather
            // than at the moment of the paste.
            var said = what === 'title' ? 'Copied “' + numberedTitle(t) + '”'
                     : what === 'styles' ? 'Styles copied — ' + numberedTitle(t)
                     : 'Lyrics copied — ' + numberedTitle(t);
            navigator.clipboard.writeText(text).then(function () {
                toast(said);
            }, function () { toast('Clipboard refused — select and copy by hand'); });
        });

        initEditing();
    }

    /* ══ CORRECTING A LYRIC ═══════════════════════════════════════════════
       Everything below is the editor: opening it, keeping what is typed in it
       across the re-renders the rest of the page does, saving, and reading the
       history of what has been saved before.

       ALL OF IT IS DELEGATED FROM #td-lyrics, because the pane is rebuilt from
       a string on every render and a listener bound to a textarea would be
       thrown away with the element it was bound to. */

    function trackOf(sheet, n) {
        return sheet.tracks.filter(function (x) { return x.n === n; })[0] || null;
    }

    /* The same normalising the server does before it stores a body — CRLF to
       LF, no trailing whitespace. Without it "no change" is decided on the line
       endings the browser happened to hand back, and every save of an untouched
       lyric would be recorded as a revision. */
    function norm(text) {
        return String(text == null ? '' : text)
            .replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\s+$/, '');
    }

    function setMsg(n, text, cls) {
        var m = document.querySelector('.td-editor-msg[data-msg="' + n + '"]');
        if (!m) return;
        m.textContent = text;
        m.className = 'td-editor-msg' + (cls ? ' ' + cls : '');
    }

    function setBusy(n, busy) {
        var bar = document.querySelector('.td-editor[data-n="' + n + '"] .td-editor-bar');
        if (!bar) return;
        bar.querySelectorAll('.td-btn').forEach(function (b) { b.disabled = !!busy; });
    }

    /* Put the cursor where the work is. The pane is rebuilt around the editor,
       so this runs after the render rather than as part of building it. */
    function focusEditor(n) {
        var area = document.querySelector('.td-editor-area[data-n="' + n + '"]');
        if (!area) return;
        area.focus();
        try { area.setSelectionRange(0, 0); } catch (e) { /* not all browsers */ }
        area.scrollIntoView({ block: 'nearest' });
    }

    function toggleEditor(sheet, n) {
        var t = trackOf(sheet, n);
        if (!t) return;
        var key = ekey(sheet.code, n);
        if (Object.prototype.hasOwnProperty.call(DRAFTS, key)) {
            // Closing. Unsaved work is worth one question — this is the only
            // copy of it, and the button that closes the box is next to Save.
            if (norm(DRAFTS[key]) !== norm(t.lyrics)
                && !window.confirm('Discard the unsaved changes to ' + numberedTitle(t) + '?')) return;
            delete DRAFTS[key];
            renderSheet(sheet);
            return;
        }
        DRAFTS[key] = t.lyrics || '';
        renderSheet(sheet);
        focusEditor(n);
    }

    function saveEdit(sheet, n) {
        var t = trackOf(sheet, n);
        if (!t) return;
        var key = ekey(sheet.code, n);
        var text = DRAFTS[key];
        if (text == null) return;

        if (!norm(text)) { setMsg(n, 'Nothing to save — the box is empty.', 'is-bad'); return; }
        if (norm(text) === norm(t.lyrics)) {
            setMsg(n, 'No change — these are already the words on the page.', 'is-bad');
            return;
        }
        var token = authToken();
        if (!token) { setMsg(n, 'Signed out — sign in again to save.', 'is-bad'); return; }

        setBusy(n, true);
        setMsg(n, 'Saving…', null);

        /* `baseLyrics` is the SHEET's own words, not what is on screen: the
           server takes the previous revision where there is one and falls back
           to this, so what it records as "before" is the bundle's words on the
           first correction and never a guess afterwards. */
        fetch('/api/todo/lyrics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({
                album: sheet.code, track: n, lyrics: text, baseLyrics: t.sheetLyrics || '',
            }),
        }).then(function (r) {
            return r.json().catch(function () { return null; }).then(function (body) {
                if (!r.ok) {
                    throw new Error(r.status === 403
                        // The buttons are painted from /api/auth/me and the save
                        // is decided by the database; a 403 here means the two
                        // disagree, which is the role having changed under them.
                        ? 'Not allowed to save — your role no longer has the albums section.'
                        : ((body && body.error) || ('HTTP ' + r.status)));
                }
                return body;
            });
        }).then(function (body) {
            if (!EDITS[sheet.code]) EDITS[sheet.code] = {};
            EDITS[sheet.code][String(n)] = body.edit;
            delete DRAFTS[key];
            delete HISTORY[key];        // a save makes a fetched history stale
            mergeEdits(sheet);
            renderSheet(sheet);
            toast('Saved — ' + numberedTitle(t) + ', revision ' + body.edit.revision);
        }).catch(function (e) {
            // The draft is deliberately still in DRAFTS: a failed save must not
            // be the thing that loses the correction somebody just typed.
            setBusy(n, false);
            setMsg(n, String(e.message || e), 'is-bad');
        });
    }

    function toggleHistory(sheet, n) {
        var key = ekey(sheet.code, n);
        if (HISTORY[key]) { delete HISTORY[key]; renderSheet(sheet); return; }
        var token = authToken();
        if (!token) { toast('Signed out — sign in again to read the history.'); return; }
        fetch('/api/todo/lyrics?album=' + encodeURIComponent(sheet.code)
              + '&track=' + n + '&history=1',
              { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (j) {
                if (ALBUM !== sheet.code) return;   // moved on while it was in flight
                HISTORY[key] = j.revisions || [];
                renderSheet(sheet);
            })
            .catch(function (e) {
                toast('Could not read the history — ' + (e.message || e));
            });
    }

    function unsavedCount() {
        var n = 0;
        Object.keys(DRAFTS).forEach(function (key) {
            var parts = key.split('|');
            var sheet = SHEETS[parts[0]];
            var t = sheet ? trackOf(sheet, parseInt(parts[1], 10)) : null;
            if (t && norm(DRAFTS[key]) !== norm(t.lyrics)) n++;
        });
        return n;
    }

    function initEditing() {
        // The answer arrives from the server; nothing is painted until it does.
        resolveMayEdit();

        var pane = $('td-lyrics');

        pane.addEventListener('click', function (e) {
            var sheet = SHEETS[ALBUM];
            if (!sheet) return;

            var ed = e.target.closest('[data-edit]');
            if (ed) { toggleEditor(sheet, parseInt(ed.getAttribute('data-edit'), 10)); return; }

            var act = e.target.closest('.td-btn[data-act]');
            if (act) {
                var n = parseInt(act.getAttribute('data-n'), 10);
                var what = act.getAttribute('data-act');
                if (what === 'save') { saveEdit(sheet, n); return; }
                if (what === 'cancel') { toggleEditor(sheet, n); return; }
                if (what === 'restore') {
                    /* Not a delete of the correction — the earlier revisions
                       stay in the history either way. This only puts the
                       sheet's words back in the box; saving them is what makes
                       the restoration a revision of its own, with a name and a
                       time on it like every other change. */
                    var t = trackOf(sheet, n);
                    if (!t) return;
                    DRAFTS[ekey(sheet.code, n)] = t.sheetLyrics || '';
                    renderSheet(sheet);
                    setMsg(n, 'The sheet’s words are back in the box. Save to keep them.', null);
                    focusEditor(n);
                }
                return;
            }

            var hist = e.target.closest('[data-hist]');
            if (hist) { toggleHistory(sheet, parseInt(hist.getAttribute('data-hist'), 10)); }
        });

        /* WHAT IS TYPED LIVES IN DRAFTS, NOT IN THE TEXTAREA. The pane is
           rebuilt from a string whenever anything else on the page changes —
           picking a track on the rail is enough — and an editor whose only copy
           of the text was the element would lose it to that. */
        pane.addEventListener('input', function (e) {
            var area = e.target.closest && e.target.closest('.td-editor-area');
            if (!area || !SHEETS[ALBUM]) return;
            DRAFTS[ekey(ALBUM, parseInt(area.getAttribute('data-n'), 10))] = area.value;
        });

        pane.addEventListener('keydown', function (e) {
            var area = e.target.closest && e.target.closest('.td-editor-area');
            if (!area || !SHEETS[ALBUM]) return;
            var n = parseInt(area.getAttribute('data-n'), 10);
            // The two shortcuts a text box in a console is expected to have.
            // Enter alone is a newline — this is a lyric, and the commonest
            // keystroke in it must not be the one that saves.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                saveEdit(SHEETS[ALBUM], n);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                toggleEditor(SHEETS[ALBUM], n);
            }
        });

        /* The draft is in memory and nowhere else. Leaving the page is the one
           way to lose it that no button on the page asks about. */
        window.addEventListener('beforeunload', function (e) {
            if (!unsavedCount()) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }

    // ── Boot ─────────────────────────────────────────────────────────────
    /* Fetched alongside the index and allowed to fail. A console that refused
       to open because a tick file was missing would be a worse console than one
       that opens without ticks. */
    /* WHICH QUEUE. The network index by default; a page may name another that
       is the same shape — see /todo/we_eatin_good.html, whose project has no
       frequency and no ledger rows and so is built by its own tool rather than
       folded into a 488KB index of the dial. The console does not care which
       it is handed. */
    var INDEX_URL = (typeof window !== 'undefined' && window.TD_INDEX_URL)
        || '/data/todo-index.json';

    Promise.all([
        fetch(INDEX_URL, { cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }),
        fetch('/data/audio-verified.json', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; }),
        fetch('/data/album-assignments.json', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; }),
    ])
        .then(function (both) {
            var j = both[0];
            VERIFIED = both[1] && both[1].albums ? both[1].albums : null;
            PINNED = both[2] && both[2].albums ? both[2].albums : null;
            INDEX = j;
            var n = j.network;
            if (!LOCK) $('td-top-meta').innerHTML =
                '<span class="is-warn">' + num(n.needs) + '</span> tracks need an mp3 · '
              + '<b>' + num(n.albums_needing_audio) + '</b> of ' + num(n.albums) + ' albums · '
              + '<b>' + num(n.recorded) + '</b> awaiting ingest · '
              + '<b>' + num(n.ingested) + '</b> on the ledger · built '
              + new Date(j.generated_at).toLocaleString();
            initResize();
            initEvents();
            if (LOCK_ARTIST && !LOCK) LOCK = synthesiseArtist(j);
            if (LOCK) {
                /* The pane that answers "which station" has nothing left to
                   ask, so it goes — along with its grip, or the layout would
                   keep a draggable edge for a column that is not there. */
                document.body.classList.add('td-locked');
                var row = INDEX.stations.filter(function (x) { return x.id === LOCK; })[0];
                if (!row) {
                    $('td-top-meta').textContent = LOCK + ' is not in the index.';
                    $('td-lyrics').innerHTML = '<div class="td-empty"><h2>Unknown station.</h2>'
                      + '<p><code>' + esc(LOCK) + '</code> is not in <code>/data/todo-index.json</code>. '
                      + 'Re-run <code>node tools/build-todo-index.js</code>.</p></div>';
                    return;
                }
                /* THE STATION'S OWN NUMBERS, NOT THE NETWORK'S. On this page the
                   network total is a distraction: the question is how much of
                   THIS initiative is still unwritten as audio. */
                var c = row.counts;
                $('td-top-meta').innerHTML =
                    '<span class="is-warn">' + num(c.needs) + '</span> tracks need an mp3 · '
                  + '<b>' + num(c.albumsNeeding) + '</b> of ' + num(c.albums) + ' albums · '
                  + '<b>' + num(c.recorded) + '</b> awaiting ingest · '
                  + '<b>' + num(c.ingested) + '</b> on the ledger · built '
                  + new Date(j.generated_at).toLocaleString();
            } else {
                renderStations();
            }
            renderAlbums();
            renderEmpty();
            applyHash();
            window.addEventListener('hashchange', applyHash);
        })
        .catch(function (e) {
            $('td-top-meta').textContent = 'Could not read the queue: ' + (e.message || e);
            $('td-lyrics').innerHTML = '<div class="td-empty"><h2>No index.</h2>'
              + '<p><code>' + esc(INDEX_URL) + '</code> did not load. Rebuild it and deploy '
              + '<code>public/data</code>.</p></div>';
        });
})();
