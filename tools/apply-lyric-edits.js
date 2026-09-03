#!/usr/bin/env node
/**
 * apply-lyric-edits.js — write corrections made on /todo back into the sheets.
 *
 *   node tools/apply-lyric-edits.js                 # report what is waiting
 *   node tools/apply-lyric-edits.js --apply         # write them
 *   node tools/apply-lyric-edits.js --album CODE    # one record only
 *
 * ── THE OTHER HALF OF /api/todo/lyrics ──────────────────────────────────────
 *
 * An administrator correcting a lyric on a /todo console writes a row in
 * `kj_lyric_edits`, and public/js/pages/todo.js lays that row over the album
 * bundle as it renders. That is enough for the page to be right and not enough
 * for anything else to be: the sheet on the J: share still says what it always
 * said, and the sheet is what a render is made from and what the next index
 * build reads. A correction that never reaches it is a correction that will be
 * sung wrong.
 *
 * THIS IS THE ONLY PLACE THE TWO MEET. The console runs on the VPS and the
 * authoring trees are on a workstation the VPS cannot see, so nothing on the
 * server can do this — it has to be run where J: is visible, against the
 * production database. Which is why it is a tool and not a route.
 *
 * ── IT REFUSES RATHER THAN GUESSES ──────────────────────────────────────────
 *
 * Between a correction being saved and this being run, the sheet may have been
 * edited on the share by somebody who never saw the console. Overwriting that
 * would destroy authored work to apply an older fix. So every block is checked
 * before it is touched: the words in the sheet must be words this correction's
 * own history knows about — the text it was made from, or one of the revisions
 * that followed. Anything else is reported as a conflict and left alone, with
 * both versions named so a person can decide.
 *
 * ── AFTER A RUN ─────────────────────────────────────────────────────────────
 *
 * The bundles under <CDN_LOCAL_ROOT>/lyrics are still the pre-correction parse
 * until the index is rebuilt, so finish with:
 *
 *   node tools/build-todo-index.js
 *
 * and deploy <CDN_LOCAL_ROOT>/lyrics/ as usual. The rows stay in the table with
 * `applied_at` set — the console keeps showing the correction and its history
 * either way, and a row that has been written back says so.
 */
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');

const CDN_ROOT = process.env.CDN_LOCAL_ROOT || 'J:\\kjubilee.com';
const LYRICS = path.join(CDN_ROOT, 'lyrics');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ONLY = (function () {
    const i = argv.indexOf('--album');
    return i >= 0 ? argv[i + 1] : null;
})();

// ── The sheet ────────────────────────────────────────────────────────────
/* THE SAME RULES tools/build-todo-index.js parses with, applied to line
   NUMBERS instead of to text, so a block can be spliced rather than rebuilt.
   They have to agree: if that parser's idea of where a lyric ends differs from
   this one's, this writes over a `Styles:` prompt. Any change to parseSheet
   there is a change here.

   `SONG TITLE:` at the start of a line opens a block; the block runs to the
   next one or to the end of the file. `LYRICS:` on its own line opens the
   words. They end where the trailer starts — at `Styles:` where there is one,
   and otherwise at the run of `Key: value` lines at the foot of the block. */
const SECTION_END = /^(-{3,}|\s*)$/;

