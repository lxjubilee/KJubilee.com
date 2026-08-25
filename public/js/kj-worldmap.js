/*
 * kj-worldmap.js — the world, drawn from boundary data rather than shipped as a
 * picture.
 *
 * WHAT IT DRAWS FROM
 *
 * public/data/world-110m.json and world-50m.json, produced by
 * tools/build-world-map.js from Natural Earth (public domain). Each country is
 * a name and a list of closed lon/lat rings. The TopoJSON arc encoding those
 * files came from is already undone at build time, so there is no mapping
 * library here — a projection and a path builder is the whole of it.
 *
 * COARSE FIRST, THEN FINE. 110m paints immediately (66 KB gzipped); 50m arrives
 * behind it (545 KB) and replaces the paths in place. A visitor sees a map at
 * once and a sharper one a moment later, rather than an empty panel either way.
 *
 * PROJECTION: equirectangular, lon/lat straight onto x/y. It makes the inverse
 * trivial — needed for pointer-anchored zoom — and on a wall-map panel its
 * distortion is the familiar one people already read maps in.
 *
 * MARKERS ARE NOT PART OF THE TERRAIN. Every shape here scales with the map
 * except the dots, which are held at a constant SCREEN size however large the
 * map is drawn and however far it is zoomed. See layoutDots: a marker is a
 * piece of interface furniture, and furniture that grows with the map stops
 * being clickable at one end of the range and swallows a continent at the other.
 */
