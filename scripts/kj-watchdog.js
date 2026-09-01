#!/usr/bin/env node
/**
 * kj-watchdog.js — no station on the dial goes silent.
 *
 *   node scripts/kj-watchdog.js              # check only, change nothing
 *   node scripts/kj-watchdog.js --repair     # fix what is missing
 *   node scripts/kj-watchdog.js --repair --days 3
 *
 * Exit codes, so a timer or a monitor can act on them:
 *   0  everything covered
 *   1  something was missing and has been repaired
 *   2  something is missing and could NOT be repaired  ← page a human
 *
 * ── WHAT IT WATCHES, AND WHY IT ASKS THE INTERNET RATHER THAN THE DISK ──────
 * The dial is whatever www.kjubilee.com is serving, so that is what this reads:
 * stations-data.js over HTTP, the same file a listener's browser gets. Every
 * station marked on-air there must have a day file on the CDN for today and the
 * next N days, because a day file that 404s is a station that will not play.
 *
 * ASKING THE LIVE SITE IS THE WHOLE POINT. On 2026-08-29 Gospel By Music had
 * never had a single day file published: the scheduler's checkout knew 41
 * stations, the dial had 43, and the nightly cron ran successfully every night
 * over the 41 it could see. Nothing noticed, because everything that could have
 * noticed was reading the same stale list. A watchdog that checked "does every
 * tenant on this disk have files" would have reported all clear.
 *
 * ── HOW IT REPAIRS A STATION IT HAS NEVER HEARD OF ──────────────────────────
 * Publishing a day needs two things: a tenant record and a scheduling pool.
 * Both can now be recovered from one public file. A pool IS the station's
 * manifest — byte for byte, durations and all — and manifests are published to
 * radio/<ID>/delivery/music.json by scripts/r2-publish-manifests.js. So when a
 * station is missing locally this fetches its manifest, writes it as the pool,
 * synthesises the tenant record from the same document, and publishes.
 *
 * That is the difference between a watchdog that reports the outage and one
 * that ends it. Building a pool from scratch still needs the music share; that
 * is why the manifest is fetched rather than rebuilt.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * It never rebuilds pools from audio (it cannot — no music share), never edits
 * the catalogue, and never deletes anything. Its only write actions are: cache
 * a manifest as a pool, write a tenant record it derived from that manifest,
 * and run the ordinary publisher. Anything it cannot fix that way is reported
 * as exit 2 rather than papered over.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function loadEnv(p) {
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
}
loadEnv(path.join(ROOT, '.env'));

const SITE = process.env.KJ_SITE_URL || 'https://www.kjubilee.com';
const CDN = process.env.KJ_CDN_URL || 'https://cdn.kjubilee.com';
const POOL_DIR = path.join(ROOT, 'tmp', 'pools');
const TENANT_DIR = process.env.KJ_TENANT_DIR || path.join(ROOT, 'tenants');
const STATE_DIR = process.env.KJ_WATCHDOG_STATE || '/var/lib/kj-watchdog';

const argv = process.argv.slice(2);
const REPAIR = argv.includes('--repair');
const DAYS = (function () {
    const i = argv.indexOf('--days');
    const n = i >= 0 ? parseInt(argv[i + 1], 10) : NaN;
    /* 2 means today plus the next two dates. At any moment that is at least 48
       hours of programming in front of every listener, in every timezone the
       dial broadcasts into — which is the floor this exists to hold. */
    return Number.isFinite(n) && n >= 1 ? n : 2;
})();

const log = (m) => console.log(new Date().toISOString().replace('T', ' ').slice(0, 19) + '  ' + m);

/* The broadcast day is Pacific — tests/tenant-radio.test.js asserts it, and the
   generator names files by it. Computing it any other way puts this watchdog in
   a different day from the schedule it is checking for part of every night. */
function broadcastDay(offset) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(Date.now() + offset * 86400000));
    const get = (t) => parts.find((p) => p.type === t).value;
    return get('year') + get('month') + get('day');
}

const dayKey = (id, ymd) => 'radio/' + id + '/delivery/' + id.replace(/-/g, '') + '-' + ymd + '.json';

async function head(url) {
    try {
        const r = await fetch(url, { method: 'HEAD' });
        return r.status;
    } catch (e) { return 0; }
}

/* The dial, as served. Sliced off the assignment rather than eval'd — the same
   choice tools/build-analytics-index.js makes about this generated file. */
async function readDial() {
    const r = await fetch(SITE + '/js/stations-data.js', { cache: 'no-store' });
    if (!r.ok) throw new Error('cannot read the dial: ' + SITE + ' returned ' + r.status);
    const src = await r.text();
    const anchor = src.indexOf('window.KJ_STATIONS = ');
    if (anchor < 0) throw new Error('KJ_STATIONS not present in stations-data.js');
    const start = src.indexOf('[', anchor);
    const end = src.indexOf('\n', start);
    const list = JSON.parse(src.slice(start, end === -1 ? undefined : end).replace(/;\s*$/, ''));
    return list.filter((s) => s && s.prototype && s.tenant);
}

