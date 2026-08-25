#!/usr/bin/env node
/**
 * apply-scrollbars.js - one-shot migration onto the shared scrollbar
 * treatment in public/css/scrollbars.css.
 *
 * For every page it:
 *   1. inserts <link rel="stylesheet" href="/css/scrollbars.css"> immediately
 *      before that page's own <style> block, so page rules still win;
 *   2. deletes the ad-hoc ::-webkit-scrollbar rules the shared file replaces.
 *
 * Deliberately kept: radio.html's .dimension-toggle-strip bar, which is a
 * 4px horizontal affordance rather than a page scrollbar.
 *
 * Idempotent - re-running reports "already linked" and finds nothing to strip.
 *   node tools/apply-scrollbars.js
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const LINK = '<link rel="stylesheet" href="/css/scrollbars.css">';

// Selectors whose scrollbar rules the shared sheet now covers. Anything not
// listed here is left alone.
const STRIP = {
  'index.html': [],
  'radio.html': ['.main-content', '.countries-map-viewport', '.dsb-tab-content', '.accordion-content'],
  'music.html': ['.album-list', '.main-content', '.popular-sidebar', '.accordion-content'],
  'login.html': [],
  'signup.html': []
};

function escapeSelector(sel) {
  return sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let failed = false;

Object.keys(STRIP).forEach(function (file) {
  const full = path.join(PUBLIC, file);
  let html = fs.readFileSync(full, 'utf8');
  const before = html.length;
  const notes = [];

  // --- 1. link the shared sheet ------------------------------------------
  if (html.indexOf(LINK) >= 0) {
    notes.push('already linked');
  } else {
    const styleAt = html.indexOf('<style');
    if (styleAt < 0) throw new Error(file + ': no <style> block to anchor the link to');
    // Reuse the indentation of the <style> tag so the head stays tidy.
    const lineStart = html.lastIndexOf('\n', styleAt) + 1;
    const indent = html.slice(lineStart, styleAt);
    html = html.slice(0, lineStart) + indent + LINK + '\n' + html.slice(lineStart);
    notes.push('linked');
  }

  // --- 2. strip the rules it supersedes ----------------------------------
  let removed = 0;
  STRIP[file].forEach(function (sel) {
    const re = new RegExp(
      '^[ \\t]*' + escapeSelector(sel) + '::-webkit-scrollbar[^{\\n]*\\{[^}\\n]*\\}[ \\t]*\\r?\\n',
      'gm'
    );
    const hits = html.match(re);
    if (hits) { removed += hits.length; html = html.replace(re, ''); }
  });
  if (removed) notes.push('stripped ' + removed + ' rule' + (removed === 1 ? '' : 's'));

  fs.writeFileSync(full, html, 'utf8');

  // --- 3. verify ---------------------------------------------------------
  const check = fs.readFileSync(full, 'utf8');
  const leftover = STRIP[file].filter(function (sel) {
    return check.indexOf(sel + '::-webkit-scrollbar') >= 0;
  });
  if (leftover.length) { failed = true; notes.push('LEFTOVER: ' + leftover.join(', ')); }
  if (check.indexOf(LINK) < 0) { failed = true; notes.push('LINK MISSING'); }

  console.log(file.padEnd(13) + (before - check.length >= 0 ? '-' : '+') +
    Math.abs(before - check.length) + ' bytes   ' + notes.join(', '));
});

// Any element that sets scrollbar-width/color makes Chrome ignore the shared
// pseudo-element rules for it, so flag every remaining use for a human.
console.log('\nstandard-property overrides still in the pages (Chrome ignores');
console.log('::-webkit-scrollbar on these elements - intentional only if hiding):');
Object.keys(STRIP).forEach(function (file) {
  const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  html.split('\n').forEach(function (line, i) {
    if (/scrollbar-(width|color)\s*:/.test(line)) {
      console.log('  ' + file + ':' + (i + 1) + '  ' + line.trim());
    }
  });
});

process.exit(failed ? 1 : 0);
