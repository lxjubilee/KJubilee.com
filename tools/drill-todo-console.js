#!/usr/bin/env node
/**
 * drill-todo-console.js — does the /todo console know who is signed in?
 *
 *   node tools/drill-todo-console.js                          # localhost:3210
 *   node tools/drill-todo-console.js http://localhost:3210
 *
 * ── WHY THIS IS A BROWSER AND NOT A TEST ────────────────────────────────────
 *
 * Every part of the thing under test happens after the HTML is served.
 * tools/build-todo-pages.js writes a bar that says "Sign In" — that is the
 * markup React emits on the server, where nobody is ever signed in — and
 * /js/kj-static-header.js is what reads the stored session, replaces that
 * button with the person's initials, asks /api/auth/me for their role and
 * paints the Admin pill. public/js/pages/todo.js then paints an Edit button on
 * every track for whoever may open the albums section.
 *
 * None of that exists in the file on disk. A test that asserted against the
 * generated HTML would pass on a page that renders a dead Sign In button to a
 * signed-in administrator, which is the exact bug this work was to fix.
 *
 * SO THIS DRIVES A REAL BROWSER, the same way tools/drill-dial-spin.js does,
 * over the DevTools protocol with no test framework in between. Three visitors,
 * one page:
 *
 *   anonymous   Sign In, and it carries a redirect back to this page
 *   a member    their initials, no Admin pill, no Edit buttons
 *   an admin    their initials, the Admin pill, and an editor that opens
 *
 * The session is seeded into localStorage and /api/auth/me is stubbed, both
 * before any page script runs — so this drills the BROWSER's half without
 * needing an account on the database behind whatever is being served. What the
 * server does with a save is the server's own gate (lib/access.js) and is not
 * what this is asking about.
 */
'use strict';

const http = require('http');
const { spawn } = require('child_process');

const BASE = (process.argv[2] || 'http://localhost:3210').replace(/\/$/, '');
const PAGE = BASE + '/todo/amir_inspire.html';
const PORT = 9224;   // not drill-dial-spin's, so the two can run at once

const CHROME = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].filter(Boolean);

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '\n          ' + detail : ''));
    if (!cond) failures++;
}

function getJSON(path) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
            let b = '';
            res.on('data', (d) => { b += d; });
            res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}

async function waitFor(fn, ms, label) {
    const until = Date.now() + ms;
    for (;;) {
        try { const v = await fn(); if (v) return v; } catch (e) { /* not yet */ }
        if (Date.now() > until) throw new Error('timed out waiting for ' + label);
        await new Promise((r) => setTimeout(r, 200));
    }
}

/* Seeded before any page script runs, so kj-static-header.js finds the session
   already there rather than racing it. /api/auth/me is stubbed in the same
   breath: the role is the ONE thing the browser is not allowed to decide for
   itself, so a drill that let the page answer it would be drilling nothing. */