function findBlock(lines, n) {
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (!/^SONG TITLE:/.test(lines[i])) continue;
        const head = lines[i].slice('SONG TITLE:'.length).trim();
        const m = head.match(/^(\d{1,3})\b/);
        if (m && parseInt(m[1], 10) === n) { start = i; break; }
    }
    if (start < 0) return null;

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (/^SONG TITLE:/.test(lines[i])) { end = i; break; }
    }

    // Above `LYRICS:` is the block's own header — ARTIST, ARCHETYPE, CASTING.
    let bodyStart = -1;
    for (let i = start + 1; i < end; i++) {
        if (/^LYRICS:\s*$/i.test(lines[i].trim())) { bodyStart = i + 1; break; }
    }
    if (bodyStart < 0) bodyStart = start + 1;   // the parser's own fallback

    // The block separator between songs belongs to the file, not to the words.
    let bodyEnd = end;
    while (bodyEnd > bodyStart && SECTION_END.test(lines[bodyEnd - 1])) bodyEnd--;

    let cut = -1;
    for (let i = bodyStart; i < bodyEnd; i++) {
        if (/^Styles:/i.test(lines[i])) { cut = i; break; }
    }
    if (cut < 0) {
        cut = bodyEnd;
        while (cut > bodyStart) {
            const l = lines[cut - 1];
            if (!l.trim() || /^[A-Za-z][^:]{0,48}:\s*\S/.test(l)) cut--;
            else break;
        }
        // An all-metadata block is a parse failure, not a song with no words.
        if (cut === bodyStart) cut = bodyEnd;
    }

    /* ── THE BLANK LINES AROUND THE WORDS ARE THE FILE'S, NOT THE LYRIC'S ──
       parseSheet trims what it returns, so the text the console shows — and
       therefore the text that comes back from an edit — has no blank line after
       `LYRICS:` and none before `Styles:`. Splicing that over the full span
       would take those two lines out of the file on every correction: a real
       diff, in a hand-authored document, that nobody asked for. Measured on
       AMIM1001EN, where it was the whole of the collateral change.

       So the span narrows to the words themselves. What is written back is
       still exactly what was saved; the frame around it is left alone. */
    let from = bodyStart;
    while (from < cut && !lines[from].trim()) from++;
    let to = cut;
    while (to > from && !lines[to - 1].trim()) to--;
    if (from === to) { from = bodyStart; to = cut; }   // a block with no words yet

    return { start, end, bodyStart: from, lyricEnd: to };
}

/* What build-todo-index.js would have produced for this block, so the text in
   the sheet can be compared with the text the console was shown. The collapse
   of blank runs and the trim are that parser's, not decoration — without them
   every comparison fails on whitespace the console never saw. */
function blockLyrics(lines, at) {
    return lines.slice(at.bodyStart, at.lyricEnd).join('\n')
        .replace(/\n{3,}/g, '\n\n').trim();
}

/** The same normalising the API does before it stores a body. */
function norm(text) {
    return String(text == null ? '' : text)
        .replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\s+$/, '');
}

/* Written back in whatever ending the file already had. DO NOT ASSUME EITHER
   WAY — the trees hold both, and AMIM1001EN's sheet is LF on a Windows share.
   Rewriting one in the other ending shows up as every line changed in whatever
   the operator diffs it with, which buries the one line that did. */
function eolOf(text) {
    const crlf = (text.match(/\r\n/g) || []).length;
    const lf = (text.match(/\n/g) || []).length - crlf;
    return crlf >= lf ? '\r\n' : '\n';
}

/**
 * One sheet in, one sheet out, with track `n`'s words replaced.
 *
 * SPLICED, NEVER REBUILT. Everything above `LYRICS:` and everything from the
 * trailer down is carried across untouched — the block header, the `Styles:`
 * prompt, the metadata, the separator between songs. A rewrite that
 * reconstructed the block from the parsed pieces would silently reformat parts
 * of a file nobody asked it to touch, and these are hand-authored documents.
 *
 * Returns { text, before } on success, or { error } when the block cannot be
 * found. `before` is the words as the sheet had them, which is what the caller
 * compares against the correction's history before it agrees to write.
 */
function applyToSheet(text, n, lyrics) {
    const eol = eolOf(text);
    const lines = text.split(/\r\n|\n|\r/);
    const at = findBlock(lines, n);
    if (!at) return { error: 'no `SONG TITLE: ' + n + '` block' };
    const before = blockLyrics(lines, at);
    const next = lines.slice(0, at.bodyStart)
        .concat(norm(lyrics).split('\n'), lines.slice(at.lyricEnd))
        .join(eol);
    return { text: next, before: before };
}

