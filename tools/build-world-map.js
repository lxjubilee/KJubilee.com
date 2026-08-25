'use strict';
/**
 * build-world-map.js — turn Natural Earth country boundaries into something the
 * browser can draw without a mapping library.
 *
 * WHY THIS EXISTS AS A BUILD STEP.
 *
 * The map on the old radio page was a 1.9 MB SVG *image*: a picture of a world
 * map, with no idea which shape is which country. Nothing could be highlighted,
 * hit-tested or coloured, and every visitor downloaded the whole thing.
 *
 * The source here is TopoJSON, which is compact precisely because it stores
 * shared borders once as "arcs" and quantises coordinates to integers. That
 * encoding is excellent on the wire and useless to a renderer, so a library is
 * normally needed to undo it in the browser. Doing it HERE instead means the
 * page ships plain rings of numbers and needs no library at all — the whole
 * client side is a projection and a path builder.
 *
 * TWO DETAIL LEVELS, because they are for different moments:
 *
 *   world-110m.json    66 KB gz   177 countries    drawn immediately
 *   world-50m.json    545 KB gz   241 countries    swapped in once it lands
 *
 * The page paints the coarse one so there is a map on screen at once, then
 * upgrades. Shipping only the fine one leaves the panel empty for half a second
 * on a good connection and much longer on a phone.
 *
 * Also emits station-map.json: where each multi-language station's dot goes.
 * The country for each station is curated (below); the COORDINATES are computed
 * from the boundary data, so a dot cannot drift away from the shape it belongs
 * to the way hand-typed percentages did.
 *
 *   node tools/build-world-map.js
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'public', 'data');

// Natural Earth, via the world-atlas package. PUBLIC DOMAIN — Natural Earth
// places no restrictions on use, which is why it is the right source to vendor
// into a site rather than fetch from someone else's CDN at runtime.
const SOURCES = {
    '110m': 'https://unpkg.com/world-atlas@2.0.2/countries-110m.json',
    '50m': 'https://unpkg.com/world-atlas@2.0.2/countries-50m.json',
};

// Which country each multi-language station is pinned to. Curated, because it
// is an editorial choice rather than a fact: the Spanish prayer line is pinned
// to Spain and the Spanish music station to Mexico so the two do not sit on top
// of each other, and the French prayer line sits on Belgium for the same reason.
const STATION_COUNTRY = {
    'familia-inspire-espanol': 'Mexico',
    'jubilee-prayers-spanish': 'Spain',
    'brasil-inspire-portugues': 'Brazil',
    'asia-inspire-zhongwen': 'China',
    'jubilee-prayers-mandarin': 'Taiwan',
    'inspire-india-hindi': 'India',
    'jubilee-prayers-hindi': 'Nepal',
    'inspire-crown-arabic': 'Saudi Arabia',
    'jubilee-prayers-arabic': 'Egypt',
    'france-inspire-francais': 'France',
    'jubilee-praise-romana': 'Romania',
    'jubilee-prayers-portuguese': 'Portugal',
    'korea-inspire-hangugeo': 'South Korea',
    'deutschland-inspire-deutsch': 'Germany',
    'jubilee-prayers-french': 'Belgium',
    'russia-inspire-russkiy': 'Russia',
    'italia-inspire-italiano': 'Italy',
    'jubilee-prayers-russian': 'Ukraine',
    'pilipinas-inspire-tagalog': 'Philippines',
    'vietnam-inspire-tieng-viet': 'Vietnam',
    'jubilee-prayers-korean': 'North Korea',
    'africa-inspire-kiswahili': 'Kenya',
    'west-africa-inspire-yoruba': 'Nigeria',
    'jubilee-prayers-swahili': 'Tanzania',
    'ethiopia-inspire-amharic': 'Ethiopia',
    'polska-inspire-polski': 'Poland',
    'indonesia-inspire-bahasa': 'Indonesia',
    'japan-inspire-nihongo': 'Japan',
    'jubilee-prayers-tagalog': 'Philippines',
    'bengal-inspire-bangla': 'Bangladesh',
};

// Two stations share the Philippines. Nudged apart in degrees so both dots stay
// clickable instead of one hiding under the other.
const NUDGE = {
    'jubilee-prayers-tagalog': [2.2, -3.0],
};

function get(url) {
    return new Promise((res, rej) => {
        https.get(url, r => {
            if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
                r.resume();
                return res(get(r.headers.location));
            }
            if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode + ' for ' + url)); }
            const c = [];
            r.on('data', d => c.push(d));
            r.on('end', () => res(Buffer.concat(c).toString('utf8')));
        }).on('error', rej);
    });
}

/**
 * Undo TopoJSON's delta encoding for one arc.
 *
 * Points are stored as deltas from the previous point in quantised integer
 * space; transform.scale/translate map that back to lon/lat. This is the whole
 * of what topojson-client would otherwise be imported for.
 */
