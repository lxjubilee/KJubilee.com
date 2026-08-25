# KJubilee Station Guidelines and Launch Gate

**Platform:** KJubilee.com (Jubilee Radio Engine v3.0, Ubuntu 24.04)
**Delivery:** Client-side streaming from a published daily programming file — see section 2.5. Icecast-KH + Liquidsoap are retained for genuinely live sources only.
**Scope:** Applies to every HM-band station (300.00 through 399.90)
**Status:** Working specification, derived from the K-LOVE format analysis session
**Owner:** Gabriel Ungureanu

---

## 0. Source Confidence Notice

This document mixes three kinds of material, and they are labeled throughout:

- **Verified.** Confirmed against a published source, with the source named.
- **Standard practice.** Long-established radio programming convention. Not published by any one network, but well attested across the industry.
- **KJubilee decision.** A choice made for this platform. Ours to change.

Nothing in this document is invented to fill a gap. Where a figure was not available, it says so.

---

## 1. Governing Philosophy

### 1.1 The format clock, not the block schedule

Christian talk radio uses **block programming**: a named teaching program at 8:30, another at 9:00, and the schedule is the product. Music networks use a **format clock**: the hour is the repeating unit, and the clock is the product.

*Verified (Radio Ink, 28 April 2025; RadioInsight, 2022):* K-LOVE runs a format clock, not blocks. What changes across the week is the voice and the temperature, not the content type.

**KJubilee decision:** Adopt the format clock as the base structure, because it protects the listener who tunes in at a random second. Layer teaching weight into the break content rather than into scheduled blocks.

### 1.2 One clock, many temperatures

The same hourly skeleton runs everywhere. Three things vary by daypart:

1. **Talk-to-music ratio.** Mornings carry the heaviest talk load. Overnights are nearly all music with short quiet breaks.
2. **Tone.** Mornings bright and energetic. Evenings and overnights reflective and prayer-leaning.
3. **The host voice.**

Music selection carries more of the mood change than host talk does. *Standard practice:* uptempo material weights toward morning and afternoon drive, ballads and worship toward late evening and overnight. Same library, different sequencing. The station exhales.

### 1.3 Format coherence over catalog size

*Verified:* EMF runs Air1 as a separate network for harder, rock-leaning worship material that would break the K-LOVE clock. Genre diversity lives in the ecosystem, never inside one signal.

**KJubilee decision:** Split anything that does not fit onto a different band entirely. With 101 bands available there is room to be strict.

The real variable is **emotional register and production texture**, not genre label. Two artists both filed as contemporary Christian may not belong together if one is polished radio pop and the other is raw spontaneous long-form worship. Conversely, two personas with different labels may belong together if they share intensity and function.

**The drop-in test:** could a listener land at any random moment in the hour and not be jolted? If yes, same station. If no, split.

### 1.4 What KJubilee does that a commercial CCM clock cannot

K-LOVE deliberately omits sermons, teaching blocks, news, politics, denominational distinctives, and doctrinal argument. That is engineered, not accidental: any listener at any second lands in the same emotional register. The strength is consistency and reach. The cost is depth. It cannot disciple anyone, and does not claim to.

That gap is the opening. Persona hosting plus sacred-calendar programming can carry teaching weight a bare format clock structurally cannot. Do not surrender that advantage in the name of smoothness.

---

## 2. Playlist Architecture

### 2.1 Two item types

The entire engine reduces to two item types:

| Type            | Source                   |
| --------------- | ------------------------ |
| **Song**  | The rotation             |
| **Break** | The generated break pool |

Liquidsoap does not need to know what a break contains. It needs the duration and the placement.

A break can be any of: station ID, sweeper, anchor passage read, host topic talk, testimony, invitation, ministry mention, prayer, donation mention. From the engine's point of view they are the same thing: an audio file that is not a song.

The clock says `song, song, break, song, song, song, break`. The break slot is filled by whatever the pool and the daypart rules select. **Change the fill, change the station's personality, without ever touching the structure.**

### 2.2 Break rendering: per break, never per hour

**KJubilee decision:** Each break is pre-rendered as a single audio file with the music bed already mixed underneath the voice.

- The pre-render unit is the **individual break**. A forty-second break becomes one forty-second file.
- **Never render a whole hour as one file.** That locks the hour: no swapping a song, no fixing one bad break, no reacting to anything, and one flaw means re-rendering sixty minutes.
- Liquidsoap plays songs and breaks as separate playlist items. The hour stays fully modular.

