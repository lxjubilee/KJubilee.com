# KJubilee.com — Radio Station Website
## Master Build Specification

**Prepared for:** Gabriel Ungureanu — Founder, Jubilee Ministries, Inc. / Jubilee Software, Inc.
**Document type:** Product + Technical Specification (Draft **v2.0** — build-ready)
**Sibling site (look & feel reference):** JubiLujah.com
**Streaming backend:** Jubilee Radio Engine v3.0 (Icecast-KH + Liquidsoap)
**CDN:** cdn.jubileeverse.com
**Auth:** Jubilee Account (SSO — "One account. Every Jubilee Website.")

> **What changed from v1.0 → v2.0:** Ten signature differentiators are now integrated throughout the document — persona voice hosts, a 10-second "Tune Me" onboarding, an Encounter Layer on Now-Playing, sacred-calendar (Shabbat/Feast) programming, corporate shared-presence, hands-free/voice surfaces pulled forward, a share-card viral loop, night/soaking stations with sleep-and-wake tools, redeemed dedications/shout-outs, and continuous adaptive curation. See the consolidated overview in **Section 5**, the new feature sections (**10A, 11A–11E, 19**), and the re-slotted **Roadmap (Section 21)** and **Acceptance Criteria (Section 22)**.

---

## 1. Executive Summary

KJubilee.com is the public-facing **radio discovery and listening website** for the Jubilee ecosystem. It surfaces the 101 live stations produced by the Jubilee Radio Engine (HM band **300.00–399.90**) in a browse-first, artwork-rich interface modeled directly on JubiLujah.com.

The core listener journey is deliberately simple:

> **Arrive → browse proposed stations on the home page → tap a station → land on its station page → the live player docks to the footer and keeps playing while the listener reads now-playing content (track, artist/persona, host/DJ, station story).**

The persistent footer player is the heart of the product. Once a listener presses play, audio **never stops on navigation** — they can move anywhere on the site and the stream continues, exactly like the bottom bar on JubiLujah.

What makes KJubilee more than "a playlist with a logo" is a set of **signature differentiators** no secular radio platform can copy: the **Inspire Family personas host their stations with real AI voice breaks**; every track carries an **Encounter Layer** (Scripture from the JSV + a finished-reality declaration + a tap into AI Bible Chat); the whole site **breathes with Yahuah's calendar** (Shabbat and Feast programming that runs itself); and listeners feel they are **worshiping together, not alone**. These are detailed in Section 5 and built out across the document.

Every design decision is anchored to three inputs: the **proven JubiLujah layout** the Jubilee audience already knows (Section 3), **listener sentiment research** on what people actually want from an internet-radio site (Section 4), and the **signature differentiators** that set KJubilee apart (Section 5).

**Brand note — the call sign.** "KJubilee" reads as a genuine U.S. radio call sign. Stations west of the Mississippi begin with **K**; Folsom/Sacramento sits firmly in K-territory, so "K-Jubilee" is both authentic and memorable as a station brand.

---

## 2. Goals & Non-Goals

### 2.1 Goals
- Let a first-time visitor find and start playing a station in **under 10 seconds**, with zero account required.
- Present all 101 HM-band stations in an inviting, scannable, artwork-driven layout.
- Give each station a rich page: live player, now-playing metadata, **persona voice host**, station story, and schedule.
- Keep the stream playing continuously across the entire site via a **persistent footer player**.
- Turn passive listening into **encounter** — Scripture, declaration, and prayer woven into the now-playing moment.
- Make listeners feel part of a **corporate body worshiping together**, not a solo phone.
- Meet radio where it actually lives: **hands-free in the car, on smart speakers, by voice, and overnight.**
- Cross-link into the wider ecosystem (JubiLujah album pages, JubileeInspire AI Bible Chat, JubileeVerse articles, InspireManna).
- Ship a design that feels like a first-class member of the Jubilee family of sites.

### 2.2 Non-Goals (v1)
- No on-demand track selection or full DVR scrubbing (radio is a continuous live stream, not a music library — this is deliberate; see Section 4, discovery-over-control finding).
- No user-uploaded content or third-party station submissions.
- No native mobile apps at first (responsive web + hands-free surfaces first; native apps are a later phase).
- No podcast download hosting (streaming and archived replay only).

---

## 3. Design Language — Emulating JubiLujah

KJubilee inherits JubiLujah's visual grammar so the two sites feel like one family. Concrete elements to carry over:

### 3.1 Layout skeleton (top → bottom)
1. **Top utility bar** — brand logo (left), secondary links (Articles → JubileeVerse, AI Bible Chat → JubileeInspire), Search, Sign In / Jubilee Account.
2. **Primary nav** — HOME · STATIONS · INSPIRE FAMILY · CHILDREN · FAMILY FRIENDLY · GENRES · SCHEDULE · UPGRADE.
3. **Language selector** — flag-based dropdown identical in behavior to JubiLujah's (English default; full multilingual list; "Recently Used" + "All Languages" groupings).
4. **Content shelves** — the home page body is a stack of **horizontally scrolling rows** ("shelves"), each with a themed heading and a row of tappable tiles. On JubiLujah these tiles are album covers; on KJubilee they are **station tiles**.
5. **Persistent footer player** — pinned to the bottom of the viewport on every page, showing transport controls and now-playing (JubiLujah shows `0:00 / 0:00` here; KJubilee shows the live track + host).
6. **Footer** — copyright line, Terms of Use, Privacy Policy, matching JubiLujah's minimal footer.

