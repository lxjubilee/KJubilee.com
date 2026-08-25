/*
 * kj-nav.js — same-document navigation, so the music never stops.
 *
 * THE PROBLEM THIS EXISTS FOR. Every page on this site loads its own document,
 * and a document load destroys the <audio> element with it. A listener moving
 * from the home page to the station table hears the station cut out, then
 * resume a second or two later if the browser's autoplay policy allows — and on
 * Firefox, which blocks autoplay by default, it does not resume at all until
 * they click something. streaming-services.md §9.8 puts the requirement
 * plainly: "Audio must continue playing while the listener navigates the site…
 * A single stray anchor tag causing a full document load kills audio."
 *
 * So internal links stop loading documents. This fetches the target page, swaps
 * the parts of the current document that differ, and runs the new page's
 * scripts — while the footer player, its <audio> and its position in the
 * broadcast are left untouched. Nothing about the audio is saved and restored,
 * because nothing about it is ever torn down.
 *
 * ── why this is not simply "swap the body and re-run the scripts" ───────────
 *
 * Because every page script registers listeners on `document` and `window` and
 * none of them clean up. Re-running index.html's script after a round trip
 * would leave TWO copies of its click handler bound, and a click on a card's
 * play badge would toggle the station twice — play, then pause — which is
 * silence produced by the very thing meant to protect the audio.
 *
 * The fix is ownership, and it needed no change to any page script: the
 * registration functions themselves are wrapped here, before any page script
 * runs, and everything a page registers is unwound when that page goes away —
 * listeners, intervals, timeouts and ResizeObservers.
 *
 * ── the boundary, and why it is where it is ─────────────────────────────────
 *
 * Registrations default to SESSION-owned, and only what a page registers is
 * page-owned. The window in which that is true has to be marked out exactly,
 * because a deferred script runs AFTER the inline ones:
 *
 *   1. this file, in <head>, classic     opens the page window
 *   2. the page's own inline scripts      tracked, and torn down on leaving
 *   3. kj-nav-page-done, end of <body>    closes the page window
 *   4. the footer player, deferred        session-owned, never torn down
 *
 * Step 3 is a real tag in each page and not an implementation detail that can
 * be dropped: without it the player loads inside the page window, and the first
 * link a listener clicks unbinds the player's own listeners.
 *
 * The player is injected from here rather than from a tag in each page for the
 * same reason — from here it can be placed after the boundary on purpose.
 *
 * ── deliberately NOT handled ────────────────────────────────────────────────
 *
 *   /radio       runs its own full player and switches this one off, so a
 *                document load there is correct and those links are left alone.
 *   a refresh    nothing can carry audio through F5. The player's own resume
 *                path covers that; this layer never sees it.
 *   no fetch,
 *   no pushState the layer stands down, links behave normally, player still loads.
 */
