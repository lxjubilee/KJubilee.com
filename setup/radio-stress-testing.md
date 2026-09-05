# Radio Stress Testing

Filling `/listeners` with a fictional audience, so the people who run this
network can practise on a full grid instead of an empty one.

On a quiet Tuesday afternoon `/listeners` shows four rows. That is a true
picture and a useless drill. Nobody finds out whether an operator can read a
hundred and twenty rows, notice that one frequency has nobody on it, or spot a
whole region dropping off the map, by watching four rows go by. This document is
how the grid gets filled with somewhere between **95 and 145 account-less
listeners**, around the clock, perpetually — and how it gets emptied again.

**What is being stress-tested is the team, not the server.** A hundred and
twenty synthetic rows will not trouble a Next process; they are not meant to.
They are meant to trouble the person watching the page, and to answer a question
nobody can answer from an empty grid: when this network really does carry that
audience, can we see what is happening in it?

---

## The one switch

```bash
STRESS_TEST_LISTENERS=true      # in .env, then restart
```

Exactly `true`. Unset, empty, `1`, `yes`, `TRUE` and ` true` are all **off** — a
switch that fabricates an audience should not turn on because a value was nearly
right. `lib/stress-listeners.js` compares against the string and nothing else,
and `tests/stress-listeners.test.js` holds it to that.

Off is the default, off is what ships, and off is what production should be in
except while a drill is actually running.

---

## The page always says when it is on

This is not configurable and has no switch of its own. With the fixture running,
`/listeners` shows:

| Where | What |
| --- | --- |
| Above the grid | A violet banner: **Simulated audience**, which hour file is live, whether it is a night or day mix, and when the count next changes |
| In the tallies | A **simulated** count beside **on the dial**, so the real number is always one subtraction away |
| On every fabricated row | A dim `sim` tag in the Listener column |
| In the footer | A line naming `data/stress-listeners` as the source |
| In the API | `stress: {...}` and `simulated: <n>` on `/api/admin/listeners` |

**Do not remove these.** The drill is realistic because the grid is *full*, not
because the page is lying about what is in it. A screenshot of `/listeners` can
end up in a report; an operator who cannot tell a fixture from an audience will
eventually quote one as the other, and the first person to notice will be
somebody outside this building.

The `sim` tag lives in the **Listener** column and not next to the address,
because the address column is dropped below 820px and a tag that vanishes on a
phone is not a tag.

---

## The dial reads X / Y / Z

The corner of `/player` reads **`X / Y / Z LISTENING`**, and the three numbers
always add up:

| | | Counts | A drill can move it |
| --- | --- | --- | --- |
| **X** | everybody on the dial right now | real + fixture | **yes** |
| **Y** | how many of them signed in | **real people only, always** | **no** |
| **Z** | everybody who did not | real + fixture | **yes** |

`X = Y + Z`, at every moment, with or without a drill running.

**The middle number is the point of having three.** Every listener in the
fixture is anonymous by construction — `user` is hard-wired to `null` in
`stressRows()` and `stressTally()` has no `accounts` field to return — so a
drill can pad the outer two and cannot reach the middle one. Y is the figure on
that dial that stays true through a stress test, which is exactly what makes it
worth printing beside two that do not.

That guarantee is **structural, not a promise**: real listeners are counted
inside `lib/presence.js` and the fixture is only ever *added* at the route. If a
synthetic listener ever needs to exist for some other reason, it gets its own
store — it does not get a flag in that Map.

`here` — how many are on the frequency under the needle — used to be the first
of two numbers. It is still returned by the API and now lives in the readout's
tooltip and its `aria-label`; four numbers in a dial corner is a licence plate,
not a readout.

During a deploy the browser gets the new script before the API restarts, so
`accounts` arrives as `null` for a minute or so. The readout **falls back to the
old two-number form** rather than printing a confident `X / 0 / X`.

---

## The pipeline at a glance

