#!/usr/bin/env node
/**
 * build-todo-pages.js — write the /todo console pages and their card index.
 *
 *   node tools/build-todo-pages.js
 *   node tools/build-todo-pages.js --dry-run
 *
 * ── WHY THESE ARE GENERATED ─────────────────────────────────────────────────
 *
 * Every page under /todo is the same console with one identifier changed: which
 * queue to read and which slice of it to pin to. Hand-copying that HTML is how
 * the first few drifted — one had a stale heading, another still named the page
 * it was copied from in its own comment. A generator makes "add a project" a
 * line in PROJECTS below, and makes a fix to the shape reach every page at once.
 *
 * THE INDEX IS GENERATED FROM THE SAME TABLE, so a project cannot exist as a
 * page nobody can reach, or as a card that leads to a 404.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'todo');
const DRY = process.argv.indexOf('--dry-run') > 0;

/* The twelve Inspire personas, in roster order. Each records a body of work
   that lands across several frequencies and shares every one of them with the
   others, so there is no STATION whose album list is "everything Caleb has
   written" — which is exactly the list somebody producing for Caleb needs.
   `artist` pins the console to the persona instead, reading the network index
   already published rather than an index of its own that could go stale. */
/* The twelve Inspire personas, IN BIRTH ORDER — the order the family itself
   is counted in, not alphabetical and not by catalogue size. Each records a
   body of work that lands across several frequencies and shares every one of
   them with the others, so there is no STATION whose album list is "everything
   Caleb has written" — which is exactly the list somebody producing for Caleb
   needs. `artist` pins the console to the persona instead, reading the network
   index already published rather than an index of its own that could go stale.

   The fourth column is the colour FAMILY, which is a property of the family
   rather than of the individual: five houses, twelve people. It is stated here
   rather than taken from KJ_MEMBERS, because the roster's gradients are
   per-persona identity hues and these are the family groupings — Nova's roster
   colour is violet and her family is green, and both are correct about
   different things. */
const PERSONAS = [
    ['jubilee-inspire',  'Jubilee Inspire',  'The whole house sings',            'blue'],
    ['melody-inspire',   'Melody Inspire',   'Everyday family faith',            'blue'],
    ['zariah-inspire',   'Zariah Inspire',   'Caribbean and diaspora',           'yellow'],
    ['elias-inspire',    'Elias Inspire',    'Country and the open road',        'purple'],
    ['eliana-inspire',   'Eliana Inspire',   'Folk wisdom, a sister voice',      'purple'],
    ['caleb-inspire',    'Caleb Inspire',    'Young, courageous worship',        'green'],
    ['imani-inspire',    'Imani Inspire',    'Pentecostal fire',                 'red'],
    ['zev-inspire',      'Zev Inspire',      'Hebrew roots and the feasts',      'yellow'],
    ['amir-inspire',     'Amir Inspire',     'Middle Eastern worship',           'blue'],
    ['nova-inspire',     'Nova Inspire',     'For the doubting',                 'green'],
    ['santiago-inspire', 'Santiago Inspire', 'Latino heart',                     'red'],
    ['tahoma-inspire',   'Tahoma Inspire',   'Pacific and first-nations',        'red'],
];

