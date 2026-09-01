#!/usr/bin/env node
/**
 * check-article-bodies.js — gate the rewritten articles before they are merged.
 *
 * Reads tmp/articles/*.json and checks each against the template and against
 * the catalogue. Structure is checkable and so is truth about the dial; voice
 * is not, which is what a read-through is for. This catches the things that are
 * cheap to get wrong at volume and expensive to notice later.
 *
 *   node tools/check-article-bodies.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const IN = path.join(ROOT, 'tmp', 'articles');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'stations-data.js'), 'utf8'), sandbox);
const STATIONS = sandbox.window.KJ_STATIONS || [];
const ARTICLES = (sandbox.window.KJ_SECTIONS.find((s) => s.id === 'hm') || {}).articles || [];
const frameOf = (slug) => ARTICLES.find((a) => a.slug === slug);

const byHm = new Map(STATIONS.map((s) => [s.hm, s]));
const liveHm = new Set(STATIONS.filter((s) => s.prototype).map((s) => s.hm));

const PLACEHOLDER = /\{\{[A-Z_]+\}\}/g;
const KNOWN_PH = new Set(['{{TOTAL_STATIONS}}', '{{LIVE_STATIONS}}', '{{DIAL_LOW}}', '{{DIAL_HIGH}}',
                          '{{INTL_STATIONS}}', '{{LANGUAGES}}', '{{PERSONAS}}', '{{LIVE_NAMES}}']);

let files = [];
try { files = fs.readdirSync(IN).filter((f) => f.endsWith('.json')); } catch (e) {
  console.error('no tmp/articles directory'); process.exit(1);
}

let clean = 0;
const problems = [];
const recs = new Map();

for (const f of files.sort()) {
  const p = path.join(IN, f);
  let job;
  try { job = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { problems.push([f, 'INVALID JSON: ' + e.message]); continue; }

  const slug = job.slug || f.replace(/\.json$/, '');
  const body = job.body || [];
  const bad = [];

  const text = body.join(' ');
  const words = text.replace(PLACEHOLDER, 'x').split(/\s+/).filter(Boolean).length;

  if (!Array.isArray(body) || !body.length) bad.push('no body array');
  /* THE CEILING IS A GUARD AGAINST PADDING, NOT AGAINST LENGTH.
     The ask was a thousand words minimum and the reference article runs to
     about sixteen hundred, so the floor is what actually matters here. The
     first ceiling was 1750 and it failed nine finished, well-argued pieces for
     the crime of being nineteen hundred words long — which would have meant
     sending writers back to cut good prose to satisfy a number I invented.
     2100 still catches an article that has genuinely lost its shape. */
  if (words < 1400) bad.push(`${words} words — under 1400`);
  if (words > 2100) bad.push(`${words} words — over 2100, check it has not lost its shape`);
  if (body.length < 18) bad.push(`${body.length} paragraphs — under 18`);
  if (body.length > 22) bad.push(`${body.length} paragraphs — over 22`);

  // the frame must be preserved, and the pull quote echoed
  const frame = frameOf(slug);
  if (!frame) bad.push('slug not in the catalogue');
  else if (frame.stands) {
    // a loose echo: six or more consecutive words from the pull quote
    const q = frame.stands.replace(/[^\w\s]/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
    const hay = text.replace(/[^\w\s]/g, ' ').toLowerCase();
    let echoed = false;
    for (let i = 0; i + 6 <= q.length; i++) {
      if (hay.includes(q.slice(i, i + 6).join(' '))) { echoed = true; break; }
    }
    if (!echoed) bad.push('pull quote not echoed in the body');
  }

  // promises we must not make
  if (/no account (is )?(required|needed)|without an account|never need an account/i.test(text)) {
    bad.push('claims no account is required');
  }
  // straight quotes and ASCII dashes
  if (/'/.test(text)) bad.push("straight apostrophe — use ’");
  if (/(^|\s)--(\s|$)/.test(text)) bad.push('ASCII double dash — use —');
  // exclamation outside a station name
  const bangs = (text.match(/!/g) || []).length;
  const namedBangs = STATIONS.filter((s) => /!/.test(s.name) && text.includes(s.name)).length;
  if (bangs > namedBangs) bad.push(`${bangs} exclamation mark(s)`);

  // unknown placeholders
  for (const ph of text.match(PLACEHOLDER) || []) {
    if (!KNOWN_PH.has(ph)) bad.push(`unknown placeholder ${ph}`);
  }

  /* EVERY HM FREQUENCY NAMED MUST EXIST — AND THE ONE IT SENDS YOU TO MUST PLAY.
     These are two different rules and the first version of this gate collapsed
     them into one, which made a whole class of article impossible to write. An
     essay about the Yoruba station cannot avoid naming the Yoruba station, and
     that frequency is assigned but not yet on air. Naming it is honest. Telling
     a reader to put it on this afternoon is not.
     So: an off-air frequency is allowed where the sentence carrying it says so,
     and the recommendation is read as the last ON-AIR frequency in the piece. */
  const FORTHCOMING = /assigned|in build|not yet|yet to|forthcoming|when it opens|has not opened|will open|is coming|due to|still silent|nothing plays there|no audio/i;
  const sentences = text.split(/(?<=[.?])\s+/);
  const cited = [...new Set((text.match(/HM\s?(\d{3}\.\d{2})/g) || []).map((m) => m.replace(/HM\s?/, '')))];
  const onAirCited = [];
  for (const hm of cited) {
    if (!byHm.has(hm)) { bad.push(`HM ${hm} is not a station`); continue; }
    if (liveHm.has(hm)) { onAirCited.push(hm); continue; }
    const carrying = sentences.filter((snt) => snt.includes(hm));
    if (!carrying.some((snt) => FORTHCOMING.test(snt))) {
      bad.push(`HM ${hm} (${byHm.get(hm).name}) is not on air, and is named as though it were`);
    }
  }
  if (!cited.length) bad.push('recommends no frequency');
  else if (!onAirCited.length) bad.push('names no frequency that is actually on air');

  // a bare statistic the model cannot have got from the catalogue
  const stats = text.match(/\b\d{1,3}(,\d{3})+\b|\b\d+(\.\d+)?\s?(million|billion|per cent|%)/gi) || [];
  if (stats.length) bad.push(`unverified figure(s): ${[...new Set(stats)].slice(0, 3).join(', ')}`);

  if (onAirCited.length) {
    /* The LAST on-air frequency in the piece. Paragraph 19 is the recommendation
       and nothing after it introduces a new station, so the last one named is
       the one the reader is being sent to. */
    const rec = onAirCited[onAirCited.length - 1];
    if (!recs.has(rec)) recs.set(rec, []);
    recs.get(rec).push(slug);
  }

  if (bad.length) problems.push([slug, bad.join('; ')]);
  else { clean++; console.log(`  ok    ${String(words).padStart(5)}w ${String(body.length).padStart(3)}p  ${slug}  → HM ${onAirCited[onAirCited.length - 1] || '?'}`); }
}

if (problems.length) {
  console.log('');
  for (const [slug, why] of problems) console.log(`  FAIL  ${slug}\n          ${why}`);
}
console.log(`\n  ${clean} clean, ${problems.length} to fix (${files.length} files)\n`);

/* WHERE THE ARTICLES SEND PEOPLE.
   Not pass/fail — a frequency can legitimately be recommended twice — but 113
   articles all funnelling to the same three stations would waste the best asset
   this page has, which is 113 different doors into the dial. Writers work in
   separate batches and cannot see each other's picks, so nothing but this
   report would notice the pile-up. */
if (recs.size) {
  const spread = [...recs.entries()].sort((a, b) => b[1].length - a[1].length);

  /* THE THRESHOLD HAS TO SCALE, or the report cries wolf.
     A flat "more than three articles" was right when eleven articles existed
     and useless at a hundred, where it flagged twelve stations at once — and a
     report that flags everything is read as flagging nothing. What matters is
     how far a station sits above its fair share of the articles written so far,
     so the bar is two and a half times that, and never lower than four. */
  const counted = [...recs.values()].reduce((n, v) => n + v.length, 0);
  const fairShare = counted / Math.max(1, liveHm.size);
  const LOUD = Math.max(4, Math.ceil(fairShare * 2.5));

  console.log('  recommendations, most-used first' +
              '  (fair share ' + fairShare.toFixed(1) + ', flagged above ' + LOUD + ')');
  for (const [hm, slugs] of spread) {
    const st = byHm.get(hm);
    const flag = slugs.length > LOUD ? '   <- heavily used' : '';
    console.log('    HM ' + hm + '  ' + String(slugs.length).padStart(2) + 'x  ' +
                (st ? st.name : '?').padEnd(30) + flag);
    if (slugs.length > LOUD) console.log('           ' + slugs.join(', '));
  }
  console.log('');
  console.log('  ' + spread.length + ' of ' + liveHm.size +
              ' on-air stations are recommended by at least one article');

  /* The stations nobody sends anyone to. Worth more than the pile-up at the top:
     every one of these is a door onto the dial that a hundred articles walked
     straight past, and matching one to an article that fits is free. */
  const unused = [...liveHm].filter((hm) => !recs.has(hm));
  if (unused.length) {
    console.log('  never recommended:');
    unused.forEach((hm) => {
      const st = byHm.get(hm);
      console.log('    HM ' + hm + '  ' + (st ? st.name : '?'));
    });
  }
}
process.exitCode = problems.length ? 1 : 0;
