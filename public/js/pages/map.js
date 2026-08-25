(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* THE HEADER IS THE HOME PAGE'S, so it has to behave like the home page's.
     Its category bar is built there from KJ_SECTIONS and routed by hash; here
     there is nothing to route to, so each one is a link back to that section of
     the home page. Same markup, same class, same look — a button that did
     nothing would be worse than a link that goes somewhere. */
  (function buildNav() {
    var SECTIONS = window.KJ_SECTIONS || [];
    function esc2(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function navHTML(secs) {
      return secs.map(function (sec) {
        var label = sec.navShort
          ? '<span class="nav-long">' + esc2(sec.nav) + '</span>' +
            '<span class="nav-short">' + esc2(sec.navShort) + '</span>'
          : esc2(sec.nav);
        return '<a class="nav-link" href="/#' + esc2(sec.id) + '">' + label + '</a>';
      }).join('');
    }
    var left = document.getElementById('nav'), right = document.getElementById('nav-right');
    if (left) left.innerHTML = navHTML(SECTIONS.filter(function (s) { return s.align !== 'right'; }));
    if (right) right.innerHTML = navHTML(SECTIONS.filter(function (s) { return s.align === 'right'; }));

    // Searching stations is something only the home page can do, so the box
    // hands the query over rather than pretending to search the map.
    var input = document.getElementById('q'), btn = document.getElementById('qbtn');
    function submit() {
      var v = (input.value || '').trim();
      if (v) location.href = '/?q=' + encodeURIComponent(v);
    }
    if (btn) btn.addEventListener('click', submit);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  })();

  var listEl = document.getElementById('list');
  var noteEl = document.getElementById('note');
  var findEl = document.getElementById('find');
  var towers = [];
  var regions = [];
  var chosen = -1;
  var summary = '';

  /* Markers drawn larger than the rest, keyed "City|CC" and given as a
     multiple of the base size.

     Sacramento is the origin: where the dial is run from. It is one edge
     location among 347 as far as Cloudflare is concerned, so nothing in the
     data marks it out — the emphasis is editorial and belongs here rather than
     in the roster the build produces. */
  var EMPHASIS = { 'Sacramento|US': 3 };

  // The base marker radius, in real screen pixels. Halved from 4.5: at 347
  // markers the map was reading as dots first and geography second, which is
  // backwards for a map of where the signal is.
  var DOT_PX = 2.25;

  var map = new window.KJWorldMap(document.getElementById('map'), {
    dotPx: DOT_PX,
    onPick: function (i) { choose(i, true); },
  });

  function choose(i, fromMap) {
    chosen = i;
    map.select(i);
    var t = towers[i];
    if (t && !fromMap) map.goTo(t.lon, t.lat, Math.max(map.zoom, 4));
    paintList(findEl.value);
    // The summary line stays put; which tower is selected is already said by
    // the highlighted row and the marker's own ring, so the footer does not need
    // to be spent on it.
    if (t && summary) {
      noteEl.innerHTML = summary + ' · <b>' + esc(t.city) + ', ' + esc(t.cc) + '</b>';
    }
  }

  function paintList(filter) {
    var q = String(filter || '').trim().toLowerCase();
    var shown = towers
      .map(function (t, i) { return { t: t, i: i }; })
      .filter(function (r) {
        if (!q) return true;
        return r.t.city.toLowerCase().indexOf(q) >= 0 || r.t.cc.toLowerCase().indexOf(q) >= 0;
      });

    if (!shown.length) {
      listEl.innerHTML = '<p class="side-empty">No broadcast location matches that.</p>';
      return;
    }

    var html = '', region = null;
    shown.forEach(function (r) {
      if (r.t.region !== region) {
        region = r.t.region;
        var n = shown.filter(function (x) { return x.t.region === region; }).length;
        html += '<div class="region-head">' + esc(region) + ' <b>' + n + '</b></div>';
      }
      html += '<button type="button" class="map-item' + (r.i === chosen ? ' is-on' : '') + '" data-i="' + r.i + '">' +
        '<img src="https://flagcdn.com/w40/' + esc(r.t.cc.toLowerCase()) + '.png" alt="" loading="lazy">' +
        '<span class="map-item-city">' + esc(r.t.city) + '</span>' +
        '<span class="map-item-cc">' + esc(r.t.cc) + '</span>' +
      '</button>';
    });
    listEl.innerHTML = html;
  }

  listEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]');
    if (b) choose(Number(b.getAttribute('data-i')), false);
  });
  findEl.addEventListener('input', function () { paintList(findEl.value); });

  document.getElementById('zoomIn').addEventListener('click', function () { map.zoomBy(1.5); });
  document.getElementById('zoomOut').addEventListener('click', function () { map.zoomBy(1 / 1.5); });
  document.getElementById('zoomReset').addEventListener('click', function () { map.reset(); });

  function load(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
      return r.json();
    });
  }

  /* COARSE FIRST, THEN FINE. The 110m outline is on screen in one round trip
     and the towers go on immediately after, so the page is useful before the
     detailed borders arrive. Loading only the fine set leaves the panel empty
     for as long as it takes, which on a phone looks broken. */
  load('/data/world-110m.json')
    .then(function (world) {
      map.drawCountries(world.countries);
      map.apply();
      return load('/data/hm-towers.json');
    })
    .then(function (doc) {
      towers = doc.towers;
      regions = doc.regions;
      map.drawDots(towers.map(function (t) {
        var mult = EMPHASIS[t.city + '|' + t.cc];
        return {
          lon: t.lon, lat: t.lat,
          label: t.city + ', ' + t.cc,
          sub: t.region,
          px: mult ? DOT_PX * mult : 0,
        };
      }));
      paintList('');
      // The counts are read from the roster rather than typed, so the line
      // cannot fall out of step with the map above it when towers are added.
      // The standfirst that used to sit under the title now leads the footer,
      // ahead of the tally. Both halves are built from the roster rather than
      // typed, so neither can fall out of step with the map above them.
      summary = towers.length + ' broadcast locations across ' + doc.countries +
        ' countries carry the whole dial. Drag to pan, scroll to zoom. ' +
        'Locations: <b>' + towers.length + '</b> AI Radio Towers · <b>' +
        doc.countries + '</b> Countries · <b>7.5 Billion</b> Circulation';
      noteEl.innerHTML = summary;
      // Only now — the map is usable, so the big file can take its time.
      return load('/data/world-50m.json');
    })
    .then(function (fine) {
      map.drawCountries(fine.countries);
      map.apply();
    })
    .catch(function (err) {
      // Whatever already drew stays on screen, which is why the order matters:
      // a failed fine layer still leaves a working map and a full roster.
      noteEl.textContent = 'Map data: ' + err.message;
    });
})();