/* Everything the index offers. `kind` decides how the console is pinned:
     station — a frequency on the dial, read from the network index
     artist  — one persona's whole catalogue, read from the network index
     index   — a property with its own queue file, built by build-persheet-index.js
*/
const PROJECTS = [
    /* TORAH SINGS IS A LIVE STATION, NOT A SCHEDULED ONE. HM 305.40 streams
       from Icecast (STREAM_TORAH in public/js/pages/radio.js) and shares the
       jubilee-praise slug, so it has no tenant, no manifest and no pool —
       which is why every station-keyed console missed it and why it was absent
       from this index. Pinned by ARTIST instead: the network index already
       walks J:\\torahsings.com\\music, and the artist is the whole body of work
       whether or not a frequency has claimed a given album. */
    { file: 'torah_sings.html', kind: 'artist', lock: 'torah-sings',
      badge: 'HM 305.40',
      title: 'Torah Sings',       blurb: 'Torah-rooted worship voiced by Zev, Genesis to Revelation.',
      group: 'Radio Stations' },
    { file: 'gospel_by_music.html',   kind: 'station', lock: 'HM316.00-EN',
      slug: 'gospel-by-music', badge: 'HM 316.00',
      title: 'Gospel By Music',   blurb: 'The Gospels set to music, book by book.',
      assigned: 'Joe Pohl', group: 'Radio Stations' },
    { file: 'gravel_road_gospel.html', kind: 'station', lock: 'HM317.20-EN',
      slug: 'gravel-road-gospel', badge: 'HM 317.20',
      title: 'Gravel Road Gospel', blurb: 'Southern Gothic Americana, Hollis Ferriday.',
      group: 'Radio Stations' },
    { file: 'buckysBarnyard.html',    kind: 'station', lock: 'HM370.30-EN',
      slug: 'buckys-barnyard', badge: 'HM 370.30',
      title: "Bucky's Barnyard",  blurb: 'Barnyard bluegrass praise for children.',
      group: 'Radio Stations' },
    { file: 'backrowfaith.html',      kind: 'index',   lock: 'HM316.60-RE',
      index: '/data/todo-backrowfaith.json', slug: 'backrow-faith', badge: 'HM 317.70',
      title: 'Backrow Faith',     blurb: 'The back row of the room, in Romanian.',
      group: 'Radio Stations' },
    { file: 'we_eatin_good.html',     kind: 'index',   lock: 'WEG-EN',
      index: '/data/todo-weeatingood.json', badge: 'No frequency yet',
      title: 'We Eatin Good',     blurb: 'Micah Tate — Detroit hip hop and the first of the month.',
      group: 'Radio Stations' },
    /* Jubilee Prayers — the sung Scripture prayers, authored in
       W:\jubileeprayers.com and filed under J:\jubileeprayers.com\cantillation,
       which is the tree the network index already walks. Pinned by ARTIST
       rather than to HM 350.00: the station selects this artist anyway, and
       the artist is the whole body of work whether or not a frequency has
       claimed a given album yet. */
    { file: 'jubilee_prayers.html', kind: 'artist', lock: 'jubilee-prayers',
      badge: 'HM 350.00',
      title: 'Jubilee Prayers',   blurb: 'The Model Prayer sung through, petition by petition.',
      group: 'Radio Stations' },
    { file: 'throne_room_vegas.html', kind: 'index',   lock: 'TRV-EN',
      index: '/data/todo-throneroomvegas.json', slug: 'throne-room-vegas', badge: 'HM 317.40',
      title: 'Throne Room Vegas', blurb: 'Ricky Del Rey — a Vegas showroom act with a pulpit.',
      group: 'Radio Stations' },
].concat(PERSONAS.map(([slug, name, focus, tone]) => ({
    file: slug.replace(/-/g, '_') + '.html',
    kind: 'artist', lock: slug, title: name, blurb: focus,
    group: 'The Inspire Family', tone: tone, badge: 'Inspire Family',
})));

// ── the console page ────────────────────────────────────────────────────
function pageHTML(p) {
    const globals = [
        p.kind === 'index' ? "  window.TD_INDEX_URL = " + JSON.stringify(p.index) + ";" : null,
        p.kind === 'artist'
            ? "  window.TD_LOCK_ARTIST = " + JSON.stringify(p.lock) + ";"
            : "  window.TD_LOCK_STATION = " + JSON.stringify(p.lock) + ";",
        "  window.TD_ALBUM_SORT = 'code';",
        p.assigned ? "  window.TD_ASSIGNED_TO = " + JSON.stringify(p.assigned) + ";" : null,
    ].filter(Boolean).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(p.title)} — Lyrics Awaiting Audio</title>

<!--
  GENERATED by tools/build-todo-pages.js — do not hand-edit.

  Every page under /todo is the same console with one identifier changed. Edit
  the PROJECTS table in that tool and re-run it; editing here is a change that
  the next run silently reverts.

  ${p.kind === 'artist'
    ? 'Pinned to an ARTIST: the console gathers every album in the network index\n  by this persona and builds a station out of them. No index file of its own,\n  so it is always as current as the network index itself.'
    : p.kind === 'index'
      ? 'Reads its OWN queue file, built by tools/build-persheet-index.js. This\n  property files one lyric sheet per TRACK, which the network index\'s parser\n  does not read, and it has no HM frequency for that index to hang it on.'
      : 'Pinned to a STATION on the dial, read from the network index.'}

  ⚠ A NEW file under public/ needs a restart of the kjubilee service. The standalone
  server snapshots the public/ file list at STARTUP; a file copied afterwards is
  served as a prerendered 404 that reads exactly like a wrong path.
