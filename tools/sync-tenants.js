'use strict';
/**
 * sync-tenants.js — every ON AIR station must have a tenant record.
 *
 * A tenant file is what makes a station deliverable: the day-file generator,
 * the publisher and the player all resolve a channel through /tenants, so a
 * station that is marked ON AIR in the site catalogue but has no tenant record
 * is a station the listener can see, click, and never hear. That is exactly how
 * two stations shipped — visible on the dial, absent from the roster.
 *
 * Nothing here invents a tenant. A record is composed from two sources that
 * already exist, and the script fails rather than guessing when either is
 * missing:
 *
 *   tools/build-station-manifest.js  STATIONS — the catalogue slice the channel
 *                                    plays (pool + select), its mount, its
 *                                    origin city and timezone.
 *   public/js/stations-data.js       the site catalogue — whether it is ON AIR,
 *                                    its band and its programming format.
 *
 * Dry run by default; --apply writes. Run it after adding a station to STATIONS
 * and before publishing schedules.
 *
 *   node tools/sync-tenants.js
 *   node tools/sync-tenants.js --apply
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const tenants = require('./lib/tenants');
const { STATIONS } = require('./build-station-manifest');

const ROOT = path.join(__dirname, '..');
const BROADCAST_TZ = 'America/Los_Angeles';

// The site catalogue is browser JS, not a module.
function siteCatalogue() {
    const file = path.join(ROOT, 'public', 'js', 'stations-data.js');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: 'stations-data.js' });
    const out = {};
    (sandbox.window.KJ_STATIONS || []).forEach(s => { out[s.hm] = s; });
    return out;
}

function recordFor(id, st, cat) {
    const flat = id.replace(/-/g, '');
    return {
        schema: tenants.SCHEMA,
        id,
        slug: st.slug,
        // THE NAME COMES FROM THE CATALOGUE, not from the station table.
        //
        // Both carried one and they had already drifted: one station read
        // "Hebraic Celebrations" on every page and "Hebraic Celebrations
        // (Messianic)" in its tenant record, and so in every day file it
        // published. The catalogue is what every surface displays, so it wins
        // here and the tenant record becomes a derived copy rather than a
        // second opinion. See docs/STATION-NAMING.md.
        name: cat.name || st.name,
        hm: st.hm,
        band: cat.band,
        mount: st.mount,
        language: { code: st.language, name: st.languageName, tag: st.languageTag },
        mode: st.mode,
        origin: { city: st.hostCity, timezone: st.timezone },
        // The key is OMITTED rather than written as undefined when a station
        // has no artist selection. A tenant whose select is missing builds its
        // pool from the entire catalogue — every artist on the dial — which is
        // a silent wrong answer rather than a loud one. main() refuses to write
        // such a record at all; this only makes sure a malformed one cannot be
        // produced by accident.
        catalogue: st.select ? { pool: st.pool, select: st.select } : { pool: st.pool },
        delivery: {
            base: tenants.CDN_BASE,
            dir: 'radio/' + id + '/delivery',
            file: flat + '-{YYYYMMDD}.json',
            example: tenants.CDN_BASE + '/radio/' + id + '/delivery/' + flat + '-20260821.json',
        },
        format: cat.format,
        // The broadcast day is Pacific for every channel on the dial, whatever
        // the origin city is — see station-guidelines 2.5.5. origin.timezone
        // above is where the station is *from*, not when its day turns over.
        timezone: BROADCAST_TZ,
    };
}

function main(argv) {
    const apply = argv.includes('--apply');
    const cat = siteCatalogue();
    const existing = new Set(tenants.ids());

    const onAir = Object.values(cat).filter(s => s.prototype);
    const missing = [];
    const stale = [];
    const problems = [];

    // Every ON AIR station must map to a STATIONS entry and a tenant file.
    onAir.forEach(s => {
        const id = Object.keys(STATIONS).find(k => STATIONS[k].hm === s.hm);
        if (!id) {
            problems.push(s.hm + '  ' + s.name + ' — ON AIR but no STATIONS entry; cannot build a tenant');
            return;
        }
        // A station may legitimately have no `select` — HM326.20-RO deliberately
        // takes every Romanian track. What makes a tenant dangerous is a missing
        // LANGUAGE, not a missing select: language null plus no select is what
        // put eight languages on the English flagship on 2026-08-21. So the
        // guard checks the pair.
        if (!STATIONS[id].select && STATIONS[id].language === null) {
            problems.push(s.hm + '  ' + s.name + ' — no catalogue selection AND no language in ' +
                'STATIONS; a tenant with neither would play every artist in every language');
            return;
        }
        if (existing.has(id)) {
            // Records were previously written once and never revisited, so the
            // tenant table drifted away from STATIONS and kept publishing the
            // stale answer. Compare and re-derive instead of skipping.
            const want = recordFor(id, STATIONS[id], s);
            let have = null;
            try { have = JSON.parse(fs.readFileSync(tenants.tenantFile(id), 'utf8')); } catch (e) {}
            if (JSON.stringify(have) !== JSON.stringify(want)) {
                stale.push({ id, st: STATIONS[id], cat: s, have, want });
            }
            return;
        }
        missing.push({ id, st: STATIONS[id], cat: s });
    });

    // A tenant with nothing on air behind it is worth knowing about, but is not
    // an error: a channel can be provisioned before it is announced.
    const orphans = [...existing].filter(id => {
        const hm = (STATIONS[id] || {}).hm;
        return !hm || !cat[hm] || !cat[hm].prototype;
    });

    console.log('on air        : ' + onAir.length);
    console.log('tenant records: ' + existing.size);
    console.log('');

    if (problems.length) {
        console.log('PROBLEMS');
        problems.forEach(p => console.log('   ' + p));
        console.log('');
    }

    if (!missing.length) {
        console.log('every ON AIR station has a tenant record.');
    } else {
        console.log((apply ? 'writing' : 'MISSING (dry run — pass --apply to write)') + ':');
        missing.forEach(m => {
            const file = tenants.tenantFile(m.id);
            console.log('   ' + m.id + '  ' + m.cat.name);
            console.log('      pool ' + m.st.pool + ' · ' + JSON.stringify(m.st.select));
            if (apply) {
                fs.writeFileSync(file, JSON.stringify(recordFor(m.id, m.st, m.cat), null, 2) + '\n');
                console.log('      -> ' + path.relative(ROOT, file));
            }
        });
    }

    if (stale.length) {
        console.log('');
        console.log((apply ? 'reconciling' : 'STALE (dry run — pass --apply to rewrite)') + ':');
        stale.forEach(m => {
            console.log('   ' + m.id + '  ' + m.cat.name);
            Object.keys(m.want).forEach(k => {
                const a = JSON.stringify(m.have && m.have[k]), b = JSON.stringify(m.want[k]);
                if (a !== b) console.log('      ' + k + ': ' + a + '  ->  ' + b);
            });
            if (apply) {
                fs.writeFileSync(tenants.tenantFile(m.id), JSON.stringify(m.want, null, 2) + '\n');
                console.log('      -> rewritten');
            }
        });
    }

    if (orphans.length) {
        console.log('');
        console.log('tenant records with no ON AIR station (not an error):');
        orphans.forEach(id => console.log('   ' + id));
    }

    // A missing record in a dry run is a finding, not a failure; unresolvable
    // ones always are.
    return problems.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { recordFor };
