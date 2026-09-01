#!/usr/bin/env node
/**
 * merge-article-bodies.js — splice rewritten article bodies into the generator.
 *
 * The Heavenly Band articles live inside tools/build-home-data.js, which is one
 * file. Several writers cannot edit it at once without clobbering each other,
 * so each writes a standalone JSON to tmp/articles/<slug>.json:
 *
 *     { "slug": "why-it-had-to-be-music", "body": ["…", "…"] }
 *
 * and this merges them in a single controlled pass.
 *
 *   node tools/merge-article-bodies.js            # report, change nothing
 *   node tools/merge-article-bodies.js --apply
 *
 * PLACEHOLDERS. Some paragraphs quote live figures. A writer must never type
 * one — the catalogue moves. Write the placeholder and this substitutes the
 * real expression, so the generated copy stays correct as stations come on air:
 *
 *     {{TOTAL_STATIONS}}  {{LIVE_STATIONS}}  {{DIAL_LOW}}  {{DIAL_HIGH}}
 *     {{INTL_STATIONS}}   {{LANGUAGES}}      {{PERSONAS}}  {{LIVE_NAMES}}
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GEN = path.join(ROOT, 'tools', 'build-home-data.js');
const IN = path.join(ROOT, 'tmp', 'articles');
const APPLY = process.argv.includes('--apply');

const PLACEHOLDERS = {
  '{{TOTAL_STATIONS}}': "' + hmFacts.total + '",
  '{{LIVE_STATIONS}}':  "' + hmFacts.live + '",
  '{{DIAL_LOW}}':       "' + hmFacts.low + '",
  '{{DIAL_HIGH}}':      "' + hmFacts.high + '",
  '{{INTL_STATIONS}}':  "' + hmFacts.intl + '",
  '{{LANGUAGES}}':      "' + langCount + '",
  '{{PERSONAS}}':       "' + hmFacts.personas + '",
  '{{LIVE_NAMES}}':     "' + hmFacts.liveNames.join(', ') + '",
};

/** A JS single-quoted string literal, with our placeholders left as code.
 *
 * WRAP FIRST, SUBSTITUTE SECOND — the order matters. Substituting first turns a
 * placeholder into `' + hmFacts.total + '`, and wrapping that by character count
 * can cut straight through it: one merge produced
 *
 *     'The dial runs from HM ' + hmFacts.low + ' and carries ' + ' +
 *
 * which reads like a wrapped line and is a syntax error. Wrapping the plain text
 * first makes each placeholder a single unsplittable word, so a break can never
 * land inside the code it becomes.
 */
function toLiteral(paragraph) {
  const clean = String(paragraph).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. wrap the PLAIN text, on word boundaries
  const lines = [];
  let line = '';
  for (const w of clean.split(' ')) {
    if ((line + ' ' + w).length > 82 && line) { lines.push(line); line = w; }
    else line = line ? line + ' ' + w : w;
  }
  if (line) lines.push(line);

  // 2. escape each line, then substitute — so the injected code is never itself
  //    escaped, and a placeholder at either end just yields a harmless `'' +`.
  const out = lines.map((l) => {
    let e = l.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    for (const [ph, code] of Object.entries(PLACEHOLDERS)) e = e.split(ph).join(code);
    return e;
  });

  return out.map((l, i) => "      '" + l + (i === out.length - 1 ? "'," : " ' +")).join('\n');
}

/** Find the `body: [ … ],` block belonging to one slug. */
function bodyRange(src, slug) {
  const at = src.indexOf(`slug: '${slug}'`);
  if (at < 0) return null;
  const bodyAt = src.indexOf('body: [', at);
  if (bodyAt < 0) return null;
  // walk to the matching ]
  let d = 0, i = src.indexOf('[', bodyAt);
  const from = i;
  for (; i < src.length; i++) {
    if (src[i] === '[') d++;
    else if (src[i] === ']') { d--; if (!d) break; }
  }
  return { from, to: i + 1, bodyAt };
}

let files = [];
try { files = fs.readdirSync(IN).filter((f) => f.endsWith('.json')); }
catch (e) { console.error(`no ${path.relative(ROOT, IN)} directory — nothing to merge`); process.exit(0); }

let src = fs.readFileSync(GEN, 'utf8');
const done = [], skipped = [];

// Longest slug first: `slug: 'x'` is matched by indexOf, and a short slug could
// otherwise match inside a longer one that shares its prefix.
const jobs = files.map((f) => JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8')))
                  .sort((a, b) => b.slug.length - a.slug.length);

for (const job of jobs) {
  if (!job.slug || !Array.isArray(job.body) || !job.body.length) {
    skipped.push(`${job.slug || '(no slug)'} — no body array`); continue;
  }
  const r = bodyRange(src, job.slug);
  if (!r) { skipped.push(`${job.slug} — not found in the generator`); continue; }
  const words = job.body.join(' ').replace(/\{\{[A-Z_]+\}\}/g, 'x').split(/\s+/).length;
  const literal = '[\n' + job.body.map(toLiteral).join('\n') + '\n    ]';
  src = src.slice(0, r.from) + literal + src.slice(r.to);
  done.push({ slug: job.slug, words, paras: job.body.length });
}

done.sort((a, b) => a.slug.localeCompare(b.slug));
for (const d of done) {
  const flag = d.words < 1000 ? '  <- UNDER 1000' : (d.paras < 15 ? '  <- few paragraphs' : '');
  console.log(`  ${String(d.words).padStart(5)}w ${String(d.paras).padStart(3)}p  ${d.slug}${flag}`);
}
if (skipped.length) { console.log('\n  skipped:'); skipped.forEach((s) => console.log('    ' + s)); }
console.log(`\n  ${done.length} merged, ${skipped.length} skipped`);

if (!APPLY) { console.log('  report only — re-run with --apply to write\n'); process.exit(0); }

fs.writeFileSync(GEN, src, 'utf8');
console.log(`  wrote ${path.relative(ROOT, GEN)}\n`);
