(function () {
  'use strict';

  /* ── what is on the band ────────────────────────────────────────────────
     Only stations that can actually play. A dial that stops on a frequency
     carrying nothing teaches the listener that next is unreliable, which is
     the one thing this page cannot afford: next IS the interface. */
  var ALL = (window.KJ_STATIONS || []);
  var LIVE = ALL.filter(function (s) { return s.prototype && (s.tenant || s.manifest || s.stream); })
                .sort(function (a, b) { return parseFloat(a.hm) - parseFloat(b.hm); });
  var MEMBERS = (window.KJ_MEMBERS || []).reduce(function (m, x) { m[x.id] = x; return m; }, {});

  /* Module scope, because the readout writes innerHTML now (the circulation
     figure needs its own span) and station names are catalogue data. buildNav
     has its own copy from before this was shared; that one is nested in an
     IIFE and cannot be reached from here. */
  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var freqEl    = document.getElementById('freq');
  var stationEl = document.getElementById('station');
  var subEl     = document.getElementById('sub');
  var originEl  = document.getElementById('origin');
  var onairEl   = document.getElementById('onair');
  var onairText = document.getElementById('onair-text');
  var trackEl   = document.getElementById('track');
  var dialEl    = document.getElementById('dial');
  /* The unlabelled song count in the bottom-right corner. An operator's
     tracking figure: how many songs the tuned station actually carries. */
  var countEl   = document.getElementById('dial-count');
  var langEl    = document.getElementById('lang');
  var liveEl    = document.getElementById('dial-listeners');
  var playBtn   = document.getElementById('play');
  var playIcon  = document.getElementById('play-icon');
  var playLabel = document.getElementById('play-label');

  /* THE CATEGORY BAR, from the same KJ_SECTIONS every other page reads.
     None of those shelves exist on this page, so every link goes home and lands
     on the section - which is what the categories are for. kj-nav swaps the
     document underneath, so pressing one does not stop the station playing. */
  (function buildNav() {
    var SITE = window.KJ_SECTIONS || [];
    function esc(t) {
      return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function navHTML(secs) {
      return secs.map(function (sec) {
        var label = sec.navShort
          ? '<span class="nav-long">' + esc(sec.nav) + '</span>' +
            '<span class="nav-short">' + esc(sec.navShort) + '</span>'
          : esc(sec.nav);
        return '<a class="nav-link" href="/#' + esc(sec.id) + '">' + label + '</a>';
      }).join('');
    }
    var left = document.getElementById('nav'), right = document.getElementById('nav-right');
    if (left) left.innerHTML = navHTML(SITE.filter(function (x) { return x.align !== 'right'; }));
    if (right) right.innerHTML = navHTML(SITE.filter(function (x) { return x.align === 'right'; }));
  })();

  /* The header owns its own search box now — it goes to JubileeSearch from
     every page — so this no longer wires one. See app/_site-header.js. */

  if (!LIVE.length) {
    stationEl.textContent = 'The band is quiet';
    subEl.textContent = 'No station is on air yet.';
    return;
  }

  /* ── the scale ──────────────────────────────────────────────────────────
     300.00 to 400.00, the whole HM band, laid out linearly. PX_PER_HZ is the
     only number that matters: everything else — ticks, labels, station marks,
     and where the needle has to sit — is derived from it, so widening the
     scale is one edit and nothing drifts out of alignment. */
  var LO = 300, HI = 400, PX_PER_HZ = 46;
  var WIDTH = (HI - LO) * PX_PER_HZ;

  function xOf(hz) { return (hz - LO) * PX_PER_HZ; }

  /* ── THE FIVE-FOLD ZONES ────────────────────────────────────────────────
     The band is allocated in five twenty-unit blocks, one per ministry office,
     and the ranges and colours here are the ones the Band Reallocation plan
     already publishes (app/api/admin/band-plan) — same system, so the dial and
     the plan cannot disagree about where a frequency belongs.

     Drawn INSIDE the track rather than over the dial, so the colour travels
     with the scale: the zone under the needle is the zone the tuned station is
     actually in, at any scroll position. */
  var ZONES = [
    { lo: 300, hi: 320, key: 'crossing', label: 'The Crossing',    name: 'The Crossing · evangelistic' },
    { lo: 320, hi: 340, key: 'nations',  label: 'The Nations',     name: 'The Nations' },
    { lo: 340, hi: 360, key: 'upper',    label: 'The Upper Room',  name: 'The Upper Room' },
    { lo: 360, hi: 380, key: 'living',   label: 'The Living Room', name: 'The Living Room' },
    { lo: 380, hi: 400, key: 'table',    label: 'The Table',       name: 'The Table' }
  ];

  /* The block flagships, keyed by the `hm` string the catalogue carries. The
     value is a ZONES key, so a flagship's mark is painted in its own block's
     colour rather than in a colour picked for it here. */
  var FLAGSHIP_MARK = {
    '308.70': 'crossing',   // Year of Jubilee — The Crossing
    '350.00': 'upper',      // The Upper Room  — The Upper Room
  };

  (function buildScale() {
    var html = '';
    // First, so every tick and mark paints over it rather than under.
    ZONES.forEach(function (z) {
      var x = xOf(z.lo);
      html += '<span class="zone zone-' + z.key + '" style="left:' + x + 'px;width:' +
              (xOf(z.hi) - x) + 'px" title="HM ' + z.lo.toFixed(2) + '–' +
              (z.hi - 0.01).toFixed(2) + '  ' + z.name + '"></span>';
      // The office named under the start of its own colour, in that colour.
      // Deliberately tiny: this is a legend for the band, not a label for the
      // station, and at 8px it registers as "this stretch is a thing" without
      // competing with the frequency numbers a few pixels above it.
      html += '<span class="zone-label zone-' + z.key + '" style="left:' + x + 'px">' +
              z.label + '</span>';
    });
    // A tick every 0.2, taller every 1, tallest and numbered every 5. Numbering
    // every whole number would be unreadable at this scale and numbering every
    // ten would leave the eye nothing to count by.
    for (var hz = LO; hz <= HI + 0.001; hz += 0.2) {
      var v = Math.round(hz * 10) / 10;
      var whole = Math.abs(v - Math.round(v)) < 0.001;
      var five  = whole && Math.round(v) % 5 === 0;
      var cls = five ? 'tick label' : (whole ? 'tick major' : 'tick minor');
      html += '<span class="' + cls + '" style="left:' + xOf(v) + 'px"></span>';
      if (five) {
        // The first number has nothing to its left to be centred against.
        var numCls = 'tick-num' + (v === LO ? ' tick-first' : '');
        html += '<span class="' + numCls + '" style="left:' + xOf(v) + 'px">' + Math.round(v) + '</span>';
      }
    }
    // The stations themselves, each at its own frequency and each clickable.
    LIVE.forEach(function (s, i) {
      var x = xOf(parseFloat(s.hm));
      /* TWO MARKS CARRY A COLOUR, AND ONLY TWO. Every other station is the
         same white tick it has always been.

         These are the FLAGSHIPS of their blocks — HM 308.70 in The Crossing,
         HM 350.00 in The Upper Room — and the colour marks them out as the one
         station in the block rather than as a member of it. Colouring every
         mark by its block was tried and was wrong: it turned the whole scale
         into five bands of colour, which is what the bar underneath already
         says, and left nothing distinguishing the flagship at all.

         A named list, not a rule: a block gets a coloured mark when somebody
         decides it has a flagship, which is why the other three blocks have
         none. */
      var flag = FLAGSHIP_MARK[s.hm];
      html += '<span class="mark' + (flag ? ' zone-' + flag : '') +
              '" data-mark="' + i + '" style="left:' + x + 'px"></span>' +
              '<button class="mark-hit" data-go="' + i + '" style="left:' + x + 'px" ' +
              'title="' + s.freq + '  ' + s.name.replace(/"/g, '&quot;') + '" ' +
              'aria-label="Tune ' + s.freq + ', ' + s.name.replace(/"/g, '&quot;') + '"></button>';
    });
    trackEl.style.width = WIDTH + 'px';
    trackEl.innerHTML = html;
  })();

  /* ── WHERE THE SCALE IS SITTING ─────────────────────────────────────────
     Kept as a number rather than read back out of the transform. The dial is
     now dragged as well as stepped, and a drag has to know where it started
     from on every pointer move; parsing a matrix out of the computed style
     sixty times a second to find out something this file already knows would
     be both slower and a second source of truth. */
  var offsetPx = null;

  function applyOffset(px, animate) {
    offsetPx = px;
    trackEl.classList.toggle('dragging', !animate);
    trackEl.style.transform = 'translateX(' + px + 'px)';
  }

  /* Slide the scale so the chosen frequency sits under the fixed needle. */
  function slideTo(hz, animate) {
    applyOffset((dialEl.clientWidth / 2) - xOf(hz), animate);
  }

  /* ── THE DIAL AS A PHYSICAL THING ───────────────────────────────────────
     Every station's position along the scale, in the order LIVE holds them, so
     the drag can answer "which frequency is under the needle" without touching
     the DOM. The extremes are the travel limits: the scale may be pulled until
     the lowest frequency sits on the needle and no further, so there is no way
     to spin off into empty band. */
  var MARK_X = LIVE.map(function (s) { return xOf(parseFloat(s.hm)); });
  var X_MIN = Math.min.apply(null, MARK_X);
  var X_MAX = Math.max.apply(null, MARK_X);

  function clampOffset(px) {
    var c = dialEl.clientWidth / 2;
    return Math.max(c - X_MAX, Math.min(c - X_MIN, px));
  }

  /* Which station is nearest the needle at a given offset. Linear over 45
     entries — the loop is cheaper than keeping a sorted structure in step, and
     it does not assume LIVE is in frequency order. */
  function indexAtOffset(px) {
    var target = (dialEl.clientWidth / 2) - px;
    var best = 0, bestD = Infinity;
    for (var i = 0; i < MARK_X.length; i++) {
      var d = Math.abs(MARK_X[i] - target);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ── state ───────────────────────────────────────────────────────────────
  var index = 0;

  function indexOfSlug(slug) {
    for (var i = 0; i < LIVE.length; i++) if (LIVE[i].slug === slug) return i;
    return -1;
  }

  /* ── POTENTIAL OUTREACH ─────────────────────────────────────────────────
     From /js/circulation-data.js, which tools/build-circulation.js computes
     off data/circulation.json. Printed in full — 2,000,000 rather than 2M —
     because the point of the figure is its size, and an abbreviation is the
     one thing that hides it. */
  var CIRC = window.KJ_CIRCULATION || null;

  function commas(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function circulationOf(slug) {
    if (!CIRC || !CIRC.stations) return null;
    var v = CIRC.stations[slug];
    return typeof v === 'number' ? v : null;
  }

  /* ── THE OUTREACH FIGURE MOVES, ONCE A DAY ──────────────────────────────
     The ceiling is a real population: devices are bought and lost, people are
     born and people die, and a number describing that which is frozen to the
     digit for months is quietly saying the opposite of what it means. So it
     drifts by up to half a million either way — owner decision, 2026-08-28.

     DETERMINISTIC FROM THE DATE, NOT Math.random(). This matters more than it
     looks. A fresh random number per page load would change while you sat
     there, disagree between two tabs, and disagree between two people looking
     at the same page — which does not read as a living figure, it reads as a
     fabricated one. Seeding from the UTC date instead means every listener on
     earth sees the SAME number all day and a different one tomorrow, which is
     the behaviour actually being asked for.

     ANCHORED, NOT ACCUMULATING. The offset is applied to the computed base
     every day rather than to yesterday's result, so this cannot random-walk
     away from the researched figure: it stays within ±500,000 of whatever
     build-circulation.js last computed, forever.

     The number that IS the research is `CIRC.totals.worldDevice`, untouched in
     circulation-data.js — see docs/CIRCULATION-METHODOLOGY.md. This is a
     presentation drift on top of it, and nothing reads it back. */
  var DRIFT_MAX = 500000;

  function dailyDrift(base) {
    if (typeof base !== 'number' || !isFinite(base)) return base;
    var d = new Date();
    var key = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    // xorshift32 on the day key — cheap, and well spread for consecutive days,
    // which a plain modulo of the date is not.
    var h = (key ^ 0x9e3779b9) >>> 0;
    h = (h ^ (h << 13)) >>> 0;
    h = (h ^ (h >>> 17)) >>> 0;
    h = (h ^ (h << 5)) >>> 0;
    var magnitude = (h % DRIFT_MAX) + 1;              // 1..500,000 — never zero
    var sign = ((h >>> 21) & 1) ? 1 : -1;
    return base + sign * magnitude;
  }

  /* The band's own numbers, in the two top corners. Rendered once — none of it
     changes as the dial turns, because it describes the band rather than a
     station. */
  (function paintBandNumbers() {
    /* NOT `if (!CIRC) return`. Stations on air is counted from LIVE below, so
       it must still render when the circulation file is missing or has not been
       rebuilt; only the rows that genuinely come out of the research are
       conditional on it. */
    var t = (CIRC && CIRC.totals) || {};

    /* SONGS COMES FROM THE LEDGER, VIA stations-data.js.
       KJ_TOTALS.songsInLedger is the count of distinct SongIDs — one per unique
       .mp3 in the catalogue, voice scripts excluded because they carry no
       SongID — and it is rewritten every time the site data is rebuilt, which
       is part of every publish. The circulation file is kept only as a fallback
       for a page served before the next rebuild; it is the number that had been
       frozen at 7,741 while the catalogue grew underneath it. */
    var TOTALS = window.KJ_TOTALS || null;
    var songs = (TOTALS && typeof TOTALS.songsInLedger === 'number' && TOTALS.songsInLedger > 0)
      ? TOTALS.songsInLedger
      : (t.distinctSongs || t.songs);

    /* LABEL FIRST, NUMBER SECOND, numbers right-aligned in their own column.
       Reads as a list of facts about the band rather than a scoreboard, and
       the figures line up under each other however long the labels are. */
    var counts = document.getElementById('band-counts');
    if (counts) {
      /* TOWERS FIRST, STATIONS ON AIR LAST. The towers are the largest figure
         and the one that describes the reach of the whole band, so it leads;
         the number of frequencies actually sounding today is the modest one and
         closes. Towers are counted from hm-towers.json rather than typed, so
         the dial cannot claim a transmitter the map does not draw — which is
         also why the row is conditional and the order is built rather than
         written out flat. */
      var rows = [];
      if (t.towers) rows.push(['AI Radio Towers', t.towers]);
      if (songs) rows.push(['songs in the catalogue', songs]);
      /* COUNTED FROM THE DIAL, NOT FROM THE RESEARCH FILE. This is LIVE.length
         — the same list the dial turns through — so the figure cannot disagree
         with the number of frequencies this page will actually stop on, and a
         station going on air moves it with no rebuild of anything. It read from
         circulation-data.js until 2026-08-28 and had been stuck at 41 since the
         27th while the dial carried 43: a station was added, that file was not
         regenerated, and nothing reported the drift because the two numbers had
         no reason to be compared. A derived count has no such failure mode. */
      rows.push(['stations on air', LIVE.length]);
      counts.innerHTML = rows.map(function (r) {
        return '<div class="bt-row"><span class="bt-k">' + r[0] + '</span>' +
               '<span class="bt-n">' + commas(r[1]) + '</span></div>';
      }).join('');
    }

    // Every device on earth, believer or not — this band carries stations for
    // both, so a device is the only real gate.
    var reach = document.getElementById('band-reach');
    var n = t.worldDevice || t.deviceReachable;
    if (reach && n) {
      reach.innerHTML =
        '<div class="bt-row bt-total"><span class="bt-n">' + commas(dailyDrift(n)) + '</span></div>' +
        '<div class="bt-row"><span class="bt-k">potential outreach</span></div>';
    }
  })();

  /* WHERE IT BROADCASTS FROM, as one line and one list.
     `bases` is ordered and the first entry is the anchor — the tenant's own
     origin, which is why Torah Sings leads with Jerusalem rather than with the
     American relays that carry more of its listening.

     NO BRACKETS. It used to read `Miami (Los Angeles, San Antonio)`, and the
     brackets were read as a qualification — a parenthesis says "aside", and
     these are not asides: every city in the list is a base the station really
     broadcasts from, and the first is simply first. They are now a plain
     series, `Miami, Los Angeles, & San Antonio`, with the serial comma so a
     two-city list and a three-city list do not read as different KINDS of
     thing. Two cities take the ampersand alone: `Kingston & Miami`.

     A station with no bases recorded gets NOTHING here rather than a guess.
     A page that prints real cities for thirty stations must not print an
     invented one for the thirty-first. */
  function originList(cities) {
    if (cities.length === 1) return cities[0];
    if (cities.length === 2) return cities[0] + ' & ' + cities[1];
    return cities.slice(0, -1).join(', ') + ', & ' + cities[cities.length - 1];
  }

  function originHTML(s) {
    var bases = (s && s.bases) || [];
    var cities = [];
    for (var i = 0; i < bases.length; i++) {
      var c = bases[i] && bases[i].city;
      if (c && cities.indexOf(c) < 0) cities.push(c);
    }
    if (!cities.length) return '';
    return '<span class="origin-main">' + esc(originList(cities)) + '</span>';
  }

  function paint(animate, noSlide) {
    var s = LIVE[index];
    var host = MEMBERS[s.host];
    freqEl.textContent = s.hm;
    /* The language code, in the same breath as the number it belongs to. Set
       from the catalogue rather than derived here: build-home-data.js reads it
       off the tenant id, which is the only thing that can tell HM 321.50-PT
       from HM 321.90-BR — both Portuguese, different stations. */
    if (langEl) langEl.textContent = s.langCode || '';
    stationEl.textContent = s.name;
    var circ = circulationOf(s.slug);
    subEl.innerHTML = esc(s.format) + (host ? '  ·  ' + esc(host.name) : '') +
      (circ !== null
        // `(343,200,000 c.)` rather than `(Circulation: 343,200,000)`. The
        // number is the content and the word was two thirds of the width of
        // the line saying so; `c.` keeps the unit without spending the room.
        ? ' <span class="circ">(' + commas(circ) + ' c.)</span>'
        : '');
    if (originEl) originEl.innerHTML = originHTML(s);
    /* Counted from the station's own catalogue figure, which
       build-home-data.js writes from the built manifest — the same
       number the cards show, so the corner cannot disagree with the
       shelf. A station with no count prints nothing rather than a 0,
       which would read as a claim that it is empty. */
    if (countEl) {
      countEl.textContent = (typeof s.tracks === 'number' && s.tracks > 0)
        ? commas(s.tracks) : '';
    }
    document.title = 'HM ' + s.hm + ' ' + s.name + ' — The Dial';

    var marks = trackEl.querySelectorAll('.mark');
    for (var i = 0; i < marks.length; i++) marks[i].classList.toggle('on', i === index);

    /* NOT WHILE THE SCALE IS BEING DRAGGED. During a spin the track is already
       following the finger, and sliding it here as well would fight the drag
       for the same transform and jerk it back a station at a time. */
    if (!noSlide) slideTo(parseFloat(s.hm), animate !== false);
    paintTransport();
  }

  /* The transport reflects the PLAYER, never this page's own idea of itself.
     kjPlayer is the single source of truth for what is sounding, so a station
     started from the footer bar or from another tab is reported here correctly
     rather than being contradicted. */
  function paintTransport() {
    var st = (window.kjPlayer && window.kjPlayer.state) ? window.kjPlayer.state() : null;
    var here = !!(st && st.slug === LIVE[index].slug);
    var sounding = !!(st && st.playing && here);
    /* THE BUTTON DRAWS THE PRESS, NOT ONLY THE SOUND.
       kjPlayer reports `pending` from the press until the play promise settles.
       Showing the play triangle through that gap is what made the control feel
       broken and made listeners press again — and the second press used to
       restart the load. The icon therefore goes to pause the moment the press
       is accepted; `.live` below still follows real audio, so the green only
       lights when sound is actually arriving. */
    var waiting = !!(st && st.pending && st.pendingSlug === LIVE[index].slug);
    var showPause = sounding || waiting;
    playIcon.innerHTML = showPause
      ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
    playLabel.textContent = showPause ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', showPause ? 'Pause' : 'Play');
    playBtn.classList.toggle('is-pending', waiting && !sounding);
    /* THE STATION IS ON AIR WHETHER OR NOT YOU ARE LISTENING.
       This used to read "Paused" when the player was paused, which said
       something false about the broadcast — the station keeps transmitting on
       its schedule whatever this browser is doing. Every station on this dial
       is on air by definition (LIVE only holds stations with a catalogue), so
       the WORDS never change; the COLOUR carries whether you are hearing it
       right now, the same green the transport uses. */
    onairEl.classList.toggle('live', sounding);
    onairText.textContent = 'On air';
  }

  function tune(i, andPlay) {
    index = (i + LIVE.length) % LIVE.length;
    paint(true);
    if (andPlay && window.kjPlayer) window.kjPlayer.play(LIVE[index].slug);
  }

  // ── controls ────────────────────────────────────────────────────────────
  //
  // NEXT PLAYS. That is the whole proposition of the page: stepping the dial
  // without hearing anything would make this a list with extra steps.
  document.getElementById('next').addEventListener('click', function () { tune(index + 1, true); });
  document.getElementById('prev').addEventListener('click', function () { tune(index - 1, true); });

  playBtn.addEventListener('click', function () {
    if (!window.kjPlayer) return;
    // toggle() pauses the station it is already on and switches to any other,
    // which is exactly the behaviour a play button on a tuner should have.
    window.kjPlayer.toggle(LIVE[index].slug);
  });

  /* ══ SPINNING THE DIAL ══════════════════════════════════════════════════
   *
   * Next and previous were the only way across the band, and with forty-five
   * stations on it that is forty-four presses to get from one end to the
   * other — each one of which TUNED, so it also started loading a station
   * nobody wanted to hear. The complaint was that it was slow, and it was:
   * the slowness was mostly audio being fetched for frequencies the listener
   * was only passing through.
   *
   * So the scale can be grabbed and thrown, the way the tuning wheel on a
   * physical radio can. Three things make it feel like one rather than like a
   * scrollbar:
   *
   *   NOTHING PLAYS WHILE IT IS MOVING. Passing a frequency shows it — the
   *   name, the format, the mark under the needle lighting up — and loads
   *   nothing. That is the whole performance fix, and it is also just true to
   *   the object: you do not hear a station on a real dial until you stop on
   *   one.
   *
   *   IT KEEPS GOING WHEN LET GO. A flick carries, decays, and comes to rest;
   *   a slow drag stops where it is put. Same gesture as a scroll view, which
   *   is the vocabulary a phone already teaches.
   *
   *   IT LANDS ON A STATION. Wherever it stops, the nearest frequency slides
   *   under the needle and THEN plays. The dial never rests between two
   *   stations, so letting go is always a decision.
   */
  var drag = null;
  var spinRAF = null;
  var suppressClick = false;

  /* ONE CLOCK, CHOSEN ONCE.
     This read `e.timeStamp || Date.now()`, which are not the same kind of
     number: a DOMHighResTimeStamp counts milliseconds since the page loaded
     (a few thousand), Date.now() counts them since 1970 (about 1.7e12). Any
     event that arrived without a usable timeStamp switched bases mid-gesture
     and produced a velocity around a billion px/ms, or — when the two samples
     landed the other way round — exactly zero, which is how it was caught:
     synthesised touch input carries no useful timeStamp, momentum silently
     never engaged, and a flick on a phone stopped dead where the finger did. */
  var clock = (window.performance && window.performance.now)
    ? function () { return window.performance.now(); }
    : function () { return Date.now(); };

  function stopSpin() {
    if (spinRAF) { cancelAnimationFrame(spinRAF); spinRAF = null; }
  }

  /* The readout follows the needle while the scale moves. Deliberately NOT
     tune(): this changes what the page SAYS, never what it plays. */
  function preview(i) {
    if (i === index) return;
    index = i;
    paint(false, true);
    /* A phone has no cursor to show it crossed something, so the crossing is
       given a tick it can feel. Guarded and tiny — a long buzz on every mark
       of a fast spin would be unbearable. */
    if (navigator.vibrate) { try { navigator.vibrate(5); } catch (e) {} }
  }

  /* Come to rest ON a frequency, then play it. The one place in the whole
     gesture that starts audio. */
  function settle() {
    stopSpin();
    tune(indexAtOffset(offsetPx), true);
  }

  /* Momentum, in pixels per millisecond, bled off at a fixed proportion per
     millisecond so the deceleration does not change with frame rate — a
     per-FRAME decay would coast twice as far on a 120Hz phone as on a 60Hz
     laptop, from the identical flick. */
  function spin(v) {
    var last = null;
    if (Math.abs(v) < 0.02) { settle(); return; }
    spinRAF = requestAnimationFrame(function frame(now) {
      if (last === null) last = now;
      var dt = Math.min(48, now - last);       // a tab that was backgrounded
      last = now;                              // must not teleport the dial
      v *= Math.pow(0.994, dt);
      var next = clampOffset(offsetPx + v * dt);
      // Stopped, or run into the end of the band: either way, land.
      if (Math.abs(v) < 0.02 || next === offsetPx) { settle(); return; }
      applyOffset(next, false);
      preview(indexAtOffset(offsetPx));
      spinRAF = requestAnimationFrame(frame);
    });
  }

  dialEl.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    stopSpin();
    // The first grab may land before anything has positioned the scale.
    if (offsetPx === null) slideTo(parseFloat(LIVE[index].hm), false);
    drag = {
      id: e.pointerId, startX: e.clientX, startOffset: offsetPx,
      lastX: e.clientX, lastT: clock(), v: 0, moved: 0,
    };
    /* Capture, so a finger that leaves the dial mid-throw is still ours. A
       drag that ends over the header used to simply stop reporting. */
    try { dialEl.setPointerCapture(e.pointerId); } catch (err) {}
    dialEl.classList.add('grabbing');
  });

  dialEl.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.startX;
    if (Math.abs(dx) > drag.moved) drag.moved = Math.abs(dx);

    var t = clock();
    var dt = t - drag.lastT;
    if (dt > 0) {
      /* Smoothed, because a single pointer sample is noisy and the last one
         before release is the noisiest of all — an unsmoothed reading turns a
         steady drag that happened to jitter on the final frame into a launch
         across the band. */
      drag.v = drag.v * 0.7 + ((e.clientX - drag.lastX) / dt) * 0.3;
      drag.lastX = e.clientX;
      drag.lastT = t;
    }

    applyOffset(clampOffset(drag.startOffset + dx), false);
    preview(indexAtOffset(offsetPx));
    e.preventDefault();
  });

  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag;
    drag = null;
    dialEl.classList.remove('grabbing');
    try { dialEl.releasePointerCapture(d.id); } catch (err) {}
    /* A drag that finished over a station's hit target must not ALSO be read
       as a click on it: the click would tune somewhere else entirely, since
       the scale has moved under the finger since it went down. A few pixels of
       travel is a press with a shaky hand, not a drag. */
    suppressClick = d.moved > 6;
    spin(d.v);
  }

  dialEl.addEventListener('pointerup', endDrag);
  dialEl.addEventListener('pointercancel', endDrag);

  /* The needle is the middle of the window, so the resting offset depends on
     how wide that window is. Without this, a rotated phone keeps the old
     centre and every station sits off the needle until the next tune. */
  window.addEventListener('resize', function () {
    if (drag || spinRAF) return;
    slideTo(parseFloat(LIVE[index].hm), false);
  });

  trackEl.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; }
    // Guarded the way every other delegated handler on the site is: an event
    // target is not guaranteed to carry closest(), and an exception thrown in
    // here would take the whole track-list click handler down with it.
    var hit = e.target && e.target.closest ? e.target.closest('[data-go]') : null;
    if (hit) tune(parseInt(hit.getAttribute('data-go'), 10), true);
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); tune(index + 1, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); tune(index - 1, true); }
    else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); playBtn.click(); }
  });

  /* The bar broadcasts every change of state; this listens rather than polls,
     so pressing play in the footer updates the dial and vice versa. */
  window.addEventListener('kj-player-state', function () {
    var st = (window.kjPlayer && window.kjPlayer.state) ? window.kjPlayer.state() : null;
    if (st && st.slug) {
      var i = indexOfSlug(st.slug);
      // Follow the player onto a station this page did not choose - but only
      // when that station is on the dial at all.
      if (i >= 0 && i !== index) { index = i; paint(true); return; }
    }
    paintTransport();
  });

  /* AND A POLL, because the event alone is not enough.
     Two things call themselves "playing" and they change at different moments:
     kjPlayer.state().playing reads !audio.paused, which flips the instant play()
     is called, while the kj-player-state event is dispatched only once the play
     PROMISE resolves — which can be a second later, or never if the stream
     stalls. Listening only for the event left this page showing "Paused" over a
     station that was audibly playing.
     So the event keeps the response instant and the poll keeps it honest. Twice
     a second against an in-memory object costs nothing, and kj-nav clears the
     interval when the page is left. */
  setInterval(paintTransport, 500);

  /* ── who else is on this frequency ──────────────────────────────────────
     kj-presence.js does the talking; this only draws what came back. It stays
     EMPTY until the first reply lands, because a listener count that guesses
     is worse than no listener count — which is also why there is no "0"
     placeholder in the markup. */
  function paintListeners(p) {
    if (!liveEl || !p) return;
    liveEl.innerHTML = '<span class="n">' + p.here + '</span>'
                     + '<span class="sep">/</span>'
                     + '<span class="n">' + p.total + '</span>'
                     + '<span class="lbl">LISTENING</span>';
    liveEl.setAttribute('aria-label',
      p.here + ' listening to this station, ' + p.total + ' across the dial');
  }
  window.addEventListener('kj-presence', function (e) { paintListeners(e.detail); });
  // The event may already have fired before this page's script ran.
  if (window.KJ_PRESENCE) paintListeners(window.KJ_PRESENCE);

  window.addEventListener('resize', function () { slideTo(parseFloat(LIVE[index].hm), false); });

  // ── open where the listener already is ──────────────────────────────────
  //
  // If something is playing, the dial opens on it. Landing on the flagship
  // while a different station is audible would be the page contradicting the
  // room.
  /* ── ?hm=308.70 ─────────────────────────────────────────────────────────
     Where kjubilee.com/hm308.70 lands, via the redirect in middleware.js.

     Resolved against ALL rather than LIVE, because the two answers a visitor
     can get are different in kind and only one of them is an error. A
     frequency that is assigned but still in build is not a broken link — it
     is a real station that has not signed on — and sending that person to the
     flagship with no explanation would read as the site losing their click.
     So it is named, and the dial parks on the nearest frequency that can
     actually play, which leaves next and prev meaningful from there.       */
  function requestedHm() {
    try {
      var q = new URLSearchParams(location.search).get('hm');
      if (!q) return null;
      var n = parseFloat(q);
      return isNaN(n) ? null : n;
    } catch (e) { return null; }
  }

  function nearestLiveTo(hz) {
    var best = 0, gap = Infinity;
    for (var i = 0; i < LIVE.length; i++) {
      var d = Math.abs(parseFloat(LIVE[i].hm) - hz);
      if (d < gap) { gap = d; best = i; }
    }
    return best;
  }

  /* Said once, under the readout, and only when the frequency asked for is
     not the one now under the needle. */
  function sayNotOnAir(station) {
    var note = document.createElement('p');
    note.className = 'dial-note';
    note.innerHTML =
      '<strong>HM ' + station.hm + ' ' + station.name.replace(/</g, '&lt;') + '</strong> ' +
      'is assigned but not on air yet. ' +
      '<a href="/#station/' + encodeURIComponent(station.slug) + '">Read about it</a> — ' +
      'the dial below is on the nearest frequency that is playing.';
    if (subEl && subEl.parentNode) subEl.parentNode.insertBefore(note, subEl.nextSibling);
  }

  /* NOTHING REMEMBERED, SO THE FLAGSHIP — HM 308.70 Year of Jubilee. A first
     visit, or any visit with the storage cleared, opens there rather than on
     whichever frequency happens to sit lowest on the dial.

     Slug first: window.KJ_DEFAULT is emitted by the catalogue generator from
     the same FLAGSHIP constant the shelves order themselves by, so this file
     never carries its own copy of the roster. Then the FREQUENCY, which is the
     step that matters — 308.70 is the identity a listener knows and it is what
     keeps this promise through a re-slug, a rename nobody would think to come
     and check this line for. Index 0 only if the flagship is off air entirely,
     because a silent dial would be worse than the wrong station. */
  var FLAGSHIP_HM = 308.70;

  function flagshipIndex() {
    var bySlug = window.KJ_DEFAULT ? indexOfSlug(window.KJ_DEFAULT) : -1;
    if (bySlug >= 0) return bySlug;
    for (var k = 0; k < LIVE.length; k++) {
      if (Math.abs(parseFloat(LIVE[k].hm) - FLAGSHIP_HM) < 0.005) return k;
    }
    return 0;
  }

  (function start() {
    var hz = requestedHm();
    var asked = null;
    if (hz !== null) {
      for (var k = 0; k < ALL.length; k++) {
        if (Math.abs(parseFloat(ALL[k].hm) - hz) < 0.005) { asked = ALL[k]; break; }
      }
    }

    // A frequency that can play wins outright — including over whatever the
    // footer bar happens to be sounding, because the visitor just asked for
    // this one by name and the URL is the more recent instruction.
    if (asked) {
      var live = indexOfSlug(asked.slug);
      if (live >= 0) {
        index = live;
        paint(false);
        if (window.kjPlayer) window.kjPlayer.play(asked.slug);
        setTimeout(paintTransport, 400);
        setTimeout(paintTransport, 1500);
        return;
      }
      index = nearestLiveTo(parseFloat(asked.hm));
      paint(false);
      sayNotOnAir(asked);
      setTimeout(paintTransport, 400);
      setTimeout(paintTransport, 1500);
      return;
    }

    var st = (window.kjPlayer && window.kjPlayer.state) ? window.kjPlayer.state() : null;
    var i = st && st.slug ? indexOfSlug(st.slug) : -1;
    if (i < 0) i = flagshipIndex();
    index = i;
    paint(false);
    // The player mounts a moment after this page's script runs, so ask again
    // once it is there rather than showing "Off" over a playing station.
    setTimeout(paintTransport, 400);
    setTimeout(paintTransport, 1500);
  })();
})();
