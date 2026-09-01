
# KJubilee Voice Asset Specification

**Version:** 1.1
**Applies to:** All KJubilee.com stations, all personas, all languages
**Scope:** Every voiced (non-music) element that airs on a KJubilee station, its folder location, its length, its frequency, and the rules governing how it is written and scheduled.

---

## 1. Purpose

KJubilee stations are assembled from two kinds of audio: music, and everything else. This document specifies "everything else."

Music is the product. Voice is what turns a playlist into a station. The goal of every element in this specification is to make a listener understand where they are, want to stay, and come back at a specific hour tomorrow.

---

## 2. Core Principles

These five rules govern every decision below. When a specific guideline conflicts with a principle, the principle wins.

**2.1 Talk is a tune-out risk.**
Every voiced moment is an opportunity for a listener to leave. Voice earns its place or it comes out. The default posture is fewer, better voiced moments rather than more.

**2.2 One element, one job.**
No two elements carry the same information in the same hour. An opener establishes the hour. A sweeper carries identity. A promo points forward. Overlap between them is the single most common failure mode in generated radio, and it is what makes a station feel robotic.

**2.3 Station-neutral by default, station-bound by exception.**
Most voiced content should be written so it can air anywhere. Only three categories are genuinely bound to a place or a station: station identifiers, time checks, and weather checks. Everything else should avoid naming a station, a city, or a clock position inside the script body, so it stays reusable.

**2.4 Repetition is the mechanism, not the failure.**
A set of five sweepers rotating all week outperforms fifty unique ones. Listeners learn a station through repetition. Variety of structure matters more than variety of wording.

