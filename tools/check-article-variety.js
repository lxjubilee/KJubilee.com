#!/usr/bin/env node
/**
 * check-article-variety.js — catch the failure mode that the gate cannot see.
 *
 * check-article-bodies.js reads one article at a time and asks whether it is
 * well formed. That is the wrong shape for the risk that actually exists here:
 * twenty-one writers, working in parallel from one template, each producing a
 * perfectly valid article — and all of them opening with a woman in her forties
 * at a kitchen sink. Every one passes the gate. The page reads like a machine
 * wrote it, which is the one impression this section cannot afford.
 *
 * So this is a CROSS-article check. It is deliberately not part of the gate:
 * writers run that one and would only see noise from articles they do not own,
 * and there is no per-article verdict to give — repetition is a property of the
 * set. Read the report, then send the offending writers back.
 *
 *   node tools/check-article-variety.js
 *   node tools/check-article-variety.js --shingles   # also show what overlapped
 */
const fs = require('fs');
const path = require('path');

const IN = path.join(__dirname, '..', 'tmp', 'articles');
const SHOW = process.argv.includes('--shingles');

const norm = (s) => s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Overlapping n-word runs. Five is long enough that a shared run is a shared
    sentence rather than a shared idiom — "at the end of the" is four. */
function shingles(text, n = 5) {
  const w = norm(text).split(' ');
  const out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

let files = [];
try { files = fs.readdirSync(IN).filter((f) => f.endsWith('.json')); }
catch (e) { console.error('no tmp/articles directory'); process.exit(1); }

const arts = files.map((f) => {
  const j = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  const body = j.body || [];
  /* THE LAST FOUR PARAGRAPHS ARE SUPPOSED TO RHYME.
     Template paragraphs 18-21 are orientation, recommendation, how-to-start and
     invitation — every article ends with the same four moves, and the first
     version of this tool scored that as 8% duplication between every pair,
     which drowned out the differences that matter. The argument is scored on
     its own; the tail is reported separately below, because a tail that is
     word-for-word identical across a hundred articles is its own problem. */
  const arg = body.slice(0, Math.max(1, body.length - 4));
  const tail = body.slice(Math.max(1, body.length - 4));
  return {
    slug: j.slug || f.replace(/\.json$/, ''),
    open: body[0] || '',
    scene2: body[11] || '',
    close: body[body.length - 1] || '',
    all: shingles(arg.join(' ')),
    tail: shingles(tail.join(' ')),
  };
}).sort((a, b) => a.slug.localeCompare(b.slug));

if (arts.length < 2) { console.log('  fewer than two articles — nothing to compare'); process.exit(0); }

console.log('\n  ' + arts.length + ' articles compared\n');

/* 1. THE OPENING LINES, SIDE BY SIDE.
   No score for this one — the eye is better than a metric at spotting that six
   articles all begin "A man in his fifties is". Sorted so near-twins land next
   to each other. */
console.log('  OPENING SCENES — first twelve words of paragraph 1');
console.log('  (sorted, so formula repeats sit together)\n');
const opens = arts.map((a) => ({ slug: a.slug, first: a.open.split(/\s+/).slice(0, 12).join(' ') }))
                  .sort((x, y) => x.first.localeCompare(y.first));
for (const o of opens) console.log('    ' + o.first + '\n        ' + o.slug);

/* 1b. THE OPENING FORMULA.
   The sorted list above shows this to anyone who reads all of it; this counts
   it. The distinction matters because the shared-prose metric cannot see it:
   forty articles can open "It is a quarter past two on a Tuesday and a man is
   ..." with forty different times, days and men, share almost no five-word runs
   between them, and still land on a reader as one voice doing one trick. The
   template asks for a scene. It does not ask for that sentence. */
const FORMULAS = [
  ['"It is <time/day> and ..."',      /^it is\b/i],
  ['"At <time> ..."',                 /^at (a |half |ten |twenty |quarter |\d)/i],
  ['"A <person> is ..."',             /^an? (man|woman|girl|boy|mother|father|young|older|widow|nurse|driver|teacher|student|pastor|lad|couple|family)\b/i],
  ['"The <someone> <verb>s ..."',     /^the [a-z]+ (is|was|has|does|finishes|arrives|opens|sits|stands|starts|comes|leaves)\b/i],
  ['"On a <day> ..."',                /^on (a|the) [a-z]*day\b/i],
  ['"There is/are ..."',              /^there (is|are|was|were)\b/i],
  ['"Somewhere/Nobody ..."',          /^(somewhere|nobody|no one)\b/i],
];

function formulaOf(open) {
  const t = String(open).trim();
  for (const [name, re] of FORMULAS) if (re.test(t)) return name;
  return '(no shared formula)';
}

const byFormula = new Map();
for (const a of arts) {
  const f = formulaOf(a.open);
  if (!byFormula.has(f)) byFormula.set(f, []);
  byFormula.get(f).push(a.slug);
}

console.log('  HOW THE ARTICLES BEGIN');
console.log('');
const ranked = [...byFormula.entries()].sort((x, y) => y[1].length - x[1].length);
for (const [name, slugs] of ranked) {
  const share = Math.round((slugs.length / arts.length) * 100);
  const loud = name !== '(no shared formula)' && share >= 15;
  console.log('    ' + String(slugs.length).padStart(3) + '  (' + String(share).padStart(2) +
              '%)  ' + name.padEnd(34) + (loud ? '<- one voice doing one trick' : ''));
  if (loud && SHOW) slugs.forEach((sl) => console.log('              ' + sl));
}
console.log('');

/* 1c. THE SAME SCENE TWICE.
   Two articles opened in a supermarket car park with the shopping already in
   the boot — one a man who will not get out until the song ends, one a woman
   whose four-year-old starts singing in the back. Every other check passed
   them: different words, so shared prose scored under one per cent; different
   sentence shapes, so neither showed as a formula. A reader meeting both would
   have seen it instantly.

   So this compares the FURNITURE of the scenes rather than the wording. Two
   scenes that share three or more concrete nouns are probably the same scene
   told twice, however differently it is written. */
const SCENE_STOP = new Set(('a an the and or but if is are was were be been being of in on at to for with from '
  + 'by as it its he she they them his her their this that these those there here not no nor so then than '
  + 'what which who whom when where while because since about into over under after before again very just '
  + 'only own same too more most other some any each few own can will would could should has have had do does '
  + 'did done get got go goes going come comes came make makes made take takes took put puts one two three '
  + 'four five six seven eight nine ten half past morning evening night day today back down up out off still '
  + 'already almost enough anything nothing something someone somebody nobody everybody everything man woman '
  + 'girl boy people person years year old front left right long thing things way ways time times').split(/\s+/));

function sceneNouns(text) {
  const words = String(text).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/);
  const out = new Set();
  for (const w of words) if (w.length > 3 && !SCENE_STOP.has(w)) out.add(w);
  return out;
}

