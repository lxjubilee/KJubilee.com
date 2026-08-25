'use client';

import { useEffect } from 'react';
import { ensureCatalogue } from './session-scripts';

/*
 * usePageScripts — run a legacy page's scripts in order, then unwind everything
 * they registered when the page unmounts.
 *
 * THIS IS THE REACT PORT OF public/js/kj-nav.js's OWNERSHIP MODEL, and it
 * exists for exactly the reason that file documents:
 *
 *   "every page script registers listeners on `document` and `window` and none
 *    of them clean up. Re-running index.html's script after a round trip would
 *    leave TWO copies of its click handler bound, and a click on a card's play
 *    badge would toggle the station twice — play, then pause — which is silence
 *    produced by the very thing meant to protect the audio."
 *
 * Next's router does what kj-nav.js did — it moves between pages without a
 * document load, so the <audio> mounted in the root layout is never torn down —
 * but it does NOT solve that second problem. Navigating stations → home →
 * stations would run the stations script twice and double-bind every listener.
 * So the wrapping comes across: addEventListener, setInterval, setTimeout and
 * ResizeObserver are wrapped while the page's scripts load, and everything they
 * registered is released on unmount.
 *
 * The boundary kj-nav.js marked with a <script>KJNav.pageDone()</script> tag at
 * the end of each body is this effect's lifetime instead: what the page scripts
 * register is page-owned, and the footer player mounted in the root layout is
 * session-owned and never touched.
 *
 * Scripts load STRICTLY IN ORDER and each waits for the one before it, because
 * a page script must never run before the data it reads — kj-nav.js's runScripts
 * made the same guarantee.
 */
export function usePageScripts(srcs) {
    // A stable key, so passing a fresh array literal each render does not
    // re-run the effect and double-bind everything it exists to prevent.
    const key = Array.isArray(srcs) ? srcs.join('|') : String(srcs || '');

    useEffect(() => {
        const list = key ? key.split('|').filter(Boolean) : [];
        if (!list.length) return undefined;

        let cancelled = false;
        const added = [];
        const owned = { listeners: [], intervals: [], timeouts: [], observers: [] };

        // ── take ownership ──────────────────────────────────────────────────
        const nativeWindowAdd = window.addEventListener;
        const nativeDocumentAdd = document.addEventListener;
        const nativeSetInterval = window.setInterval;
        const nativeSetTimeout = window.setTimeout;
        const NativeRO = window.ResizeObserver;

        function wrapAdd(target, native) {
            target.addEventListener = function (type, handler, options) {
                owned.listeners.push([target, type, handler, options]);
                return native.call(target, type, handler, options);
            };
        }
        wrapAdd(window, nativeWindowAdd);
        wrapAdd(document, nativeDocumentAdd);

        window.setInterval = function (...args) {
            const id = nativeSetInterval.apply(window, args);
            owned.intervals.push(id);
            return id;
        };
        window.setTimeout = function (...args) {
            const id = nativeSetTimeout.apply(window, args);
            owned.timeouts.push(id);
            return id;
        };

        // A ResizeObserver left watching a detached element is not an error,
        // just work nobody asked for — and the home page's hero sizer would
        // leave one per visit.
        if (typeof NativeRO === 'function') {
            const TrackedRO = function (cb) {
                const ro = new NativeRO(cb);
                owned.observers.push(ro);
                return ro;
            };
            TrackedRO.prototype = NativeRO.prototype;
            window.ResizeObserver = TrackedRO;
        }

        function restoreGlobals() {
            window.addEventListener = nativeWindowAdd;
            document.addEventListener = nativeDocumentAdd;
            window.setInterval = nativeSetInterval;
            window.setTimeout = nativeSetTimeout;
            if (typeof NativeRO === 'function') window.ResizeObserver = NativeRO;
        }

        // ── run them, in order ──────────────────────────────────────────────
        //
        // Real <script> tags, not imports: these are classic scripts that
        // declare globals and expect evaluation in page scope, exactly as they
        // were when they were inline in the HTML. The inline handlers in the
        // markup call those globals by bare name, so they must land on window.
        function loadNext(i) {
            if (cancelled || i >= list.length) {
                restoreGlobals();
                return;
            }
            const el = document.createElement('script');
            el.src = list[i];
            el.async = false;
            el.dataset.kjPageScript = '1';
            const go = () => loadNext(i + 1);
            el.addEventListener('load', go);
            el.addEventListener('error', () => {
                console.error('[usePageScripts] failed to load', list[i]);
                go();
            });
            added.push(el);
            document.body.appendChild(el);
        }

        // The catalogue is session-owned and shared, so it is awaited rather
        // than listed per page — every page script that reads window.KJ_STATIONS
        // then finds it already there, and it is fetched once per visit.
        ensureCatalogue().then(() => { if (!cancelled) loadNext(0); });

        return () => {
            cancelled = true;
            restoreGlobals();

            owned.listeners.forEach((l) => {
                try { l[0].removeEventListener(l[1], l[2], l[3]); } catch { /* detached */ }
            });
            owned.intervals.forEach((id) => { try { clearInterval(id); } catch { /* gone */ } });
            owned.timeouts.forEach((id) => { try { clearTimeout(id); } catch { /* gone */ } });
            owned.observers.forEach((o) => { try { o.disconnect(); } catch { /* gone */ } });

            added.forEach((el) => el.remove());
        };
    }, [key]);
}

export default usePageScripts;