**Why server-side and pre-rendered:**

- Liquidsoap provides real **ducking**, where the bed drops automatically when the voice enters and rises when it stops.
- Every listener hears an identical mix.
- Browser-side **mixing** would require the Web Audio API rather than two audio elements, would sound different on every machine, and would consume listener CPU. Rejected. Note that this rejects mixing in the browser, not *delivery* from the browser: section 2.5 moves sequencing and delivery client-side while breaks stay pre-rendered here. See 2.5.7.
- Pre-rendering means the break is reviewed exactly as it will sound on air.

### 2.3 Beds

*Standard practice:* almost every host break rides a bed, running low under the voice, often the intro of the next song so the break resolves into it. Reflective breaks get a soft pad. Energetic breaks ride something with more motion. A dry voice with no bed sounds like a voicemail.

### 2.4 Three-day generation window

**KJubilee decision:** Generate daily hour files for every hour up to **three days in advance**, so shows and segments can be previewed and content-reviewed before air. Anyone with admin rights can preview.

Content review happens **before** air, not after.

This window governs the **standing lane** only. A second short-horizon lane, regenerating within the hour, is specified in section 12.2. The two lanes coexist: the standing lane carries reviewed depth, the short-horizon lane carries presence.

---

### 2.5 Delivery: client-side streaming

**KJubilee decision, and the most consequential one in this document.** Stations are delivered by publishing a **daily programming file** that the listener's own player resolves against the clock. They are not delivered by streaming audio from our server.

This is not a cost optimisation. It removes the ceiling on how many people can listen at once.

#### 2.5.1 What was wrong with server-side streaming

A server-side stream costs the origin the full bitrate **for every listener, continuously**. At the 192 kbps of section 3.3:

| Origin port | Concurrent listeners at 192 kbps | 
| ----------- | -------------------------------- |
| 600 Mbit/s  | ~2,180 |
| 800 Mbit/s  | ~2,910 |
| 1 Gbit/s    | ~3,640 |

Those are hard ceilings, and they arrive before any "unlimited traffic" fair-use allowance does: a single always-on listener at 192 kbps consumes roughly **63 GB a month**.

The failure is not theoretical. Measured on the Romanian mount while it was served by Icecast, delivery ran at **87% of real time** — 18,022 B/s sustained against the 24,000 B/s the bitrate requires. Icecast's burst-on-connect handed the player about 109 KB up front, which masked it for roughly a minute; after that the buffer drained and playback stalled. The listener hears that as choppiness.

The cause was CPU starvation on a shared box: load average 11 on 6 vCPU, with Liquidsoap alone at 171% and ten mounts encoding at once. **Liquidsoap is a real-time encoder. Starve it of CPU and it cannot produce audio at 1×**, so the mount underruns and every listener on it suffers together.

That is the structural problem with server-side streaming: the server is in the path of every second of audio for every listener, so its worst moment is everyone's worst moment.

#### 2.5.2 What replaces it

One file per station per broadcast day, published in advance:

```
https://cdn.kjubilee.com/radio/HM332.16-RO/delivery/HM332.16RO-20260822.json
```

It contains the day's programming as a list of entries — seconds from the start of the day, duration, CDN path, title, artist, album. The player reads the clock, finds the entry that covers this second, seeks into it, and plays. The audio itself is fetched from the CDN, never from the origin.

| | Server-side stream | Daily file |
| --- | --- | --- |
| Origin cost per listener | 192 kbps, continuously | ~85 KB once a day (**~2 bps averaged**) |
| Concurrent listener ceiling | ~2,180 on a 600 Mbit port | no practical ceiling |
| Who pays for the audio | the origin | the CDN, at zero egress on R2 |
| One listener's bad minute | everyone's bad minute | that listener's alone |

The origin serves roughly **one 85 KB file per listener per day** and nothing else. The listener ceiling stops being an infrastructure question.

#### 2.5.3 It is still a broadcast

The obvious objection is that this is a playlist, and a playlist is not a station. The daily file answers it: **the programming is decided in advance and is identical for everyone**. Two listeners who tune in at the same second hear the same song at the same offset, exactly as they would on a transmitter.

That preserves everything the format clock depends on:

- **now-playing**, computed rather than polled
- **the schedule guide** — the next twelve tracks are simply the next twelve entries
- **section 6.3 anchor passages**, landing on the whole audience at once
- **section 5.1 top-of-hour ID**, in its slot
- **section 12.7 sundown**, changing for everyone the moment the day changes
- **section 12.6 appointment moments**, which require a shared clock to exist at all

