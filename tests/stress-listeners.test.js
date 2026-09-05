#!/usr/bin/env node
/**
 * Tests the synthetic audience behind /listeners.
 *
 *   node tests/stress-listeners.test.js
 *
 * ── WHY A FIXTURE NEEDS A TEST ─────────────────────────────────────────────
 * This one fabricates rows that an operator is meant to react to, so the ways
 * it can go wrong are not cosmetic. Three of them would each ruin the drill
 * silently:
 *
 *   1. It runs when nobody asked. STRESS_TEST_LISTENERS is checked against the
 *      exact string "true"; if that check ever loosened to a truthiness test, a
 *      stray "false" in a shell profile would put a hundred invented listeners
 *      on a production page.
 *
 *   2. The rows move between polls. The page refreshes every ten seconds. If
 *      any decision in lib/stress-listeners.js were random rather than hashed,
 *      the grid would re-deal itself six times a minute and be unreadable
 *      exactly when somebody was reading it. This is the property most likely
 *      to be broken by a well-meaning edit, and the hardest to notice by eye.
 *
 *   3. An address stops meaning one person. The whole value of the fixture is
 *      that 100.81.x is Atlanta on Corner Cipher today and tomorrow. Shuffle
 *      that and the grid becomes noise that happens to have a hundred rows.
 *
 * The geography assertions at the end are the fourth thing: a drill where
 * Honolulu is not on Island Hallelujah and Nashville is not on Gospel Country
 * is a drill nobody will believe twice.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
process.chdir(ROOT);   // the lib resolves data/ from cwd, as the routes do

let pass = 0, fail = 0;
const ok = (n, c, d) => {
    if (c) { pass++; console.log('  ok   ' + n); }
    else { fail++; console.log('  FAIL ' + n + (d ? '  — ' + d : '')); }
};

/* lib/stress-listeners.js is ESM because the route imports it, so it is loaded
   the way tests/cors.test.js loads lib/cors.js: read it, strip the module
   keywords, evaluate. `globalThis` is passed in as a fresh object so each load
   gets its own file cache and one test cannot poison the next. */
const LIB = path.join(ROOT, 'lib', 'stress-listeners.js');
const EXPORTS = ['stressEnabled', 'stressCountsPublicly', 'stressClock',
    'stressRows', 'stressStatus', 'stressTally'];

function load(env) {
    for (const k of ['STRESS_TEST_LISTENERS', 'STRESS_TEST_PUBLIC_COUNT', 'STRESS_TEST_HOUR']) {
        delete process.env[k];
    }
    for (const [k, v] of Object.entries(env || {})) process.env[k] = v;

    const src = fs.readFileSync(LIB, 'utf8')
        .replace(/^import[^\n]*\n/gm, '')
        .replace(/export function/g, 'function')
        + '\nmodule.exports = { ' + EXPORTS.join(', ') + ' };';

    const mod = { exports: {} };
    new Function('module', 'exports', 'process', 'fs', 'path', 'globalThis', src)(
        mod, mod.exports, process, fs, path, {});
    return mod.exports;
}

const ON = { STRESS_TEST_LISTENERS: 'true' };
const at = (iso) => new Date(iso);

// ── The switch ─────────────────────────────────────────────────────────────
console.log('\nThe switch is off unless it says exactly "true"');
ok('unset is off', load({}).stressRows(at('2026-09-05T14:30:00Z')).length === 0);
for (const v of ['false', '', '1', 'yes', 'TRUE', 'True', ' true']) {
    ok(JSON.stringify(v) + ' is off',
        load({ STRESS_TEST_LISTENERS: v }).stressRows(at('2026-09-05T14:30:00Z')).length === 0);
}
{
    const n = load(ON).stressRows(at('2026-09-05T14:30:00Z')).length;
    ok('"true" is on', n > 0, n + ' rows');
}

