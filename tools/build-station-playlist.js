#!/usr/bin/env node
/**
 * build-station-playlist.js — turn a station's `music.json` manifest into the
 * M3U pair Liquidsoap broadcasts from.
 *
 * The radio engine (/opt/jubilee-radio) runs a hot-swap pair per station:
 * `<station>-a.m3u` and `<station>-b.m3u` in storage/playlists. Liquidsoap
 * plays one slot while the other is rewritten, then `<station>.swap` over
 * telnet cuts to the fresh one with a crossfade. Writing both slots is correct
 * for a first provision; for a live update, write the inactive slot and swap.
 *
 * Entries are absolute HTTPS URLs on cdn.kjubilee.com rather than local paths,
 * so the broadcast plays exactly the bytes listeners stream — one copy, no
 * second tree to drift. Per docs/MUSIC-REPOSITORY-SPEC.md §1a that CDN is the
 * only correct origin: never point a playlist at another project's CDN.
 *
 * Usage:
 *   node tools/build-station-playlist.js --station HM305.12-EN --out-dir ./out
 *   node tools/build-station-playlist.js --station HM305.12-EN --stdout-a
 *
 * The manifest is read from <CDN_LOCAL_ROOT>/radio/<STATION_ID>/delivery/music.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CDN_ROOT = process.env.CDN_LOCAL_ROOT || 'J:\\kjubilee.com';
const PUBLIC_CDN = (process.env.PUBLIC_CDN_URL || 'https://cdn.kjubilee.com').replace(/\/+$/, '');

function opt(argv, name, fallback) {
    const i = argv.indexOf('--' + name);
    if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
    const eq = argv.find(a => a.indexOf('--' + name + '=') === 0);
    return eq ? eq.slice(('--' + name + '=').length) : fallback;
}

// A manifest URL is relative (/cdn/music/...) because the same file has to be
// correct in dev and in prod. Liquidsoap has no site to be relative to, so the
// playlist needs the absolute origin.
function absolute(url) {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/cdn/')) return PUBLIC_CDN + '/' + url.slice('/cdn/'.length);
    return PUBLIC_CDN + (url.startsWith('/') ? '' : '/') + url;
}

// #EXTINF wants whole seconds and a single display line. A comma inside the
// title is fine — players split on the FIRST comma only — but a newline would
// silently truncate the entry, so flatten any whitespace.
function extinf(track) {
    const secs = Number.isFinite(track.duration_s) ? Math.round(track.duration_s) : -1;
    const artist = String(track.artist || '').replace(/\s+/g, ' ').trim();
    const title = String(track.title || '').replace(/\s+/g, ' ').trim();
    return '#EXTINF:' + secs + ',' + (artist ? artist + ' - ' : '') + title;
}

function buildPlaylist(manifest) {
    const lines = ['#EXTM3U'];
    let n = 0, missingDuration = 0;
    for (const album of manifest.albums || []) {
        for (const t of album.tracks || []) {
            if (!t.url) continue;
            if (!Number.isFinite(t.duration_s)) missingDuration++;
            lines.push(extinf(t));
            lines.push(absolute(t.url));
            n++;
        }
    }
    return { body: lines.join('\n') + '\n', count: n, missingDuration };
}

function main(argv) {
    const station = opt(argv, 'station', null);
    const outDir = opt(argv, 'out-dir', null);
    const stdoutA = argv.includes('--stdout-a');
    if (!station) {
        console.error('Usage: node tools/build-station-playlist.js --station <STATION_ID> [--out-dir <dir>] [--stdout-a]');
        return 2;
    }

    const manifestPath = path.join(CDN_ROOT, 'radio', station, 'delivery', 'music.json');
    if (!fs.existsSync(manifestPath)) {
        console.error('No manifest at ' + manifestPath + ' — build it first with build-station-manifest.js');
        return 2;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // A playlist built from a manifest that points at someone else's CDN would
    // put the wrong bytes on air. Refuse rather than broadcast it.
    if (manifest.source && manifest.source.url_layout === 'source') {
        console.error('Manifest for ' + station + ' was built with --url-layout source (absolute ' +
                      'cdn.jubileeverse.com URLs). Rebuild it canonical before making a playlist — ' +
                      'see docs/MUSIC-REPOSITORY-SPEC.md §1a.');
        return 1;
    }

    const { body, count, missingDuration } = buildPlaylist(manifest);
    if (!count) {
        console.error('Manifest has no playable tracks — refusing to write an empty playlist.');
        return 1;
    }

    // Liquidsoap reads /playlists/<mount>-a.m3u, and the mount name is not the
    // site slug — the site calls it jubilee-radio, the mount is /jubilee. The
    // manifest carries the mount so this cannot be guessed wrong.
    const slug = manifest.mount || manifest.station_slug || station.toLowerCase();
    console.log(station + ' — ' + manifest.station_name);
    console.log('  ' + count + ' entries, origin ' + PUBLIC_CDN);
    if (missingDuration) {
        console.log('  note: ' + missingDuration + ' track(s) have no duration; written as #EXTINF:-1 ' +
                    '(Liquidsoap reads the real length from the file, so this is cosmetic)');
    }

    if (stdoutA) { process.stdout.write(body); return 0; }

    if (!outDir) { console.error('  (no --out-dir given; nothing written)'); return 0; }
    fs.mkdirSync(outDir, { recursive: true });
    for (const slot of ['a', 'b']) {
        const p = path.join(outDir, slug + '-' + slot + '.m3u');
        fs.writeFileSync(p, body, 'utf8');
        console.log('  wrote ' + p);
    }
    return 0;
}

module.exports = { buildPlaylist, absolute, extinf };
if (require.main === module) process.exit(main(process.argv.slice(2)));