A per-listener shuffled playlist gives none of these. The daily file gives all of them without a broadcast server.

#### 2.5.4 The four things that make it hold

These are implementation requirements, not suggestions. Each one is load-bearing.

1. **Never trust the device clock.** Device clocks drift by minutes and are sometimes flatly wrong. The player takes the server's `Date` header from the day-file response as authoritative and applies the offset to every subsequent calculation. Without this a listener with a fast clock is in the wrong song entirely.

2. **Re-derive position, never advance it.** There is no "play the next track" path. At every track boundary, and on a periodic tick, the player recomputes what should be sounding from the clock. Error therefore cannot accumulate across a long session, and a backgrounded tab rejoins the live position instead of resuming where it fell asleep.

3. **Preload the next track.** A gap at a boundary reads instantly as "playlist" rather than "station". The following entry is fetched before the current one ends.

4. **Ask for a missing day.** If the file 404s, the player reports it rather than failing silently. The generation job runs days ahead, so a missing file means that job has been failing long enough to burn the buffer — and the browser is the first thing to notice.

#### 2.5.5 Broadcast days are local, and not always 24 hours

The day file runs **midnight to midnight in the station's own zone**, not UTC. The dial broadcasts on `America/Los_Angeles`.

A local day is 23 hours the morning the clocks go forward and 25 the morning they go back. A generator assuming 86,400 seconds leaves an hour of silence one morning a year and drops an hour of programming on another.

Rather than have every client re-derive the timezone rules and risk disagreeing with the schedule, **the file states its own boundaries**: the UTC instant the day begins and the number of seconds it runs. The player subtracts and has the second-of-day directly. It carries no timezone code at all.

#### 2.5.6 What still needs a server-side stream

Client-side delivery cannot carry a **genuinely live source** — a live show, a call-in, an unscheduled override. Anything that must reach the audience before it could have been published is a stream, and stays a stream.

Everything that is scheduled programming — which today is all of it — moves to the daily file. Keep server-side streaming for live sources only, and retire the mounts that are merely re-encoding files the CDN already holds. A mount pulling a 192 kbps track from the CDN, decoding it, and re-emitting it at 192 kbps to listeners who could have fetched that same file directly is spending a CPU core to add nothing but a shared clock — and section 2.5.3 supplies the shared clock for free.

#### 2.5.7 This does not change section 2.2

Section 2.2 rejects browser-side mixing and that rejection stands. **Breaks remain pre-rendered server-side with their beds already mixed in**, for exactly the reasons given there: real ducking, an identical mix for every listener, and review of the break as it will actually sound.

What moves to the client is **sequencing and delivery**, not mixing. The player receives finished audio files and decides which one should be sounding; it never mixes two sources together. Both statements are true at once, and neither weakens the other.

#### 2.5.8 Consequences elsewhere in this document

- **Section 9.1 listener counts.** Icecast counts connections natively. A client-side player does not connect to anything countable, so listener measurement requires a periodic heartbeat from the player. This must be designed in, not added later — an unmeasured station cannot feed section 9 or the awards program.
- **Section 11.2F.** The technical gate items were written against a stream. They are restated for this delivery model in that section.
- **Section 12.2 short-horizon lane.** Material regenerated within the hour has to reach a player that may already hold today's file. The player re-checks on its periodic tick; short-horizon material therefore needs either its own small file or a published revision of the day file.

---

## 3. Rotation

### 3.1 Rotation categories

*Standard practice.* You do not set a frequency per song. You assign each song to a category, and the category has a rotation speed.

| Category                  | Approx. size           | Rotation speed                                                           |
| ------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| **Power (A)**       | ~10 songs              | Every 2 to 3 hours                                                       |
| **Secondary (B)**   | ~25 songs              | Every 5 to 6 hours                                                       |
| **Tertiary (C)**    | ~50 songs              | Once or twice a day                                                      |
| **Recurrent**       | Cycled down from Power | A few spins a week                                                       |
| **Library / Gold**  | Deep catalog           | Occasional                                                               |
| **New (protected)** | 3 to 5 songs           | Power-level exposure for a fixed 4 to 6 week window, regardless of votes |

The Power list is what listeners perceive as the station's identity. That is the awareness effect radio has always used to build a hit.

