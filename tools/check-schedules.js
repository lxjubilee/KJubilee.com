#!/usr/bin/env node
/**
 * check-schedules.js — is every on-air station actually PLAYABLE today?
 *
 *   node tools/check-schedules.js          # today + 3 days
 *   node tools/check-schedules.js 7        # today + 6
 *
 * ON AIR IS NOT THE SAME QUESTION. `prototype` is derived from a station having
 * a built manifest, and a manifest says what a station COULD play. What the
 * player actually fetches is the day file, and nothing until now checked that
 * one existed. A station can read ON AIR on the dial, carry 1,749 tracks, and
 * be silent — which is exactly the report that prompted this file.
 *
 * It asks for the same dates the player will: the day key is computed in
 * Pacific, because every tenant declares a Pacific broadcast day, and asking in
 * local time would pass on a workstation and fail for a listener.
 *
 * A 200 IS NOT ENOUGH. The file is parsed and its entries counted, because an
 * empty day file returns 200 and plays nothing.
 *
 * Exit 1 on any gap, so it can gate a deploy — see setup/import-refresh.md
 * Phase 7.
 */
const fs = require('fs');

const CDN = 'https://cdn.kjubilee.com';
const DAYS = Number(process.argv[2] || 4);

global.window = {};
require(require('path').join(__dirname, '..', 'public', 'js', 'stations-data.js'));
const stations = (global.window.KJ_STATIONS || []).filter(s => s.prototype && s.tenant);

// The player computes the day key in Pacific — tenants are all Pacific
// broadcast days — so the sweep has to ask for the same dates it will.
function pacificDay(offsetDays) {
    const d = new Date(Date.now() + offsetDays * 86400000);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d).replace(/-/g, '');
}

(async () => {
    const dates = Array.from({ length: DAYS }, (_, i) => pacificDay(i));
    console.log('stations on air with a tenant: ' + stations.length);
    console.log('checking days: ' + dates.join(', ') + '\n');

    const gaps = [];
    for (const s of stations) {
        const flat = s.tenant.replace('-', '');
        const row = [];
        for (const d of dates) {
            const url = CDN + '/radio/' + s.tenant + '/delivery/' + flat + '-' + d + '.json';
            let ok = false, entries = 0;
            try {
                const r = await fetch(url);
                if (r.ok) {
                    const j = await r.json();
                    entries = (j.entries || j.items || j.schedule || []).length;
                    ok = entries > 0;
                }
            } catch (e) { /* treated as missing */ }
            row.push(ok ? String(entries) : 'MISSING');
            if (!ok) gaps.push({ station: s.tenant, name: s.name, date: d });
        }
        const bad = row.some(x => x === 'MISSING');
        console.log('  ' + (bad ? 'GAP  ' : 'ok   ') + s.tenant.padEnd(14) + s.name.slice(0, 26).padEnd(28) + row.join('  '));
    }

    console.log('');
    if (!gaps.length) {
        console.log('PASS — every on-air station has a populated day file for all ' + DAYS + ' days');
    } else {
        const byDate = {};
        for (const g of gaps) (byDate[g.date] = byDate[g.date] || []).push(g.name);
        console.log(gaps.length + ' GAP(S):');
        for (const d of Object.keys(byDate).sort()) {
            console.log('  ' + d + ': ' + byDate[d].length + ' station(s) — ' + byDate[d].slice(0, 6).join(', ')
                + (byDate[d].length > 6 ? ' …' : ''));
        }
    }
    process.exit(gaps.length ? 1 : 0);
})();
