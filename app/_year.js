'use client';

import { useEffect, useRef } from 'react';

/*
 * THE CURRENT YEAR, READ FROM THE VIEWER'S OWN CLOCK.
 *
 * Every copyright line on the site renders this, so the year rolls over on its
 * own and nobody has to remember it each January.
 *
 * WHY NOT `{new Date().getFullYear()}` INLINE: that is evaluated wherever the
 * component runs, and half this site is prerendered. /sitemap is a static
 * server component, so an inline call there is the year THE BUILD RAN — it
 * said 2026 and would have kept saying 2026 into 2028 with nothing to show it
 * had gone stale.
 *
 * WHY THE DOM IS WRITTEN DIRECTLY, which is the unusual part and was arrived at
 * the hard way. Two state-based versions of this looked correct and shipped
 * wrong, both proved by moving the browser's clock to 2031 and watching the
 * footer keep saying 2026 on every page:
 *
 *   1. useState(() => new Date().getFullYear()) — on the client the initial
 *      state is ALREADY the viewer's year, so the effect set the value it
 *      already held, React bailed out of the re-render, and the server text
 *      stood.
 *   2. useState(null) with the effect setting the year — a genuine state
 *      change, and still no update: React had hydrated the node (the span
 *      carries a fiber) but suppressHydrationWarning makes it decline to
 *      reconcile that text against the server's.
 *
 * So the effect writes textContent itself. It runs once, after paint, and
 * nothing else ever re-renders this span, so there is no reconciliation to
 * fight with. The server still renders a year, which means the markup is never
 * blank for a crawler or a browser with JS off, and suppressHydrationWarning
 * keeps a legitimate New-Year-boundary difference out of the console.
 *
 * Verified by tmp/year-check.js, which fakes the browser's clock and asserts
 * the footer follows it.
 */
export default function Year() {
    const ref = useRef(null);

    useEffect(() => {
        const now = String(new Date().getFullYear());
        if (ref.current && ref.current.textContent !== now) {
            ref.current.textContent = now;
        }
    }, []);

    return (
        <span ref={ref} suppressHydrationWarning>
            {new Date().getFullYear()}
        </span>
    );
}
