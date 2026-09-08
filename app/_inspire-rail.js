'use client';

import { useEffect, useState } from 'react';

/*
 * THE JUBILEEINSPIRE RAIL, MOUNTED ON EVERY KJUBILEE PAGE.
 *
 * A port of JubileeInspire.com's left sidebar — specifically the PUBLIC
 * variant, src/components/layout/PublicSidebar.tsx, not the signed-in one.
 * That is the deliberate choice: the signed-in rail's items (Bible Chat,
 * Video Chat, Group Chat, Ministry Apps, Chat History) are gated on a
 * JubileeInspire session and its role_permissions matrix, neither of which
 * exists on this domain. Its Chat History entry is not even a link — it
 * expands an authenticated conversation list from /api/conversations. Ported
 * here, those rows would have been four ways to arrive at a login screen.
 *
 * The four public entries below are the ones a signed-out visitor actually
 * gets on jubileeinspire.com, and all four work from here.
 *
 * EVERY HREF IS ABSOLUTE AND CROSS-DOMAIN. This rail's job is to be the way
 * back to JubileeInspire from kJubilee, so the links leave this site on
 * purpose. No opt-out marker is needed for them: _chrome.js's click rule,
 * which swallows internal anchors to keep the <audio> alive across a
 * navigation, already returns early on any href whose origin is not this
 * one — so these four load a document, which is what leaving a site is.
 *
 * Styling is public/css/inspire-rail.css — the two change together. The rail
 * carries its own palette there rather than inheriting kJubilee's, because
 * kJubilee redeclares :root in every page stylesheet with different values.
 */

const ORIGIN = 'https://www.jubileeinspire.com';

