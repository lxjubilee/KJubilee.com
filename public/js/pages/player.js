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

  var freqEl    = document.getElementById('freq');
  var stationEl = document.getElementById('station');
  var subEl     = document.getElementById('sub');
  var onairEl   = document.getElementById('onair');
  var onairText = document.getElementById('onair-text');
  var trackEl   = document.getElementById('track');
  var dialEl    = document.getElementById('dial');
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

  /* The header's search box belongs to the station index, which is where the
     answers are. Hand the query over rather than pretending to answer it. */
  (function wireSearch() {
    var input = document.getElementById('q'), go = document.getElementById('qbtn');
    function submit() {
      var v = (input.value || '').trim();
      location.href = v ? '/?q=' + encodeURIComponent(v) : '/';
    }
    if (go) go.addEventListener('click', submit);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  })();

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

  (function buildScale() {
    var html = '';
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
        html += '<span class="tick-num" style="left:' + xOf(v) + 'px">' + Math.round(v) + '</span>';
      }
    }
    // The stations themselves, each at its own frequency and each clickable.
    LIVE.forEach(function (s, i) {
      var x = xOf(parseFloat(s.hm));
      html += '<span class="mark" data-mark="' + i + '" style="left:' + x + 'px"></span>' +
              '<button class="mark-hit" data-go="' + i + '" style="left:' + x + 'px" ' +
              'title="' + s.freq + '  ' + s.name.replace(/"/g, '&quot;') + '" ' +
              'aria-label="Tune ' + s.freq + ', ' + s.name.replace(/"/g, '&quot;') + '"></button>';
    });
    trackEl.style.width = WIDTH + 'px';
    trackEl.innerHTML = html;
  })();

  /* Slide the scale so the chosen frequency sits under the fixed needle. */
  function slideTo(hz, animate) {
    var offset = (dialEl.clientWidth / 2) - xOf(hz);
    trackEl.classList.toggle('dragging', !animate);
    trackEl.style.transform = 'translateX(' + offset + 'px)';
  }

  // ── state ───────────────────────────────────────────────────────────────
  var index = 0;

  function indexOfSlug(slug) {
    for (var i = 0; i < LIVE.length; i++) if (LIVE[i].slug === slug) return i;
    return -1;
  }

  function paint(animate) {
    var s = LIVE[index];
    var host = MEMBERS[s.host];
    freqEl.textContent = s.hm;
    stationEl.textContent = s.name;
    subEl.textContent = s.format + (host ? '  ·  ' + host.name : '');
    document.title = 'HM ' + s.hm + ' ' + s.name + ' — The Dial';

    var marks = trackEl.querySelectorAll('.mark');
    for (var i = 0; i < marks.length; i++) marks[i].classList.toggle('on', i === index);

    slideTo(parseFloat(s.hm), animate !== false);
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
    playIcon.innerHTML = sounding
      ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
    playLabel.textContent = sounding ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', sounding ? 'Pause' : 'Play');
    onairEl.classList.toggle('live', sounding);
    onairText.textContent = sounding ? 'On air' : (here && st && st.slug ? 'Paused' : 'Off');
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

  trackEl.addEventListener('click', function (e) {
    var hit = e.target.closest('[data-go]');
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
    if (i < 0) {
      var wanted = window.KJ_DEFAULT && indexOfSlug(window.KJ_DEFAULT);
      i = (wanted != null && wanted >= 0) ? wanted : 0;
    }
    index = i;
    paint(false);
    // The player mounts a moment after this page's script runs, so ask again
    // once it is there rather than showing "Off" over a playing station.
    setTimeout(paintTransport, 400);
    setTimeout(paintTransport, 1500);
  })();
})();
