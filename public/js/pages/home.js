(function () {
  'use strict';

  var STATIONS = window.KJ_STATIONS || [];
  var MEMBERS  = window.KJ_MEMBERS  || [];
  var SECTIONS = window.KJ_SECTIONS || [];
  var FEATURED = window.KJ_FEATURED || [];

  var bySlug   = {};
  STATIONS.forEach(function (s) { bySlug[s.slug] = s; });
  var byMember = {};
  MEMBERS.forEach(function (m) { byMember[m.id] = m; });

  var view    = document.getElementById('view');
  var nav     = document.getElementById('nav');
  var scroll  = document.getElementById('scroll');
  var input   = document.getElementById('q');

  /* COVER CACHE VERSION. Appended to every station cover URL.

     Cloudflare caches by full URL INCLUDING the query string, and it caches
     404s: checking /cdn/stations/jubilee-ccm.webp before that station had been
     rendered put a 404 at the edge with a four-hour max-age, so uploading the
     real file changed nothing a visitor could see. Bumping this string is a
     new cache key, which misses at the edge and goes to origin.

     BUMP IT whenever covers are regenerated and re-uploaded. It costs every
     visitor one re-fetch of the covers actually on their screen, which is the
     cheap half of the trade against serving a stale or missing picture. */
  var COVER_V = '20260825a';

  var heroTimer = null;
  var currentSection = 'home';   // where "All stations" goes back to
  var painted = false;           // has a section been rendered into <main> yet

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function gradVars(st) { return '--g1:' + st.gradient[0] + ';--g2:' + st.gradient[1]; }

  /* -------------------------------------------------------------------- */
  /* Nav                                                                   */
  /* -------------------------------------------------------------------- */
  var navRight = document.getElementById('nav-right');
  function navHTML(secs) {
    return secs.map(function (sec) {
      // A section may carry a short label for narrow screens; the long one is
      // hidden by CSS rather than by measuring, so there is no layout thrash.
      var label = sec.navShort
        ? '<span class="nav-long">' + esc(sec.nav) + '</span>' +
          '<span class="nav-short">' + esc(sec.navShort) + '</span>'
        : esc(sec.nav);
      return '<button class="nav-link" data-section="' + sec.id + '">' + label + '</button>';
    }).join('');
  }
  /* A section marked align:'right' sits on the far side of the category bar. */
  nav.innerHTML = navHTML(SECTIONS.filter(function (s) { return s.align !== 'right'; }));
  navRight.innerHTML = navHTML(SECTIONS.filter(function (s) { return s.align === 'right'; }));
  function allNavLinks() { return document.querySelectorAll('.nav-link'); }

  /* -------------------------------------------------------------------- */
  /* Cards                                                                 */
  /* -------------------------------------------------------------------- */
  function cardHTML(st, wide) {
    var host = byMember[st.host];
    return '' +
      '<button class="card' + (wide ? ' wide' : '') + '" data-slug="' + st.slug + '">' +
        '<div class="card-cover">' +
          '<div class="ident" style="' + gradVars(st) + '"></div>' +
          // No inline onload/onerror: those need nested quotes inside a
          // single-quoted JS string and one bad escape takes out the whole
          // script. A delegated capture-phase listener does the same job once
          // for every cover on the page. See coverArtWatch below.
          '<img class="cover-art" alt="" loading="lazy" decoding="async"' +
            ' src="/cdn/stations/' + encodeURIComponent(st.slug) + '.webp?v=' + COVER_V + '"' +
            '>' +
          '<div class="cover-scrim"></div>' +
          (st.region !== 'domestic'
            ? '<img class="cover-flag" src="https://flagcdn.com/w80/' + st.flag + '.png" alt="" loading="lazy">'
            : '') +
          (st.prototype
            ? '<span class="cover-live" data-kj-play="' + st.slug + '" role="button" tabindex="0" ' +
              'title="Play ' + esc(st.name) + (st.tracks ? ' — ' + st.tracks + ' songs' : '') + '">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7z"></path></svg>On air</span>'
            : '<span class="cover-soon" title="This frequency is assigned; its catalog is still being built">Coming soon</span>') +
          '<span class="cover-freq">' + esc(st.freq) + '</span>' +
        '</div>' +
        '<div class="card-body">' +
          '<span class="body-freq" aria-hidden="true">' + esc(st.hm) + '</span>' +
          '<span class="card-category">' + esc(st.format) + '</span>' +
          '<h3 class="card-title">' + esc(st.name) + '</h3>' +
          '<p class="card-blurb">' + esc(st.description) + '</p>' +
          '<div class="card-meta">' +
            '<span class="card-pill">' + esc(st.pill) + '</span>' +
            '<span class="card-member">' + esc(host ? host.short : '') + '</span>' +
          '</div>' +
        '</div>' +
      '</button>';
  }

  /* Covers fade in when they decode, and REMOVE themselves if they 404 so the
     ident gradient underneath shows through. A broken <img> would otherwise
     paint its own alt box over the gradient, which looks worse than the
     gradient alone.

     Capture phase and document level, because `error` and `load` do not bubble:
     one listener then covers every card the page ever renders, including the
     ones drawn after a filter or a tab switch. */
  document.addEventListener('load', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('cover-art')) t.classList.add('on');
  }, true);
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('cover-art')) t.remove();
  }, true);

  /* ONE WIDE CARD PER ROW OF FIVE, walking across the grid.
     Lifted from InspireManna's Shelf.js, and the indexes are not arbitrary:
     marking 0, 6 and 11 of every twelve-card block tiles EXACTLY into three
     rows of five, because a wide card costs two columns and 12 cards + 3
     extra columns = 15 = 3 x 5. The wide one lands on columns 1-2, then 3-4,
     then 4-5, so the rhythm reads as varied rather than as a stripe down one
     side. Change these numbers and the last row of every block goes ragged. */
  function isWide(i) { var m = i % 12; return m === 0 || m === 6 || m === 11; }

  /* A flat shelf drops the heading and count so a page built from one shelf
     reads as a single continuous grid rather than a titled section. */
  function shelfHTML(title, slugs, flat) {
    var cards = slugs.map(function (slug) { return bySlug[slug]; }).filter(Boolean);
    if (!cards.length) return '';
    return '' +
      '<section class="shelf">' +
        (flat ? '' :
          '<div class="shelf-head">' +
            '<h2>' + esc(title) + '</h2>' +
            '<span class="shelf-count">' + cards.length + ' station' + (cards.length === 1 ? '' : 's') + '</span>' +
          '</div>') +
        '<div class="row">' + cards.map(function (st, i) { return cardHTML(st, isWide(i)); }).join('') + '</div>' +
      '</section>';
  }

  /* -------------------------------------------------------------------- */
  /* Articles (the HM band explainer)                                      */
  /* -------------------------------------------------------------------- */
  function articlesHTML(items) {
    if (!items || !items.length) return '';
    return '<div class="articles">' + items.map(function (a) {
      return '<article class="article' + (a.live ? ' is-live' : '') + '">' +
        (a.kicker ? '<span class="article-kicker">' + esc(a.kicker) + '</span>' : '') +
        '<h2>' + esc(a.title) + '</h2>' +
        '<div class="article-body">' +
          a.body.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
        '</div>' +
      '</article>';
    }).join('') + '</div>';
  }

  /* -------------------------------------------------------------------- */
  /* Hero carousel (home only)                                             */
  /* -------------------------------------------------------------------- */
  function heroHTML() {
    var picks = FEATURED.map(function (slug) { return bySlug[slug]; }).filter(Boolean);
    if (!picks.length) return '';
    var shots = picks.map(function (st, i) {
      // The cover goes FIRST so the frequency watermark after it paints on top,
      // and it carries the same .cover-art class as the tiles: one rule for the
      // fade-in, one for the top anchoring, and the same listener removes it on
      // a 404 so the ident gradient underneath becomes the fallback.
      //
      // The first slide loads EAGERLY. It is the largest thing above the fold,
      // so lazy-loading it would hand the page its own LCP as a late repaint.
      return '<div class="hero-shot ident' + (i === 0 ? ' is-live' : '') + '" style="' + gradVars(st) + '" aria-hidden="true">' +
             '<img class="cover-art hero-art" alt="" decoding="async" loading="' + (i === 0 ? 'eager' : 'lazy') + '"' +
               ' src="/cdn/stations/' + encodeURIComponent(st.slug) + '.webp?v=' + COVER_V + '">' +
             '<span class="ident-freq"><span class="ident-freq-hm">HM</span> ' +
             esc(st.hm) + '</span></div>';
    }).join('');
    var dots = picks.map(function (st, i) {
      return '<button class="hero-dot' + (i === 0 ? ' is-live' : '') + '" data-i="' + i + '" aria-label="' + esc(st.name) + '"></button>';
    }).join('');
    return '' +
      '<section class="hero" aria-roledescription="carousel" aria-label="Featured stations">' +
        shots +
        '<div class="hero-scrim"></div>' +
        '<div class="hero-content" id="hero-content"></div>' +
        '<button class="hero-arrow prev" aria-label="Previous station">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 6-6 6 6 6"></path></svg>' +
        '</button>' +
        '<button class="hero-arrow next" aria-label="Next station">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m9 6 6 6-6 6"></path></svg>' +
        '</button>' +
        '<div class="hero-dots">' + dots + '</div>' +
      '</section>';
  }

  var HERO_PLAY  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5z"></path></svg>';
  var HERO_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"></path></svg>';

  /**
   * The hero's button says what pressing it WILL DO.
   *
   * "Listen now" while the station is already sounding is a lie the visitor has
   * to test by clicking, so it reads "Pause now" instead once it is the station
   * on the bar. It follows the player rather than remembering its own state:
   * pausing from the footer, or another card taking the bar over, both have to
   * change this button, and both arrive as kj-player-state.
   */
  function paintHeroTransport() {
    var btn = document.querySelector('.hero-actions [data-kj-toggle]');
    if (!btn) return;
    var slug = btn.getAttribute('data-kj-toggle');
    var st = bySlug[slug];
    var sp = window.kjPlayer && window.kjPlayer.state ? window.kjPlayer.state() : null;
    var sounding = !!(sp && sp.playing && sp.slug === slug);
    // A station with no programming cannot be played, let alone paused.
    var label = (!st || !st.prototype) ? 'Tune in' : (sounding ? 'Pause now' : 'Listen now');
    btn.innerHTML = (sounding ? HERO_PAUSE : HERO_PLAY) + '<span>' + esc(label) + '</span>';
    btn.setAttribute('aria-pressed', sounding ? 'true' : 'false');
    btn.title = label + (st ? ' — ' + st.name : '');
  }
  window.addEventListener('kj-player-state', paintHeroTransport);

  function paintHero(i) {
    var picks = FEATURED.map(function (slug) { return bySlug[slug]; }).filter(Boolean);
    var st = picks[i];
    if (!st) return;
    var host = byMember[st.host];
    var box = document.getElementById('hero-content');
    if (!box) return;

    box.innerHTML = '' +
      '<span class="hero-eyebrow">Featured · ' + esc(st.format) + '</span>' +
      '<h2 class="hero-title"><button data-slug="' + st.slug + '">' + esc(st.name) + '</button></h2>' +
      '<span class="hero-freq">' + esc(st.freq) + '</span>' +
      (host
        ? '<div class="hero-by">' +
            '<img class="hero-face" src="' + esc(host.image) + '" alt="" width="34" height="34">' +
            '<span class="hero-by-name">' + esc(host.short) + '</span>' +
            '<span class="hero-by-focus">' + esc(host.focus) + '</span>' +
          '</div>'
        : '') +
      '<p class="hero-blurb">' + esc(st.description) + '</p>' +
      '<div class="hero-actions">' +
        // TUNES THE FOOTER PLAYER, it does not navigate. This used to be an
        // <a href="/radio?station=...">, which threw the visitor out of the
        // page they were on and into the standalone player. Every one of the
        // 102 stations carries a stream or a manifest, so the footer can play
        // all of them; data-kj-play is the delegated hook kj-footer-player.js
        // already listens for on the document.
        // data-kj-toggle, not data-kj-play: this is a transport control, so it
        // has to pause the station it is currently announcing. paintHeroTransport
        // below keeps its face honest — the label states what pressing it does,
        // and the footer bar can change that without the hero being touched.
        '<button type="button" class="btn-accent" data-kj-toggle="' + esc(st.slug) + '"></button>' +
        '<span class="hero-tag">' + esc(st.listeners) + '</span>' +
        '<span class="hero-meta">Reach ' + esc(st.reach) + '</span>' +
      '</div>';

    // The transport button is rendered empty above and filled here, so the
    // slide always opens showing the right face — a station already playing
    // must not flash "Listen now" as its slide comes round.
    paintHeroTransport();

    var shots = view.querySelectorAll('.hero-shot');
    var dots  = view.querySelectorAll('.hero-dot');
    for (var k = 0; k < shots.length; k++) shots[k].classList.toggle('is-live', k === i);
    for (var d = 0; d < dots.length; d++) dots[d].classList.toggle('is-live', d === i);
    paintHero.index = i;
  }

  function startHero() {
    stopHero();
    var n = FEATURED.length;
    if (n < 2) return;
    heroTimer = setInterval(function () {
      paintHero(((paintHero.index || 0) + 1) % n);
    }, 8000);
  }
  function stopHero() { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; } }

  /* -------------------------------------------------------------------- */
  /* Member strip (Inspire Family)                                         */
  /* -------------------------------------------------------------------- */
  function membersHTML() {
    return '<div class="members">' + MEMBERS.map(function (m) {
      var n = STATIONS.filter(function (s) { return s.host === m.id; }).length;
      return '<button class="member' + (m.id === 'nova' ? ' is-lead' : '') + '" data-member="' + m.id + '">' +
        '<img src="' + esc(m.image) + '" alt="" loading="lazy" width="76" height="76">' +
        '<div class="member-name">' + esc(m.short) + '</div>' +
        '<div class="member-focus">' + esc(m.focus) + '</div>' +
        '<div class="member-count">' + n + ' station' + (n === 1 ? '' : 's') + '</div>' +
      '</button>';
    }).join('') + '</div>';
  }

  /* -------------------------------------------------------------------- */
  /* Section rendering                                                     */
  /* -------------------------------------------------------------------- */
  function renderSection(id) {
    var sec = SECTIONS.filter(function (s) { return s.id === id; })[0] || SECTIONS[0];
    stopHero();

    var html = '';
    if (sec.id === 'home') {
      html += heroHTML();
    } else if (sec.intro !== false) {
      // A section can opt out of the heading + blurb entirely; the active nav
      // item already names the category, so a pure card grid needs nothing else.
      html += '<div class="section-intro"><h1>' + esc(sec.label) + '</h1><p>' + esc(sec.blurb) + '</p></div>';
    }
    if (sec.members) html += membersHTML();
    if (sec.articles) html += articlesHTML(sec.articles);
    html += (sec.shelves || []).map(function (sh) { return shelfHTML(sh.title, sh.stations, sh.flat); }).join('');

    view.innerHTML = html;
    scroll.scrollTop = 0;

    if (sec.id === 'home') { paintHero(0); startHero(); }

    var links = allNavLinks();   // both sides of the bar
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('is-active', links[i].dataset.section === sec.id);
    }
    currentSection = sec.id;
    painted = true;
  }

  /* -------------------------------------------------------------------- */
  /* Search                                                                */
  /* -------------------------------------------------------------------- */
  function renderSearch(term) {
    stopHero();
    var q = term.trim().toLowerCase();
    var hits = STATIONS.filter(function (s) {
      return (s.name + ' ' + s.freq + ' ' + s.format + ' ' + s.lang + ' ' + s.description).toLowerCase().indexOf(q) >= 0;
    });
    view.innerHTML =
      '<div class="section-intro"><h1>Search</h1><p>' + hits.length +
      ' station' + (hits.length === 1 ? '' : 's') + ' matching &ldquo;' + esc(term) + '&rdquo;.</p></div>' +
      (hits.length
        ? shelfHTML('Results', hits.map(function (s) { return s.slug; }))
        : '<div class="empty">Nothing on the dial matches <strong>' + esc(term) + '</strong> yet.</div>');
    scroll.scrollTop = 0;
    for (var i = 0, l = allNavLinks(); i < l.length; i++) l[i].classList.remove('is-active');
  }

  function renderMember(id) {
    var m = byMember[id];
    if (!m) return;
    stopHero();
    var slugs = STATIONS.filter(function (s) { return s.host === id; }).map(function (s) { return s.slug; });
    view.innerHTML =
      '<div class="section-intro"><h1>' + esc(m.name) + '</h1><p>' + esc(m.focus) +
      ' — ' + slugs.length + ' station' + (slugs.length === 1 ? '' : 's') + ' on the HM dial.</p></div>' +
      membersHTML() +
      shelfHTML('Hosted by ' + m.short, slugs);
    scroll.scrollTop = 0;
  }

  /* -------------------------------------------------------------------- */
  /* Station article                                                       */
  /* -------------------------------------------------------------------- */
  /* -------------------------------------------------------------------- */
  /* The station article                                                    */
  /* -------------------------------------------------------------------- */
  /*
   * A PAGE PER STATION, on the InspireManna article template.
   *
   * What was here before was a modal: a panel over a dimmed shelf carrying the
   * station's name, its one-line blurb, a table of seven facts and a play
   * button. Everything in it was already on the card the reader had just
   * clicked, which is why it read as an interruption rather than a
   * destination — and a dialog is not somewhere anyone settles in to read.
   *
   * The template it now follows is the one InspireManna uses for a message:
   * full-bleed hero carrying the meta row and the headline over a gradient,
   * a prose column with a sticky sidebar, a callout for the line the piece
   * rests on, a byline, a closing call to act, and the rest of the catalogue
   * underneath. The writing comes from station-articles.js; everything
   * countable — tracks, reach, what is playing right now — is rendered here
   * from the catalogue, so the prose never has to be updated to stay true.
   *
   * It renders into the same scroll view the shelves use. That keeps the URL
   * (#station/<slug>), keeps the back button honest, and above all keeps the
   * audio: a real page load would destroy the footer player and the sound
   * with it.
   */
  var ARTICLES = window.KJ_ARTICLES || {};

  function bandName(st) {
    return st.band === 'fivefold' ? 'Five-Fold Ministry'
         : st.band === 'multi'    ? 'International'
         : 'Mainstream';
  }

  /* The facts worth printing, and only the ones that are true of this station.
     A placeholder has no track count worth showing and an international
     station's format IS its language, so neither is printed twice. */
  function stationFacts(st) {
    var rows = [
      ['Frequency', st.freq],
      ['Format', st.format],
      ['Band', bandName(st)],
      ['Language', st.lang],
      ['Songs in rotation', st.tracks ? st.tracks.toLocaleString() : null],
      ['Projected reach', st.reach],
      ['Status', st.prototype ? 'On air' : 'In build']
    ];
    return rows.filter(function (r) {
      if (!r[1]) return false;
      if (r[0] === 'Language' && r[1] === st.format) return false;
      return true;
    });
  }

  function articleFor(st) {
    var a = ARTICLES[st.slug];
    if (a) return a;
    // No entry written yet: fall back to the catalogue's own words rather than
    // rendering an empty page. The sidebar and the hero carry the rest.
    return {
      need: null,
      stands: null,
      sections: [{ h: 'About this station', p: [st.description] }]
    };
  }

  function renderArticle(slug) {
    var st = bySlug[slug];
    if (!st) { go('home'); return; }
    var host = byMember[st.host];
    var art  = articleFor(st);
    var live = !!st.prototype;

    var body = '';
    // The catalogue's own description leads, as the standfirst — it is the
    // sentence the station was defined by, and the written sections elaborate
    // rather than repeat it.
    body += '<p class="kja-lead">' + esc(st.description) + '</p>';
    (art.sections || []).forEach(function (sec) {
      if (sec.h) body += '<h2>' + esc(sec.h) + '</h2>';
      (sec.p || []).forEach(function (par) { body += '<p>' + esc(par) + '</p>'; });
    });

    var facts = stationFacts(st).map(function (f) {
      return '<dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd>';
    }).join('');

    var sched = (st.schedule || []).map(function (row) {
      return '<li><time>' + esc(row.time) + '</time><span>' + esc(row.show) + '</span></li>';
    }).join('');

    /* Everything else on the dial that can actually be listened to, most
       featured first, minus this one.
       TEN, which is two whole rows of the five-wide grid. The count is capped
       to a multiple of five on purpose: a last row of two under three empty
       columns reads as a loading failure rather than the end of a list. Ten
       rather than fifteen because only fifteen stations are on air at all, so
       there are fourteen others to draw from and three rows cannot be filled
       honestly - and this row shows what plays, not what is assigned. */
    var more = STATIONS.filter(function (x) { return x.slug !== st.slug && x.prototype; })
                       .slice(0, 10)
    /* NOT .map(cardHTML). map passes (item, index, array), and cardHTML's
       second parameter is `wide` - so every card except the first got a truthy
       index and rendered double width, spanning two columns of the five. The
       grid was correct all along; the cards were lying about their size. */
                       .map(function (x) { return cardHTML(x); }).join('');

    view.innerHTML = '' +
      '<article class="kja">' +
        '<section class="kja-hero">' +
          '<div class="kja-hero-art ident" style="' + gradVars(st) + '" aria-hidden="true">' +
            '<img class="cover-art kja-hero-photo" alt="" decoding="async"' +
              ' src="/cdn/stations/' + encodeURIComponent(st.slug) + '.webp?v=' + COVER_V + '">' +
            '<span class="kja-hero-sheen"></span>' +
            '<span class="ident-freq"><span class="ident-freq-hm">HM</span> ' + esc(st.hm) + '</span>' +
          '</div>' +
          '<button class="kja-back" type="button" data-article-back>' +
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"></path></svg>' +
            'All stations' +
          '</button>' +
          '<div class="kja-hero-overlay"><div class="kja-hero-inner">' +
            '<div class="kja-meta">' +
              '<span class="kja-tab">' + esc(st.format) + '</span>' +
              (host ? '<button type="button" class="kja-tab kja-tab-link" data-member="' + esc(host.id) + '">' + esc(host.short) + '</button>' : '') +
              '<span class="kja-meta-plain">' + esc(st.freq) + ' · ' + esc(bandName(st)) + '</span>' +
            '</div>' +
            '<h1 class="kja-title">' + esc(st.name) + '</h1>' +
            (art.need
              ? '<p class="kja-need"><span class="kja-need-label">For this: </span>' + esc(art.need) + '</p>'
              : '') +
          '</div></div>' +
        '</section>' +

        '<div class="kja-container">' +
          '<div class="kja-main">' +
            (live ? '' :
              '<aside class="kja-banner"><strong>Not on air yet.</strong> ' +
              esc(st.freq + ' ' + st.name) + ' is assigned and named; its catalogue is still being built. ' +
              'Nothing airs on a kJubilee frequency until there is programming worth leaving on.</aside>') +
            '<div class="kja-body">' + body + '</div>' +
            (art.stands
              ? '<div class="kja-callout">' +
                  '<div class="kja-callout-label">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
                    'What it stands on' +
                  '</div>' +
                  '<p class="kja-callout-text">' + esc(art.stands) + '</p>' +
                '</div>'
              : '') +
            (host
              ? '<div class="kja-byline">' +
                  '<img src="' + esc(host.image) + '" alt="" width="46" height="46">' +
                  '<div>' +
                    '<div class="kja-byline-credit">Hosted by</div>' +
                    '<div class="kja-byline-name">' + esc(host.name) + '</div>' +
                    '<div class="kja-byline-role">' + esc(host.focus) + '</div>' +
                  '</div>' +
                '</div>'
              : '') +
            '<p class="kja-note">Every station on the Heavenly Modulation band plays from a schedule ' +
              'published in advance, so two listeners who tune in at the same second hear the same song ' +
              'at the same moment. Listening is free and always will be.</p>' +
          '</div>' +

          '<aside class="kja-sidebar">' +
            (live
              ? '<div class="kja-widget">' +
                  '<h2 class="kja-widget-title">On air now</h2>' +
                  '<div class="kja-now">' +
                    '<span class="kja-now-dot"></span>' +
                    '<span class="kja-now-text">' +
                      '<span class="kja-now-title" id="kja-now-title">' + esc(st.show ? st.show.name : st.name) + '</span>' +
                      '<span class="kja-now-sub" id="kja-now-sub">' + esc(st.show ? st.show.time : '24/7') + '</span>' +
                    '</span>' +
                  '</div>' +
                '</div>'
              : '') +
            '<div class="kja-widget">' +
              '<h2 class="kja-widget-title">Station facts</h2>' +
              '<dl class="kja-facts">' + facts + '</dl>' +
            '</div>' +
            (sched
              ? '<div class="kja-widget">' +
                  '<h2 class="kja-widget-title">Through the day</h2>' +
                  '<ul class="kja-sched">' + sched + '</ul>' +
                '</div>'
              : '') +
            '<div class="kja-widget">' +
              '<h2 class="kja-widget-title">Share this station</h2>' +
              '<div class="kja-share">' +
                '<button type="button" data-share="link">Copy link</button>' +
                '<a class="btn-outline" href="/music">Browse the library</a>' +
              '</div>' +
            '</div>' +
          '</aside>' +
        '</div>' +

        (live
          ? '<button type="button" class="kja-cta" data-kj-play="' + esc(st.slug) + '">' +
              '<span class="kja-cta-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg></span>' +
              '<span>' +
                '<span class="kja-cta-label">Listen now</span>' +
                '<span class="kja-cta-title">' + esc(st.name) + '</span>' +
                '<span class="kja-cta-sub">' + esc(st.freq + ' · ' + st.listeners) + '</span>' +
              '</span>' +
            '</button>'
          : '') +

        (more
          ? '<section class="kja-more">' +
              '<h2 class="kja-more-title">More on the dial</h2>' +
              /* .row is the site's own shelf grid: five columns, and one column
                 below 700px. Reused rather than redefined so this grid cannot
                 drift away from the shelves it is showing cards from - and so a
                 future change to the shelves reaches this page for free.
                 `shelf-grid` was a class that never existed, which is why these
                 cards arrived unstyled and full width. */
              '<div class="row">' + more + '</div>' +
            '</section>'
          : '') +
      '</article>';

    painted = true;
    document.title = st.name + ' — ' + st.freq + ' · kJubilee.com';
    scrollEl.scrollTop = 0;
    if (live && st.tenant) paintNowPlaying(st);
  }

  /*
   * What is actually sounding on this station, right now.
   *
   * The same resolution the player does: fetch the day file, find the entry
   * whose slot covers this second, print it. Read-only and best effort - the
   * widget already carries the show name from the catalogue, so a station whose
   * schedule has not published simply keeps that rather than showing an error.
   * Nothing here touches audio; it is a caption, not a second player.
   */
  function paintNowPlaying(st) {
    if (typeof fetch !== 'function') return;
    var stamp;
    try {
      stamp = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date()).replace(/-/g, '');
    } catch (e) { return; }

    var url = '/cdn/radio/' + st.tenant + '/delivery/' + st.tenant.replace(/-/g, '') + '-' + stamp + '.json';
    fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (doc) {
      if (!doc || !doc.entries) return;
      var t = document.getElementById('kja-now-title');
      var sub = document.getElementById('kja-now-sub');
      if (!t || !sub) return;                       // navigated away while it loaded
      var sec = Math.floor((Date.now() - Date.parse(doc.startsAt)) / 1000);
      var lo = 0, hi = doc.entries.length - 1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1, e = doc.entries[mid];
        if (sec < e.t) hi = mid - 1;
        else if (sec >= e.t + e.d) lo = mid + 1;
        else {
          t.textContent = e.ti + (e.al ? ' (' + e.al + ')' : '');
          sub.textContent = e.ar;
          return;
        }
      }
    }).catch(function () { /* the show name stands */ });
  }

  /* -------------------------------------------------------------------- */
  /* Routing                                                               */
  /* -------------------------------------------------------------------- */
  /* #<section-id>          a category view
     #station/<slug>        a station article, opened over its category
     Station articles are addressable so a frequency can be linked directly. */
  var STATION_PREFIX = 'station/';

  function route() {
    var hash = decodeURIComponent(location.hash.slice(1));

    if (hash.indexOf(STATION_PREFIX) === 0) {
      var slug = hash.slice(STATION_PREFIX.length);
      if (!bySlug[slug]) { location.hash = currentSection; return; }
      renderArticle(slug);
      return;
    }

    var id = hash || 'home';
    var known = SECTIONS.some(function (s) { return s.id === id; });
    renderSection(known ? id : 'home');
  }

  function go(hash) {
    if (location.hash.slice(1) === hash) route();   // same target, re-run by hand
    else location.hash = hash;
  }


  /* -------------------------------------------------------------------- */
  /* Hover preview                                                        */
  /*                                                                      */
  /* Ported from InspireManna's MessageCard. The tile grows into a panel  */
  /* carrying the picture, a transport row and the station's details, so  */
  /* a station can be played, saved or liked without leaving the shelf.   */
  /*                                                                      */
  /* Every number here was arrived at over there and is load-bearing:     */
  /*   350ms to open   - shorter and it fires while the pointer is only   */
  /*                     crossing the tile on its way somewhere else      */
  /*   140ms to close  - the gap between tile and panel has to survive    */
  /*                     the pointer travelling across it                 */
  /*   450ms quiet     - after a scroll, cards slide under a stationary   */
  /*                     pointer; without this the grid strobes popups    */
  /* -------------------------------------------------------------------- */
  var OPEN_MS = 350, CLOSE_MS = 140, SCROLL_QUIET_MS = 450, LINE_HEIGHT = 16;
  var PREVIEW_MIN = 300, PREVIEW_MAX = 460;

  // Shared by every card deliberately: a scroll should suppress the whole grid
  // for a moment, not only the tile that happened to be open.
  var lastScrollAt = 0;
  var openTimer = null, closeTimer = null;
  var previewEl = null, previewSlug = null, previewCard = null;

  // Touch and pen have no hover. Opening a panel on tap would swallow the tap
  // that was meant to open the station.
  var CAN_HOVER = !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var ICON = {
    play:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="FILL" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    thumb: '<svg viewBox="0 0 24 24" width="18" height="18" fill="FILL" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>',
    chev:  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  };
  function icon(name, filled) { return ICON[name].replace('FILL', filled ? 'currentColor' : 'none'); }

  function commas(nn) { return String(nn).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ---- saved / liked --------------------------------------------------- */

  function authToken() {
    try { return (JSON.parse(localStorage.getItem('jv_auth') || '{}') || {}).token || null; }
    catch (e) { return null; }
  }

  // Thumbs go to /api/radio/feedback, which is an append-only JSONL log with
  // nothing to read back. What this browser has already thumbed is therefore
  // remembered here, or the button would forget itself on every reload.
  function thumbs() {
    try { return JSON.parse(localStorage.getItem('kjubilee.thumbs') || '{}') || {}; }
    catch (e) { return {}; }
  }
  function setThumb(slug, on) {
    var t = thumbs();
    if (on) t[slug] = 1; else delete t[slug];
    try { localStorage.setItem('kjubilee.thumbs', JSON.stringify(t)); } catch (e) {}
  }

  function sendFeedback(st, event_type) {
    try {
      fetch('/api/radio/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: st.slug, station_name: st.name,
          event_type: event_type, timestamp: new Date().toISOString(),
        }),
      }).catch(function () {});
    } catch (e) {}
  }

  // Favourites are saved against the ACCOUNT, so a signed-out visitor is sent
  // to the door rather than having the click quietly dropped somewhere it can
  // never be shown back to them.
  function toggleFavorite(st, btn) {
    var token = authToken();
    if (!token) {
      location.href = '/login?next=' + encodeURIComponent(location.pathname + location.hash);
      return;
    }
    var on = btn.classList.contains('is-on');
    var opts = {
      method: on ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    };
    var url = '/api/radio/favorites' + (on ? '/' + encodeURIComponent(st.slug) : '');
    if (!on) {
      opts.body = JSON.stringify({
        station_id: st.slug, station_name: st.name,
        station_category: st.format || '', station_image: '/cdn/stations/' + st.slug + '.webp',
      });
    }
    // Painted first, corrected only if the server disagrees: a control that
    // waits for a round trip before moving reads as broken.
    paintFav(btn, !on);
    fetch(url, opts).then(function (r) {
      if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.hash); return; }
      if (!r.ok) paintFav(btn, on);
    }).catch(function () { paintFav(btn, on); });
  }

  function paintFav(btn, on) {
    btn.classList.toggle('is-on', !!on);
    btn.innerHTML = icon('heart', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Saved — click to remove' : 'Save this station';
    btn.setAttribute('aria-label', btn.title);
  }
  function paintThumb(btn, on) {
    btn.classList.toggle('is-on', !!on);
    btn.innerHTML = icon('thumb', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Liked — click to undo' : 'I like this station';
    btn.setAttribute('aria-label', btn.title);
  }

  /* ---- geometry -------------------------------------------------------- */

  function scrollParent(el) {
    for (var nn = el && el.parentElement; nn; nn = nn.parentElement) {
      var oy = getComputedStyle(nn).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && nn.scrollHeight > nn.clientHeight) return nn;
    }
    return null;
  }

  // Centred over the tile and clamped to the viewport.
  //
  // The width is capped as well as floored, and that cap is what makes a wide
  // card behave: scaling purely off the tile would give a two-column card a
  // panel twice the size of its neighbours'. Both land on the cap instead, so
  // one card in a row cannot open a different-sized popup from the rest.
  function computePos(card) {
    var r = card.getBoundingClientRect();
    var width = Math.min(
      Math.max(Math.round(r.width * 1.55), PREVIEW_MIN),
      Math.min(PREVIEW_MAX, window.innerWidth - 16)
    );
    var estH = Math.round((width * 9) / 16) + 190;   // 16:9 cover + body
    var left = r.left + r.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    var top = r.top + r.height / 2 - estH / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - estH - 8));
    return { left: left, top: top, width: width };
  }

  /* ---- the panel ------------------------------------------------------- */

  function buildPreview(st, pos) {
    var host = byMember[st.host];
    var el = document.createElement('div');
    el.className = 'card-preview';
    el.style.left = pos.left + 'px';
    el.style.top = pos.top + 'px';
    el.style.width = pos.width + 'px';

    el.innerHTML =
      '<div class="cp-cover" role="button" tabindex="0" aria-label="' + esc(st.name) + '">' +
        '<div class="ident" style="' + gradVars(st) + '"></div>' +
        '<img class="cover-art" alt="" src="/cdn/stations/' + encodeURIComponent(st.slug) + '.webp?v=' + COVER_V + '">' +
        '<div class="cp-ident">' +
          '<span class="cp-freq">' + esc(st.freq) + '</span>' +
          (st.tracks
            ? '<span class="cp-songs">' + esc(commas(st.tracks)) + ' Song' + (st.tracks === 1 ? '' : 's') + '</span>'
            : '') +
        '</div>' +
      '</div>' +
      '<div class="cp-body">' +
        '<div class="cp-actions">' +
          '<button type="button" class="cp-act play"' + (st.prototype ? '' : ' disabled') + '>' + ICON.play + '</button>' +
          '<button type="button" class="cp-act fav"></button>' +
          '<button type="button" class="cp-act thumb"></button>' +
          '<button type="button" class="cp-act details" aria-label="More about this station" title="More about this station">' + ICON.chev + '</button>' +
        '</div>' +
        '<div class="cp-title">' + esc(st.name) + '</div>' +
        '<div class="cp-meta">' +
          '<span class="cp-pill">' + esc(st.format) + '</span>' +
          '<span class="cp-dur">HM ' + esc(st.hm) + '</span>' +
          '<span class="cp-member">' + esc(host ? host.short : '') + '</span>' +
        '</div>' +
        '<div class="cp-ref">' + esc(st.description) + '</div>' +
      '</div>';

    var img = el.querySelector('.cover-art');
    img.addEventListener('load', function () { img.classList.add('on'); });
    img.addEventListener('error', function () { img.remove(); });
    if (img.complete && img.naturalWidth) img.classList.add('on');

    var playBtn = el.querySelector('.cp-act.play');
    if (st.prototype) {
      // The button shows what pressing it WILL DO, so it has to follow the bar
      // rather than remember what this card last did: the station can be paused
      // from the footer, or another card can take the bar over, while this panel
      // is open. Both arrive as kj-player-state.
      var paintTransport = function () {
        var sp = window.kjPlayer && window.kjPlayer.state ? window.kjPlayer.state() : null;
        var sounding = !!(sp && sp.playing && sp.slug === st.slug);
        playBtn.innerHTML = sounding ? ICON.pause : ICON.play;
        playBtn.title = (sounding ? 'Pause ' : 'Play ') + st.name;
        playBtn.setAttribute('aria-label', playBtn.title);
        playBtn.setAttribute('aria-pressed', sounding ? 'true' : 'false');
      };
      paintTransport();
      window.addEventListener('kj-player-state', paintTransport);
      el.addEventListener('kj-preview-closed', function () {
        window.removeEventListener('kj-player-state', paintTransport);
      });
      playBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        // toggle(), not play(): pressing it on the station already sounding
        // pauses, and pressing it on a DIFFERENT station switches rather than
        // pausing the one that is on.
        if (window.kjPlayer) window.kjPlayer.toggle(st.slug);
      });
    } else {
      playBtn.title = 'Coming soon — this station has no programming yet';
      playBtn.setAttribute('aria-label', playBtn.title);
    }

    var favBtn = el.querySelector('.cp-act.fav');
    paintFav(favBtn, false);
    favBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleFavorite(st, favBtn); });
    // Signed out this answers false rather than 401ing, so it is safe to ask
    // without knowing whether anyone is signed in.
    fetch('/api/radio/favorites/check/' + encodeURIComponent(st.slug), {
      headers: authToken() ? { 'Authorization': 'Bearer ' + authToken() } : {},
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.isFavorited && previewSlug === st.slug) paintFav(favBtn, true); })
      .catch(function () {});

    var thumbBtn = el.querySelector('.cp-act.thumb');
    paintThumb(thumbBtn, !!thumbs()[st.slug]);
    thumbBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var on = !thumbBtn.classList.contains('is-on');
      paintThumb(thumbBtn, on);
      setThumb(st.slug, on);
      sendFeedback(st, on ? 'thumb_up' : 'thumb_clear');
    });

    function details(e) { e.stopPropagation(); closePreview(); go(STATION_PREFIX + st.slug); }
    el.querySelector('.cp-act.details').addEventListener('click', details);
    var cover = el.querySelector('.cp-cover');
    cover.addEventListener('click', details);
    cover.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); details(e); }
    });

    el.addEventListener('mouseenter', cancelClose);
    el.addEventListener('mouseleave', scheduleClose);
    el.addEventListener('wheel', onPreviewWheel);
    return el;
  }

  // The panel hangs off <body>, outside main.scroll, so the browser looks up
  // its ancestors for something scrollable, finds only body and html, and does
  // nothing at all — the wheel is dead over the popup and, worse, the guard
  // below never fires because no scroll event is generated. Hand the wheel to
  // the container the CARD lives in instead.
  function onPreviewWheel(e) {
    if (scrollParent(e.currentTarget)) return;      // the browser can cope
    var sc = scrollParent(previewCard);
    if (!sc) return;
    var factor = e.deltaMode === 1 ? LINE_HEIGHT : e.deltaMode === 2 ? sc.clientHeight : 1;
    lastScrollAt = Date.now();
    sc.scrollBy({ top: e.deltaY * factor, left: e.deltaX * factor, behavior: 'auto' });
  }

  function closePreview() {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    // Lets the panel drop the window-level listener it added for its transport
    // button; without this every hover leaves one behind, repainting a node
    // that is no longer on the page.
    if (previewEl) { try { previewEl.dispatchEvent(new CustomEvent('kj-preview-closed')); } catch (e) {} }
    if (previewEl && previewEl.parentNode) previewEl.parentNode.removeChild(previewEl);
    previewEl = null; previewSlug = null; previewCard = null;
  }
  function scheduleClose() {
    clearTimeout(openTimer);
    closeTimer = setTimeout(closePreview, CLOSE_MS);
  }
  function cancelClose() { clearTimeout(closeTimer); }

  function openPreview(card) {
    var st = bySlug[card.dataset.slug];
    if (!st) return;
    closePreview();
    previewCard = card;
    previewSlug = st.slug;
    previewEl = buildPreview(st, computePos(card));
    document.body.appendChild(previewEl);
  }

  if (CAN_HOVER) {
    // Delegated, because the shelves are re-rendered on every navigation and
    // per-card listeners would be re-attached each time.
    document.addEventListener('mouseover', function (e) {
      var card = e.target.closest && e.target.closest('.card[data-slug]');
      if (!card || card === previewCard) return;
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      openTimer = setTimeout(function () {
        // A card that slid under a stationary pointer during a scroll has not
        // been hovered, it has been passed over. Opening on that reads as the
        // page fighting back.
        if (Date.now() - lastScrollAt < SCROLL_QUIET_MS) return;
        if (document.body.contains(card)) openPreview(card);
      }, OPEN_MS);
    });

    document.addEventListener('mouseout', function (e) {
      var card = e.target.closest && e.target.closest('.card[data-slug]');
      if (!card) return;
      // Into the panel itself, or deeper into the same card, is not a leave.
      var to = e.relatedTarget;
      if (to && (to.closest && (to.closest('.card-preview') || to.closest('.card[data-slug]') === card))) return;
      scheduleClose();
    });

    // Capture phase: main.scroll is what scrolls, and a scroll event does not
    // bubble to window from an element.
    window.addEventListener('scroll', function () {
      lastScrollAt = Date.now();
      if (previewEl) closePreview();
    }, true);
    window.addEventListener('resize', closePreview);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePreview(); });
  }

  /* -------------------------------------------------------------------- */
  /* Events                                                                */
  /* -------------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var navLink = e.target.closest('.nav-link');
    if (navLink) { input.value = ''; go(navLink.dataset.section); return; }

    var member = e.target.closest('.member');
    if (member) { renderMember(member.dataset.member); return; }

    var dot = e.target.closest('.hero-dot');
    if (dot) { stopHero(); paintHero(Number(dot.dataset.i)); startHero(); return; }

    var arrow = e.target.closest('.hero-arrow');
    if (arrow) {
      stopHero();
      var n = FEATURED.length, cur = paintHero.index || 0;
      paintHero(arrow.classList.contains('next') ? (cur + 1) % n : (cur - 1 + n) % n);
      startHero();
      return;
    }

    // Listen now inside the dialog: the footer player's own delegated listener
    // starts the audio, this only gets the dialog out of the way so the player
    // it just started is visible. Both listeners sit on `document`, and the
    // player's stopPropagation() does not suppress this one — that would take
    // stopImmediatePropagation, and only on a shared node in a fixed order.
    // Back out of an article to the shelf it was opened from.
    if (e.target.closest('[data-article-back]')) { go(currentSection); return; }

    // Copy this station's own address. The article has a URL precisely so it
    // can be handed to somebody; this saves them selecting the address bar.
    var share = e.target.closest('[data-share="link"]');
    if (share) {
      var url = location.href;
      var done = function () {
        var was = share.textContent;
        share.textContent = 'Link copied';
        setTimeout(function () { share.textContent = was; }, 1600);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function () {});
        }
      } catch (err) { /* no clipboard, no copy - the URL is in the bar anyway */ }
      return;
    }

    // The persona tab in an article's meta row.
    var mem = e.target.closest('[data-member]');
    if (mem) { go('hm'); return; }

    // A play control starts the station in the footer bar and must NOT also
    // navigate: pressing play on a card is a request for sound, not for the
    // article. Both listeners sit on `document`, so the player's
    // stopPropagation() cannot suppress this one and the guard has to be here.
    if (e.target.closest('[data-kj-play]')) return;

    var card = e.target.closest('.card, .hero-title button');
    if (card && card.dataset.slug) { go(STATION_PREFIX + card.dataset.slug); }
  });

  /* The play controls on a cover are spans carrying role="button", because the
     card around them is itself a <button> and buttons cannot nest. A span does
     not fire a click on Enter or Space the way a real button does, so the
     keyboard is wired here — otherwise the control is reachable by Tab and then
     does nothing, which is worse than not being reachable at all.

     stopPropagation keeps the keystroke from also activating the card button
     underneath and opening the dialog over the player it just started. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var play = e.target.closest && e.target.closest('[data-kj-play]');
    if (!play) return;
    e.preventDefault();
    e.stopPropagation();
    play.click();
  });

  document.addEventListener('keydown', function (e) {
    // Escape leaves an article the way it left the dialog before it.
    if (e.key === 'Escape' && location.hash.slice(1).indexOf(STATION_PREFIX) === 0) go(currentSection);
  });

  var typing = null;
  input.addEventListener('input', function () {
    clearTimeout(typing);
    var v = input.value;
    typing = setTimeout(function () {
      if (v.trim()) renderSearch(v);
      else route();
    }, 200);
  });
  document.getElementById('qbtn').addEventListener('click', function () {
    if (input.value.trim()) renderSearch(input.value);
  });

  window.addEventListener('hashchange', route);

  /* A search started in another page's header arrives as ?q=. The header is
     shared across the site but the station index only exists here, so those
     pages hand the query over rather than pretending to answer it. */
  function fromQuery() {
    var m = /[?&]q=([^&]*)/.exec(location.search);
    if (!m) return false;
    var v = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
    if (!v) return false;
    input.value = v;
    renderSearch(v);
    return true;
  }

  /* -------------------------------------------------------------------- */
  /* Boot                                                                  */
  /* -------------------------------------------------------------------- */
  /* -------------------------------------------------------------------- */
  /* Hero height                                                           */
  /* -------------------------------------------------------------------- */
  /* The hero runs from under the top bar to the top edge of the player, and
     it has to land there on any screen at any zoom. #scroll is exactly that
     space - the flex row between the fixed top bar and the padding the player
     reserves - so its measured height is the hero's height, and no assumption
     about how tall either bar came out has to be right.

     Watched with a ResizeObserver rather than measured once: the window
     resizes, the browser zooms (which changes how many CSS pixels each bar
     rounds to), the player mounts a moment later and takes its 80px, the nav
     wraps to a second line on a narrow window. Each of those resizes #scroll,
     and the hero follows.

     No feedback loop: the hero is INSIDE #scroll, so its height changes what
     #scroll can scroll through, never how tall #scroll itself is. */
  var scrollEl = document.getElementById('scroll');
  var heroH = 0;

  function sizeHero() {
    /* Rounded up: half a pixel short is a visible hairline of page background
       above the player, half a pixel long is half a pixel of scroll. */
    var h = Math.ceil(scrollEl.getBoundingClientRect().height);
    if (!h || h === heroH) return;
    heroH = h;
    document.documentElement.style.setProperty('--hero-h', h + 'px');
  }

  sizeHero();
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(sizeHero).observe(scrollEl);
  }
  /* Belt and braces for browsers without ResizeObserver, and for the zoom
     changes some of them report only on the window. */
  window.addEventListener('resize', sizeHero);
  window.addEventListener('orientationchange', sizeHero);

  document.getElementById('year').textContent = new Date().getFullYear();
  document.getElementById('stat').textContent =
    STATIONS.length + ' stations · ' + MEMBERS.length + ' Inspire Family hosts · ' +
    STATIONS.filter(function (s) { return s.region !== 'domestic'; }).length + ' international frequencies';

  if (!fromQuery()) route();
})();