/* THE RAIL'S OWN MENU. It began as a copy of JubileeInspire's public sidebar
   (Home, Search, Chat Inbox, My Community) and is no longer one: these are the
   places a kJubilee reader is actually being pointed at, which is why the
   icons are no longer the original's glyphs either.

   ALL BUT ONE LEAVE THIS SITE. Jubilee Radio is
   kJubilee's own player, so it is a root-relative path; the rest are absolute
   and cross-domain, which is what stops _chrome.js from trying to route them
   inside this document (it returns early on any origin that is not this one).
*/
const NAV_ITEMS = [
    {
        key: 'newchat',
        label: 'New Chat',
        href: ORIGIN + '/chat?new=1',
        // Supplied artwork. Material Symbols grid (960 units, origin bottom
        // left) — see the note on the Bible References row for why the viewBox
        // travels with the path. The original's fill="#e3e3e3" is dropped so
        // the stylesheet can colour it.
        viewBox: '0 -960 960 960',
        icon: 'M120-160v-600q0-33 23.5-56.5T200-840h480q33 0 56.5 23.5T760-760v203q-10-2-20-2.5t-20-.5q-10 0-20 .5t-20 2.5v-203H200v400h283q-2 10-2.5 20t-.5 20q0 10 .5 20t2.5 20H240L120-160Zm160-440h320v-80H280v80Zm0 160h200v-80H280v80Zm400 280v-120H560v-80h120v-120h80v120h120v80H760v120h-80ZM200-360v-400 400Z',
    },
    {
        key: 'jsv',
        label: 'Bible Talks',
        // THE ONE ROW THAT IS NOT A BARE CROSS-DOMAIN LINK. It goes through
        // kJubilee's own route first (app/api/go/bible-talks/route.js), which
        // mints a one-time Jubilee ID ticket from this reader's sealed family
        // session and redirects on with it — so a member arrives at Bible Talks
        // already signed in rather than facing a login form for an account the
        // family already has. Signed out, it redirects to the same plain
        // https://jubileebibletalks.com this used to be.
        href: '/api/go/bible-talks',
        // Supplied artwork, Material Symbols 960 grid: an OPEN bible, pages
        // spread. It replaced a hand-built closed book with a cross knocked
        // out of the cover, which was the only icon needing an even-odd
        // fill to punch that hole — so that mode went with it.
        viewBox: '0 -960 960 960',
        icon: 'M260-319.23q49.69 0 96.69 11.27T450-272.61v-393.24q-42.15-27.46-91.23-41.19-49.08-13.73-98.77-13.73-36 0-67.27 5.65-31.27 5.66-64.27 18.5-4.61 1.54-6.54 4.43-1.92 2.88-1.92 6.34v378.31q0 5.39 3.85 7.89 3.84 2.5 8.46.57 28.46-9.69 60.07-14.92 31.62-5.23 67.62-5.23Zm250 46.62q46.31-24.08 93.31-35.35 47-11.27 96.69-11.27 36 0 67.62 5.23 31.61 5.23 60.07 14.92 4.62 1.93 8.46-.57 3.85-2.5 3.85-7.89v-378.31q0-3.46-1.92-6.15-1.93-2.69-6.54-4.62-33-12.84-64.27-18.5-31.27-5.65-67.27-5.65-49.69 0-98.77 13.73T510-665.85v393.24Zm-30 87.99q-48.38-35.69-104.38-55.15-56-19.46-115.62-19.46-36.61 0-71.92 8.11Q152.77-243 120-227.23q-21.38 9.84-40.69-3.12T60-267.08v-434.3q0-12.93 6.66-24.27Q73.31-737 85.85-742q40.61-19.77 84.65-29.27 44.04-9.5 89.5-9.5 58.38 0 114.08 15.96 55.69 15.97 105.92 47.12 50.23-31.15 105.92-47.12 55.7-15.96 114.08-15.96 45.46 0 89.5 9.5T874.15-742q12.54 5 19.19 16.35 6.66 11.34 6.66 24.27v434.3q0 23.77-20.08 36.35-20.08 12.57-42.23 2.73-32.38-15.39-67.11-23.31-34.73-7.92-70.58-7.92-59.62 0-115.62 19.46-56 19.46-104.38 55.15ZM285-496.69Z',
    },
    {
        key: 'dna',
        label: 'Born Again DNA',
        href: 'https://bornagaindna.com',
        // Supplied artwork, on the Material Symbols 960 grid. It replaced a
        // hand-drawn helix that had to be drawn in outline, because a helix
        // made of lines fills into a blob. The supplied glyph draws the strands
        // as solid ribbons instead, so it needs no outline treatment — and the
        // whole stroke mode, which existed only for that one icon, went with it.
        viewBox: '0 -960 960 960',
        icon: 'M200-40v-40q0-139 58-225.5T418-480q-102-88-160-174.5T200-880v-40h80v40q0 11 .5 20.5T282-840h396q1-10 1.5-19.5t.5-20.5v-40h80v40q0 139-58 225.5T542-480q102 88 160 174.5T760-80v40h-80v-40q0-11-.5-20.5T678-120H282q-1 10-1.5 19.5T280-80v40h-80Zm138-640h284q13-19 22.5-38t17.5-42H298q8 22 17.5 41.5T338-680Zm142 148q20-17 39-34t36-34H405q17 17 36 34t39 34Zm-75 172h150q-17-17-36-34t-39-34q-20 17-39 34t-36 34ZM298-200h364q-8-22-17.5-41.5T622-280H338q-13 19-22.5 38T298-200Z',
    },
    {
        key: 'news',
        label: 'Jubilee News',
        href: 'https://jubileeverse.com',
        // Supplied artwork, Material Symbols 960 grid. The torn-top-edge
        // newspaper after all: I had picked a plain page because the
        // serration muddies at 22px, and the operator chose this.
        viewBox: '0 -960 960 960',
        icon: 'M162.31-130q-29.83 0-51.07-21.24Q90-172.48 90-202.31v-613.46l57 57 66-67 67 67 67-67 66 67 67-67 67 67 66-67 67 67 67-67 66 67 57-57v613.46q0 29.83-21.24 51.07Q827.52-130 797.69-130H162.31Zm0-60H450v-260H150v247.69q0 5.39 3.46 8.85t8.85 3.46ZM510-190h287.69q5.39 0 8.85-3.46t3.46-8.85V-290H510v100Zm0-160h300v-100H510v100ZM150-510h660v-143.85H150V-510Z',
    },
    {
        key: 'inspiremanna',
        label: 'Daily Manna',
        href: 'https://inspiremanna.com',
        // Supplied artwork, Material Symbols 960 grid: a communion wafer
        // cross. Two hand-drawn loaves failed here before it — bread is a
        // silhouette people know but a hard one to draw small.
        viewBox: '0 -960 960 960',
        icon: 'M480-55.69 354.38-180H180v-174.38L55.69-480 180-605.62V-780h174.38L480-904.31 605.62-780H780v174.38L904.31-480 780-354.38V-180H605.62L480-55.69Zm0-84.31 78.85-78.85v-164.54q-23.17-13.39-38.32-45.08-15.14-31.69-15.14-72.75 0-51.78 23.22-88.36 23.22-36.57 57.16-36.57 32.89 0 56.44 36.6 23.56 36.61 23.56 88.4 0 41.79-15.27 73.35-15.27 31.57-38.19 44.41V-240H720v-140l100-100-100-100v-140H580L480-820 380-720H240v140L140-480l100 100v140h107.69v-171.92q-23.3-5.62-38.38-24.79-15.08-19.16-15.08-44.13v-145.31h35.53v134.84h26.64v-134.84h35.52v134.84h26.87v-134.84h35.82v145.31q0 24.97-15.26 44.13-15.27 19.17-38.2 24.79v193.07L480-140Zm0-340Z',
    },
    {
        key: 'radio',
        label: 'Jubilee Radio',
        /* The site root, not /radio. This row names the PROPERTY, the way every
           other row in the rail does — its neighbours all point at the front
           door of another site, and pointing this one at an interior page made
           it the odd entry that dropped you mid-way into somewhere you already
           were. Absolute like the rest, so the table reads as one list of
           destinations rather than one relative path among six URLs. */
        href: 'https://www.kjubilee.com',
        // Supplied artwork, Material Symbols 960 grid: three stacked
        // broadcast waves. Two stock glyphs failed here first — the radio
        // set read as a film clapperboard, the speaker cabinet as a box.
        viewBox: '0 -960 960 960',
        icon: 'M743.08-609.38q-25.4 25.3-58.32 38.42-32.91 13.11-66.38 13.11-33.46 0-65.73-12.73-32.26-12.73-57.73-38.8l-75-75q-16.42-16.54-37.23-24.81-20.81-8.27-42.71-8.27-21.9 0-42.7 8.27-20.79 8.27-37.2 24.81L192-616.69l-42.77-42.77 67.69-68.08q25.56-25.46 57.73-38.19 32.18-12.73 65.3-12.73 33.13 0 64.84 12.73 31.72 12.73 57.29 38.19l75 75q17.48 17.59 38.24 25.84 20.76 8.24 43.06 8.24 22.31 0 43.16-8.27 20.85-8.27 38.38-25.81L768-720.23l42.77 42.77-67.69 68.08Zm0 188.46q-25.49 25.46-58.05 38.19Q652.46-370 619-370t-66.03-12.73q-32.56-12.73-58.05-38.19l-75-75q-16.42-16.54-37.23-24.81-20.81-8.27-42.71-8.27-21.9 0-42.7 8.27-20.79 8.27-37.2 24.81L192-428.23 149.23-470l67.69-69.08q25.56-25.46 57.73-38.19Q306.83-590 339.95-590q33.13 0 64.84 12.73 31.72 12.73 57.29 38.19l75 75q17.36 17.59 37.99 25.84Q595.69-430 618-430t43.35-8.27q21.04-8.27 38.57-25.81L768-531.77 810.77-489l-67.69 68.08Zm-1 188.46q-25.47 25.46-57.55 38.19-32.07 12.73-65.53 12.73t-66.04-12.92q-32.57-12.93-58.04-38.39l-76-74.61Q402.5-324 381.69-332.27q-20.81-8.27-42.71-8.27-21.9 0-42.7 8.27-20.79 8.27-37.2 24.81L191-239.77l-41.77-41.77 67.69-69.08q25.49-25.46 57.59-38.19 32.1-12.73 65.14-12.73t65 12.73q31.96 12.73 57.43 38.19l75 75q17.53 17.54 38.38 25.81t43.16 8.27q22.3 0 43.06-8.24 20.76-8.25 38.24-25.84L768-343.31l41.77 42.77-67.69 68.08Z',
    },
    {
        key: 'references',
        label: 'Bible References',
        /* HIDDEN FOR NOW — the row is not rendered while this is true, and the
           filter below is the only thing that reads it.

           Flagged rather than deleted because everything else here is worth
           keeping: the supplied Material Symbols artwork, its 960-grid viewBox,
           and the note on why the href is what it is. Deleting the entry would
           throw all of that away for a row that is expected back. Take the flag
           off and it returns exactly as it was.

           It also happens to be the one row that could not work yet: the note
           below records that www.jubileereferences.com does not resolve, so
           until the domain points at something this was a dead link. */
        hidden: true,
        // NOT LIVE AT THE TIME OF WRITING. www.jubileereferences.com was
        // NXDOMAIN and the apex carried no A record, so this row is a dead
        // link until the domain is pointed at something. Left as specified
        // rather than guessed at, because the alternative spelling
        // (biblereferences.com) is a squatter's lander and worse than nothing.
        href: 'https://www.jubileereferences.com',
        // SUPPLIED ARTWORK, AND ITS OWN COORDINATE SYSTEM. This is a Material
        // Symbols glyph, which is drawn on a 960-unit grid with the origin at
        // the BOTTOM left (hence the negative y) rather than the 24-unit,
        // top-left grid every other icon here uses. Carrying the viewBox with
        // the path is what lets the two live side by side; re-plotting the
        // path onto a 24 grid would have meant editing artwork the operator
        // chose. The fill="#e3e3e3" on the original is deliberately dropped —
        // the stylesheet colours these, so a hard-coded grey would have
        // stopped it going gold on the active row.
        viewBox: '0 -960 960 960',
        icon: 'M480-240 63-467l84-46 333 182 333-182 84 46-417 227Zm0 160L63-307l84-46 333 182 333-182 84 46L480-80Zm0-320L40-640l440-240 40 22v178h327l73 40-440 240Zm0-91 200-109H440v-167L207-640l273 149Zm-40-109Z'
    },
];