-->

<link rel="icon" href="/images/JubileeLogo.png">
<!-- THE SITE'S OWN BAR, ABOVE THE CONSOLE'S. Order matters: todo.css declares
     the palette these pages are painted in, and site-header.css picks up
     --accent and --border-strong from whatever :root a page already has. -->
<link rel="stylesheet" href="/css/pages/todo.css">
<link rel="stylesheet" href="/css/site-header.css">
<link rel="stylesheet" href="/css/account.css">

<script>
${globals}
</script>
</head>
<body>

<!-- ── THE SITE HEADER ─────────────────────────────────────────────────────
     Lifted from the prerendered home page by siteChrome(), the same markup the
     index carries, and FINISHED IN THE BROWSER by /js/kj-static-header.js —
     which is what puts the signed-in person's initials in it and the Admin pill
     beside them. Without that script this is a bar that says "Sign In" to
     somebody who already has.

     THE RAIL IS NOT HERE, and that is deliberate. The JubileeInspire rail costs
     52px down the left and this page is three panes and a drag handle; the bar
     is what carries the categories and the account, and the rail carries
     neither. The index has room for both and keeps both. -->
${CHROME.header}

<header class="td-top">
  <a class="td-brand" href="/todo/index.html">
    <span class="td-brand-k">kJubilee</span>
    <span class="td-brand-t">${esc(p.title)} — Lyrics Awaiting Audio</span>
  </a>
  <span class="td-top-meta" id="td-top-meta">Reading the queue…</span>
  <button class="td-refresh" id="td-refresh" title="Re-read the published queue and the CDN checks">Refresh</button>
  <a class="td-top-link" href="/todo/index.html">All projects →</a>
</header>

<div class="td-split" id="td-split">

  <aside class="td-panel" id="td-panel" aria-label="Stations">
    <div class="td-panel-head">
      <div class="td-chips" id="td-station-filters" role="group" aria-label="Station filter">
        <button class="td-chip is-on" data-filter="waiting">Waiting</button>
        <button class="td-chip" data-filter="all">All</button>
        <button class="td-chip" data-filter="done">Complete</button>
        <button class="td-chip" data-filter="planned">Planned</button>
      </div>
    </div>
    <div class="td-panel-scroll">
      <ol class="td-list td-list-st td-stations" id="td-stations"></ol>
    </div>
    <div class="td-panel-foot"><span id="td-panel-foot"></span></div>
  </aside>

  <div class="td-grip" id="td-grip-1" role="separator" aria-orientation="vertical"
       tabindex="0" aria-label="Resize station panel" data-target="panel"></div>

  <section class="td-albums" id="td-albums" aria-label="Albums">
    <div class="td-bar" id="td-albums-bar"><div class="td-bar-id" id="td-albums-id"></div></div>
    <div class="td-albums-head" id="td-albums-head" hidden>
      <div class="td-chips" id="td-album-filters" role="group" aria-label="Album filter">
        <button class="td-chip is-on" data-filter="all">All</button>
        <button class="td-chip" data-filter="needs">Needs audio</button>
      </div>
    </div>
    <div class="td-list td-list-al td-albums-scroll" id="td-albums-scroll"></div>
    <div class="td-panel-foot"><span id="td-albums-foot"></span></div>
  </section>

  <div class="td-grip" id="td-grip-2" role="separator" aria-orientation="vertical"
       tabindex="0" aria-label="Resize album panel" data-target="albums"></div>

  <main class="td-lyrics" id="td-lyrics" aria-label="Lyrics"></main>
  <nav class="td-rail" id="td-rail" aria-label="Track filter" hidden></nav>

</div>

<div class="td-toast" id="td-toast" role="status" aria-live="polite" hidden></div>