```
   tools/build-stress-listeners.js          ← the generator. Run once, or
              │                               after a change to the tables.
              ├──► data/stress-listeners/roster.json
              │      420 people who never change:
              │      one address, one city, one device, one station, forever
              │
              └──► data/stress-listeners/hours/hour-00..23.json
                     who is on air in each UTC hour, and in which third of it

                                  │
                                  ▼
   lib/stress-listeners.js        ← the runtime. Picks the live hour file,
              │                     the rollover minute, the churn points.
              │                     Never calls Math.random.
              ▼
   /api/admin/listeners  ──►  /listeners        the operator's rows
   /api/radio/listeners  ──►  X / _ / Z         the dial's outer two numbers


   lib/presence.js                ← THE ACTUAL VISITORS, in their own file.
              │                     An in-memory Map, 62-second TTL, never
              │                     written anywhere, never commingled.
              ▼
   /api/radio/listeners  ──►  _ / Y / _         the dial's middle number
```

**The two stores never touch.** The real Map holds real listeners and only real
listeners; the fixture is read from disk and appended at the route. That is what
"keep the actual visitors in a separate file" buys: `Y` is arithmetically
incapable of being inflated by a drill, and turning the switch off returns every
page to the truth with nothing to clean up.

---

## Phase 0 — Decide what you are drilling

Before turning anything on, know which of these the run is for. They want
different settings and produce different arguments afterwards.

| Drill | Settings | The question it answers |
| --- | --- | --- |
| Can we read a full grid? | Defaults | Does anyone notice the station with nobody on it? |
| Does the peak hour look right? | `STRESS_TEST_HOUR=22` | What does a busy evening actually look like? |
| Does the quiet hour look wrong? | `STRESS_TEST_HOUR=09` | Can we tell "quiet" from "broken"? |
| Does the public number hold up? | `STRESS_TEST_PUBLIC_COUNT=true` | Does the dial read sensibly at 130 listeners? |

**Tell the team it is a drill, or tell them afterwards, but decide which before
you start.** Both are legitimate; discovering halfway through that nobody knows
is not.

---

## Phase 1 — Build the roster and the 24 hour files

```bash
node tools/build-stress-listeners.js
```

The output is the grid, and a run without one is not a finished run:

```
  UTC   LA    NY    LON   SYD    ON AIR  HELD  NEW  ENERGY  IN DARK  PLAY AT  TOP STATION
  ----------------------------------------------------------------------------------------
  00    17:00    20:00    01:00    10:00 141    85   56       65 peak      4%  day  jubilee-ccm (16)
  ...
  09    02:00    05:00    10:00    19:00  97    56   41      52 quiet     22%  day  jubilee-ccm (14)
  ...
  22    15:00    18:00    23:00    08:00 145    91   54     61 steady     12%  day  jubilee-ccm (18)

  95-145 concurrent · 8 night hours, 16 day hours · 61 stations reached · 179 cities
```

Read it as: at 00:00 UTC it is five in the evening in Los Angeles and ten in the
morning in Sydney, 141 people are on air, 85 of them were already on an hour ago,
and 4% of them are listening in their own small hours.

### Options

| Flag | Default | What it does |
| --- | --- | --- |
| `--seed <string>` | `kjubilee-stress-1` | Everything derives from this. Same seed, same audience, on every box. |
| `--population <n>` | `420` | The size of the pool the hours draw from, not the concurrent count. |
| `--min <n>` / `--max <n>` | `95` / `145` | The concurrent band. |
| `--check` | — | Verify and change nothing. Exit 2 on a problem. |

### Gate

```bash
node tools/build-stress-listeners.js --check
node tests/stress-listeners.test.js
```