### 3.2 Separation rules

**Song separation (mandatory).** Never repeat the same song inside its rotation window, even if the shuffle wants to. This is the rule listeners actually notice.

**Artist separation: suspended.** *KJubilee decision.* Standard practice forbids repeating an artist inside an hour. That rule exists to keep a station from sounding like a single-artist channel. When the station **is** the persona, that is not a defect, it is the branding. Several KJubilee stations will carry only two or three artists total during this phase. Artist separation is therefore waived until third-party catalog is added.

**Replacements for what artist separation normally provided:**

- **Tempo and mood separation.** Do not stack three ballads in a row. This is where a two-artist station starts to feel monotonous.
- **Texture and key variety.** Where production metadata supports it, avoid consecutive songs sitting in the same sonic register.

**Framing:** a listener hearing one persona repeatedly is learning a voice. At this stage that is the objective. Keep song separation tight so it does not collapse into the same eight songs.

### 3.3 Tempo balance within categories

Every category needs both uptempo and ballad members. Otherwise the daypart weighting in section 1.2 has nothing to draw from.

---

## 4. Catalog Depth Thresholds

*Standard practice, not K-LOVE-published figures.*

Math: a typical music hour holds 12 to 14 songs. A 90-minute listening session is roughly 20 songs.

| Catalog size         | Verdict                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **300+ songs** | Comfortable mainstream rotation. Roughly 24 hours before a repeat. Can carry a station alone.                              |
| **150 to 300** | Workable if the station has a clear identity and listeners expect repetition. Pair with a compatible voice where possible. |
| **80 to 150**  | Pair with a compatible persona. Do not run solo.                                                                           |
| **Under 80**   | Not a station. Give the persona a two-hour weekly slot on a larger channel instead.                                        |

**Exception:** ambient, contemplative, instrumental, and sustained worship formats break these rules and run comfortably on 60 to 80 tracks, because listeners are there for atmosphere rather than hooks. Repetition is a feature.

**Warning:** with 101 bands the temptation is to fill them all. A half-empty station damages the brand more than an unused frequency does.

---

## 5. Branded Audio

### 5.1 Top of hour

FCC station identification rules bind licensed broadcast stations and require the legal ID at the top of the hour, as close to the hour as possible during a natural break. KJubilee's HM-band stations are streaming, not FCC-licensed FM, so **the rule does not legally bind us**.

**KJubilee decision:** keep the top-of-hour convention anyway. Listeners are trained by it, and it signals a real station rather than a playlist.

### 5.2 Inventory per station

| Element                     | Minimum quantity         | Purpose                                          |
| --------------------------- | ------------------------ | ------------------------------------------------ |
| **Legal / formal ID** | 2 to 3 variants          | Full station name and positioning line           |
| **Sweepers**          | 15 to 25                 | Short branded stingers between songs             |
| **Persona IDs**       | 8 to 12                  | The host voices the brand in character           |
| **Sonic signature**   | 1 motif, 3 to 5 variants | Section 12.8. Appears inside every element above |
| **Total**             | **30 to 40**       | Launch minimum                                   |

### 5.3 Rhythm

Formal ID at the top of the hour. A sweeper roughly every two or three songs. The brand touches the ear about 4 to 6 times an hour without becoming wallpaper.

**Named failure mode:** too few sweepers is worse than too few songs. Listeners forgive hearing a song twice in a day. They notice the same eight-word stinger by the third hour.

---

## 6. Scripture Rotation

### 6.1 Pool depth

A "top 100" pool is **rejected** on two grounds.

**Depth.** One hundred verses across a full station is thin, and will be noticed faster than music repetition, because a verse lands in silence with the listener's full attention.

**Minimum: 300 to 400 passages per station.** At one or two a day that gives a year without repeat.

**Selection.** A popularity list skews toward comfort (Jeremiah 29:11, Philippians 4:13, Romans 8:28). Feeding a listener only that hands them a partial Yahuah. **Keep the hard passages in.**

### 6.2 Calendar-tied selection

**KJubilee decision:** tie Scripture selection to the sacred calendar rather than to a flat pool. Lament passages in their season. Covenant and Torah texts around the feasts. Resurrection texts in their season. Scripture then teaches the shape of the year rather than filling space between songs.

### 6.3 One anchor, five doorways

**One anchor passage per day.** It gives the day a spine and lets the same text run across station, site, and app. *Verified:* K-LOVE's Verse of the Day proves the model works across platforms.