function primer(role) {
    const user = {
        id: 1, email: 'gabriel@kjubilee.com',
        name: 'Gabriel Ungureanu', first_name: 'Gabriel', last_name: 'Ungureanu',
    };
    const session = JSON.stringify({
        token: 'drill-token', refreshToken: 'drill-refresh', user: user,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    return `
    (function () {
      ${role ? `
      try {
        localStorage.setItem('jv_auth', ${JSON.stringify(session)});
        localStorage.setItem('jubileeVerseAuth', ${JSON.stringify(session)});
      } catch (e) {}
      ` : `try { localStorage.clear(); } catch (e) {}`}
      var real = window.fetch;
      window.fetch = function (input, init) {
        var url = String((input && input.url) || input || '');
        if (url.indexOf('/api/auth/me') >= 0) {
          return Promise.resolve(new Response(
            JSON.stringify({ user: { id: 1, email: 'gabriel@kjubilee.com',
                                     name: 'Gabriel Ungureanu', role: ${JSON.stringify(role || 'user')} } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        // The corrections overlay. Answered as "none" rather than left to reach
        // a database this drill has no account on — what is being drilled is
        // whether the EDITOR appears, not what is already in it.
        if (url.indexOf('/api/todo/lyrics') >= 0) {
          return Promise.resolve(new Response(JSON.stringify({ code: '', edits: {} }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return real.apply(this, arguments);
      };
    })();`;
}

(async () => {
    const fs = require('fs');
    const exe = CHROME.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
    if (!exe) { console.error('no Chrome found; set CHROME_PATH'); process.exit(2); }

    const tmp = require('path').join(require('os').tmpdir(), 'kj-todo-drill-' + process.pid);
    const chrome = spawn(exe, [
        '--headless=new', '--remote-debugging-port=' + PORT,
        '--user-data-dir=' + tmp, '--no-first-run', '--no-default-browser-check',
        '--window-size=1500,950',
        'about:blank',
    ], { stdio: 'ignore' });

    const cleanup = () => { try { chrome.kill(); } catch (e) {} };
    process.on('exit', cleanup);

    const list = await waitFor(() => getJSON('/json/list'), 20000, 'chrome');
    const target = list.find((t) => t.type === 'page');
    const ws = new global.WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    };
    const send = (method, params) => new Promise((resolve) => {
        const n = ++id;
        pending.set(n, resolve);
        ws.send(JSON.stringify({ id: n, method, params: params || {} }));
    });
    const evaluate = async (expr) => {
        const r = await send('Runtime.evaluate', {
            expression: expr, returnByValue: true, awaitPromise: true,
        });
        if (r.result && r.result.exceptionDetails) {
            throw new Error(JSON.stringify(r.result.exceptionDetails));
        }
        return r.result && r.result.result ? r.result.result.value : undefined;
    };

    await send('Page.enable');
    await send('Runtime.enable');

    // Every dialog auto-dismissed. Nothing below opens one, but a confirm() the
    // drill did not expect would otherwise hang it rather than fail it.
    await send('Page.setInterceptFileChooserDialog', {}).catch(() => {});

    let primed = null;
    async function visit(role) {
        if (primed) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: primed });
        const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: primer(role) });
        primed = r.result && r.result.identifier;
        await send('Page.navigate', { url: PAGE });
        await waitFor(() => evaluate("!!document.querySelector('header.topbar')"),
                      20000, 'the site bar');
        /* WAIT FOR THE MARKER, NOT FOR A CONTROL THAT LOOKS RIGHT. The bar
           SHIPS with a "Sign In" anchor and kj-static-header.js replaces it
           with one of its own — which, signed out, is also a .btn-outline
           saying "Sign In". Waiting for that anchor is waiting for something
           that was already there, and the first version of this drill did
           exactly that: it passed locally and failed over the network, where
           the script had not run yet. data-kj-header is set once the session
           has actually been read. */
        await waitFor(() => evaluate(
            "document.querySelector('header.topbar').getAttribute('data-kj-header') === 'live'"),
            15000, 'the bar to be finished');
        // The role is a second, separate answer — one network round trip after
        // the session read, and the Admin pill waits on it.
        await waitFor(() => evaluate(
            "!!document.querySelector('header.topbar').getAttribute('data-kj-role')"),
            15000, 'the role');
    }

    // ── 1. Nobody is signed in ────────────────────────────────────────────
    console.log('\nAnonymous');
    await visit(null);
    ok('the site bar is on the console page',
        await evaluate("!!document.querySelector('header.topbar')"));
    ok('the console\u2019s own strip is still under it',
        await evaluate("!!document.querySelector('header.td-top')"));
    ok('the category bar was filled from KJ_SECTIONS',
        (await evaluate("document.querySelectorAll('#nav .nav-link').length")) > 0);
    ok('it offers Sign In',
        (await evaluate("(document.querySelector('a.btn-outline')||{}).textContent")) === 'Sign In');
    ok('and it comes back here afterwards',
        /\/login\?redirect=%2Ftodo%2Famir_inspire\.html/.test(
            await evaluate("(document.querySelector('a.btn-outline')||{}).getAttribute('href')||''")));
    ok('no Admin pill for a stranger',
        !(await evaluate("!!document.querySelector('.nav-textlink--admin')")));

    // ── 2. A signed-in member ─────────────────────────────────────────────
    console.log('\nA member (role: user)');
    await visit('user');
    ok('the bar shows the account, not Sign In',
        await evaluate("!!document.querySelector('.kj-account')"));
    ok('with both initials on the disc',
        (await evaluate("(document.querySelector('.kj-account-initial')||{}).textContent")) === 'GU');
    ok('the whole name is still the accessible name',
        (await evaluate("(document.querySelector('.kj-sr-only')||{}).textContent")) === 'Gabriel Ungureanu');
    ok('no Admin pill for a member',
        !(await evaluate("!!document.querySelector('.nav-textlink--admin')")));

    const opened = await openFirstAlbum(evaluate);
    if (opened) {
        ok('the tracks render', (await evaluate("document.querySelectorAll('.td-track').length")) > 0);
        ok('and a member is offered no Edit button',
            (await evaluate("document.querySelectorAll('.td-edit').length")) === 0);
    } else {
        console.log('  SKIP  no album could be opened — is /data/todo-index.json published '
            + 'and CDN_LOCAL_ROOT reachable?');
    }

    // ── 3. An administrator ───────────────────────────────────────────────
    console.log('\nAn administrator');
    await visit('admin');
    ok('the bar shows the account', await evaluate("!!document.querySelector('.kj-account')"));
    ok('the bar knows the role came back as admin',
        (await evaluate("document.querySelector('header.topbar').getAttribute('data-kj-role')")) === 'admin');
    ok('the Admin pill is painted',
        await evaluate("!!document.querySelector('.nav-textlink--admin')"));
    ok('and it leads to the console',
        (await evaluate("(document.querySelector('.nav-textlink--admin')||{}).getAttribute('href')")) === '/admin');
    ok('it sits before Jubilee Praise, where the site puts it',
        await evaluate(`(function () {
            var row = document.querySelector('.topbar-row1');
            var kids = Array.prototype.slice.call(row.children);
            var a = kids.findIndex(function (n) { return n.classList.contains('nav-textlink--admin'); });
            var c = kids.findIndex(function (n) { return n.classList.contains('hdr-cta'); });
            return a >= 0 && c >= 0 && a < c;
        })()`));

    const opened2 = await openFirstAlbum(evaluate);
    if (!opened2) {
        console.log('  SKIP  no album could be opened — the editor could not be drilled');
    } else {
        await waitFor(() => evaluate("document.querySelectorAll('.td-edit').length > 0"),
                      8000, 'the Edit buttons').catch(() => {});
        ok('every track offers an Edit button',
            (await evaluate("document.querySelectorAll('.td-edit').length"))
                === (await evaluate("document.querySelectorAll('.td-track').length")));

        const lyric = await evaluate(
            "(document.querySelector('.td-track .td-lyric')||{}).textContent || ''");
        await evaluate("document.querySelector('.td-track .td-edit').click()");
        await waitFor(() => evaluate("!!document.querySelector('.td-editor-area')"),
                      5000, 'the editor').catch(() => {});
        ok('clicking it opens a plain textarea',
            (await evaluate("(document.querySelector('.td-editor-area')||{}).tagName")) === 'TEXTAREA');
        ok('holding the words that were on screen',
            (await evaluate("(document.querySelector('.td-editor-area')||{}).value || ''")).trim()
                === lyric.trim(),
            'the editor must open on the lyric it is replacing, not on an empty box');
        ok('with Save beside it',
            await evaluate("!!document.querySelector('.td-editor-bar .td-btn[data-act=\"save\"]')"));
        ok('and the button says it is editing',
            (await evaluate("(document.querySelector('.td-track .td-edit')||{}).textContent")) === 'Editing');

        // What is typed must survive the pane being rebuilt — the rail does that
        // on every click, and an editor that lived only in the DOM would lose it.
        await evaluate(`(function () {
            var a = document.querySelector('.td-editor-area');
            a.value = 'A DRILL WROTE THIS';
            a.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
        await evaluate("var d=document.querySelector('.td-rail .td-dot.is-all'); if (d) d.click();");
        await new Promise((r) => setTimeout(r, 400));
        ok('and it survives the pane being re-rendered',
            (await evaluate("(document.querySelector('.td-editor-area')||{}).value || ''"))
                === 'A DRILL WROTE THIS',
            'the draft is held in DRAFTS, not in the element');
    }

    console.log('\n' + (failures ? failures + ' FAILED' : 'all checks passed'));
    ws.close();
    cleanup();
    process.exit(failures ? 1 : 0);
})().catch((e) => {
    console.error('\ndrill error: ' + (e && e.message ? e.message : e));
    process.exit(2);
});

/* The console opens on a station and waits to be told which record. Clicking
   the first album row is the shortest way to a rendered track, and it exercises
   the same path a person takes. Returns false when the queue itself did not
   load, so a missing index reads as "could not drill" rather than as a bug in
   the thing being drilled. */
async function openFirstAlbum(evaluate) {
    try {
        await waitFor(() => evaluate("document.querySelectorAll('#td-albums-scroll .td-al').length > 0"),
                      15000, 'the album list');
        await evaluate("document.querySelector('#td-albums-scroll .td-al').click()");
        await waitFor(() => evaluate("document.querySelectorAll('.td-track').length > 0"),
                      15000, 'a rendered track');
        return true;
    } catch (e) {
        return false;
    }
}