/* A tenant record derived from the station's own manifest. Every field below is
   carried by the manifest; nothing here is invented. Written only when the file
   is genuinely absent — an existing tenant is never overwritten, because a
   human may have tuned it and this is a repair, not a sync. */
function tenantFromManifest(m, station) {
    const sel = m.selection || {};
    return {
        schema: 'kj.tenant/1',
        id: m.station_id,
        slug: m.station_slug,
        name: m.station_name,
        hm: m.hm,
        band: (station && station.band) || 'fivefold',
        mount: m.mount,
        /* Uppercase: every hand-written tenant carries "EN", and the manifest
           spells the same value lowercase. A code that disagrees with its
           siblings is the kind of difference that reads as deliberate later. */
        language: {
            code: String(sel.languages && sel.languages[0] ? sel.languages[0] : m.language || '').toUpperCase(),
            name: m.language_name,
            tag: m.language_tag,
        },
        mode: m.mode,
        origin: { city: m.host_city, timezone: m.timezone },
        /* The manifest records the selection it RESOLVED, under different names
           than the tenant uses: artist_pool is the pool, and explicit.artists is
           what `select.artists` asked for. Mapping them keeps a recovered tenant
           scheduling the same catalogue as the original.
           `pending` cannot be recovered — it is editorial, names albums that do
           not exist yet, and nothing in the manifest knows about it. It affects
           only which future album joins automatically, never what plays today. */
        catalogue: {
            pool: sel.artist_pool || 'all',
            select: (sel.explicit && sel.explicit.artists && sel.explicit.artists.length)
                ? { artists: sel.explicit.artists }
                : undefined,
        },
        delivery: {
            base: CDN,
            dir: 'radio/' + m.station_id + '/delivery',
            file: m.station_id.replace(/-/g, '') + '-{YYYYMMDD}.json',
        },
        /* Format is editorial and lives on the dial, not in the manifest — and
           the dial is already in hand, so take it from there rather than
           inventing "Music". */
        format: (station && station.format) || (m.content_type === 'music' ? 'Music' : m.content_type),
        timezone: 'America/Los_Angeles',
        /* A LOUD MARKER, on purpose. This record was reconstructed to keep a
           station on air, not authored. It is faithful enough to schedule from
           and is missing `pending`; the real one should be restored from the
           repo when someone next looks. */
        _recoveredBy: 'kj-watchdog ' + new Date().toISOString().slice(0, 10)
            + ' from ' + CDN + '/radio/' + m.station_id + '/delivery/music.json'
            + ' — PROVISIONAL: restore the authored tenant from the repo when convenient',
    };
}

/* https://cdn.kjubilee.com/music/... -> /cdn/music/...  The same rewrite the
   footer player does with localise(), for the same reason: the path is what is
   canonical and the host is deployment detail. */
function canonicalise(text) {
    return text.split('https://cdn.kjubilee.com/').join('/cdn/')
               .split('https://cdn.jubileeverse.com/').join('/cdn/');
}

async function ensureInputs(id, station) {
    const pool = path.join(POOL_DIR, id + '.music.json');
    const tenant = path.join(TENANT_DIR, id + '.json');
    if (fs.existsSync(pool) && fs.existsSync(tenant)) return { ok: true, recovered: false };

    const url = CDN + '/radio/' + id + '/delivery/music.json';
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
        return { ok: false, why: 'no local pool/tenant and its manifest is not on the CDN (' + r.status + ' ' + url + ')' };
    }
    const text = await r.text();
    let manifest;
    try { manifest = JSON.parse(text); } catch (e) { return { ok: false, why: 'manifest at ' + url + ' is not valid JSON' }; }
    if (!manifest.station_id || !manifest.albums) return { ok: false, why: 'manifest at ' + url + ' is not a station manifest' };

    fs.mkdirSync(POOL_DIR, { recursive: true });
    fs.mkdirSync(TENANT_DIR, { recursive: true });
    if (!fs.existsSync(pool)) {
        /* NORMALISE THE URL LAYOUT BEFORE CACHING IT AS A POOL.
           A pool must address tracks canonically; the publisher refuses an
           absolute URL outright, because a schedule must point at the kJubilee
           copy and never at another project's CDN (MUSIC-REPOSITORY-SPEC §1a).
           Manifests are only as consistent as the flags each was built with —
           the station added on 2026-08-29 carried absolute URLs and defeated
           this repair with "track url is not canonical layout". Rewriting here
           makes the recovery independent of how a manifest was produced. */
        fs.writeFileSync(pool, canonicalise(text), 'utf8');
        log('    recovered pool   ' + path.relative(ROOT, pool));
    }
    if (!fs.existsSync(tenant)) {
        fs.writeFileSync(tenant, JSON.stringify(tenantFromManifest(manifest, station), null, 2) + '\n', 'utf8');
        log('    recovered tenant ' + path.relative(ROOT, tenant));
    }
    return { ok: true, recovered: true };
}