**Do not play one identical recorded read all day.** Give the anchor passage four or five distinct treatments:

| Daypart   | Treatment                                                                |
| --------- | ------------------------------------------------------------------------ |
| Morning   | Straight read. The text itself, clean.                                   |
| Midday    | Adds a short Hebraic note: a root word, a piece of context.              |
| Afternoon | A question to sit with.                                                  |
| Evening   | The same text turned into a prayer or blessing spoken over the listener. |
| Overnight | The quietest version. Verse over a music bed.                            |

Same anchor, five doorways in. A listener who hears it three times has been **taught** something rather than reminded of something.

---

## 7. Break Content and Talking Points

### 7.1 Volume

A station running live-feeling hosts needs roughly **6 to 10 spoken breaks per hour**, which is 50 to 80 a day across meaningful hours. A three-day-ahead pool means a couple hundred pieces in the queue at any time.

This is why generation matters more than a static library, and why the three-day-ahead preview design in section 2.4 is the correct architecture.

Note: the 30 to 40 figure in section 5.2 is **branded audio elements**, not talking points. They are separate inventories.

### 7.2 Categories

1. **Anchor passage treatment** (per section 6.3)
2. **Encouragement** spoken to a specific struggle
3. **Testimony or story**
4. **Teaching**: a short Hebraic note or piece of context
5. **Invitation**: pointing to Yeshua plainly
6. **Practical**: what is coming up on the station, the calendar season, the ministry

---

## 8. Donation Model

### 8.1 The two-mode discipline

*Verified (klove.com pledge drive pages, 2026):* K-LOVE runs two modes.

**Outside drives.** Light and infrequent. A host mentions listener support in passing, framed as gratitude and partnership rather than need. Points to the website. No urgency, no guilt, no running tally.

**During drives.** The ask moves to the foreground for roughly eight to ten days: goals, testimony about why people give, repeated web and phone references, incentives. *Verified:* the spring 2026 on-air fundraiser ran 14 to 24 April 2026, with the sweepstakes window opening 31 March 2026.

**The craft is the separation.** Because the drive carries the weight, the other fifty weeks stay almost entirely clean. Spreading the same total ask evenly across the year would sour every hour.

**Also verified in framing:** the ask is anchored in mission, not need. Always what the station does for people, never what the station lacks.

*Not verified:* current-year fall drive dates. K-LOVE does not appear to publish them until close to the time. The pattern is a similar length, historically around October, running mid-week to mid-week.

### 8.2 KJubilee drives: feast-anchored, calculated per year

**KJubilee decision:** do not hard-code dates. Anchor each drive to a feast and let the engine calculate the date from the calendar source each year.

The rule is written as *"the drive opens ten days before Sukkot"*, not *"the drive opens October 14."* It moves with the year on its own.

| Drive            | Anchor  | Theology of the ask                                    |
| ---------------- | ------- | ------------------------------------------------------ |
| **Spring** | Shavuot | Firstfruits. Giving from the beginning of the harvest. |
| **Fall**   | Sukkot  | Ingathering. Giving from what has come in.             |

Two drives, roughly six months apart, each eight to ten days. This is the same rhythm K-LOVE arrived at by trial and error, with the difference that ours has a reason. The ask preaches something rather than merely funding something.

**Implementation requirement:** the drive window must be a calculated field derived from the active feast calendar, not a stored date. Verify the calculation annually before each drive opens.

---

## 9. Metrics and Listener Feedback

### 9.1 The four measurements

| Metric                            | Source                                              | Why it matters                                                 |
| --------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| **Listener counts by hour** | Player heartbeat (see 2.5.8)                        | Shows which hours actually carry audience                      |
| **Tune-out points**         | Disconnect events, timestamped against the playlist | The most valuable number available                             |
| **Thumbs up / thumbs down** | App and site                                        | Tracked as a**ratio against spins**, never as raw totals |
| **Spin counts per song**    | Engine log                                          | Audits whether rotation is doing what was designed             |

**Tune-out is the one that will surprise you.** Votes tell you what people say. Tune-out tells you what they do. A song that consistently precedes disconnections is hurting the station no matter what the votes say. When the two disagree, **trust the behavior**.

Vote totals are tracked as a ratio against spins so that a heavily played song is not automatically the winner.

### 9.2 Feedback drives category movement, not frequency

Listener input moves a song **between categories**. It does not adjust an individual song's frequency directly.

