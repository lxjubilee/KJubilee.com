# Jubilee Radio — Business Requirements Document

**Project:** JubileeVerse.com Kingdom Radio
**Document Version:** 1.0
**Source:** Architecture conversation transcript, 2026-05-18 / 19
**Scope:** AI-automated radio network of 102 stations across multiple languages, served via cdn.jubileeverse.com and rendered via jubileeverse.com/radio.html.
**Status:** Requirements consolidated, awaiting implementation slice planning.

**Companion document:** [Radio-Engine-Spec.md](Radio-Engine-Spec.md) — implementation specification (Icecast-KH + Liquidsoap stack, locked versions). This BRD describes *what* the system must do; the Spec describes *how* it is built.

---

## Table of Contents

- [A. Infrastructure & Storage](#a-infrastructure--storage)
- [B. Station Identity & Configuration](#b-station-identity--configuration)
- [C. Scheduling & Compilation](#c-scheduling--compilation)
- [D. Sentiment, Rotation & Weights](#d-sentiment-rotation--weights)
- [E. Playlists & Segments](#e-playlists--segments)
- [F. DJ Personas](#f-dj-personas)
- [G. Music Catalog Metadata](#g-music-catalog-metadata)
- [H. Jingles, Sweepers, Commercials](#h-jingles-sweepers-commercials)
- [I. Listener Engagement](#i-listener-engagement)
- [J. Operations: Analytics, Failover, Archive](#j-operations-analytics-failover-archive)
- [K. Player & Broadcast Semantics](#k-player--broadcast-semantics)
- [L. Special Programming & Network Coordination](#l-special-programming--network-coordination)
- [M. Human Oversight & Admin](#m-human-oversight--admin)
- [N. Generation Pipeline](#n-generation-pipeline)
- [Implementation Roadmap](#implementation-roadmap-suggested)

---

## A. Infrastructure & Storage

### BR-A1 — Single Cloudflare Zone, Subdomain Strategy
The CDN is hosted as `cdn.jubileeverse.com`, a **subdomain** of the existing `jubileeverse.com` Cloudflare zone — not a separate zone. Rationale: Cloudflare bills per zone; subdomains are free under the parent zone. Use a separate zone only if independent firewall, caching, or DNS rules are required.

### BR-A2 — JSON Files on CDN, No Database
All radio state — station profiles, DJ profiles, rotation files, playlist runbooks, feedback aggregates — is stored as JSON files on the CDN. No database for radio scheduling state.

Rationale: JSON parses faster than YAML at scale, caches natively at the edge, and avoids whitespace fragility. File writes use atomic rename (`.tmp` → `.json`) to prevent concurrent-write corruption. Per-file size budget < 500 KB so edge caching stays effective.

### BR-A3 — Per-Station Folder Architecture

Each station is an autonomous folder. Reference layout (already partially built for HM088.70-EN):

```
/cdn/radio/<STATION_ID>/
  _config/         station-profile.json, dj-profiles.json, dj-roster.json,
                   seasonal-calendar.json, fallback-playlist.json, taxonomies/
  branding/        station logo, banners
  delivery/        content manifests (music.json, jingles.json, sweepers.json, …)
  playlists/       <YYYY-MM-DD>-<cycle>.json — daily runbooks
  rotation/        <YYYY-MM-DD>.json — daily rotation file
  feedback/        <YYYY-MM-DD>.json — daily engagement aggregate
  analytics/       <YYYY-MM-DD>.jsonl — append-only event log
  voicemail/       listener-submitted voice messages (pending/approved/rejected)
  jingles/         <station>-jingle-full.mp3, -medium.mp3, -short.mp3, -stinger.mp3
  sweepers/        persona-specific transition audio
  voiceovers/      station IDs, taglines, time announcements
  teaching/        scheduled teaching segments
  prayer/          prayer audio + transcripts
  declarations/    morning declarations audio
  scriptures/      scripture readings
  commercials/     approved promotional spots + daily rotation file
  special/         seasonal content (chanukah/, christmas/, easter/, pesach/, purim/,
                   shabbat-special/, shavuot/, sukkot/, yom-kippur/, yom-teruah/)
  stories/         narrative content
  _archive/        rotation/, playlists/ — 365-day retention
```

A station can be disabled by setting `enabled: false` in `_config/station-profile.json` without affecting other stations.

---

## B. Station Identity & Configuration

### BR-B1 — Per-Station Time Zone (anchored to host city)
Each station declares `host_city` and an IANA `timezone` (e.g. `America/Los_Angeles`). All scheduling — day-part boundaries, "now playing" calculations, ID/jingle timing — runs in station-local time. DST handled by the IANA TZ database, not hardcoded offsets.

### BR-B2 — HM Frequency Designation
Each station identified by an HM (Hertley Modulation) frequency string (e.g. `HM 088.70`, `HM 305.40`). Frequency space partitioned by band (`fivefold`, `multi`, `mainstream`, plus designated test band). No two stations share an HM number.

### BR-B3 — Cycle Codes (m / a / e / n)

Four named six-hour cycles in station-local time:

| Code | Name      | Local hours      |
| ---- | --------- | ---------------- |
| `m`  | Morning   | 06:00 – 12:00    |
| `a`  | Afternoon | 12:00 – 18:00    |
| `e`  | Evening   | 18:00 – 24:00    |
| `n`  | Night     | 00:00 – 06:00    |

Used consistently across all rotation, playlist, analytics, and admin artifacts.

### BR-B4 — Station Profile File

`/cdn/radio/<STATION>/_config/station-profile.json` declares:

- Identity: `station_id`, `frequency`, `name`, `host_city`, `timezone`, `language`, `format` (`music` / `talk` / `teaching` / `mixed`).
- `theological_emphasis`: tags like `["praise","five-fold-ministry","torah"]`.
- `target_audience`: `family` / `adult` / `kids-3-5` / `kids-6-8` / `celestial`.
- `tag_team_enabled`: bool.
- `allowed_segments`: object keyed by cycle (`m`/`a`/`e`/`n`) listing permitted segment types. Compiler refuses to schedule segment types not in this list for the current cycle.
- `segment_density`: songs-per-hour and DJ-speak frequency per cycle.
- `required_mode`: `"OHI"` / `"Non-OHI"` / `"Both"` (already used in current data).
- `family_friendly_required`: bool.
- `accepts_network_events`: bool.

This file plus the DJ profile file plus the playlist file form the three-level configuration hierarchy.

### BR-B5 — Multi-Language Stations
Each station declares an ISO 639-1 `language_code`. TTS engine, jingles, voice-overs, and any LLM-generated content for that station are produced in that language. The compiler engine is language-agnostic — only the voice/asset layer changes.

---

## C. Scheduling & Compilation

### BR-C1 — Dynamic Compilation, Not Pre-Compiled
No playlist compiled more than 12 hours in advance. The compiler runs at-time with access to current date, season, scheduled themes, listener feedback, and external cultural-sentiment signals (BR-D2).

### BR-C2 — Six-Hour Cycle Compilation
Each station's day is divided into four playlists, one per cycle (m/a/e/n). A scheduler job runs per cycle per station in station-local time. Compilation completes within 60 s of cycle boundary.

### BR-C3 — Three-Hour Lookahead Pre-Compile
The *next* cycle's playlist begins compilation at the **midpoint of the current cycle (T+3h)**, using listener feedback from the first 3 hours plus current cultural-sentiment data. This eliminates last-minute compilation pressure and ensures smooth cycle transitions. The pre-compiled playlist becomes active at the next cycle boundary; if feedback materially changes in the last 3 hours, a re-compile is permitted.

### BR-C4 — Compiler / Scheduler Service

A backend service runs compile jobs. Responsibilities:

- Cron-style trigger at cycle midpoint and cycle boundary per station's local timezone.
- Read station profile, DJ profiles, rotation file, manifests, feedback aggregate, external sentiment feed.
- Emit playlist runbook (BR-E1).
- Optionally pre-render TTS for DJ-speak segments.
- Update rotation file in place after the cycle completes (play counts, weight nudges).

Acceptance:

- Idempotent: same inputs → same playlist (logged random seed).
- Resource budget: < 30 s wall time, < $0.50 in TTS/LLM costs per compile.
- One station's compile failure doesn't block others.
- Manual re-compile trigger via admin UI.
- Every compile decision logged (which tracks selected, with what weights, why).

---

## D. Sentiment, Rotation & Weights

### BR-D1 — Daily Rotation File (one per station per day, mutable in place)

One rotation file per station per day at `/cdn/radio/<STATION>/rotation/<YYYY-MM-DD>.json`. Generated at start of station-local day from yesterday's feedback + sentiment. **Updated in place** throughout the day — never replaced, never appended-to-history.

Schema:

```json
{
  "station_id": "hm088-70-en",
  "rotation_date": "2026-05-19",
  "generated_at": "2026-05-19T00:00:00-07:00",
  "last_updated_at": "2026-05-19T14:23:11-07:00",
  "tracks": [
    {
      "track_id": "JIMX1001EN01-angelic-anthem",
      "title": "Angelic Anthem",
      "artist": "Jubilee Inspire",
      "tier": "A",
      "cycles": {
        "m": { "weight": 0.85, "plays": 2, "max_plays": 3 },
        "a": { "weight": 0.60, "plays": 0, "max_plays": 2 },
        "e": { "weight": 0.40, "plays": 0, "max_plays": 2 },
        "n": { "weight": 0.20, "plays": 0, "max_plays": 1 }
      }
    }
  ]
}
```

**Decay model explicitly rejected** by stakeholder. Weights can shift in-day, but track identity/presence does not churn.

### BR-D2 — External Cultural Sentiment Input
Beyond listener feedback, the rotation/playlist compiler consumes a **cultural sentiment feed** that monitors news and social signals. When the cultural moment shifts (e.g. war anxiety, mass tragedy, celebration), the compiler weights tracks tagged with matching themes (comfort, hope, lament, joy) accordingly. The feed is updated independently and read by the compiler; no in-band coupling to listener engagement data.

Acceptance:

- `_config/sentiment-sources.json` declares which feeds are consulted (news APIs, social-trend APIs).
- A `current-sentiment.json` snapshot is written at least every 6 hours.
- Compiler reads the snapshot at compile time and biases track selection toward tracks with matching `mood_tags` / `theme_tags` (BR-G1).

### BR-D3 — Rotation Tiers

Tracks slot into traditional radio rotation tiers:

| Tier | Target frequency | Catalog share |
| ---- | ---------------- | ------------- |
| A — Heavy     | every ~90 min     | ~10% |
| B — Medium    | every ~3 hr       | ~25% |
| C — Light     | every ~6 hr       | ~40% |
| D — Discovery | every 12–24 hr    | ~15% |
| Archive       | rare / on-demand  | ~10% |

Tier-movement constraint: no track moves more than one tier per refresh. New tracks enter at tier D and only promote via measured engagement.

### BR-D4 — Variety / Anti-Repetition (hard constraints layered over weights)

- No track plays more than once in any 6-hour cycle.
- No track plays more than `max_plays` per cycle (defined in rotation file).
- No artist back-to-back; minimum 2 tracks between same artist.
- A weighted-random selection that violates a hard constraint is re-rolled.

### BR-D5 — No PRO / Music Licensing Reporting
All music is AI-generated and owned by the operator. No external licensing tracking required for royalty/PRO purposes. Internal play tracking (BR-J1 analytics) remains for engagement and operational use.

---

## E. Playlists & Segments

### BR-E1 — Playlist = AI DJ Runbook (custom JSON format)

The playlist is not a passive track list — it is an **execution script** for the AI DJ engine. Ordered sequence of segments; each segment carries everything the player needs to execute it.

Path: `/cdn/radio/<STATION>/playlists/<YYYY-MM-DD>-<cycle>.json`

Schema:

```json
{
  "station_id": "hm088-70-en",
  "playlist_date": "2026-05-19",
  "cycle": "m",
  "generated_at": "2026-05-19T05:55:00-07:00",
  "segments": [
    { "type": "station_id", "resource_id": "id-jubilee-praise-01", "duration_s": 8 },
    { "type": "dj_intro", "persona": "jubilee-inspire", "script": "Good morning…",
      "voice_tone": "warm", "duration_s": 12,
      "fade_out_at_s": 10, "next_song_fade_in_at_s": 9 },
    { "type": "song", "resource_id": "JIMX1001EN01-angelic-anthem", "duration_s": 232 },
    { "type": "sweeper", "resource_id": "into-prayer-03", "duration_s": 4 },
    { "type": "prayer", "resource_id": "prayer-2026-05-19-m", "duration_s": 90 }
  ]
}
```

### BR-E2 — Supported Segment Types
`song`, `station_id`, `jingle`, `sweeper`, `dj_intro`, `dj_speak`, `dj_outro`, `prayer`, `declaration`, `scripture_reading`, `scripture_commentary`, `testimony`, `reflection_prompt`, `voiceover`, `time_announcement`, `commercial`, `user_feedback_text`, `user_feedback_voice`, `special_event`.

### BR-E3 — Voice Synthesis & Crossfade Transitions
DJ-speak segments rendered via TTS. The player engine crossfades: last 10–20% of DJ-speak duration overlaps the next song's first second. Timing metadata (`fade_out_at_s`, `next_song_fade_in_at_s`) carried per segment so JavaScript renders the transition deterministically.

If TTS fails at runtime, fall back to a pre-recorded "we'll be right back" filler from the station's `voiceovers/` folder.

### BR-E4 — Engagement Segments (scripture, prayer, declaration, commentary)
Beyond songs and DJ-speak, the playlist supports ministry-specific engagement segments. Permitted segment types per cycle are declared in the station profile (BR-B4). Compiler can chain `scripture_commentary` → themed song where the song's `theme_tags` match the scripture's topic (e.g. grace commentary → grace-themed song).

---

## F. DJ Personas

### BR-F1 — Persona Registry (network-level, 12 personas)

Network maintains 12 AI DJ personas. Each persona has:

- `persona_id`, `display_name`, `gender`.
- `voice_name` (TTS voice identifier — e.g. `en-US-AriaNeural`).
- `voice_provider` (`azure-tts`, `elevenlabs`, etc.).
- Languages supported.

**The `voice_name` is global to the persona** — Jubilee's voice sounds the same wherever she appears.

### BR-F2 — DJ Profile File (per-station-per-persona character profile)

Path: `/cdn/radio/<STATION>/_config/dj-profiles.json`.

**Same persona can have different character profiles on different stations.** Jubilee on station A: energetic + funny. Jubilee on station B: solemn + academic. Same voice, different persona-on-this-station traits.

Schema (excerpt):

```json
{
  "personas": {
    "jubilee-inspire": {
      "voice_name": "en-US-AriaNeural",
      "myers_briggs": "ENFJ",
      "tone_palette": ["energetic","warm","funny"],
      "speech_patterns": ["Good morning, beloved","Isn't that wonderful?"],
      "topical_focus": ["worship","encouragement"],
      "default_cycles": ["m"],
      "weekend_cycles": ["m","a"],
      "tag_team_partners": ["elias-inspire"],
      "humor_level": 0.7,
      "solemnity_level": 0.3
    }
  }
}
```

The compiler injects `tone_palette` + `speech_patterns` + `humor_level` into TTS prompts for DJ-speak segments. Living document — admin edits picked up by next compile cycle.

### BR-F3 — DJ Roster — Variable Count by Station Type

DJ count is NOT fixed at 3–4. Driven by station format:

- Music-only: 2–3 personas.
- Talk / teaching: 4–6 personas.
- Tag-team-enabled: minimum 2 personas paired per cycle.

`_config/dj-roster.json` declares the roster, default cycle assignment, weekend overrides, and tag-team pairs:

```json
{
  "personas": ["jubilee-inspire","melody-inspire","elias-inspire","caleb-inspire"],
  "default_assignment": { "m":"jubilee-inspire","a":"melody-inspire","e":"elias-inspire","n":"caleb-inspire" },
  "weekend_assignment": { "m":"melody-inspire","a":"jubilee-inspire","e":"caleb-inspire","n":"elias-inspire" },
  "tag_team_pairs": [["jubilee-inspire","elias-inspire"]],
  "rotation_period_days": 7
}
```

Rules:

- One persona owns each cycle (consistency for listeners).
- Persona-to-cycle assignment rotates weekly/monthly (variety; nobody overused).
- No two adjacent cycles use the same persona (avoids 12-hour shifts).
- DJ-speak segment whose `persona` isn't in the station's roster is refused by the compiler.

---

## G. Music Catalog Metadata

### BR-G1 — Track-Level Metadata Enrichment
Every track carries rich metadata enabling contextual selection:

- Acoustic: `duration_s`, `bpm`, `key`, `energy` (0–1), `valence` (0–1).
- Semantic: `mood_tags`, `theme_tags`, `scripture_refs`.
- Operational: `language`, `family_friendly`, `mode` (OHI/Non-OHI/Both), `explicit`, `preferred_cycles`.
- Identity: `track_id`, `title`, `artist`, `album`.

The compiler filters by `preferred_cycles` (don't queue energy=0.95 tracks at night), matches `mood_tags` against cultural-sentiment input (BR-D2), and chains `scripture_refs` for commentary → themed-song handoffs.

Controlled vocabularies for `mood_tags`, `theme_tags`, `scripture_refs` live in `_config/taxonomies/`.

### BR-G2 — Manifest-Driven Catalog
Each station's available content is described by manifest JSONs under `/cdn/radio/<STATION>/delivery/`: `music.json`, `jingles.json`, `sweepers.json`, `voiceovers.json`, `teaching.json`, `prayer.json`, `commercials.json`, `special.json`, plus a `manifest.json` index.

Schema is versioned (`schema_version: 2.0` already established in HM088.70 set). Manifest URLs are CDN-relative (`/cdn/...`), not absolute. Compiler treats manifests as the source of truth — nothing plays that isn't declared in a manifest.

### BR-G3 — Content Ingestion & Approval Workflow

New tracks, jingles, voice-overs, and commercials enter via:

1. **Ingest** to `_incoming/` (per artist or per station).
2. **Auto-checks**: duration, bitrate, loudness (LUFS normalization), language detection, content filter.
3. **Tag** with required metadata (BR-G1).
4. **Review** in human approval queue.
5. **Approve** → promoted into canonical folder + manifest updated.
6. **Reject** → moved to `_rejected/` with reason.

Auto-approval is allowed for known-safe sources (internal Suno generations passing checks); manual approval required otherwise. Nothing in `_incoming/` is playable.

---

## H. Jingles, Sweepers, Commercials

### BR-H1 — Station Jingles (3+ variations per station)

Each station has at minimum 3 jingle variations:

- **Full** (15–20 s) — start of each cycle + cycle boundary.
- **Medium** (~8 s) — interjected at natural breaks every ~15 min.
- **Short** (~5 s) — between back-to-back songs.
- **Stinger** (~2 s) — optional, for emphasis.

Files: `/cdn/radio/<STATION>/jingles/<station>-jingle-{full,medium,short,stinger}.mp3`.

Compiler picks variation based on context (full after long DJ-speak; short between two songs). AI logic places jingles at natural breaks — not strictly at the top of every hour. Station personality and language reflected in jingle sound and language.

### BR-H2 — Commercials (cap 4–6 per day, contextual)

Each station has `commercials/` + a daily rotation file at `/cdn/radio/<STATION>/commercials/<YYYY-MM-DD>-rotation.json`.

Rules:

- **Hard cap: 6 commercials per station per day.** Compiler refuses to schedule a 7th.
- Default distribution: 1–2 morning, 1 afternoon, 1 evening, 0 night. Front-loaded to higher-engagement hours.
- Contextual selection: spot `context_tags` matched against current cycle content (prayer-heavy cycle → BornAgainDNA spot; music-heavy → JubileeInspire spot).
- No commercial repeats within 6 hours.
- All spots ~30 seconds.
- Promotes ministry properties (JubileeVerse, JubileeInspire, JubileeFirst, BornAgainDNA, etc.) — no third-party ads.

---

## I. Listener Engagement

### BR-I1 — Engagement Signals — Thumbs, Skip, Favorite, Comment

The radio page collects:

- 👍 / 👎 buttons next to now-playing.
- ⭐ favorite-station toggle (persists per user).
- Skip event (treated as engagement signal, see BR-K3).
- Text comments on currently-playing segment.

Events POST to `/api/radio/feedback` with `{ station_id, segment_id, segment_type, event_type, user_id_or_anon, timestamp }`. Anonymous allowed via session ID; authenticated counts more heavily in sentiment.

Daily aggregate at `/cdn/radio/<STATION>/feedback/<YYYY-MM-DD>.json` feeds the next day's rotation tier adjustments (BR-D3) and rotation-file weight nudges (BR-D1).

### BR-I2 — Voice Message Submission → On-Air Playback

Listeners can record voice messages from their phone/app expressing affinity for the station, gratitude, prayer requests, etc. Pipeline:

1. **Record** — listener captures audio in the app.
2. **Upload** to `/api/radio/<STATION>/voicemail` → stored at `/cdn/radio/<STATION>/voicemail/pending/<uuid>.mp3`.
3. **Transcribe** — auto-transcription (STT) produces text version next to audio.
4. **Verify** — human moderation queue reviews transcript for safety/appropriateness; approves or rejects.
5. **Approve** → moved to `voicemail/approved/<uuid>.mp3` + `.txt`.
6. **Schedule** — compiler may schedule a `user_feedback_voice` segment that plays the message during a cycle-appropriate slot (typically evening or night for reflective moments).

Acceptance:

- All voicemail playback requires explicit approval — nothing auto-plays.
- Submitter identity logged but not broadcast unless explicitly opted in.
- Approval audit trail retained.

### BR-I3 — Now-Playing Feed
Listeners see current segment + next 2 upcoming segments in real time via `GET /api/radio/<STATION>/now-playing`. Update mechanism: Server-Sent Events preferred (one-way push, CDN-friendly); polling (5–10 s) acceptable as v1 fallback.

Payload includes `segment_type`, `title`, `artist`, `album`, `cover_url`, `started_at_utc`, `duration_s`, `dj_persona`. Update latency < 2 s from segment transition. Cross-page sticky footer keeps state when navigating.

---

## J. Operations: Analytics, Failover, Archive

### BR-J1 — Analytics & Telemetry

Every playback event logged at `/cdn/radio/<STATION>/analytics/<YYYY-MM-DD>.jsonl` (JSONL, append-friendly). Event schema:

```json
{
  "event": "segment_played",
  "station_id": "hm088-70-en",
  "cycle": "m",
  "segment_type": "song",
  "resource_id": "JIMX1001EN01-angelic-anthem",
  "started_at_utc": "...",
  "duration_played_s": 232,
  "duration_total_s": 232,
  "completion_rate": 1.0,
  "concurrent_listeners": 47,
  "thumbs_up_count": 3,
  "thumbs_down_count": 0,
  "skip_count": 0
}
```

Daily feedback aggregate at `feedback/<YYYY-MM-DD>.json` feeds rotation updates. Retained for **operational analysis only**, no licensing compliance horizon (BR-D5).

### BR-J2 — Failover & Graceful Degradation

Radio must never play silence. Fallback chain:

| Failure | Fallback |
| ------- | -------- |
| Playlist file missing/corrupt | Use yesterday's playlist |
| Track 404 | Skip to next segment |
| TTS fails at runtime | Pre-recorded "we'll be right back" voiceover |
| Manifest fetch fails | `_config/fallback-playlist.json` |
| All else | Loop station jingle until ops intervention |

Every fallback fires a high-priority log event. Admin UI surfaces stations in fallback mode.

### BR-J3 — Backup & Archive — 30-Day Fallback, 365-Day Archive

- Yesterday's rotation and playlist files kept on disk as immediate backup.
- **30-day fallback pool**: if today's playlist generation fails, the player selects a **random** playlist from the previous 30 days for that station and cycle.
- **365-day archive**: all playlists and rotation files retained for one year — that's `365 × 4 = 1,460` playlist files per station per year (manageable storage, valuable historical data).
- Daily archive job runs at 00:01 station-local time, moving older snapshots to `_archive/`.
- Disaster recovery: any day in the past 365 can be restored to today's slot with a single file copy.

---

## K. Player & Broadcast Semantics

### BR-K1 — Broadcast Model (CRITICAL — current player must be refactored)

A radio station is a **shared synchronized broadcast** — every listener hears the same content at the same moment. The current `public/radio.html` implementation is **on-demand per-user** (each user gets their own shuffle), which is incompatible with the rotation / DJ-speak / jingle architecture described above.

**Two architectural options:**

| Option | Description | Pros | Cons |
| ------ | ----------- | ---- | ---- |
| **A — Server-side stream encoder** | Persistent ffmpeg/Liquidsoap process per station emits HLS or Icecast stream from the runbook | Classic radio; supports all features faithfully | Server infrastructure for 102 stations |
| **B — Deterministic client-side playback** | Playlist published with absolute UTC start times; client computes "what should be playing now" and seeks in | No server audio infra; static CDN only | Clock drift; mid-segment join awkward; listener count is guesswork |

Decision must be made and documented before more player code is built. **Option A is recommended** for fidelity and aligns with the existing [Radio-Engine-Spec.md](Radio-Engine-Spec.md) stack (Icecast-KH + Liquidsoap).

### BR-K2 — Now-Playing Continuity
A new listener tuning in mid-segment starts from the **current playhead**, not from segment start. Joining mid-song means joining the song where everyone else is.

### BR-K3 — Skip Semantics
The skip button records an engagement signal (BR-I1) but does **not** actually skip the broadcast — the listener hears what the broadcast plays. Skip is a vote against the track, not a personal navigation control. (Option A above enforces this naturally; Option B allows personal desync if desired but still records the vote.)

---

## L. Special Programming & Network Coordination

### BR-L1 — Seasonal / Holiday Programming
Each station's `special/` folder holds holiday content: Christmas, Easter, Pesach, Shavuot, Sukkot, Chanukah, Yom Kippur, Yom Teruah, Purim, Shabbat. `_config/seasonal-calendar.json` declares date ranges and content multipliers per season. During a window, the compiler boosts matching `theme_tags` and pulls extra content from `special/<season>/`.

Hebraic calendar dates computed via a Jewish-calendar library (station-local time). Network-wide seasonal coordination supported (e.g. all stations recognize Christmas; only Hebraic-aligned stations recognize Yom Teruah).

### BR-L2 — Cross-Station Network Events
Network-level events can preempt station playlists simultaneously (e.g. coordinated minute of prayer, network sermon broadcast). Definition at `/cdn/radio/_network/events/<event-id>.json` with `scheduled_at_utc`, `duration_s`, `segment`, language variants, and `preempts_playlist` flag.

Stations opt-out via `accepts_network_events: false` in profile. Every network-event execution per station logged.

---

## M. Human Oversight & Admin

### BR-M1 — Admin UI Surfaces

The admin UI exposes:

- "Next 24 hours of compiled playlists" per station.
- Per-station block-list (artists, tracks, terms) honored by compiler.
- Per-station manual override mode (upload a fixed playlist for a window).
- Voicemail moderation queue (BR-I2).
- Content ingestion approval queue (BR-G3).
- Fallback-mode station list (BR-J2).
- Audit log of every override, approval, and network event.

### BR-M2 — Pin / Block Capabilities

Admin can:

- Manually pin a track to a rotation tier (e.g. force a new release to tier A for a launch weekend) — pin overrides feedback-driven movement.
- Hard-block a track, artist, or term per station.
- Pause AI compilation for a station (manual mode).

---

## N. Generation Pipeline

### BR-N1 — AI Generation Provider Integration

The system has hooks for:

- **Music generation** (Suno or equivalent) — produces new tracks; outputs land in BR-G3 ingest pipeline.
- **TTS** (Azure Neural, ElevenLabs, etc.) — produces DJ-speak audio per BR-E3.
- **STT** — transcribes voicemail submissions per BR-I2.
- **LLM** (Anthropic Claude or equivalent) — drafts DJ-speak scripts, generates jingle ideas, writes scripture commentary, produces seasonal liners.

Providers configured in `_config/generation-providers.json` with API keys, models, voice catalogs. Provider abstraction: switching from Azure TTS to ElevenLabs requires only a config change. Generation cost tracked per request and aggregated daily. LLM prompts versioned for reproducibility.

---

## Implementation Roadmap (Suggested)

| Phase | Slice | BRs |
| ----- | ----- | --- |
| 1 | Single-station vertical: HM088.70 broadcast model + cycle scheduling + rotation + playlist runbook | BR-A1, A2, A3, B1–B5, C1–C4, D1, D3, D4, E1–E4, K1–K3 |
| 2 | DJ personas + voice synthesis | BR-F1–F3, E3 |
| 3 | Jingles, commercials, engagement segments | BR-H1, H2, E4 |
| 4 | Listener engagement (thumbs, comments, voicemail) | BR-I1–I3, J1 |
| 5 | Sentiment-driven compilation + content ingestion | BR-D2, G1–G3 |
| 6 | Failover, archive, special programming | BR-J2, J3, L1, L2 |
| 7 | Replicate to remaining 101 stations | All |

---

## Document History

| Version | Date | Author | Change |
| ------- | ---- | ------ | ------ |
| 1.0 | 2026-05-19 | Claude (consolidated from architecture conversation) | Initial BRD captured from stakeholder transcript |