(function () {
    'use strict';

    var W = 2000, H = 1000;           // projected units; the full sphere
    var MIN_ZOOM = 1, MAX_ZOOM = 14;

    // THE VISIBLE BAND, which is not the whole sphere.
    //
    // An equirectangular world is 180° tall and this map is about none of the
    // first or last thirty of them. Nothing lives above 83.5°N, and below about
    // 58°S there is only Antarctica — a continent the size of the frame's whole
    // bottom third, carrying no broadcast location and pushing everything that
    // does carry one up into a band half the height it could have.
    //
    // So the window is cropped at both ends and the map fills the panel instead.
    // The projection is untouched; only the view onto it moves.
    //
    // THE BOTTOM LINE IS SET BY THE DATA, not by eye: 825 is the southernmost
    // land outside Antarctica (Cape Horn and the islands below it) and 742 is
    // the southernmost tower, Christchurch. 832 clears both with room to spare,
    // so nothing that matters is ever cut off. Re-check these if the roster
    // gains a station further south.
    var VIEW_TOP = 34, VIEW_BOT = 832, VIEW_H = VIEW_BOT - VIEW_TOP;

    function project(lon, lat) {
        return [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
    }

    /**
     * One ring, already unwrapped, as a subpath — optionally shifted a whole
     * world to the left or right.
     *
     * Points closer together than a fifth of a projected unit are dropped: at
     * 50m detail a coastline can carry several points inside one pixel, and
     * emitting them triples the path string for something no screen can show.
     */
    function subpath(ring, shiftDeg) {
        var d = '', j, p, x, y, px = null, py = null;
        for (j = 0; j < ring.length; j++) {
            p = project(ring[j][0] + shiftDeg, ring[j][1]);
            x = Math.round(p[0] * 10) / 10;
            y = Math.round(p[1] * 10) / 10;
            if (px !== null && Math.abs(x - px) < 0.2 && Math.abs(y - py) < 0.2 && j !== ring.length - 1) continue;
            d += (d ? 'L' : 'M') + x + ' ' + y;
            px = x; py = y;
        }
        return d ? d + 'Z' : '';
    }

    /**
     * One country's rings as a single path.
     *
     * THE ANTIMERIDIAN, which is what put a line straight across the map.
     *
     * Russia and Fiji each have a ring that runs off the east edge of the world
     * at +180° and resumes at -180°. Projected naively, the step between those
     * two points becomes one segment spanning the entire width — a horizontal
     * rule ruled across everything at Russia's latitude near the top, and again
     * through Fiji in the middle.
     *
     * WHAT IDENTIFIES A CROSSING is a jump between CONSECUTIVE points, not the
     * width of the ring. That distinction matters: Antarctica also spans the
     * full -180..180, but continuously, because it wraps the pole. Testing the
     * ring's total span condemns it as a crossing, and "fixing" it by shifting
     * the western half introduces the very discontinuity the test was looking
     * for — a sweep line at 71°S where there had been none.
     *
     * So the ring is walked instead, and a whole world added or subtracted at
     * each jump to make the longitudes continuous. A genuinely crossing ring
     * comes out running past ±180 and is drawn twice, one world apart, so both
     * halves appear on the correct edges; the viewport clips the rest. A polar
     * ring is left exactly as it was.
     */
    function pathFor(rings) {
        var d = '', i, k, r, lon, prev, off, cont, lo, hi;
        for (i = 0; i < rings.length; i++) {
            r = rings[i];
            cont = new Array(r.length);
            off = 0;
            prev = null;
            lo = Infinity; hi = -Infinity;
            for (k = 0; k < r.length; k++) {
                lon = r[k][0];
                if (prev !== null) {
                    // A step of more than half the globe is the seam, not travel.
                    if (lon - prev > 180) off -= 360;
                    else if (lon - prev < -180) off += 360;
                }
                prev = lon;
                cont[k] = [lon + off, r[k][1]];
                if (cont[k][0] < lo) lo = cont[k][0];
                if (cont[k][0] > hi) hi = cont[k][0];
            }
            d += subpath(cont, 0);
            // Only a ring that now reaches past an edge needs its twin.
            if (hi > 180) d += subpath(cont, -360);
            if (lo < -180) d += subpath(cont, 360);
        }
        return d;
    }

    /** Meridians and parallels every 20°, for the instrument-panel look. */
    function graticule() {
        var d = '', lon, lat;
        for (lon = -180; lon <= 180; lon += 20) {
            var a = project(lon, 84), b = project(lon, -90);
            d += 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'L' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
        }
        for (lat = -80; lat <= 80; lat += 20) {
            var c = project(-180, lat), e = project(180, lat);
            d += 'M' + c[0].toFixed(1) + ' ' + c[1].toFixed(1) + 'L' + e[0].toFixed(1) + ' ' + e[1].toFixed(1);
        }
        return d;
    }

    /**
     * A repeatable number from a string, for giving each marker its own rhythm.
     *
     * Math.random would do, but this is derived from the marker's own label, so
     * a city keeps the same pulse across reloads and across everyone's screen.
     * The map looks alive rather than shuffled, and the animation is something a
     * test can assert about instead of something that happens to be different
     * every run. FNV-1a: small, well spread, and no dependency.
     */
    function hash(str) {
        var h = 2166136261, i;
        for (i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
        }
        return h >>> 0;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function KJWorldMap(host, opts) {
        opts = opts || {};
        this.host = host;
        this.onPick = opts.onPick || function () {};
        this.dotPx = opts.dotPx || 5;          // marker radius, in real screen pixels
        this.zoom = 1;
        this.cx = W / 2;                        // the point held at the centre of the view
        this.cy = VIEW_TOP + VIEW_H / 2;
        this.markers = [];
        this.build();
    }

    KJWorldMap.prototype.build = function () {
        this.host.innerHTML =
            '<div class="kjmap-viewport">' +
              '<svg class="kjmap-svg" viewBox="0 ' + VIEW_TOP + ' ' + W + ' ' + VIEW_H + '" preserveAspectRatio="xMidYMid meet" ' +
                   'role="img" aria-label="World map of Heavenly Modulation broadcast locations">' +
                '<rect class="kjmap-sea" x="0" y="' + VIEW_TOP + '" width="' + W + '" height="' + VIEW_H + '"></rect>' +
                '<g class="kjmap-pan">' +
                  '<path class="kjmap-grid" d="' + graticule() + '"></path>' +
                  '<g class="kjmap-land"></g>' +
                  '<g class="kjmap-dots"></g>' +
                '</g>' +
              '</svg>' +
              '<div class="kjmap-tip" hidden></div>' +
            '</div>';

        this.svg = this.host.querySelector('.kjmap-svg');
        this.pan = this.host.querySelector('.kjmap-pan');
        this.land = this.host.querySelector('.kjmap-land');
        this.dotLayer = this.host.querySelector('.kjmap-dots');
        this.tip = this.host.querySelector('.kjmap-tip');

        var self = this;

        // Wheel zooms about the POINTER, not the centre. Zooming to the middle
        // of the panel makes whatever you are looking at slide away.
        this.svg.addEventListener('wheel', function (e) {
            e.preventDefault();
            self.zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, self.pointAt(e));
        }, { passive: false });

        var dragging = false, lastX = 0, lastY = 0, moved = 0;
        this.svg.addEventListener('pointerdown', function (e) {
            dragging = true; moved = 0;
            lastX = e.clientX; lastY = e.clientY;
            try { self.svg.setPointerCapture(e.pointerId); } catch (err) {}
            self.svg.classList.add('is-dragging');
        });
        this.svg.addEventListener('pointermove', function (e) {
            if (dragging) {
                var k = self.unitsPerPixel();
                self.cx -= (e.clientX - lastX) * k;
                self.cy -= (e.clientY - lastY) * k;
                moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
                lastX = e.clientX; lastY = e.clientY;
                self.clamp();
                self.apply();
                return;
            }
            self.hover(e);
        });
        function endDrag(e) {
            if (!dragging) return;
            dragging = false;
            self.svg.classList.remove('is-dragging');
            try { self.svg.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        this.svg.addEventListener('pointerup', endDrag);
        this.svg.addEventListener('pointercancel', endDrag);
        this.svg.addEventListener('pointerleave', function (e) { endDrag(e); self.hideTip(); });

        // A drag that happens to finish over a marker must not also select it.
        this.dotLayer.addEventListener('click', function (e) {
            var g = e.target.closest ? e.target.closest('[data-i]') : null;
            if (!g || moved > 6) return;
            self.onPick(Number(g.getAttribute('data-i')));
        });

        // The markers' size depends on how large the map is drawn, so it has to
        // be recomputed whenever that changes — not only on zoom.
        if (window.ResizeObserver) {
            this.ro = new ResizeObserver(function () { self.layoutDots(); });
            this.ro.observe(this.host);
        } else {
            window.addEventListener('resize', function () { self.layoutDots(); });
        }
    };

    /** Projected units per screen pixel at the current zoom. */
    KJWorldMap.prototype.unitsPerPixel = function () {
        var box = this.svg.getBoundingClientRect();
        // preserveAspectRatio=meet: the limiting axis sets the scale.
        var scale = Math.min(box.width / W, box.height / VIEW_H) * this.zoom;
        return scale ? 1 / scale : 1;
    };

    /** Where in projected space a pointer event landed. */
    KJWorldMap.prototype.pointAt = function (e) {
        var box = this.svg.getBoundingClientRect();
        var k = this.unitsPerPixel();
        return [
            this.cx + (e.clientX - (box.left + box.width / 2)) * k,
            this.cy + (e.clientY - (box.top + box.height / 2)) * k,
        ];
    };

    KJWorldMap.prototype.clamp = function () {
        var halfH = W / (2 * this.zoom), halfV = VIEW_H / (2 * this.zoom);
        this.cx = Math.max(halfH, Math.min(W - halfH, this.cx));
        this.cy = Math.max(VIEW_TOP + halfV, Math.min(VIEW_TOP + VIEW_H - halfV, this.cy));
    };

    KJWorldMap.prototype.apply = function () {
        var t = 'translate(' + (W / 2) + ' ' + (VIEW_TOP + VIEW_H / 2) + ') scale(' + this.zoom + ') ' +
                'translate(' + (-this.cx) + ' ' + (-this.cy) + ')';
        this.pan.setAttribute('transform', t);
        this.host.style.setProperty('--kjmap-zoom', this.zoom);
        this.layoutDots();
        if (this.onZoom) this.onZoom(this.zoom);
    };

    /**
     * Hold every marker at exactly dotPx pixels, whatever the map is doing.
     *
     * The marker sits inside the panned group, so it inherits the zoom scale,
     * and the whole SVG is fitted to its box, so it inherits that scale too.
     * Dividing by both leaves a shape whose size on screen is fixed: the same
     * dot on a phone and on a wall display, at 1x and at 14x.
     */
    KJWorldMap.prototype.layoutDots = function () {
        if (!this.markers.length) return;
        var box = this.svg.getBoundingClientRect();
        if (!box.width || !box.height) return;              // not laid out yet
        var fit = Math.min(box.width / W, box.height / VIEW_H);
        var s = 1 / (fit * this.zoom);
        var nodes = this.dotLayer.childNodes;
        for (var i = 0; i < nodes.length; i++) {
            var m = this.markers[i];
            if (!m || !nodes[i].setAttribute) continue;
            nodes[i].setAttribute('transform',
                'translate(' + m.x.toFixed(1) + ' ' + m.y.toFixed(1) + ') scale(' + s.toFixed(4) + ')');
        }
    };

    KJWorldMap.prototype.zoomBy = function (factor, about) {
        var next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor));
        if (next === this.zoom) return;
        if (about) {
            // Hold `about` still: the point under the pointer stays put.
            var r = next / this.zoom;
            this.cx = about[0] + (this.cx - about[0]) / r;
            this.cy = about[1] + (this.cy - about[1]) / r;
        }
        this.zoom = next;
        this.clamp();
        this.apply();
    };

    KJWorldMap.prototype.reset = function () {
        this.zoom = 1; this.cx = W / 2; this.cy = VIEW_TOP + VIEW_H / 2;
        this.apply();
    };

    /** Centre on a lon/lat at a given zoom. */
    KJWorldMap.prototype.goTo = function (lon, lat, zoom) {
        var p = project(lon, lat);
        this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom || 4));
        this.cx = p[0]; this.cy = p[1];
        this.clamp();
        this.apply();
    };

    KJWorldMap.prototype.drawCountries = function (countries) {
        var out = [], i;
        for (i = 0; i < countries.length; i++) {
            out.push('<path class="kjmap-country" d="' + pathFor(countries[i].rings) +
                     '" data-name="' + esc(countries[i].name) + '"></path>');
        }
        this.land.innerHTML = out.join('');
    };

    /**
     * points: [{ lon, lat, label, sub, px }]
     *
     * "px" overrides the radius for one location, in the same real screen
     * pixels as dotPx — a way to say "this one matters more" that does not
     * break the rule a marker never changes size with the map. The override is
     * baked into the circle, so layoutDots goes on applying a single scale to
     * every marker and the emphasised one stays emphasised by the same ratio at
     * every zoom and every panel size.
     */
    KJWorldMap.prototype.drawDots = function (points) {
        var out = [], i, p, at, r, hv, dur, delay;
        this.markers = [];
        for (i = 0; i < points.length; i++) {
            p = points[i];
            at = project(p.lon, p.lat);
            r = p.px || this.dotPx;
            this.markers.push({ x: at[0], y: at[1], data: p });

            // EVERY TOWER BREATHES AT ITS OWN RATE. One shared animation makes
            // 347 markers blink in lockstep, which reads as a screensaver rather
            // than as a network — so each gets its own period and its own head
            // start, spread widely enough that no two neighbours visibly agree.
            //
            // 4.5–11.5 seconds, offset by up to a full period. Slow on purpose:
            // this is a map of standing infrastructure, and anything quicker
            // turns the page into a flicker of dots.
            hv = hash(p.label);
            dur = (4.5 + (hv % 7000) / 1000).toFixed(2);
            delay = (((hv >>> 13) % 11500) / 1000).toFixed(2);

            out.push(
                '<g class="kjmap-dot' + (p.px ? ' is-home' : '') + '" data-i="' + i + '" tabindex="0" role="button" ' +
                   'style="--pulse-dur:' + dur + 's;--pulse-delay:' + delay + 's" ' +
                   'aria-label="' + esc(p.label + (p.sub ? ' — ' + p.sub : '')) + '">' +
                  '<circle class="kjmap-dot-halo" r="' + (r * 2.6).toFixed(2) + '"></circle>' +
                  '<circle class="kjmap-dot-core" r="' + r.toFixed(2) + '"></circle>' +
                '</g>');
        }
        this.dotLayer.innerHTML = out.join('');
        this.layoutDots();
    };

    /** Ring a single marker — used when one is chosen from the list. */
    KJWorldMap.prototype.select = function (i) {
        var nodes = this.dotLayer.childNodes, k;
        for (k = 0; k < nodes.length; k++) {
            if (nodes[k].classList) nodes[k].classList.toggle('is-on', k === i);
        }
    };

    KJWorldMap.prototype.hover = function (e) {
        var t = e.target;
        var dot = t.closest ? t.closest('.kjmap-dot') : null;
        if (dot) {
            var m = this.markers[Number(dot.getAttribute('data-i'))];
            if (m) return this.showTip(e, '<strong>' + esc(m.data.label) + '</strong>' +
                (m.data.sub ? '<span>' + esc(m.data.sub) + '</span>' : ''));
        }
        if (t.classList && t.classList.contains('kjmap-country')) {
            return this.showTip(e, '<span>' + esc(t.getAttribute('data-name')) + '</span>');
        }
        this.hideTip();
    };

    KJWorldMap.prototype.showTip = function (e, html) {
        var box = this.host.getBoundingClientRect();
        this.tip.innerHTML = html;
        this.tip.hidden = false;
        this.tip.style.left = (e.clientX - box.left) + 'px';
        this.tip.style.top = (e.clientY - box.top) + 'px';
    };
    KJWorldMap.prototype.hideTip = function () { this.tip.hidden = true; };

    window.KJWorldMap = KJWorldMap;
    window.KJWorldMap.project = project;
})();