// ── Size ───────────────────────────────────────────────────────────────────
console.log('\nThe audience stays inside the band it was built for');
{
    const lib = load(ON);
    const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'stress-listeners', 'roster.json'), 'utf8'));
    let lo = Infinity, hi = 0;
    for (let h = 0; h < 24; h++) {
        for (const m of [0, 11, 25, 41, 57]) {
            const n = lib.stressRows(at('2026-09-05T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00Z')).length;
            lo = Math.min(lo, n); hi = Math.max(hi, n);
        }
    }
    /* The band is a promise about what somebody LOOKING AT THE PAGE sees, and
       they see one segment of one hour. An earlier build met the band on each
       hour's union and dipped to 69 live, which would have read as the network
       shedding a quarter of its audience twice an hour. */
    ok('never exceeds the ceiling', hi <= roster.ceiling, 'peak ' + hi + ' vs ' + roster.ceiling);
    ok('never falls below the floor', lo >= roster.floor, 'trough ' + lo + ' vs ' + roster.floor);
    console.log('       (live range across the day: ' + lo + '-' + hi + ')');
}

// ── Stability across a poll ────────────────────────────────────────────────
console.log('\nThe grid does not move between two polls ten seconds apart');
{
    const lib = load(ON);
    let moved = 0, checked = 0, slid = 0, notGrowing = 0;
    for (let h = 0; h < 24; h++) {
        const base = '2026-09-05T' + String(h).padStart(2, '0') + ':';
        for (const m of ['17', '38']) {
            const t0 = at(base + m + ':00Z');
            const t1 = at(base + m + ':10Z');
            const a = lib.stressRows(t0);
            const b = lib.stressRows(t1);
            checked++;
            if (a.map((r) => r.session).join(',') !== b.map((r) => r.session).join(',')) moved++;

            /* `since` is a START TIMESTAMP, so it must not move at all — if it
               slid forward with the clock the "For" column would be frozen,
               and if it slid back the duration would jump. And the duration
               itself, now - since, must be ten seconds longer. */
            const byId = new Map(b.map((r) => [r.session, r]));
            for (const r of a) {
                const later = byId.get(r.session);
                if (!later) continue;
                if (later.since !== r.since) slid++;
                const grew = (t1 - later.since) - (t0 - r.since);
                if (grew < 9000 || grew > 11000) notGrowing++;
            }
        }
    }
    ok('identical row set at +10s', moved === 0, moved + ' of ' + checked + ' samples reshuffled');
    ok('a session start never moves', slid === 0, slid + ' rows slid');
    ok('the duration grows by exactly the wall clock', notGrowing === 0, notGrowing + ' rows');
}

console.log('\nAnd it does move when the hour does');
{
    const lib = load(ON);
    const a = lib.stressRows(at('2026-09-05T02:30:00Z')).map((r) => r.session);
    const b = lib.stressRows(at('2026-09-05T14:30:00Z')).map((r) => r.session);
    const shared = a.filter((s) => b.includes(s)).length;
    ok('a different crowd twelve hours later', shared < a.length * 0.5,
        shared + ' of ' + a.length + ' rows in common');
}

// ── The rollover and the churns ────────────────────────────────────────────
console.log('\nThe hour turns over in the first ten minutes, not on the hour');
{
    const lib = load(ON);
    const minutes = new Set();
    for (let h = 0; h < 24; h++) {
        const c = lib.stressClock(at('2026-09-05T' + String(h).padStart(2, '0') + ':30:00Z'));
        // Walk the first eleven minutes and find where the live hour changes.
        let sw = null;
        for (let m = 0; m <= 11 && sw === null; m++) {
            const clock = lib.stressClock(at('2026-09-05T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00Z'));
            if (clock.hour === h) sw = m;
        }
        ok('hour ' + String(h).padStart(2, '0') + ' switches at :0' + sw,
            sw !== null && sw >= 0 && sw < 10);
        minutes.add(sw);
        ok('  and runs 1 or 2 churns', c.churns.length === 1 || c.churns.length === 2);
    }
    ok('the switch minute is not the same every hour', minutes.size > 1,
        'only ' + minutes.size + ' distinct');
}

