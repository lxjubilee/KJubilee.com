(function () {
  'use strict';

  /* ── FIRST VISIT ON A PHONE GOES TO THE DIAL ─────────────────────────────
     Someone arriving at kjubilee.com on a phone has come to hear a radio
     station, and the home page is a shelf of them — a page you read before you
     can listen. So the first arrival is sent to the dial, which is the one
     screen that makes sound.

     ONCE, AND ONLY ONCE. The flag is set before the redirect, so Home reached
     from the menu afterwards stays Home. That is the whole reason this is not
     a server redirect: a rule that fires every time would make the home page
     unreachable from a phone, and one that fires from the edge would be cached
     and served to desktop visitors too.

     BY VIEWPORT, NOT BY USER AGENT — the same 620px line the header collapses
     at, so "phone" means one thing on this site. And explicitly NOT for
     crawlers: Googlebot renders at a phone viewport, and bouncing it off the
     home page would hand the index the dial in its place.

     Cookie AND localStorage, for the reason the console's pane widths use
     both: localStorage throws outright in some hardened and private contexts,
     and a first visit that cannot be recorded is a redirect that happens on
     every visit forever. Either store answering is enough to stay put. */
  (function firstRunToDial() {
    var DIAL = '/player';
    var KEY = 'kjubilee.seen';

    /* Only from the home page itself. `/` and `` are the only two spellings of
       it; anything else is a page somebody asked for by name.

       This was two normalisations that disagreed — the path was folded to `/`
       and compared against `'/'` folded to `''` — so the guard rejected the
       home page it exists to detect and the redirect never fired anywhere. It
       failed silently and looked exactly like a phone-detection problem. */
    if (!/^\/?$/.test(location.pathname || '/')) return;
    // A deep link into the home page asked for something specific; honour it.
    if (location.search || (location.hash && location.hash.length > 1)) return;

    var ua = navigator.userAgent || '';
    if (/bot|crawler|spider|crawling|preview|facebookexternalhit|slurp|bingpreview|headless/i.test(ua)) return;

    var phone = false;
    try {
      phone = window.matchMedia('(max-width: 620px)').matches
          && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
    } catch (e) { return; }
    if (!phone) return;

    var seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { /* blocked */ }
    if (!seen) seen = /(?:^|;\s*)kjubilee\.seen=1/.test(document.cookie || '');
    if (seen) return;

    try { localStorage.setItem(KEY, '1'); } catch (e) { /* blocked */ }
    try { document.cookie = KEY + '=1;path=/;max-age=31536000;samesite=lax'; } catch (e) { /* blocked */ }

    // `replace`, not `assign`: Back from the dial should leave the site the
    // way the visitor came in, not bounce them through this again.
    location.replace(DIAL);
  })();

  var STATIONS = window.KJ_STATIONS || [];
  var MEMBERS  = window.KJ_MEMBERS  || [];
  var SECTIONS = window.KJ_SECTIONS || [];
  /* City -> state or country, for the location on every card. Emitted by
     build-home-data from public/data/city-places.json, and optional there — an
     empty table costs the cards their state, never their city. */
  var CITIES  = window.KJ_CITIES || {};
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
  /* WHERE THE STATION IS BASED, for the corner of the card.
   *
   * This corner used to print st.pill — "Five-Fold" on fifty-eight of the
   * hundred and seventeen cards, which told a reader nothing they could not
   * already see from the shelf they were looking at. The anchor city says
   * something: bases[0] is the city the station belongs to, and KJ_CITIES turns
   * it into "Sacramento, California" or "Kingston, Jamaica".
   *
   * Falls back to the old pill where a station has no bases recorded — eleven
   * of the international frequencies are in that state. A blank corner on
   * eleven cards among a hundred would read as a bug; "International" at least
   * reads as a choice, and the fix is to give those stations bases rather than
   * to invent a city here. */
  function placeOf(st) {
    var b = (st && st.bases && st.bases[0]) || null;
    if (!b || !b.city) return st && st.pill ? st.pill : '';
    var region = b.place || (CITIES && CITIES[b.city]) || '';
    return region ? b.city + ', ' + region : b.city;
  }

  /* "HM" set half the size of the digits beside it.
     The prefix has to be there — the number is meaningless without it — but at
     equal weight it competed with the frequency it was labelling. Splitting it
     out is what lets CSS shrink the word without touching the digits. */
  function freqHTML(freq) {
    var s = String(freq || '');
    var m = /^\s*HM\s*(.*)$/i.exec(s);
    if (!m) return esc(s);
    return '<span class="hm-pre">HM</span>' + esc(m[1] ? ' ' + m[1] : '');
  }

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
          '<span class="cover-freq">' + freqHTML(st.freq) + '</span>' +
        '</div>' +
        '<div class="card-body">' +
          '<span class="body-freq" aria-hidden="true">' + esc(st.hm) + '</span>' +
          // PLAY, SAVE, LIKE AND OPEN, WHERE THERE IS NO HOVER PREVIEW.
          //
          // These four live only in the hover panel (buildPreview), and a touch
          // screen has no hover: on a phone none of them could be reached at
          // all — the card was a picture and a title. So they are ALWAYS in the
          // markup and hidden by CSS, which leaves the desktop rendering exactly
          // what it rendered before and costs a phone no second code path.
          //
          // Spans with role="button", not buttons: .card is itself a <button>
          // and buttons cannot nest. Same reason .cover-live is a span, and the
          // same keyboard wiring applies — see the keydown handler for
          // [data-kj-play],[data-kj-toggle].
          '<div class="card-actions">' +
            (st.prototype
              // data-kj-toggle, not data-kj-play: this is a transport control,
              // so pressing it on the station already sounding has to pause it.
              ? '<span class="card-act play" data-kj-toggle="' + esc(st.slug) + '" role="button" tabindex="0"></span>'
              : '<span class="card-act play is-off" role="button" aria-disabled="true"' +
                ' title="Coming soon — this station has no programming yet"></span>') +
            '<span class="card-act fav" data-act="fav" role="button" tabindex="0"></span>' +
            '<span class="card-act thumb" data-act="thumb" role="button" tabindex="0"></span>' +
            '<span class="card-act details" data-act="details" role="button" tabindex="0"' +
              ' aria-label="More about this station" title="More about this station">' + ICON.chev + '</span>' +
          '</div>' +
          '<span class="card-category">' + esc(st.format) + '</span>' +
          '<h3 class="card-title">' + esc(st.name) + '</h3>' +
          '<p class="card-blurb">' + esc(st.description) + '</p>' +
          '<div class="card-meta">' +
            '<span class="card-pill">' + esc(placeOf(st)) + '</span>' +
            // The frequency chip the preview prints. Hidden with the actions on
            // a desktop, where the cover already carries it.
            '<span class="card-dur">' + freqHTML(st.freq) + '</span>' +
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
  /* The HM band explainer                                                 */
  /*                                                                       */
  /* This tab used to be a stack of text panels, which is the one shape a  */
  /* reader will not stop on: no picture, no way in, and every piece       */
  /* shouting its whole argument at once. It is now the Backstage grid     */
  /* from JubiLujah - five columns of picture cards with one wide card     */
  /* per five - so the band explains itself the way the shelves do, and a  */
  /* card is a door rather than the room.                                  */
  /*                                                                       */
  /* Cards carry no art of their own. Each article names a station whose   */
  /* cover already stands for what the piece is about, so the page needs   */
  /* no new artwork to ship and picks up every cover regeneration for      */
  /* free. The station's ident gradient sits underneath as the fallback,   */
  /* exactly as it does on a shelf tile.                                   */
  /* -------------------------------------------------------------------- */
  var HM_SECTION  = SECTIONS.filter(function (s) { return s.id === 'hm'; })[0] || null;
  var HM_ARTICLES = (HM_SECTION && HM_SECTION.articles) || [];
  var hmBySlug = {};
  HM_ARTICLES.forEach(function (a) { hmBySlug[a.slug] = a; });

  /* Reading time, printed on the card so the reader knows what they are being
     asked for before they commit. 220wpm is the usual figure for prose on a
     screen, and the result is rounded UP - a piece announced as shorter than
     it is reads as a broken promise, one announced as longer never does. */
  function hmMinutes(a) {
    /* `words` is counted by build-home-data at build time. The body itself is
       no longer in the catalogue — see hmFetchBody below — and a card must
       never wait on a network round trip to print a reading time. */
    var words = a.words || (a.body ? a.body.join(' ').split(/\s+/).length : 0);
    return Math.max(1, Math.ceil(words / 220));
  }

  /* The cover a card wears. `image` names a station rather than a file, so a
     typo degrades to the gradient alone instead of to a broken picture. */
  function hmCoverHTML(a) {
    var st = bySlug[a.image];
    /* THE ARTICLE'S OWN PICTURE, where it has one. `a.img` is stamped by
       build-home-data from public/images/articles — one image per article
       slug — and only articles on this page carry it, so nothing else on the
       site changes artwork. Where a slug has no image yet the field is absent
       and the card falls back to the cover of the station the piece is about,
       which is what every card wore before.

       Same three layers either way: gradient at the back as the last resort,
       the picture over it, a scrim on top so a light image cannot swallow the
       card's rounded top edge. `.ident` is absolutely positioned, so it is a
       child of the frame rather than the frame itself. */
    var src = a.img
      ? a.img + '?v=' + COVER_V
      : (st ? '/cdn/stations/' + encodeURIComponent(st.slug) + '.webp?v=' + COVER_V : '');
    return '<div class="hm-card-image">' +
      (st ? '<div class="ident" style="' + gradVars(st) + '"></div>' : '') +
      (src
        ? '<img class="cover-art" alt="" loading="lazy" decoding="async" src="' + src + '">'
        : '') +
      '<div class="cover-scrim"></div>' +
    '</div>';
  }

  function hmCardHTML(a, wide) {
    var by = byMember[a.author];
    return '' +
      '<button class="hm-card' + (wide ? ' wide' : '') + (a.live ? ' is-live' : '') + '"' +
        ' data-hm="' + esc(a.slug) + '">' +
        hmCoverHTML(a) +
        '<div class="hm-card-body">' +
          '<span class="hm-card-category">' + esc(a.kicker) + '</span>' +
          '<h3 class="hm-card-title">' + esc(a.title) + '</h3>' +
          '<p class="hm-card-dek">' + esc(a.dek) + '</p>' +
          '<div class="hm-card-meta">' +
            '<span>' + esc(by ? by.name : 'Jubilee Inspire') + '</span>' +
            '<span class="hm-card-dot">·</span>' +
            '<span class="hm-card-read">' + hmMinutes(a) + ' min read</span>' +
          '</div>' +
        '</div>' +
      '</button>';
  }

  /* WHICH CARDS ARE WIDE, for any number of them.
   *
   * The shelves get away with isWide()'s fixed 0/6/11 because that pattern
   * tiles only when the count is a multiple of twelve. This grid is editorial
   * and grows a piece at a time, so the same constants would leave the last
   * row ragged the moment a thirteenth article was written - and a wide card
   * that cannot fit the columns left in its row does not shrink, it wraps and
   * leaves a hole.
   *
   * Five columns means a row is either five narrow cards or one wide plus
   * three narrow. So for R rows carrying k wide cards, n = 5R - k, and R is
   * pinned between ceil(n/5) and floor(n/4) by those two shapes. Inside that
   * range we take the R closest to 7n/30, which is one wide card per six -
   * the density the shelves already read at, and for n = 12 it reproduces
   * their three-per-twelve exactly.
   *
   * Every interior row then comes to exactly five columns for any n, so the
   * grid never opens a hole. The last row is also full for every count except
   * 6, 7 and 11, which cannot be tiled by those two row shapes at all - at
   * those three counts it simply runs short, the way any grid does.
   */
  function hmWideSet(n) {
    var wide = {};
    if (n < 5) return wide;                 // one short row; a wide card would only unbalance it
    var lo = Math.ceil(n / 5), hi = Math.floor(n / 4);
    if (hi < lo) hi = lo;
    var R = Math.min(hi, Math.max(lo, Math.round(7 * n / 30)));
    var k = Math.max(0, Math.min(R, 5 * R - n));

    var i = 0, w = 0;
    for (var r = 0; r < R && i < n; r++) {
      // ceil() rather than floor() so the FIRST row is a wide row whenever
      // there is one going: the lead piece is the one that has to stop a
      // reader, and it is the only card whose position is not negotiable.
      var wideRow = Math.ceil((r + 1) * k / R) > Math.ceil(r * k / R);
      if (wideRow && i + 4 <= n) {
        // Shift one place right on each successive wide row, so the wide cards
        // run as a diagonal instead of a stripe down one side of the page.
        wide[i + (w % 4)] = true;
        i += 4; w++;
      } else {
        i += 5;
      }
    }
    return wide;
  }

  function articlesHTML(items) {
    if (!items || !items.length) return '';
    var wide = hmWideSet(items.length);
    return '<div class="hm-grid">' + items.map(function (a, i) {
      return hmCardHTML(a, wide[i]);
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
             '<img class="cover-art hero-art" data-off-key="' + esc(st.slug) + '"' + offStyle(st.slug) +
               ' alt="" decoding="async" loading="' + (i === 0 ? 'eager' : 'lazy') + '"' +
               ' src="/cdn/stations/' + encodeURIComponent(st.slug) + '.webp?v=' + COVER_V + '">' +
             '</div>';
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
        /* THE FREQUENCY LIVES HERE NOW, NOT INSIDE THE SLIDES.
           A number per slide meant the outgoing one faded out with its shot
           while the incoming one faded in with its own, and in between neither
           was at full strength — the number blinked out and came back on
           every turn.
           Two layers stacked in one spot, alternating: the incoming number is
           written to whichever is dark, then the two trade opacity. Something
           is always lit, so what a reader sees is one number dissolving into
           the next. */
        '<div class="hero-freq" aria-hidden="true">' +
          '<span class="hero-freq-layer"></span>' +
          '<span class="hero-freq-layer"></span>' +
        '</div>' +
        nudgeHTML(picks[0].slug) +
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

    // THE NAME, THE DESCRIPTION, AND THE CONTROLS. Nothing else.
    //
    // This began as six stacked blocks, was cut to four, and is now three. The
    // label row that led it — "Featured", the format, the frequency — was
    // chrome above the only line anyone reads, and it announced the same three
    // facts the slide already carries in its picture, its dots and its
    // transport button. The track count and the reach figure went with it for
    // the same reason: inventory numbers are not a reason to listen to a
    // station, and they were the last thing on the busiest row.
    box.innerHTML = '' +
      '<h2 class="hero-title"><button data-slug="' + st.slug + '" title="' + esc(st.name) + '">' + esc(st.name) + '</button></h2>' +
      '<p class="hero-blurb" title="' + esc(st.description) + '">' + esc(st.description) + '</p>' +
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
        (host
          ? '<div class="hero-by">' +
              (host.image ? '<img class="hero-face" src="' + esc(host.image) + '" alt="" width="34" height="34">' : '') +
              // host.name, not host.short: "Ymani" is a first name, and the
              // personas are Ymani Inspire, Jubilee Inspire, Zev Inspire. The
              // short form belongs on a card meta row where width is scarce;
              // the hero has the room to say who this actually is.
              '<span class="hero-by-name">' + esc(host.name) + '</span>' +
              '<span class="hero-by-focus">' + esc(host.focus) + '</span>' +
            '</div>'
          : '') +
      '</div>';

    // The nudge arrows are OUTSIDE the slides (the shots are aria-hidden), so
    // they have to be told which station is on screen each time one turns.
    var nudge = document.querySelector('.hero .img-nudge');
    if (nudge) nudge.setAttribute('data-nudge', st.slug);

    // The transport button is rendered empty above and filled here, so the
    // slide always opens showing the right face — a station already playing
    // must not flash "Listen now" as its slide comes round.
    paintHeroTransport();

    var shots = view.querySelectorAll('.hero-shot');
    var dots  = view.querySelectorAll('.hero-dot');
    for (var k = 0; k < shots.length; k++) shots[k].classList.toggle('is-live', k === i);
    for (var d = 0; d < dots.length; d++) dots[d].classList.toggle('is-live', d === i);

    /* THE NUMBER DISSOLVES; IT NEVER LEAVES.
       This was a Web Animations fade from 0 to 1 on the live slide's own
       number, which fixed the pop on arrival and made the turns worse: the
       incoming number was attenuated twice over, once by its shot fading in
       and again by this, so it arrived after the outgoing one had already
       gone. Two layers that trade opacity have no such gap.
       No reduced-motion guard is needed any more — the transition is CSS, and
       the blanket `*{transition:none!important}` later in home.css covers it. */
    var stack = view.querySelector('.hero-freq');
    if (stack) {
      var layers = stack.querySelectorAll('.hero-freq-layer');
      if (layers.length === 2) {
        var lit = stack.querySelector('.hero-freq-layer.is-on') || layers[0];
        var dark = (lit === layers[0]) ? layers[1] : layers[0];
        var markup = '<span class="ident-freq-hm">HM</span> ' + esc(st.hm);
        /* The guard matters: clicking the dot of the slide already showing
           would otherwise hand the same number to the other layer and
           cross-fade it against itself, which reads as a flicker for nothing. */
        if (lit.innerHTML !== markup) {
          dark.innerHTML = markup;
          dark.classList.add('is-on');
          lit.classList.remove('is-on');
        }
      }
    }
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

  /* One step round the carousel, either way. The arrows and the swipe are the
     same movement asked for two different ways, and both restart the timer:
     having just been told which slide to look at, the reader gets the full
     dwell on it rather than whatever was left of the last one. */
  function heroStep(delta) {
    var n = FEATURED.length;
    if (n < 2) return;
    stopHero();
    paintHero((((paintHero.index || 0) + delta) % n + n) % n);
    startHero();
  }

  /* ---- swipe ----------------------------------------------------------- */
  /* THE ONLY WAY THROUGH THE CAROUSEL ON A PHONE. The arrows are display:none
     below 760px — there is no hover to reveal them and no room beside the words
     — which left six slides behind a row of 9px dots and an eight-second wait.
     A swipe is what a picture carousel is expected to answer to.

     Bound unconditionally rather than under a width test: touchstart only fires
     where there is a touch screen, so the gesture exists exactly where it can be
     made. A touch laptop at 1400px gets it too, which is right — it has a finger
     and the dots are just as small there.

     Delegated from `document`, because <main> is rewritten on every navigation
     and listeners bound to the hero element would go with it.

     PASSIVE, and nothing is preventDefault()ed. The page scrolls vertically
     through this element, and taking the gesture away from the browser to
     drag-follow the image would fight that scroll on every diagonal swipe. So
     the browser keeps the vertical axis, the delta is read on release, and the
     slide commits then — which also suits a carousel that cross-fades rather
     than slides: there is no horizontal movement to follow a finger with. */
  var SWIPE_MIN_PX = 40;    // shorter than this is a tap, or a hesitation
  var SWIPE_RATIO  = 1.2;   // and it has to be this much more across than down
  var swipeX = 0, swipeY = 0, swiping = false;

  document.addEventListener('touchstart', function (e) {
    // Two fingers is a pinch-zoom, not a swipe.
    if (!e.touches || e.touches.length !== 1 ||
        !e.target.closest || !e.target.closest('.hero')) { swiping = false; return; }
    swipeX = e.touches[0].clientX;
    swipeY = e.touches[0].clientY;
    swiping = true;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!swiping) return;
    swiping = false;
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    var dx = t.clientX - swipeX;
    var dy = t.clientY - swipeY;
    // A gesture that travelled further down the page than across it was a
    // scroll that happened to start on the hero.
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
    // Swiping left pulls the next slide in from the right, the way a stack of
    // photographs moves under a thumb.
    heroStep(dx < 0 ? 1 : -1);
  }, { passive: true });

  // A gesture the system takes over — an edge swipe, a call arriving — is not
  // a swipe that was finished, and must not move the carousel when the finger
  // lands again.
  document.addEventListener('touchcancel', function () { swiping = false; }, { passive: true });

  /* -------------------------------------------------------------------- */
  /* Member strip (Inspire Family)                                         */
  /* -------------------------------------------------------------------- */
  function membersHTML() {
    return '<div class="members">' + MEMBERS.map(function (m) {
      var n = STATIONS.filter(function (s) { return s.host === m.id; }).length;
      return '<button class="member' + (m.id === 'nova' ? ' is-lead' : '') + '" data-member="' + m.id + '">' +
        (m.image ? '<img src="' + esc(m.image) + '" alt="" loading="lazy" width="76" height="76">' : '') +
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
      // The page title and then the cards, with nothing between them. There was
      // a band strip here (block, office, frequency range, programming) and a
      // sentence of blurb under the heading; both were removed as unwanted
      // furniture. Whatever a category page has to say about itself, it says
      // through the stations on it.
      html += '<div class="section-intro"><h1>' + esc(sec.label) + '</h1></div>';
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
            '<img class="cover-art kja-hero-photo" data-off-key="' + esc(st.slug) + '"' + offStyle(st.slug) +
              ' alt="" decoding="async"' +
              ' src="/cdn/stations/' + encodeURIComponent(st.slug) + '.webp?v=' + COVER_V + '">' +
            '<span class="kja-hero-sheen"></span>' +
            '<span class="ident-freq"><span class="ident-freq-hm">HM</span> ' + esc(st.hm) + '</span>' +
          '</div>' +
          // Same key as the home hero: it is the same picture in near enough
          // the same crop, so one setting fixes both rather than two settings
          // needing to be kept in step.
          nudgeHTML(st.slug) +
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
                  (host.image ? '<img src="' + esc(host.image) + '" alt="" width="46" height="46">' : '') +
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
              // The three lines need a box of their own to stack in. Unclassed,
              // they were three inline spans in an inline wrapper and ran
              // together as one line: "HEAR WHAT THIS IS ABOUTYear of JubileeHM
              // 308.70".
              '<span class="kja-cta-text">' +
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
   * A BAND ARTICLE, on the same template as a station article.
   *
   * Deliberately the kja- template rather than one of its own: a reader who
   * has opened a station page already knows where the back button, the pull
   * quote and the sidebar live, and a second layout would spend that for
   * nothing. What differs is only what the furniture holds - the byline
   * credits a writer instead of a host, the facts describe the band instead
   * of one frequency, and the hero wears the cover of the station the piece
   * is about.
   *
   * Addressable at #hm/<slug> for the same reason the station pages are: a
   * piece explaining what this band is has to survive being pasted into a
   * message, and it renders into the scroll view rather than navigating, so
   * the footer player keeps sounding while it is read.
   */
  /* Read off the catalogue rather than typed, so the sidebar cannot drift out
     of step with the dial as frequencies come on air. */
  function hmBandFacts() {
    var langs = {};
    STATIONS.forEach(function (s) { if (s.lang) langs[s.lang] = 1; });
    var nums = STATIONS.map(function (s) { return parseFloat(s.hm); })
                       .filter(function (n) { return !isNaN(n); })
                       .sort(function (x, y) { return x - y; });
    return [
      ['Frequencies', String(STATIONS.length)],
      ['On air now', String(STATIONS.filter(function (s) { return s.prototype; }).length)],
      ['Languages', String(Object.keys(langs).length)],
      ['Dial', nums.length ? 'HM ' + nums[0].toFixed(2) + '–' + nums[nums.length - 1].toFixed(2) : '—'],
      ['Listening', 'Free to listen']
    ];
  }

  /* THE BODY IS FETCHED, NOT SHIPPED.
     One hundred and thirteen essays is about 950 KB of prose. It used to sit in
     stations-data.js, which every page loads and which is served no-store — so
     a visitor who opened the dial and pressed play paid for all of it and read
     none of it. build-home-data now writes one file per slug into
     public/data/hm-articles and leaves the grid its metadata.

     Cached per slug for the life of the page: the reader who goes back to the
     shelf and returns to the same piece should not fetch it twice. */
  var hmBodies = {};
  var hmWanted = null;

  function hmFetchBody(slug) {
    if (hmBodies[slug]) return Promise.resolve(hmBodies[slug]);
    return fetch('/data/hm-articles/' + encodeURIComponent(slug) + '.json?v=' + COVER_V)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (doc) {
        hmBodies[slug] = (doc && doc.body) || [];
        return hmBodies[slug];
      });
  }

  /* The prose column, for whichever of the three states we are in. The dek is
     the lead in all of them, so the reader always has the piece's own first
     line to hold while the rest arrives. */
  function hmBodyHTML(a, paras) {
    var lead = '<p class="kja-lead">' + esc(a.dek) + '</p>';
    if (paras === null) {
      // In flight. Bars rather than a spinner: the column keeps its width and
      // the page does not jump when the real paragraphs land in its place.
      return lead + '<div class="kja-body-loading" aria-live="polite" aria-busy="true">' +
        '<span></span><span></span><span></span><span></span><span></span>' +
        '<p class="kja-body-loading-note">Fetching the article…</p></div>';
    }
    if (!paras.length) {
      return lead + '<p class="kja-body-failed">This article could not be loaded. ' +
        '<button type="button" data-hm-retry="' + esc(a.slug) + '">Try again</button></p>';
    }
    return lead + paras.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  }

  function renderHmArticle(slug) {
    var a = hmBySlug[slug];
    if (!a) { go('hm'); return; }
    var by = byMember[a.author];
    var st = bySlug[a.image];
    var heroSrc = a.img
      ? a.img + '?v=' + COVER_V
      : (st ? '/cdn/stations/' + encodeURIComponent(st.slug) + '.webp?v=' + COVER_V : '');

    /* Paint immediately with whatever we have — cached prose, or the loading
       column — so the hero, the title and the reading time are up at once, and
       only the paragraphs arrive late. Re-rendering the whole article when the
       fetch returns would throw away the reader's scroll position. */
    hmWanted = slug;
    var haveBody = hmBodies[slug] || null;
    var body = hmBodyHTML(a, haveBody);

    if (!haveBody) {
      hmFetchBody(slug).then(function (paras) {
        // The reader may have moved on while this was in flight; a late arrival
        // must not overwrite whatever they are looking at now.
        if (hmWanted !== slug) return;
        var col = view.querySelector('.kja-body');
        if (col) col.innerHTML = hmBodyHTML(a, paras);
      }).catch(function () {
        if (hmWanted !== slug) return;
        var col = view.querySelector('.kja-body');
        if (col) col.innerHTML = hmBodyHTML(a, []);
      });
    }

    var facts = hmBandFacts().map(function (f) {
      return '<dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd>';
    }).join('');

    /* The other pieces, capped at TEN - two full rows of five. The cap is a
       multiple of five on purpose: a last row of three under two empty
       columns reads as a loading failure rather than as the end of a list.
       hmWideSet works out to no wide cards at that count, which is what this
       row wants anyway - the reader is leaving, not arriving. */
    var others = HM_ARTICLES.filter(function (x) { return x.slug !== a.slug; }).slice(0, 10);
    var moreWide = hmWideSet(others.length);
    var more = others.map(function (x, i) { return hmCardHTML(x, moreWide[i]); }).join('');

    view.innerHTML = '' +
      '<article class="kja">' +
        '<section class="kja-hero">' +
          // The piece's own picture in its own hero, same resolution the cards
          // use — its image where it has one, the station cover behind it if not.
          '<div class="kja-hero-art ident"' + (st ? ' style="' + gradVars(st) + '"' : '') + ' aria-hidden="true">' +
            (heroSrc
              ? '<img class="cover-art kja-hero-photo" data-off-key="' + esc(a.slug) + '"' + offStyle(a.slug) +
                ' alt="" decoding="async" src="' + heroSrc + '">'
              : '') +
            '<span class="kja-hero-sheen"></span>' +
            '<span class="ident-freq"><span class="ident-freq-hm">HM</span></span>' +
          '</div>' +
          // Keyed by the ARTICLE's slug, not a station's: a Heavenly Band piece
          // carries its own picture. Only rendered where there is one to move.
          (heroSrc ? nudgeHTML(a.slug) : '') +
          '<button class="kja-back" type="button" data-hm-back>' +
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"></path></svg>' +
            'The Heavenly Band' +
          '</button>' +
          '<div class="kja-hero-overlay"><div class="kja-hero-inner">' +
            '<div class="kja-meta">' +
              '<span class="kja-tab">' + esc(a.kicker) + '</span>' +
              '<span class="kja-meta-plain">' + esc(by ? by.name : 'Jubilee Inspire') +
                ' · ' + hmMinutes(a) + ' min read</span>' +
            '</div>' +
            '<h1 class="kja-title">' + esc(a.title) + '</h1>' +
            '<p class="kja-need"><span class="kja-need-label">In short: </span>' + esc(a.dek) + '</p>' +
          '</div></div>' +
        '</section>' +

        '<div class="kja-container">' +
          '<div class="kja-main">' +
            '<div class="kja-body">' + body + '</div>' +
            (a.stands
              ? '<div class="kja-callout">' +
                  '<div class="kja-callout-label">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
                    'The line it rests on' +
                  '</div>' +
                  '<p class="kja-callout-text">' + esc(a.stands) + '</p>' +
                '</div>'
              : '') +
            (by
              ? '<div class="kja-byline">' +
                  (by.image ? '<img src="' + esc(by.image) + '" alt="" width="46" height="46">' : '') +
                  '<div>' +
                    '<div class="kja-byline-credit">Written by</div>' +
                    '<div class="kja-byline-name">' + esc(by.name) + '</div>' +
                    '<div class="kja-byline-role">' + esc(by.focus) + '</div>' +
                  '</div>' +
                '</div>'
              : '') +
            '<p class="kja-note">Every station on the Heavenly Modulation band is free to listen to, ' +
              'with no advertising, and the dial is still being built out — ' +
              'frequencies are assigned before their stations sign on.</p>' +
          '</div>' +

          '<aside class="kja-sidebar">' +
            '<div class="kja-widget">' +
              '<h2 class="kja-widget-title">The band at a glance</h2>' +
              '<dl class="kja-facts">' + facts + '</dl>' +
            '</div>' +
            '<div class="kja-widget">' +
              '<h2 class="kja-widget-title">Share this article</h2>' +
              '<div class="kja-share">' +
                '<button type="button" data-share="link">Copy link</button>' +
                '<a class="btn-outline" href="/radio">Open the dial</a>' +
              '</div>' +
            '</div>' +
          '</aside>' +
        '</div>' +

        // The piece ends by handing the reader the station it was written
        // around, but only when that station can actually be heard - a play
        // button on a frequency still in build is an invitation to nothing.
        (st && st.prototype
          ? '<button type="button" class="kja-cta" data-kj-play="' + esc(st.slug) + '">' +
              '<span class="kja-cta-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg></span>' +
              // The three lines need a box of their own to stack in. Unclassed,
              // they were three inline spans in an inline wrapper and ran
              // together as one line: "HEAR WHAT THIS IS ABOUTYear of JubileeHM
              // 308.70".
              '<span class="kja-cta-text">' +
                '<span class="kja-cta-label">Hear what this is about</span>' +
                '<span class="kja-cta-title">' + esc(st.name) + '</span>' +
                '<span class="kja-cta-sub">' + esc(st.freq + ' · ' + st.listeners) + '</span>' +
              '</span>' +
            '</button>'
          : '') +

        (more
          ? '<section class="kja-more">' +
              '<h2 class="kja-more-title">More from the band</h2>' +
              '<div class="hm-grid">' + more + '</div>' +
            '</section>'
          : '') +
      '</article>';

    painted = true;
    document.title = a.title + ' — The Heavenly Band · kJubilee.com';
    scroll.scrollTop = 0;
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
     #hm/<slug>             a band article, opened over the HM tab
     Both kinds of article are addressable so a frequency, or the piece that
     explains what this band is, can be linked to directly. */
  var STATION_PREFIX = 'station/';
  var HM_PREFIX      = 'hm/';

  function route() {
    var hash = decodeURIComponent(location.hash.slice(1));

    if (hash.indexOf(STATION_PREFIX) === 0) {
      var slug = hash.slice(STATION_PREFIX.length);
      if (!bySlug[slug]) { location.hash = currentSection; return; }
      renderArticle(slug);
      return;
    }

    /* Checked BEFORE the section lookup below, and it has to be: the section
       itself is `hm`, so `hm/<slug>` would otherwise fall through to the
       unknown-id branch and dump the reader on the home page. */
    if (hash.indexOf(HM_PREFIX) === 0) {
      var hmSlug = hash.slice(HM_PREFIX.length);
      if (!hmBySlug[hmSlug]) { location.hash = 'hm'; return; }
      renderHmArticle(hmSlug);
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

  /* THE PANEL AND THE CARD BODY ARE THE SAME FOUR CONTROLS, so only one of them
     may be on screen at a time. Below the tablet width the body carries them
     (see the media block in home.css, which uses this same number), and opening
     a panel over a card that is already showing them would be the station
     announced twice with two sets of buttons.

     Asked per hover rather than read once: a window is dragged across this
     boundary without the page reloading. */
  var CARD_ACTIONS_MAX = 1024;
  function canPreview() {
    return CAN_HOVER && window.innerWidth > CARD_ACTIONS_MAX;
  }

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

  /* MAY THIS BROWSER SEE THE REGENERATE BUTTON?
   *
   * The same question app/_use-is-admin.js asks, asked again here because this
   * file is a plain script and that one is a React hook — there is no way to
   * call it from inside the shelf renderer.
   *
   * AND THE SAME CAVEAT APPLIES, which is the part worth keeping: this decides
   * whether a button is PAINTED, never what may be done. /api/admin/station-
   * images calls requireSection against the database on every request, so a
   * browser that sets this flag by hand in the console gains an icon and a 403.
   *
   * Asked once per page load, and never for a signed-out visitor — no token,
   * no request. A preview opened before the answer arrives simply has no
   * button; the next hover has one. That is a better trade than blocking the
   * panel on a round trip nobody else needs. */
  var isAdmin = false;
  (function askAdmin() {
    var token = authToken();
    if (!token) return;
    fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        var role = String((body && body.user && body.user.role) || '').toLowerCase();
        isAdmin = role === 'admin' || role === 'executive';
        /* A class rather than a re-render: the nudge arrows are already in the
           markup, hidden, and this is what uncovers them. Survives every later
           view rewrite, because it is on <body> and not inside <main>. */
        if (isAdmin) {
          document.body.classList.add('kj-admin');
          /* The wrappers are already on the page and empty — fill them now
             rather than re-rendering anything. See nudgeHTML. */
          fillNudges();
        }
      })
      .catch(function () { /* offline or expired: no button is the safe answer */ });
  })();

  /* ---- where each picture sits in its frame --------------------------- *
   *
   * Every large rendering of a station's artwork crops a 16:9 source into a
   * much wider, much shorter box with object-fit:cover anchored to the top.
   * That is right for most of the dial and wrong for some of it, and the only
   * previous fix was to re-render the artwork. An operator can now nudge the
   * crop instead, five pixels at a time, and the nudge is stored server-side
   * so it is what EVERY visitor sees — see migrations/007-image-offsets.sql.
   *
   * The map is keyed by whatever the picture is identified by: a station slug
   * on the hero and the station article, an article slug on a Heavenly Band
   * piece. One namespace, because one table.
   *
   * Fetched unconditionally, by everyone. Applying the offset is the whole
   * point; only CHANGING it is an admin question. */
  var OFFSETS = {};
  var OFFSET_STEP = 5;
  var OFFSET_LIMIT = 400;   /* matches the clamp in the API */

  /* 0 is exactly the `center top` the stylesheets already set, so a station
     with no row renders precisely as it did before this existed. */
  function applyOffsetTo(img) {
    var key = img.getAttribute('data-off-key');
    if (!key) return;
    img.style.objectPosition = 'center ' + (OFFSETS[key] || 0) + 'px';
  }
  function applyAllOffsets() {
    var list = document.querySelectorAll('img[data-off-key]');
    for (var i = 0; i < list.length; i++) applyOffsetTo(list[i]);
  }

  /* THE OFFSETS WERE SAVING AND NOT COMING BACK, and this is why.
     applyAllOffsets ran exactly once, when the fetch resolved. Every later
     render — changing category, opening a station, coming back to the shelf —
     replaces view.innerHTML with brand new <img> elements that nothing ever
     re-positions, so an adjustment survived until the reader touched the page
     and then vanished.
     route() has half a dozen exits and renderSection/renderArticle/
     renderHmArticle all write the same container, so chasing every render site
     would be a list to keep in step. Watching the container is one rule that
     cannot be forgotten. Batched into a frame because replacing innerHTML
     emits a burst of records and there is no sense running the query per node. */
  (function watchRenders() {
    if (!view || !window.MutationObserver) return;
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; applyAllOffsets(); });
    }).observe(view, { childList: true, subtree: true });
  })();

  /* Written straight into the markup as well, so a picture rendered AFTER the
     offsets are known is never painted at the wrong crop and corrected a frame
     later. The observer above is what covers the opposite order. */
  function offStyle(key) {
    var y = OFFSETS[key] || 0;
    return y ? ' style="object-position:center ' + y + 'px"' : '';
  }

  (function loadOffsets() {
    fetch('/api/station-offsets', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (b) {
        if (!b || !b.offsets) return;
        OFFSETS = b.offsets;
        /* The view may already have rendered — this resolves after first
           paint on purpose, so nothing waits on it. */
        applyAllOffsets();
      })
      .catch(function () { /* default crop is a fine answer */ });
  })();

  var NUDGE_UP   = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>';
  var NUDGE_DOWN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"></path></svg>';

  /* The two arrows, top-right of whatever picture they belong to. Rendered for
     EVERYONE and revealed by body.kj-admin in CSS: the admin answer arrives
     from /api/auth/me after first paint, and re-rendering a hero to add two
     buttons when it lands would restart the carousel animation. A visitor who
     is not an admin has two hidden buttons in their DOM and a 403 waiting if
     they find them. */
  function nudgeButtonsHTML() {
    return '<button type="button" class="img-nudge-btn" data-dir="-1"' +
             ' title="Move this picture up 5px" aria-label="Move this picture up">' + NUDGE_UP + '</button>' +
           '<button type="button" class="img-nudge-btn" data-dir="1"' +
             ' title="Move this picture down 5px" aria-label="Move this picture down">' + NUDGE_DOWN + '</button>';
  }

  /* THE CONTAINER SHIPS EMPTY; THE BUTTONS DO NOT SHIP AT ALL.
     This used to emit both buttons for every visitor and rely on
     body.kj-admin in CSS to keep them off the screen. That gate works — a
     signed-out browser cannot see them and /api/admin/station-offsets answers
     403 to anyone without the role — but "hidden by a stylesheet" is a thin
     place to keep an operator control, and it puts two labelled admin buttons
     in the markup of every anonymous page view.

     So only the positioned wrapper is rendered for everyone. It is empty, has
     no buttons, no titles and no icons, and stays display:none. When the admin
     answer arrives, fillNudges() puts the buttons into the wrappers already on
     the page — which is what the original design was protecting: adding them
     must not re-render the hero, because that restarts the carousel. The click
     handler is delegated from `document`, so injected buttons need no binding.

     This is defence in depth, not the lock. The lock is the route. */
  function nudgeHTML(key) {
    return '<div class="img-nudge" data-nudge="' + esc(key) + '">' +
             (isAdmin ? nudgeButtonsHTML() : '') +
           '</div>';
  }

  function fillNudges() {
    var boxes = document.querySelectorAll('.img-nudge');
    for (var i = 0; i < boxes.length; i++) {
      if (!boxes[i].firstElementChild) boxes[i].innerHTML = nudgeButtonsHTML();
    }
  }

  /* Optimistic: the crop moves on the press and the request follows. A failed
     save leaves this browser showing a position nobody else has, which the
     next reload corrects — better than a picture that lags every click. */
  function saveOffset(key, y) {
    var token = authToken();
    if (!token) return;
    fetch('/api/admin/station-offsets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ slug: key, offsetY: y })
    }).catch(function () {});
  }

  /* Delegated from `document`, like every other handler here: <main> is
     rewritten on navigation and a listener bound to a hero would go with it. */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.img-nudge-btn');
    if (!btn) return;
    /* The hero and the article hero both sit inside larger click targets. */
    e.preventDefault();
    e.stopPropagation();
    var box = btn.closest('.img-nudge');
    var key = box && box.getAttribute('data-nudge');
    if (!key) return;
    var step = Number(btn.getAttribute('data-dir')) * OFFSET_STEP;
    var next = Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, (OFFSETS[key] || 0) + step));
    if (next === (OFFSETS[key] || 0)) return;   /* already at the stop */
    OFFSETS[key] = next;
    applyAllOffsets();
    saveOffset(key, next);
  });

  /* Stations this browser has already asked to have re-rendered, so the button
     stays marked after the POST without re-reading the queue on every hover. */
  var regenAsked = {};

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

  /* ---- the same four controls, on the cards themselves ------------------ */

  /* buildPreview wires its four buttons one panel at a time, because only one
     panel is ever open. On a touch screen the same four are on EVERY card at
     once, so they are delegated and painted in bulk instead of per card.

     Favourites are ONE request for the whole page. The panel can afford
     /favorites/check/<slug> for the single station it is opening; a phone
     showing twenty cards would fire twenty of them, so the list is fetched once
     and every card painted from it. Null until it answers, and {} for a signed
     out visitor — who has no favourites and must not be asked. */
  var favSet = null;

  function paintCardActions(root) {
    var scope = (root && root.querySelectorAll) ? root : document;
    var sp = window.kjPlayer && window.kjPlayer.state ? window.kjPlayer.state() : null;
    var sounding = (sp && sp.playing) ? sp.slug : null;
    var liked = thumbs();
    var acts = scope.querySelectorAll('.card[data-slug] .card-act');
    Array.prototype.forEach.call(acts, function (el) {
      var card = el.closest('.card[data-slug]');
      if (!card) return;
      var slug = card.getAttribute('data-slug');
      var st = bySlug[slug];
      if (el.classList.contains('play')) {
        // A station with no programming yet keeps a play face and no state:
        // there is nothing for it to be playing.
        if (el.classList.contains('is-off')) { el.innerHTML = ICON.play; return; }
        var on = slug === sounding;
        el.innerHTML = on ? ICON.pause : ICON.play;
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
        el.title = (on ? 'Pause ' : 'Play ') + (st ? st.name : '');
        el.setAttribute('aria-label', el.title);
      } else if (el.classList.contains('fav')) {
        paintFav(el, favSet ? favSet[slug] === 1 : el.classList.contains('is-on'));
      } else if (el.classList.contains('thumb')) {
        paintThumb(el, !!liked[slug]);
      }
    });
  }

  function loadFavorites() {
    var token = authToken();
    if (!token) { favSet = {}; return; }
    fetch('/api/radio/favorites', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        favSet = {};
        if (d && d.favorites) {
          d.favorites.forEach(function (f) { favSet[f.station_id] = 1; });
        }
        paintCardActions();
      })
      .catch(function () { favSet = {}; });
  }

  /* Every render goes through view.innerHTML, and there are half a dozen of
     them. Watching #view paints whichever one just ran — and the next one
     somebody adds — rather than needing a call appended to each. */
  function watchCardActions() {
    paintCardActions();
    if (typeof MutationObserver !== 'function') return;
    var mo = new MutationObserver(function () {
      /* DISCONNECTED WHILE PAINTING, and this is not optional: painting writes
         the icon and the title into every .card-act, which are nodes inside the
         subtree being watched. Left connected, one paint reports itself, the
         report paints again, and the page spins at 100% CPU without ever
         settling. disconnect() also clears the queued records, so reconnecting
         starts clean rather than immediately replaying the paint. */
      mo.disconnect();
      paintCardActions();
      mo.observe(view, { childList: true, subtree: true });
    });
    mo.observe(view, { childList: true, subtree: true });
  }

  /* The transport faces follow the footer bar, exactly as the panel's does: the
     station can be paused from the bar, or another card can take it over. */
  window.addEventListener('kj-player-state', function () { paintCardActions(); });

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
        // ADMINS ONLY, AND ONLY AS PAINT. The route behind it re-checks against
        // the database; this is the difference between showing the control and
        // granting it. A signed-out or ordinary visitor never gets the markup
        // at all, so there is nothing to find in the DOM either.
        (isAdmin
          ? '<button type="button" class="cp-regen' + (regenAsked[st.slug] ? ' is-queued' : '') + '"' +
            ' data-regen="' + esc(st.slug) + '"' +
            ' title="' + (regenAsked[st.slug] ? 'Queued for a new cover' : 'Queue this cover to be generated again') + '"' +
            ' aria-label="Queue this cover to be generated again">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
              '<path d="M20 11A8 8 0 1 0 18 16.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
              '<path d="M20 5v6h-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>' +
          '</button>'
          : '') +
        '<div class="cp-ident">' +
          '<span class="cp-freq">' + freqHTML(st.freq) + '</span>' +
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
          // PLACE FIRST, THEN FORMAT. Where a station broadcasts from is the
          // fact a reader is orienting by on this shelf — the format is the
          // shelf they are already standing on. The row reads outside-in:
          // where it is, what it plays, who hosts it.
          //
          // This slot WAS A SECOND COPY OF THE FREQUENCY, which .cp-freq
          // already prints over the cover four lines up — the same number
          // twice in one small panel. The panel had no room to say where the
          // station broadcasts from and every room to stop repeating itself,
          // so the slot carries the location instead.
          '<span class="cp-place">' + esc(placeOf(st)) + '</span>' +
          '<span class="cp-pill">' + esc(st.format) + '</span>' +
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

    /* QUEUE THIS COVER TO BE MADE AGAIN.
     *
     * Sits inside .cp-cover, which is itself a click target that opens the
     * station page — so the first thing this does is stop the event. Without
     * that, asking for a new cover would also navigate away from the panel that
     * was asking, and the request would look like it had failed.
     *
     * It does NOT delete the image. The Station Image Studio treats a missing
     * file as "not done yet", so deleting would be the quick way to requeue and
     * would blank the card on a live site until somebody happened to run the
     * Studio. The row in kj_station_image_queue says "redo this" while the
     * existing cover stays up. */
    var regenBtn = el.querySelector('.cp-regen');
    if (regenBtn) {
      regenBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        if (regenBtn.disabled) return;
        regenBtn.disabled = true;
        regenBtn.classList.add('is-working');
        fetch('/api/admin/station-images', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken(),
          },
          body: JSON.stringify({ slug: st.slug }),
        }).then(function (r) {
          regenBtn.classList.remove('is-working');
          if (!r.ok) throw new Error('HTTP ' + r.status);
          regenAsked[st.slug] = true;
          regenBtn.classList.add('is-queued');
          regenBtn.title = 'Queued for a new cover';
          regenBtn.setAttribute('aria-label', regenBtn.title);
        }).catch(function () {
          // Re-enable rather than swallow it: a failed request that leaves the
          // button looking pressed is the one outcome that loses the work.
          regenBtn.classList.remove('is-working');
          regenBtn.classList.add('is-failed');
          regenBtn.disabled = false;
          regenBtn.title = 'Could not queue this cover — try again';
          regenBtn.setAttribute('aria-label', regenBtn.title);
        });
      });
    }

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
      // The card is carrying the four controls itself at this width.
      if (!canPreview()) return;
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
    if (arrow) { heroStep(arrow.classList.contains('next') ? 1 : -1); return; }

    // Listen now inside the dialog: the footer player's own delegated listener
    // starts the audio, this only gets the dialog out of the way so the player
    // it just started is visible. Both listeners sit on `document`, and the
    // player's stopPropagation() does not suppress this one — that would take
    // stopImmediatePropagation, and only on a shared node in a fixed order.
    // Back out of an article to the shelf it was opened from.
    if (e.target.closest('[data-article-back]')) { go(currentSection); return; }

    // A band article always goes back to the band, not to `currentSection`:
    // it can be arrived at from a pasted link, in which case there is no
    // section behind it and currentSection is still whatever loaded first.
    if (e.target.closest('[data-hm-back]')) { go('hm'); return; }

    /* A body fetch that failed leaves the column with a retry rather than a
       dead page. Clearing the cached empty is what makes the second attempt a
       real one — hmFetchBody short-circuits on anything already stored. */
    var hmRetry = e.target.closest('[data-hm-retry]');
    if (hmRetry) {
      var retrySlug = hmRetry.getAttribute('data-hm-retry');
      delete hmBodies[retrySlug];
      renderHmArticle(retrySlug);
      return;
    }

    // A card on the band explainer opens its article.
    var hmCard = e.target.closest('.hm-card[data-hm]');
    if (hmCard) { go('hm/' + hmCard.dataset.hm); return; }

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
    //
    // The same is true of every control now sitting IN a card body on a touch
    // screen: play/pause is data-kj-toggle, and save, like and open are
    // .card-act. Each one is inside the card <button>, so without this the card
    // would also navigate underneath the control that was pressed — saving a
    // station would open its page.
    if (e.target.closest('[data-kj-play]')) return;
    if (e.target.closest('[data-kj-toggle]')) return;
    if (e.target.closest('.card-act')) return;

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
    // Every span-as-button on a card: the cover's play badge, and the four
    // controls in the body that a touch screen gets instead of the panel.
    var play = e.target.closest &&
      e.target.closest('[data-kj-play],[data-kj-toggle],.card-act[data-act]');
    if (!play) return;
    e.preventDefault();
    e.stopPropagation();
    play.click();
  });

  /* Save, like and open, delegated for every card on the page. Play is not
     here: it is data-kj-toggle, which kj-footer-player.js already listens for
     on the document, so the card gets the footer's own transport for free. */
  document.addEventListener('click', function (e) {
    var act = e.target.closest && e.target.closest('.card-act[data-act]');
    if (!act) return;
    var card = act.closest('.card[data-slug]');
    if (!card) return;
    var st = bySlug[card.getAttribute('data-slug')];
    if (!st) return;
    e.preventDefault();
    var kind = act.getAttribute('data-act');
    if (kind === 'fav') {
      // toggleFavorite paints first and corrects only if the server disagrees.
      // favSet has to move with it, or the next repaint would paint the card
      // back from a list fetched before the press.
      var next = !act.classList.contains('is-on');
      if (favSet) { if (next) favSet[st.slug] = 1; else delete favSet[st.slug]; }
      toggleFavorite(st, act);
    } else if (kind === 'thumb') {
      var on = !act.classList.contains('is-on');
      paintThumb(act, on);
      setThumb(st.slug, on);
      sendFeedback(st, on ? 'thumb_up' : 'thumb_clear');
    } else if (kind === 'details') {
      go(STATION_PREFIX + st.slug);
    }
  });

  document.addEventListener('keydown', function (e) {
    // Escape leaves an article the way it left the dialog before it.
    if (e.key === 'Escape' && location.hash.slice(1).indexOf(STATION_PREFIX) === 0) go(currentSection);
  });

  var typing = null;
  /* THE HEADER BOX LEAVES THE SITE NOW — see app/_site-header.js. It used to
     filter the station index here as you typed; searching is JubileeSearch's
     job, and one box that means one thing everywhere beats a box that means
     something different on each page. renderSearch() is still reachable
     through ?q= below, so a link into the index by query keeps working. */

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
  var innerEl = scrollEl.querySelector('.scroll-inner');
  var heroH = 0;
  var heroBleed = -1;

  function sizeHero() {
    /* Rounded up: half a pixel short is a visible hairline of page background
       above the player, half a pixel long is half a pixel of scroll. */
    var h = Math.ceil(scrollEl.getBoundingClientRect().height);
    if (h && h !== heroH) {
      heroH = h;
      document.documentElement.style.setProperty('--hero-h', h + 'px');
    }

    /* THE SIDE PADDING THE PAGE ACTUALLY GOT, so the hero can pull back exactly
       that much and run edge to edge. .scroll-inner centres the page by padding
       — max(--pad-x, (100% - --site-max)/2 + --pad-x) — which is 186px a side at
       1920, and the stylesheet cannot cancel it from inside .hero: the same
       percentage means different things in the two boxes. Measured here instead,
       for the same reason the height is. See .hero in home.css.

       Width and height change independently: a window that gets wider without
       getting shorter moves this and not --hero-h, so it is deliberately not
       behind the height's early-out. */
    if (innerEl) {
      var pad = Math.round(parseFloat(getComputedStyle(innerEl).paddingLeft) || 0);
      if (pad !== heroBleed) {
        heroBleed = pad;
        document.documentElement.style.setProperty('--hero-bleed', pad + 'px');
      }
    }
  }

  sizeHero();
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(sizeHero).observe(scrollEl);
  }
  /* Belt and braces for browsers without ResizeObserver, and for the zoom
     changes some of them report only on the window. */
  window.addEventListener('resize', sizeHero);
  window.addEventListener('orientationchange', sizeHero);

  /* The copyright year is rendered by <Year /> (app/_year.js) now, from the
     viewer's own clock. This line filled a `<span id="year">` that no longer
     exists, and left as-is it would throw on a null element and take the rest
     of this bootstrap — including route() below — down with it. */
  if (!fromQuery()) route();

  // After the first render, so there are cards to paint.
  watchCardActions();
  loadFavorites();
})();