### 3.2 Visual tone
- **Dark, cinematic, artwork-forward.** Artwork does the talking; chrome stays minimal.
- **Tile-first browsing.** Listeners identify stations visually at a glance — every station needs strong cover art (Section 6).
- **Consistent CDN artwork** served from `cdn.jubileeverse.com` (same host JubiLujah uses for album art), so caching and branding stay unified.
- **Smooth, gradual reveal** on scroll (subtle fade/slide as shelves enter viewport) — matches the polished animation feel of the reference sites.
- **Adaptive skins.** The site can re-dress itself contextually without changing structure: a softened **Shabbat palette** from Friday sundown, **Feast** accents on appointed days, and a dimmed **Night mode** after hours (Sections 11B, 11C).

### 3.3 What changes vs. JubiLujah
| JubiLujah | KJubilee |
|---|---|
| Tile = album → `/album?c=CODE` | Tile = station → `/station?f=344.50` (or slug) |
| Footer bar = track scrubber for a chosen song | Footer bar = **live stream player** with now-playing + host |
| Shelves grouped by theological theme | Shelves grouped by station format, persona, mood, language, time of day |
| Play = a fixed audio file | Play = a continuous Icecast live stream, hosted by a persona |
| Static now-playing | **Encounter Layer** — Scripture, declaration, and shared presence |

---

## 4. Listener Sentiment → Feature Mapping

This section distills what listeners consistently say they want from an online-radio site, and maps each desire to a concrete KJubilee feature. These findings drove the feature set.

| # | What listeners want | Evidence signal | KJubilee feature |
|---|---|---|---|
| 1 | **Fast, visual discovery** — browse by genre, mood, popularity, language, and recommendations with clean, intuitive navigation | Leading sites (TuneIn, KEXP) win on clean layouts, high-res art, and browse-by-genre/location/popularity | Artwork-tile shelves + the **"Tune Me" 10-second onboarding** (Section 8.1) |
| 2 | **Keyword search across everything** — stations, genres, "vibes" | Praised as a standout on TuneIn ("search by keywords, genres, countries") | Global search across station name, format, persona, tags |
| 3 | **Now-playing metadata** — the current song, the artist, and *who's on air* | Fans are "devoted to their favorite hosts, DJs and personalities" | Footer + station page show track, artist/persona, album, and the **persona host on air** (Section 10A) |
| 4 | **A player that follows you** — keep listening while browsing | The defining UX of a radio site is a persistent bar you don't lose | Persistent footer player; audio never restarts on navigation (Section 9) |
| 5 | **Rock-solid, smooth playback** — no dropouts | Buffer management (5–30s) + adaptive bitrate cited as the reliability baseline | Adaptive bitrate, healthy buffer, CDN edge, auto-reconnect, **data-saver** (Sections 11E, 12) |
| 6 | **Curated "vibe" over cold algorithm** — the spontaneity of radio without full control | Listeners praise human-curated, time-of-day programming and *don't* want a library to manage | Persona-hosted stations + mood/time shelves + **adaptive curation** that stays human (Section 11E) |
| 7 | **Interactivity** — song requests, reactions, live chat, sharing | Interactivity repeatedly named as internet radio's edge over FM | **Dedications/shout-outs**, reactions, requests, chat (Section 14) + **share cards** (Section 11D) |
| 8 | **Personalization & favorites** — save stations and settings via an account | Favoriting, accounts, sleep timers, recommendations named as expected conveniences | Favorites, "My Stations," resume-last, **sleep & wake tools** (Section 11C) |
| 9 | **Station identity & story** — know the vibe/format before committing | Strong station bios + host photos + interviews stand out | Station page with story, format, **persona host card**, schedule (Section 8) |
| 10 | **Schedules & replay** — what's on now and later; catch past shows | Hybrid live + archived/on-demand is the modern norm | "On now / Up next" strip; archived replay (later phase) |
| 11 | **Any device, no app required** — browser, phone, smart speaker, car | Universal browser access + smart-speaker/voice named as key access modes | Responsive web + **hands-free/voice surfaces at launch** (Section 19) |
| 12 | **Global reach & language** — multilingual, international | International discovery + multilingual UI are hallmarks of the category | Full language selector; per-station language tags (Section 15) |
| 13 | **Rewards & belonging** — quizzes, contests, loyalty | Gamification named as an engagement driver | Kingdom Credits: streaks, badges, seasonal drops (Section 16) + **corporate presence** (Section 11A) |

**Design takeaway:** listeners want the *feel* of live, human, curated radio — discovery and surprise — plus modern conveniences (metadata, favorites, reliability, interactivity). KJubilee leans into curation, identity, and encounter rather than trying to be an on-demand music library.

---

## 5. Signature Differentiators (The Ten Upgrades)

These are the strategic features that lift KJubilee above a generic streaming skin. Each reuses assets Jubilee already owns and points to the section where it is fully specified.

