/* ==========================================================================
   kj-static-header.js — the site header, on a page that is not a React route.

   ── WHY THIS FILE EXISTS ────────────────────────────────────────────────

   The header on the site proper is app/_site-header.js, and three of the things
   it does are things it does at RUNTIME, in the browser, from state React holds:

     • it shows who is signed in (app/_account-button.js reads localStorage),
     • it paints the Admin pill for an administrator (app/_use-is-admin.js asks
       /api/auth/me),
     • it folds the categories into a burger when they stop fitting.

   The consoles under /todo are static HTML. tools/build-todo-pages.js lifts the
   header's MARKUP out of the prerendered home page — which is the markup React
   emits on the SERVER, where localStorage does not exist and nobody is ever
   signed in. So every console carried a hardcoded "Sign In" button, no Admin
   pill, and a Menu button wired to nothing: a person who had just signed in on
   the home page arrived here and was told to sign in again.

   This is that runtime half, written once for every static page that carries
   the bar. It does not build the header — the markup is already there — it
   FINISHES it. The session is the same session in the same two localStorage
   keys the rest of the site uses, so signing in anywhere signs you in here, and
   signing out here signs you out everywhere.

   NOT A SECOND HEADER. If the bar's markup or its stylesheet changes, this file
   changes with them or it stops finding what it reaches for — every selector
   below is one from public/css/site-header.css, and the classes it CREATES are
   that stylesheet's and account.css's, never new ones. A page that loads this
   must also load /css/site-header.css and /css/account.css.

   Pages using it: /todo/index.html and every /todo/<project>.html, all written
   by tools/build-todo-pages.js.
   ========================================================================== */
