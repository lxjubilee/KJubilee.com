'use client';

/*
 * Session-owned scripts — loaded once per visit, never torn down.
 *
 * This is the other half of the boundary kj-nav.js drew. Page scripts are
 * page-owned and unwound on navigation (see use-page-script.js); the station
 * catalogue and the footer player are SESSION-owned, because the bar and its
 * <audio> have to outlive every page the listener walks through.
 *
 * Order is not optional here. kj-footer-player.js reads the catalogue at load
 * time:
 *
 *     var ALL = (window.KJ_STATIONS || []).slice();       // line 58
 *
 * so a player that loads first gets an empty dial and stays empty. React runs
 * child effects BEFORE parent effects, which means a layout cannot simply load
 * this before the page does — hence a cached promise every caller awaits rather
 * than an ordering assumption.
 */

const cache = new Map();

/** Load a classic script once per session; repeat calls get the same promise. */
export function loadOnce(src) {
    if (cache.has(src)) return cache.get(src);

    const p = new Promise((resolve) => {
        // Survives React StrictMode's double-effect and any earlier loader.
        const existing = document.querySelector(`script[data-kj-session="${src}"]`);
        if (existing) { resolve(); return; }

        const el = document.createElement('script');
        el.src = src;
        el.async = false;
        el.dataset.kjSession = src;
        el.addEventListener('load', () => resolve());
        el.addEventListener('error', () => {
            console.error('[session-scripts] failed to load', src);
            resolve();   // resolve anyway: a missing catalogue must not wedge the page
        });
        document.head.appendChild(el);
    });

    cache.set(src, p);
    return p;
}

/**
 * The station catalogue (window.KJ_MEMBERS / window.KJ_STATIONS).
 * Everything that reads it — the footer player and every page script — awaits
 * this first, so it is fetched exactly once no matter who asks.
 */
export function ensureCatalogue() {
    return loadOnce('/js/stations-data.js');
}

export default { loadOnce, ensureCatalogue };