**2.5 Concrete beats clever.**
Cleverness that names a real thing (an artist, a story, a listener's request) works. Cleverness with nothing attached ("great music ahead") is filler. When in doubt, be plain.

**2.6 Author at the level where the difference is real.**
Most voiced content does not actually differ between stations. Authoring a full asset set per station multiplies work that has no listener-facing payoff. Write each asset at the highest level in the hierarchy where it is still true, and let everything below inherit it. Only openers, station identifiers, and sweepers are genuinely station-bound.

---

## 3. Folder Architecture

### 3.1 Path convention

```
J:\kjubilee.com\voice\<STATION>-<LANG>\<persona>\
```

Where:

| Token       | Format                  | Example                |
| ----------- | ----------------------- | ---------------------- |
| `STATION` | `HM` + station number | `HM308.70`           |
| `LANG`    | ISO 639-1, uppercase    | `EN`, `RO`, `ES` |
| `persona` | lowercase, hyphenated   | `jubilee-inspire`    |

Full example: `J:\kjubilee.com\voice\HM308.70-EN\jubilee-inspire\`

### 3.2 Resolution cascade

Assets resolve through four levels. The scheduler requests an element and walks **up** the cascade until it finds one.

```
ecosystem  →  block  →  station  →  city
```

| Level     | Path                                                 | Holds                                                                                                           |
| --------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Ecosystem | `voice\_ecosystem\`                                | Liners, most talk segments, syndicated franchises, generic promos                                               |
| Block     | `voice\_blocks\<block-slug>\`                      | Content true of a whole five-fold block (The Crossing, The Nations, The Upper Room, The Living Room, The Table) |
| Station   | `voice\<STATION>-<LANG>\<persona>\`                | Openers, station identifiers, sweepers, station-specific promos                                                 |
| City      | `voice\<STATION>-<LANG>\<persona>\_cities\<IATA>\` | Only assets that name the city aloud                                                                            |

**Rules:**

- A station folder holds **only its overrides**. An empty element folder at station level is correct and expected; it means the station is content with what it inherits.
- Resolution is per element, not per folder. A station can override three sweepers and inherit everything else.
- At full band this is the difference between authoring roughly 101 complete asset sets and authoring one, plus a small override set per station.

### 3.3 Station-scoped tree

Everything below lives under a single station-persona path. Any element folder may be empty, in which case the cascade supplies it.

```
J:\kjubilee.com\voice\HM308.70-EN\jubilee-inspire\
    _lexicon.md
    _templates\
        openers\
        sweepers\
        promos\
        liners\
        song-intros\
        song-outros\
        talk-segments\
    _archive\
        openers\
        sweepers\
        promos\
        liners\
        song-intros\
        song-outros\
        talk-segments\
    _fallback\
    campaigns\
        <campaign-slug>\
    liners\
    openers\
    promos\
    song-intros\
    song-outros\
    station-identifiers\
    sweepers\
    talk-segments\
        franchises\
        interactions\
        teachings\
        testimonies\
    time-checks\
    weather-checks\
    _cities\
        <IATA>\
            time-checks\
            weather-checks\
```

**On `time-checks\` and `weather-checks\`:** these hold **city-neutral** assets, which is the large majority of them. See section 4.8. The `_cities\` subtree holds only the minority of assets that name a city aloud.

### 3.4 Ecosystem-scoped tree

Content produced once and aired across multiple stations does not belong under a station folder. It sits above them, prefixed with an underscore so it sorts to the top of the directory listing and is never mistaken for a station.

```
J:\kjubilee.com\voice\_syndicated\
    scripture-of-the-day\
        2026-08-27\
            full\
            variants\
    _templates\
    _archive\
```

### 3.5 Naming rules

- Element folders are **plural**: `openers`, `sweepers`, `testimonies`, `franchises`.
- Support folders are **underscore-prefixed**: `_templates`, `_archive`, `_fallback`, `_lexicon.md`, `_syndicated`.
- Slugs are lowercase and hyphenated: `jubilee-inspire`, `scripture-of-the-day`.
- Dated folders use ISO format: `2026-08-27`.

### 3.6 Asset file naming

Every voiced asset is a **pair**: a script and a rendered audio file sharing a stem.

```
<element>_<daypart-or-variant>_<nnn>.md      the script
<element>_<daypart-or-variant>_<nnn>.wav     the render
```

Examples:

```
opener_morning_004.md
opener_morning_004.wav
sweeper_identity_002.wav
timecheck_LAX_halfhour_001.wav
```

Sequence numbers are zero-padded to three digits. Never reuse a retired number; move retired assets to `_archive\` intact.

---

## 4. Element Catalog

### 4.1 Openers

**Definition:** The top-of-hour piece. Establishes the station and sets up the hour ahead.

| Property        | Value                                |
| --------------- | ------------------------------------ |
| Length          | 10 to 15 seconds, 20 at the outside  |
| Frequency       | Once per hour, at :00                |
| Scope           | Written per station, not per persona |
| Station-neutral | No, carries the station identity     |

**Structure (three beats):**

1. **Where you are.** Station name and daypart. This is where the station ID is merged in.
2. **What's coming.** One specific hook. Not a list. Name one actual thing.
3. **Reason to stay.** Often just warmth or energy rather than information.

**Rules:**

- The opener carries the station ID inside it. This is the default top-of-hour element.
- Exactly one of `opener` or `station-identifier` plays at :00. **Never both.** This rule is what makes redundancy structurally impossible.
- Openers must convey daypart. A morning commute opener and a late night opener are different assets.
- Openers should be reusable across a day within their daypart, so write the hook at a level that survives repetition.
- No throat-clearing between the ID and the hook. One breath.

**Daypart set:**

| Daypart       | Hours (local station time) |
| ------------- | -------------------------- |
| `morning`   | 06:00 to 10:00             |
| `midday`    | 10:00 to 15:00             |
| `afternoon` | 15:00 to 19:00             |
| `evening`   | 19:00 to 23:00             |
| `overnight` | 23:00 to 06:00             |

---

### 4.2 Station Identifiers

**Definition:** Station identity alone, with no programming information.

| Property        | Value                                         |
| --------------- | --------------------------------------------- |
| Length          | 5 to 10 seconds                               |
| Frequency       | Top of hour, only when no opener is scheduled |
| Scope           | Per station                                   |
| Station-neutral | No                                            |

**Rules:**

- This is the **fallback** for the top of the hour, not the default. Use it for continuous music hours, overnight blocks, or any hour where a host talking would be wrong.
- Carries station identity and nothing else. No daypart, no programming, no forward-pointing.
- A produced, musically consistent identifier (the same bed and treatment every time) is the right choice here, since its whole job is branding through repetition.

---

### 4.3 Sweepers

**Definition:** Short produced pieces that transition between songs and carry the brand back to the station identity.

| Property        | Value                     |
| --------------- | ------------------------- |
| Length          | 3 to 7 seconds            |
| Frequency       | 3 to 5 per hour           |
| Scope           | Per station               |
| Station-neutral | No, includes station name |

**Rules:**

- **One idea plus the station name.** Never two ideas. A sweeper that tries to say two things says neither.
- Build a rotating set of roughly five per station and let repetition do the work.
- Sweepers are produced: bed, treatment, polish. This is what distinguishes them from liners.

**Examples of the range:**

- Plain: "Christian music, all day. KJubilee three oh eight seven."
- Warm: "You're not alone tonight. This is KJubilee."
- Punchy: "More music, less talk. KJubilee."
- Ecosystem: "From Folsom to the nations. KJubilee three oh eight seven."

---

### 4.4 Promos

**Definition:** A short spot pointing at something specific that happens later.

| Property        | Value                                                 |
| --------------- | ----------------------------------------------------- |
| Length          | 20 to 30 seconds                                      |
| Frequency       | 1 to 2 per hour, in place of other talk-break content |
| Scope           | Per station, though many are reusable                 |
| Station-neutral | Varies                                                |

**Rules:**

- A promo must have a **specific thing attached**: a date, a destination, a named show, a station number. If there is nothing specific, it is a sweeper, not a promo.
- Promos are the only forward-looking element. They are how listeners carry across dayparts rather than just across songs.

**Approved promo categories:**

| Category           | What it points to                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-station      | Another station on the band. This is the primary answer to discovery across a large lineup.                                               |
| Site destination   | A specific page on KJubilee.com: the full station lineup, prayer request submission, host backstories. Not a general "visit our website." |
| New release        | A new album or single. All music is Jubilee-owned, so a release is genuine station news.                                                  |
| Appointment moment | Anything happening at a fixed hour. The promo is what builds the appointment.                                                             |
| Awards             | The Jubilee Crown Awards. Date-bound, lives in`campaigns\`.                                                                             |
| Donation drive     | The two feast-anchored drives (spring at Shavuot, fall at Sukkot). Date-bound, lives in`campaigns\`.                                    |

---

### 4.5 Liners

**Definition:** The thinnest voiced element. One spoken line, dry or over a music bed, with no production.

| Property        | Value                                           |
| --------------- | ----------------------------------------------- |
| Length          | 2 to 4 seconds                                  |
| Frequency       | As needed for texture                           |
| Scope           | Per persona, largely station-neutral            |
| Station-neutral | Usually, often does not name the station at all |

**Rules:**

- Liners exist for **texture**. If every voiced moment is a polished sweeper, the station sounds like an advertisement for itself. Liners make it sound like someone is actually there.
- No production treatment. That is the defining difference from a sweeper.
- Often does not name the station, which is what keeps it from competing with sweepers.

**Examples:** "Keep it right here." / "That was Ricky Del Rey." / "More in a moment."

---

### 4.6 Song Intros (Talk-ups)

**Definition:** The host speaking over a song's opening instrumental, landing just before the vocal enters.

| Property        | Value                                           |
| --------------- | ----------------------------------------------- |
| Length          | Bounded by the song's intro ramp                |
| Frequency       | Sparingly, see the sweep structure in section 5 |
| Scope           | Keyed to a song                                 |
| Station-neutral | Yes, should be                                  |

**Rules:**

- Land before the vocal. This is a hard timing constraint and requires the ramp length as metadata on the song.
- Do not intro an entire set in detail. Listeners do not retain three titles announced in advance. The front of a sweep is short; the back does the identifying work.

---

### 4.7 Song Outros (Back-announce)

**Definition:** Naming what just played.

| Property        | Value                      |
| --------------- | -------------------------- |
| Length          | 10 to 30 seconds for a set |
| Frequency       | After each music sweep     |
| Scope           | Keyed to a song or a set   |
| Station-neutral | Yes, should be             |

**Rules:**

- Back-announcing is the **discovery engine**. A listener who cannot find out what they just heard never becomes a fan of that artist. Since all music is Jubilee-owned, every back-announce builds your own catalog.
- Back-announce the whole set at once rather than each song individually.
- **Artist-DJ rule:** When a persona back-announces her own music, she speaks in **first person**. "That was mine." "I wrote that one back when..." Third person about yourself sounds either pompous or robotic and breaks the intimacy that makes a host work.
- **Artist-DJ story rule:** A persona back-announcing her own song should give the story behind it rather than a catalog credit. That is the payoff of having the artist in the chair.
- **Self-promotion ratio:** A persona back-announces her own music **less often** than other artists' music. Target no more than one in three self-references, or the station starts sounding self-promotional.

---

### 4.8 Time Checks

**Definition:** A spoken clock reference.

| Property        | Value                                               |
| --------------- | --------------------------------------------------- |
| Length          | 2 to 4 seconds                                      |
| Frequency       | 1 to 2 per hour                                     |
| Scope           | **City-neutral asset, city-aware scheduling** |
| Station-neutral | Yes                                                 |

**Rules:**

- **Store city-neutral, schedule city-aware.** "Just past the half hour" is identical in Sacramento and Bucharest. The city is a **scheduling** concern, not a storage concern: one set of assets, fired at the right local moment per city. This turns N cities multiplied by N phrases into simply N phrases.
- Only assets that **name a city aloud** go under `_cities\<IATA>\`. Keep these to a minimum.
- **Stay vague on purpose.** "Just past the half hour." "Coming up on nine." Vague phrasing survives a few seconds of clock drift; precise phrasing does not. Vague phrasing is also what makes city-neutral storage possible, so these two rules reinforce each other rather than competing.
- Scheduling is straightforward: because hour files are generated in advance and the browser handles clock sync, every voiced element sits at a known offset inside a known hour. You are scheduling into a clock, not reacting to one.

---

### 4.9 Weather Checks

**Definition:** A short spoken weather reference.

| Property        | Value                                                |
| --------------- | ---------------------------------------------------- |
| Length          | 5 to 10 seconds                                      |
| Frequency       | 0 to 1 per hour                                      |
| Scope           | **Mostly city-neutral, city-aware scheduling** |
| Station-neutral | Yes                                                  |

**Rules:**

- Same principle as time checks. "Clear skies where you are" works everywhere. Write to the condition, not to the place, and one bucket set serves every city.
- Handled by pre-creating a small set of condition buckets and selecting whichever matches actual conditions at schedule-generation time. The condition lookup is per city; the **asset** is not.
- Only assets naming a city aloud go under `_cities\<IATA>\`.
- Weather is the harder of the two clock-and-condition elements, because it is genuinely external and can go stale between generation and airtime. Keep buckets broad enough to stay true across a few hours.
- Suggested bucket set per city: clear, cloudy, rain, storm, snow, hot, cold, windy.

---

### 4.10 Talk Segments

**Definition:** Self-contained hosted content with a beginning and an end. This is the tier where a station stops being a playlist.

| Property        | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| Length          | 2 to 5 minutes                                                     |
| Frequency       | 1 substantial segment per hour, typically at the second talk break |
| Scope           | Per station, then per persona                                      |
| Station-neutral | Yes, should be                                                     |

**The four families:**

| Family      | Folder            | What it is                                                                                               |
| ----------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Testimony   | `testimonies\`  | Story and testimony content. The strongest family, fed by the existing testimony repository.             |
| Teaching    | `teachings\`    | Single-point teaching, short form. The engine for the Bible Teachings block.                             |
| Interaction | `interactions\` | Listener submissions, prayer requests read on air, feedback loop content. Drives the Prayer Rooms block. |
| Franchise   | `franchises\`   | Named recurring segments returning at a fixed slot. This is what creates appointment listening.          |

**Franchise sub-structure:**

A franchise has a stable identity and accumulating episodes. Keep them separate:

```
franchises\
    <franchise-slug>\
        _definition.md
        2026-08-27_001.md
        2026-08-27_001.wav
```

`_definition.md` holds the franchise identity: its name, its slot, its host or host rotation, its structure, its length target, and its opening and closing patterns. Episodes accumulate alongside it without touching the definition.

**Rules:**

- Talk segments should be station-neutral in the script body so they can be reused or syndicated later.
- Organize type-first, then station, then persona. Generation logic and review rules differ by **family**, not by station, so the scaffolding lives at the family level and stations inherit it.

---

## 5. The Hour Clock

### 5.1 The music sweep

A **sweep** (also called a segue set) is 3 to 5 songs run back to back with no talk between them, followed by a back-announce of the whole set.

This is the structure that makes principle 2.1 operational. Talk is clustered rather than scattered, which gives long uninterrupted music runs and fewer tune-out points.

### 5.2 Reference hour for a music station

| Position | Element                                            | Approx. duration |
| -------- | -------------------------------------------------- | ---------------- |
| :00      | Opener (ID merged in)                              | 10 to 15 sec     |
| :00      | **Sweep 1** (4 songs)                        | ~14 min          |
| :15      | Back-announce + sweeper                            | ~30 sec          |
| :15      | **Sweep 2** (4 songs)                        | ~14 min          |
| :30      | **Talk break:** back-announce + talk segment | ~2 to 3 min      |
| :33      | **Sweep 3** (4 songs)                        | ~14 min          |
| :47      | Liner + time check                                 | ~10 sec          |
| :47      | **Sweep 4** (3 to 4 songs)                   | ~12 min          |
| :59      | Closing sweeper into next opener                   | ~5 sec           |

**Totals:** roughly 15 songs and only about 4 voiced moments in 60 minutes.

If the count of voiced elements per hour is climbing well past this, the station is drifting toward talk radio. Cut back to the clock.

---

## 6. Scripture of the Day

### 6.1 What it is

A daily franchise segment built on a single verse. It is the ecosystem's shared heartbeat: everyone across every station hearing the same verse the same day.

### 6.2 Daily asset set

Four pieces per day:

| Piece           | Length       | Airs                                      |
| --------------- | ------------ | ----------------------------------------- |
| Full reflection | ~2 minutes   | Once per station, at the appointment slot |
| Variant A       | 30 to 45 sec | Mid-morning talk break                    |
| Variant B       | 30 to 45 sec | Mid-afternoon talk break                  |
| Variant C       | 30 to 45 sec | Evening talk break                        |

Variants address the same verse from a **different angle**, not a condensed version of the full piece. A listener across a full day hears the verse three or four times, once in depth and the rest as brief echoes, and never the same script twice.

**Do not exceed four pieces per day.** Beyond that you dilute rather than reinforce, and the verse stops feeling like the day's anchor.

### 6.3 Content rules

- **One point.** Two minutes disappears fast. A teaching segment that tries to cover ground becomes a sermon that got cut off.
- Written for the ear, not the page. Short sentences.

### 6.4 Placement

- The full piece airs at a **fixed appointment slot**, the same time every day per station. Morning drive (for example, 07:20, at the second talk break) is the recommended default.
- Variants drop into other talk breaks in place of a promo. At 30 to 45 seconds they do not disturb the sweep structure.

---

## 7. Syndication Rules

Syndication means one piece produced once, airing across multiple stations. Scripture of the Day is the first syndicated franchise; others will follow.

**7.1 Host rotation is a feature.**
Different personas read on different days. A listener on one station gets introduced to personas from elsewhere, which turns the cross-station discovery problem into content rather than a promo.

**7.2 Syndicated content must be station-neutral.**
No station name, no station number, no daypart reference, no city reference **inside the segment body**. Any of these breaks the piece the moment it airs elsewhere.

**7.3 Stagger clock positions across stations.**
The same syndicated piece must air at **different clock positions** on different stations, so a listener flipping between two stations does not collide with the same content twice.

**7.4 Syndicated content lives outside station folders.**
See section 3.3. It belongs in `_syndicated\`, never under a station path.

---

## 8. Pronunciation Lexicon

**File:** `<persona>\_lexicon.md`

A per-persona pronunciation map consumed by the voice pipeline. Build this **before** generating production audio. Retrofitting it after three days of hour files have been rendered with the station name mispronounced is expensive and avoidable.

**Required entries:**

| Category        | Example                     | Required rendering                                                 |
| --------------- | --------------------------- | ------------------------------------------------------------------ |
| Station numbers | `308.70`                  | "three oh eight seven", not "three hundred eight point seven zero" |
| Band prefix     | `HM`                      | as specified per language                                          |
| IATA codes      | `OTP`                     | city name, not letters, in listener-facing copy                    |
| Hebrew terms    | per active theological mode | as specified in the persona's voicing profile                      |
| Artist names    | `Ricky Del Rey`           | as specified                                                       |
| Site domain     | `KJubilee.com`            | "K Jubilee dot com"                                                |

Each entry pairs the written form with an explicit phonetic target. Where the pipeline supports it, use SSML phoneme tags rather than respelling.

---

## 9. Fallback Set

**Folder:** `_fallback\`

A small library of always-safe, always-valid elements the scheduler can reach for when generation fails, when an hour file comes up short, or when a scheduled asset is missing at assembly time.

**Requirements for a fallback asset:**

- **Dateless.** No reference to a day, season, feast, or campaign.
- **Station-neutral where possible**, or explicitly duplicated per station.
- **Evergreen.** Nothing that expires.
- **Reviewed and approved.** These air unattended, so they carry a higher review bar than ordinary assets.

Recommended minimum: one opener per daypart, three sweepers, two liners, one generic back-announce, and one two-minute talk segment.

This folder is what keeps a generation failure from producing dead air.

---

## 10. Campaigns

**Folder:** `campaigns\<campaign-slug>\`

Date-bound material that must **expire out of rotation** rather than sit in `promos\` indefinitely.

| Campaign              | Anchor                                     |
| --------------------- | ------------------------------------------ |
| Spring donation drive | Shavuot (firstfruits), calculated per year |
| Fall donation drive   | Sukkot (ingathering), calculated per year  |
| Jubilee Crown Awards  | Per awards calendar                        |

**Rules:**

- Every campaign folder carries a `_window.md` declaring its start and end dates. The scheduler reads this and will not place campaign assets outside the window.
- On window close, move the campaign folder to `_archive\`. Do not delete: feast-anchored campaigns recur annually and prior years' scripts are useful reference.
- Campaign assets never live in `promos\`. This separation is what keeps a donation drive from leaking into an ordinary Tuesday in March.

---

## 11. Generation and Review Workflow

**11.1 Horizon.** Daily hour files are generated up to **three days in advance**, so shows and segments can be previewed and content-reviewed before air.

**11.2 Review gate.** Admin users preview generated hours. Talk segments and Scripture of the Day carry the highest review priority, since they are the longest-form and most doctrinally weighted content. Sweepers and liners, once approved, rotate without per-instance review.

**11.3 Review by exception.** At 101 stations, previewing every generated hour stops being possible. Review load must scale with **new content**, not with airtime.

| Hour composition                    | Handling                                                           |
| ----------------------------------- | ------------------------------------------------------------------ |
| Entirely previously-approved assets | **Auto-approve.** Composition of approved parts is low risk. |
| Contains any new script             | Route to human review                                              |
| Contains a franchise episode        | Route to human review                                              |
| Contains Scripture of the Day       | Route to human review                                              |
| Flagged by content classifier       | Route to human review, highest priority                            |

Every asset carries an approval state and an approval timestamp. Once an asset is approved, it is approved everywhere it resolves through the cascade, so approving a liner once at ecosystem level clears it for every station that inherits it.

**11.4 Retirement.** Assets pulled from rotation move to `_archive\`, preserving their original filename and sequence number. Never reuse a retired sequence number.

**11.5 Templates.** `_templates\` holds the reusable scaffolding per element type: structure rules, length targets, opening and closing patterns, and prompt scaffolding for generation. A new station or persona starts by copying templates, not by starting from a blank folder.

---

## 12. Rendering and Efficiency Architecture

This section governs how scripts become audio. Its purpose is to keep GPU cost and authoring cost proportional to **new content** rather than to station count.

### 12.1 Composite rendering

Do not render whole assets. Render **fragments** and assemble at hour-file build time.

An opener is three beats (section 4.1), and only the middle beat changes:

| Fragment | Varies by       | Render frequency |
| -------- | --------------- | ---------------- |
| ID stub  | Station         | Once per station |
| Hook     | Hour or daypart | Per new hook     |
| Sign-off | Daypart         | Once per daypart |

This is how live radio has always worked: voice over bed, assembled at playout. It also means a station rebrand re-renders **one stub** rather than every opener in the tree.

Fragments live alongside their assets with a `_frag` suffix in the stem.

### 12.2 Render cache

Key every render on `hash(script_text) + voice_profile_id`.

If that pair has already been rendered, reference the existing file rather than re-rendering. With the cascade in section 3.2 in place, the same script is legitimately requested by many stations, so this is not an edge case, it is the normal path. GPU time then goes only to genuinely new content.

Cache entries are immutable. A script edit produces a new hash and therefore a new render, which also gives you free version history.

### 12.3 Voice rendering as a job class

TTS batch rendering belongs on the existing Jubilee inference API as a **low-priority job class**, not as an on-demand call at schedule time.

The three-day generation horizon (section 11.1) means no render is ever urgent. That is exactly the profile for filling idle GPU capacity overnight, behind interactive persona traffic. Queue depth is expected and acceptable.

### 12.4 Song ramp metadata

Talk-ups (section 4.6) require each song's intro ramp length, and back-announces benefit from outro ramp length.

**Capture ramp-in and ramp-out at album production time**, as part of the Jubilee music master standard. Captured at production it is free. Retrofitted across the existing catalog it means listening to every track individually.

Minimum metadata per track:

| Field           | Purpose                                                   |
| --------------- | --------------------------------------------------------- |
| `ramp_in_ms`  | Time from track start to vocal entry. Bounds the talk-up. |
| `ramp_out_ms` | Length of instrumental outro. Bounds the back-announce.   |
| `ends_cold`   | Boolean. A cold ending cannot be talked over.             |

This belongs in the album standard, not in the voice pipeline, and should be added to that standard now rather than later.

---

## 13. Build Order

A recommended sequence for standing this up on the flagship (HM308.70-EN) before rolling out across the band.

| Step | Deliverable                                      | Why first                                                                                                 |
| ---- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1    | `_lexicon.md`                                  | Everything rendered before this exists will need re-rendering.                                            |
| 2    | Ramp metadata in the album standard              | Free at production, expensive to retrofit. Add before the next album is cut.                              |
| 3    | Render cache and TTS job class                   | Put these in before volume, not after. Retrofitting a cache means re-hashing everything already rendered. |
| 4    | `_templates\` for all element types            | Every subsequent asset is generated from these.                                                           |
| 5    | Cascade resolution in the scheduler              | Must exist before authoring, or assets get written at station level by default and the saving is lost.    |
| 6    | Station identifiers and sweepers                 | Smallest assets, highest repetition, fastest to validate the pipeline end to end.                         |
| 7    | Openers, all five dayparts, composite-rendered   | Completes the top-of-hour requirement and proves fragment assembly.                                       |
| 8    | `_fallback\`                                   | Must exist before any unattended airing.                                                                  |
| 9    | Time checks and weather checks, city-neutral set | One set serves every city.                                                                                |
| 10   | Scripture of the Day (`_syndicated\`)          | First franchise, first syndication test.                                                                  |
| 11   | Talk segments, testimony family first            | Strongest content family, already has a source repository.                                                |
| 12   | Review-by-exception logic                        | Needed before the lineup grows past what one reviewer can preview.                                        |
| 13   | Promos, cross-station first                      | Discovery matters more as the lineup grows.                                                               |
| 14   | `campaigns\`                                   | Needed ahead of the first feast-anchored drive.                                                           |

---

## 14. Quick Reference

"Authored at" is the cascade level where the asset is written. Everything below that level inherits it.

| Element            | Length       | Per hour                  | Authored at                                   | Neutral |
| ------------------ | ------------ | ------------------------- | --------------------------------------------- | ------- |
| Opener             | 10 to 15 sec | 1 (at :00)                | Station                                       | No      |
| Station identifier | 5 to 10 sec  | 1 (at :00, fallback only) | Station                                       | No      |
| Sweeper            | 3 to 7 sec   | 3 to 5                    | Station                                       | No      |
| Promo              | 20 to 30 sec | 1 to 2                    | Ecosystem or block, station for cross-station | Varies  |
| Liner              | 2 to 4 sec   | As needed                 | Ecosystem                                     | Usually |
| Song intro         | Song ramp    | Sparingly                 | Ecosystem, keyed to song                      | Yes     |
| Song outro         | 10 to 30 sec | Per sweep                 | Ecosystem, keyed to song or set               | Yes     |
| Time check         | 2 to 4 sec   | 1 to 2                    | Ecosystem                                     | Yes     |
| Weather check      | 5 to 10 sec  | 0 to 1                    | Ecosystem                                     | Yes     |
| Talk segment       | 2 to 5 min   | 1                         | Ecosystem or block                            | Yes     |
| Scripture full     | ~2 min       | 1 per day                 | Ecosystem                                     | Yes     |
| Scripture variant  | 30 to 45 sec | 3 per day                 | Ecosystem                                     | Yes     |

**The four rules most likely to be broken, restated:**

1. Exactly one of opener or station identifier plays at the top of the hour. Never both.
2. Time and weather assets are stored city-neutral. The city is a scheduling concern, not a storage concern.
3. Author at the highest level where the asset is still true. A station folder holds overrides only.
4. Render fragments and cache by script hash. Never re-render a script that has already been voiced by the same profile.

# KJubilee Voice Asset Specification

**Version:** 1.1
**Applies to:** All KJubilee.com stations, all personas, all languages
**Scope:** Every voiced (non-music) element that airs on a KJubilee station, its folder location, its length, its frequency, and the rules governing how it is written and scheduled.

---

## 1. Purpose

KJubilee stations are assembled from two kinds of audio: music, and everything else. This document specifies "everything else."

Music is the product. Voice is what turns a playlist into a station. The goal of every element in this specification is to make a listener understand where they are, want to stay, and come back at a specific hour tomorrow.

---

## 2. Core Principles

These five rules govern every decision below. When a specific guideline conflicts with a principle, the principle wins.

**2.1 Talk is a tune-out risk.**
Every voiced moment is an opportunity for a listener to leave. Voice earns its place or it comes out. The default posture is fewer, better voiced moments rather than more.

**2.2 One element, one job.**
No two elements carry the same information in the same hour. An opener establishes the hour. A sweeper carries identity. A promo points forward. Overlap between them is the single most common failure mode in generated radio, and it is what makes a station feel robotic.

**2.3 Station-neutral by default, station-bound by exception.**
Most voiced content should be written so it can air anywhere. Only three categories are genuinely bound to a place or a station: station identifiers, time checks, and weather checks. Everything else should avoid naming a station, a city, or a clock position inside the script body, so it stays reusable.

**2.4 Repetition is the mechanism, not the failure.**
A set of five sweepers rotating all week outperforms fifty unique ones. Listeners learn a station through repetition. Variety of structure matters more than variety of wording.

**2.5 Concrete beats clever.**
Cleverness that names a real thing (an artist, a story, a listener's request) works. Cleverness with nothing attached ("great music ahead") is filler. When in doubt, be plain.

**2.6 Author at the level where the difference is real.**
Most voiced content does not actually differ between stations. Authoring a full asset set per station multiplies work that has no listener-facing payoff. Write each asset at the highest level in the hierarchy where it is still true, and let everything below inherit it. Only openers, station identifiers, and sweepers are genuinely station-bound.

---

## 3. Folder Architecture

### 3.1 Path convention

```
J:\kjubilee.com\voice\<STATION>-<LANG>\<persona>\
```

Where:

| Token       | Format                  | Example                |
| ----------- | ----------------------- | ---------------------- |
| `STATION` | `HM` + station number | `HM308.70`           |
| `LANG`    | ISO 639-1, uppercase    | `EN`, `RO`, `ES` |
| `persona` | lowercase, hyphenated   | `jubilee-inspire`    |

Full example: `J:\kjubilee.com\voice\HM308.70-EN\jubilee-inspire\`

### 3.2 Resolution cascade

Assets resolve through four levels. The scheduler requests an element and walks **up** the cascade until it finds one.

```
ecosystem  →  block  →  station  →  city
```

| Level     | Path                                                 | Holds                                                                                                           |
| --------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Ecosystem | `voice\_ecosystem\`                                | Liners, most talk segments, syndicated franchises, generic promos                                               |
| Block     | `voice\_blocks\<block-slug>\`                      | Content true of a whole five-fold block (The Crossing, The Nations, The Upper Room, The Living Room, The Table) |
| Station   | `voice\<STATION>-<LANG>\<persona>\`                | Openers, station identifiers, sweepers, station-specific promos                                                 |
| City      | `voice\<STATION>-<LANG>\<persona>\_cities\<IATA>\` | Only assets that name the city aloud                                                                            |

**Rules:**

- A station folder holds **only its overrides**. An empty element folder at station level is correct and expected; it means the station is content with what it inherits.
- Resolution is per element, not per folder. A station can override three sweepers and inherit everything else.
- At full band this is the difference between authoring roughly 101 complete asset sets and authoring one, plus a small override set per station.

### 3.3 Station-scoped tree

Everything below lives under a single station-persona path. Any element folder may be empty, in which case the cascade supplies it.

```
J:\kjubilee.com\voice\HM308.70-EN\jubilee-inspire\
    _lexicon.md
    _templates\
        openers\
        sweepers\
        promos\
        liners\
        song-intros\
        song-outros\
        talk-segments\
    _archive\
        openers\
        sweepers\
        promos\
        liners\
        song-intros\
        song-outros\
        talk-segments\
    _fallback\
    campaigns\
        <campaign-slug>\
    liners\
    openers\
    promos\
    song-intros\
    song-outros\
    station-identifiers\
    sweepers\
    talk-segments\
        franchises\
        interactions\
        teachings\
        testimonies\
    time-checks\
    weather-checks\
    _cities\
        <IATA>\
            time-checks\
            weather-checks\
```

**On `time-checks\` and `weather-checks\`:** these hold **city-neutral** assets, which is the large majority of them. See section 4.8. The `_cities\` subtree holds only the minority of assets that name a city aloud.

### 3.4 Ecosystem-scoped tree

Content produced once and aired across multiple stations does not belong under a station folder. It sits above them, prefixed with an underscore so it sorts to the top of the directory listing and is never mistaken for a station.

```
J:\kjubilee.com\voice\_syndicated\
    scripture-of-the-day\
        2026-08-27\
            full\
            variants\
    _templates\
    _archive\
```

### 3.5 Naming rules

- Element folders are **plural**: `openers`, `sweepers`, `testimonies`, `franchises`.
- Support folders are **underscore-prefixed**: `_templates`, `_archive`, `_fallback`, `_lexicon.md`, `_syndicated`.
- Slugs are lowercase and hyphenated: `jubilee-inspire`, `scripture-of-the-day`.
- Dated folders use ISO format: `2026-08-27`.

### 3.6 Asset file naming

Every voiced asset is a **pair**: a script and a rendered audio file sharing a stem.

```
<element>_<daypart-or-variant>_<nnn>.md      the script
<element>_<daypart-or-variant>_<nnn>.wav     the render
```

Examples:

```
opener_morning_004.md
opener_morning_004.wav
sweeper_identity_002.wav
timecheck_LAX_halfhour_001.wav
```

Sequence numbers are zero-padded to three digits. Never reuse a retired number; move retired assets to `_archive\` intact.

---

## 4. Element Catalog

### 4.1 Openers

**Definition:** The top-of-hour piece. Establishes the station and sets up the hour ahead.

| Property        | Value                                |
| --------------- | ------------------------------------ |
| Length          | 10 to 15 seconds, 20 at the outside  |
| Frequency       | Once per hour, at :00                |
| Scope           | Written per station, not per persona |
| Station-neutral | No, carries the station identity     |

**Structure (three beats):**

1. **Where you are.** Station name and daypart. This is where the station ID is merged in.
2. **What's coming.** One specific hook. Not a list. Name one actual thing.
3. **Reason to stay.** Often just warmth or energy rather than information.

**Rules:**

- The opener carries the station ID inside it. This is the default top-of-hour element.
- Exactly one of `opener` or `station-identifier` plays at :00. **Never both.** This rule is what makes redundancy structurally impossible.
- Openers must convey daypart. A morning commute opener and a late night opener are different assets.
- Openers should be reusable across a day within their daypart, so write the hook at a level that survives repetition.
- No throat-clearing between the ID and the hook. One breath.

**Daypart set:**

| Daypart       | Hours (local station time) |
| ------------- | -------------------------- |
| `morning`   | 06:00 to 10:00             |
| `midday`    | 10:00 to 15:00             |
| `afternoon` | 15:00 to 19:00             |
| `evening`   | 19:00 to 23:00             |
| `overnight` | 23:00 to 06:00             |

---

### 4.2 Station Identifiers

**Definition:** Station identity alone, with no programming information.

| Property        | Value                                         |
| --------------- | --------------------------------------------- |
| Length          | 5 to 10 seconds                               |
| Frequency       | Top of hour, only when no opener is scheduled |
| Scope           | Per station                                   |
| Station-neutral | No                                            |

**Rules:**

- This is the **fallback** for the top of the hour, not the default. Use it for continuous music hours, overnight blocks, or any hour where a host talking would be wrong.
- Carries station identity and nothing else. No daypart, no programming, no forward-pointing.
- A produced, musically consistent identifier (the same bed and treatment every time) is the right choice here, since its whole job is branding through repetition.

---

### 4.3 Sweepers

**Definition:** Short produced pieces that transition between songs and carry the brand back to the station identity.

| Property        | Value                     |
| --------------- | ------------------------- |
| Length          | 3 to 7 seconds            |
| Frequency       | 3 to 5 per hour           |
| Scope           | Per station               |
| Station-neutral | No, includes station name |

**Rules:**

- **One idea plus the station name.** Never two ideas. A sweeper that tries to say two things says neither.
- Build a rotating set of roughly five per station and let repetition do the work.
- Sweepers are produced: bed, treatment, polish. This is what distinguishes them from liners.

**Examples of the range:**

- Plain: "Christian music, all day. KJubilee three oh eight seven."
- Warm: "You're not alone tonight. This is KJubilee."
- Punchy: "More music, less talk. KJubilee."
- Ecosystem: "From Folsom to the nations. KJubilee three oh eight seven."

---

### 4.4 Promos

**Definition:** A short spot pointing at something specific that happens later.

| Property        | Value                                                 |
| --------------- | ----------------------------------------------------- |
| Length          | 20 to 30 seconds                                      |
| Frequency       | 1 to 2 per hour, in place of other talk-break content |
| Scope           | Per station, though many are reusable                 |
| Station-neutral | Varies                                                |

**Rules:**

- A promo must have a **specific thing attached**: a date, a destination, a named show, a station number. If there is nothing specific, it is a sweeper, not a promo.
- Promos are the only forward-looking element. They are how listeners carry across dayparts rather than just across songs.

**Approved promo categories:**

| Category           | What it points to                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-station      | Another station on the band. This is the primary answer to discovery across a large lineup.                                               |
| Site destination   | A specific page on KJubilee.com: the full station lineup, prayer request submission, host backstories. Not a general "visit our website." |
| New release        | A new album or single. All music is Jubilee-owned, so a release is genuine station news.                                                  |
| Appointment moment | Anything happening at a fixed hour. The promo is what builds the appointment.                                                             |
| Awards             | The Jubilee Crown Awards. Date-bound, lives in`campaigns\`.                                                                             |
| Donation drive     | The two feast-anchored drives (spring at Shavuot, fall at Sukkot). Date-bound, lives in`campaigns\`.                                    |

---

### 4.5 Liners

**Definition:** The thinnest voiced element. One spoken line, dry or over a music bed, with no production.

| Property        | Value                                           |
| --------------- | ----------------------------------------------- |
| Length          | 2 to 4 seconds                                  |
| Frequency       | As needed for texture                           |
| Scope           | Per persona, largely station-neutral            |
| Station-neutral | Usually, often does not name the station at all |

**Rules:**

- Liners exist for **texture**. If every voiced moment is a polished sweeper, the station sounds like an advertisement for itself. Liners make it sound like someone is actually there.
- No production treatment. That is the defining difference from a sweeper.
- Often does not name the station, which is what keeps it from competing with sweepers.

**Examples:** "Keep it right here." / "That was Ricky Del Rey." / "More in a moment."

---

### 4.6 Song Intros (Talk-ups)

**Definition:** The host speaking over a song's opening instrumental, landing just before the vocal enters.

| Property        | Value                                           |
| --------------- | ----------------------------------------------- |
| Length          | Bounded by the song's intro ramp                |
| Frequency       | Sparingly, see the sweep structure in section 5 |
| Scope           | Keyed to a song                                 |
| Station-neutral | Yes, should be                                  |

**Rules:**

- Land before the vocal. This is a hard timing constraint and requires the ramp length as metadata on the song.
- Do not intro an entire set in detail. Listeners do not retain three titles announced in advance. The front of a sweep is short; the back does the identifying work.

---

### 4.7 Song Outros (Back-announce)

**Definition:** Naming what just played.

| Property        | Value                      |
| --------------- | -------------------------- |
| Length          | 10 to 30 seconds for a set |
| Frequency       | After each music sweep     |
| Scope           | Keyed to a song or a set   |
| Station-neutral | Yes, should be             |

**Rules:**

- Back-announcing is the **discovery engine**. A listener who cannot find out what they just heard never becomes a fan of that artist. Since all music is Jubilee-owned, every back-announce builds your own catalog.
- Back-announce the whole set at once rather than each song individually.
- **Artist-DJ rule:** When a persona back-announces her own music, she speaks in **first person**. "That was mine." "I wrote that one back when..." Third person about yourself sounds either pompous or robotic and breaks the intimacy that makes a host work.
- **Artist-DJ story rule:** A persona back-announcing her own song should give the story behind it rather than a catalog credit. That is the payoff of having the artist in the chair.
- **Self-promotion ratio:** A persona back-announces her own music **less often** than other artists' music. Target no more than one in three self-references, or the station starts sounding self-promotional.

---

### 4.8 Time Checks

**Definition:** A spoken clock reference.

| Property        | Value                                               |
| --------------- | --------------------------------------------------- |
| Length          | 2 to 4 seconds                                      |
| Frequency       | 1 to 2 per hour                                     |
| Scope           | **City-neutral asset, city-aware scheduling** |
| Station-neutral | Yes                                                 |

**Rules:**

- **Store city-neutral, schedule city-aware.** "Just past the half hour" is identical in Sacramento and Bucharest. The city is a **scheduling** concern, not a storage concern: one set of assets, fired at the right local moment per city. This turns N cities multiplied by N phrases into simply N phrases.
- Only assets that **name a city aloud** go under `_cities\<IATA>\`. Keep these to a minimum.
- **Stay vague on purpose.** "Just past the half hour." "Coming up on nine." Vague phrasing survives a few seconds of clock drift; precise phrasing does not. Vague phrasing is also what makes city-neutral storage possible, so these two rules reinforce each other rather than competing.
- Scheduling is straightforward: because hour files are generated in advance and the browser handles clock sync, every voiced element sits at a known offset inside a known hour. You are scheduling into a clock, not reacting to one.

---

### 4.9 Weather Checks

**Definition:** A short spoken weather reference.

| Property        | Value                                                |
| --------------- | ---------------------------------------------------- |
| Length          | 5 to 10 seconds                                      |
| Frequency       | 0 to 1 per hour                                      |
| Scope           | **Mostly city-neutral, city-aware scheduling** |
| Station-neutral | Yes                                                  |

**Rules:**

- Same principle as time checks. "Clear skies where you are" works everywhere. Write to the condition, not to the place, and one bucket set serves every city.
- Handled by pre-creating a small set of condition buckets and selecting whichever matches actual conditions at schedule-generation time. The condition lookup is per city; the **asset** is not.
- Only assets naming a city aloud go under `_cities\<IATA>\`.
- Weather is the harder of the two clock-and-condition elements, because it is genuinely external and can go stale between generation and airtime. Keep buckets broad enough to stay true across a few hours.
- Suggested bucket set per city: clear, cloudy, rain, storm, snow, hot, cold, windy.

---

### 4.10 Talk Segments

**Definition:** Self-contained hosted content with a beginning and an end. This is the tier where a station stops being a playlist.

| Property        | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| Length          | 2 to 5 minutes                                                     |
| Frequency       | 1 substantial segment per hour, typically at the second talk break |
| Scope           | Per station, then per persona                                      |
| Station-neutral | Yes, should be                                                     |

**The four families:**

| Family      | Folder            | What it is                                                                                               |
| ----------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Testimony   | `testimonies\`  | Story and testimony content. The strongest family, fed by the existing testimony repository.             |
| Teaching    | `teachings\`    | Single-point teaching, short form. The engine for the Bible Teachings block.                             |
| Interaction | `interactions\` | Listener submissions, prayer requests read on air, feedback loop content. Drives the Prayer Rooms block. |
| Franchise   | `franchises\`   | Named recurring segments returning at a fixed slot. This is what creates appointment listening.          |

**Franchise sub-structure:**

A franchise has a stable identity and accumulating episodes. Keep them separate:

```
franchises\
    <franchise-slug>\
        _definition.md
        2026-08-27_001.md
        2026-08-27_001.wav
```

`_definition.md` holds the franchise identity: its name, its slot, its host or host rotation, its structure, its length target, and its opening and closing patterns. Episodes accumulate alongside it without touching the definition.

**Rules:**

- Talk segments should be station-neutral in the script body so they can be reused or syndicated later.
- Organize type-first, then station, then persona. Generation logic and review rules differ by **family**, not by station, so the scaffolding lives at the family level and stations inherit it.

---

## 5. The Hour Clock

### 5.1 The music sweep

A **sweep** (also called a segue set) is 3 to 5 songs run back to back with no talk between them, followed by a back-announce of the whole set.

This is the structure that makes principle 2.1 operational. Talk is clustered rather than scattered, which gives long uninterrupted music runs and fewer tune-out points.

### 5.2 Reference hour for a music station

| Position | Element                                            | Approx. duration |
| -------- | -------------------------------------------------- | ---------------- |
| :00      | Opener (ID merged in)                              | 10 to 15 sec     |
| :00      | **Sweep 1** (4 songs)                        | ~14 min          |
| :15      | Back-announce + sweeper                            | ~30 sec          |
| :15      | **Sweep 2** (4 songs)                        | ~14 min          |
| :30      | **Talk break:** back-announce + talk segment | ~2 to 3 min      |
| :33      | **Sweep 3** (4 songs)                        | ~14 min          |
| :47      | Liner + time check                                 | ~10 sec          |
| :47      | **Sweep 4** (3 to 4 songs)                   | ~12 min          |
| :59      | Closing sweeper into next opener                   | ~5 sec           |

**Totals:** roughly 15 songs and only about 4 voiced moments in 60 minutes.

If the count of voiced elements per hour is climbing well past this, the station is drifting toward talk radio. Cut back to the clock.

---

## 6. Scripture of the Day

### 6.1 What it is

A daily franchise segment built on a single verse. It is the ecosystem's shared heartbeat: everyone across every station hearing the same verse the same day.

### 6.2 Daily asset set

Four pieces per day:

| Piece           | Length       | Airs                                      |
| --------------- | ------------ | ----------------------------------------- |
| Full reflection | ~2 minutes   | Once per station, at the appointment slot |
| Variant A       | 30 to 45 sec | Mid-morning talk break                    |
| Variant B       | 30 to 45 sec | Mid-afternoon talk break                  |
| Variant C       | 30 to 45 sec | Evening talk break                        |

Variants address the same verse from a **different angle**, not a condensed version of the full piece. A listener across a full day hears the verse three or four times, once in depth and the rest as brief echoes, and never the same script twice.

**Do not exceed four pieces per day.** Beyond that you dilute rather than reinforce, and the verse stops feeling like the day's anchor.

### 6.3 Content rules

- **One point.** Two minutes disappears fast. A teaching segment that tries to cover ground becomes a sermon that got cut off.
- Written for the ear, not the page. Short sentences.

### 6.4 Placement

- The full piece airs at a **fixed appointment slot**, the same time every day per station. Morning drive (for example, 07:20, at the second talk break) is the recommended default.
- Variants drop into other talk breaks in place of a promo. At 30 to 45 seconds they do not disturb the sweep structure.

---

## 7. Syndication Rules

Syndication means one piece produced once, airing across multiple stations. Scripture of the Day is the first syndicated franchise; others will follow.

**7.1 Host rotation is a feature.**
Different personas read on different days. A listener on one station gets introduced to personas from elsewhere, which turns the cross-station discovery problem into content rather than a promo.

**7.2 Syndicated content must be station-neutral.**
No station name, no station number, no daypart reference, no city reference **inside the segment body**. Any of these breaks the piece the moment it airs elsewhere.

**7.3 Stagger clock positions across stations.**
The same syndicated piece must air at **different clock positions** on different stations, so a listener flipping between two stations does not collide with the same content twice.

**7.4 Syndicated content lives outside station folders.**
See section 3.3. It belongs in `_syndicated\`, never under a station path.

---

## 8. Pronunciation Lexicon

**File:** `<persona>\_lexicon.md`

A per-persona pronunciation map consumed by the voice pipeline. Build this **before** generating production audio. Retrofitting it after three days of hour files have been rendered with the station name mispronounced is expensive and avoidable.

**Required entries:**

| Category        | Example                     | Required rendering                                                 |
| --------------- | --------------------------- | ------------------------------------------------------------------ |
| Station numbers | `308.70`                  | "three oh eight seven", not "three hundred eight point seven zero" |
| Band prefix     | `HM`                      | as specified per language                                          |
| IATA codes      | `OTP`                     | city name, not letters, in listener-facing copy                    |
| Hebrew terms    | per active theological mode | as specified in the persona's voicing profile                      |
| Artist names    | `Ricky Del Rey`           | as specified                                                       |
| Site domain     | `KJubilee.com`            | "K Jubilee dot com"                                                |

Each entry pairs the written form with an explicit phonetic target. Where the pipeline supports it, use SSML phoneme tags rather than respelling.

---

## 9. Fallback Set

**Folder:** `_fallback\`

A small library of always-safe, always-valid elements the scheduler can reach for when generation fails, when an hour file comes up short, or when a scheduled asset is missing at assembly time.

**Requirements for a fallback asset:**

- **Dateless.** No reference to a day, season, feast, or campaign.
- **Station-neutral where possible**, or explicitly duplicated per station.
- **Evergreen.** Nothing that expires.
- **Reviewed and approved.** These air unattended, so they carry a higher review bar than ordinary assets.

Recommended minimum: one opener per daypart, three sweepers, two liners, one generic back-announce, and one two-minute talk segment.

This folder is what keeps a generation failure from producing dead air.

---

## 10. Campaigns

**Folder:** `campaigns\<campaign-slug>\`

Date-bound material that must **expire out of rotation** rather than sit in `promos\` indefinitely.

| Campaign              | Anchor                                     |
| --------------------- | ------------------------------------------ |
| Spring donation drive | Shavuot (firstfruits), calculated per year |
| Fall donation drive   | Sukkot (ingathering), calculated per year  |
| Jubilee Crown Awards  | Per awards calendar                        |

**Rules:**

- Every campaign folder carries a `_window.md` declaring its start and end dates. The scheduler reads this and will not place campaign assets outside the window.
- On window close, move the campaign folder to `_archive\`. Do not delete: feast-anchored campaigns recur annually and prior years' scripts are useful reference.
- Campaign assets never live in `promos\`. This separation is what keeps a donation drive from leaking into an ordinary Tuesday in March.

---

## 11. Generation and Review Workflow

**11.1 Horizon.** Daily hour files are generated up to **three days in advance**, so shows and segments can be previewed and content-reviewed before air.

**11.2 Review gate.** Admin users preview generated hours. Talk segments and Scripture of the Day carry the highest review priority, since they are the longest-form and most doctrinally weighted content. Sweepers and liners, once approved, rotate without per-instance review.

**11.3 Review by exception.** At 101 stations, previewing every generated hour stops being possible. Review load must scale with **new content**, not with airtime.

| Hour composition                    | Handling                                                           |
| ----------------------------------- | ------------------------------------------------------------------ |
| Entirely previously-approved assets | **Auto-approve.** Composition of approved parts is low risk. |
| Contains any new script             | Route to human review                                              |
| Contains a franchise episode        | Route to human review                                              |
| Contains Scripture of the Day       | Route to human review                                              |
| Flagged by content classifier       | Route to human review, highest priority                            |

Every asset carries an approval state and an approval timestamp. Once an asset is approved, it is approved everywhere it resolves through the cascade, so approving a liner once at ecosystem level clears it for every station that inherits it.

**11.4 Retirement.** Assets pulled from rotation move to `_archive\`, preserving their original filename and sequence number. Never reuse a retired sequence number.

**11.5 Templates.** `_templates\` holds the reusable scaffolding per element type: structure rules, length targets, opening and closing patterns, and prompt scaffolding for generation. A new station or persona starts by copying templates, not by starting from a blank folder.

---

## 12. Rendering and Efficiency Architecture

This section governs how scripts become audio. Its purpose is to keep GPU cost and authoring cost proportional to **new content** rather than to station count.

### 12.1 Composite rendering

Do not render whole assets. Render **fragments** and assemble at hour-file build time.

An opener is three beats (section 4.1), and only the middle beat changes:

| Fragment | Varies by       | Render frequency |
| -------- | --------------- | ---------------- |
| ID stub  | Station         | Once per station |
| Hook     | Hour or daypart | Per new hook     |
| Sign-off | Daypart         | Once per daypart |

This is how live radio has always worked: voice over bed, assembled at playout. It also means a station rebrand re-renders **one stub** rather than every opener in the tree.

Fragments live alongside their assets with a `_frag` suffix in the stem.

### 12.2 Render cache

Key every render on `hash(script_text) + voice_profile_id`.

If that pair has already been rendered, reference the existing file rather than re-rendering. With the cascade in section 3.2 in place, the same script is legitimately requested by many stations, so this is not an edge case, it is the normal path. GPU time then goes only to genuinely new content.

Cache entries are immutable. A script edit produces a new hash and therefore a new render, which also gives you free version history.

### 12.3 Voice rendering as a job class

TTS batch rendering belongs on the existing Jubilee inference API as a **low-priority job class**, not as an on-demand call at schedule time.

The three-day generation horizon (section 11.1) means no render is ever urgent. That is exactly the profile for filling idle GPU capacity overnight, behind interactive persona traffic. Queue depth is expected and acceptable.

### 12.4 Song ramp metadata

Talk-ups (section 4.6) require each song's intro ramp length, and back-announces benefit from outro ramp length.

**Capture ramp-in and ramp-out at album production time**, as part of the Jubilee music master standard. Captured at production it is free. Retrofitted across the existing catalog it means listening to every track individually.

Minimum metadata per track:

| Field           | Purpose                                                   |
| --------------- | --------------------------------------------------------- |
| `ramp_in_ms`  | Time from track start to vocal entry. Bounds the talk-up. |
| `ramp_out_ms` | Length of instrumental outro. Bounds the back-announce.   |
| `ends_cold`   | Boolean. A cold ending cannot be talked over.             |

This belongs in the album standard, not in the voice pipeline, and should be added to that standard now rather than later.

---

## 13. Build Order

A recommended sequence for standing this up on the flagship (HM308.70-EN) before rolling out across the band.

| Step | Deliverable                                      | Why first                                                                                                 |
| ---- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1    | `_lexicon.md`                                  | Everything rendered before this exists will need re-rendering.                                            |
| 2    | Ramp metadata in the album standard              | Free at production, expensive to retrofit. Add before the next album is cut.                              |
| 3    | Render cache and TTS job class                   | Put these in before volume, not after. Retrofitting a cache means re-hashing everything already rendered. |
| 4    | `_templates\` for all element types            | Every subsequent asset is generated from these.                                                           |
| 5    | Cascade resolution in the scheduler              | Must exist before authoring, or assets get written at station level by default and the saving is lost.    |
| 6    | Station identifiers and sweepers                 | Smallest assets, highest repetition, fastest to validate the pipeline end to end.                         |
| 7    | Openers, all five dayparts, composite-rendered   | Completes the top-of-hour requirement and proves fragment assembly.                                       |
| 8    | `_fallback\`                                   | Must exist before any unattended airing.                                                                  |
| 9    | Time checks and weather checks, city-neutral set | One set serves every city.                                                                                |
| 10   | Scripture of the Day (`_syndicated\`)          | First franchise, first syndication test.                                                                  |
| 11   | Talk segments, testimony family first            | Strongest content family, already has a source repository.                                                |
| 12   | Review-by-exception logic                        | Needed before the lineup grows past what one reviewer can preview.                                        |
| 13   | Promos, cross-station first                      | Discovery matters more as the lineup grows.                                                               |
| 14   | `campaigns\`                                   | Needed ahead of the first feast-anchored drive.                                                           |

---

## 14. Quick Reference

"Authored at" is the cascade level where the asset is written. Everything below that level inherits it.

| Element            | Length       | Per hour                  | Authored at                                   | Neutral |
| ------------------ | ------------ | ------------------------- | --------------------------------------------- | ------- |
| Opener             | 10 to 15 sec | 1 (at :00)                | Station                                       | No      |
| Station identifier | 5 to 10 sec  | 1 (at :00, fallback only) | Station                                       | No      |
| Sweeper            | 3 to 7 sec   | 3 to 5                    | Station                                       | No      |
| Promo              | 20 to 30 sec | 1 to 2                    | Ecosystem or block, station for cross-station | Varies  |
| Liner              | 2 to 4 sec   | As needed                 | Ecosystem                                     | Usually |
| Song intro         | Song ramp    | Sparingly                 | Ecosystem, keyed to song                      | Yes     |
| Song outro         | 10 to 30 sec | Per sweep                 | Ecosystem, keyed to song or set               | Yes     |
| Time check         | 2 to 4 sec   | 1 to 2                    | Ecosystem                                     | Yes     |
| Weather check      | 5 to 10 sec  | 0 to 1                    | Ecosystem                                     | Yes     |
| Talk segment       | 2 to 5 min   | 1                         | Ecosystem or block                            | Yes     |
| Scripture full     | ~2 min       | 1 per day                 | Ecosystem                                     | Yes     |
| Scripture variant  | 30 to 45 sec | 3 per day                 | Ecosystem                                     | Yes     |

**The four rules most likely to be broken, restated:**

1. Exactly one of opener or station identifier plays at the top of the hour. Never both.
2. Time and weather assets are stored city-neutral. The city is a scheduling concern, not a storage concern.
3. Author at the highest level where the asset is still true. A station folder holds overrides only.
4. Render fragments and cache by script hash. Never re-render a script that has already been voiced by the same profile.