/* WHICH ROW IS THE PROPERTY YOU ARE ALREADY ON.
   The rail switches between JubileeInspire properties and this site is one of
   them: Jubilee Radio. So the test is "does this row point at kjubilee.com",
   and the answer is true on EVERY page here, not only on one route — the whole
   site is that property, and a rail that went plain everywhere except a single
   path would be claiming you had left it.

   MATCHED AGAINST A FIXED LIST, NOT window.location, and that is deliberate.
   This component renders on the server and hydrates on the client; reading the
   live location would light the row in the browser and not in the server's HTML,
   and React would report a hydration mismatch on every page load. A constant
   gives both passes the same answer.

   inspire-rail.css has carried `.jir-item.is-active` since the rail landed and
   nothing ever applied the class, so the selected row was never drawn at all
   until this. */
const SELF_HOSTS = ['kjubilee.com', 'www.kjubilee.com'];

function isCurrentProperty(item) {
    const href = item && item.href;
    if (typeof href !== 'string' || !href) return false;
    if (href.charAt(0) === '/') return true;          // a relative row is by definition here
    try {
        return SELF_HOSTS.indexOf(new URL(href).hostname.toLowerCase()) >= 0;
    } catch (e) {
        return false;                                  // not a URL we can judge
    }
}

const HAMBURGER = 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z';

