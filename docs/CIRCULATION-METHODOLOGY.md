# Circulation — potential outreach per station, and an honest total

**Model inputs:** `data/circulation.json`
**Computed by:** `tools/build-circulation.js` → `public/js/circulation-data.js`
**Shown on:** the dial (`/player`) — per station, and as a band total in the corner

---

## 1. What the number is, and what it is not

Circulation here is **potential outreach**: how many people *could* hear this
station, given that they speak its language, have a device to hear it on, and
belong to the audience the station is programmed for.

It is not:

- a listener count
- a forecast
- a promise

It is the size of the door, not the number of people who have walked through
it. Every input is an estimate, and the estimates are in a JSON file precisely
so they can be argued with and corrected rather than quietly believed.

---

## 2. The three figures

They are different questions and the dial shows the first one.

| | | |
|---|---|---|
| **Potential outreach** | **5,564,218,900** | Every person on earth with a device, believer or not. The band carries stations for both, so a device is the only real gate. This is the ceiling the mission aims at. |
| Reachable in our languages | 3,135,010,000 | Of those 5.3 billion, the share whose first language is one of the 30 on this dial. The gap is languages not yet carried. |
| Reached by today's stations | 2,884,209,200 | What the 116 stations actually cover, de-duplicated. |

The headline carries a point estimate inside the cited 5.3–5.8 billion range.
**The precision is presentational, not measured** — nobody counts phones to the
hundred, and the last two digits are zero for that reason.

## 3. The chain, per station

```
speakers of its language
  × share with a smartphone or computer online      (device gate)
  × the AUDIENCE the station is programmed for      (see below)
  × share who prefer that format
  = circulation
```

### A language edition is sized on speakers, not believers

The only station on this dial in Japanese is Japan Inspire. Filtering it down to
Japanese *Christians* — 1.1% of the population — and then again by genre gave it
**703,313** listeners against 116 million Japanese speakers with a phone. Israel
Inspire came out at **1,337**. Both measured the opposite of what a language
edition is for, which is reaching people who are not believers yet.

So a language edition takes everyone who speaks it and has a device. No belief
filter, no genre filter:

| station | was | now |
|---|---|---|
| Israel Inspire (Hebrew) | 1,337 | **8,100,000** |
| Japan Inspire | 703,313 | **116,250,000** |
| Türkiye Inspire | 82,170 | **74,700,000** |
| Inspire India (Hindi) | 4,784,230 | **378,200,000** |
| Asia Inspire (Mandarin) | 24,024,000 | **873,600,000** |