`--check` verifies the files agree with each other. The test verifies the
runtime, which is the half that can be subtly wrong — see
[What the test is actually for](#what-the-test-is-actually-for). **Both must
pass before the switch goes on.** The checks that matter:

- every address is inside `100.64.0.0/10` or `2001:db8::/32`, and unique
- every station named is on the dial, and none is in the multilanguage band
- every *segment* of every hour is inside the 95–145 band — not just the hourly
  union, because a listener only ever sees one segment
- an address never changes its city, its device or its station
- the grid is identical on two polls ten seconds apart

---

## Phase 2 — Turn it on

```bash
# .env
STRESS_TEST_LISTENERS=true
```

Restart the app. Nothing else is needed — the JSON is read from disk on demand
and re-read when its mtime changes, so a rebuild during a drill shows up without
a bounce.

Open `/listeners`. Within one refresh (10s) the grid fills and the banner
appears.

---

## Phase 3 — Watch it

What to look for, in the order it is worth looking:

1. **The stations strip.** It names every frequency somebody is on. What is
   *missing* from that strip is the interesting fact, and it is the one an empty
   grid can never show you.
2. **The From column.** It should read like a map of the English-speaking world
   rotating through its own day, not like a shuffled list of cities. At 09:00
   UTC it should be mostly Britain and Australia; at 01:00 UTC mostly America.
3. **The For column.** A handful of rows should be reading in hours. Those are
   the anchors — the radio that went on at breakfast and was forgotten about.
4. **The count.** It moves two or three times an hour and never on the hour.

### The count and the clock

The audience does not change on a round number, because real audiences do not
and an operator watching a grid that visibly re-deals itself at `:00` learns to
discount it.

```
  :00        :04                    :19                :41            :00 :07
   │          │                      │                  │              │   │
   │◄─ still  ├──── hour 14, part 1 ─┼─ part 2 ─────────┼─ part 3 ─────┼───┤
   │  hour 13 │                      │                  │              │   │
              ▲                      ▲                  ▲                  ▲
        rollover                 churn              churn          next rollover
     (0-10 min past)      (1 or 2 per hour, minute unpredictable)
```

- **The rollover** falls somewhere in the first ten minutes past the hour, and it
  is a different minute every hour and every day.
- **One or two churns** follow inside the hour. Each swaps part of the audience
  and moves the headcount.
- So the number changes **two or three times an hour**, which is what the banner's
  *next change in N min* is counting down to.

All of it is a hash of the date, the hour and the listener — never
`Math.random`. The page polls every ten seconds, and anything random would
reshuffle the grid six times a minute.

---

## Phase 4 — Turn it off

```bash
# .env
STRESS_TEST_LISTENERS=false
```

Restart. The grid returns to whoever is actually there. There is nothing to
clean up: nothing was written, nothing entered `lib/presence.js`, and no row
outlived the request that made it.

**Say publicly that the drill has ended.** A number that was quoted during the
drill is still out there in somebody's notes.

---

# The specification

Everything below is what the generator implements. Change the tables, re-run the
generator, re-run the test.

## What a stress listener is

**An address, not an account.** Nobody in this fixture has signed in and nobody
ever will: `user` is hard-wired to `null`, because inventing a signed-in listener
means inventing an email address, and an invented email address can collide with
a real person's. The Listener column reads *Not signed in* for every one of them,
which is also true of most of the real audience.

Each one is fixed for life in four ways. This is the property the whole drill
rests on — an operator who learns that `100.81.x` is the Atlanta cohort must not
be lied to an hour later:

| Fixed | Example |
| --- | --- |
| Address | `100.81.44.17`, or `2001:db8:5f10:…` |
| Place | Atlanta, Georgia, US |
| Device | iPhone (`iOS · Safari`) |
| Station | `corner-cipher` |

What *does* change is whether they are on air this hour, whether the sound is
playing or paused, and how long they have been listening.

## Addresses that belong to nobody

| Block | Standard | Used for |
| --- | --- | --- |
| `100.64.0.0/10` | RFC 6598, carrier-grade NAT | ~82% of rows |
| `2001:db8::/32` | RFC 3849, documentation | ~18% of rows, mostly phones |

Neither block is routable on the public internet and neither is allocated to any
person or company. `100.64/10` is also the range a real phone on a real mobile
network genuinely sits in, so it reads correctly on the screen.

**This is not a style choice, and it is not negotiable.** A fixture that printed
plausible public addresses would be putting real households on an operator's
screen, tied to a city and a listening habit that were invented here — and
somebody would eventually act on one. `--check` fails the build if an address
outside those two blocks appears, and the test asserts it independently.

The **second octet encodes the region**, which is what makes the grid learnable:

| Region | Country | Addresses | People | Cities | Leans toward |
| --- | --- | --- | --- | --- | --- |
| `us-hawaii` | US | `100.64.x` | 8 | 5 | island-hallelujah |
| `us-alaska` | US | `100.65.x` | 4 | 3 | stillwater, midnight-praise |
| `us-pacnw` | US | `100.66–67.x` | 17 | 7 | jubilee-ccm, inspire-acapella |
| `us-california` | US | `100.68–71.x` | 38 | 12 | jubilee-ccm, latin-worship |
| `us-southwest` | US | `100.72–73.x` | 13 | 8 | throne-room-vegas |
| `us-mountain` | US | `100.74–75.x` | 13 | 8 | jubilee-teaching, hymns |
| `us-texas` | US | `100.76–78.x` | 34 | 10 | country-gospel, we-eatin-good |
| `us-midsouth` | US | `100.79–80.x` | 25 | 11 | country-gospel, gravel-road-gospel |
| `us-atlanta` | US | `100.81–82.x` | 21 | 8 | corner-cipher |
| `us-southeast` | US | `100.83–85.x` | 25 | 12 | riddim-and-rhyme, latin-worship |
| `us-midwest` | US | `100.86–88.x` | 34 | 15 | we-eatin-good, corner-cipher |
| `us-appalachia` | US | `100.89.x` | 13 | 8 | country-gospel, hymns |
| `us-northeast` | US | `100.90–92.x` | 29 | 14 | jubilee-teaching, inspire-jazz |
| `us-midatlantic` | US | `100.93–94.x` | 13 | 7 | jubilee-gospel-fire |
| `uk-london` | GB | `100.100–102.x` | 34 | 9 | riddim-and-rhyme, pentecostal-fire |
| `uk-north` | GB | `100.103–104.x` | 17 | 9 | inspire-hymns-heritage |
| `uk-midlands` | GB | `100.105.x` | 13 | 8 | inspire-hymns-heritage |
| `uk-south` | GB | `100.106.x` | 8 | 6 | inspire-classical, stillwater |
| `au-southeast` | AU | `100.112–114.x` | 34 | 8 | jubilee-ccm, yes-and-amen |
| `au-queensland` | AU | `100.115–116.x` | 17 | 7 | jubilee-ccm, island-hallelujah |
| `au-west-south` | AU | `100.117.x` | 10 | 6 | jubilee-ccm, stillwater |

Roughly **68% United States, 17% England, 15% Australia**, which is where an
English-language network of this shape would actually be heard.

## The geography is the point

A hundred rows of random cities against random frequencies is noise an operator
learns to ignore in a day. A hundred rows where **Honolulu is on Island
Hallelujah, Nashville is on Gospel Country, Atlanta is on Corner Cipher and Perth
is on Celebrate Yeshua!** is a picture somebody can reason about — and the moment
it stops making sense, that is the drill working.

Station choice is decided in two layers:

1. **The region's taste** — a weighted list per region in `REGIONS`. Hymnody
   reads as northern English; Christian hip-hop as Atlanta, Chicago and Los
   Angeles; country gospel as Nashville and Texas; CCM as the West Coast and as
   Australia.
2. **The city's own leanings** — an optional fourth element on a city, added *on
   top of* the region's. Detroit is still a Midwestern listener who might be on
   Inspire Cafe; it is just far likelier to be on We Eatin Good than Toledo is.

Use a city boost where **the city *is* the station's story** — mostly where
`data/broadcast-bases.json` names it as that station's anchor — and leave it off
everywhere else.

The current boosts, and why:

| City | Boosted toward | Because |
| --- | --- | --- |
| Honolulu | island-hallelujah | The island sound and the anchor |
| Nashville, Franklin | country-gospel | Nashville is country music |
| Muscle Shoals | gravel-road-gospel | The room the record comes out of |
| Atlanta, Marietta, Decatur | corner-cipher | The centre of gravity of Christian hip-hop |
| Detroit | we-eatin-good | The city is the subject of the record, not the postmark |
| Chicago, Los Angeles | corner-cipher | The other two cities the form was built in |
| Houston | we-eatin-good | Second home of soul-sampled Southern rap |
| Las Vegas, Henderson | throne-room-vegas | The Strip is the whole conceit |
| San Antonio, El Paso, Hialeah | latin-worship | Bilingual EN-ES, and the audience is there |
| Miami, Brixton, Brooklyn | riddim-and-rhyme | Real Caribbean populations |
| Charlotte | country-gospel | Gospel Country's eastern relay |
| Sacramento | jubilee-radio | The flagship's anchor |
| Sydney, Melbourne, Perth, Brisbane | jubilee-ccm | CCM is the Australian shape |
| Gold Coast, Cairns | island-hallelujah | Pacific |
| Oxford, Cambridge | inspire-classical | — |

**A city that declares a boost is guaranteed at least one listener on it.**
Leaving that to a weighted draw over six people meant the fixture sometimes
shipped with nobody in Muscle Shoals on Gravel Road Gospel, which is not a subtle
statistical shortfall — it is the one thing that city is in the table to show.

### Cities are allocated, not sampled

Cities are listed **in descending metro order** and drawn Zipf-weighted, so the
first city in a region carries about a third of it. The headcount per city is
then allocated by largest remainder rather than sampled one listener at a time.

**Keep each city list in size order.** The first version of this drew cities
uniformly and produced three listeners in Atlanta and none at all in Detroit,
which erased the two most characterful cohorts in the whole fixture.

### The multilanguage band is out of scope

This fixture invents listeners in three English-speaking countries, so a row on
Inspire India would be a claim about an audience it is not modelling. Every
station in `band: "multi"` is excluded, and the test enforces it.

`latin-worship` (English-Spanish) and `backrow-faith` (English-Romanian) *are*
included: both are bilingual with English and both have a real, large diaspora
inside those three countries.

## Devices

| Device | Share | Agents shown on hover |
| --- | --- | --- |
| iPhone | 40% | `iOS · Safari`, `iOS · Chrome` |
| Android | 15% | `Android · Chrome`, `Android · Samsung Internet` |
| Windows | 27% | `Windows · Edge`, `Windows · Chrome`, `Windows · Firefox` |
| Mac | 18% | `macOS · Safari`, `macOS · Chrome` |

40/15/45 is the owner's number, not a measurement. What the drill exercises is
whether the grid still reads when nearly three rows in five are a phone.

**A real listener's Device cell is always a dash**, because `lib/presence.js`
does not ask a browser what it is running on — a browser that could state its own
platform could state any. So a *filled* Device cell is itself proof the row came
from the fixture.

Phones are given IPv6 about a third of the time and desktops about one time in
sixteen, which is true of the real internet and also puts the long addresses
where an operator expects to see them.

## Session shapes

| Type | Share | Holds a row for | What it represents |
| --- | --- | --- | --- |
| `anchor` | 18% | 5–13 hours | The radio went on and was forgotten about |
| `regular` | 45% | 2–4 hours | A deliberate listening session |
| `dropin` | 37% | 1 hour | Passing through |

The anchors are why consecutive hour files overlap instead of being twenty-four
unrelated crowds — and why the **For** column has rows reading `6h 20m`. They
also leave when their own local clock says they should: an anchor in Perth does
not still hold a row at four in the morning just because they started at eight
the previous evening.

## The twenty-four hour files

One file per **UTC** hour, `data/stress-listeners/hours/hour-00.json` through
`hour-23.json`.

They are keyed to UTC and not to any local clock because the audience is not in
one place. At 03:00 UTC it is ten at night in New York, eight in the evening in
Denver, three in the morning in London and one in the afternoon in Sydney — and
each of those people is doing something different. **Every hour file is a global
snapshot in which each listener is doing what makes sense in their own local
time.**

Each file carries:

| Field | Meaning |
| --- | --- |
| `count` | Everybody who appears at any point in the hour — the union |
| `slotCounts` | What is actually on screen in each third. These are the numbers inside 95–145 |
| `held` / `fresh` | Carried over from last hour / newly arrived |
| `energy` | 0–100, the mean loudness of what is being listened to |
| `energyLabel` | `quiet` · `low` · `steady` · `peak` — quartiles of *this day's* own range |
| `nightShare` | The fraction of the audience whose local clock reads 22:00–08:00 |
| `suitableFor` | **`night`** or **`day`** |
| `clocks` | What time it is in LA, NY, London and Sydney |
| `byCountry`, `dayparts`, `stations` | The shape of the hour, for reading at a glance |
| `listeners` | `{ i: id, h: hours already listening, s: "111" }` |

### Night and day, measured the only way that works here

The first version of this classified an hour by its mean energy and produced
**twenty-four day files**. That was not a bad threshold — it was a fact about the
audience. This network is heard on three continents, so at every hour of the
clock somebody somewhere is in prime time and the average never falls far.
Averaging a global room tells you nothing about whether it is night in it.

What does tell you is **how much of the room is in its own small hours**.
`nightShare` swings from about one row in twenty to fully half across the day,
and an hour at or above **0.30** is a night file: the audience it describes is
mostly people listening in the dark, and the recovery, prayer, sleep and ambient
frequencies carry it. That currently gives **8 night hours and 16 day hours**.

`energy` is still recorded and still useful — it is a statement about the *room*
a station makes, not about how good it is. Bedtime Blessings is a 6 and
Pentecostal Shout is a 92, and neither is a judgement.

### The three slots

Each listener in an hour file carries a three-character run like `111`, `100` or
`011` — which thirds of the hour they are present for. The runtime fires one or
two churns and reads whichever third it is in; with only one churn the second
segment covers the last two slots together, so nobody written into the middle is
silently lost.

**Every slot is topped up so that all three stay inside the band.** An earlier
build met 95–145 on each hour's union and let a segment fall to 69 — which would
have told the operator the network shed a quarter of its audience for twenty
minutes and then got it back, twice an hour, forever. Top-ups extend an existing
listener's run rather than inventing a new one: somebody who was leaving at the
second churn simply stays to the end. Runs are always contiguous, because a
listener who comes back after leaving is a different session and the **For**
column would have no way to say so.

Each slot gets its **own** target, a few above the floor rather than exactly on
it. Levelling all three to the same number produced an hour whose headcount did
not move once in sixty minutes: every churn fired and swapped one set of people
for an identically sized set, which is the one thing the churns exist not to do.

---

## Reference

### Environment

| Variable | Default | Effect |
| --- | --- | --- |
| `STRESS_TEST_LISTENERS` | `false` | Master switch. Must be exactly `true`. |
| `STRESS_TEST_PUBLIC_COUNT` | `true` | Also count them in the dial's **X** and **Z**. Opt out with exactly `false`. |
| `STRESS_TEST_HOUR` | *(empty)* | Pin to one UTC hour, 0–23. Empty follows the clock. |

The two switches are deliberately asymmetric. The master switch must be exactly
`true`, because it is the difference between a real page and a fabricated one.
`STRESS_TEST_PUBLIC_COUNT` is **opt-out**, because it cannot do anything at all
while the master switch is off — so a strict default would only produce a quiet
failure: a box whose `.env` predates the flag would run a drill whose dial never
moved, and the operator would spend the drill debugging the dial instead of
watching it.

Set it `false` for a drill that wants the operator's grid full while the public
dial stays exactly as it was.

### Files

| Path | What it is |
| --- | --- |
| `tools/build-stress-listeners.js` | The generator. Tables, seed, and `--check`. |
| `data/stress-listeners/roster.json` | The population. Generated; never hand-edited. |
| `data/stress-listeners/hours/hour-NN.json` | Attendance, one per UTC hour. Generated. |
| `lib/stress-listeners.js` | The runtime: the clock, the churns, the rows. |
| `tests/stress-listeners.test.js` | The 109 assertions below. |
| `app/api/admin/listeners/route.js` | Where the fixture is appended. |
| `app/listeners/client.js` | The banner, the `sim` tag, the Device column. |

### What the test is actually for

`node tests/stress-listeners.test.js`. Four failure modes, each of which would
ruin a drill without anybody noticing:

1. **It runs when nobody asked.** If the switch check ever loosened to a
   truthiness test, a stray `false` in a shell profile would put a hundred
   invented listeners on a production page.
2. **The rows move between polls.** The page refreshes every ten seconds. If any
   decision in the runtime were random rather than hashed, the grid would re-deal
   itself six times a minute — and the **For** column would freeze or jump. This
   is the property most likely to be broken by a well-meaning edit and the
   hardest to notice by eye.
3. **An address stops meaning one person.** Shuffle that and the grid becomes
   noise that happens to have a hundred rows.
4. **The geography stops making sense.** Asserted as *lift over the network* —
   being in Detroit must move the odds of We Eatin Good by at least 3× — rather
   than as a raw share, because a marquee city may hold only six listeners and
   "at least a fifth of them" is a coin toss dressed up as an assertion.

---

## When to rebuild

| Trigger | Why | Command |
| --- | --- | --- |
| A station is added or renamed | `--check` fails on a slug that is not on the dial | `node tools/build-stress-listeners.js` |
| A station is removed | Same | Same |
| Daylight saving shifts | Local hours drift by one for the affected regions; `--check` warns | Same |
| The taste tables change | That is the point of changing them | Same |
| A different drill is wanted | A new seed is a new audience | `--seed <name>` |

`--check` prints a `warn` line for every zone whose offset has moved since the
files were built. It is a warning and not a failure: an hour's drift in a
fiction is cosmetic. It is still worth clearing twice a year.

---

## What this deliberately does not do

- **It does not write anything, anywhere.** No table, no row, no log. The same
  rule `lib/presence.js` has always had, and for the same reason: the moment any
  of this is persisted it stops being a live view and becomes a record.
- **It does not touch `lib/presence.js`.** Real listeners and fictional ones
  never share a store, so the switch is a clean on and a clean off.
- **It does not invent accounts.** See [What a stress listener
  is](#what-a-stress-listener-is).
- **It does not emit a routable address.** See [Addresses that belong to
  nobody](#addresses-that-belong-to-nobody).
- **It does not hide itself.** See [The page always says when it is
  on](#the-page-always-says-when-it-is-on).
- **It does not simulate load.** A hundred and twenty rows added in a `.map()` is
  not a load test and must never be described as one. If the question is whether
  the server survives real traffic, that needs real requests against
  `/api/radio/listeners` and this is the wrong tool entirely.

---

## Troubleshooting

**The grid is empty and the banner is missing.**
`STRESS_TEST_LISTENERS` is not exactly `true`, or the app has not been restarted
since it changed. Check with `node -e "console.log(JSON.stringify(process.env.STRESS_TEST_LISTENERS))"`
in the app's own environment — a trailing space is the usual culprit and is
supposed to be off.

**The banner is there but there are no rows.**
`data/stress-listeners/` is missing or unreadable — most likely it was not
deployed. Run `node tools/build-stress-listeners.js --check` on the box.

**The count never changes.**
Look at the banner's *part N of M*. If it never advances, the clock is being
pinned — check `STRESS_TEST_HOUR` is empty.

**A station on the strip is not on the dial.**
The catalogue changed and the fixture was not rebuilt. `--check` says which.

**The numbers went into a report.**
Say so now. `simulated` on `/api/admin/listeners` gives the exact figure to
subtract, and the drill's hour files are in git, so the whole thing is
reconstructible after the fact.