/* DOCUMENT FREQUENCY, or the check drowns in its own subject matter.
   The first version flagged pairs on "station", "song", "verse" and "listens" —
   words in nearly every scene in a section about radio, and therefore evidence
   of nothing. A noun only says two scenes are the same scene when it is rare:
   "supermarket", "boot", "windowsill", "harmonium". Anything appearing in more
   than a tenth of the scenes is the vocabulary of the topic, not the furniture
   of a room. */
const sceneDF = new Map();
for (const a of arts) {
  for (const scene of [a.open, a.scene2]) {
    for (const w of sceneNouns(scene)) sceneDF.set(w, (sceneDF.get(w) || 0) + 1);
  }
}
const SCENE_COUNT = arts.length * 2;
const distinctive = (w) => (sceneDF.get(w) || 0) <= Math.max(2, SCENE_COUNT * 0.10);

const scenePairs = [];
for (let i = 0; i < arts.length; i++) {
  for (let j = i + 1; j < arts.length; j++) {
    for (const [which, a, b] of [['opening', arts[i].open, arts[j].open],
                                 ['second scene', arts[i].scene2, arts[j].scene2]]) {
      if (!a || !b) continue;
      const A = sceneNouns(a), B = sceneNouns(b);
      const shared = [...A].filter((w) => B.has(w) && distinctive(w));
      if (shared.length >= 3) {
        scenePairs.push({ which, a: arts[i].slug, b: arts[j].slug, shared });
      }
    }
  }
}
scenePairs.sort((x, y) => y.shared.length - x.shared.length);

console.log('  THE SAME SCENE TWICE — concrete nouns two scenes have in common');
if (!scenePairs.length) console.log('    no two scenes are furnished alike.');
else {
  for (const p of scenePairs.slice(0, 12)) {
    console.log('    ' + String(p.shared.length) + ' shared (' + p.which + ')  ' + p.a + '  /  ' + p.b);
    console.log('        ' + p.shared.slice(0, 10).join(', '));
  }
}
console.log('');

