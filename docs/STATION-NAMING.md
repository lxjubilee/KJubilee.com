# Station naming — one source, everywhere

A station's name appears on the cards, in the All Stations table, in the hover
preview, on the map roster and on the first line of the player bar. It is also
written into two data files. Before this was settled, two of those were
independent and had already drifted:

| Where | HM 377.70 read |
| ----- | -------------- |
| every page on the site | `Hebraic Celebrations` |
| its tenant record, and every day file it published | `Hebraic Celebrations (Messianic)` |

Nobody noticed, because the surface a listener sees and the surface a generator
writes were never compared. That is the failure this document exists to prevent.

## The rule

**The site catalogue is the only place a station's name is read from.**

Everything else that holds a name holds a *derived copy*: written from the
catalogue, never read back for display.

```
  tools/build-home-data.js          the generator
            │
            ▼
  public/js/stations-data.js        THE CATALOGUE — the single source
            │
            ├──────────────► every page and the player bar   (read for display)
            │
            ├──────────────► tools/sync-tenants.js
            │                       │
            │                       ▼
            │                tenants/<ID>.json               (derived copy)
            │                       │
            │                       ▼
            │                the published day files          (derived copy)
            └──────────────► docs, exports, anything else     (derived copy)
```

## To rename a station

Change it in **one** place — the station table that `build-home-data.js` reads —
then push it through:

```bash
node tools/build-home-data.js          # regenerates the catalogue
node tools/sync-tenants.js             # dry run: shows what would change
node tools/sync-tenants.js --apply     # rewrites the tenant records
node scripts/r2-publish-schedules.js --apply --station <ID> --days 3
```

The last step matters and is easy to forget. A day file carries the name it was
published with, so a rename does not reach listeners already holding today's
schedule until that day is republished — or until the player's twenty-minute
revision check notices the new `rev` and re-downloads. Republishing makes it
immediate.

## Why the derived copies exist at all

They are not redundancy for its own sake:

- **The tenant record** is what the generator and publisher resolve a channel
  through. They run on a server with no access to the site catalogue, so the
  name has to travel with the record.
- **The day file** carries the name so the player can label itself from one
  fetch. Without it a listener would need a second request just to learn what
  station they are hearing.

Both are copies **written from** the catalogue. Neither is read for display. If
one disagrees, the catalogue is right and the copy is stale.

## What enforces it

- `tools/sync-tenants.js` takes `name` from the catalogue record, not from the
  station table it reads everything else from. A tenant record cannot introduce
  a name of its own.
- `kj-footer-player.js` reads the name through a single function, `stationName()`,
  which takes it off the catalogue record. The day file's `name` field is never
  consulted for display.
- The player test asserts that the catalogue and every tenant record agree, and
  that the name shown on the bar is the catalogue's — not the day file's.

## The player bar

Three lines, each answering one question:

```
  Jubilee Kids Party                          what am I listening to
  Tiger Tango Jungle Swing (Tiger S Tango)    what is playing
  HM 329.12 (Kids)                            where on the dial
```

The station leads, in bold and two points larger than the track. It used to be
two lines, with the station folded into the second beside the frequency and the
format:

```
  Tiger Tango Jungle Swing (Tiger S Tango)
  Jubilee Kids Party HM 329.12 (Kids)         <- the old shape
```

That made the station — the thing the listener actually chose — the smallest,
dimmest text in the bar, and left one line carrying three unrelated facts. All
three lines fit in the height the two occupied; the line-height came down
slightly to pay for it.

## Categories follow the same rule

A station's **category** is defined once, in the same place as its name.

`tools/build-home-data.js` builds `KJ_SECTIONS`: four sections, each with
shelves that name their stations by slug. The home page renders those shelves
as cards; `stations.html` groups its table by the same lists; the category bar
on both pages is built from the same array. There is no second membership test
anywhere.

`stations.html` used to carry its own four sections with its own `primary`
tests, written from the same intent but written separately. They drifted — the
two pages used different category names, and the mainstream band had to be
moved on both by hand — which is exactly the failure this document exists to
prevent, one level up from station names.

### Two names per section

Each section carries both:

| field | used for | example |
| --- | --- | --- |
| `nav` / `label` | the category bar — a destination | `Home` |
| `catalog` | a heading in a list of categories | `Christian Music` |

Only `home` genuinely needs the distinction: Home names where you are going,
not what is on the shelf. The other three set `catalog` to the same string as
`label`, so the pair stays visible rather than looking like a special case.

### Changing which category a station is in

1. Edit the shelf in `tools/build-home-data.js` (`englishMusic()`, `HOME_PINNED`,
   or the `SECTIONS` shelf tests).
2. `node tools/build-home-data.js`
3. Deploy `public/js/stations-data.js`.

Both pages move together. The generator prints a card count per section and
reports any station that landed on no shelf.

### Changing where a station broadcasts from

The **Broadcasting from** column on `stations.html` lists the cities a station
is based in — the anchor it belongs to, then relays in other time zones so a
listener is inside a base's own clock rather than shifted into somebody else's.

1. Edit the station's entry in `data/broadcast-bases.json`. Give it a `why`;
   the page shows it as the column's tooltip and it is the only record of the
   reasoning. A city not already in the `cities` gazetteer needs adding there
   with its country and IANA zone.
2. `node tools/build-broadcast-bases.js` — resolves each city against the HM
   tower roster and **refuses to write** on an unknown slug, a city that is not
   a tower and is not marked `"tower": false`, an invalid zone, fewer than two
   bases, or a set of bases that all keep the same clock. It also reports, but
   does not block on, anchors that disagree with a tenant's `origin.city`.
3. `node tools/build-home-data.js` — merges the result into `stations-data.js`.
4. Deploy `public/js/stations-data.js` and `public/data/station-bases.json`.

**Run them in that order.** `build-broadcast-bases.js` reads the catalogue out
of `radio.html` rather than out of `stations-data.js` precisely so the two
generators do not depend on each other's output; running them the other way
round would merge a stale set of bases.

### A station may be in two categories

The old table was a strict partition — one station, one section, enforced by
first-match-wins. The shelves are not: God's Little Lambs is Bible songs for
small children and appears under **Christian Music** and **Family Friendly**,
because both are true and a parent may look in either.

Giving up the partition gives up its one guarantee — that nothing can vanish —
so `stations.html` renders any station on no shelf under **Also on the Dial**
rather than silently dropping it.

## Related

- `docs/MUSIC-REPOSITORY-SPEC.md` — SongIDs, the same one-primary-key discipline
  applied to tracks.
- `setup/station-guidelines.md` §2.5 — how day files are published and revised.
