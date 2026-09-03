#!/usr/bin/env node
/**
 * Tests the one piece of the lyric-correction feature that rewrites files
 * somebody wrote by hand.
 *
 *   node tests/lyric-edits.test.js
 *
 * An administrator correcting a lyric on /todo writes a row in kj_lyric_edits,
 * and public/js/pages/todo.js lays it over the album bundle so the console is
 * right immediately. tools/apply-lyric-edits.js is what carries that correction
 * into the sheet on the J: share — and a sheet is not a record in a table. It
 * is a document with an album header, a block per song, a casting note above
 * the words, a `Styles:` prompt below them and a metadata trailer under that,
 * all of which somebody typed and none of which this is allowed to touch.
 *
 * SO THE PROPERTY UNDER TEST IS: replace the words, change nothing else.
 * Asserted by parsing the rewritten sheet with tools/build-todo-index.js's OWN
 * parser and comparing every other field — the two have to agree about where a
 * lyric ends, and if they ever stop agreeing this writes over a Styles prompt.
 * That is the failure this file exists to catch, and it is silent: the sheet
 * still parses, the render is just made from the wrong brief.
 */
'use strict';

const { parseSheet } = require('../tools/build-todo-index');
const { applyToSheet, findBlock, blockLyrics, norm, eolOf } =
    require('../tools/apply-lyric-edits');

let pass = 0, fail = 0;
const ok = (n, c, d) => {
    if (c) { pass++; console.log('  ok   ' + n); }
    else { fail++; console.log('  FAIL ' + n + (d ? '  — ' + d : '')); }
};
const eq = (n, a, b) => ok(n, a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

/* A sheet in the shape the nine authoring trees actually use: an album header,
   then SONG TITLE blocks, each with a casting header, LYRICS:, the words, a
   Styles: prompt and a metadata trailer, separated by a rule. CRLF, because
   these are authored on Windows and that is the ending that must survive. */
const CRLF = [
    'ALBUM: Songs Of The Open Road',
    'ARTIST: Elias Inspire',
    'LANGUAGE: English',
    '',
    'SONG TITLE: 01 Gravel Under Glory',
    'ARTIST: Elias Inspire',
    'ARCHETYPE: The traveller',
    'CASTING: male lead, close harmony',
    'LYRICS:',
    '[Verse 1]',
    'Dust on the dashboard, mile after mile',
    'A hymn on the radio, half of a smile',
    '',
    '[Chorus]',
    'Gravel under glory, glory under grace',
    'Styles: warm americana, brushed kit, 92 bpm, resonator slide',
    'Song Title: Gravel Under Glory',
    'Vocal Gender: male',
    'Faith-Focus: 8',
    '',
    '---',
    '',
    'SONG TITLE: 02 The Long Way Home',
    'ARTIST: Eliana Inspire',
    'LYRICS:',
    '[Verse 1]',
    'She took the long way home tonight',
    'Styles: folk waltz, upright bass, 78 bpm',
    'Song Title: The Long Way Home',
    'Vocal Gender: female',
    '',
].join('\r\n');

console.log('\nThe sheet is spliced, not rebuilt');
{
    const original = parseSheet(CRLF);
    const before = original.tracks.filter((t) => t.n === 1)[0];
    const other = original.tracks.filter((t) => t.n === 2)[0];

    const out = applyToSheet(CRLF, 1, 'A brand new opening line\nand a second one');
    ok('the block was found', !out.error, out.error);
    eq('it reports the words it is replacing', out.before, before.lyrics);

    const after = parseSheet(out.text);
    const t1 = after.tracks.filter((t) => t.n === 1)[0];
    const t2 = after.tracks.filter((t) => t.n === 2)[0];

    eq('the words are the new words', t1.lyrics, 'A brand new opening line\nand a second one');
    eq('the title is untouched', t1.title, before.title);
    eq('the casting header above them is untouched', t1.intro, before.intro);
    eq('the Styles prompt is untouched', t1.styles, before.styles);
    eq('the metadata trailer is untouched',
        JSON.stringify(t1.meta), JSON.stringify(before.meta));

    eq('the album header is untouched', after.header, original.header);
    eq('the next song is untouched', JSON.stringify(t2), JSON.stringify(other));
    eq('there are still two songs', after.tracks.length, 2);

    eq('CRLF survives', eolOf(out.text), '\r\n');
    ok('and nothing was left as a bare LF', !/[^\r]\n/.test(out.text));
}

console.log('\nA block whose trailer has no Styles: line');
/* Not every track in the catalogue carries a prompt. parseSheet falls back to
   walking backwards over the run of `Key: value` lines at the foot of the
   block, and this has to fall back the same way — otherwise the metadata is
   inside the lyric and gets overwritten with it. */
{
    const sheet = [
        'SONG TITLE: 01 No Prompt Here',
        'LYRICS:',
        'The only line of the song',
        'Song Title: No Prompt Here',
        'Vocal Gender: female',
        '',
    ].join('\n');

    const before = parseSheet(sheet).tracks[0];
    eq('the parser reads one line of lyric', before.lyrics, 'The only line of the song');

    const out = applyToSheet(sheet, 1, 'Two lines now\nand here is the second');
    const t = parseSheet(out.text).tracks[0];
    eq('the words are replaced', t.lyrics, 'Two lines now\nand here is the second');
    eq('the metadata survived', JSON.stringify(t.meta), JSON.stringify(before.meta));
    ok('the trailer is still in the file', /Vocal Gender: female/.test(out.text));
    eq('an LF file stays LF', eolOf(out.text), '\n');
}

console.log('\nIt refuses what it cannot find');
{
    const out = applyToSheet(CRLF, 9, 'anything at all');
    ok('an unknown track number is an error, not a write', !!out.error, JSON.stringify(out));
    ok('and the error names the block it looked for', /SONG TITLE: 9/.test(out.error || ''));
}

console.log('\nThe comparison is made on normalised text');
/* The browser hands back whatever line ending it likes and the sheets are CRLF,
   so a comparison on raw bytes would call every unchanged lyric a change — and
   apply-lyric-edits.js would rewrite a file per run for ever. */
{
    eq('CRLF becomes LF', norm('a\r\nb'), 'a\nb');
    eq('a lone CR becomes LF', norm('a\rb'), 'a\nb');
    eq('trailing spaces on a line go', norm('a   \nb'), 'a\nb');
    eq('trailing blank lines go', norm('a\nb\n\n\n'), 'a\nb');
    eq('the same text either way compares equal',
        norm('one\r\ntwo  \r\n'), norm('one\ntwo'));
}

console.log('\nfindBlock agrees with the parser about where the words are');
{
    const lines = CRLF.split(/\r\n|\n|\r/);
    const at = findBlock(lines, 2);
    ok('the second block is found', !!at);
    eq('and its words are the parser\'s words',
        blockLyrics(lines, at),
        parseSheet(CRLF).tracks.filter((t) => t.n === 2)[0].lyrics);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
