#!/usr/bin/env node
/**
 * assign-completed-albums.js — pin the credit on a finished record.
 *
 *   node tools/verify-album-audio.js --station HM316.00-EN   # first, always
 *   node tools/assign-completed-albums.js --to "Gabriel Ungureanu"
 *   node tools/assign-completed-albums.js --to "Gabriel Ungureanu" --dry-run
 *
 * ── WHY A FILE AND NOT A RULE ───────────────────────────────────────────────
 *
 * The console could simply say "if the album is verified, credit Gabriel" and
 * compute it fresh on every render. That would be less code and it would be
 * wrong, because it makes the credit a function of TODAY'S network. A CDN
 * hiccup during the next verification run, a bucket re-key, an album pulled for
 * a re-cut — any of them flips a finished record's credit back to whoever is
 * holding the outstanding work, silently rewriting who did something that was
 * already done.
 *
 * Credit for finished work does not expire. So it is written down once, here,
 * and read back as fact.
 *
 * ── APPEND-ONLY, ON PURPOSE ─────────────────────────────────────────────────
 *
 * This never edits or removes an assignment it did not just create. Re-running
 * it after another nine albums land adds those nine and leaves everything else
 * exactly as it was — so the file is safe to run on a schedule, and safe to
 * hand-edit for a one-off. An entry disappearing from audio-verified.json does
 * NOT remove it here; that is the whole point.
 *
 * Exit codes: 0 wrote (or had nothing to add) · 1 no verification to read · 2 failed.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VERIFIED = path.join(ROOT, 'public', 'data', 'audio-verified.json');
const OUT = path.join(ROOT, 'public', 'data', 'album-assignments.json');

function arg(name, fallback) {
    const i = process.argv.indexOf('--' + name);
    return i > 0 && process.argv[i + 1] && process.argv[i + 1].indexOf('--') !== 0
        ? process.argv[i + 1] : fallback;
}
const TO = arg('to', null);
const DRY = process.argv.indexOf('--dry-run') > 0;

if (!TO) {
    console.error('usage: assign-completed-albums.js --to "Full Name" [--dry-run]');
    process.exit(2);
}

if (!fs.existsSync(VERIFIED)) {
    console.error('no ' + path.relative(ROOT, VERIFIED) + ' — run tools/verify-album-audio.js first');
    process.exit(1);
}

let verified;
try { verified = JSON.parse(fs.readFileSync(VERIFIED, 'utf8')); }
catch (e) { console.error('unreadable verification file: ' + e.message); process.exit(2); }

/* Whatever is already pinned stays pinned. Read before write, and the existing
   entries are never consulted for anything except "leave this alone". */
let existing = { schema: 'kj.album.assignments/1', albums: {} };
if (fs.existsSync(OUT)) {
    try {
        const prior = JSON.parse(fs.readFileSync(OUT, 'utf8'));
        if (prior && prior.albums) existing = prior;
    } catch (e) {
        console.error('existing ' + path.relative(ROOT, OUT) + ' is unreadable — refusing to '
                    + 'overwrite it blind: ' + e.message);
        process.exit(2);
    }
}

const albums = verified.albums || {};
const added = [];
const kept = [];

for (const code of Object.keys(albums).sort()) {
    if (!albums[code] || !albums[code].verified) continue;   // only finished records
    if (existing.albums[code]) { kept.push(code); continue; }
    added.push(code);
    existing.albums[code] = {
        assignedTo: TO,
        // Stamped so the record says WHEN the work was signed off, not merely
        // that it was. A credit with no date is hard to argue with later.
        pinnedAt: new Date().toISOString(),
        tracks: albums[code].tracks,
    };
}

console.log('verified albums: ' + Object.keys(albums).filter(c => albums[c].verified).length);
console.log('already pinned : ' + kept.length + (kept.length ? '  (' + kept.slice(0, 6).join(', ')
    + (kept.length > 6 ? ' …' : '') + ')' : ''));
console.log('newly pinned   : ' + added.length + (added.length ? '  -> ' + TO : ''));
added.forEach(c => console.log('   + ' + c));

if (DRY) { console.log('\ndry run — nothing written'); process.exit(0); }

if (!added.length) { console.log('\nnothing to add; ' + path.relative(ROOT, OUT) + ' unchanged'); process.exit(0); }

existing.generated_at = new Date().toISOString();
existing.generator = 'tools/assign-completed-albums.js';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(existing, null, 0));
console.log('\nwrote ' + path.relative(ROOT, OUT) + ' — '
    + Object.keys(existing.albums).length + ' album(s) pinned in total');
process.exit(0);