function decodeArc(arc, transform) {
    const out = [];
    let x = 0, y = 0;
    for (let i = 0; i < arc.length; i++) {
        x += arc[i][0];
        y += arc[i][1];
        out.push([
            x * transform.scale[0] + transform.translate[0],
            y * transform.scale[1] + transform.translate[1],
        ]);
    }
    return out;
}

/** A ring is a list of arc indexes; a negative index means "that arc, reversed". */
function ringFrom(arcIndexes, arcs) {
    const pts = [];
    for (const idx of arcIndexes) {
        const arc = idx < 0 ? arcs[~idx].slice().reverse() : arcs[idx];
        // Consecutive arcs share an endpoint — drop the duplicate.
        for (let i = pts.length ? 1 : 0; i < arc.length; i++) pts.push(arc[i]);
    }
    return pts;
}

/** Signed area of a ring in square degrees; sign tells winding, magnitude size. */
function ringArea(ring) {
    let a = 0;
    for (let i = 0, n = ring.length - 1; i < n; i++) {
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return a / 2;
}

/**
 * Where to put a country's dot.
 *
 * The centroid of the LARGEST ring, not of the whole country. Russia's rings
 * straddle the antimeridian and the United States owns Alaska and Hawaii, so
 * averaging everything lands the dot in the sea. The biggest landmass is what a
 * reader means by "that country" on a world map.
 */
function anchorOf(country) {
    let best = null, bestArea = 0;
    for (const ring of country.rings) {
        const a = Math.abs(ringArea(ring));
        if (a > bestArea) { bestArea = a; best = ring; }
    }
    if (!best) return null;

    // THE ANTIMERIDIAN. Russia's mainland runs from about 19°E east to 180 and
    // straight on past it, where longitude flips to -180. Averaging those two
    // ends puts the centroid near 0°, which is Africa — or, with the winding
    // this data uses, out at 193°E in the Bering Sea. Neither is Russia.
    //
    // Unwrapping first fixes it: if a ring spans more than half the globe it
    // must be crossing, so the negative half is lifted into a continuous
    // 180..360 range, the centroid is taken there, and the result is folded
    // back. Rings that do not cross are untouched.
    let lo = 180, hi = -180;
    for (const p of best) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0]; }
    const crosses = (hi - lo) > 180;
    const unwrap = x => (crosses && x < 0 ? x + 360 : x);

    let cx = 0, cy = 0, a2 = 0;
    for (let i = 0, n = best.length - 1; i < n; i++) {
        const x0 = unwrap(best[i][0]), x1 = unwrap(best[i + 1][0]);
        const f = x0 * best[i + 1][1] - x1 * best[i][1];
        a2 += f;
        cx += (x0 + x1) * f;
        cy += (best[i][1] + best[i + 1][1]) * f;
    }
    if (!a2) return null;

    let lon = cx / (3 * a2);
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return [lon, cy / (3 * a2)];
}