// ── Where a track's words are written down ───────────────────────────────
/* From the album bundle, which carries the album's directory and names the
   sheet each track was read out of. An album with two sheets resolves per
   track, which is why the track's own `sheet` is used and not the album's
   first. */
const bundles = new Map();

function bundleOf(code) {
    if (bundles.has(code)) return bundles.get(code);
    let b = null;
    try { b = JSON.parse(fs.readFileSync(path.join(LYRICS, code + '.json'), 'utf8')); }
    catch (e) { b = null; }
    bundles.set(code, b);
    return b;
}

function sheetPathFor(code, n) {
    const b = bundleOf(code);
    if (!b || !b.dir) return { error: 'no bundle — run tools/build-todo-index.js' };
    const t = (b.tracks || []).filter((x) => x.n === n)[0];
    const file = (t && t.sheet)
        || (b.sheets && b.sheets[0] && b.sheets[0].file);
    if (!file) return { error: 'the bundle does not name a sheet for track ' + n };
    return { file: path.join(b.dir, 'lyrics', file) };
}

// ── The work ─────────────────────────────────────────────────────────────
async function main() {
    /* THE LATEST REVISION PER TRACK, not every unapplied row. Applying revision
       1 and then revision 2 to the same block would write the same file twice
       and leave it saying what revision 2 says either way. The rows below it
       are marked applied with it — they were, transitively. */
    const { rows: pending } = await pool.query(
        `SELECT DISTINCT ON (album_code, track_no)
                album_code, track_no, revision, lyrics
           FROM kj_lyric_edits
          WHERE applied_at IS NULL
            AND ($1::text IS NULL OR album_code = $1)
          ORDER BY album_code, track_no, revision DESC`,
        [ONLY]
    );

    if (!pending.length) {
        console.log('Nothing waiting — every correction is already in its sheet.');
        return 0;
    }

    console.log((APPLY ? 'Applying ' : 'Would apply ') + pending.length
        + ' correction(s) from ' + (ONLY || 'every album') + '\n');

    let done = 0, skipped = 0, conflicts = 0, missing = 0;

    for (const row of pending) {
        const label = row.album_code + ' track ' + row.track_no
            + ' (rev ' + row.revision + ')';

        const where = sheetPathFor(row.album_code, row.track_no);
        if (where.error) {
            console.log('  ✗ ' + label + ' — ' + where.error);
            missing++;
            continue;
        }

        let text;
        try { text = fs.readFileSync(where.file, 'utf8'); }
        catch (e) {
            console.log('  ✗ ' + label + ' — cannot read ' + where.file);
            missing++;
            continue;
        }

        const spliced = applyToSheet(text, row.track_no, row.lyrics);
        if (spliced.error) {
            console.log('  ✗ ' + label + ' — ' + spliced.error
                + ' in ' + path.basename(where.file));
            missing++;
            continue;
        }

        const current = norm(spliced.before);
        const wanted = norm(row.lyrics);

        if (current === wanted) {
            console.log('  · ' + label + ' — already says this');
            if (APPLY) await markApplied(row);
            skipped++;
            continue;
        }

        /* EVERY TEXT THIS CORRECTION'S HISTORY KNOWS ABOUT: the words it was
           made from and each revision since. If the sheet says none of them,
           somebody has edited it on the share since the console last saw it,
           and applying would throw their work away to reinstate an older fix. */
        const { rows: known } = await pool.query(
            `SELECT lyrics, prev_lyrics FROM kj_lyric_edits
              WHERE album_code = $1 AND track_no = $2`,
            [row.album_code, row.track_no]
        );
        const seen = new Set();
        for (const k of known) {
            seen.add(norm(k.lyrics));
            if (k.prev_lyrics != null) seen.add(norm(k.prev_lyrics));
        }

        if (!seen.has(current)) {
            console.log('  ! ' + label + ' — CONFLICT. The sheet has been edited '
                + 'since this correction was made and says something neither the '
                + 'correction nor its history knows.');
            console.log('      sheet: ' + path.relative(CDN_ROOT, where.file));
            const d = firstDifference(current, wanted);
            console.log('      first differ at line ' + d.line + ' of the lyric:');
            console.log('        sheet:   ' + d.a);
            console.log('        console: ' + d.b);
            console.log('      Nothing was written. Decide by hand, then re-run.');
            conflicts++;
            continue;
        }

        if (!APPLY) {
            console.log('  → ' + label + ' — ' + path.relative(CDN_ROOT, where.file));
            done++;
            continue;
        }

        // A copy beside the original before anything is overwritten. NOT named
        // `.md`: tools/build-todo-index.js reads every .md in the folder, and a
        // backup that parses is a duplicate sheet and a false `dupes` count.
        const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
        try {
            fs.writeFileSync(where.file + '.bak-' + stamp, text);
            fs.writeFileSync(where.file, spliced.text);
        } catch (e) {
            console.log('  ✗ ' + label + ' — could not write: ' + e.message);
            missing++;
            continue;
        }

        await markApplied(row);
        console.log('  ✓ ' + label + ' — ' + path.relative(CDN_ROOT, where.file));
        done++;
    }

    console.log('\n' + (APPLY ? 'applied ' : 'would apply ') + done
        + ', already current ' + skipped
        + ', conflicts ' + conflicts
        + ', unreachable ' + missing);

    if (APPLY && done) {
        console.log('\nThe bundles are still the pre-correction parse. Finish with:');
        console.log('  node tools/build-todo-index.js');
        console.log('and deploy ' + LYRICS + ' as usual.');
    }
    if (!APPLY) console.log('\n(dry run — nothing written. Re-run with --apply)');

    return conflicts || missing ? 1 : 0;
}