Japan lands at 116 million against roughly [120 million reported smartphone
users](https://explodingtopics.com/blog/smartphone-stats), which is the sanity
check that matters.

### Reach, not preference

The general-audience shares were answering "who would name this their
favourite" when the question is "who could this plausibly reach". Melody's
Sparkle is pre-evangelistic pop aimed at everyone, and came out at 79 million
against 1.32 billion English speakers online. Those shares are now reach
figures, and it reads **1,122,000,000**.

### The audience tier is the part that was wrong

The first version multiplied the whole Christian pool by a genre share, and
produced **377,520,000** for Pentecostal Shout — more English-speaking
Pentecostals than there are Pentecostals anywhere. There are about **663
million** renewalists worldwide ([Gordon-Conwell,
2025](https://www.gordonconwell.edu/wp-content/uploads/sites/13/2025/01/Status-of-Global-Christianity-2025.pdf)),
roughly a quarter of all Christians, so no English figure can approach that.

A station tied to a tradition is now sized on that tradition:

| tier | share | of | example |
|---|---|---|---|
| `general` | 1.00 | everyone online | Inspire Jazz |
| `christian` | 1.00 | Christians | Year of Jubilee |
| `renewalist` | 0.25 | Christians | Pentecostal Shout → **94,380,000** |
| `evangelical` | 0.16 | Christians | — |
| `hebraic` | 0.015 | Christians | Hebraic Celebrations → **617,760** |
| `children` | — | children with device access | God's Little Lambs → **13,728,000** |

Children are sized on **children who can reach a device**, not on their parents
and not on the child population: language child share × the online rate ×
`childDeviceFactor` of 0.65, because a child rarely owns the phone.

**Tradition is set per station, not per format.** Pentecostal Shout's format is
`Praise & Worship` — identical to a generic worship station — so the
tradition-bound stations are named one by one in `stationOverrides`. A keyword
rule was tried and rejected: it tagged *Raising Arrows* as a children's station
when its audience is parents, and tagged every station using the name *Yeshua*
as Hebrew-roots when that is the house naming style across the whole band.

**The device gate is real, not decorative.** This band needs no app, no
account and no card, so the only hard requirement is a device and a
connection. That is also why the gate bites hardest exactly where the need is
greatest: Amharic is `online: 0.28`, Swahili `0.35`. Those stations look small
because device access is small, not because the audience is.

**The faith gate applies only to faith stations.** The family-safe and
mainstream formats (Inspire Jazz, Drive Time, Family Pop) draw from the whole
online population of their language, because they are not asking the listener
to believe anything first.

---

## 4. Overlap, and why the total is not the sum

A person who likes worship *and* country appears in the circulation of both
stations. That is correct — each station really could reach them.

Add every station up and that person is counted twice. Add all 116 up and you
get a number larger than the human race:

| | |
|---|---|
| Naive sum of all 116 stations | **11,302,366,390** |
| Actual world population | ~8,200,000,000 |

Publishing the first number would be a lie, and an obvious one. So the total is
a **union**, computed per language and capped:

```
segment total = min( sum of that language's stations,
                     online population of that language × 0.92 )

band total    = sum of the capped segments
```

The ceiling of `0.92` says: within one language, not literally everyone online
will listen to radio in any genre, ever. It is a judgement call and it is the
single largest lever on the headline figure — it lives in
`assumptions.unionCeiling` so it can be moved in one place.

**Result: 11,302,366,390 → 1,232,254,610.** The de-duplication removes 89.1% of
the naive sum. That is the whole point of doing it this way.

### The English segment saturates, and should

Seventy-six English stations against one online English population means the
cap binds hard. English contributes 307,648,000 to the total, not the
11,618,112,000 its stations sum to. Adding a seventy-seventh English station
raises that station's own circulation and moves the band total **not at all** —
which is the correct behaviour, because it reaches the same people.

### Two different speaker bases, on purpose

| | basis | why |
|---|---|---|
| Per-station circulation | first + second language | A Dutch speaker who also speaks English really can listen to an English station. Excluding them would understate that station. |
| Band total | **first language only** | Otherwise that same bilingual person is counted under Dutch *and* English, and the total exceeds the number of people alive. |

Each person is counted once in the total, under their primary language. This is
why the total is conservative: the ~1.1 billion second-language English
speakers are in the total, but under Hindi, Tagalog, Yoruba and the rest.

---

## 5. Sources

| Figure | Source |
|---|---|
| 2.3 billion Christians (2020), 28.8% of world population; sub-Saharan Africa now holds 31% of all Christians | [Pew Research Center, 2025](https://www.pewresearch.org/religion/2025/06/09/how-the-global-religious-landscape-changed-from-2010-to-2020/) |
| Country-level Christian shares and 2010–2020 change | [Pew Research Center, 2025](https://www.pewresearch.org/religion/2025/06/09/christian-population-change/) |
| 663 million Pentecostal/Charismatic and 420 million evangelicals against ~2.64 billion Christians | [Gordon-Conwell, Status of Global Christianity 2025](https://www.gordonconwell.edu/wp-content/uploads/sites/13/2025/01/Status-of-Global-Christianity-2025.pdf) |
| Renewalists are 26.7% of Christians; 86% live in the Global South | [Pew Research Center](https://www.pewresearch.org/religion/2006/10/05/spirit-and-power/) |
| ~5.3–5.8 billion smartphone users, ~70% of world population; >90% among adults 18–49 in developed markets | [Exploding Topics, 2025](https://explodingtopics.com/blog/smartphone-stats) |
| Per-country Christian shares used to weight each language | [Christianity by country](https://en.wikipedia.org/wiki/Christianity_by_country) |

Speaker counts are conventional first-language and total-speaker figures.
**Genre preference shares are judgement, not survey data** — they are the
softest input in the model and the first thing to replace with real numbers if
any become available.

---

## 6. Updating it

Do not re-run the research. Edit the inputs:

```bash
# after editing data/circulation.json, or after adding stations
node tools/build-circulation.js            # report, writes nothing
node tools/build-circulation.js --apply    # writes circulation-data.js
```

A station added tomorrow gets a circulation figure automatically from its
language and format — no research, no hand-entered number. A format with no
entry falls back to a modest share rather than zero, so a new station is never
silently worth nothing; the tool prints which formats fell back.

**Never hand-edit a circulation onto a station.** The number is derived, and a
hand-edited one drifts from the model the moment anything else changes.

---

## 7. Known weaknesses

Worth stating so nobody mistakes this for precision:

1. **Genre shares are estimates.** They come from judgement about what people
   listen to, not from survey data.
1b. **The `hebraic` share of 0.015 is the softest number in the file.** Messianic
   Jews number in the hundreds of thousands worldwide; the Hebrew-roots movement
   among gentile believers is far larger but has no reliable count.
2. **`christianShare` is nominal affiliation**, not practice. Denmark reads
   0.72; weekly attendance there is a small fraction of that. For a station
   asking only that someone press play, nominal is arguably the right measure —
   but it flatters the European segments.
3. **The 0.92 ceiling is asserted**, not derived.
4. **Regions are approximated by language.** A Spanish speaker in Los Angeles
   and one in Buenos Aires are the same row in the model.
5. **Portuguese is one pool, two stations.** Brasil and Portugal draw on the
   same `Portuguese` figures; the segment cap stops that from double-counting
   in the total, but neither station's own number is split by country.