function buildDetail(detail) {
    return get(SOURCES[detail]).then(text => {
        const topo = JSON.parse(text);
        const obj = topo.objects.countries;
        if (!obj) throw new Error('no "countries" object in the topology');
        const arcs = topo.arcs.map(a => decodeArc(a, topo.transform));

        // Rounded to 3 decimals — about 100 m at the equator, far finer than a
        // pixel on a world map, and it drops the long decimal tails that make
        // the file large for no visible gain.
        const round = n => Math.round(n * 1000) / 1000;

        const countries = [];
        let rings = 0, points = 0;
        for (const geom of obj.geometries) {
            const polys = geom.type === 'Polygon' ? [geom.arcs]
                        : geom.type === 'MultiPolygon' ? geom.arcs
                        : null;
            if (!polys) continue;
            const out = [];
            for (const poly of polys) {
                for (const r of poly) {
                    const ring = ringFrom(r, arcs).map(p => [round(p[0]), round(p[1])]);
                    if (ring.length < 4) continue;    // no area worth drawing
                    out.push(ring);
                    rings++;
                    points += ring.length;
                }
            }
            if (!out.length) continue;
            countries.push({
                id: String(geom.id == null ? '' : geom.id),
                name: (geom.properties && geom.properties.name) || '',
                rings: out,
            });
        }
        countries.sort((a, b) => a.name.localeCompare(b.name));

        const file = path.join(DATA, 'world-' + detail + '.json');
        fs.mkdirSync(DATA, { recursive: true });
        fs.writeFileSync(file, JSON.stringify({
            schema: 'kj.worldmap/1',
            source: 'Natural Earth ' + detail + ' via world-atlas — public domain',
            detail: detail,
            countries: countries,
        }));
        console.log('  ' + detail.padEnd(5) + ' ' + String(countries.length).padStart(4) + ' countries  ' +
                    String(rings).padStart(5) + ' rings  ' + String(points).padStart(7) + ' points  ' +
                    (fs.statSync(file).size / 1024).toFixed(0).padStart(5) + ' KB');
        return countries;
    });
}

/** The site catalogue, for checking every pinned station still exists. */
function catalogue() {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'stations-data.js'), 'utf8'), sandbox);
    const out = {};
    (sandbox.window.KJ_STATIONS || []).forEach(s => { out[s.slug] = s; });
    return out;
}

function main() {
    console.log('building world boundaries');
    return buildDetail('110m')
        .then(() => buildDetail('50m'))
        .then(fine => {
            const byName = {};
            fine.forEach(c => { byName[c.name] = c; });

            const stations = catalogue();
            const dots = [];
            const problems = [];

            Object.keys(STATION_COUNTRY).forEach(slug => {
                const name = STATION_COUNTRY[slug];
                const country = byName[name];
                if (!country) { problems.push(slug + ': no country named "' + name + '" in the boundary data'); return; }
                if (!stations[slug]) { problems.push(slug + ': pinned to ' + name + ' but not in the catalogue'); return; }
                const at = anchorOf(country);
                if (!at) { problems.push(slug + ': could not place ' + name); return; }
                // The anchor must land inside the country it belongs to. This is
                // the check that would have caught Russia sitting in the Bering
                // Sea, and it costs nothing to keep.
                let lo = 180, hi = -180, top = 90, bot = -90;
                country.rings.forEach(r => r.forEach(p => {
                    if (p[0] < lo) lo = p[0];
                    if (p[0] > hi) hi = p[0];
                    if (p[1] < top) top = p[1];
                    if (p[1] > bot) bot = p[1];
                }));
                if (at[0] < lo - 1 || at[0] > hi + 1 || at[1] < top - 1 || at[1] > bot + 1) {
                    problems.push(slug + ': anchor ' + at.map(v => v.toFixed(1)).join(',') +
                        ' falls outside ' + name + ' (lon ' + lo.toFixed(0) + '..' + hi.toFixed(0) +
                        ', lat ' + top.toFixed(0) + '..' + bot.toFixed(0) + ')');
                    return;
                }

                const nudge = NUDGE[slug] || [0, 0];
                dots.push({
                    slug: slug,
                    country: name,
                    lon: Math.round((at[0] + nudge[0]) * 100) / 100,
                    lat: Math.round((at[1] + nudge[1]) * 100) / 100,
                });
            });

            dots.sort((a, b) => a.country.localeCompare(b.country));
            const file = path.join(DATA, 'station-map.json');
            fs.writeFileSync(file, JSON.stringify({ schema: 'kj.stationmap/1', dots: dots }, null, 1));
            console.log('\nstation dots: ' + dots.length + ' -> ' + path.relative(ROOT, file));

            if (problems.length) {
                console.log('\nPROBLEMS');
                problems.forEach(p => console.log('   ' + p));
                return 1;
            }
            return 0;
        });
}

if (require.main === module) {
    main().then(c => process.exit(c)).catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { anchorOf, ringArea };