- A song trending up is promoted from Secondary to Power.
- A song taking sustained thumbs-down drops to Tertiary or out.

This way listener input shapes the station without any single vote spiking a song.

### 9.3 The feedback loop must not run itself

**Named failure mode.** Voting rewards familiarity. Left unchecked, the loop collapses toward a tiny pool of already-popular songs and new music never gets a chance. A song cannot become a favorite if nobody hears it enough to learn it.

**Mitigation:** the protected **New** tier in section 3.1. Three to five new releases get Power-level exposure for a fixed four to six week window regardless of votes. Non-negotiable. Human review before any category promotion or demotion is applied.

### 9.4 Spotlight features

Radio calls these **features**: top song of the week, most requested, artist spotlight. They work because the station's authority does the work. Being told a song is the top song changes how a listener hears it, even a listener who does not personally love the song.

**Constraint: it must be true.** A spotlight claim is only made when the metrics actually support it. No fabricated chart positions, no invented request counts. The authority only holds as long as it is honest.

---

## 10. Song Metadata Generation

Every song is tagged **at production time**, on the way in, rather than analyzed after the fact.

### 10.1 Signal analysis (deterministic, no model)

Extracted with straight signal analysis (librosa or equivalent). More reliable than asking a model to guess.

- Tempo (BPM)
- Musical key
- Energy
- Loudness / LUFS
- Duration
- Intro and outro boundaries (for break resolution, bed selection, and post-hitting per section 12.1)

**Drives:** rotation placement, daypart weighting, tempo separation, bed matching.

### 10.2 Interpretive analysis (model)

Transcribe lyrics with Whisper, then pass the text to the internal inference API for:

- Theme
- Scripture references echoed
- Emotional register
- Intended function (call to worship, lament, declaration, testimony, invitation)
- Sacred season fit

**Drives:** seasonal and thematic programming, anchor-passage pairing, feast-week rotation. This is the capability a commercial CCM clock structurally cannot use.

### 10.3 The combination

Signal analysis gives the **numbers** that drive rotation and daypart placement. The model gives the **tagging** that drives seasonal and thematic programming. Neither replaces the other.

---

## 11. Station Launch Gate

### 11.1 Nature of the gate

**This is a hard pass/fail gate, not a scorecard.** Every item passes or the station does not go live. Scorecards let you talk yourself into launching at 70%.

The gate operates in two forms simultaneously:

1. **Automated checks** inside the Jubilee Radio Engine, run against the station configuration.
2. **A personal sign-off** by the platform owner, recorded with a date.

Both must clear.

### 11.2 Gate items

#### A. Catalog depth

- [ ] Catalog meets the threshold in section 4 for the station's format, or the ambient exception is explicitly invoked and recorded
- [ ] Every song assigned to a rotation category
- [ ] Power, Secondary, and Tertiary each contain both uptempo and ballad members
- [ ] Protected New tier populated with 3 to 5 titles and window end dates set

#### B. Format coherence

- [ ] The drop-in test passes: ten random entry points sampled, no jolts
- [ ] Emotional register and production texture consistent across the catalog
- [ ] Anything that fails coherence has been moved to a different band, not smoothed over

#### C. Branded audio

- [ ] 2 to 3 legal / formal station IDs recorded
- [ ] **15 to 25 sweepers** recorded
- [ ] 8 to 12 persona IDs recorded
- [ ] Total branded elements at 30 or above
- [ ] **Top-of-hour ID placement configured** in the clock
- [ ] Sonic signature motif produced and present in every branded element (section 12.8)

#### D. Host and break readiness

- [ ] Enough recorded break material to fill a full week without repeating
- [ ] All six break categories (section 7.2) represented in the pool
- [ ] Every break pre-rendered with its bed baked in
- [ ] Three-day generation window producing files successfully

#### E. Scripture pool

- [ ] 300 to 400 passages loaded
- [ ] Pool includes difficult passages, not comfort-weighted only
- [ ] Calendar tagging applied to seasonal passages
- [ ] Daily anchor selection working, with all five treatments generating

#### F. Technical