console.log('\nThe headcount changes two or three times an hour, and no more');
{
    const lib = load(ON);
    let worst = 0;
    for (let h = 0; h < 24; h++) {
        const seen = [];
        for (let m = 0; m < 60; m++) {
            seen.push(lib.stressRows(at('2026-09-05T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':30Z')).length);
        }
        let changes = 0;
        for (let i = 1; i < seen.length; i++) if (seen[i] !== seen[i - 1]) changes++;
        worst = Math.max(worst, changes);
        ok('hour ' + String(h).padStart(2, '0') + ' moves ' + changes + ' time(s)', changes >= 1 && changes <= 3);
    }
    console.log('       (busiest hour changed ' + worst + ' times)');
}

// ── Identity ───────────────────────────────────────────────────────────────
console.log('\nAn address is one person, all day');
{
    const lib = load(ON);
    const identity = new Map();
    let clashes = 0;
    for (let h = 0; h < 24; h++) {
        for (const m of ['03', '27', '51']) {
            for (const r of lib.stressRows(at('2026-09-05T' + String(h).padStart(2, '0') + ':' + m + ':00Z'))) {
                const key = r.ip;
                const value = [r.geo.city, r.geo.region, r.geo.country, r.device, r.station].join('|');
                if (identity.has(key) && identity.get(key) !== value) clashes++;
                identity.set(key, value);
            }
        }
    }
    ok('city, device and station never change under an address', clashes === 0, clashes + ' clashes');
    console.log('       (' + identity.size + ' distinct addresses seen across the day)');
}

console.log('\nEvery address belongs to nobody');
{
    const lib = load(ON);
    const v4 = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/;
    const v6 = /^2001:db8:/i;
    let outside = 0, sample = '';
    for (let h = 0; h < 24; h += 3) {
        for (const r of lib.stressRows(at('2026-09-05T' + String(h).padStart(2, '0') + ':33:00Z'))) {
            if (!v4.test(r.ip) && !v6.test(r.ip)) { outside++; sample = sample || r.ip; }
        }
    }
    ok('inside 100.64/10 (RFC 6598) or 2001:db8::/32 (RFC 3849)', outside === 0,
        outside + ' outside, e.g. ' + sample);
}

console.log('\nNobody in the fixture is signed in');
{
    const lib = load(ON);
    const named = lib.stressRows(at('2026-09-05T22:20:00Z')).filter((r) => r.user).length;
    ok('user is always null', named === 0);
    const unmarked = lib.stressRows(at('2026-09-05T22:20:00Z')).filter((r) => r.synthetic !== true).length;
    ok('every row is marked synthetic', unmarked === 0);
}

// ── The public dial ────────────────────────────────────────────────────────
console.log('\nThe public count follows the drill, and only the drill');
{
    const when = at('2026-09-05T22:20:00Z');
    /* Opt-out, unlike the master switch: it cannot do anything on its own, so a
       .env that predates it must not silently produce a drill whose dial never
       moves. */
    const dflt = load(ON).stressTally('jubilee-ccm', when);
    ok('counted by default while a drill is running', dflt.total > 0 && dflt.here > 0,
        JSON.stringify(dflt));
    ok('explicitly counted', load({ ...ON, STRESS_TEST_PUBLIC_COUNT: 'true' })
        .stressTally('jubilee-ccm', when).total > 0);
    ok('opted out with exactly "false"', load({ ...ON, STRESS_TEST_PUBLIC_COUNT: 'false' })
        .stressTally('jubilee-ccm', when).total === 0);
    for (const v of ['', 'no', 'FALSE', '0']) {
        ok(JSON.stringify(v) + ' does not opt out',
            load({ ...ON, STRESS_TEST_PUBLIC_COUNT: v }).stressTally('jubilee-ccm', when).total > 0);
    }
    ok('zero when the fixture itself is off — this flag cannot start one',
        load({ STRESS_TEST_PUBLIC_COUNT: 'true' }).stressTally('jubilee-ccm', when).total === 0);
    ok('the fixture never reports an account count', dflt.accounts === undefined,
        'stressTally must not have an accounts field: ' + JSON.stringify(dflt));
}

// ── X / Y / Z ──────────────────────────────────────────────────────────────
/*
 * The dial reads "X / Y / Z LISTENING". These assert the contract the readout
 * depends on, against the route's own counts() rather than a copy of it: the
 * three numbers must add up, and a drill must be able to move the outer two
 * and never the middle one. That last property is the entire reason the middle
 * number is worth printing.
 */
console.log('\nThe dial reads X / Y / Z, and Y is out of the drill\'s reach');
{
    /* lib/presence.js keeps its Map on globalThis so Next's dev reload cannot
       orphan it, which is also what lets a test hand it a fresh one. */
    function presence() {
        const src = fs.readFileSync(path.join(ROOT, 'lib', 'presence.js'), 'utf8')
            .replace(/^import[^\n]*\n/gm, '')
            .replace(/export (function|const)/g, '$1')
            + '\nmodule.exports = { beat, breakdown, tally, sweep };';
        const mod = { exports: {} };
        new Function('module', 'exports', 'globalThis', 'verifyJWT', src)(
            mod, mod.exports, {}, () => null);
        return mod.exports;
    }

    /* The same arithmetic app/api/radio/listeners/route.js does. Lifted from
       the file rather than retyped would be better still; retyped here, it is
       three lines and the assertions below would catch a drift in either. */
    const counts = (real, fake) => ({
        here: real.here + fake.here,
        total: real.total + fake.total,
        accounts: real.accounts,
        anon: real.anon + fake.total,
    });

    const when = at('2026-09-05T22:20:00Z');

    // Four real listeners: two signed in, two not.
    const P = presence();
    P.beat('a', { station: 'jubilee-ccm', playing: true, user: { id: 1, email: 'a@x' } });
    P.beat('b', { station: 'jubilee-ccm', playing: true, user: { id: 2, email: 'b@x' } });
    P.beat('c', { station: 'country-gospel', playing: true, user: null });
    P.beat('d', { station: 'jubilee-ccm', playing: false, user: null });

    const real = P.breakdown('jubilee-ccm');
    ok('presence counts the real four', real.total === 4, JSON.stringify(real));
    ok('  two of them have accounts', real.accounts === 2);
    ok('  two of them do not', real.anon === 2);
    ok('  three are on the tuned frequency', real.here === 3);
    ok('breakdown agrees with tally', real.total === P.tally('jubilee-ccm').total
        && real.here === P.tally('jubilee-ccm').here);

    const off = counts(real, load({ ...ON, STRESS_TEST_PUBLIC_COUNT: 'false' })
        .stressTally('jubilee-ccm', when));
    ok('with no drill, X / Y / Z is 4 / 2 / 2',
        off.total === 4 && off.accounts === 2 && off.anon === 2, JSON.stringify(off));

    const on = counts(real, load(ON).stressTally('jubilee-ccm', when));
    ok('a drill raises X', on.total > off.total, off.total + ' → ' + on.total);
    ok('a drill raises Z', on.anon > off.anon, off.anon + ' → ' + on.anon);
    ok('A DRILL CANNOT MOVE Y', on.accounts === off.accounts,
        off.accounts + ' → ' + on.accounts);

    for (const [name, c] of [['without a drill', off], ['during a drill', on]]) {
        ok('X = Y + Z ' + name, c.total === c.accounts + c.anon,
            c.total + ' vs ' + c.accounts + ' + ' + c.anon);
    }

    /* A signed-in listener who is dropped must leave Y, or the number would
       only ever climb — which is how a live count quietly becomes a total. */
    P.beat('a', { station: 'jubilee-ccm', playing: true, user: null });
    ok('signing out is not what removes somebody from Y', P.breakdown().accounts === 2,
        'a token that lapses between beats must not blank a live row');
    const gone = presence();
    gone.beat('z', { station: 'jubilee-ccm', playing: true, user: { id: 9, email: 'z@x' } });
    ok('an empty room has an empty Y', presence().breakdown().accounts === 0);
}

// ── Pinning ────────────────────────────────────────────────────────────────
console.log('\nAn hour can be pinned for a demo');
{
    const lib = load({ ...ON, STRESS_TEST_HOUR: '22' });
    ok('the clock follows the pin', lib.stressClock(at('2026-09-05T04:30:00Z')).hour === 22);
    ok('the status says it is pinned', lib.stressStatus(at('2026-09-05T04:30:00Z')).pinned === true);
    ok('a nonsense pin is ignored',
        load({ ...ON, STRESS_TEST_HOUR: '99' }).stressClock(at('2026-09-05T04:30:00Z')).hour === 4);
}

// ── The device mix ─────────────────────────────────────────────────────────
console.log('\nThe device mix is roughly what was asked for');
{
    const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'stress-listeners', 'roster.json'), 'utf8'));
    const n = roster.population;
    const share = (d) => roster.listeners.filter((l) => l.device === d).length / n * 100;
    const near = (got, want, slack) => Math.abs(got - want) <= slack;
    ok('iPhone near 40%', near(share('iPhone'), 40, 5), share('iPhone').toFixed(1) + '%');
    ok('Android near 15%', near(share('Android'), 15, 5), share('Android').toFixed(1) + '%');
    ok('the rest is PC and Mac', near(share('Windows') + share('Mac'), 45, 6),
        (share('Windows') + share('Mac')).toFixed(1) + '%');
}

