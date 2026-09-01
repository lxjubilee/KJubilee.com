#!/usr/bin/env node
/**
 * Tests the A/B/C rotation ratings store behind /analytics/start.html.
 *
 *   node tests/station-ratings.test.js
 *
 * TWO RULES CARRY THE WHOLE DESIGN, and both are the kind that look like
 * details until they are wrong.
 *
 * 1. C IS NOT STORED. Every song on every station is C until a human promotes
 *    it, so C is the absence of a record. Store it and this file grows a row
 *    for all 8,697 slots on the dial saying "nobody has looked at this yet",
 *    and the one question it exists to answer — WHICH songs has somebody
 *    looked at — becomes a search rather than a read. Demoting to C must
 *    therefore DELETE, and a station whose last promotion is removed must
 *    leave no empty object behind.
 *
 * 2. THE GATE IS THE ROUTE, NOT THE PAGE. The console draws rating controls
 *    only for an admin, but that is presentation; a POST from anyone else has
 *    to be refused here, with the same answer for no token, unknown user and
 *    wrong role. Distinguishing them tells a prober which half to work on.
 *
 * The route is ESM (Next imports it), so it is loaded the way tests/cors.test.js
 * loads lib/cors.js: read the source, strip the import/export keywords, and
 * evaluate it with stubs in place of lib/api and lib/admin. That keeps this
 * test free of a database — requireAdmin's real implementation asks Postgres,
 * and what is under test here is what the handler does with the ANSWER.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, d) => {
    if (c) { pass++; console.log('  ok   ' + n); }
    else { fail++; console.log('  FAIL ' + n + (d ? '  — ' + d : '')); }
};

// ── Load the route with stubbed collaborators ────────────────────────────
const STORE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kj-ratings-')), 'station-ratings.json');
process.env.KJ_RATINGS_FILE = STORE;

let ADMIN = null;                       // what requireAdmin() answers
const stubs = {
    // The real one returns a Response; the tests want the parts.
    json: (data, status = 200, headers = {}) => ({ status, body: data, headers }),
    readJson: async (request) => request.body || {},
    NO_STORE: { 'Cache-Control': 'no-store' },
    requireAdmin: async () => ADMIN,
};

const route = (function load() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'radio', 'ratings', 'route.js'), 'utf8')
        .replace(/^import[\s\S]*?from\s+'[^']+';$/gm, '')     // the four imports
        .replace(/^export const /gm, 'const ')                 // runtime / dynamic
        .replace(/^export async function/gm, 'async function')
        + '\nmodule.exports = { GET, POST };';
    const mod = { exports: {} };
    new Function('module', 'exports', 'process', 'path', 'fsp',
                 'json', 'readJson', 'NO_STORE', 'requireAdmin', src)(
        mod, mod.exports, process, path, fs.promises,
        stubs.json, stubs.readJson, stubs.NO_STORE, stubs.requireAdmin);
    return mod.exports;
})();

// A request the handlers can read: headers.get() and a parsed body.
const req = (body, auth) => ({
    headers: { get: (k) => (k.toLowerCase() === 'authorization' && auth ? 'Bearer ' + auth : null) },
    body,
});
const store = () => JSON.parse(fs.readFileSync(STORE, 'utf8'));
const STATION = 'HM308.70-EN';
const SONG = '1L3NPBHU0C4A';
const OTHER = 'JD3UAA7VTNX1';

(async function run() {

    console.log('\nAn empty store is a store where nothing is promoted');
    {
        const r = await route.GET(req());
        ok('GET answers 200 with no file on disk', r.status === 200, 'got ' + r.status);
        ok('no stations yet', JSON.stringify(r.body.stations) === '{}');
        ok('an anonymous reader is not told they may rate', r.body.admin === false);
        ok('reading did not create the file', !fs.existsSync(STORE));
    }

    console.log('\nThe gate is the route');
    {
        ADMIN = null;
        const r = await route.POST(req({ station: STATION, ratings: { [SONG]: 'A' } }, 'a-token'));
        ok('a non-admin POST is refused', r.status === 403, 'got ' + r.status);
        ok('and the refusal says only "Forbidden"', r.body.error === 'Forbidden');
        ok('and wrote nothing', !fs.existsSync(STORE));
    }

    ADMIN = { id: 7, email: 'ops@kjubilee.com', name: 'Ops' };

    console.log('\nA promotion is recorded with the name of whoever made it');
    {
        const r = await route.POST(req({ station: STATION, ratings: { [SONG]: 'A' } }));
        ok('POST accepted', r.status === 200, 'got ' + r.status + ' ' + JSON.stringify(r.body));
        ok('one promotion reported', r.body.promoted === 1);
        const d = store();
        ok('the song is stored under its station', d.stations[STATION][SONG].r === 'A');
        ok('with the admin who promoted it', d.stations[STATION][SONG].by === 'ops@kjubilee.com');
        ok('and when', typeof d.stations[STATION][SONG].at === 'string');
        ok('the file records when it last changed', typeof d.updated_at === 'string');
    }

    console.log('\nC is the default, so C is not stored');
    {
        await route.POST(req({ station: STATION, ratings: { [OTHER]: 'B' } }));
        ok('a second song joins the same station', Object.keys(store().stations[STATION]).length === 2);

        const r = await route.POST(req({ station: STATION, ratings: { [SONG]: 'C' } }));
        ok('demoting to C reports a clear, not a promotion',
            r.body.cleared === 1 && r.body.promoted === 0, JSON.stringify(r.body));
        ok('and the entry is gone rather than set to "C"',
            store().stations[STATION][SONG] === undefined);

        // The state a song is in after being demoted must be the state it was
        // in before anyone touched it. Anything else and "never rated" and
        // "considered and rejected" read differently to the page.
        const g = await route.GET(req());
        ok('a demoted song reads back exactly like an untouched one',
            (g.body.stations[STATION] || {})[SONG] === undefined);
    }

    console.log('\nA station with nothing promoted leaves no trace');
    {
        await route.POST(req({ station: STATION, ratings: { [OTHER]: 'C' } }));
        ok('the last clear removes the station key entirely',
            store().stations[STATION] === undefined, JSON.stringify(store().stations));
        // An empty object per station would accumulate one key for every
        // frequency anybody ever opened and rated-then-unrated, which is a file
        // that grows without ever holding a decision.
        ok('and does not leave an empty object behind',
            JSON.stringify(store().stations) === '{}');
    }

    console.log('\nWhat the handler refuses');
    {
        const bad = [
            ['a station id that is not a tenant id', { station: 'jubilee-radio', ratings: { [SONG]: 'A' } }],
            ['a path traversal in the station id', { station: '../../etc', ratings: { [SONG]: 'A' } }],
            ['a rating that is not A, B or C', { station: STATION, ratings: { [SONG]: 'S' } }],
            ['a SongID with punctuation in it', { station: STATION, ratings: { 'a/../b': 'A' } }],
            ['no ratings at all', { station: STATION }],
            ['an empty ratings object', { station: STATION, ratings: {} }],
        ];
        for (const [name, body] of bad) {
            const r = await route.POST(req(body));
            ok(name + ' is a 400', r.status === 400, 'got ' + r.status);
        }
        // One bad entry rejects the whole request rather than saving the good
        // half: a partial save is the outcome nobody can reason about later.
        const r = await route.POST(req({ station: STATION, ratings: { [SONG]: 'A', 'bad id': 'B' } }));
        ok('one invalid entry rejects the whole batch', r.status === 400);
        ok('and none of the batch was written', store().stations[STATION] === undefined);
    }

    console.log('\nTwo admins rating at the same moment');
    {
        // Read-modify-write over one file. Without the queue the second read
        // starts before the first write lands and one promotion is lost — which
        // would be silent, and is exactly the bug the chain in the route exists
        // to prevent.
        const songs = ['AAAAAAAAAAAA', 'BBBBBBBBBBBB', 'CCCCCCCCCCCC', 'DDDDDDDDDDDD', 'EEEEEEEEEEEE'];
        await Promise.all(songs.map((s) => route.POST(req({ station: STATION, ratings: { [s]: 'A' } }))));
        ok('every concurrent promotion survives',
            Object.keys(store().stations[STATION]).length === songs.length,
            'kept ' + Object.keys(store().stations[STATION] || {}).length + ' of ' + songs.length);
    }

    console.log('\nSeveral songs in one write');
    {
        const r = await route.POST(req({
            station: STATION,
            ratings: { 'FFFFFFFFFFFF': 'B', 'GGGGGGGGGGGG': 'B', 'AAAAAAAAAAAA': 'C' },
        }));
        ok('a rack of changes is one request', r.body.promoted === 2 && r.body.cleared === 1,
            JSON.stringify(r.body));
    }

    console.log('\nWho may rate is answered by the route, not guessed by the page');
    {
        const anon = await route.GET(req());
        ok('no token sent: admin false', anon.body.admin === false);
        const signed = await route.GET(req(null, 'a-token'));
        ok('an admin token: admin true', signed.body.admin === true);
        ADMIN = null;
        const plain = await route.GET(req(null, 'a-token'));
        ok('a signed-in non-admin: admin false', plain.body.admin === false);
        ok('but they can still read the ratings',
            Object.keys(plain.body.stations[STATION] || {}).length > 0);
    }

    console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
    try { fs.rmSync(path.dirname(STORE), { recursive: true, force: true }); } catch (e) { /* temp dir */ }
    process.exit(fail ? 1 : 0);
})();