- [ ] Daily programming file publishing successfully, days ahead (2.5.2)
- [ ] Player resolves the file and holds sync: clock offset applied, position re-derived rather than advanced (2.5.4)
- [ ] Audio reachable on the CDN with byte-range support, so a mid-track join works
- [ ] Metadata correct to the player: title, artist, artwork. *Listeners judge legitimacy by the now-playing display.*
- [ ] Failover configured with a fallback loop, and the player degrades to it when a day file is missing (2.5.4 item 4)
- [ ] **Missing-day alarm.** A day file that fails to publish is this delivery model's dead air, and it is silent in both senses — nothing breaks until a listener asks for it. Alarm on the player's missing-day report (2.5.4 item 4).
- [ ] **Silence detection with automated alarm** on any live mount still in service (2.5.6). Dead air on an unmonitored station can run for hours.
- [ ] Listener metrics reporting via player heartbeat (2.5.8) — an unmeasured station cannot feed section 9
- [ ] Thumbs up / thumbs down capture wired to the station
- [ ] Tune-out event logging active

#### G. Content review

- [ ] Three-day preview accessible to admin accounts
- [ ] Review completed for the first seven days of programming **before** air
- [ ] Review workflow documented, with a named reviewer

#### H. Drives and calendar

- [ ] Feast calendar source connected
- [ ] Spring (Shavuot) and fall (Sukkot) drive windows calculating correctly for the current year
- [ ] Light-mode donation mentions in the break pool, mission-framed
- [ ] Drive-mode break material prepared separately, not mixed into the standing pool

#### I. Not applicable

- [X] **Music rights clearance: N/A.** All music is Jubilee-produced and owned outright.

### 11.3 Maintenance cadence

Rotations go stale. Sweepers get tired. Every live station requires:

- **Named owner** per station
- **Monthly:** rotation category review, spin count audit, tune-out review
- **Quarterly:** sweeper and persona ID refresh, clock review
- **Annually:** drive window recalculation, Scripture pool expansion review

A station with no named owner is not a live station. It is an unmonitored stream.

---

## 12. The Delight Layer

Sections 1 through 11 are an engineering spec. Every threshold in them prevents a station from being **bad**. Almost none of them make a station **beloved**. This section covers the difference.

*Standard practice where noted. Everything else is a KJubilee decision.*

**Build discipline:** do not ship all ten at once. A station that suddenly acquires ten gimmicks sounds like a station trying too hard, which is its own kind of unlistenable. Build order is given in 12.11.

### 12.1 Hit the post

*Standard practice. This is the single largest difference between "radio" and "playlist."*

The host talks over the next song's instrumental intro and **stops exactly as the vocal enters**. Nothing else in this section changes the feel as much.

You already have both halves: intro boundaries from section 10.1, and pre-rendered breaks from section 2.2. Join them.

**Implementation as a render constraint:**

- Every song carries an `intro_ms` value: time from the first note to the vocal entry.
- Every rendered break carries a `speech_tail_ms` value: how long the voice continues past the point where the bed would resolve.
- The scheduler selects a break for a given slot only when `speech_tail_ms` fits inside the next song's `intro_ms`, with a small safety margin of roughly 300 to 500 ms.
- Where the voice is too long for the intro, the renderer trims the bed rather than the speech, and the scheduler picks a different next song.

**Do not fake it with a crossfade.** A crossfade blurs the post. The whole effect is precision.

### 12.2 The short-horizon lane

Three days ahead is right for review and wrong for aliveness. Automated stations sound canned because they never acknowledge the present moment.

**Add a second generation lane that regenerates within the hour** and carries only time-aware material:

- The hour and the part of the day
- The day of the week
- Weather, where a regional feed is available
- Where we stand in the sacred calendar, counted forward or back from the nearest appointed time
- What has already aired on the station today

**Volume:** two or three per hour is enough. This lane is seasoning, not substance.

**Review model:** the standing lane is human-reviewed before air. The short-horizon lane cannot be, by definition. It is therefore constrained to a **narrow template set with fixed slots**, so the model is filling variables rather than composing freely. Any short-horizon template must be reviewed and approved once, before it enters the rotation.

### 12.3 Names on the air

*Standard practice. The oldest hook in the medium and still the strongest.*

Requests, dedications, and shout-outs. A listener who hears her own first name spoken over a song bed on a station she found last week is no longer a listener. She is a member.

**Implementation:**

- Route submissions through Jubilee ID, so identity is already established.
- Submissions enter the **standing lane** and appear in the three-day preview for review. Nothing goes to air unreviewed.
- The persona speaks the first name only. No surnames, no locations more specific than a region, no detail that could identify a person against their will.
- Dedications carrying grief, illness, or crisis are routed to a human reviewer before any of it is rendered, without exception.

### 12.4 Persona crossover

