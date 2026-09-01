/*
 * THE DIAL, READ ON THE SERVER.
 *
 * public/js/stations-data.js is a generated browser script — one
 * `window.X = <json>;` per line — written by tools/build-home-data.js on every
 * publish. The JSON is sliced off the assignment rather than eval'd, which is
 * the same choice tools/build-analytics-index.js makes and for the same reason:
 * nothing here should be in the business of executing generated code.
 *
 * Because it reads the file this build shipped, anything derived from it is
 * correct as of the last publish and cannot drift the way a hand-kept list of
 * frequencies would.
 */
import fs from 'node:fs';
import path from 'node:path';

/* The five-fold blocks and their ranges, as the band plan states them
   (setup/hm-bands.md, and the table behind /api/admin/band-plan). */
export const BLOCKS = [
    { name: 'The Crossing', office: 'Evangelist', low: 300, high: 319.99 },
    { name: 'The Nations', office: 'Apostle', low: 320, high: 339.99 },
    { name: 'The Upper Room', office: 'Prophet', low: 340, high: 359.99 },
    { name: 'The Living Room', office: 'Shepherd', low: 360, high: 379.99 },
    { name: 'The Table', office: 'Teacher', low: 380, high: 399.99 },
];

function readAssigned(src, name) {
    const anchor = src.indexOf('window.' + name + ' = ');
    if (anchor < 0) return null;
    const start = src.indexOf(name === 'KJ_TOTALS' ? '{' : '[', anchor);
    if (start < 0) return null;
    const end = src.indexOf('\n', start);
    try { return JSON.parse(src.slice(start, end === -1 ? undefined : end).replace(/;\s*$/, '')); }
    catch (e) { return null; }
}

let cache = null;

export function readCatalogue() {
    if (cache) return cache;
    let src = '';
    try {
        src = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'stations-data.js'), 'utf8');
    } catch (e) {
        // A sitemap that cannot read the dial still lists the fixed pages rather
        // than failing the route outright.
        cache = { stations: [], totals: null };
        return cache;
    }
    const stations = readAssigned(src, 'KJ_STATIONS') || [];
    const totals = readAssigned(src, 'KJ_TOTALS');
    cache = { stations, totals };
    return cache;
}

/** On air means the same thing here as on the dial: a built catalogue behind it. */
export function isOnAir(s) {
    return !!(s && s.prototype && (s.tenant || s.manifest || s.stream));
}

/** The dial grouped into its five blocks, each sorted by frequency. */
export function stationsByBlock() {
    const { stations } = readCatalogue();
    return BLOCKS.map((b) => ({
        ...b,
        stations: stations
            .filter((s) => {
                const hm = parseFloat(s.hm);
                return hm >= b.low && hm <= b.high;
            })
            .sort((a, z) => parseFloat(a.hm) - parseFloat(z.hm)),
    }));
}

/* The pages that are not stations. Kept here so /sitemap and /sitemap.xml
   cannot disagree about what the site contains. */
export const SECTIONS = [
    { href: '/', label: 'Home', note: 'What the dial is emphasising right now' },
    { href: '/radio', label: 'Jubilee Radio', note: 'The full radio player' },
    { href: '/player', label: 'The Dial', note: 'Tune the band frequency by frequency' },
    { href: '/stations', label: 'HM Radio Stations', note: 'Every frequency on the band' },
    { href: '/music', label: 'Music', note: 'The browsable catalogue of what exists' },
    { href: '/map', label: 'Broadcast Map', note: 'Where the band transmits from' },
    { href: '/signin', label: 'Sign in', note: null },
    { href: '/signup', label: 'Create an account', note: null },
];
