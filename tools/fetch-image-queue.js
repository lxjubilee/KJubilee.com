#!/usr/bin/env node
/**
 * fetch-image-queue.js — bring the "regenerate this cover" queue down to disk.
 *
 *   KJ_ADMIN_TOKEN=… node tools/fetch-image-queue.js
 *   node tools/fetch-image-queue.js --token <jwt> [--site https://www.kjubilee.com]
 *
 * WHAT THIS BRIDGES. An administrator hovering a station card can press the red
 * button in the corner of the cover and say "this image is wrong, make it
 * again". That writes a row to kj_station_image_queue on the VPS.
 *
 * The Station Image Studio, which is the thing that would act on it, runs on a
 * workstation and reads the repo. The two share a database and no disk, and the
 * Studio has a logged-in ChatGPT session rather than a kJubilee admin one — so
 * it cannot call the admin API itself without being given credentials it has
 * no other reason to hold. This tool is the operator standing between them: it
 * carries the token, asks once, and leaves the answer in the images folder.
 *
 *     public/images/stations/requeue.json
 *
 * WHY NOT DELETE THE COVERS INSTEAD. That is the Studio's own idea of pending —
 * done-ness is the file — and deleting is exactly what the button in the console
 * refuses to do, because the cover is live on the site until a replacement
 * exists. The queue names stations whose image is present and unwanted, which
 * is a state the filesystem cannot express.
 *
 * The Studio does not read this file yet. Until it does, the list is still
 * useful to a person: it is the worklist to tick "show stations with images"
 * and work through by hand.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'images', 'stations', 'requeue.json');

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : null;
}

const site = (arg('site') || process.env.KJ_SITE || 'https://www.kjubilee.com').replace(/\/+$/, '');
const token = arg('token') || process.env.KJ_ADMIN_TOKEN;
const all = process.argv.includes('--all');

if (!token) {
  console.error('no admin token. Set KJ_ADMIN_TOKEN, or pass --token <jwt>.');
  console.error('It is the same bearer token the console uses — copy it from');
  console.error("localStorage 'jv_auth' on a signed-in admin browser.");
  process.exit(1);
}

(async () => {
  const url = site + '/api/admin/station-images' + (all ? '?all=1' : '');
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  } catch (e) {
    console.error('could not reach ' + url + ' — ' + e.message);
    process.exit(1);
  }

  if (res.status === 403) {
    console.error('403 from ' + url + ' — that token is not an admin, or the');
    console.error("role has no 'stations' section granted.");
    process.exit(1);
  }
  if (!res.ok) { console.error('HTTP ' + res.status + ' from ' + url); process.exit(1); }

  const body = await res.json();
  const queue = body.queue || [];

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    schema: 'kj.station.requeue/1',
    note: [
      'Stations whose cover exists and has been asked to be generated again.',
      'Pulled from /api/admin/station-images by tools/fetch-image-queue.js.',
      'NOT a record of what is missing — the Studio answers that from the disk.',
    ],
    fetched: new Date().toISOString().slice(0, 19).replace('T', ' '),
    slugs: queue.filter(r => !r.done_at).map(r => r.slug),
    queue,
  }, null, 2) + '\n', 'utf8');

  const open = queue.filter(r => !r.done_at);
  console.log('wrote ' + path.relative(ROOT, OUT) + ' — ' + open.length + ' station(s) waiting');
  for (const r of open) {
    const when = String(r.requested_at || '').slice(0, 16).replace('T', ' ');
    console.log('  ' + r.slug.padEnd(32) + when + '  ' + (r.requested_by || '') +
                (r.reason ? '  — ' + r.reason : ''));
  }
  if (!open.length) console.log('  nothing queued.');
})();
