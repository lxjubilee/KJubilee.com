/*
 * /todo/ — the way in to every recording queue.
 *
 * Each card names a project and counts what it still needs. The counts are read
 * from the SAME published files the console pages read, never typed into the
 * card, so the index cannot claim a number the page behind it disagrees with.
 *
 * ── WHAT REFRESH CAN AND CANNOT DO ──────────────────────────────────────────
 *
 * It re-reads the published queues, so anything a rebuild has deployed since
 * this page opened appears without a reload: new albums, changed counts, tracks
 * that have since been ingested.
 *
 * It cannot see the J: drive. Nothing in a browser can. Lyrics written five
 * minutes ago are found by tools/build-todo-index.js walking the authoring
 * trees on a machine that can see the share, and by
 * tools/build-persheet-index.js for the two properties filed one sheet per
 * track. Until one of those has run AND been deployed, there is nothing here to
 * fetch — which is why every card carries the date its queue was built rather
 * than a claim to be up to date.
 */
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var num = function (n) { return (n == null ? 0 : n).toLocaleString(); };

    var NETWORK = '/data/todo-index.json';
    var cards = [].slice.call(document.querySelectorAll('.card[data-key]'));

    /* Every distinct file the cards need, fetched once each however many cards
       read it — twelve persona cards all read the network index. */
    function sources() {
        var set = {};
        cards.forEach(function (c) {
            var k = c.getAttribute('data-key') || '';
            set[k.indexOf('index:') === 0 ? k.slice(6) : NETWORK] = true;
        });
        return Object.keys(set);
    }

    function fetchJSON(url) {
        return fetch(url, { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function countFor(card, byUrl) {
        var key = card.getAttribute('data-key') || '';
        var kind = key.split(':')[0];
        var val = key.slice(kind.length + 1);

        if (kind === 'index') {
            var own = byUrl[val];
            if (!own) return null;
            return {
                needs: own.network.needs,
                albums: own.network.albums,
                recorded: own.network.recorded,
                ingested: own.network.ingested,
                built: own.generated_at
            };
        }

        var j = byUrl[NETWORK];
        if (!j) return null;

        if (kind === 'artist') {
            var mine = Object.keys(j.albums).filter(function (c) {
                return j.albums[c].artist === val;
            });
            var sum = function (f) {
                return mine.reduce(function (n, c) { return n + (j.albums[c][f] || 0); }, 0);
            };
            return { needs: sum('needs'), albums: mine.length, recorded: sum('recorded'),
                     ingested: sum('ingested'), built: j.generated_at };
        }

        var st = (j.stations || []).filter(function (s) { return s.id === val; })[0];
        if (!st) return null;
        return {
            needs: st.counts.needs, albums: st.counts.albums,
            recorded: st.counts.recorded, ingested: st.counts.ingested,
            built: j.generated_at
        };
    }

    function paint(byUrl) {
        var built = null, live = 0, totalNeeds = 0;
        cards.forEach(function (card) {
            var c = countFor(card, byUrl);
            var el = card.querySelector('[data-count]');
            if (!c) {
                if (el) el.textContent = 'no queue';
                var d0 = card.querySelector('[data-done]');
                if (d0) d0.textContent = '';
                card.classList.add('is-missing');
                return;
            }
            card.classList.remove('is-missing');
            live++;
            totalNeeds += c.needs;
            if (!built || c.built > built) built = c.built;
            /* The number that matters is what is STILL TO DO. "Awaiting ingest"
               is shown beside it only when there is some, because a zero there
               is the normal state and a row of zeroes reads as broken.

               AT ZERO THE SENTENCE CHANGES, because "0 need an mp3" makes a
               reader do arithmetic to learn the one thing they wanted to know.
               There are two ways to be at zero and they are not the same
               claim:

                 needs 0, awaiting 0   every written song is recorded, ingested
                                       and on the CDN. Finished. Say so.
                 needs 0, awaiting N   every song is RECORDED, and N of them
                                       are sitting on the J: drive with no
                                       SongID — so they are on nobody's CDN and
                                       no listener can hear them. That is not
                                       finished, and calling it finished is how
                                       a record never gets ingested: the
                                       console said it was done. */
            /* HOW MANY ARE DONE, on the cover beside the frequency. Done means
               ON THE LEDGER: the track has a SongID, so its mp3 is published to
               the CDN and a listener can hear it. That is a deliberately
               narrower claim than "an mp3 exists" — a recording sitting in an
               authoring folder with no SongID is on nobody's CDN, and it is
               counted as awaiting ingest below, not as done here.

               The white number is the point; the word beside it is a label and
               reads quieter. Nothing is printed when the queue does not report
               a figure, rather than a 0 that would look like a real answer. */
            var dn = card.querySelector('[data-done]');
            if (dn) {
                dn.innerHTML = (c.ingested == null) ? ''
                    : '<span class="cd-n">' + num(c.ingested) + '</span> done';
            }

            var sub = num(c.albums) + ' album' + (c.albums === 1 ? '' : 's');
            if (el) {
                if (c.needs === 0 && !c.recorded) {
                    el.innerHTML = '<b>Project complete</b>'
                        + '<span class="tx-sub">' + sub + ' · every song recorded</span>';
                } else if (c.needs === 0) {
                    el.innerHTML = '<b>All ' + num(c.albums) + ' albums recorded</b>'
                        + '<span class="tx-sub">' + num(c.recorded) + ' awaiting ingest</span>';
                } else {
                    el.innerHTML = '<b>' + num(c.needs) + '</b> need an mp3'
                        + '<span class="tx-sub">' + sub
                        + (c.recorded ? ' · ' + num(c.recorded) + ' awaiting ingest' : '')
                        + '</span>';
                }
            }
            /* is-done paints the number green, and only the FIRST of those two
               zero states has earned it. */
            card.classList.toggle('is-done', c.needs === 0 && !c.recorded);
        });

        var meta = $('tx-meta');
        if (meta) {
            meta.innerHTML = '<span class="is-warn">' + num(totalNeeds) + '</span> tracks need an mp3 across '
                + live + ' project' + (live === 1 ? '' : 's')
                + (built ? ' · queues built ' + new Date(built).toLocaleString() : '');
        }
    }

    var busy = false;
    function load(fromButton) {
        if (busy) return;
        busy = true;
        var btn = $('tx-refresh');
        if (btn && fromButton) { btn.disabled = true; btn.textContent = 'Checking…'; }

        var urls = sources();
        Promise.all(urls.map(fetchJSON)).then(function (got) {
            var byUrl = {};
            urls.forEach(function (u, i) { byUrl[u] = got[i]; });
            paint(byUrl);
            busy = false;
            if (btn && fromButton) {
                btn.disabled = false;
                btn.textContent = 'Updated';
                setTimeout(function () { btn.textContent = 'Refresh'; }, 4000);
            }
        }).catch(function () {
            busy = false;
            if (btn && fromButton) { btn.disabled = false; btn.textContent = 'Refresh failed'; }
        });
    }

    var rb = $('tx-refresh');
    if (rb) rb.addEventListener('click', function () { load(true); });
    load(false);
})();
