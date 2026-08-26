(function () {
  'use strict';

  var STATIONS = (window.KJ_STATIONS || []).slice();
  var MEMBERS  = window.KJ_MEMBERS || [];
  var byMember = {};
  MEMBERS.forEach(function (m) { byMember[m.id] = m; });

  // Frequency order, low to high. `hm` is a display string ("088.70"), so it
  // has to be compared numerically - sorting the strings would break the
  // moment a frequency loses its leading zero.
  var FLAGSHIP = window.KJ_DEFAULT || '';
  STATIONS.sort(function (a, b) { return parseFloat(a.hm) - parseFloat(b.hm); });

  /* ==================================================================
     THE CATEGORIES ARE THE HOME PAGE'S CATEGORIES.

     This page used to carry its own list of four sections with its own
     membership tests, written from the same intent as the home page's
     shelves but written separately. Two hand-maintained answers to "which
     category is this station in" is one too many: they had already drifted
     (different names on each page, and mainstream had to be patched into
     both by hand), and the next station added would have drifted them again.

     So the sections now come from window.KJ_SECTIONS — the very list the
     category bar above is built from and the home page renders. Membership
     is not re-derived here at all; each shelf already names its stations, so
     a station is in this section exactly when the home page puts it there.
     Change a shelf in tools/build-home-data.js and both pages move together.

     A station may appear in TWO sections, and that is deliberate rather than
     a bug to defend against: God's Little Lambs is Bible songs for small
     children and genuinely belongs under Christian Music and under Family
     Friendly. The old strict partition could not express that.
     ================================================================== */
  var SECTIONS = (window.KJ_SECTIONS || [])
    .filter(function (sec) { return sec.shelves && sec.shelves.length; })
    .map(function (sec) {
      // Flatten the shelves into one membership list. International Stations
      // is the only multi-shelf section (Americas, Europe, ... plus the
      // prayer lines); this page lists it as a single category, so its
      // sub-shelf headings collapse away.
      var slugs = {}, count = 0;
      sec.shelves.forEach(function (sh) {
        (sh.stations || []).forEach(function (slug) {
          if (!slugs[slug]) { slugs[slug] = 1; count++; }
        });
      });
      return {
        id: sec.id,
        // `catalog` is the name for this section when it is listed as a
        // category rather than navigated to — "Christian Music", not "Home".
        title: sec.catalog || sec.label || sec.nav,
        note: sec.note || '',
        has: slugs
      };
    });

  // Down the page in the same order as the category bar.
  var ORDER = SECTIONS.map(function (sec) { return sec.id; });

  var bucket = {};
  SECTIONS.forEach(function (sec) { bucket[sec.id] = []; });
  var orphans = [];
  STATIONS.forEach(function (s) {
    var placed = 0;
    SECTIONS.forEach(function (sec) {
      if (sec.has[s.slug]) { bucket[sec.id].push(s); placed++; }
    });
    if (!placed) orphans.push(s);
  });

  /* Nothing may vanish. The old last-section-claims-everything rule was what
     guaranteed that, and driving membership from the shelves gives it up — a
     station on no shelf would simply not be drawn. The generator already
     reports that condition at build time, but this page is where a reader
     would notice it, so it gets its own heading rather than going missing. */
  if (orphans.length) {
    SECTIONS.push({ id: 'unshelved', title: 'Also on the Dial',
                    note: 'Not yet assigned to a category', has: {} });
    ORDER.push('unshelved');
    bucket['unshelved'] = orphans;
  }

  // Anything ON AIR rises to the top of its own section - a listener scanning
  // for something to play should not have to hunt down a column of
  // placeholders for the two rows that make sound. Frequency order still
  // governs within each group, so the dial reads low-to-high on both sides of
  // the split rather than becoming arbitrary.
  Object.keys(bucket).forEach(function (id) {
    bucket[id].sort(function (a, b) {
      /* The flagship leads whichever section it falls in. kJubilee Radio is
         HM 308.70 and both rules below would otherwise bury it partway down
         Christian Music, beneath stations it is the flagship of. Which
         station that is comes from window.KJ_DEFAULT — the same value the
         player opens on and the hero leads with — never from the frequency,
         which is why renumbering the dial did not touch this rule. */
      if (a.slug === FLAGSHIP) return -1;
      if (b.slug === FLAGSHIP) return 1;
      if (!!a.prototype !== !!b.prototype) return a.prototype ? -1 : 1;
      return parseFloat(a.hm) - parseFloat(b.hm);
    });
  });

  var query = '';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Bumped whenever the artwork changes, because Cloudflare will happily hold a
     404 for four hours — including one caused by checking for a cover before it
     was uploaded. Keep this in step with index.html. */
  var COVER_V = '20260825a';

  /* Fade a cover in once it decodes, and drop it if it 404s so the ident
     gradient underneath shows through. Capture phase and delegated: load and
     error do not bubble, and the rows are rebuilt on every keystroke, so
     per-image handlers would be re-attached hundreds of times. */
  document.addEventListener('load', function (e) {
    var img = e.target;
    if (img.tagName === 'IMG' && img.parentNode && img.parentNode.classList.contains('swatch')) {
      img.classList.add('on');
    }
  }, true);
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (img.tagName === 'IMG' && img.parentNode && img.parentNode.classList.contains('swatch')) {
      img.remove();
    }
  }, true);

  /* The clock a base keeps, as an offset the reader can compare at a glance.
     Computed from the IANA zone rather than stored, so it stays right across a
     DST change instead of going an hour stale twice a year. */
  function utcLabel(tz) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, timeZoneName: 'shortOffset'
      }).formatToParts(new Date());
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'timeZoneName') return parts[i].value;
      }
    } catch (e) { /* an engine without shortOffset just gets no label */ }
    return '';
  }

  /* Where the station broadcasts from: the anchor on top, the relays beneath.
     The tooltip carries the editorial reason for the picks plus each base's
     current clock, which is the part a programmer actually needs and the part
     a 62px row has no space to print. */
  function basesHTML(s) {
    var list = s.bases || [];
    if (!list.length) return '<span class="relays">—</span>';

    var tip = list.map(function (b) {
      var off = utcLabel(b.tz);
      return b.city + ', ' + b.cc + (off ? ' (' + off + ')' : '')
        + (b.tower ? '' : ' — no HM tower');
    }).join('\n');
    if (s.basesWhy) tip += '\n\n' + s.basesWhy;

    var cell = function (b) {
      return b.tower ? esc(b.city)
        : '<span class="no-tower">' + esc(b.city) + '</span>';
    };
    return '<div class="anchor" title="' + esc(tip) + '">' + cell(list[0]) + '</div>' +
      (list.length > 1
        ? '<div class="relays" title="' + esc(tip) + '">' +
            list.slice(1).map(cell).join(' &middot; ') +
          '</div>'
        : '');
  }

  function rowHTML(s) {
    var host = byMember[s.host];
    var grad = s.gradient || ['#2d2d2d', '#3a3a3a'];
    return '<tr tabindex="0" data-slug="' + esc(s.slug) + '" ' +
             'aria-label="' + esc(s.name + ', HM ' + s.hm) + '">' +
        '<td class="hm"><span>HM</span>' + esc(s.hm) + '</td>' +
        '<td class="col-swatch"><div class="swatch" style="background:linear-gradient(135deg,' +
            esc(grad[0]) + ' 0%,' + esc(grad[1]) + ' 100%)">' +
            // No inline onload/onerror: those need nested quotes inside a
            // single-quoted JS string and one bad escape takes out the whole
            // script. A delegated capture-phase listener does it once for every
            // row instead — see coverWatch below.
            '<img alt="" loading="lazy" decoding="async" src="/cdn/stations/' +
              encodeURIComponent(s.slug) + '.webp?v=' + COVER_V + '">' +
          '</div></td>' +
        '<td><div class="name">' + esc(s.name) + '</div></td>' +
        // How many songs are in rotation. Blank rather than 0 for a station with
        // no catalog yet — "0 songs" reads as a broken station, an empty cell
        // reads as one that has not been programmed.
        '<td class="songs col-songs">' +
          (s.tracks ? esc(String(s.tracks).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : '<span class="dash">—</span>') +
        '</td>' +
        '<td class="format col-format">' + esc(s.format) + '</td>' +
        '<td class="lang col-lang">' +
          (s.flag ? '<img src="https://flagcdn.com/w40/' + esc(s.flag) + '.png" alt="" loading="lazy">' : '') +
          '<span>' + esc(s.lang) + '</span>' +
        '</td>' +
        '<td class="bases col-bases">' + basesHTML(s) + '</td>' +
        '<td class="host col-host">' +
          (host ? '<img src="' + esc(host.image) + '" alt="" loading="lazy">' : '') +
          '<span>' + esc(host ? host.short : '') + '</span>' +
        '</td>' +
        '<td class="status col-status">' +
          (s.prototype
            ? '<button class="onair" data-kj-play="' + esc(s.slug) + '" title="Play ' + esc(s.name) + '">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7z"></path></svg>On air</button>'
            : '<span class="soon">Coming soon</span>') +
        '</td>' +
      '</tr>';
  }

  function headHTML() {
    return '<thead><tr>' +
        '<th scope="col">Frequency</th>' +
        '<th scope="col" class="col-swatch"><span class="sr-only">Ident</span></th>' +
        '<th scope="col">Station</th>' +
        '<th scope="col" class="col-songs" style="text-align:right">Songs</th>' +
        '<th scope="col" class="col-format">Format</th>' +
        '<th scope="col" class="col-lang">Language</th>' +
        '<th scope="col" class="col-bases">Broadcasting</th>' +
        '<th scope="col" class="col-host">DJ Host</th>' +
        '<th scope="col" class="col-status" style="text-align:right">Status</th>' +
      '</tr></thead>';
  }

  function matches(s) {
    var q = query.trim().toLowerCase();
    if (!q) return true;
    // Match the things someone actually types: a dial number, a station name,
    // its format, its language — or a city it broadcasts from, which is how
    // someone asks "what comes out of Sacramento".
    var cities = (s.bases || []).map(function (b) { return b.city; }).join(' ');
    return (s.name + ' ' + s.hm + ' ' + s.format + ' ' + s.lang + ' ' + cities)
      .toLowerCase().indexOf(q) >= 0;
  }

  function sectionHTML(sec, list) {
    return '<section class="section" id="' + sec.id + '"' + (list.length ? '' : ' hidden') + '>' +
        '<div class="section-head">' +
          '<h2 class="section-title">' + esc(sec.title) + '</h2>' +
          '<span class="section-count">' + list.length + ' station' + (list.length === 1 ? '' : 's') + '</span>' +
          '<span class="section-note">' + esc(sec.note) + '</span>' +
        '</div>' +
        '<table class="dial">' + headHTML() +
          '<tbody>' + list.map(rowHTML).join('') + '</tbody>' +
        '</table>' +
      '</section>';
  }

  function render() {
    var shown = 0;
    var html = ORDER.map(function (id) {
      var sec = SECTIONS.filter(function (x) { return x.id === id; })[0];
      var list = bucket[id].filter(matches);
      shown += list.length;
      return sectionHTML(sec, list);
    }).join('');
    document.getElementById('sections').innerHTML = html;
    document.getElementById('empty').hidden = shown > 0;
    // A search can empty the section the bar is pointing at, so the highlight
    // is re-derived from what survived rather than left on a heading that is
    // now display:none.
    syncActive();
  }

  /* THE SITE'S CATEGORY BAR, built from the same KJ_SECTIONS the home page uses
     so the row reads identically everywhere.

     Where it differs is what the links DO. On the home page they route to a
     shelf; here the same four groupings are already on the page, so they jump to
     the section instead of leaving for a page that shows less. The band
     explainer has no counterpart here and goes home.

     WHICH section a category is is no longer translated. This used to hold a
     hand-written map from nav id to on-page id (home -> 'christian-music', and
     so on) and all four of those targets had been renamed out from under it:
     sectionHTML draws each section with sec.id straight from KJ_SECTIONS, so
     every href pointed at an anchor that did not exist and the whole bar was
     dead. ORDER already lists the ids this page really rendered, so ask it
     rather than keep a second answer that can drift again.

     Same markup, same classes, same appearance — the behaviour follows the page
     rather than the page following the markup. */
  var ON_PAGE = {};
  ORDER.forEach(function (id) { ON_PAGE[id] = 1; });

  var navLinks = [];

  (function buildNav() {
    var SITE = window.KJ_SECTIONS || [];
    function navHTML(secs) {
      return secs.map(function (sec) {
        var label = sec.navShort
          ? '<span class="nav-long">' + esc(sec.nav) + '</span>' +
            '<span class="nav-short">' + esc(sec.navShort) + '</span>'
          : esc(sec.nav);
        var here = ON_PAGE[sec.id];
        var href = here ? '#' + sec.id : '/#' + sec.id;
        return '<a class="nav-link" href="' + esc(href) + '"' +
               (here ? ' data-section="' + esc(sec.id) + '"' : '') + '>' +
               label + '</a>';
      }).join('');
    }
    var left = document.getElementById('nav'), right = document.getElementById('nav-right');
    if (left) left.innerHTML = navHTML(SITE.filter(function (x) { return x.align !== 'right'; }));
    if (right) right.innerHTML = navHTML(SITE.filter(function (x) { return x.align === 'right'; }));
    navLinks = [].slice.call(document.querySelectorAll('.nav-link[data-section]'));
  })();

  /* Clicking a category lights it up and goes to it, the way the home page's
     bar does. The scroll is done by hand rather than left to the anchor: the
     list lives inside .scroll rather than in the document, arriving wants the
     same easing the home page's view change has, and a section emptied by the
     search filter is [hidden] and has nothing for the browser to land on. */
  var scroller = document.querySelector('.scroll');

  function setActive(id) {
    navLinks.forEach(function (a) {
      var on = a.getAttribute('data-section') === id;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  function goToSection(id, behavior) {
    if (!id || !ON_PAGE[id] || !scroller) return false;
    var el = document.getElementById(id);
    if (!el || el.hidden) return false;
    var top = el.getBoundingClientRect().top
            - scroller.getBoundingClientRect().top
            + scroller.scrollTop
            - 14;                       // matches .section scroll-margin-top
    scroller.scrollTo({ top: Math.max(0, top), behavior: behavior || 'smooth' });
    setActive(id);
    return true;
  }

  /* The highlight follows the page as well as the click, so scrolling and the
     bar never disagree about where you are. Whichever section owns the top of
     the list wins; above the first one, the first one is still where you are. */
  function syncActive() {
    if (!scroller || !navLinks.length) return;
    var line = scroller.getBoundingClientRect().top + 24;
    var current = '', first = '', last = '';
    ORDER.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.hidden) return;
      if (!first) first = id;
      if (el.getBoundingClientRect().top <= line) current = id;
      last = id;
    });
    // At the end of the list the final section can be too short to ever reach
    // the top line, and would hand the highlight back to the one above it the
    // moment the smooth scroll settled. Scrolled to the bottom is as far as it
    // can be got to, so there it wins.
    if (last && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) current = last;
    setActive(current || first);
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.nav-link[data-section]');
    if (!a) return;
    var id = a.getAttribute('data-section');
    e.preventDefault();
    // replaceState, not location.hash: the hash is here so a category can be
    // linked and reloaded into, and assigning it makes the browser jump to the
    // anchor instantly and race the smooth scroll below. Nor should four
    // in-page jumps pile up as four presses of the Back button.
    if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);
    if (!goToSection(id)) setActive(id);
  });

  // Somebody else's hash change — Back into a category, or a pasted link.
  window.addEventListener('hashchange', function () {
    goToSection(decodeURIComponent(location.hash.slice(1)));
  });

  if (scroller) {
    var ticking = false;
    scroller.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; syncActive(); });
    }, { passive: true });
  }

  document.getElementById('qbtn').addEventListener('click', function () {
    query = document.getElementById('q').value;
    render();
  });

  document.getElementById('q').addEventListener('input', function () {
    query = this.value;
    render();
  });

  // Delegated from the container, because the sections are re-rendered on
  // every keystroke.
  //
  // An ON AIR station plays in the footer bar rather than navigating away: the
  // bar follows the listener across the site, and the station is delivered from
  // its own published day file (guidelines 2.5) rather than from a mount, so
  // there is nothing to navigate to. A station not yet on air has no
  // programming to play and still opens the player page for its detail.
  function open(slug) {
    if (!slug) return;
    if (window.kjPlayer && window.kjPlayer.isLive(slug)) { window.kjPlayer.play(slug); return; }
    location.href = '/radio?station=' + encodeURIComponent(slug);
  }
  var host = document.getElementById('sections');
  host.addEventListener('click', function (e) {
    // The On air button is handled by the footer player's own delegated
    // listener. This one runs first, being nearer the target, so without this
    // guard it would navigate out from under the audio the button just started.
    if (e.target.closest('[data-kj-play]')) return;
    var tr = e.target.closest('tr[data-slug]');
    if (tr) open(tr.getAttribute('data-slug'));
  });
  host.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('[data-kj-play]')) return;  // the button raises its own click
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    e.preventDefault();
    open(tr.getAttribute('data-slug'));
  });

  document.getElementById('year').textContent = new Date().getFullYear();
  document.getElementById('stat').textContent =
    STATIONS.length + ' stations · HM ' + STATIONS[0].hm + ' – HM ' + STATIONS[STATIONS.length - 1].hm;

  render();

  /* Arriving on /stations#kids should open on Family Friendly. 'auto', not
     smooth: easing a page you have only just opened reads as a glitch. */
  if (!goToSection(decodeURIComponent(location.hash.slice(1)), 'auto')) syncActive();
})();