Thirteen voices are running in isolation. This is an asset no competitor has, and sections 1 through 11 do not mention it once.

- Two-host banter inside a single break
- A guest drop-in from another band's persona
- A persona referring to something another persona said this morning

This also addresses monotony on the two-artist stations more effectively than tempo separation does, because it varies the **voice** rather than the music.

**Constraint:** crossover requires the personas to hold consistent knowledge of what the other actually said. Pull from the aired break log, not from invention.

### 12.5 Serialization

Cliffhangers are why people return at the same time tomorrow.

Take one story, testimony, or teaching thread and break it into parts: five or six across a single day, or five across a week. **End each part unresolved.**

The format clock survives this without modification, because each part is simply a break. Serialization is a property of the content, not of the structure.

### 12.6 Appointment moments

Block programming gets one thing right that the format clock discards: a reason to tune in at a specific time. That can be recovered without adopting blocks.

**Three appointments per station. Not thirty.**

| Type                       | Cadence                    | Notes                                             |
| -------------------------- | -------------------------- | ------------------------------------------------- |
| Countdown or chart feature | Weekly, fixed hour         | Fed by section 9 metrics. Must be honest, per 9.4 |
| Prayer minute              | Daily, same hour every day | Short, unvarying in placement, varying in content |
| Late-night ritual          | Nightly                    | The quietest thing the station does               |

### 12.7 Make sundown audible

**This is the strongest idea available to the platform, and it exists nowhere else on the dial.**

Let the station audibly change at sundown on the sixth day: different rotation weighting, different break tone, a distinct sonic identity. Let it change back at sundown the following day. Do the same on the eve of an appointed time.

A listener who notices the station changed **because the day changed** has been taught the shape of the calendar without a word of instruction.

**Implementation:** sundown is location-dependent and moves daily. Calculate it from the calendar source and a reference longitude per station, the same way the drive windows in section 8.2 are calculated rather than stored. Publish the reference location so listeners understand what the station is following.

### 12.8 Sonic signature

A three-note motif, consistent across every sweeper, ID, and bed on that band. Consider how few notes it takes to recognize a network.

- One motif per station
- Three to five variants: full, short, single-note button, and a slowed or sparse version for reflective hours
- Present in every branded element in section 5.2

This costs roughly one production session and pays for years. It is a launch gate item under section 11.2C.

### 12.9 Close the feedback loop out loud

Section 9 collects votes and never tells anyone what happened to them.

Say it on air. This song climbed because of you. Here is where it sits this week. Here is what is knocking on the door of the Power list.

**Voting that visibly moves something is a game. Voting into silence is a form.**

Constraint from 9.4 applies without exception: the on-air claim must match the actual metric. No fabricated positions, no invented request counts.

### 12.10 An unrepeatable lane

Everything in sections 1 through 11 is queued, reviewed, and rendered three days out, which means nothing can ever be a **moment**.

Reserve a small lane for material that airs once and is never rerun and never archived. Scarcity is what makes a listener say "you had to hear it."

**Volume:** rare by design. One or two a week at most. If it happens daily it is not unrepeatable, it is just programming.

### 12.11 Build order

Do not build these in parallel.

**Phase one, build first:**

1. Hit the post (12.1)
2. Short-horizon lane (12.2)
3. Names on the air (12.3)
4. Sundown (12.7)

These four carry most of the return. Land them, live with them, listen for a few weeks.

**Phase two:**

5. Sonic signature (12.8)
6. Appointment moments (12.6)
7. Feedback loop out loud (12.9)

**Phase three:**

8. Persona crossover (12.4)
9. Serialization (12.5)
10. Unrepeatable lane (12.10)

---

## 13. Open Items

1. **Persona catalog audit.** Which personas currently hold enough catalog to sustain a rotation, which need pairing, and which should become a weekly show instead of a station. Not yet answered.
2. **Clock mapping.** A side-by-side of the K-LOVE hourly clock against the KJubilee 101-band lineup, showing where the two models diverge in practice. Offered, not yet built.
3. **Fall drive length.** Confirm the intended KJubilee fall drive duration against the Sukkot window once the calendar source is connected.
4. **Sundown reference location.** Section 12.7 requires a reference longitude per station. Decide whether that is a single platform-wide reference, one per station, or listener-local where the app can supply it. Not yet decided.
5. **Short-horizon template set.** Section 12.2 constrains the unreviewed lane to approved templates. The template set itself has not been written.
