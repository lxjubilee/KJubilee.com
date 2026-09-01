#!/usr/bin/env node
/**
 * The Heavenly Band articles, and the split that keeps them off the hot path.
 *
 *   node tests/hm-articles.test.js
 *
 * The bodies used to live in stations-data.js. At full length that made the
 * file every page loads — and which is served no-store — about four fifths
 * article prose that almost nobody on that page was going to read, so
 * build-home-data now writes one file per slug into public/data/hm-articles
 * and the catalogue keeps only what the grid draws.
 *
 * That split has a failure mode with no symptom on the shelf: the cards render
 * from metadata, the reading times are right, and the section looks perfectly
 * healthy right up until somebody opens a piece and gets the retry. It breaks
 * silently if a body file is missing, if a slug is renamed and its file is not,
 * or if the deploy carries public/js without public/data. This asserts the two
 * halves still describe the same articles.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'data', 'hm-articles');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? '  — ' + detail : '')); }
}

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'stations-data.js'), 'utf8'), sandbox);

const hm = (sandbox.window.KJ_SECTIONS || []).find((s) => s.id === 'hm');
ok('the HM section is in the catalogue', !!hm);
if (!hm) { process.exit(1); }

const articles = hm.articles || [];
ok('it has articles', articles.length > 0, articles.length + ' found');

// --- the catalogue half ---------------------------------------------------

const inline = articles.filter((a) => a.body !== undefined);
ok('no body is left inline in the catalogue', inline.length === 0,
   inline.length + ' still carry a body: ' + inline.slice(0, 3).map((a) => a.slug).join(', '));

const noWords = articles.filter((a) => typeof a.words !== 'number' || a.words <= 0);
ok('every article carries a word count', noWords.length === 0,
   noWords.slice(0, 3).map((a) => a.slug).join(', '));

/* The grid needs these four to draw a card. A missing dek is not a crash, it
   is a card with a blank line where the reason to click was going to be. */
for (const field of ['slug', 'kicker', 'title', 'dek']) {
    const missing = articles.filter((a) => !a[field]);
    ok('every article has a ' + field, missing.length === 0,
       missing.slice(0, 3).map((a) => a.slug || '(no slug)').join(', '));
}

const dupes = articles.map((a) => a.slug).filter((s, i, all) => all.indexOf(s) !== i);
ok('no duplicate slugs', dupes.length === 0, dupes.join(', '));

// --- the file half --------------------------------------------------------

let files = [];
try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); }
catch (e) { ok('public/data/hm-articles exists', false, e.message); }

ok('one file per article', files.length === articles.length,
   files.length + ' files for ' + articles.length + ' articles');

/* An orphan is a body left behind by a renamed slug. Nothing links to it, so
   nothing notices — but it is under public/ and is therefore served, forever,
   to anyone who has the old URL. */
const known = new Set(articles.map((a) => a.slug + '.json'));
const orphans = files.filter((f) => !known.has(f));
ok('no orphaned body files', orphans.length === 0, orphans.slice(0, 5).join(', '));

let missing = 0, mismatched = 0, empty = 0, badShape = 0;
const short = [];
for (const a of articles) {
    const p = path.join(DIR, a.slug + '.json');
    if (!fs.existsSync(p)) { missing++; continue; }

    let doc;
    try { doc = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { badShape++; continue; }

    if (doc.slug !== a.slug) { mismatched++; continue; }
    if (!Array.isArray(doc.body) || !doc.body.length) { empty++; continue; }

    // The card promises a reading time computed from this exact prose.
    const words = doc.body.join(' ').split(/\s+/).filter(Boolean).length;
    if (words !== a.words) { mismatched++; continue; }

    if (words < 1000) short.push(a.slug + ' (' + words + 'w)');
}

ok('every article has its body file', missing === 0, missing + ' missing');
ok('every body file parses', badShape === 0, badShape + ' unparseable');
ok('no body file is empty', empty === 0, empty + ' empty');
ok('every word count matches its body', mismatched === 0, mismatched + ' disagree with the catalogue');

/* Not a hard failure — an article can legitimately be short while it is being
   written — but the section was rebuilt precisely to get off the 250-word
   placeholders, and a silent regression to one is worth seeing. */
if (short.length) {
    console.log('\n  note: ' + short.length + ' article(s) under 1000 words');
    short.slice(0, 8).forEach((s) => console.log('        ' + s));
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