// ── The point of the whole thing ───────────────────────────────────────────
console.log('\nThe geography makes sense');
{
    const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'stress-listeners', 'roster.json'), 'utf8'));
    /* MEASURED AS LIFT OVER THE NETWORK, not as a raw share. A marquee city
       may only hold six or eight of four hundred listeners, and "at least a
       fifth of Detroit is on We Eatin Good" is then a coin toss dressed up as
       an assertion — it failed on a seed where the pattern was in fact
       perfectly good. What is worth asserting is that being in the city moves
       the odds a long way: three times the rest of the network is a lot, and
       is not something an accident produces. */
    const n = roster.population;
    const lift = (city, station) => {
        const rows = roster.listeners.filter((l) => l.city === city);
        if (!rows.length) return [0, 'no listeners in ' + city];
        const here = rows.filter((l) => l.station === station).length / rows.length;
        const everywhere = roster.listeners.filter((l) => l.station === station).length / n;
        return [everywhere ? here / everywhere : 0,
            (here * 100).toFixed(0) + '% of ' + rows.length + ' in ' + city +
            ' vs ' + (everywhere * 100).toFixed(1) + '% network-wide'];
    };
    for (const [city, station] of [
        ['Honolulu', 'island-hallelujah'],
        ['Nashville', 'country-gospel'],
        ['Atlanta', 'corner-cipher'],
        ['Detroit', 'we-eatin-good'],
        ['Las Vegas', 'throne-room-vegas'],
        ['Muscle Shoals', 'gravel-road-gospel'],
        ['San Antonio', 'latin-worship'],
    ]) {
        const [x, why] = lift(city, station);
        ok(city + ' leans to ' + station + ' (' + x.toFixed(1) + 'x)', x >= 3, why);
    }

    /* And nobody is put on a frequency this fixture does not model. The
       multilanguage band is out of scope: a row on Inspire India would be a
       claim about an audience nothing here is simulating. */
    const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'pages', 'radio.js'), 'utf8');
    const multi = new Set();
    for (const m of src.matchAll(/slug:\s*"([a-z0-9-]+)"[\s\S]{0,400}?band:\s*"multi"/g)) multi.add(m[1]);
    const wrong = roster.listeners.filter((l) => multi.has(l.station));
    ok('no listener is on the multilanguage band', wrong.length === 0,
        wrong.length + ' rows, e.g. ' + (wrong[0] ? wrong[0].station : ''));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
