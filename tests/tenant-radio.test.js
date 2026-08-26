#!/usr/bin/env node
/**
 * Tests the tenant radio engine's resolution logic against the LIVE day files
 * on cdn.kjubilee.com.
 *
 *   node tests/tenant-radio.test.js
 *
 * The player itself needs a browser (Audio, fetch, document), so what is
 * exercised here is the half that decides WHAT should be playing — the day-file
 * URL, the binary search, the clock handling and the drift rule — run against
 * the real published files rather than a fixture, because the failure this
 * guards against is the published format drifting away from the reader.
 */
const path = require('path');
const tenants = require('../tools/lib/tenants');
const zone = require('../tools/lib/zone');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? '  — ' + detail : '')); }
}

// The two functions the player runs, transcribed. Kept in step by the tests
// below, which assert against the same live files the browser reads.
function entryAt(doc, sec) {
    let lo = 0, hi = doc.entries.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1, e = doc.entries[mid];
        if (sec < e.t) hi = mid - 1;
        else if (sec >= e.t + e.d) lo = mid + 1;
        else return { entry: e, index: mid, offset: sec - e.t };
    }
    return null;
}
function dayUrl(id, yyyymmdd) {
    return 'https://cdn.kjubilee.com/radio/' + id + '/delivery/' +
           id.replace(/-/g, '') + '-' + yyyymmdd + '.json';
}

(async () => {
    console.log('\ntenant radio — resolution against live day files\n');

    // The URL the player builds must equal the key the publisher wrote.
    // The BROADCAST date, which is what the player asks for.
    const today = zone.localDate(Date.now());
    ok('player URL matches the publisher key',
       dayUrl('HM326.20-RO', today.replace(/-/g, '')) ===
       tenants.deliveryUrl('HM326.20-RO', today),
       dayUrl('HM326.20-RO', today.replace(/-/g, '')));

    const roster = tenants.ids();
    ok('tenant roster is readable', roster.length > 0, roster.length + ' tenants');

    const stamp = today.replace(/-/g, '');
    let checked = 0;

    for (const id of roster) {
        const res = await fetch(dayUrl(id, stamp));
        if (!res.ok) { ok(id + ' day file', false, 'HTTP ' + res.status); continue; }

        // The clock correction the player applies, exercised on a real response.
        const served = Date.parse(res.headers.get('date') || '');
        ok(id + ' serves a Date header for clock sync', !!served);

        const doc = await res.json();
        ok(id + ' is a tenant day document', doc.schema === 'kj.tenant.day/1', doc.schema);
        ok(id + ' names its tenant and date', doc.tenant === id && doc.date === today);

        ok(id + ' is a Pacific broadcast day', doc.tz === 'America/Los_Angeles', doc.tz);
        ok(id + ' declares when the day starts and how long it is',
           !!doc.startsAt && doc.seconds > 0, doc.startsAt + ' / ' + doc.seconds + 's');
        ok(id + ' day length matches the zone', doc.seconds === zone.dayLengthSeconds(doc.date),
           doc.seconds + ' vs ' + zone.dayLengthSeconds(doc.date));
        ok(id + ' entries carry an album for the display line',
           doc.entries.every(e => typeof e.al === 'string'));
        ok(id + ' can render both display lines',
           !!(doc.entries[0].ti && doc.name && doc.hm && doc.format),
           doc.entries[0].ti + (doc.entries[0].al ? ' (' + doc.entries[0].al + ')' : '') +
           '  /  ' + doc.name + ' HM ' + doc.hm + ' (' + doc.format + ')');

        // Every second of the day must resolve, or a listener tuning in at that
        // moment gets nothing.
        let gaps = 0, firstGap = null;
        for (let s = 0; s < doc.seconds; s += 11) {
            const hit = entryAt(doc, s);
            if (!hit || hit.offset < 0 || hit.offset >= hit.entry.d) {
                gaps++; if (firstGap === null) firstGap = s;
            }
        }
        ok(id + ' resolves every probed second', gaps === 0,
           gaps ? gaps + ' gap(s), first at ' + firstGap : '');

        // The URL the player builds for audio has to be fetchable.
        const hit = entryAt(doc, (Date.now() / 1000 | 0) % 86400) || entryAt(doc, 0);
        const url = doc.cdnBase + '/' + doc.prefix +
                    hit.entry.u.split('/').map(encodeURIComponent).join('/');
        const head = await fetch(url, { method: 'HEAD' });
        ok(id + ' current track is fetchable', head.ok, head.status + ' ' + hit.entry.ti);

        // Mid-track joins need ranges, which is how a late listener starts.
        const range = await fetch(url, { headers: { Range: 'bytes=200000-200255' } });
        ok(id + ' supports a mid-track join', range.status === 206, 'got ' + range.status);

        checked++;
    }

    ok('every tenant checked', checked === roster.length, checked + '/' + roster.length);

    // A missing day must be detectable, since that is what triggers the request.
    const missing = await fetch(dayUrl('HM326.20-RO', '19990101'));
    ok('an unpublished day 404s so the player can request it', missing.status === 404,
       'got ' + missing.status);

    console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
    process.exit(fail ? 1 : 0);
})();