/* WHERE THEY PART, not where they start. A conflict on a lyric whose first
   line is unchanged — which is most of them — printed "[Intro]" against
   "[Intro]" and told the operator nothing about what they had to decide. */
function firstDifference(a, b) {
    const la = String(a || '').split('\n');
    const lb = String(b || '').split('\n');
    const n = Math.max(la.length, lb.length);
    for (let i = 0; i < n; i++) {
        if (la[i] !== lb[i]) {
            return { line: i + 1, a: show(la[i]), b: show(lb[i]) };
        }
    }
    return { line: 0, a: show(la[0]), b: show(lb[0]) };
}

function show(line) {
    if (line === undefined) return '(the lyric ends here)';
    const l = String(line);
    return l.length > 78 ? l.slice(0, 78) + '…' : (l || '(a blank line)');
}

/* The revision applied AND everything under it: those revisions are in the
   sheet too, by way of the one that superseded them. Leaving them NULL would
   make every later run try to apply them again and report them as already
   current for ever. */
function markApplied(row) {
    return pool.query(
        `UPDATE kj_lyric_edits
            SET applied_at = NOW(), applied_by = $4
          WHERE album_code = $1 AND track_no = $2
            AND revision <= $3 AND applied_at IS NULL`,
        [row.album_code, row.track_no, row.revision, 'apply-lyric-edits.js']
    );
}

/* The splice is the part that rewrites hand-authored files, so it is exported
   and covered by tests/lyric-edits.test.js against the same fixtures
   tools/build-todo-index.js parses. Guarded, or requiring this file to test it
   would open a database connection and start applying corrections. */
if (require.main === module) {
    main()
        .then((code) => pool.end().then(() => process.exit(code)))
        .catch((e) => {
            console.error('\n✗ ' + (e && e.message ? e.message : e));
            pool.end().then(() => process.exit(1));
        });
}

module.exports = { findBlock, blockLyrics, applyToSheet, norm, eolOf };
