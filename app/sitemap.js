import { SECTIONS, readCatalogue, isOnAir } from './_catalogue';

/*
 * /sitemap.xml — the crawler's copy of the same list /sitemap shows a person.
 *
 * Next's metadata file convention: app/sitemap.js exporting a default function
 * becomes /sitemap.xml (node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/01-metadata/sitemap.md). It sits alongside
 * app/sitemap/page.js, which is the human page at /sitemap; the two are
 * different routes and both are generated from stations-data.js so they cannot
 * disagree.
 *
 * ONLY STATIONS THAT ARE ON AIR ARE SUBMITTED. A planned frequency is a real
 * address with nothing playing on it, and asking a search engine to index a
 * hundred of those is asking it to fill the index with empty pages under our
 * name. They stay listed for people on /sitemap, where the word "planned" is
 * right there next to them.
 */
const BASE = 'https://www.kjubilee.com';

export default function sitemap() {
    const { stations } = readCatalogue();
    const now = new Date();

    const pages = SECTIONS.map((s) => ({
        url: BASE + (s.href === '/' ? '' : s.href),
        lastModified: now,
        changeFrequency: s.href === '/' ? 'daily' : 'weekly',
        priority: s.href === '/' ? 1 : 0.8,
    }));

    pages.push({
        url: BASE + '/sitemap',
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.3,
    });

    // The legal pages. Low priority — nobody arrives at a site looking for its
    // terms — but they must be indexable: a consent link that search engines
    // cannot see is one a person cannot find again after they have agreed.
    for (const href of ['/terms', '/privacy']) {
        pages.push({
            url: BASE + href,
            lastModified: now,
            changeFrequency: 'yearly',
            priority: 0.2,
        });
    }

    const live = stations.filter(isOnAir).map((s) => ({
        url: BASE + '/radio?station=' + encodeURIComponent(s.slug),
        lastModified: now,
        changeFrequency: 'daily',   // the schedule genuinely turns over every day
        priority: 0.6,
    }));

    return pages.concat(live);
}