function publish(id, days) {
    execFileSync(process.execPath,
        [path.join(ROOT, 'scripts', 'r2-publish-schedules.js'), '--station', id, '--apply', '--days', String(days)],
        { cwd: ROOT, stdio: 'pipe', timeout: 10 * 60 * 1000 });
}

function writeHeartbeat(state) {
    try {
        fs.mkdirSync(STATE_DIR, { recursive: true });
        fs.writeFileSync(path.join(STATE_DIR, 'heartbeat.json'), JSON.stringify(state, null, 2) + '\n', 'utf8');
    } catch (e) {
        log('WARN could not write heartbeat to ' + STATE_DIR + ': ' + e.message);
    }
}

(async () => {
    const started = new Date().toISOString();
    const days = Array.from({ length: DAYS + 1 }, (_, i) => broadcastDay(i));
    log('kj-watchdog  site=' + SITE + '  days=' + days.join(',') + '  mode=' + (REPAIR ? 'repair' : 'check'));

    let dial;
    try { dial = await readDial(); }
    catch (e) {
        log('FATAL ' + e.message);
        writeHeartbeat({ started, finished: new Date().toISOString(), ok: false, fatal: e.message });
        process.exit(2);
    }
    log('dial reports ' + dial.length + ' station(s) on air');

    // ---- check ------------------------------------------------------------
    const missing = new Map();          // tenant id -> [ymd, ...]
    for (const s of dial) {
        for (const ymd of days) {
            const code = await head(CDN + '/' + dayKey(s.tenant, ymd));
            if (code !== 200) {
                if (!missing.has(s.tenant)) missing.set(s.tenant, []);
                missing.get(s.tenant).push(ymd);
            }
        }
    }

    const state = {
        started, site: SITE, daysRequired: DAYS + 1, stationsChecked: dial.length,
        missingBefore: Object.fromEntries(missing),
        repaired: [], unrepairable: [],
    };

    if (!missing.size) {
        log('OK  every station has ' + (DAYS + 1) + ' day(s) of programming published');
        state.finished = new Date().toISOString(); state.ok = true;
        writeHeartbeat(state);
        process.exit(0);
    }

    log('MISSING  ' + missing.size + ' station(s):');
    for (const [id, ds] of missing) {
        const st = dial.find((x) => x.tenant === id);
        log('   ' + id.padEnd(14) + (st ? st.name : '') + '   no day file for ' + ds.join(', '));
    }

    if (!REPAIR) {
        log('check-only — re-run with --repair to fix');
        state.finished = new Date().toISOString(); state.ok = false;
        writeHeartbeat(state);
        process.exit(2);
    }

    // ---- repair -----------------------------------------------------------
    for (const [id] of missing) {
        log('repairing ' + id);
        try {
            const inputs = await ensureInputs(id, dial.find((x) => x.tenant === id));
            if (!inputs.ok) { log('    CANNOT REPAIR: ' + inputs.why); state.unrepairable.push({ id, why: inputs.why }); continue; }
            publish(id, DAYS + 1);
            state.repaired.push({ id, recoveredInputs: inputs.recovered });
            log('    published ' + (DAYS + 1) + ' day(s)');
        } catch (e) {
            /* The publisher reports its failures on STDOUT, not stderr, so
               reading stderr alone printed a bare "unknown" and hid the actual
               cause — which was a real diagnosis lost. Read both. */
            const out = [e && e.stdout, e && e.stderr, e && e.message]
                .map((x) => (x == null ? '' : String(x))).filter(Boolean).join(' ');
            const why = out.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' ') || 'unknown';
            log('    CANNOT REPAIR: ' + why);
            state.unrepairable.push({ id, why });
        }
    }

    // ---- verify the repair actually landed ---------------------------------
    const stillMissing = [];
    for (const [id] of missing) {
        for (const ymd of days) {
            const code = await head(CDN + '/' + dayKey(id, ymd));
            if (code !== 200) stillMissing.push(id + ' ' + ymd + ' (' + code + ')');
        }
    }
    state.stillMissing = stillMissing;
    state.finished = new Date().toISOString();
    state.ok = stillMissing.length === 0;
    writeHeartbeat(state);

    if (stillMissing.length) {
        log('STILL MISSING after repair: ' + stillMissing.join(', '));
        process.exit(2);
    }
    log('REPAIRED  ' + state.repaired.length + ' station(s); every station now has ' + (DAYS + 1) + ' day(s) published');
    process.exit(1);
})().catch((e) => {
    log('FATAL ' + (e && e.stack || e));
    writeHeartbeat({ finished: new Date().toISOString(), ok: false, fatal: String(e && e.message || e) });
    process.exit(2);
});
