'use strict';
/**
 * tenants.js — the tenant registry.
 *
 * A TENANT is one radio channel: its identity, the slice of the catalogue it
 * plays, and where its daily programming is published. One file per tenant under
 * /tenants, named for its id:
 *
 *     tenants/HM326.20-RO.json
 *     tenants/HM308.70-EN.json
 *
 * WHY A FOLDER OF FILES rather than the object literal this replaced. The
 * station table lived inside build-station-manifest.js, which meant every tool
 * that needed to know what a channel *is* had to require the manifest builder
 * and inherit its assumptions. It also meant adding a channel was a code change
 * to a tool whose job is something else. A tenant is data; it now looks like
 * data, and anything that can read JSON can read the roster.
 *
 * ── the delivery contract ───────────────────────────────────────────────────
 * Each tenant publishes one file per day carrying that day's minute-by-minute
 * programming:
 *
 *     https://cdn.kjubilee.com/radio/HM326.20-RO/delivery/HM326.20RO-20260821.json
 *                                    └── id ──┘             └id─┘ └date┘
 *
 * The directory keeps the hyphen, the filename drops it. That is not a slip: the
 * directory is addressed by tenant id and the filename has to be unique and
 * sortable on its own once downloaded, where `HM326.20RO-20260821.json` reads as
 * one token and `HM326.20-RO-20260821.json` reads as three.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TENANT_DIR = process.env.KJ_TENANT_DIR || path.join(ROOT, 'tenants');
const CDN_BASE = process.env.KJ_CDN_URL || 'https://cdn.kjubilee.com';

const SCHEMA = 'kj.tenant/1';

/** YYYYMMDD from a YYYY-MM-DD date. */
function compactDate(dateISO) {
    return String(dateISO).slice(0, 10).replace(/-/g, '');
}

/**
 * The object key for one tenant's programming on a given day.
 *
 *   deliveryKey('HM326.20-RO', '2026-08-21')
 *     -> 'radio/HM326.20-RO/delivery/HM326.20RO-20260821.json'
 *
 * Kept in ONE place because it is the contract between three things that never
 * see each other: the generator that writes the file, the uploader that names
 * the object, and the browser that asks for it. Two of the three getting it
 * right is a station that plays silence.
 */
function deliveryKey(tenantId, dateISO) {
    const flat = String(tenantId).replace(/-/g, '');
    return 'radio/' + tenantId + '/delivery/' + flat + '-' + compactDate(dateISO) + '.json';
}

/** The public URL a player fetches. */
function deliveryUrl(tenantId, dateISO, base) {
    return (base || CDN_BASE) + '/' + deliveryKey(tenantId, dateISO);
}

function tenantFile(tenantId) {
    return path.join(TENANT_DIR, tenantId + '.json');
}

/** One tenant, or null when there is no such file. */
function load(tenantId) {
    const file = tenantFile(tenantId);
    if (!fs.existsSync(file)) return null;
    const t = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (t.schema !== SCHEMA) {
        throw new Error(file + ': expected schema ' + SCHEMA + ', found ' + t.schema);
    }
    if (t.id !== tenantId) {
        // The filename is how the roster is indexed, so a disagreement here
        // means one of them is a typo and every later lookup silently misses.
        throw new Error(file + ': id "' + t.id + '" does not match its filename');
    }
    return t;
}

/** Every tenant, id-sorted. */
function all() {
    if (!fs.existsSync(TENANT_DIR)) return [];
    return fs.readdirSync(TENANT_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.slice(0, -'.json'.length))
        .sort()
        .map(load)
        .filter(Boolean);
}

function ids() {
    return all().map(t => t.id);
}

/**
 * A tenant in the shape build-station-manifest.js's STATIONS table used, so the
 * catalogue selection code keeps working unchanged while its input moves to
 * /tenants. Deleted once nothing reads STATIONS any more.
 */
function asStation(t) {
    return {
        slug: t.slug,
        name: t.name,
        hm: t.hm,
        mount: t.mount,
        language: t.language && t.language.code ? t.language.code : null,
        languageName: t.language ? t.language.name : null,
        languageTag: t.language ? t.language.tag : null,
        mode: t.mode,
        hostCity: t.origin ? t.origin.city : null,
        timezone: t.origin ? t.origin.timezone : null,
        pool: t.catalogue ? t.catalogue.pool : null,
        select: t.catalogue && t.catalogue.select ? t.catalogue.select : undefined,
    };
}

module.exports = {
    SCHEMA, TENANT_DIR, CDN_BASE,
    compactDate, deliveryKey, deliveryUrl, tenantFile,
    load, all, ids, asStation,
};