/* 2. NEAR-DUPLICATE PROSE.
   Jaccard over five-word runs. Two articles on related subjects share a little;
   two articles written from the same paragraph share a lot. */
const pairs = [];
for (let i = 0; i < arts.length; i++) {
  for (let j = i + 1; j < arts.length; j++) {
    const A = arts[i].all, B = arts[j].all;
    if (!A.size || !B.size) continue;
    let hit = 0;
    const shared = [];
    for (const s of A) if (B.has(s)) { hit++; if (shared.length < 6) shared.push(s); }
    const score = hit / (A.size + B.size - hit);
    if (score > 0.012) pairs.push({ a: arts[i].slug, b: arts[j].slug, score, hit, shared });
  }
}
pairs.sort((x, y) => y.score - x.score);

console.log('\n  SHARED PROSE — five-word runs in common');
if (!pairs.length) console.log('    nothing above the floor. The set reads as independent work.\n');
else {
  console.log('');
  for (const p of pairs.slice(0, 15)) {
    const flag = p.score > 0.030 ? '   <- REWRITE ONE' : (p.score > 0.020 ? '   <- look at these' : '');
    console.log('    ' + (p.score * 100).toFixed(1).padStart(5) + '%  ' + String(p.hit).padStart(4) +
                ' runs   ' + p.a + '  /  ' + p.b + flag);
    if (SHOW || p.score > 0.030) p.shared.forEach((s) => console.log('             "' + s + '"'));
  }
  console.log('');
}

/* 3. THE STOCK PHRASES.
   Every writer was handed the same template, and a template leaks. These are
   the lifts from the reference article itself — a writer echoing the exemplar's
   furniture rather than its method. */
const TICS = [
  'is not a feature', 'that is the whole difference', 'is doing the washing up',
  'in her forties', 'in his fifties', 'in her seventies', 'of nineteen',
  'is not thinking about god at all', 'and she does not know it',
  'nobody would call that', 'consider what the alternative actually produces',
  'all of which is theory', 'there is nothing to install', 'it has to be said that',
  'that is the ordinary case rather than the failure case', 'so here is the part that is not theory',
  'the silence had become', 'does not tell anybody about it',
];
const tally = new Map();
for (const a of arts) {
  const hay = norm([a.open, a.scene2, a.close].join(' ') + ' ');
  for (const t of TICS) if (hay.includes(t)) {
    if (!tally.has(t)) tally.set(t, []);
    tally.get(t).push(a.slug);
  }
}
console.log('  BORROWED FURNITURE — phrases lifted from the reference article');
const reused = [...tally.entries()].filter(([, v]) => v.length > 1).sort((x, y) => y[1].length - x[1].length);
if (!reused.length) console.log('    none reused across articles.\n');
else {
  console.log('');
  for (const [t, slugs] of reused) {
    console.log('    ' + String(slugs.length).padStart(2) + 'x  "' + t + '"');
    console.log('          ' + slugs.join(', '));
  }
  console.log('');
}

/* 4. THE TAIL.
   Paragraphs 18-21 are meant to do the same job every time. They are not meant
   to be the same paragraphs. A reader who opens three of these in one sitting
   will read the closing four more often than anything else on the page. */
const tailPairs = [];
for (let i = 0; i < arts.length; i++) {
  for (let j = i + 1; j < arts.length; j++) {
    const A = arts[i].tail, B = arts[j].tail;
    if (!A.size || !B.size) continue;
    let hit = 0;
    for (const s of A) if (B.has(s)) hit++;
    const score = hit / (A.size + B.size - hit);
    if (score > 0.10) tailPairs.push({ a: arts[i].slug, b: arts[j].slug, score });
  }
}
tailPairs.sort((x, y) => y.score - x.score);
console.log('  THE CLOSING FOUR — how alike the endings are');
if (!tailPairs.length) { console.log('    every ending is written fresh.'); console.log(''); }
else {
  console.log('    ' + tailPairs.length + ' pair(s) over 10 per cent. Worst:');
  console.log('');
  for (const p of tailPairs.slice(0, 8)) {
    console.log('    ' + (p.score * 100).toFixed(1).padStart(5) + '%   ' + p.a + '  /  ' + p.b);
  }
  console.log('');
}