(function () {
    'use strict';

    var PLAYER_SRC = '/js/kj-footer-player.js';
    var NAV_SRC    = '/js/kj-nav.js';

    function isRadio(pathname) {
        var p = (pathname || '').toLowerCase();
        return p === '/radio' || p === '/radio/' || p.indexOf('/radio.html') >= 0;
    }

    // The radio page runs its own player and this layer would fight it.
    if (isRadio(location.pathname)) return;

    // ── ownership ───────────────────────────────────────────────────────────
    //
    // Session-owned by default. `pageOwned` is true only while the scripts that
    // belong to the page on screen are running.
    var pageOwned = false;
    var owned = { listeners: [], intervals: [], timeouts: [], observers: [] };

    function wrapAdd(target) {
        var native = target.addEventListener;
        if (!native) return;
        target.addEventListener = function (type, handler, options) {
            if (pageOwned) owned.listeners.push([target, type, handler, options]);
            return native.call(target, type, handler, options);
        };
    }
    wrapAdd(window);
    wrapAdd(document);

    var nativeSetInterval = window.setInterval;
    var nativeSetTimeout  = window.setTimeout;
    window.setInterval = function () {
        var id = nativeSetInterval.apply(window, arguments);
        if (pageOwned) owned.intervals.push(id);
        return id;
    };
    window.setTimeout = function () {
        var id = nativeSetTimeout.apply(window, arguments);
        if (pageOwned) owned.timeouts.push(id);
        return id;
    };

    // A ResizeObserver left watching a detached element is not an error, just
    // work nobody asked for — and index.html's hero sizer would leave one per
    // visit.
    if (typeof window.ResizeObserver === 'function') {
        var NativeRO = window.ResizeObserver;
        var TrackedRO = function (cb) {
            var ro = new NativeRO(cb);
            if (pageOwned) owned.observers.push(ro);
            return ro;
        };
        TrackedRO.prototype = NativeRO.prototype;
        window.ResizeObserver = TrackedRO;
    }

    function releasePage() {
        owned.listeners.forEach(function (l) {
            try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (e) {}
        });
        owned.intervals.forEach(function (id) { try { clearInterval(id); } catch (e) {} });
        owned.timeouts.forEach(function (id) { try { clearTimeout(id); } catch (e) {} });
        owned.observers.forEach(function (o) { try { o.disconnect(); } catch (e) {} });
        owned = { listeners: [], intervals: [], timeouts: [], observers: [] };
    }

    var capable = !!(window.fetch && window.history && window.history.pushState &&
                     window.DOMParser && document.querySelector && window.Promise);

    // ── swapping one page for another ───────────────────────────────────────

    var KEEP_HEAD = 'kj-footer-player-css';   // the player's injected stylesheet
    var PLAYER_ID = 'kjPlayer';               // the bar itself

    function isSrc(src, name) { return !!src && src.indexOf(name) >= 0; }

    /* Run the incoming document's scripts in order, waiting for each external
       one, so a page script never runs before the data it reads.

       The player and this file are skipped: both are already running, and a
       second copy of either would be a second session. */
    function runScripts(scripts) {
        var i = 0;
        function next() {
            if (i >= scripts.length) return Promise.resolve();
            var old = scripts[i++];
            var src = old.getAttribute('src');
            if (isSrc(src, PLAYER_SRC) || isSrc(src, NAV_SRC)) return next();

            return new Promise(function (done) {
                var s = document.createElement('script');
                for (var a = 0; a < old.attributes.length; a++) {
                    var at = old.attributes[a];
                    if (at.name === 'defer' || at.name === 'async') continue;
                    s.setAttribute(at.name, at.value);
                }
                if (src) {
                    s.onload = s.onerror = function () { done(); };
                    old.parentNode.replaceChild(s, old);
                } else {
                    s.textContent = old.textContent;
                    old.parentNode.replaceChild(s, old);
                    done();
                }
            }).then(next);
        }
        return next();
    }

    function swap(doc) {
        releasePage();

        // ---- head: keep the player's stylesheet, take everything else new ---
        var keep = document.getElementById(KEEP_HEAD);
        var head = document.head;
        Array.prototype.slice.call(head.childNodes).forEach(function (n) {
            if (n !== keep) head.removeChild(n);
        });
        Array.prototype.slice.call(doc.head.childNodes).forEach(function (n) {
            if (n.tagName === 'SCRIPT') return;      // head scripts run with the body's
            head.appendChild(document.importNode(n, true));
        });

        // ---- body: keep the player bar, take everything else new ------------
        var bar = document.getElementById(PLAYER_ID);
        var body = document.body;
        Array.prototype.slice.call(body.childNodes).forEach(function (n) {
            if (n !== bar) body.removeChild(n);
        });

        // The class list belongs to the incoming page, except the flag saying a
        // player bar is present — that is a fact about the session, and losing
        // it takes the space reserved for the bar with it.
        var hadPlayer = body.classList.contains('kj-has-player');
        body.className = doc.body.className;
        if (hadPlayer) body.classList.add('kj-has-player');

        var frag = document.createDocumentFragment();
        Array.prototype.slice.call(doc.body.childNodes).forEach(function (n) {
            frag.appendChild(document.importNode(n, true));
        });
        if (bar) body.insertBefore(frag, bar); else body.appendChild(frag);

        document.title = doc.title || document.title;
        window.scrollTo(0, 0);

        pageOwned = true;
        return runScripts(Array.prototype.slice.call(body.querySelectorAll('script')))
            .then(function () { pageOwned = false; });
    }

    var busy = false;

    function navigate(href, push) {
        if (busy) return Promise.resolve();
        busy = true;
        document.documentElement.classList.add('kj-navigating');

        return fetch(href, { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                if ((r.headers.get('content-type') || '').indexOf('text/html') < 0) {
                    throw new Error('not a page');
                }
                return r.text();
            })
            .then(function (html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                if (push) history.pushState({ kjnav: 1 }, '', href);
                return swap(doc);
            })
            .catch(function () {
                // A half-swapped page is worse than a reload. A reload costs the
                // audio, which is the whole point of this file — but it is the
                // lesser loss when the alternative is a broken page.
                pageOwned = false;
                location.href = href;
            })
            .then(function () {
                busy = false;
                document.documentElement.classList.remove('kj-navigating');
            });
    }

    if (capable) {
        document.addEventListener('click', function (e) {
            if (e.defaultPrevented || e.button !== 0) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

            var a = e.target.closest && e.target.closest('a[href]');
            if (!a || a.hasAttribute('download')) return;
            if (a.target && a.target !== '' && a.target !== '_self') return;

            var url;
            try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
            if (url.origin !== location.origin) return;
            if (isRadio(url.pathname)) return;         // its own player; let it load

            // A hash link inside the page currently open is that page's own
            // business — index.html routes its sections and its station
            // articles that way, without touching the document.
            if (url.pathname === location.pathname && url.search === location.search && url.hash) return;

            e.preventDefault();
            navigate(url.href, true);
        });

        window.addEventListener('popstate', function () {
            if (isRadio(location.pathname)) { location.reload(); return; }
            navigate(location.href, false);
        });
    }

    // ── the player, and the page boundary ───────────────────────────────────
    //
    // Injected here so it lands AFTER the page window closes: a deferred script
    // runs once parsing is done, which is after kj-nav-page-done has fired.
    var player = document.createElement('script');
    player.src = PLAYER_SRC;
    player.defer = true;
    document.head.appendChild(player);

    // Everything from here until the page-done tag belongs to the page.
    pageOwned = true;

    window.KJNav = {
        /* Called by the tag at the end of every page's body. Closes the window
           in which registrations are treated as the page's. */
        pageDone: function () { pageOwned = false; },
        navigate: function (href) { return navigate(href, true); },
        /* For anything that must outlive the page it was created on. */
        persist: function (fn) {
            var was = pageOwned;
            pageOwned = false;
            try { return fn(); } finally { pageOwned = was; }
        }
    };
})();