| # | Differentiator | Why it wins | Reuses | Spec home |
|---|---|---|---|---|
| **1** | **Persona voice hosts** — Inspire Family personas do real on-air breaks: station IDs, song intros, a Scripture drop, a word of encouragement | The thing listeners bond to most is the personality behind the mic; no faith platform has 13 distinct AI hosts | Inspire Voice Studio, OmniVoice, persona codex | **10A** |
| **2** | **"Tune Me" onboarding** — a 3-tap "what do you need right now?" that drops the visitor into the perfect station, already playing | 101 stations causes choice paralysis; fast activation was the loudest UX signal | Station mood/format tags | **8.1** |
| **3** | **Encounter Layer** — Scripture (JSV) beside each track, a one-tap finished-reality declaration, and a link into AI Bible Chat | Turns passive listening into encounter — the part secular radio can never copy | JSV, JubileeInspire, InspireManna, Covenant Breakthrough posture | **8.3** |
| **4** | **Sacred-calendar programming** — Shabbat mode from Friday sundown; Feast days auto-trigger themed stations and drops | A signature that says "built for us"; manufactures recurring event energy on Yahuah's calendar | Radio Engine scheduling, seasonal drops | **11B** |
| **5** | **Corporate presence** — "4,200 believers worshiping with you," a soft global map of lights, a gentle Amen pulse | Belonging is the emotional core of faith audio; makes a solo phone feel like a full room | Icecast listener stats | **11A** |
| **6** | **Hands-free at launch** — car, smart speaker, and voice ("play KJubilee Throne Room") treated as launch channels, not phase 5 | Radio is consumed hands-free; this is where daily habit forms | Direct stream URLs, Media Session | **19** |
| **7** | **Share-card viral loop** — one tap turns the now-playing moment (art + song + verse) into a social-ready image/clip linking home | Every share becomes free evangelism and growth at near-zero cost | Station art, JSV verse mapping | **11D** |
| **8** | **Night, sleep & soaking** — all-night soaking/presence stations plus "play until I sleep" and "wake me with worship" | Believers already use worship for sleep, overnight prayer, and soaking; explodes session time | Radio Engine stations, sleep timer | **11C** |
| **9** | **Redeemed dedications** — send a prayer request or dedicate a song; the persona host acknowledges it in a voice break | The classic radio shout-out reframed as participation, community, and testimony | Persona voice engine (#1), moderation standards | **14** |
| **10** | **Adaptive curation** — permanent, gentle learning from favorites/skips/linger shaping shelves and programming; still feels human | The one-time sentiment pass becomes continuous improvement; the site gets better weekly | Listening telemetry, Station Registry | **11E** |

---

## 6. Information Architecture / Site Map

```
KJubilee.com
│
├── / .......................... Home (station shelves + Tune Me entry)
├── /tune ...................... "Tune Me" onboarding flow
├── /stations .................. Browse all (grid + filters)
│     ?format= &persona= &mood= &lang= &time= &sort=
├── /station?f=344.50 .......... Station detail page (or /station/throne-room)
├── /inspire ................... Inspire Family hub (persona-hosted stations)
├── /children .................. Children stations
├── /family .................... Family-friendly stations
├── /genres .................... Browse by genre/format
├── /night ..................... Night / soaking / all-night presence
├── /sacred .................... Shabbat + Feast programming (calendar-driven)
├── /schedule .................. What's on now / upcoming across stations
├── /search?q= ................. Search results (stations, personas, formats)
├── /favorites ................. My Stations (auth)
├── /account ................... Jubilee Account settings (SSO)
├── /upgrade ................... Subscription tiers
├── /terms /privacy ............ Legal
│
├── [persistent footer player rendered on every route]
│
└── APIs / services
      ├── /api/now-playing/:station ... realtime track + host + verse + presence
      ├── /api/on-now ................. lightweight live feed for home shelves
      ├── /api/tune .................... maps mood answers → recommended station
      ├── /api/dedication .............. submit a dedication/prayer request
      ├── /api/share-card/:station ..... renders a now-playing share image/clip
      └── /voice ....................... smart-speaker / voice intents (Section 19)
```

**Routing note:** the site behaves as a single persistent shell so the footer player and its `<audio>` element survive route changes. **Playback must not restart when the listener navigates.** This is the single most important technical constraint in the product.

---

## 7. Station Data Model

Each station is a record in the **Station Registry** (fed by the Radio Engine). Proposed schema (v2.0 adds voice-host, sacred-calendar, night/soaking, and verse-mapping fields):

```jsonc
{
  "station_id": "KJB-344",
  "slug": "throne-room",
  "call_sign": "KJubilee 344",
  "hm_frequency": 344.50,                 // HM-band dial number (300.00–399.90)
  "display_name": "Throne Room",
  "tagline": "Praise that never sits down",
  "description": "Long-form station story / vibe copy.",
  "format": ["Praise", "Worship"],
  "mood": ["Uplifting", "Celebration"],   // powers Tune Me + mood shelves
  "time_of_day": ["morning", "anytime"],  // powers time shelves + night
  "language": "en",

  "host_persona": "jubilee-inspire",      // Inspire Family persona (nullable)
  "voice_host": {                         // Persona voice-break config (Section 10A)
    "enabled": true,
    "voice_profile": "jubilee-inspire-v2",// Inspire Voice Studio / OmniVoice
    "break_types": ["station_id", "song_intro", "scripture_drop", "encouragement", "dedication"],
    "frequency": "every_2_3_tracks",
    "tone": "warm, celebratory"
  },

  "sacred_calendar": {                    // Section 11B
    "shabbat_role": "featured",           // featured | active | hidden during Shabbat
    "feast_tags": ["passover", "tabernacles"]
  },
  "night": {                              // Section 11C
    "soaking": true,
    "all_night": true
  },

  "artwork": {
    "tile":   "https://cdn.jubileeverse.com/radio/stations/kjb-344/tile.png",
    "hero":   "https://cdn.jubileeverse.com/radio/stations/kjb-344/hero.png",
    "square": "https://cdn.jubileeverse.com/radio/stations/kjb-344/square.png"
  },
  "stream": {
    "icecast_mount": "/kjb-344",
    "variants": [
      { "codec": "aac",  "bitrate": 128, "url": "https://stream.kjubilee.com/kjb-344.aac" },
      { "codec": "opus", "bitrate": 96,  "url": "https://stream.kjubilee.com/kjb-344.opus" },
      { "codec": "mp3",  "bitrate": 128, "url": "https://stream.kjubilee.com/kjb-344.mp3" },
      { "codec": "aac",  "bitrate": 48,  "url": "https://stream.kjubilee.com/kjb-344-lo.aac", "role": "data_saver" }
    ]
  },
  "shelves": ["praise-adoration", "inspire-family"],
  "status": "live",                       // live | automated | offline
  "featured": true
}
```

Per-track metadata (from the program) additionally carries the **Encounter Layer** payload:

```jsonc
{
  "track_title": "Enthroned",
  "artist_persona": "jubilee-inspire",
  "album": "Throne Room, Vol. I",
  "album_code": "TR1",                    // → jubilujah.com/album?c=TR1
  "scripture": {                          // Section 8.3 (JSV, OHI naming)
    "ref": "Tehillim (Psalms) 22:3",
    "text_jsv": "Yet You are set-apart, enthroned on the praises of Yisra'el.",
    "declaration": "Yahuah is enthroned on my praise; His presence fills this place now."
  },
  "started_at": "2026-07-06T18:04:11Z",
  "duration_sec": 214
}
```

**Station taxonomy (proposed home shelves).** These mirror JubiLujah's themed rows but for stations; the definitive 101-station list comes from the Radio Engine registry:

- **Featured Stations** (hero row)
- **On Now** (stations with a live host segment right now)
- **The Inspire Family** (one station per hosting persona — Jubilee, Imani, Zev, Santiago, Zariah, Eliana, Elias, Nova, Caleb, Melody, Tahoma, and family)
- **Praise & Adoration** · **Healing & Restoration** · **Breakthrough & Victory** · **Presence & Encounter** · **Hope & the Kingdom Coming**
- **Children** · **Family-Friendly Popular** · **Prayer & Scripture**
- **Night & Soaking** (Section 11C)
- **Shabbat & the Feasts** (calendar-driven; Section 11B)
- **By Language** (surfacing non-English stations)

> **Naming discipline (OHI mode, default):** where God-references appear in station copy, use Yahuah, Yeshua, Elohim, and Ruach HaKodesh (feminine). Apply the Hebrew article rule — write "Ruach HaKodesh" or "the Ruach Kodesh," never "the Ruach HaKodesh." Persona spelling is fixed (e.g., **Eliana Inspire**, never Ileana; **Tahoma Inspire** is male). Mode labels never appear in reader-facing station copy.

---

## 8. Home & Station Pages

### 8.1 Home Page + "Tune Me" Onboarding *(Differentiator #2)*

**Purpose:** invite the listener in and get them playing fast — solving the choice-paralysis of 101 stations.

**Above the fold**
- Top utility bar + primary nav + language selector.
- A **hero/featured strip** — large artwork for a rotating featured station with a prominent ▶ Play. One tap starts audio and docks the footer player immediately (no page change).
- A **"Tune Me" entry** — a friendly prompt ("Not sure where to start? Tell us what you need.") opening the onboarding.

**"Tune Me" flow (`/tune`)**
1. Three quick taps, each a single question with big tiles:
   - *What do you need right now?* → Peace · Breakthrough · Worship · Healing · Something for the kids · Just the Word
   - *What's the moment?* → Morning · Focus/Work · Prayer · Winding down for sleep
   - *(optional)* *Language?*
2. On the final tap, KJubilee resolves answers → the best-fit station (via `/api/tune`, matching `mood` + `time_of_day` + `language`) and **drops the listener straight in, already playing**, with the footer docked.
3. The result is remembered so returning visitors can skip straight to "resume" or re-run Tune Me.

**Body — the shelves**
- A vertical stack of horizontally scrolling **station shelves** per the taxonomy in Section 7.
- Each **station tile** shows cover art, station name, HM-band dial number (e.g. `344.50`), a **LIVE** dot, and — where a host is on air — a tiny "🎙 hosted" marker. On hover/long-press: tagline + quick ▶.
- Tapping a tile → navigates to the station page **and** starts playback.
- If signed in with favorites, the first shelf is **My Stations**. If a stream is playing, its tiles show an animated "playing" state.
- The hero and shelves respond to context: **Shabbat/Feast takeover** and **Night** surfacing (Sections 11B, 11C).
- Lazy-load shelves and tile art as they scroll into view.

### 8.2 Station Detail Page

**Layout (top → bottom)**
1. **Station hero** — full-width `hero` artwork, station name, HM-band dial number, tagline, LIVE badge, big ▶/⏸, ♥ Favorite, Share, and a **share-card** button (Section 11D).
2. **Now Playing panel** — current **track title**, **artist/performing persona** (links to that persona's catalog on JubiLujah), **album** + artwork (links to `jubilujah.com/album?c=CODE`), and **On Air** (which persona segment is live, with a short host line). Optional: **Up Next**, rolling **Recently Played** (last 5–10).
3. **Encounter Layer** *(Differentiator #3)* — see 8.3.
4. **Corporate presence strip** *(Differentiator #5)* — see 11A.
5. **Station story** — the vibe/format copy so listeners know what they're tuning into.
6. **Host / DJ card** — the hosting Inspire Family persona: portrait, short bio, Five-Fold office + musical style, link to persona hub.
7. **Schedule strip** — "On now / Up next / Today's blocks"; archived-show replay reserved for a later phase.
8. **Dedications** *(Differentiator #9)* — "Send a dedication or prayer request" (Section 14).
9. **Related stations** — a shelf of similar stations to keep discovery going.
10. **Persistent footer player** remains docked throughout.

**Key behavior:** arriving from a tile means audio is already playing in the footer; the page **reflects** that state rather than restarting the stream.

### 8.3 The Encounter Layer *(Differentiator #3)*

Beside every track, KJubilee surfaces what secular radio cannot:

- **The Scripture behind the song** — pulled from the JSV, shown with reference and text (OHI naming; Hebrew article rule applied).
- **A one-tap declaration** in finished-reality posture — e.g., *"Yahuah is enthroned on my praise; His presence fills this place now."* Tapping it can log a private "received" moment for the listener (ties to the Covenant Breakthrough posture).
- **A tap into AI Bible Chat** — carries the current verse into JubileeInspire to go deeper.
- **A tap into InspireManna** — for a matching devotional/manna moment.

This layer is data-driven by the per-track `scripture` payload (Section 7) so it updates live with the music. All interpretive/devotional copy uses faith-appropriate language ("interpretation," never "reading," when describing interpretive work).

---

## 9. The Persistent Footer Player (Core Component)

The single most important UI element. Pinned to the bottom on **every** route.

**Displays**
- Station artwork thumbnail + station name + HM-band dial number.
- **Now playing:** track title — artist/persona, and **🎙 On air: [persona]** when a voice break is live (Section 10A). Marquee/scroll if long.
- Transport: ▶/⏸, volume/mute, and a live **buffering/connection** indicator.
- ♥ Favorite (current station), **Share**, and a **share-card** shortcut (Section 11D).
- LIVE badge with elapsed on-air time; a live stream has no seek bar — a subtle live-pulse / equalizer animation replaces the scrubber.
- **Presence pulse** — a small "N worshiping now" glyph (Section 11A).
- Expand control → opens the full station page.

**Behavior requirements**
- **Continuous playback across navigation** — the `<audio>` element lives in the persistent shell and is never torn down on route change.
- **Single-stream rule** — starting a new station cleanly stops the previous one (no double audio).
- **Auto-reconnect** — on network blip, transparently re-establish and resume.
- **Adaptive bitrate + data-saver** — select codec/bitrate by bandwidth; expose a manual data-saver toggle (Section 11E/12).
- **Resume last station** — on return, offer to resume the last-played station.
- **Media Session API** — populate OS/lock-screen/car media controls with track, artist, artwork, and host (Section 19).
- **Sleep & wake tools** — stop-after-N-minutes and wake-with-worship (Section 11C).

---

## 10. Now-Playing Metadata Pipeline

How real-time track/artist/host/verse/presence data reaches the footer and station page.

```
Liquidsoap (per station)
   │  emits ICY metadata on the stream
   │  writes structured now-playing (title, artist, album_code, host segment)
   │  inserts persona VOICE BREAKS on schedule (Section 10A)
   ▼
Icecast-KH
   │  exposes /status-json.xsl (per-mount now-playing + listener counts)
   ▼
KJubilee Now-Playing Service  (background service: polls Icecast + Liquidsoap,
   │  normalizes to the Station Registry schema, enriches with album/artwork,
   │  resolves album_code → JubiLujah link, attaches the JSV Scripture + declaration,
   │  aggregates listener counts into presence, and flags active voice breaks)
   ▼
Realtime channel (WebSocket / SSE)  →  pushes updates to clients
   ▼
Footer player + Station page  (subscribe to the active station's channel;
                               update track, artist, album art, on-air host,
                               Encounter Layer verse, and presence count)
```

**Notes**
- Enrichment maps the current track back to its **album code** for deep-linking to `jubilujah.com/album?c=CODE`, and to its **JSV verse** for the Encounter Layer.
- Clients subscribe only to the channel for the station they're playing, plus a lightweight **On Now** feed for home shelves and a **presence** feed.
- Timing/host-segment data flows from the program schedule so "On Air," "Up Next," and voice-break state stay accurate.
- All background processes here are **services** (never "daemons").

### 10A. Persona-Hosted On-Air System *(Differentiator #1)*

The feature that converts a station from "a playlist with a logo" into "a hosted station you can't get anywhere else."

**What it does**
- Between tracks (configurable, e.g., every 2–3 songs), the station's hosting persona delivers a short **voice break**: a station ID ("You're with Jubilee on KJubilee 344, Throne Room"), a **song intro**, a **Scripture drop** from the JSV, a **word of encouragement**, or a **dedication** acknowledgment (Section 14).
- Voices come from **Inspire Voice Studio / OmniVoice**, using each persona's locked voice profile; tone and cadence follow the persona codex.

**How it's produced**
- Voice breaks are generated as audio segments and **scheduled into Liquidsoap** alongside music, so they ride the same live stream (no separate client audio to sync).
- A break can be **pre-generated** (station IDs, evergreen encouragements) or **freshly generated** (a specific dedication, a time/feast-aware greeting) via a **Voice-Break Service** that renders the persona audio and hands it to Liquidsoap's queue.
- The stream's now-playing metadata flips to **"🎙 On air: [persona]"** while a break plays, so the footer and station page reflect it.

**Guardrails**
- All host copy follows OHI naming and the Hebrew article rule; persona identities stay locked (correct spelling, correct gender — e.g., Tahoma Inspire is male).
- Cultural-appropriateness rules for personas (e.g., Tahoma's GREEN/AMBER/RED framework — "Tahoma appreciates, he never represents") apply to any spoken content.
- A per-station **safe-content review** gate applies before fresh voice breaks (especially dedications) go to air.

---

## 11. Presence, Calendar, Night, Sharing & Curation

### 11A. Corporate Presence — "Worshiping Together" *(Differentiator #5)*

Replace a cold listener count with a felt sense of the body gathered.

- **Presence line** — "4,200 believers worshiping with you right now," shown on the station page strip and as a small footer glyph, driven by aggregated Icecast listener stats through the Now-Playing Service.
- **Global lights** — an optional soft world map with gentle points of light where listeners are tuned in (privacy-safe, coarse/region-level only — no precise location).
- **Amen pulse** — a gentle, tappable "🙌 Amen" that ripples subtly on-screen and nudges the presence animation, giving a shared, low-friction reaction during worship.
- Respect `prefers-reduced-motion`; presence visuals never block core listening.

### 11B. Sacred-Calendar Programming *(Differentiator #4)*

The whole site breathes with Yahuah's calendar — automatically.

- **Shabbat mode** — from **Friday sundown to Saturday sundown** (computed by locale/sunset), a dedicated Shabbat station takes the hero, the palette softens, "hustle" content (e.g., Flywheel-style or high-energy promo shelves) steps back, and Shabbat/rest stations surface first.
- **Feast programming** — Passover, Unleavened Bread, Firstfruits, Shavuot, Yom Teruah, Yom Kippur, Tabernacles (and, in CCI contexts, Christmas) **auto-trigger** themed station lineups and **seasonal drops**.
- **How it runs** — a **Calendar Service** computes the active sacred window (sunset-aware) and sets a site-wide "mode" flag that the home page, shelves, skins, and Station Registry `sacred_calendar` fields respond to. No manual intervention needed.
- Ties into gamification (Section 16) via feast-day badges and drops.

### 11C. Night, Sleep & Soaking *(Differentiator #8)*

Own the overnight hours believers already spend in worship, prayer, and soaking.

- **Night/soaking stations** — dedicated all-night presence and soaking stations, surfaced in a **Night & Soaking** shelf and at `/night`, auto-featured after hours.
- **Sleep tools** — "Play until I fall asleep" (sleep timer with a gentle fade), and a soaking timer for overnight prayer.
- **Wake tools** — "Wake me with worship" schedules a station to begin (or an alarm-style start) at a set time.
- **Night skin** — a dimmed, low-blue palette after hours; animations quiet down.
- Sleep/wake preferences persist per account (Section 12).

### 11D. Shareable Moments — the Viral Loop *(Differentiator #7)*

Make every listener a marketer at near-zero cost.

- **One-tap capture** of the current now-playing moment as a **social-ready image** (and, later, a short **audio-visual clip**): station art + track + artist/persona + the Encounter-Layer verse, stamped with the station name and a link back to `kjubilee.com/station/...`.
- Rendered server-side via `/api/share-card/:station` so cards look consistent and carry correct Open Graph/Twitter metadata (Section 17).
- Share targets: system share sheet, direct link, and social platforms.
- Every share is both **evangelism** (a verse goes out) and **growth** (a link comes back).

### 11E. Adaptive Curation & Reliability *(Differentiator #10)*

Make the opening sentiment pass permanent — and keep playback bulletproof.

- **Gentle learning** — instrument what listeners favorite, skip quickly, and linger on; feed it back to quietly shape shelf ordering and programming suggestions. It informs curation; it never replaces the human/persona feel with a cold algorithm, and it never auto-changes a station mid-listen.
- **Curation Service** — aggregates anonymized telemetry and updates per-listener shelf ordering and global "rising" signals in the Station Registry.
- **Reliability floor** (the loudest complaint in the category) — adaptive bitrate, healthy client buffer, auto-reconnect with backoff, and an explicit **data-saver** low-bitrate variant (Section 7 `role: data_saver`) so weak connections worldwide stay smooth.
- Transparency: a simple, opt-out control for personalization; sensible defaults for signed-out users.

---

## 12. Personalization & Accounts

- **Auth:** Jubilee Account (SSO). Listening needs no account; favorites, cross-device sync, dedications, and rewards do.
- **Favorites:** heart any station → **My Stations** (home shelf + `/favorites`).
- **Resume:** remember last-played station and volume across sessions.
- **Preferences:** default language, autoplay-on-arrival, **data-saver**, **sleep-timer default**, **wake-with-worship** schedule, personalization opt-out.
- **Dedications history:** view submitted dedications/prayer requests and their on-air status (Section 14).
- **Anonymous fallback:** favorites, last-station, and Tune-Me result persist locally and merge into the account on sign-in.

---

## 13. Performance, Reliability & Accessibility

**Performance**
- Lazy-load shelves and tile artwork; prioritize above-the-fold.
- Responsive artwork (multiple sizes) from `cdn.jubileeverse.com`.
- Edge/CDN stream delivery to cut latency for a global audience.
- Targets: interactive home < 2s on broadband; first audio < 3s of pressing play.

**Reliability (top listener pain point)**
- Healthy client buffer (~5–15s, tunable) to smooth jitter.
- Adaptive bitrate + auto-reconnect with backoff + **data-saver** variant.
- Per-station health monitoring; offline mounts show an "Off Air" tile, never a broken player.

**Accessibility**
- Full keyboard control of the footer player; visible focus states.
- ARIA live region announcing track/station/host changes for screen readers.
- Respect `prefers-reduced-motion` (disable equalizer/marquee/presence animation).
- WCAG AA contrast on all player and nav chrome, across day/night/Shabbat skins.
- Captions/transcripts reserved for any future talk/archived content and for voice-break text where feasible.

---

## 14. Interactivity & Community — including Redeemed Dedications *(Differentiator #9)*

Grounded in sentiment finding #7 — interactivity is internet radio's edge over FM.

- **Phase 1:** Share a station + **share cards** (Section 11D); "♥ Favorite."
- **Phase 2:** Lightweight **reactions** to the current track (🙌 / ❤️ — tied to the Amen pulse) and **song requests** where a station's format allows.
- **Dedications / shout-outs (redeemed):** a listener submits a **prayer request** or **dedicates a song** to someone via `/api/dedication`; the hosting **persona acknowledges it in a voice break** ("This next one's going out over Sarah in Sacramento — be encouraged") through the Voice-Break Service (Section 10A). This is the classic radio shout-out reframed as participation, community, and testimony.
- **Phase 3:** **Live chat** per station during hosted segments, moderated.

All community copy follows OHI naming discipline and the Hebrew article rule. Dedications and any fresh voice content pass a **moderation/safe-content gate** before air; moderation aligns with existing Jubilee content standards.

---

## 15. Gamification (Kingdom Credits Tie-In)

Reuse the existing framework (Kingdom Credits, Daily Decode, Seasonal Drops):

- **Listening streaks** — consecutive days tuned in earn Kingdom Credits.
- **Station badges** — unlock for exploring N stations or a full shelf.
- **Feast & seasonal drops** — Shabbat/Feast-day events (Section 11B) with limited-time badges.
- **Persona collector** — "on air with" all Inspire Family hosts unlocks a family badge.
- **Presence milestones** — worshiping alongside large gatherings (Section 11A) can award moments/badges.

Rewards are opt-in and never gate core listening.

---

## 16. Internationalization

- Language selector inherited from JubiLujah (flag dropdown; Recently Used + All Languages).
- Per-station `language` tag powers a **By Language** shelf, the `/stations?lang=` filter, and the Tune-Me language step.
- UI strings externalized for translation; RTL-ready layout for Hebrew/Arabic/Farsi/Urdu.
- Voice hosts (Section 10A) can, in later phases, deliver breaks in additional languages per persona voice profiles.

---

## 17. SEO & Discoverability

- Clean, human URLs: `/station/throne-room` (canonical) with `?f=344.50` as an alias.
- Per-station meta + Open Graph/Twitter cards (station art + tagline). **Share cards** (Section 11D) generate rich, verse-stamped OG images that pull traffic back.
- Schema.org `RadioStation` / `BroadcastEvent` structured data.
- Sitemap of all stations; server-rendered station pages for crawlability.

---

## 18. Monetization (UPGRADE)

Mirror JubiLujah's UPGRADE model:
- **Free:** full station browsing + listening (ad-supported or fully free per ministry decision).
- **Jubilee Premium:** higher-bitrate streams, no interruptions, exclusive stations/seasonal drops, advanced sleep/wake and offline-friendly features later.
- Subscription managed under the single Jubilee Account.

*(Royalty/licensing posture for any third-party music should be confirmed separately; Jubilee-original catalog sidesteps most of this — see open questions.)*

---

## 19. Hands-Free & Multi-Surface (Car / Smart Speaker / Voice) *(Differentiator #6)*

Radio gets consumed hands-free — so these are **launch channels, not phase 5**.

- **Voice control** — "Alexa/Google, play KJubilee Throne Room" (and by mood — "play Jubilee worship") via a **voice intent layer** (`/voice`) mapping intents to station streams. Smart-speaker skills/actions publish the 101 stations.
- **Car & lock screen** — clean **Media Session API** integration so CarPlay/Android Auto and lock screens show station art, track, artist, and the on-air host, with working transport controls.
- **Universal stream URLs** — each station exposes a direct, stable stream URL that works in any player, no app required.
- **Continuity** — starting on a speaker or in the car and later opening the site resumes the same station.

This multiplies daily habit far more than an extra homepage shelf, so it is scoped into the earliest phases (Section 21).

---

## 20. Technical Architecture Summary

```
┌───────────────────────────────────────────────────────────────┐
│  Listener (browser / phone / car / smart speaker / voice)      │
│    • Persistent shell + footer <audio> (never torn down)       │
│    • hls.js / native HTML5 audio, Media Session API            │
│    • WebSocket/SSE: now-playing + presence + host state        │
│    • Voice intents → station streams                           │
└──────┬───────────────────────────┬────────────────────┬───────┘
       │ artwork/UI                │ audio stream        │ share/voice
       ▼                           ▼                     ▼
 cdn.jubileeverse.com     stream.kjubilee.com    Share-Card Renderer
 (station art, tiles)        (edge/CDN)           + Voice Intent Layer
                                  │
                                  ▼
                     ┌───────────────────────────┐
                     │  Jubilee Radio Engine v3.0 │
                     │   • Liquidsoap (program +  │
                     │     scheduled VOICE BREAKS)│
                     │   • Icecast-KH (serve)     │
                     │   • 101 mounts             │
                     │     HM band 300.00–399.90  │
                     └───────────┬───────────────┘
                                 │ status-json + metadata
                                 ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  KJubilee Services (background services — never "daemons")   │
   │   • Now-Playing Service  (normalize + album/JSV enrich)      │
   │   • Voice-Break Service  (render persona audio → Liquidsoap) │
   │   • Calendar Service     (Shabbat/Feast windows, sunset-aware)│
   │   • Presence Service     (aggregate listener stats)          │
   │   • Curation Service     (adaptive, human-feel ordering)     │
   │   • Tune / Dedication / Share-Card APIs                      │
   └───────────────────────────┬─────────────────────────────────┘
                                 ▼
                    Realtime channel → clients
```

**Stack recommendations (align with existing Jubilee sites):**
- **Frontend:** responsive web app with a persistent player shell; HTML5 `<audio>` + hls.js for adaptive playback; WebSocket/SSE for now-playing/presence; Media Session API for OS/car controls.
- **Streaming backend:** existing Jubilee Radio Engine v3.0 (Liquidsoap + Icecast-KH), with voice breaks scheduled into the program.
- **Services:** background **services** bridging Icecast/Liquidsoap → clients (Now-Playing, Voice-Break, Calendar, Presence, Curation) plus the Tune/Dedication/Share-Card/Voice endpoints.
- **CDN:** `cdn.jubileeverse.com` for artwork; a streaming edge (`stream.kjubilee.com`) for low-latency global audio.
- **Auth:** Jubilee Account SSO.
- **Data:** Station Registry (Section 7) as the single source of truth, synced from the Radio Engine.

---

## 21. Phased Build Roadmap

| Phase | Scope | Definition of done |
|---|---|---|
| **P1 — Core listening + first magic** | Home shelves, **Tune Me** onboarding (#2), station page, persistent footer player, live Icecast playback, now-playing (track/artist/host), **Encounter Layer** (#3), search, language selector, **universal stream URLs + Media Session for car/lock screen** (#6, entry level) | A visitor tunes in via Tune Me or a tile, audio plays continuously across navigation with live metadata + Scripture, and the stream works hands-free with lock-screen controls |
| **P2 — Hosts, presence & accounts** | **Persona voice hosts** (#1) via Voice-Break Service, **corporate presence** (#5), Jubilee SSO, favorites/My Stations, resume-last, **share cards** (#7) | Stations feel hosted and communal; listeners save stations, sync, and share verse-stamped cards |
| **P3 — Calendar, night & reliability** | **Sacred-calendar programming** (#4, Shabbat/Feast automation), **night/soaking + sleep-and-wake** (#8), adaptive bitrate + auto-reconnect + **data-saver** hardening (#10, reliability), station stories, host cards, On Now/Up Next | The site breathes with Yahuah's calendar, owns the overnight hours, and stays rock-solid on weak networks |
| **P4 — Community & rewards** | **Redeemed dedications/shout-outs** (#9) through the voice engine, reactions/Amen pulse, requests, live chat, Kingdom Credits (streaks, badges, seasonal/feast drops) | Listeners interact, dedicate, and earn rewards; personas voice their shout-outs on air |
| **P5 — Reach & intelligence** | Full **voice/smart-speaker skills** (#6, deepened), **adaptive curation** at scale (#10), archived-show replay, native mobile apps, deeper i18n/RTL and multilingual voice | Multi-surface, self-improving, multilingual reach |

---

## 22. Acceptance Criteria

**P1 gate**
1. Home renders themed shelves of station tiles with cover art + HM-band dial numbers.
2. **Tune Me** resolves 3 taps into a best-fit station that starts playing automatically.
3. Tapping any tile navigates to that station page **and** starts playback.
4. Footer player is present on every route and **audio does not restart** on navigation.
5. Now-playing (track + artist/persona + on-air host) updates in real time on footer and station page.
6. **Encounter Layer** shows the correct JSV verse + declaration for the current track and links into AI Bible Chat.
7. Starting a new station cleanly stops the previous stream (no double audio).
8. Playback auto-reconnects after a simulated network drop.
9. Search returns stations by name, format, persona, and tag.
10. Language selector switches UI language and persists the choice.
11. Now-playing album deep-links to the correct `jubilujah.com/album?c=CODE`.
12. Universal stream URL plays in an external player; **Media Session** shows art/track/host with working controls.
13. Fully keyboard-operable footer player with screen-reader announcements of track/station/host changes.

**Signature-feature gates (P2–P4)**
14. A persona **voice break** plays on schedule and the now-playing state flips to "🎙 On air: [persona]."
15. **Corporate presence** shows an accurate aggregated listener count and Amen pulse.
16. A **share card** renders the current track + verse + station art and links back to the station.
17. **Shabbat mode** activates automatically at Friday sundown (per locale) and reverts at Saturday sundown; a **Feast** day auto-triggers its lineup and drop.
18. A **night/soaking** station plays overnight; **sleep timer** fades out on schedule and **wake-with-worship** starts on schedule.
19. A submitted **dedication** clears moderation and is acknowledged by the persona in an on-air voice break.
20. **Data-saver** forces the low-bitrate variant and playback stays smooth on a throttled connection.

---

## 23. Open Questions / Inputs Needed

1. **Definitive station list** — confirm the 101 stations, their HM-band dial numbers, formats, and which Inspire Family persona hosts each (from the Radio Engine registry).
2. **Voice-host scope** — which stations are persona-hosted vs. purely automated/themed, and the default break cadence per station.
3. **Voice production** — confirm Inspire Voice Studio / OmniVoice as the render path and whether fresh (dedication/feast) breaks render on demand or in batches.
4. **Shelf curation** — approve the proposed home shelves (Section 7), or provide preferred groupings.
5. **Sacred-calendar rules** — confirm sunset-computation source per locale and the exact Feast list + which are OHI-only vs. include CCI (e.g., Christmas) contexts.
6. **Dedication moderation** — ownership, turnaround, and safe-content review flow before a dedication airs.
7. **Free vs. Premium split** — which stations/features sit behind UPGRADE.
8. **Licensing posture** — confirmation that all streamed catalog is Jubilee-original (simplifies royalty handling).
9. **Domain/stream hosts** — confirm `stream.kjubilee.com` (or alternative) as the streaming edge hostname, and the smart-speaker skill accounts.
10. **Presence privacy** — approve coarse/region-level only for the global-lights map (no precise location).

---

*Draft v2.0 — the consolidated, build-ready specification for KJubilee.com with all ten signature differentiators integrated. Ready for your review and edits before we lock scope and hand off to the build team.*