const VIEWBOX_24 = '0 0 24 24';

/* `viewBox` carries a glyph's own coordinate grid. Icons supplied as Material
   Symbols are drawn on 960 units with the origin at the BOTTOM left; the few
   remaining stock ones are the 24-unit, top-left kind. The two cannot share
   one attribute, so it travels with the path and defaults to 24.
   Two other modes lived here and went with the hand-drawn icons that needed
   them: an outline mode for a DNA helix made of lines, and an even-odd fill
   for a cross knocked out of a book cover. Supplied artwork needs neither. */
function Icon({ d, viewBox }) {
    return (
        <svg viewBox={viewBox || VIEWBOX_24} aria-hidden="true">
            <path d={d} />
        </svg>
    );
}

export default function InspireRail() {
    const [open, setOpen] = useState(false);

    /* body.jir-on is what moves the page out from under the fixed rail, and it
       is set from here rather than written into the layout's markup so that a
       page rendered before this component mounts is never padded for a rail
       that is not on screen yet. Removed on unmount for the same reason. */
    useEffect(() => {
        document.body.classList.add('jir-on');
        return () => document.body.classList.remove('jir-on');
    }, []);

    /* Escape closes the drawer, matching the topbar's own category menu. */
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    return (
        <>
            {/* React hoists this into <head>. The precedence name is its own, so
                it orders after kj-header and after the player's injected style —
                which is what lets the #kjPlayer offset rule in this file win. */}
            <link rel="stylesheet" href="/css/inspire-rail.css" precedence="kj-rail" />

            {/* The mobile hamburger. On desktop the CSS hides this and the
                in-rail NAVIGATION row is the toggle instead — the same split
                the original makes. */}
            <button
                type="button"
                className={'jir-burger' + (open ? ' is-hidden' : '')}
                onClick={() => setOpen(true)}
                aria-label="Open JubileeInspire navigation"
            >
                <Icon d={HAMBURGER} />
            </button>

            {open && <div className="jir-backdrop" onClick={() => setOpen(false)} />}

            <nav
                className={'jir jir-rail' + (open ? ' is-open' : '')}
                aria-label="JubileeInspire"
            >
                <button
                    type="button"
                    className="jir-collapse"
                    onClick={() => setOpen(false)}
                    title="Collapse"
                    aria-label="Collapse navigation"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>

                {/* The hamburger in the upper-left corner of the rail: on a
                    desktop this is the control that expands it. */}
                {/* NO data-tip. Every other row gets one, this one does not:
                    the tooltip fires from the very top-left of the viewport and
                    lands across whatever wordmark the page is carrying there.
                    It also had the least to say — the icon is a hamburger and
                    the row it opens is labelled NAVIGATION. The CSS keys the
                    tooltip off [data-tip], so removing the attribute is the
                    whole fix. */}
                <button
                    type="button"
                    className="jir-item is-head"
                    onClick={() => setOpen((v) => !v)}
                    aria-label="Toggle navigation"
                    aria-expanded={open}
                >
                    <Icon d={HAMBURGER} />
                    <span className="jir-label">NAVIGATION</span>
                </button>

                {/* Not rendered at all rather than hidden with CSS: a
                    display:none link is still a link, and one that is in the DOM
                    is one a future stylesheet can put back by accident. */}
                {NAV_ITEMS.filter((item) => !item.hidden).map((item) => (
                    <a
                        key={item.key}
                        className={'jir-item' + (isCurrentProperty(item) ? ' is-active' : '')}
                        aria-current={isCurrentProperty(item) ? 'page' : undefined}
                        href={item.href}
                        /* ONE TOOLTIP, AND IT IS THE STYLED ONE. Both were
                           being rendered: `data-tip` draws the rail's own
                           white-boxed label, and `title` made the browser
                           volunteer its native one on top of it a moment later
                           - two labels for one row, saying the same thing in
                           two designs.

                           `aria-label` replaces `title` rather than nothing
                           taking its place: collapsed, .jir-label is
                           visibility:hidden, which takes it out of the
                           accessibility tree too, and a link whose only name
                           was the title would have been left unnamed. */
                        data-tip={item.label}
                        aria-label={item.label}
                        rel="noopener"
                        onClick={() => setOpen(false)}
                    >
                        <Icon d={item.icon} viewBox={item.viewBox} />
                        <span className="jir-label">{item.label}</span>
                    </a>
                ))}

                <div className="jir-spacer" />

                {/* The branding in the bottom corner: the vertical wordmark
                    and the blue-ringed avatar under it, and nothing else. The
                    8px "JUBILEEINSPIRE AI BIBLE PROJECT · FREE PLAN" line that
                    sat between them is gone — its rule went from the stylesheet
                    with it. The middle word is azure here, not the gold it
                    wears on jubileeinspire.com. */}
                <a
                    className="jir-brand"
                    href={ORIGIN + '/'}
                    tabIndex={-1}
                    rel="noopener"
                >
                    <div className="jir-brand-text">
                        Jubilee<span className="jir-brand-accent">Inspire</span>
                        <span className="jir-brand-tld">.com</span>
                    </div>
                </a>

                <a
                    className="jir-avatar"
                    href={ORIGIN + '/'}
                    title="JubileeInspire.com"
                    rel="noopener"
                >
                    <img src="/images/members/jubilee-profile.png" alt="JubileeInspire" width="36" height="36" />
                </a>
            </nav>
        </>
    );
}