(function () {
    'use strict';

    var bar = document.querySelector('header.topbar');
    if (!bar) return;

    var row1 = bar.querySelector('.topbar-row1');
    var row2 = bar.querySelector('.topbar-row2');

    /* ── THE SESSION ─────────────────────────────────────────────────────
       Two keys, one session. `jubileeVerseAuth` is what radio and music write,
       `jv_auth` is what the home page writes, and every writer on the site
       writes both — see app/_session-store.js, which is the authority on this
       pair. Reading either is enough; clearing means clearing both. */
    var KEYS = ['jv_auth', 'jubileeVerseAuth'];
    var AUTH_EVENT = 'kj-auth-changed';

    function readRaw() {
        for (var i = 0; i < KEYS.length; i++) {
            try {
                var raw = localStorage.getItem(KEYS[i]);
                if (!raw) continue;
                var parsed = JSON.parse(raw);
                if (parsed && parsed.token) return parsed;
            } catch (e) { /* unreadable — try the other key */ }
        }
        return null;
    }

    function readSession() {
        var parsed = readRaw();
        var user = parsed && parsed.user;
        if (!user || !user.email) return null;
        // A token past its expiry is not a session. Treating it as one means the
        // bar greets somebody whose next API call will 401.
        var expires = parsed.expiresAt ? Date.parse(parsed.expiresAt) : NaN;
        if (!isNaN(expires) && expires <= Date.now()) return null;
        return user;
    }

    function authToken() {
        var parsed = readRaw();
        return parsed ? parsed.token : null;
    }

    function clearSession() {
        for (var i = 0; i < KEYS.length; i++) {
            try { localStorage.removeItem(KEYS[i]); } catch (e) { /* nothing to do */ }
        }
    }

    /* The same three name rules the account button uses, and for the same
       reasons — see app/_account-button.js. Kept in step with it by hand,
       which is the cost of one of these being React and the other not. */
    function initials(user) {
        var first = (user.first_name || '').trim();
        var last = (user.last_name || '').trim();
        if (first && last) return (first[0] + last[0]).toUpperCase();
        var parts = (user.name || '').trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        if (parts.length === 1) return parts[0][0].toUpperCase();
        if (first) return first[0].toUpperCase();
        return ((user.email || '?')[0]).toUpperCase();
    }

    function fullName(user) {
        var joined = [user.first_name, user.last_name].map(function (p) {
            return (p || '').trim();
        }).filter(Boolean).join(' ');
        if (joined) return joined;
        var name = (user.name || '').trim();
        if (name) return name.replace(/\s+/g, ' ');
        return (user.email || '').split('@')[0];
    }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    // ── The account control ──────────────────────────────────────────────
    /* Replaces whatever is currently standing in row 1's account slot — the
       prerendered "Sign In" anchor on first run, and its own last rendering on
       every run after. One slot, so signing out cannot leave two controls. */
    function accountSlot() {
        return row1 ? row1.querySelector(':scope > .btn-outline, :scope > .kj-account') : null;
    }

    function signOut() {
        /* Clearing localStorage only removes the copy in front of us; the token
           itself stays valid for its whole life in anyone else's hands. This is
           the half that actually ends the session — same call the site's own
           account menu makes. */
        var done = function () {
            clearSession();
            try { window.dispatchEvent(new CustomEvent(AUTH_EVENT)); } catch (e) { /* pre-hydration */ }
            // A full load, not a re-render: the page's own scripts cached a
            // token when they started and have no way to be told it is gone.
            window.location.href = '/';
        };
        var refreshToken = null;
        try {
            var parsed = readRaw();
            refreshToken = parsed ? parsed.refreshToken : null;
        } catch (e) { /* nothing stored */ }
        if (!refreshToken) { done(); return; }
        fetch('/api/auth/signout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: refreshToken }),
        }).then(done, done);   // offline, or already gone — sign out locally anyway
    }

    function buildAccount(user) {
        if (!user) {
            var a = el('a', 'btn-outline', 'Sign In');
            /* BACK TO THIS PAGE AFTER THE DOOR. The consoles are deep links
               nobody types twice; sending someone to the home page after they
               sign in is asking them to find their way back. `redirect` is the
               parameter app/login already reads. */
            a.href = '/login?redirect=' + encodeURIComponent(
                window.location.pathname + window.location.search + window.location.hash);
            return a;
        }

        var box = el('div', 'kj-account');
        var trigger = el('button', 'btn-outline kj-account-trigger');
        trigger.type = 'button';
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.title = user.email || '';

        var disc = el('span', 'kj-account-initial', initials(user));
        disc.setAttribute('aria-hidden', 'true');
        trigger.appendChild(disc);
        trigger.appendChild(el('span', 'kj-sr-only', fullName(user)));
        box.appendChild(trigger);

        var menu = el('div', 'kj-account-menu');
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        var whoBox = el('div', 'kj-account-who');
        whoBox.appendChild(el('div', 'kj-account-fullname', fullName(user)));
        var mail = el('div', 'kj-account-email', user.email || '');
        mail.title = user.email || '';
        whoBox.appendChild(mail);
        menu.appendChild(whoBox);

        var settings = el('a', 'kj-account-item', 'Profile settings');
        settings.setAttribute('role', 'menuitem');
        settings.href = '/account';
        menu.appendChild(settings);

        var out = el('button', null, 'Sign out');
        out.type = 'button';
        out.setAttribute('role', 'menuitem');
        out.addEventListener('click', signOut);
        menu.appendChild(out);

        box.appendChild(menu);

        var open = false;
        var setOpen = function (v) {
            open = v;
            menu.hidden = !v;
            trigger.setAttribute('aria-expanded', v ? 'true' : 'false');
        };
        trigger.addEventListener('click', function () { setOpen(!open); });
        document.addEventListener('mousedown', function (e) {
            if (open && !box.contains(e.target)) setOpen(false);
        });
        document.addEventListener('keydown', function (e) {
            if (open && e.key === 'Escape') setOpen(false);
        });

        return box;
    }

    // ── The Admin pill ───────────────────────────────────────────────────
    /* ASKED OF THE SERVER, NEVER READ FROM THE STORED SESSION — the reasoning
       is app/_use-is-admin.js's and it holds here word for word:
       /api/auth/login writes {id, email, name} with no role at all, and a role
       copied into localStorage keeps claiming admin long after the role is
       taken away. THIS IS NOT A PERMISSION; it decides whether a link is
       painted. Every /api/admin/* route and /api/todo/lyrics ask the database
       for themselves, so a browser that lies to itself here gains a link and a
       403. */
    var adminAsked = null;   // a promise, so several callers share one request

    function askRole() {
        if (adminAsked) return adminAsked;
        var token = authToken();
        if (!token) { adminAsked = Promise.resolve(null); return adminAsked; }
        adminAsked = fetch('/api/auth/me', {
            headers: { Authorization: 'Bearer ' + token },
            cache: 'no-store',
        }).then(function (r) {
            return r.ok ? r.json() : null;
        }).then(function (body) {
            var role = String((body && body.user && body.user.role) || '').toLowerCase();
            return role || null;
        }).catch(function () {
            // Offline, or the token expired. No link is the safe answer — it
            // costs an admin one reload and tells a stranger nothing.
            return null;
        });
        return adminAsked;
    }

    /* Executives reach the console too, so the pill is "may open it" rather
       than "is an admin" — the same test _use-is-admin.js makes. */
    function mayOpenConsole(role) { return role === 'admin' || role === 'executive'; }

    function paintAdmin(role) {
        var existing = row1 ? row1.querySelector('.nav-textlink--admin') : null;
        if (!mayOpenConsole(role)) {
            if (existing) existing.remove();
            return;
        }
        if (existing || !row1) return;
        var cta = row1.querySelector('.hdr-cta');
        var link = el('a', 'nav-textlink nav-textlink--admin', 'Admin');
        link.href = '/admin';
        // After the cross-site links and before Jubilee Praise, which is where
        // _site-header.js puts it — and with no separator in front, because the
        // chip is deliberately not a peer of the words beside it.
        if (cta) row1.insertBefore(link, cta); else row1.appendChild(link);
    }

    /* Anything else on the page that wants to know. The consoles paint their own
       admin controls from it, and an event rather than a global means they do
       not have to guess when the answer has arrived. */
    function announceRole(role) {
        window.KJ_ROLE = role || null;
        window.KJ_MAY_OPEN_CONSOLE = mayOpenConsole(role);
        bar.setAttribute('data-kj-role', role || 'none');
        try {
            window.dispatchEvent(new CustomEvent('kj-role', { detail: { role: role || null } }));
        } catch (e) { /* very old browser — the global is still set */ }
    }

    // ── Render, and re-render whenever the session changes ───────────────
    /* THE BAR SAYS WHEN IT HAS BEEN FINISHED, on the header itself:

         data-kj-header="live"   the session has been read and the account
                                 control is this file's, not the server's
         data-kj-role="admin"    …and the role has come back

       Not decoration. The markup ships with a hardcoded "Sign In" anchor — that
       is what React renders on the server — and the anchor this file puts in
       its place is also a `.btn-outline` saying "Sign In" when nobody is signed
       in. The two are indistinguishable from outside, so anything checking this
       page (tools/drill-todo-console.js) would read the un-hydrated bar and
       believe it had read the finished one. On a fast local server it never
       noticed; over the network it did. */
    function render() {
        var user = readSession();
        var slot = accountSlot();
        var next = buildAccount(user);
        if (slot) slot.replaceWith(next); else if (row1) row1.appendChild(next);
        bar.setAttribute('data-kj-header', 'live');

        if (!user) {
            adminAsked = null;
            window.KJ_ROLE_PROMISE = Promise.resolve(null);
            paintAdmin(null);
            announceRole(null);
            return;
        }
        /* PUBLISHED, so the page's own script does not ask a second time.
           public/js/pages/todo.js needs the same answer to decide whether to
           paint its Edit buttons, and it also runs on /analytics/todo.html
           where this file is not loaded — so it takes this promise if it is
           there and asks for itself if it is not. */
        window.KJ_ROLE_PROMISE = askRole();
        askRole().then(function (role) {
            // The session may have gone while the request was in flight.
            if (!readSession()) return;
            paintAdmin(role);
            announceRole(role);
        });
    }

    // `storage` fires in every tab EXCEPT the one that wrote, so it catches a
    // sign-out in another window; AUTH_EVENT is this window's own notification.
    window.addEventListener('storage', function (e) {
        if (!e.key || KEYS.indexOf(e.key) >= 0) { adminAsked = null; render(); }
    });
    window.addEventListener(AUTH_EVENT, function () { adminAsked = null; render(); });

    // ── The search box ───────────────────────────────────────────────────
    /* The same hand-off the header makes everywhere else, and the same note
       applies: jubileesearch.com serves no extensionless URLs, so /search.html
       is deliberate and is the address that answers 200. */
    function runSearch() {
        var input = document.getElementById('q');
        var v = ((input && input.value) || '').trim();
        window.location.href = v
            ? 'https://jubileesearch.com/search.html?q=' + encodeURIComponent(v)
            : 'https://jubileesearch.com/';
    }
    var qbtn = document.getElementById('qbtn');
    if (qbtn) qbtn.addEventListener('click', runSearch);
    var qbox = document.getElementById('q');
    if (qbox) qbox.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') runSearch();
    });

    // ── The categories, when they stop fitting ───────────────────────────
    /* MEASURED, NOT A BREAKPOINT — useNavCollapse in app/_site-header.js, in
       plain DOM. The labels are editorial copy out of KJ_SECTIONS and differ
       per page, so any width picked today is wrong for some set of them: the
       bar would either collapse with room to spare or scroll its links off the
       edge before it collapsed. A hidden one-line copy of the same buttons
       (.nav-measure, already in the markup) is measured against the room left
       in row 2 instead. */
    var burger = row2 ? row2.querySelector('.nav-burger') : null;
    var ghost = row2 ? row2.querySelector('.nav-measure') : null;
    var tail = row2 ? row2.querySelector('.row2-tail') : null;
    var nav = document.getElementById('nav');
    var navRight = document.getElementById('nav-right');
    var menuOpen = false;
    var menuEls = null;

    function closeMenu() {
        menuOpen = false;
        if (burger) {
            burger.classList.remove('is-open');
            burger.setAttribute('aria-expanded', 'false');
        }
        if (menuEls) {
            menuEls.overlay.remove();
            menuEls.menu.remove();
            menuEls = null;
        }
    }

    /* The category entries are CLONES of the real nav buttons, carried over with
       their .nav-link class and their data-section intact — the same trick the
       React header uses, and for the same reason: whatever wired the real
       buttons wires the clones, with no second copy of that wiring. */
    function openMenu() {
        if (!burger || menuOpen) return;
        menuOpen = true;
        burger.classList.add('is-open');
        burger.setAttribute('aria-expanded', 'true');

        var overlay = el('div', 'nav-menu-overlay');
        overlay.addEventListener('click', closeMenu);

        var menu = el('nav', 'nav-menu');
        menu.id = 'nav-menu';
        menu.setAttribute('aria-label', 'Menu');

        var cats = el('div', 'nav-menu-group');
        [nav, navRight].forEach(function (src) {
            if (!src) return;
            src.querySelectorAll('.nav-link').forEach(function (link) {
                var copy = link.cloneNode(true);
                copy.classList.add('nav-menu-link');
                cats.appendChild(copy);
            });
        });
        cats.addEventListener('click', closeMenu);
        if (cats.childNodes.length) menu.appendChild(cats);

        // Row 1's own cross-site links, including the Admin pill if it is there
        // — the bar hides them while collapsed, so this is where they live.
        var cross = el('div', 'nav-menu-group nav-menu-cross');
        if (row1) {
            row1.querySelectorAll('.nav-textlink').forEach(function (link) {
                var copy = link.cloneNode(true);
                copy.className = 'nav-menu-link'
                    + (link.classList.contains('is-here') ? ' is-here' : '')
                    + (link.classList.contains('nav-textlink--admin') ? ' nav-menu-link--admin' : '');
                cross.appendChild(copy);
            });
        }
        if (cross.childNodes.length) menu.appendChild(cross);

        /* The two controls the phone bar stops showing (site-header.css, the
           620px block). Re-rendered rather than moved: moving them would take
           them off the bar on a wide screen too, and the account control here
           is a fresh one so its menu and its listeners are its own. */
        var tailBox = el('div', 'nav-menu-group nav-menu-tail');
        var cta = row1 ? row1.querySelector('.hdr-cta') : null;
        if (cta) tailBox.appendChild(cta.cloneNode(true));
        tailBox.appendChild(buildAccount(readSession()));
        menu.appendChild(tailBox);

        bar.parentNode.insertBefore(overlay, bar.nextSibling);
        bar.parentNode.insertBefore(menu, overlay.nextSibling);
        menuEls = { overlay: overlay, menu: menu };
    }

    function fillGhost() {
        if (!ghost) return;
        ghost.innerHTML = (nav ? nav.innerHTML : '') + (navRight ? navRight.innerHTML : '');
    }

    function measure() {
        if (!row2 || !ghost) return;
        var cs = getComputedStyle(row2);
        var gap = parseFloat(cs.columnGap || cs.gap || 0) || 0;
        var room = row2.clientWidth
            - (parseFloat(cs.paddingLeft) || 0)
            - (parseFloat(cs.paddingRight) || 0)
            - (tail ? tail.offsetWidth : 0)
            - gap;
        // A hamburger costs room too, so a bar that only just fits does not flip
        // back and forth across a single pixel as the window is dragged.
        var collapsed = ghost.scrollWidth > room - 8;
        bar.classList.toggle('is-nav-collapsed', collapsed);
        if (!collapsed && menuOpen) closeMenu();

        /* The opened menu hangs below the bar, so it needs the bar's height.
           MEASURED, not described: these pages declare their own row heights or
           none at all, and a browser at 125% rounds each row to a different
           whole pixel. */
        var h = Math.ceil(bar.getBoundingClientRect().height);
        if (h) document.documentElement.style.setProperty('--kj-hdr-h', h + 'px');
    }

    if (burger) {
        burger.addEventListener('click', function () {
            if (menuOpen) closeMenu(); else openMenu();
        });
        document.addEventListener('keydown', function (e) {
            if (menuOpen && e.key === 'Escape') closeMenu();
        });
    }

    fillGhost();
    measure();

    /* The navs are filled by the page's own script, which may run after this
       one; without watching them the first measurement would be of an empty bar
       and the burger would never appear. */
    if (typeof MutationObserver === 'function') {
        var mo = new MutationObserver(function () { fillGhost(); measure(); });
        if (nav) mo.observe(nav, { childList: true, subtree: true, characterData: true });
        if (navRight) mo.observe(navRight, { childList: true, subtree: true, characterData: true });
    }
    if (typeof ResizeObserver === 'function') {
        var ro = new ResizeObserver(measure);
        ro.observe(bar);
        if (row2) ro.observe(row2);
        if (ghost) ro.observe(ghost);
    }
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    render();
})();