<script src="/js/stations-data.js"></script>
${NAV_FILL}
<script src="/js/kj-static-header.js"></script>
<script src="/js/pages/todo.js"></script>
</body>
</html>
`;
}

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


/* ── THE SITE'S OWN HEADER AND RAIL ──────────────────────────────────────
   Lifted from the PRERENDERED HOME PAGE rather than hand-copied. Both are
   React components — app/_site-header.js and app/_inspire-rail.js — which a
   static file under public/ cannot import, and a hand-written copy would be a
   second version of the site's chrome quietly drifting from the first.

   Reading the built HTML means this page gets whatever the header and rail
   became at the last build, including changes nobody thought to mirror here.
   If the build output is missing the page still renders, without them, rather
   than failing to generate at all. */
function siteChrome() {
    const candidates = [
        path.join(ROOT, '.next', 'server', 'app', 'index.html'),
        path.join(ROOT, '.next', 'standalone', '.next', 'server', 'app', 'index.html'),
    ];
    for (const f of candidates) {
        let html;
        try { html = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }

        let header = '';
        const hi = html.indexOf('<header class="topbar');
        if (hi >= 0) {
            const hj = html.indexOf('</header>', hi);
            if (hj > hi) header = html.slice(hi, hj + 9);
        }

        let rail = '';
        const rm = new RegExp('<nav[^>]*class="jir[^"]*"').exec(html);
        if (rm) {
            // The rail nests <nav>s, so count depth rather than take the first close.
            let i = rm.index, depth = 0, k = i;
            const tag = new RegExp('</?nav\\b', 'g');
            tag.lastIndex = i;
            let m;
            while ((m = tag.exec(html))) {
                depth += m[0][1] === '/' ? -1 : 1;
                if (depth === 0) { k = m.index + html.slice(m.index).indexOf('>') + 1; break; }
            }
            if (k > i) rail = html.slice(i, k);
        }
        if (header || rail) return { header: header, rail: rail };
    }
    console.warn('  ! no prerendered home page found — the index will render without the site chrome');
    return { header: '', rail: '' };
}

/* Read ONCE, and used by both the index and every console page. It reaches the
   filesystem and warns when the prerendered home page is missing, so calling it
   per page would print that warning twenty-one times for one cause. */
const CHROME = siteChrome();

/* #nav and #nav-right ship EMPTY from the server: home.js fills them from
   KJ_SECTIONS. This page has no home.js, so it fills them itself — with links
   to the home page's sections rather than buttons that would do nothing here.

   NEEDS /js/stations-data.js TO HAVE RUN. The index pairs this with its own
   copy of that script; the console pages already load it for todo.js, so they
   take this on its own rather than fetching 121 stations twice. */
const NAV_FILL = `<script>
(function () {
  var S = (window.KJ_SECTIONS || []);
  function esc(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function html(list){
    return list.map(function (sec) {
      var label = sec.navShort
        ? '<span class="nav-long">' + esc(sec.nav) + '</span><span class="nav-short">' + esc(sec.navShort) + '</span>'
        : esc(sec.nav);
      return '<a class="nav-link" href="/#' + sec.id + '">' + label + '</a>';
    }).join('');
  }
  var n = document.getElementById('nav'), r = document.getElementById('nav-right');
  if (n) n.innerHTML = html(S.filter(function (x) { return x.align !== 'right'; }));
  if (r) r.innerHTML = html(S.filter(function (x) { return x.align === 'right'; }));
})();
</script>`;

// ── the card index ──────────────────────────────────────────────────────
/* The roster is the authority on which picture belongs to which persona.
   Eliana Inspire's portrait is filed as JubileeElina-Circle-200.png, so any
   lookup that built the filename from the name would show the wrong face or
   none. Read from the same KJ_MEMBERS the dial and the shelf read. */
const PORTRAIT = (function () {
    try {
        global.window = {};
        require(path.join(ROOT, 'public', 'js', 'stations-data.js'));
        const m = {};
        (global.window.KJ_MEMBERS || []).forEach(function (x) {
            if (x && x.id && x.image) m[x.id + '-inspire'] = x.image;
            if (x && x.id && x.image) m[x.id] = x.image;
        });
        return m;
    } catch (e) { return {}; }
})();

/* Cover art, by what the project IS:
     station  — its own artwork, the same file the dial and the shelf use
     artist   — the persona's roster portrait
     index    — no picture exists, so the ident gradient carries it alone,
                exactly as an unopened frequency does on the home page. */
function coverFor(p) {
    if (p.kind === 'station') return '/cdn/stations/' + encodeURIComponent(p.slug || '') + '.webp';
    if (p.kind === 'artist') return PORTRAIT[p.lock] || '';
    return '';
}

/* THE BAND ACROSS THE TOP OF A CARD IS WHERE ITS COLOUR LIVES, and this is
   what paints it. Worth knowing why it is the whole of what you see there:
   .cover-art ships at opacity 0 and is revealed by a load handler in
   home.js — which this page does not load — so on /todo/ the artwork behind
   never fades in and the ident gradient IS the top of the card.

   Two ways of arriving at a pair of hues.

   A PROJECT hashes them from its own name: stable because the name is, one
   less table to keep in step, and no two neighbours land on the same tile.

   AN INSPIRE PERSONA takes THE FAMILY'S colour instead. On this page the
   twelve are read as five houses, and a hash scatters siblings across the
   spectrum — which is exactly what a family grouping must not do. Tinting the
   card body and its border was not enough on its own: against a 210px band of
   saturated gradient, a dark wash behind the text is not what the eye picks
   up, so the colour has to be where the colour already is.

   Within a house the members step a few degrees of hue and a few points of
   lightness apart. Three red cards printed identically read as one card
   repeated; the step is small enough that the house still reads first and the
   difference registers only once you are comparing two of them. */
const FAMILY_HUE = {
    /*        ── g1, the dark end ──   ── g2, the light end ── */
    blue:   [218, 40, 23,   208, 56, 47],
    yellow: [ 38, 46, 23,    46, 62, 48],
    purple: [274, 36, 23,   288, 46, 47],
    green:  [160, 40, 20,   148, 46, 41],
    red:    [352, 42, 23,     4, 54, 46],
};

function gradientFor(p) {
    const tone = (p && p.tone) || null;
    const name = (p && p.title) || String(p);

    if (tone && FAMILY_HUE[tone]) {
        const f = FAMILY_HUE[tone];
        const kin = PROJECTS.filter(x => x.tone === tone);
        const i = Math.max(kin.indexOf(p), 0);
        const t = kin.length > 1 ? i / (kin.length - 1) : 0.5;
        const hue = Math.round((t - 0.5) * 10);   /* +/- 5 degrees across a house */
        const lit = Math.round((t - 0.5) * 6);    /* +/- 3 points of lightness    */
        /* Imani sits at the dark end of red, whose hue is 356 — a raw subtraction
           lands on -1. CSS Color 4 wraps a negative angle and every current browser
           gets it right, but a stylesheet that reads hsl(-1) invites somebody to
           'fix' it later, so wrap it here where the intent is visible. */
        const wrap = d => ((d % 360) + 360) % 360;
        return '--g1:hsl(' + wrap(f[0] + hue) + ',' + f[1] + '%,' + (f[2] + lit) + '%);'
             + '--g2:hsl(' + wrap(f[3] + hue) + ',' + f[4] + '%,' + (f[5] + lit) + '%)';
    }

    var h = 0;
    for (var k = 0; k < name.length; k++) h = (h * 31 + name.charCodeAt(k)) >>> 0;
    var a = h % 360, b = (a + 38) % 360;
    return '--g1:hsl(' + a + ',38%,26%);--g2:hsl(' + b + ',44%,44%)';
}

function indexHTML() {
    const groups = [];
    for (const p of PROJECTS) {
        let g = groups.filter(x => x.name === p.group)[0];
        if (!g) { g = { name: p.group, items: [] }; groups.push(g); }
        g.items.push(p);
    }

    const shelves = groups.map(g => {
        const cards = g.items.map(p => {
            const cover = coverFor(p);
            const key = p.kind === 'artist' ? 'artist:' + p.lock
                      : p.kind === 'index' ? 'index:' + p.index
                      : 'station:' + p.lock;
            return ''
              + '        <a class="card' + (p.tone ? ' tone-' + p.tone : '') + '" href="/todo/'
                  + esc(p.file) + '" data-key="' + esc(key) + '">\n'
              + '          <div class="card-cover">\n'
              + '            <div class="ident" style="' + gradientFor(p) + '"></div>\n'
              + (cover
                  ? '            <img class="cover-art" alt="" loading="lazy" decoding="async" src="' + esc(cover) + '">\n'
                  : '')
              + '            <div class="cover-scrim"></div>\n'
              + '            <span class="cover-freq">' + esc(p.badge || g.name) + '</span>\n'
              /* Opposite the frequency, on its baseline: what this project IS
                 on the left, how much of it EXISTS on the right. Filled from
                 the same queue read that fills the count in the body, so the
                 two numbers on a card can never disagree — and left empty
                 until that read lands, rather than printing a zero that would
                 be indistinguishable from a project with nothing recorded. */
              + '            <span class="cover-done" data-done></span>\n'
              + '          </div>\n'
              + '          <div class="card-body">\n'
              + '            <h3 class="card-title">' + esc(p.title) + '</h3>\n'
              + '            <p class="card-blurb">' + esc(p.blurb) + '</p>\n'
              + '            <span class="tx-count" data-count>—</span>\n'
              + '          </div>\n'
              + '        </a>\n';
        }).join('');
        return ''
          + '    <section class="shelf">\n'
          + '      <div class="shelf-head"><h2>' + esc(g.name) + '</h2>'
          + '<span class="shelf-count">' + g.items.length + ' project'
          + (g.items.length === 1 ? '' : 's') + '</span></div>\n'
          + '      <div class="row">\n' + cards + '      </div>\n'
          + '    </section>';
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Recording Queues — kJubilee</title>

<!--
  GENERATED by tools/build-todo-pages.js — do not hand-edit.

  The way in to every recording queue. THE CARDS ARE THE HOME PAGE'S: this
  loads /css/pages/home.css and uses its .shelf / .row / .card markup
  unchanged, so a project tile is the same object a station tile is, down to
  the cover treatment and the 5-to-1 column grid. /css/pages/todo-index.css
  adds only the header bar and a body that scrolls.

  Each card counts what its project still needs, read live from the same
  published files the console pages read, so a card cannot claim a number the
  page behind it disagrees with.

  REFRESH re-reads those files. It cannot see the J: drive — nothing in a
  browser can — so lyrics written since the last index build are not here to be
  found yet. The header says when the queues were built, which is the honest
  version of "is this current".
-->

<link rel="icon" href="/images/JubileeLogo.png">
<link rel="stylesheet" href="/css/site-header.css">
<!-- The signed-in half of the bar. On the site proper AccountButton ships this
     with itself as a <link precedence>; a static page has to ask for it, and
     without it the initials disc renders as an unstyled letter. -->
<link rel="stylesheet" href="/css/account.css">
<link rel="stylesheet" href="/css/inspire-rail.css">
<link rel="stylesheet" href="/css/pages/home.css">
<link rel="stylesheet" href="/css/pages/todo-index.css">
</head>
<!-- THE CLASS IS LOAD-BEARING. inspire-rail.css fixes the rail to the
     viewport and moves the page out from under it with a single
     body.jir-on { padding-left: var(--jir-w) } — there is no other
     anywhere that reserves the rail's 52px. On the site proper that class is
     added by app/_inspire-rail.js when the React component mounts; this page
     lifts the rail's MARKUP out of the build and runs none of its JavaScript,
     so nothing was ever adding it, and the header and every card sat under
     the rail with their left edge cut off. Set it in the HTML instead. -->
<body class="jir-on">

${CHROME.rail}
${CHROME.header}

<main class="stage tx-stage">
${shelves}

  <!-- THE TOTAL IS A FOOTING, NOT A HEADING. It was a strip across the top:
       a title, a network-wide total, a Refresh and a cross-link, all standing
       between the reader and the first card on a page whose entire purpose is
       the cards. Nothing in it is needed to READ the page — the shelves name
       themselves and every card carries its own count — so it reads better
       after the shelves than before them, and Refresh is still one click from
       wherever the scroll stops. Kept inside .tx-stage so it lines up with the
       shelf above it, and the ids are unchanged: todo-index.js finds
       #tx-meta / #tx-refresh by id and does not care where they sit. -->
  <footer class="tx-foot">
    <h1 class="tx-h1">Recording Queues</h1>
    <span class="tx-meta" id="tx-meta">Reading the queues…</span>
    <button class="tx-refresh" id="tx-refresh" title="Re-read every published queue">Refresh</button>
    <a class="tx-top-link" href="/analytics/todo.html">Whole dial →</a>
  </footer>
</main>

<script src="/js/stations-data.js"></script>
${NAV_FILL}
<script src="/js/kj-static-header.js"></script>
<script src="/js/pages/todo-index.js"></script>
</body>
</html>
`;
}

// ── write ───────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
let wrote = 0;
for (const p of PROJECTS) {
    const dest = path.join(OUT, p.file);
    const html = pageHTML(p);
    console.log('  ' + p.file.padEnd(34) + p.kind.padEnd(8) + p.lock);
    if (!DRY) { fs.writeFileSync(dest, html); wrote++; }
}
const idx = path.join(OUT, 'index.html');
if (!DRY) fs.writeFileSync(idx, indexHTML());
console.log('\n' + (DRY ? 'dry run — nothing written' : wrote + ' console page(s) + index.html written to public/todo/'));
