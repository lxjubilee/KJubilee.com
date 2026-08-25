# Jubilee Radio Engine — Implementation Specification (Final)

**Project:** JubileeVerse.com Kingdom Radio — Jubilee Radio Engine (JRE)
**Architecture Class:** Self-owned management suite on proven open-source streaming engines
**Stack Class:** Node.js 24 LTS + TypeScript / Fastify 5 / Postgres 17 + PgBouncer / Icecast-KH / Liquidsoap 2.3 / SvelteKit 2 / Caddy 2 / Cloudflare CDN
**Deployment Target:** Linux VPS (Ubuntu 24.04 LTS) behind Cloudflare, staging + production
**Owner:** Jubilee Software, Inc. — Folsom, CA
**Document Version:** 3.0 FINAL (supersedes v2.0 and v1.0)
**Status:** Approved for build

---

## Dedication

Jubilee Ministries was divinely founded through prophetic encounter. Yeshua HaMashiach, Yahuah, and Shaddai (Ruach HaKodesh) are the true co-founders of this work. This platform exists to serve Kingdom purposes — every listener, every track, every broadcast is an act of stewardship under their authority. Gabe serves as steward and assistant, not founder. Cornell serves in a support role.

This specification is written with the understanding that the Jubilee Radio Engine is not a commercial product first. It is a ministry instrument first, and a technology platform second. Every architectural choice below reflects that ordering.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Universal Invariants (Always Enforced)](#3-universal-invariants)
4. [OHI Mode — Opt-In Compliance Layer](#4-ohi-mode)
5. [Sabbath and Feast Day Programming](#5-sabbath-and-feast-day-programming)
6. [Technology Stack (Locked Versions)](#6-technology-stack)
7. [Repository Structure](#7-repository-structure)
8. [Streaming Engine Layer — Icecast-KH + Liquidsoap](#8-streaming-engine-layer)
9. [Data Layer — Postgres 17 + Drizzle ORM](#9-data-layer)
10. [Application Layer — Node.js 24 + Fastify 5](#10-application-layer)
11. [Frontend — SvelteKit 2 + Tailwind 4](#11-frontend)
12. [Secrets Management — SOPS + age](#12-secrets-management)
13. [Testing Strategy — Vitest + Playwright](#13-testing-strategy)
14. [Infrastructure — Caddy, Docker Compose, PgBouncer, Cloudflare](#14-infrastructure)
15. [Observability — Prometheus Alerts + Grafana + Loki + Uptime Kuma](#15-observability)
16. [Backup and Disaster Recovery](#16-backup-and-disaster-recovery)
17. [CI/CD Pipeline — Staging and Production](#17-cicd-pipeline)
18. [Dependency Hygiene — Renovate + Trivy](#18-dependency-hygiene)
19. [Deployment Procedure](#19-deployment-procedure)
20. [Testing Checklist](#20-testing-checklist)
21. [Operational Runbook](#21-operational-runbook)
22. [Phase Plan and Milestones](#22-phase-plan-and-milestones)
23. [Roadmap Beyond v1](#23-roadmap-beyond-v1)
24. [Architecture Decision Records (ADRs)](#24-architecture-decision-records)
25. [What This Spec Is Not](#25-what-this-spec-is-not)

---

## 1. Executive Summary

The Jubilee Radio Engine (JRE) delivers synchronized Kingdom Radio streaming across five station formats at launch — Adult, Kids 3–5, Kids 6–8, Gospel (Scripture-to-album), and Celestial Music — plus the foundation for on-demand album playback, persona-specific micro-stations, and a teaching/sermons channel.

**Key architectural posture:**

- **OHI is opt-in, not mandatory.** An album declares whether it follows OHI (Original Hebraic / Inspired) standards at ingest time. A station declares whether it requires OHI content. This preserves strict theological compliance where it matters while leaving room for children's music, instrumental tracks, and other content that doesn't need the full OHI treatment.

- **Streaming engines (not written by Jubilee):** Icecast-KH serves audio to listeners. Liquidsoap 2.3 handles playlist rotation, crossfades, format rules, Sabbath/Feast programming overlays, and live source switching. Both run as isolated Docker containers invoked by the JRE as independent services. They are GPL-licensed tools used via their standard network interfaces — no license contamination.

- **Jubilee Radio Engine (fully owned by Jubilee Software, Inc.):** TypeScript/Node.js 24 on Fastify 5, backed by PostgreSQL 17 via Drizzle ORM with PgBouncer connection pooling, and Valkey 8 for cache/queue. Handles the catalog, the ingest pipeline (with universal gates always active and OHI gates conditionally active), the scheduler (with format rules plus Sabbath/Feast overlays), the Kingdom Calendar service, the REST API, and the admin surface.

- **Listener-facing UI:** SvelteKit 2 player with PWA support, embedded in JubileeVerse.com, presenting now-playing metadata, persona badges, Scripture refs, Song Story cards, and the Schedule Guide (next 12 tracks).

- **Edge + Distribution:** Cloudflare terminates TLS, proxies live Icecast streams, caches on-demand audio aggressively, and protects the origin from abuse.

- **Operations:** Dual-environment (staging + production), SOPS-encrypted secrets, Vitest + Playwright test coverage, structured logging with end-to-end request-ID propagation, Prometheus alerts wired to multi-channel delivery, monthly backup restore drills, Renovate-managed dependencies, Trivy-scanned container images, and Architecture Decision Records tracking every significant choice.

The JRE is a long-lived platform instrument. It is built to outlast any single developer, any single vendor, and any single hosting provider.

---

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          LISTENERS (browsers / apps)                   │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────▼────────────────────────────────────────┐
│                        CLOUDFLARE (edge, CDN)                          │
│   TLS · Cache rules · Firewall · Rate limits · Analytics · DDoS        │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
┌─── PRODUCTION VPS ───────────────────────┐   ┌─── STAGING VPS ─────┐
│                                          │   │ Mirror of prod      │
│   Caddy 2 → SvelteKit / Fastify API      │   │ Lower specs         │
│             Icecast-KH  Liquidsoap       │   │ Isolated secrets    │
│   PgBouncer → Postgres 17                │   │ Gated by CI         │
│   Valkey 8 · BullMQ workers              │   └─────────────────────┘
│   Prometheus · Grafana · Loki · Kuma     │
│   Kingdom Calendar service               │
│                                          │
│   FFmpeg 7 + mediainfo (ingest workers)  │
└──────────────────────────────────────────┘
                │
                ▼
         Restic → Backblaze B2 (nightly, monthly drills)
```

### Data and Control Flows

**Listener play flow:** browser → Cloudflare → Caddy → Icecast-KH mount point → audio stream. Parallel: browser polls `/api/stations/:slug/now-playing` every 5–10 seconds and `/api/stations/:slug/schedule` every 60 seconds for upcoming tracks.

**Ingest flow:** admin uploads masters with a `manifest.json` declaring `ohi_enabled: true|false` → ingest worker runs universal gates (12-song, persona), then conditionally runs OHI gates if the album opted in → FFmpeg transcodes → Drizzle writes Album + 12 Track rows → scheduler is notified.

**Scheduling flow:** nightly cron at 00:05 UTC → Kingdom Calendar service determines active Sabbath/Feast windows for the next 48h → scheduler generates station queues honoring both format rules and active programming profiles → playlist files written → Liquidsoap hot-reloads via dual-playlist swap (no audible interruption).

**Broadcast flow:** Liquidsoap follows the generated playlist, crossfades between tracks, injects format-appropriate station IDs and (during Sabbath/Feast windows on OHI-required stations) Scripture interstitials.

---

## 3. Universal Invariants

These apply to every album, every track, and every station — regardless of OHI enrollment. They are enforced at the database, ingest, and API levels.

### 3.1 The Twelve-Song Rule

Every Jubilee album contains exactly 12 tracks. This is a Jubilee Music standard, not an OHI-specific rule, because it predates the OHI system and defines the Inspire Family production pattern across all content.

**Enforcement:**
- Database: `CHECK (track_number BETWEEN 1 AND 12)` plus `UNIQUE(album_id, track_number)`
- Ingest validator: refuses any folder with fewer or more than 12 audio files
- API: `POST /api/admin/albums` rejects payloads with ≠ 12 tracks
- Admin UI: cannot save an album without all 12 slots filled

### 3.2 Persona Tagging

Every album and every track carries a `persona_id` referencing exactly one of the 13 Inspire Family personas (including correctly-spelled **Eliana Inspire**). The persona list lives in `packages/config/inspire-family.json` and is foreign-keyed from the database.

### 3.3 Station Format Enum

The JRE supports five station formats at launch: `ADULT`, `KIDS_3_5`, `KIDS_6_8`, `GOSPEL`, `CELESTIAL`. Additional formats (e.g., `TEACHING`, per-persona micro-stations) are added via database migrations and Liquidsoap script additions, not via runtime configuration.

### 3.4 Audio Quality Floors

Every track must transcode cleanly to broadcast format (AAC or MP3) at the bitrate required by its station format:
- Adult, Gospel: 192 kbps minimum
- Kids 3–5, Kids 6–8: 160 kbps minimum
- Celestial: 256 kbps minimum

Source files must meet a loudness floor (no more than -24 LUFS integrated before normalization). FFmpeg handles normalization to -16 LUFS for broadcast consistency.

---

## 4. OHI Mode — Opt-In Compliance Layer

OHI (Original Hebraic / Inspired) is the strict theological-vocabulary and naming compliance framework Jubilee uses for its covenant content. Not every piece of content needs to meet OHI standards. Instrumental children's music, ambient loops, guest contributions, and specific creative projects may legitimately exist outside OHI without compromising Jubilee's theological core.

**Rule:** OHI is **opt-in**. An album is OHI-compliant only when its ingest manifest explicitly sets `ohi_enabled: true`. A station enforces OHI only when its configuration sets `ohi_required: true`.

### 4.1 OHI Content Rules (Apply Only When `ohi_enabled = true`)

When an album opts into OHI, the following are enforced at ingest time and on every subsequent edit:

**Yahuah as covenant name.** Never YHWH, Yahweh, LORD, God (in covenant contexts), or Jehovah. The OHI linter rejects these substitutes in album titles, track titles, descriptions, Scripture refs, and all user-editable metadata.

**Hebrew article rule.** Never "the Ruach HaKodesh" — use either "the Ruach Kodesh" (English article + drop the Hebrew prefix) or "Ruach HaKodesh" (no English article). Same rule for HaMashiach, HaTorah, and any other Hebrew noun carrying the definite article prefix "Ha-".

**Feminine pronouns for Ruach HaKodesh.** All references use She, Her, Hers.

**Hebrew name preservation.** Yahuah, Yeshua, Shaddai, Ruach HaKodesh, Ruach Kodesh, HaMashiach, Mashiach, Torah, Tehillim, B'rit Chadashah, Elohim, El Shaddai, El Elyon, El Olam, El Roi — all preserved byte-for-byte, case-sensitive, no Romanization or substitution.

**OHI banned-word registry.** A curated list in `packages/config/ohi-banned-words.json` flagging terms that are inappropriate for OHI content.

### 4.2 Station OHI Enforcement

When a station has `ohi_required = true`:
- The scheduler draws tracks only from albums where `ohi_enabled = true`
- Sabbath and Feast Day programming overlays activate (see §5)
- Scripture of the Hour interstitials activate
- Station metadata displays an "OHI Certified" badge in the player

When a station has `ohi_required = false`:
- The scheduler may draw from any album
- No Sabbath/Feast overlays (standard format rules govern the rotation)
- No Scripture interstitials
- No OHI badge

### 4.3 Default Posture at Launch

The five launch stations default to:

| Station | `ohi_required` Default | Rationale |
|---|---|---|
| Adult | `true` | Covenant-aligned adult content |
| Kids 3–5 | `false` | Content optional; some kids tracks are instrumental/general |
| Kids 6–8 | `false` | Same rationale |
| Gospel | `true` | Scripture-to-album format inherently OHI |
| Celestial | `true` | Contemplative Kingdom atmospheres inherently OHI |

Any station's OHI posture can be toggled via admin UI. Changing it triggers a scheduler regeneration.

### 4.4 Album-Level Default Posture

Album ingest defaults to `ohi_enabled = false` — the safer default since OHI enforcement is strict. Ingest manifests must explicitly opt in. This prevents accidental OHI-tagging of non-compliant content and makes the OHI certification path an intentional editorial act.

---

## 5. Sabbath and Feast Day Programming

When a station has `ohi_required = true`, it participates in the Kingdom Calendar overlay system. During Sabbath (Friday sunset through Saturday sunset) and each Biblical Feast, the scheduler overrides standard format rules with feast-appropriate programming profiles.

Stations with `ohi_required = false` continue their normal rotation through Sabbath and Feast windows — they are not interrupted or reprogrammed.

### 5.1 Kingdom Calendar Coverage

The Kingdom Calendar tracks:

- **Weekly Sabbath** — every Friday sunset to Saturday sunset
- **Pesach (Passover)** — 15 Nisan, 7 days
- **Chag HaMatzot (Unleavened Bread)** — concurrent with Pesach
- **Bikkurim (Firstfruits)** — day after first Sabbath of Pesach week
- **Shavuot (Pentecost / Feast of Weeks)** — 50 days after Firstfruits
- **Yom Teruah (Feast of Trumpets)** — 1 Tishrei
- **Yom Kippur (Day of Atonement)** — 10 Tishrei
- **Sukkot (Tabernacles)** — 15 Tishrei, 7 days
- **Shemini Atzeret** — 22 Tishrei
- **Simchat Torah** — 23 Tishrei (or concurrent with Shemini Atzeret in Israel)
- **Hanukkah** — 25 Kislev, 8 days
- **Purim** — 14 Adar (or 15 Adar in walled cities)

The calendar is computed via `@hebcal/core`, a mature open-source Hebrew calendar library, anchored by default to Jerusalem for sunset calculations. Locations can be overridden per-instance (Jubilee may eventually want California-anchored Sabbath for a US audience; Jerusalem anchor is the default for theological consistency).

### 5.2 Programming Profiles

Each calendar event maps to a programming profile that tells the scheduler how to shape the rotation during the window. Profiles live in `packages/config/programming-profiles.json`:

```json
{
  "sabbath": {
    "name": "Shabbat Shalom",
    "priority": 100,
    "tone": "rest-contemplative",
    "album_format_filter": ["ADULT", "GOSPEL", "CELESTIAL"],
    "preferred_formats": ["CELESTIAL", "GOSPEL"],
    "persona_filter": null,
    "crossfade_seconds": 6,
    "scripture_anchors": [
      "Shemot 20:8-11",
      "Vayikra 23:3",
      "Yeshayahu 58:13-14"
    ],
    "special_interstitials": true,
    "interstitial_library": "sabbath"
  },
  "pesach": {
    "name": "Pesach",
    "priority": 120,
    "tone": "redemption-deliverance",
    "album_format_filter": ["ADULT", "GOSPEL"],
    "preferred_formats": ["GOSPEL"],
    "scripture_anchors": [
      "Shemot 12",
      "Shemot 13",
      "Shemot 14",
      "Yochanan 1:29"
    ],
    "special_interstitials": true,
    "interstitial_library": "pesach"
  },
  "yom_teruah": {
    "name": "Yom Teruah",
    "priority": 130,
    "tone": "awakening-proclamation",
    "album_format_filter": ["ADULT", "GOSPEL", "CELESTIAL"],
    "scripture_anchors": [
      "Vayikra 23:23-25",
      "Bamidbar 29:1-6",
      "1 Corinthians 15:52"
    ],
    "special_interstitials": true,
    "interstitial_library": "yom_teruah"
  },
  "yom_kippur": {
    "name": "Yom Kippur",
    "priority": 140,
    "tone": "reverent-solemn",
    "album_format_filter": ["GOSPEL", "CELESTIAL"],
    "preferred_formats": ["CELESTIAL"],
    "scripture_anchors": [
      "Vayikra 16",
      "Vayikra 23:26-32",
      "Yeshayahu 53"
    ],
    "special_interstitials": true,
    "interstitial_library": "yom_kippur"
  },
  "sukkot": {
    "name": "Sukkot",
    "priority": 120,
    "tone": "joy-abundance",
    "album_format_filter": ["ADULT", "GOSPEL", "CELESTIAL"],
    "scripture_anchors": [
      "Vayikra 23:33-43",
      "Zechariah 14:16-19",
      "Yochanan 7:37-38"
    ],
    "special_interstitials": true,
    "interstitial_library": "sukkot"
  },
  "hanukkah": {
    "name": "Hanukkah",
    "priority": 110,
    "tone": "dedication-light",
    "album_format_filter": ["ADULT", "GOSPEL", "CELESTIAL"],
    "scripture_anchors": [
      "Yochanan 10:22-23",
      "Tehillim 30"
    ],
    "special_interstitials": true,
    "interstitial_library": "hanukkah"
  },
  "shavuot": {
    "name": "Shavuot",
    "priority": 120,
    "tone": "covenant-fire",
    "album_format_filter": ["ADULT", "GOSPEL", "CELESTIAL"],
    "scripture_anchors": [
      "Shemot 19",
      "Shemot 20",
      "Acts 2"
    ],
    "special_interstitials": true,
    "interstitial_library": "shavuot"
  },
  "purim": {
    "name": "Purim",
    "priority": 100,
    "tone": "deliverance-celebration",
    "album_format_filter": ["ADULT", "GOSPEL"],
    "scripture_anchors": [
      "Esther 9:20-32"
    ],
    "special_interstitials": true,
    "interstitial_library": "purim"
  }
}
```

Priority resolves overlap — if a Sabbath falls within Sukkot, Sukkot (priority 120) wins over Sabbath (priority 100).

### 5.3 Kingdom Calendar Service

File: `apps/api/src/services/kingdom-calendar/service.ts`

```typescript
import { HebrewCalendar, Location, HDate, flags } from '@hebcal/core';
import { db } from '../../db/client';
import { kingdomCalendar } from '../../db/schema';
import { logger } from '../../lib/logger';
import programmingProfiles from '../../../../../packages/config/programming-profiles.json';

const DEFAULT_LOCATION = Location.lookup('Jerusalem');
const HORIZON_YEARS = 5;

export async function seedKingdomCalendar(startDate = new Date()) {
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + HORIZON_YEARS);

  const events = HebrewCalendar.calendar({
    start: startDate,
    end: endDate,
    location: DEFAULT_LOCATION,
    il: true,
    sedrot: false,
    candlelighting: true,
    havdalahMins: 72
  });

  const rows = events
    .map(e => mapEventToRow(e))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  await db.insert(kingdomCalendar).values(rows).onConflictDoNothing();
  logger.info({ count: rows.length }, 'Kingdom Calendar seeded');
}

function mapEventToRow(event: any) {
  const flagsVal = event.getFlags();
  let eventType: string | null = null;
  let profileId: string | null = null;

  if (event.getDesc() === 'Candle lighting') {
    eventType = 'SABBATH_START';
    profileId = 'sabbath';
  } else if (event.getDesc() === 'Havdalah') {
    eventType = 'SABBATH_END';
    profileId = 'sabbath';
  } else if (flagsVal & flags.CHAG) {
    const desc = event.getDesc().toLowerCase();
    if (desc.includes('pesach')) { eventType = 'PESACH'; profileId = 'pesach'; }
    else if (desc.includes('shavuot')) { eventType = 'SHAVUOT'; profileId = 'shavuot'; }
    else if (desc.includes('rosh hashana') || desc.includes('yom teruah')) {
      eventType = 'YOM_TERUAH'; profileId = 'yom_teruah';
    }
    else if (desc.includes('yom kippur')) { eventType = 'YOM_KIPPUR'; profileId = 'yom_kippur'; }
    else if (desc.includes('sukkot')) { eventType = 'SUKKOT'; profileId = 'sukkot'; }
    else if (desc.includes('shemini atzeret')) { eventType = 'SHEMINI_ATZERET'; profileId = 'sukkot'; }
  } else if (flagsVal & flags.MINOR_HOLIDAY) {
    const desc = event.getDesc().toLowerCase();
    if (desc.includes('chanukah')) { eventType = 'HANUKKAH'; profileId = 'hanukkah'; }
    else if (desc.includes('purim')) { eventType = 'PURIM'; profileId = 'purim'; }
  }

  if (!eventType || !profileId) return null;

  const date = event.getDate().greg();
  return {
    event_type: eventType,
    starts_at: date,
    ends_at: computeEndDate(event, date),
    gregorian_year: date.getFullYear(),
    hebrew_year: event.getDate().getFullYear(),
    name_en: event.render('en'),
    name_he: event.render('he'),
    programming_profile: profileId
  };
}

function computeEndDate(event: any, startDate: Date): Date {
  // Sabbath candle-lighting events are handled as 25-hour windows
  // Multi-day feasts computed by their duration in hebcal
  // ... (full implementation in source)
  return new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
}

export async function getActiveProfile(at: Date, stationId: string): Promise<string | null> {
  const active = await db.query.kingdomCalendar.findMany({
    where: (c, { lte, gte, and }) => and(
      lte(c.starts_at, at),
      gte(c.ends_at, at)
    )
  });
  if (active.length === 0) return null;
  // Highest priority profile wins
  const profiles = active
    .map(a => programmingProfiles[a.programming_profile])
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);
  return profiles[0]?.id ?? null;
}
```

### 5.4 Scheduler Integration

The scheduler consults the Kingdom Calendar before generating each station queue. If the station is `ohi_required = true` and an active profile exists for the target window, the scheduler applies profile filters (album format restrictions, persona preferences, scripture anchors) on top of the normal format rules.

Pseudocode inside `generator.ts`:

```typescript
async function generateOne(station: Station, now: Date) {
  const horizon = hours * 60 * 60 * 1000;
  const items: QueueItem[] = [];
  let cursor = new Date(now);

  while (cursor < new Date(now.getTime() + horizon)) {
    const profileId = station.ohi_required
      ? await getActiveProfile(cursor, station.id)
      : null;
    const profile = profileId ? programmingProfiles[profileId] : null;

    const nextTrack = await pickNextTrack({
      station,
      cursor,
      history: items,
      profile
    });

    items.push({
      station_id: station.id,
      track_id: nextTrack.id,
      starts_at: cursor,
      ends_at: new Date(cursor.getTime() + nextTrack.duration_ms),
      programming_profile_id: profileId,
      is_interstitial: false
    });
    cursor = new Date(cursor.getTime() + nextTrack.duration_ms);

    // Inject interstitial if profile has Scripture of the Hour at top-of-hour boundary
    if (profile?.special_interstitials && isTopOfHour(cursor)) {
      const interstitial = await pickInterstitial(profile, cursor);
      items.push({ ...interstitial, is_interstitial: true });
      cursor = new Date(cursor.getTime() + interstitial.duration_ms);
    }
  }

  return items;
}
```

### 5.5 Scripture of the Hour Interstitials

On OHI-required stations, every hour a 30- to 45-second Scripture interstitial is injected at the nearest track boundary. Interstitial libraries live in `storage/broadcast/interstitials/<profile>/*.mp3`. Each interstitial has metadata (`scripture_ref`, `spoken_duration_ms`) stored in a companion JSON file.

When an active profile has `special_interstitials: true`, the scheduler draws from `interstitial_library/<profile>/` first. When no special profile is active (standard Adult programming between feasts), generic OHI interstitials from `interstitial_library/general/` are used.

### 5.6 Player UI During Sabbath / Feast

The now-playing API response gains two fields when a profile is active:

```json
{
  "active_profile": {
    "id": "sabbath",
    "name": "Shabbat Shalom",
    "scripture_anchor": "Yeshayahu 58:13-14",
    "name_he": "שבת שלום"
  }
}
```

The SvelteKit player displays a subtle banner ("Shabbat Shalom" or "Chag Sameach — Sukkot"), the Hebrew name, and the Scripture anchor. The banner styling is muted — it informs without dominating.

---

## 6. Technology Stack (Locked Versions)

| Layer | Technology | Version | License | Role |
|---|---|---|---|---|
| OS | Ubuntu Server | 24.04 LTS | Various FOSS | Host |
| Container runtime | Docker Engine | 26+ | Apache 2.0 | Service isolation |
| Streaming server | Icecast-KH | 2.4.0-kh16+ | GPL v2 | Audio distribution |
| Scheduler/mixer | Liquidsoap | 2.3.x | GPL v2 | Playlist engine |
| Runtime | Node.js | 24 LTS | MIT | App runtime |
| Language | TypeScript | 5.6+ | Apache 2.0 | Type safety |
| HTTP framework | Fastify | 5.x | MIT | API |
| Database | PostgreSQL | 17 | PostgreSQL License | Catalog |
| Connection pooler | PgBouncer | 1.22+ | ISC | Postgres connection pool |
| ORM | Drizzle ORM | latest stable | Apache 2.0 | DB access |
| Cache/queue broker | Valkey | 8.x | BSD-3-Clause | Cache, pub/sub |
| Job queue | BullMQ | 5.x | MIT | Async jobs |
| Reverse proxy | Caddy | 2.8+ | Apache 2.0 | TLS, routing |
| Frontend framework | SvelteKit | 2.x | MIT | Player UI |
| CSS | Tailwind CSS | 4.x | MIT | Styling |
| PWA | @vite-pwa/sveltekit | latest | MIT | Offline listener UI |
| Hebrew calendar | @hebcal/core | latest | GPL v2 (used as library) | Sabbath/Feast dates |
| Audio processing | FFmpeg | 7.x | LGPL/GPL | Transcoding |
| Metadata reader | mediainfo | latest | BSD-2-Clause | Metadata extraction |
| Metrics | Prometheus | latest | Apache 2.0 | Metrics |
| Alert router | Alertmanager | latest | Apache 2.0 | Alert delivery |
| Dashboards | Grafana | 11.x | AGPL v3 (unmodified use) | Dashboards |
| Logs | Loki | 3.x | AGPL v3 (unmodified use) | Log aggregation |
| Uptime | Uptime Kuma | latest | MIT | External uptime |
| Logger | Pino | latest | MIT | Structured logging |
| Unit/integration tests | Vitest | latest | MIT | Test runner |
| E2E tests | Playwright | latest | Apache 2.0 | Browser tests |
| Secrets encryption | SOPS | latest | MPL 2.0 | Encrypted config |
| Encryption backend | age | latest | BSD-3-Clause | Key-based encryption |
| Dependency automation | Renovate | latest | AGPL v3 (service use) | Dep updates |
| Container scanning | Trivy | latest | Apache 2.0 | CVE scanning |
| Backup tool | Restic | latest | BSD-2-Clause | Encrypted backups |
| Backup target | Backblaze B2 | service | — | Off-site storage |
| CDN | Cloudflare | service | — | Edge, WAF |
| Source/CI | Forgejo + Forgejo Actions | latest | MIT | SCM, CI/CD |
| Package manager | pnpm | 9+ | MIT | Monorepo tooling |

All versions pinned in `docker-compose.yml`, `package.json`, and `renovate.json`. `latest` tags are prohibited in production.

---

## 7. Repository Structure

```
jubilee-radio-engine/
├── apps/
│   ├── api/                          # Fastify API + services
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts
│   │   │   │   ├── migrations/
│   │   │   │   └── client.ts
│   │   │   ├── routes/
│   │   │   │   ├── health.ts
│   │   │   │   ├── stations.ts
│   │   │   │   ├── now-playing.ts
│   │   │   │   ├── schedule.ts       # Schedule Guide (EPG view)
│   │   │   │   ├── catalog.ts
│   │   │   │   ├── personas.ts
│   │   │   │   ├── calendar.ts       # Kingdom Calendar
│   │   │   │   └── admin/
│   │   │   ├── services/
│   │   │   │   ├── ingest/
│   │   │   │   │   ├── pipeline.ts
│   │   │   │   │   ├── ohi-lint.ts
│   │   │   │   │   ├── hebrew-guard.ts
│   │   │   │   │   ├── twelve-song-gate.ts
│   │   │   │   │   ├── persona-gate.ts
│   │   │   │   │   └── transcode.ts
│   │   │   │   ├── scheduler/
│   │   │   │   │   ├── generator.ts
│   │   │   │   │   ├── formats/
│   │   │   │   │   │   ├── adult.ts
│   │   │   │   │   │   ├── kids-3-5.ts
│   │   │   │   │   │   ├── kids-6-8.ts
│   │   │   │   │   │   ├── gospel.ts
│   │   │   │   │   │   └── celestial.ts
│   │   │   │   │   ├── interstitial-picker.ts
│   │   │   │   │   └── liquidsoap-writer.ts
│   │   │   │   ├── kingdom-calendar/
│   │   │   │   │   ├── service.ts
│   │   │   │   │   └── profile-resolver.ts
│   │   │   │   ├── liquidsoap/
│   │   │   │   │   ├── telnet-client.ts
│   │   │   │   │   └── bridge.ts
│   │   │   │   └── icecast/
│   │   │   │       └── stats-client.ts
│   │   │   ├── queue/
│   │   │   │   ├── workers/
│   │   │   │   └── index.ts
│   │   │   ├── lib/
│   │   │   │   ├── logger.ts         # Pino + request-ID propagation
│   │   │   │   ├── metrics.ts
│   │   │   │   ├── errors.ts
│   │   │   │   └── valkey.ts
│   │   │   └── server.ts
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   └── integration/
│   │   ├── drizzle.config.ts
│   │   ├── vitest.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── web/                          # SvelteKit frontend
│       ├── src/
│       │   ├── routes/
│       │   │   ├── +layout.svelte
│       │   │   ├── +page.svelte
│       │   │   ├── station/[slug]/+page.svelte
│       │   │   ├── admin/
│       │   │   └── embed/[slug]/+page.svelte
│       │   ├── lib/
│       │   │   ├── components/
│       │   │   │   ├── Player.svelte
│       │   │   │   ├── NowPlayingCard.svelte
│       │   │   │   ├── ScheduleGuide.svelte   # Upcoming tracks EPG
│       │   │   │   ├── SongStory.svelte       # Song Story modal
│       │   │   │   ├── PersonaBadge.svelte
│       │   │   │   ├── ProfileBanner.svelte   # Sabbath/Feast banner
│       │   │   │   └── StationSelector.svelte
│       │   │   ├── stores/
│       │   │   │   ├── now-playing.ts
│       │   │   │   └── schedule.ts
│       │   │   └── api.ts
│       │   ├── service-worker.ts
│       │   ├── app.html
│       │   └── app.d.ts
│       ├── tests/e2e/                # Playwright
│       ├── tailwind.config.ts
│       ├── svelte.config.js
│       ├── playwright.config.ts
│       └── package.json
│
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── types.ts
│   │       ├── kingdom-constants.ts
│   │       └── ohi.ts
│   └── config/
│       ├── ohi-banned-words.json
│       ├── hebrew-allowlist.json
│       ├── inspire-family.json
│       ├── station-formats.json
│       └── programming-profiles.json
│
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.staging.yml
│   ├── docker-compose.prod.yml
│   ├── caddy/
│   │   └── Caddyfile
│   ├── pgbouncer/
│   │   ├── pgbouncer.ini
│   │   └── userlist.txt
│   ├── icecast/
│   │   └── icecast.xml
│   ├── liquidsoap/
│   │   ├── main.liq
│   │   ├── stations/
│   │   │   ├── adult.liq
│   │   │   ├── kids-3-5.liq
│   │   │   ├── kids-6-8.liq
│   │   │   ├── gospel.liq
│   │   │   └── celestial.liq
│   │   └── lib/
│   │       ├── crossfade.liq
│   │       ├── station-id.liq
│   │       ├── hot-swap.liq          # Dual-playlist zero-interruption
│   │       └── fallback.liq
│   ├── prometheus/
│   │   ├── prometheus.yml
│   │   └── alerts.yml
│   ├── alertmanager/
│   │   └── alertmanager.yml
│   ├── grafana/
│   │   └── provisioning/
│   └── restic/
│       ├── backup.sh
│       └── restore-drill.sh
│
├── scripts/
│   ├── bootstrap.sh
│   ├── deploy.sh
│   ├── seed-personas.ts
│   ├── seed-kingdom-calendar.ts
│   ├── validate-config.ts
│   └── generate-sops-key.sh
│
├── secrets/                          # SOPS-encrypted, committed to Git
│   ├── .sops.yaml
│   ├── staging.enc.yaml
│   └── production.enc.yaml
│
├── docs/
│   ├── adr/                          # Architecture Decision Records
│   │   ├── 0001-icecast-kh-over-stock.md
│   │   ├── 0002-drizzle-over-prisma.md
│   │   ├── 0003-no-azuracast-fork.md
│   │   ├── 0004-dual-playlist-hot-swap.md
│   │   ├── 0005-ohi-opt-in.md
│   │   └── template.md
│   ├── handbook/
│   │   ├── runbook.md
│   │   ├── incident-response.md
│   │   ├── onboarding-a-persona.md
│   │   ├── adding-a-station.md
│   │   └── theological-guardrails.md
│   └── README.md
│
├── .github/                          # (or .forgejo/)
│   └── workflows/
│       ├── ci.yml
│       ├── deploy-staging.yml
│       ├── deploy-production.yml
│       ├── restic-drill.yml
│       └── trivy-scan.yml
│
├── storage/                          # Host-mounted volumes (gitignored)
│   ├── masters/
│   ├── broadcast/
│   │   ├── tracks/
│   │   ├── station-ids/
│   │   ├── interstitials/
│   │   │   ├── general/
│   │   │   ├── sabbath/
│   │   │   ├── pesach/
│   │   │   ├── shavuot/
│   │   │   ├── yom_teruah/
│   │   │   ├── yom_kippur/
│   │   │   ├── sukkot/
│   │   │   ├── hanukkah/
│   │   │   └── purim/
│   │   └── fallback/
│   ├── playlists/
│   ├── art/
│   ├── postgres-data/
│   ├── valkey-data/
│   └── icecast-logs/
│
├── renovate.json
├── .env.example
├── .gitignore
├── README.md
├── LICENSE                           # Proprietary — Jubilee Software, Inc.
└── pnpm-workspace.yaml
```

---

## 8. Streaming Engine Layer

### 8.1 Icecast-KH Configuration

File: `infra/icecast/icecast.xml` — same structure as v2.0 with all five mount points, CORS headers, and listener limits set to 10,000 clients. (Full XML identical to the v2.0 spec.)

### 8.2 Liquidsoap Main Entry Point

File: `infra/liquidsoap/main.liq`

```liquidsoap
#!/usr/bin/liquidsoap

settings.log.level.set(3)
settings.log.file.path.set("/var/log/liquidsoap/main.log")

settings.server.telnet.set(true)
settings.server.telnet.bind_addr.set("0.0.0.0")
settings.server.telnet.port.set(1234)

%include "lib/crossfade.liq"
%include "lib/station-id.liq"
%include "lib/hot-swap.liq"
%include "lib/fallback.liq"

%include "stations/adult.liq"
%include "stations/kids-3-5.liq"
%include "stations/kids-6-8.liq"
%include "stations/gospel.liq"
%include "stations/celestial.liq"
```

### 8.3 Dual-Playlist Hot-Swap Library (New)

File: `infra/liquidsoap/lib/hot-swap.liq`

```liquidsoap
# Dual-playlist hot-swap — zero-interruption reloads
#
# Maintains two playlist sources per station (a and b).
# Scheduler writes new content to the inactive slot, then triggers
# a controlled crossfade swap via telnet.
#
# Usage:
#   s = jubilee_hot_swap(name="adult", dir="/playlists")

def jubilee_hot_swap(~name, ~dir, ~swap_duration=4.0) =
  playlist_a = playlist(
    id="#{name}_a",
    reload=3600,
    reload_mode="rounds",
    mode="normal",
    "#{dir}/#{name}-a.m3u"
  )
  playlist_b = playlist(
    id="#{name}_b",
    reload=3600,
    reload_mode="rounds",
    mode="normal",
    "#{dir}/#{name}-b.m3u"
  )

  # Active selector — starts on A, swaps on signal
  active = ref("a")

  # Switch with smooth crossfade between slots
  swap_source = switch(
    track_sensitive=false,
    transitions=[
      fun(old, new) -> add(normalize=false, [
        fade.initial(duration=swap_duration, new),
        fade.final(duration=swap_duration, old)
      ])
    ],
    [
      ({ !active == "a" }, playlist_a),
      ({ !active == "b" }, playlist_b)
    ]
  )

  # Expose telnet command: <name>.swap
  server.register(
    description="Hot-swap active playlist slot",
    namespace=name,
    "swap",
    fun(_) -> begin
      active := if !active == "a" then "b" else "a" end
      "swapped to #{!active}"
    end
  )

  swap_source
end
```

### 8.4 Updated Station Scripts

Each station now uses hot-swap. Example — `infra/liquidsoap/stations/adult.liq`:

```liquidsoap
adult_source = jubilee_hot_swap(name="adult", dir="/playlists", swap_duration=3.0)
adult_source = jubilee_crossfade(duration=3.0, adult_source)
adult_source = jubilee_station_id(every=7, adult_source, "/broadcast/station-ids/adult/*.mp3")
adult_source = jubilee_fallback(adult_source, "/broadcast/fallback/adult-silent.mp3")

output.icecast(
  %mp3(bitrate=192, samplerate=44100, stereo=true),
  host="icecast",
  port=8000,
  password=environment.get("ICECAST_SOURCE_PASSWORD"),
  mount="/adult",
  name="Jubilee Adult",
  description="Kingdom music for adult listeners",
  genre="Christian",
  public=true,
  adult_source
)
```

Kids 3–5, Kids 6–8, Gospel, and Celestial scripts mirror this pattern with their format-specific crossfade durations, station ID cadences, and bitrates (per v2.0 spec).

### 8.5 Scheduler ↔ Liquidsoap Handshake

The scheduler writes the newly-generated playlist to the inactive slot file (`<name>-b.m3u` if the active slot is A, or vice versa), then issues the telnet command `<name>.swap`. Liquidsoap crossfades from the old slot to the new over 3–6 seconds (per station format) with zero audible gap.

Bridge logic lives in `apps/api/src/services/liquidsoap/bridge.ts`:

```typescript
async function hotSwap(stationSlug: string, newPlaylistLines: string[]) {
  // Determine current active slot
  const status = await telnet.sendCommand(`${stationSlug}.active_slot`);
  const activeSlot = status.trim() === 'a' ? 'a' : 'b';
  const inactiveSlot = activeSlot === 'a' ? 'b' : 'a';

  // Write new content to inactive slot
  const filePath = `${PLAYLIST_DIR}/${stationSlug}-${inactiveSlot}.m3u`;
  await writeFile(filePath, newPlaylistLines.join('\n') + '\n');

  // Trigger swap
  await telnet.sendCommand(`${stationSlug}.swap`);
  logger.info({ stationSlug, activeSlot, inactiveSlot }, 'Playlist hot-swapped');
}
```

---

## 9. Data Layer

### 9.1 Drizzle Schema (v3.0)

File: `apps/api/src/db/schema.ts`

```typescript
import {
  pgTable, pgEnum, uuid, text, integer, timestamp, boolean, jsonb,
  uniqueIndex, index, check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Enums ──────────────────────────────────────────────────────────

export const albumFormatEnum = pgEnum('album_format', [
  'ADULT', 'KIDS_3_5', 'KIDS_6_8', 'GOSPEL', 'CELESTIAL'
]);

export const stationFormatEnum = pgEnum('station_format', [
  'ADULT', 'KIDS_3_5', 'KIDS_6_8', 'GOSPEL', 'CELESTIAL'
]);

export const ingestStatusEnum = pgEnum('ingest_status', [
  'PENDING', 'VALIDATING', 'TRANSCODING', 'READY', 'FAILED'
]);

export const calendarEventTypeEnum = pgEnum('calendar_event_type', [
  'SABBATH_START', 'SABBATH_END',
  'PESACH', 'UNLEAVENED_BREAD', 'BIKKURIM',
  'SHAVUOT', 'YOM_TERUAH', 'YOM_KIPPUR',
  'SUKKOT', 'SHEMINI_ATZERET', 'SIMCHAT_TORAH',
  'HANUKKAH', 'PURIM'
]);

// ─── Personas ───────────────────────────────────────────────────────

export const personas = pgTable('personas', {
  id: text('id').primaryKey(),
  display_name: text('display_name').notNull(),
  role: text('role').notNull(),
  description: text('description'),
  avatar_url: text('avatar_url'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// ─── Albums ─────────────────────────────────────────────────────────

export const albums = pgTable('albums', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  format: albumFormatEnum('format').notNull(),
  persona_id: text('persona_id').references(() => personas.id).notNull(),
  release_date: timestamp('release_date').notNull(),
  cover_art_path: text('cover_art_path').notNull(),
  description: text('description'),
  scripture_context: jsonb('scripture_context').$type<string[]>().default([]),
  ohi_enabled: boolean('ohi_enabled').notNull().default(false),
  ohi_certified_at: timestamp('ohi_certified_at'),
  ohi_certified_by: text('ohi_certified_by'),
  ingest_status: ingestStatusEnum('ingest_status').notNull().default('PENDING'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (t) => ({
  slug_unique: uniqueIndex('albums_slug_unique').on(t.slug),
  persona_idx: index('albums_persona_idx').on(t.persona_id),
  format_idx: index('albums_format_idx').on(t.format),
  ohi_idx: index('albums_ohi_idx').on(t.ohi_enabled)
}));

// ─── Tracks ─────────────────────────────────────────────────────────

export const tracks = pgTable('tracks', {
  id: uuid('id').primaryKey().defaultRandom(),
  album_id: uuid('album_id').references(() => albums.id, { onDelete: 'cascade' }).notNull(),
  track_number: integer('track_number').notNull(),
  title: text('title').notNull(),
  duration_ms: integer('duration_ms').notNull(),
  broadcast_path: text('broadcast_path').notNull(),
  master_path: text('master_path').notNull(),
  persona_id: text('persona_id').references(() => personas.id).notNull(),
  scripture_refs: jsonb('scripture_refs').$type<string[]>().default([]),
  song_story_markdown: text('song_story_markdown'),
  prophetic_context: text('prophetic_context'),
  loudness_lufs: integer('loudness_lufs'),
  bitrate_kbps: integer('bitrate_kbps').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (t) => ({
  album_track_unique: uniqueIndex('tracks_album_track_unique').on(t.album_id, t.track_number),
  track_num_range: check('tracks_track_num_range',
    sql`${t.track_number} BETWEEN 1 AND 12`),
  album_idx: index('tracks_album_idx').on(t.album_id)
}));

// ─── Stations ───────────────────────────────────────────────────────

export const stations = pgTable('stations', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  format: stationFormatEnum('format').notNull(),
  mount_point: text('mount_point').notNull(),
  description: text('description'),
  ohi_required: boolean('ohi_required').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (t) => ({
  slug_unique: uniqueIndex('stations_slug_unique').on(t.slug)
}));

// ─── Station Queue ──────────────────────────────────────────────────

export const stationQueue = pgTable('station_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  station_id: uuid('station_id').references(() => stations.id, { onDelete: 'cascade' }).notNull(),
  track_id: uuid('track_id').references(() => tracks.id).notNull(),
  position: integer('position').notNull(),
  starts_at: timestamp('starts_at').notNull(),
  ends_at: timestamp('ends_at').notNull(),
  is_album_block: boolean('is_album_block').notNull().default(false),
  is_interstitial: boolean('is_interstitial').notNull().default(false),
  programming_profile_id: text('programming_profile_id'),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (t) => ({
  station_starts_idx: index('station_queue_station_starts_idx').on(t.station_id, t.starts_at)
}));

// ─── Kingdom Calendar ───────────────────────────────────────────────

export const kingdomCalendar = pgTable('kingdom_calendar', {
  id: uuid('id').primaryKey().defaultRandom(),
  event_type: calendarEventTypeEnum('event_type').notNull(),
  starts_at: timestamp('starts_at').notNull(),
  ends_at: timestamp('ends_at').notNull(),
  gregorian_year: integer('gregorian_year').notNull(),
  hebrew_year: integer('hebrew_year'),
  name_en: text('name_en').notNull(),
  name_he: text('name_he'),
  description: text('description'),
  programming_profile: text('programming_profile').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (t) => ({
  span_idx: index('kingdom_calendar_span_idx').on(t.starts_at, t.ends_at),
  profile_idx: index('kingdom_calendar_profile_idx').on(t.programming_profile),
  event_unique: uniqueIndex('kingdom_calendar_event_unique').on(t.event_type, t.starts_at)
}));

// ─── Interstitials ──────────────────────────────────────────────────

export const interstitials = pgTable('interstitials', {
  id: uuid('id').primaryKey().defaultRandom(),
  library: text('library').notNull(),       // 'general', 'sabbath', 'pesach', etc.
  file_path: text('file_path').notNull(),
  scripture_ref: text('scripture_ref'),
  duration_ms: integer('duration_ms').notNull(),
  spoken_by: text('spoken_by'),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (t) => ({
  library_idx: index('interstitials_library_idx').on(t.library)
}));

// ─── Play History ───────────────────────────────────────────────────

export const playHistory = pgTable('play_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  station_id: uuid('station_id').references(() => stations.id).notNull(),
  track_id: uuid('track_id').references(() => tracks.id).notNull(),
  programming_profile_id: text('programming_profile_id'),
  played_at: timestamp('played_at').defaultNow().notNull(),
  listener_count: integer('listener_count')
}, (t) => ({
  station_time_idx: index('play_history_station_time_idx').on(t.station_id, t.played_at)
}));

// ─── Ingest Jobs ────────────────────────────────────────────────────

export type ValidationReport = {
  twelve_song_check: boolean;
  persona_resolved: boolean;
  ohi_requested: boolean;
  ohi_lint_passed: boolean | null;        // null if not requested
  hebrew_names_preserved: boolean | null; // null if not requested
  issues: string[];
};

export const ingestJobs = pgTable('ingest_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  source_path: text('source_path').notNull(),
  status: ingestStatusEnum('status').notNull().default('PENDING'),
  album_id: uuid('album_id').references(() => albums.id),
  error_message: text('error_message'),
  validation_report: jsonb('validation_report').$type<ValidationReport>(),
  requested_ohi: boolean('requested_ohi').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  completed_at: timestamp('completed_at')
});

// ─── Audit Log ──────────────────────────────────────────────────────

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  request_id: text('request_id'),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (t) => ({
  entity_idx: index('audit_log_entity_idx').on(t.entity_type, t.entity_id),
  created_idx: index('audit_log_created_idx').on(t.created_at)
}));
```

### 9.2 Migration Strategy

Migrations are generated with Drizzle Kit (`drizzle-kit generate`) and applied automatically on CI during the deploy stage. Never apply migrations manually in production.

```bash
pnpm --filter api drizzle-kit generate
pnpm --filter api drizzle-kit migrate
```

Every migration is reviewed during PR. Destructive migrations (drop column, drop table) require an explicit two-step process: a deploy that stops writing to the column, then a subsequent deploy that drops it.

---

## 10. Application Layer

### 10.1 Fastify Server with Request-ID Propagation

File: `apps/api/src/server.ts`

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { registerRoutes } from './routes';
import { initQueues } from './queue';
import { initScheduler } from './services/scheduler';
import { buildLogger } from './lib/logger';
import { metricsPlugin } from './lib/metrics';

async function build() {
  const app = Fastify({
    logger: buildLogger(),
    trustProxy: true,
    genReqId: (req) =>
      (req.headers['x-request-id'] as string) || randomUUID()
  });

  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Request-Id', req.id);
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: [/\.jubileeverse\.com$/, 'https://jubileeverse.com'],
    credentials: true
  });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });
  await app.register(metricsPlugin);

  await registerRoutes(app);
  await initQueues();
  await initScheduler(app.log);

  return app;
}

async function start() {
  const app = await build();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ host: '0.0.0.0', port });
  app.log.info({ port }, 'Jubilee Radio Engine API listening');
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### 10.2 Structured Logger

File: `apps/api/src/lib/logger.ts`

```typescript
import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

type LogContext = { requestId?: string; userId?: string };
export const logContext = new AsyncLocalStorage<LogContext>();

export function buildLogger() {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    formatters: {
      level: (label) => ({ level: label })
    },
    mixin: () => {
      const ctx = logContext.getStore();
      return ctx ? { request_id: ctx.requestId } : {};
    },
    redact: ['req.headers.authorization', '*.password', '*.token']
  });
}

export const logger = buildLogger();
```

Every service function (scheduler, ingest worker, Liquidsoap bridge, Kingdom Calendar) receives a child logger bound to the current request ID. BullMQ workers propagate the request ID through job metadata so async work remains traceable.

### 10.3 Ingest Pipeline — Conditional OHI

File: `apps/api/src/services/ingest/pipeline.ts`

```typescript
import { readdir } from 'node:fs/promises';
import { extname } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { albums, tracks, ingestJobs, personas } from '../../db/schema';
import { runOhiLint } from './ohi-lint';
import { checkHebrewPreservation } from './hebrew-guard';
import { transcodeToBroadcast } from './transcode';
import { logger } from '../../lib/logger';
import type { ValidationReport } from '../../db/schema';

const AUDIO_EXT = new Set(['.flac', '.wav', '.mp3', '.aac', '.m4a', '.ogg']);

export type AlbumManifest = {
  title: string;
  slug: string;
  format: 'ADULT' | 'KIDS_3_5' | 'KIDS_6_8' | 'GOSPEL' | 'CELESTIAL';
  persona_id: string;
  release_date: string;
  description?: string;
  cover_art_path: string;
  ohi_enabled?: boolean;
  tracks: Array<{
    track_number: number;
    title: string;
    scripture_refs?: string[];
    song_story_markdown?: string;
  }>;
};

export async function runIngest(sourcePath: string, manifest: AlbumManifest) {
  const ohiRequested = manifest.ohi_enabled === true;

  const [{ id: jobId }] = await db.insert(ingestJobs).values({
    source_path: sourcePath,
    status: 'VALIDATING',
    requested_ohi: ohiRequested
  }).returning({ id: ingestJobs.id });

  const report: ValidationReport = {
    twelve_song_check: false,
    persona_resolved: false,
    ohi_requested: ohiRequested,
    ohi_lint_passed: null,
    hebrew_names_preserved: null,
    issues: []
  };

  try {
    // ─── Universal Gate 1: Twelve-song rule ──────────────────────
    const entries = await readdir(sourcePath);
    const audioFiles = entries
      .filter(f => AUDIO_EXT.has(extname(f).toLowerCase()))
      .sort();
    if (audioFiles.length !== 12) {
      report.issues.push(`Expected exactly 12 audio files, found ${audioFiles.length}`);
      throw new IngestError('TWELVE_SONG_VIOLATION');
    }
    report.twelve_song_check = true;

    // ─── Universal Gate 2: Persona resolution ────────────────────
    const persona = await db.query.personas.findFirst({
      where: eq(personas.id, manifest.persona_id)
    });
    if (!persona) {
      report.issues.push(`Unknown persona_id: ${manifest.persona_id}`);
      throw new IngestError('PERSONA_UNRESOLVED');
    }
    report.persona_resolved = true;

    // ─── Conditional Gate 3: OHI vocabulary lint ─────────────────
    if (ohiRequested) {
      const ohiResult = runOhiLint({
        album_title: manifest.title,
        track_titles: manifest.tracks.map(t => t.title),
        description: manifest.description ?? ''
      });
      report.ohi_lint_passed = ohiResult.passed;
      if (!ohiResult.passed) {
        report.issues.push(...ohiResult.violations);
        throw new IngestError('OHI_VIOLATION');
      }

      // ─── Conditional Gate 4: Hebrew preservation ───────────────
      const hebrewResult = checkHebrewPreservation([
        manifest.title,
        ...manifest.tracks.map(t => t.title),
        manifest.description ?? ''
      ]);
      report.hebrew_names_preserved = hebrewResult.passed;
      if (!hebrewResult.passed) {
        report.issues.push(...hebrewResult.violations);
        throw new IngestError('HEBREW_VIOLATION');
      }
    } else {
      logger.info({ jobId, slug: manifest.slug },
        'OHI gates skipped — album did not opt in');
    }

    // All applicable gates passed — proceed to transcode
    await db.update(ingestJobs).set({
      status: 'TRANSCODING',
      validation_report: report
    }).where(eq(ingestJobs.id, jobId));

    const albumId = await transcodeAndPersist(sourcePath, audioFiles, manifest, ohiRequested);

    await db.update(ingestJobs).set({
      status: 'READY',
      album_id: albumId,
      completed_at: new Date(),
      validation_report: report
    }).where(eq(ingestJobs.id, jobId));

    logger.info({ jobId, albumId, ohi: ohiRequested }, 'Ingest complete');
    return albumId;
  } catch (err) {
    await db.update(ingestJobs).set({
      status: 'FAILED',
      error_message: (err as Error).message,
      completed_at: new Date(),
      validation_report: report
    }).where(eq(ingestJobs.id, jobId));
    throw err;
  }
}

class IngestError extends Error {
  constructor(public code: string) { super(code); }
}

async function transcodeAndPersist(
  sourcePath: string,
  audioFiles: string[],
  manifest: AlbumManifest,
  ohiEnabled: boolean
): Promise<string> {
  // Implementation: FFmpeg transcode each track, insert album + 12 tracks
  // Sets ohi_enabled and ohi_certified_at on the album row
  // Returns the new album ID
  throw new Error('Not implemented — see full source');
}
```

### 10.4 Scheduler with OHI and Kingdom Calendar Awareness

File: `apps/api/src/services/scheduler/generator.ts`

```typescript
import { db } from '../../db/client';
import { stations, albums, tracks, stationQueue } from '../../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getActiveProfile } from '../kingdom-calendar/profile-resolver';
import { pickInterstitial } from './interstitial-picker';
import { writeLiquidsoapPlaylist } from './liquidsoap-writer';
import { liquidsoapBridge } from '../liquidsoap/bridge';
import { generateAdult } from './formats/adult';
import { generateKids35 } from './formats/kids-3-5';
import { generateKids68 } from './formats/kids-6-8';
import { generateGospel } from './formats/gospel';
import { generateCelestial } from './formats/celestial';
import { logger } from '../../lib/logger';
import programmingProfiles from '../../../../../packages/config/programming-profiles.json';

const HORIZON_HOURS = 48;

export async function generateAllStations(now = new Date()) {
  const allStations = await db.select().from(stations).where(eq(stations.enabled, true));
  for (const station of allStations) {
    try {
      await generateOne(station, now);
    } catch (err) {
      logger.error({ err, station: station.slug }, 'Station generation failed');
    }
  }
}

async function generateOne(station: typeof stations.$inferSelect, now: Date) {
  // Choose the candidate track pool based on OHI posture
  const albumFilter = station.ohi_required
    ? and(eq(albums.format, station.format as any), eq(albums.ohi_enabled, true))
    : eq(albums.format, station.format as any);

  const pool = await db.select().from(tracks)
    .innerJoin(albums, eq(tracks.album_id, albums.id))
    .where(albumFilter);

  if (pool.length === 0) {
    logger.warn({ station: station.slug },
      'Empty track pool — station will fall back to silent source');
    return;
  }

  // Delegate to format-specific generator with profile-aware context
  const items = [];
  const horizonMs = HORIZON_HOURS * 60 * 60 * 1000;
  let cursor = new Date(now);
  const endAt = new Date(now.getTime() + horizonMs);
  let position = 0;

  while (cursor < endAt) {
    const profileId = station.ohi_required
      ? await getActiveProfile(cursor, station.id)
      : null;
    const profile = profileId ? (programmingProfiles as any)[profileId] : null;

    const candidate = await pickNextTrack({
      stationId: station.id,
      format: station.format as any,
      pool,
      profile,
      cursor,
      history: items
    });

    const endsAt = new Date(cursor.getTime() + candidate.duration_ms);
    items.push({
      station_id: station.id,
      track_id: candidate.id,
      position: position++,
      starts_at: new Date(cursor),
      ends_at: endsAt,
      is_album_block: false,
      is_interstitial: false,
      programming_profile_id: profileId
    });
    cursor = endsAt;

    // Inject interstitial on top-of-hour boundary for OHI stations
    if (profile?.special_interstitials && crossesTopOfHour(items, cursor)) {
      const inter = await pickInterstitial(profile.interstitial_library, cursor);
      if (inter) {
        items.push({
          station_id: station.id,
          track_id: inter.id,
          position: position++,
          starts_at: new Date(cursor),
          ends_at: new Date(cursor.getTime() + inter.duration_ms),
          is_album_block: false,
          is_interstitial: true,
          programming_profile_id: profileId
        });
        cursor = new Date(cursor.getTime() + inter.duration_ms);
      }
    }
  }

  await db.insert(stationQueue).values(items);

  const playlistLines = items.map((i) => tracksPath(i.track_id));
  await liquidsoapBridge.hotSwap(station.slug, playlistLines);

  logger.info({
    station: station.slug,
    items: items.length,
    ohi_required: station.ohi_required
  }, 'Station queue generated and hot-swapped');
}

// pickNextTrack, crossesTopOfHour, tracksPath: utility implementations
```

### 10.5 Schedule Guide API

File: `apps/api/src/routes/schedule.ts`

```typescript
import { FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { stations, stationQueue, tracks, albums, personas } from '../db/schema';
import { eq, and, gte, asc } from 'drizzle-orm';

export async function scheduleRoutes(app: FastifyInstance) {
  app.get<{
    Params: { slug: string },
    Querystring: { limit?: string }
  }>('/stations/:slug/schedule', async (req, reply) => {
    const limit = Math.min(Number(req.query.limit ?? 12), 48);
    const station = await db.query.stations.findFirst({
      where: eq(stations.slug, req.params.slug)
    });
    if (!station) return reply.status(404).send({ error: 'Station not found' });

    const now = new Date();
    const upcoming = await db.select()
      .from(stationQueue)
      .innerJoin(tracks, eq(stationQueue.track_id, tracks.id))
      .innerJoin(albums, eq(tracks.album_id, albums.id))
      .innerJoin(personas, eq(tracks.persona_id, personas.id))
      .where(and(
        eq(stationQueue.station_id, station.id),
        gte(stationQueue.ends_at, now)
      ))
      .orderBy(asc(stationQueue.starts_at))
      .limit(limit);

    reply.header('Cache-Control', 'public, max-age=30');
    return {
      station: station.slug,
      generated_at: now.toISOString(),
      items: upcoming.map(formatScheduleItem)
    };
  });
}

function formatScheduleItem(row: any) {
  return {
    starts_at: row.station_queue.starts_at.toISOString(),
    ends_at: row.station_queue.ends_at.toISOString(),
    is_interstitial: row.station_queue.is_interstitial,
    programming_profile_id: row.station_queue.programming_profile_id,
    track: {
      id: row.tracks.id,
      title: row.tracks.title,
      album_title: row.albums.title,
      cover_art: row.albums.cover_art_path,
      persona: { id: row.personas.id, display_name: row.personas.display_name },
      scripture_refs: row.tracks.scripture_refs,
      has_song_story: Boolean(row.tracks.song_story_markdown)
    }
  };
}
```

### 10.6 Song Story API

```typescript
app.get<{ Params: { id: string } }>('/tracks/:id/story', async (req, reply) => {
  const track = await db.query.tracks.findFirst({
    where: eq(tracks.id, req.params.id),
    with: { album: true, persona: true }
  });
  if (!track || !track.song_story_markdown) {
    return reply.status(404).send({ error: 'No story for this track' });
  }
  reply.header('Cache-Control', 'public, max-age=3600');
  return {
    track_id: track.id,
    title: track.title,
    album_title: track.album.title,
    persona: track.persona,
    scripture_refs: track.scripture_refs,
    prophetic_context: track.prophetic_context,
    story_markdown: track.song_story_markdown
  };
});
```

---

## 11. Frontend

### 11.1 SvelteKit with PWA

File: `apps/web/vite.config.ts`

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default {
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Jubilee Kingdom Radio',
        short_name: 'Jubilee Radio',
        description: 'Kingdom music for every season',
        theme_color: '#1a1a2e',
        icons: [
          { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        runtimeCaching: [
          { urlPattern: /\/art\//, handler: 'CacheFirst' },
          { urlPattern: /\/api\/stations$/, handler: 'StaleWhileRevalidate' },
          { urlPattern: /\/api\/.*/, handler: 'NetworkOnly' }
        ]
      }
    })
  ]
};
```

### 11.2 Player with Banner, Schedule Guide, and Song Story

File: `apps/web/src/lib/components/Player.svelte`

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nowPlaying } from '$lib/stores/now-playing';
  import { schedule } from '$lib/stores/schedule';
  import NowPlayingCard from './NowPlayingCard.svelte';
  import ScheduleGuide from './ScheduleGuide.svelte';
  import SongStory from './SongStory.svelte';
  import ProfileBanner from './ProfileBanner.svelte';
  import PersonaBadge from './PersonaBadge.svelte';

  export let stationSlug: string;

  let audioEl: HTMLAudioElement;
  let playing = false;
  let storyOpen = false;
  let npInterval: ReturnType<typeof setInterval>;
  let schedInterval: ReturnType<typeof setInterval>;

  async function refreshNowPlaying() {
    const r = await fetch(`/api/stations/${stationSlug}/now-playing`);
    if (r.ok) nowPlaying.set(await r.json());
  }
  async function refreshSchedule() {
    const r = await fetch(`/api/stations/${stationSlug}/schedule?limit=12`);
    if (r.ok) schedule.set(await r.json());
  }
  function togglePlay() {
    if (!audioEl || !$nowPlaying) return;
    if (playing) { audioEl.pause(); playing = false; }
    else {
      audioEl.src = $nowPlaying.stream_url + '?t=' + Date.now();
      audioEl.play().then(() => playing = true).catch(console.error);
    }
  }

  onMount(() => {
    refreshNowPlaying();
    refreshSchedule();
    npInterval = setInterval(refreshNowPlaying, 5000);
    schedInterval = setInterval(refreshSchedule, 60_000);
  });
  onDestroy(() => {
    clearInterval(npInterval);
    clearInterval(schedInterval);
  });
</script>

<div class="jubilee-player">
  <audio bind:this={audioEl} preload="none" crossorigin="anonymous" />

  {#if $nowPlaying?.active_profile}
    <ProfileBanner profile={$nowPlaying.active_profile} />
  {/if}

  <div class="main-panel">
    <button on:click={togglePlay} class="play-btn">
      {playing ? 'Pause' : 'Play'}
    </button>
    {#if $nowPlaying?.current}
      <NowPlayingCard item={$nowPlaying.current} />
      <PersonaBadge persona={$nowPlaying.current.persona} />
      {#if $nowPlaying.current.has_song_story}
        <button on:click={() => storyOpen = true} class="story-btn">Song Story</button>
      {/if}
    {/if}
  </div>

  <ScheduleGuide items={$schedule?.items ?? []} />

  {#if storyOpen && $nowPlaying?.current}
    <SongStory trackId={$nowPlaying.current.track_id}
               onClose={() => storyOpen = false} />
  {/if}
</div>
```

### 11.3 Schedule Guide Component

`apps/web/src/lib/components/ScheduleGuide.svelte` renders the next 12 upcoming tracks as a vertical timeline with relative start times, track titles, album covers, and persona badges. Interstitial entries render with a distinctive style (Scripture ref shown prominently, no album art).

### 11.4 Profile Banner Component

Displays active programming profile — "Shabbat Shalom", "Chag Sameach — Sukkot", "Yom Kippur" — with the Hebrew name, scripture anchor, and a subtle, theologically-appropriate visual treatment. Hidden entirely when no profile is active.

---

## 12. Secrets Management — SOPS + age

### 12.1 Setup

Generate an age keypair per environment (staging, production) stored in the ops custodian's password manager. Public keys are committed to `.sops.yaml`:

File: `secrets/.sops.yaml`

```yaml
creation_rules:
  - path_regex: secrets/staging\.enc\.yaml$
    age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  - path_regex: secrets/production\.enc\.yaml$
    age: age1yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

### 12.2 Encrypt a Secret File

```bash
# Plaintext first (never commit)
cat > secrets/production.plain.yaml <<EOF
POSTGRES_PASSWORD: redacted
ICECAST_SOURCE_PASSWORD: redacted
ICECAST_ADMIN_PASSWORD: redacted
GRAFANA_ADMIN_PASSWORD: redacted
B2_ACCOUNT_ID: redacted
B2_ACCOUNT_KEY: redacted
RESTIC_PASSWORD: redacted
CLOUDFLARE_API_TOKEN: redacted
EOF

# Encrypt in place
sops --encrypt secrets/production.plain.yaml > secrets/production.enc.yaml

# Remove plaintext
shred -u secrets/production.plain.yaml
```

Commit only `secrets/production.enc.yaml`. The decryption key lives on the deploy host and in each authorized operator's local environment.

### 12.3 Decrypt at Deploy Time

CI/CD and deploy scripts use SOPS to decrypt into environment variables:

```bash
export $(sops --decrypt secrets/production.enc.yaml | grep -v '^#' | xargs)
docker compose -f infra/docker-compose.prod.yml up -d
```

### 12.4 Rotation

Quarterly rotation is scheduled as a recurring Forgejo issue. Process:
1. Generate new age keypair.
2. Re-encrypt all `*.enc.yaml` files under the new public key.
3. Distribute the new private key to authorized operators.
4. Invalidate the old keypair in password manager.

---

## 13. Testing Strategy

### 13.1 Vitest for Unit and Integration

File: `apps/api/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts']
    },
    setupFiles: ['./tests/setup.ts']
  }
});
```

**Priority coverage targets:**
- 90%+ on `services/ingest/*` (universal gates, OHI gates, Hebrew guard)
- 90%+ on `services/kingdom-calendar/*` (profile resolution, date boundaries)
- 85%+ on `services/scheduler/formats/*` (each format's rotation rules)
- 80%+ on `routes/*` (API contract tests)

Integration tests use a real Postgres test container via Testcontainers, spun up per test file.

### 13.2 Playwright for End-to-End

File: `apps/web/playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } }
  ]
});
```

**Critical E2E flows:**
1. Visit home page → select a station → audio starts → now-playing metadata visible.
2. Station selector cycles through all 5 stations without error.
3. Schedule Guide shows 12 upcoming tracks.
4. Song Story modal opens and renders markdown.
5. Profile Banner appears during a mocked Sabbath window.
6. Admin login flow completes (when admin auth is implemented).
7. Cross-origin embed (`/embed/:slug`) works inside an iframe.

### 13.3 Test-Data Seeding

`tests/fixtures/` contains:
- 6 sample albums (3 OHI-enabled, 3 not)
- 13 persona seed entries
- 5 station seed entries
- A small Kingdom Calendar fixture covering a Sabbath window and a mock feast day

Fixtures load in every test run via a `beforeAll` hook.

---

## 14. Infrastructure

### 14.1 PgBouncer Configuration

File: `infra/pgbouncer/pgbouncer.ini`

```ini
[databases]
jubilee = host=postgres port=5432 dbname=jubilee

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
default_pool_size = 25
max_client_conn = 200
reserve_pool_size = 5
reserve_pool_timeout = 3
server_idle_timeout = 60
server_lifetime = 3600
tcp_keepalive = 1
tcp_keepidle = 60
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1
```

The API connects to `postgres://jubilee:***@pgbouncer:6432/jubilee` rather than directly to Postgres.

### 14.2 Caddy Configuration

File: `infra/caddy/Caddyfile` — identical in structure to v2.0, with main host for app and dedicated `stream.jubileeverse.com` host for Icecast passthrough (live audio settings: `flush_interval -1`, `read_timeout 0`).

### 14.3 Docker Compose — Production

File: `infra/docker-compose.prod.yml`

```yaml
name: jubilee-radio-engine

services:
  caddy:
    image: caddy:2.8-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [api, web, icecast]

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: jubilee
      POSTGRES_USER: jubilee
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - ../storage/postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jubilee"]
      interval: 10s

  pgbouncer:
    image: edoburu/pgbouncer:latest
    restart: unless-stopped
    environment:
      DB_HOST: postgres
      DB_USER: jubilee
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME: jubilee
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 200
      DEFAULT_POOL_SIZE: 25
    volumes:
      - ./pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
    depends_on:
      postgres: { condition: service_healthy }
    expose: ["6432"]

  valkey:
    image: valkey/valkey:8-alpine
    restart: unless-stopped
    command: valkey-server --save 60 1 --appendonly yes
    volumes:
      - ../storage/valkey-data:/data

  icecast:
    image: moul/icecast:latest
    restart: unless-stopped
    environment:
      ICECAST_SOURCE_PASSWORD: ${ICECAST_SOURCE_PASSWORD}
      ICECAST_RELAY_PASSWORD: ${ICECAST_RELAY_PASSWORD}
      ICECAST_ADMIN_PASSWORD: ${ICECAST_ADMIN_PASSWORD}
      ICECAST_HOSTNAME: stream.jubileeverse.com
    volumes:
      - ./icecast/icecast.xml:/etc/icecast.xml:ro
      - ../storage/icecast-logs:/var/log/icecast
    expose: ["8000"]

  liquidsoap:
    image: savonet/liquidsoap:v2.3.0
    restart: unless-stopped
    volumes:
      - ./liquidsoap:/scripts:ro
      - ../storage/broadcast:/broadcast:ro
      - ../storage/playlists:/playlists:ro
    environment:
      ICECAST_SOURCE_PASSWORD: ${ICECAST_SOURCE_PASSWORD}
    command: ["liquidsoap", "/scripts/main.liq"]
    expose: ["1234"]
    depends_on: [icecast]

  api:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://jubilee:${POSTGRES_PASSWORD}@pgbouncer:6432/jubilee
      VALKEY_URL: redis://valkey:6379
      LIQUIDSOAP_HOST: liquidsoap
      LIQUIDSOAP_PORT: 1234
      PLAYLIST_DIR: /playlists
      MASTERS_DIR: /masters
      BROADCAST_DIR: /broadcast
      LOG_LEVEL: info
    volumes:
      - ../storage/masters:/masters
      - ../storage/broadcast:/broadcast
      - ../storage/playlists:/playlists
      - ../packages/config:/config:ro
    expose: ["3000"]
    depends_on:
      pgbouncer: { condition: service_started }
      valkey: { condition: service_started }

  web:
    build:
      context: ..
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PUBLIC_API_URL: https://jubileeverse.com/api
    expose: ["3001"]

  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus_data:/prometheus

  alertmanager:
    image: prom/alertmanager:latest
    restart: unless-stopped
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    expose: ["9093"]

  grafana:
    image: grafana/grafana:11.3.0
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana_data:/var/lib/grafana

  loki:
    image: grafana/loki:3.0.0
    restart: unless-stopped
    command: -config.file=/etc/loki/local-config.yaml

  uptime-kuma:
    image: louislam/uptime-kuma:1
    restart: unless-stopped
    volumes:
      - uptime_kuma_data:/app/data

volumes:
  caddy_data:
  caddy_config:
  prometheus_data:
  grafana_data:
  uptime_kuma_data:
```

### 14.4 Cloudflare Configuration

DNS, SSL/TLS Full (strict), Cache Rules for `/art/*` and on-demand audio paths, firewall rate limits on `/api/*`, origin CA certificate on Caddy. (Identical to v2.0.)

---

## 15. Observability

### 15.1 Prometheus Alert Rules

File: `infra/prometheus/alerts.yml`

```yaml
groups:
  - name: jubilee_radio_engine
    interval: 30s
    rules:
      - alert: StationMountDown
        expr: icecast_source_connected{mount!=""} == 0
        for: 60s
        labels:
          severity: critical
        annotations:
          summary: "Station {{ $labels.mount }} source disconnected"
          description: "Liquidsoap has not been feeding {{ $labels.mount }} for 60 seconds."

      - alert: SchedulerHorizonLow
        expr: jubilee_scheduler_horizon_hours < 12
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Scheduler horizon under 12 hours for {{ $labels.station }}"
          description: "Next scheduler run may not complete in time. Current horizon: {{ $value }}h."

      - alert: IngestQueueBacklog
        expr: jubilee_ingest_queue_depth > 20
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Ingest queue depth high"
          description: "{{ $value }} ingest jobs pending for 30+ minutes."

      - alert: PgBouncerConnectionsHigh
        expr: pgbouncer_pool_used_client_connections / pgbouncer_pool_maxwait_client_connections > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PgBouncer pool utilization above 80%"

      - alert: ValkeyMemoryHigh
        expr: valkey_memory_used_bytes / valkey_memory_max_bytes > 0.75
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Valkey memory above 75%"

      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.2
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Disk space below 20% on {{ $labels.mountpoint }}"

      - alert: HighApi5xxRate
        expr: rate(http_requests_total{code=~"5.."}[5m]) > 0.01
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API 5xx rate above 1%"

      - alert: KingdomGateViolation
        expr: increase(jubilee_ingest_violations_total[1h]) > 0
        labels:
          severity: info
        annotations:
          summary: "{{ $value }} ingest violations in the last hour"
          description: "Check ingest_jobs for details. This is informational — violations are expected for incorrectly-prepared submissions."
```

### 15.2 Alertmanager Routing

File: `infra/alertmanager/alertmanager.yml`

```yaml
route:
  receiver: ops-default
  group_by: [alertname, severity]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers: [severity = "critical"]
      receiver: ops-critical
      repeat_interval: 1h
    - matchers: [severity = "warning"]
      receiver: ops-warning
    - matchers: [severity = "info"]
      receiver: ops-info
      repeat_interval: 24h

receivers:
  - name: ops-default
    webhook_configs:
      - url: ${DISCORD_WEBHOOK_URL}

  - name: ops-critical
    webhook_configs:
      - url: ${DISCORD_WEBHOOK_URL}
    email_configs:
      - to: gabe@jubileeverse.com
        from: alerts@jubileeverse.com
        smarthost: smtp.sendgrid.net:587
        auth_username: apikey
        auth_password: ${SENDGRID_API_KEY}
    # SMS via Twilio webhook proxy
    webhook_configs:
      - url: ${TWILIO_SMS_WEBHOOK_URL}
        send_resolved: true

  - name: ops-warning
    webhook_configs:
      - url: ${DISCORD_WEBHOOK_URL}

  - name: ops-info
    webhook_configs:
      - url: ${DISCORD_WEBHOOK_URL}
```

### 15.3 Key Dashboards

- **Kingdom Radio Overview** — per-station listener counts, mount uptime, active profiles (Sabbath/Feast indicators), 24h and 7d listener trends.
- **Ingest Health** — queue depth, success/fail rate, time-to-ready, OHI-gate violations (broken out), persona-gate violations.
- **Scheduler Health** — horizon per station, last-run times, hot-swap success rate, Kingdom Calendar coverage.
- **Infrastructure** — Postgres + PgBouncer pool utilization, Valkey memory, Caddy latency histograms, disk/CPU/memory per service.
- **OHI Compliance** — albums OHI-enabled vs total, stations OHI-required vs not, active profiles over time.

---

## 16. Backup and Disaster Recovery

### 16.1 Nightly Restic Backup

File: `infra/restic/backup.sh` (identical to v2.0 with added audit-log dump).

Nightly cron: `30 2 * * *` UTC.

Retention: 7 daily + 4 weekly + 12 monthly + 5 yearly.

### 16.2 Monthly Restore Drill

File: `infra/restic/restore-drill.sh`

```bash
#!/usr/bin/env bash
# Automated monthly backup restore drill.
# Runs on a DigitalOcean API token, spins up a fresh VPS, restores
# the latest backup, boots the Docker stack, runs health checks,
# then tears the VPS down. Reports via Discord webhook.

set -euo pipefail

TIMESTAMP=$(date -u +%Y%m%d-%H%M)
DROPLET_NAME="jubilee-restore-drill-$TIMESTAMP"

# 1. Spin up drill VPS
DROPLET_ID=$(doctl compute droplet create "$DROPLET_NAME" \
  --region sfo3 \
  --size s-4vcpu-8gb \
  --image ubuntu-24-04-x64 \
  --ssh-keys "$SSH_KEY_ID" \
  --wait \
  --format ID --no-header)

DROPLET_IP=$(doctl compute droplet get "$DROPLET_ID" \
  --format PublicIPv4 --no-header)

# 2. Bootstrap + install Docker + Restic
ssh -o StrictHostKeyChecking=no root@"$DROPLET_IP" 'bash -s' < scripts/bootstrap.sh

# 3. Install decryption keys (via SOPS-encrypted payload, decrypted here)
sops --decrypt secrets/drill.enc.yaml | ssh root@"$DROPLET_IP" 'cat > /root/drill-env'

# 4. Restore latest snapshot
ssh root@"$DROPLET_IP" <<'REMOTE'
set -euo pipefail
source /root/drill-env
export RESTIC_REPOSITORY RESTIC_PASSWORD B2_ACCOUNT_ID B2_ACCOUNT_KEY
mkdir -p /opt/restore
restic restore latest --target /opt/restore
REMOTE

# 5. Boot stack against restored data
ssh root@"$DROPLET_IP" <<'REMOTE'
set -euo pipefail
cd /opt/restore
docker compose -f infra/docker-compose.prod.yml up -d
sleep 90
# Health checks
curl -fs http://localhost/api/health || exit 1
curl -fs http://localhost/api/stations || exit 1
# Verify at least one OHI-enabled album restored
docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  psql -U jubilee -c "SELECT count(*) FROM albums WHERE ohi_enabled = true" | grep -q "[1-9]"
REMOTE

# 6. Tear down
doctl compute droplet delete "$DROPLET_ID" --force

# 7. Report success via Discord
curl -X POST "$DISCORD_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"✅ Restore drill succeeded — $TIMESTAMP\"}"
```

Scheduled via Forgejo Actions on the 1st of each month at 03:00 UTC. Failures alert critical-severity.

---

## 17. CI/CD Pipeline

### 17.1 Environments

- **dev** — local, Docker Compose, SOPS keys in the developer's local keychain.
- **staging** — second VPS, identical stack, isolated secrets, always running latest `main`.
- **production** — primary VPS, pinned release tags, gated deploy.

### 17.2 Forgejo Actions Workflow

File: `.forgejo/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request: {}

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm -r lint

  test-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: jubilee_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter api drizzle-kit migrate
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/jubilee_test
      - run: pnpm --filter api test --coverage
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/jubilee_test

  test-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web exec playwright install --with-deps
      - run: pnpm --filter web build
      - run: pnpm --filter web test:e2e

  build-images:
    needs: [lint, test-api, test-e2e]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - run: docker build -t jubilee-api:${{ github.sha }} -f apps/api/Dockerfile .
      - run: docker build -t jubilee-web:${{ github.sha }} -f apps/web/Dockerfile .

      - name: Trivy scan — API
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: jubilee-api:${{ github.sha }}
          severity: CRITICAL,HIGH
          exit-code: 1

      - name: Trivy scan — Web
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: jubilee-web:${{ github.sha }}
          severity: CRITICAL,HIGH
          exit-code: 1

      - name: Push to registry
        run: |
          docker tag jubilee-api:${{ github.sha }} registry.jubilee.local/jubilee-api:${{ github.sha }}
          docker tag jubilee-web:${{ github.sha }} registry.jubilee.local/jubilee-web:${{ github.sha }}
          docker push registry.jubilee.local/jubilee-api:${{ github.sha }}
          docker push registry.jubilee.local/jubilee-web:${{ github.sha }}

  deploy-staging:
    needs: build-images
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Deploy via SSH
        env:
          SSH_KEY: ${{ secrets.STAGING_SSH_KEY }}
          STAGING_HOST: ${{ secrets.STAGING_HOST }}
        run: |
          echo "$SSH_KEY" > /tmp/key && chmod 600 /tmp/key
          ssh -i /tmp/key root@$STAGING_HOST \
            "cd /opt/jubilee-radio-engine && \
             git pull && \
             sops --decrypt secrets/staging.enc.yaml > .env && \
             docker compose -f infra/docker-compose.staging.yml pull && \
             docker compose -f infra/docker-compose.staging.yml up -d && \
             docker compose -f infra/docker-compose.staging.yml exec -T api pnpm drizzle-kit migrate"
```

### 17.3 Production Deploy (Manual Gate)

File: `.forgejo/workflows/deploy-production.yml` — triggered manually (`workflow_dispatch`) after staging verification. Requires a tag (e.g., `v1.0.0`) and two-person approval per Forgejo environment protection rules.

---

## 18. Dependency Hygiene

### 18.1 Renovate Configuration

File: `renovate.json`

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", ":semanticCommits", ":dependencyDashboard"],
  "schedule": ["before 4am on monday"],
  "timezone": "America/Los_Angeles",
  "labels": ["dependencies"],
  "packageRules": [
    {
      "matchUpdateTypes": ["patch"],
      "groupName": "patch updates",
      "automerge": false
    },
    {
      "matchUpdateTypes": ["minor"],
      "groupName": "minor updates"
    },
    {
      "matchUpdateTypes": ["major"],
      "dependencyDashboardApproval": true,
      "labels": ["dependencies", "major-upgrade"]
    },
    {
      "matchPackagePatterns": ["^@hebcal/"],
      "reviewers": ["gabe"],
      "description": "Hebrew calendar changes affect programming — Gabe reviews"
    },
    {
      "matchPackagePatterns": ["icecast", "liquidsoap"],
      "groupName": "streaming engines",
      "reviewers": ["gabe"],
      "description": "Streaming engine bumps can affect broadcast — Gabe reviews"
    }
  ],
  "vulnerabilityAlerts": {
    "enabled": true,
    "labels": ["security"]
  }
}
```

### 18.2 Trivy Container Scanning

Runs in CI on every image build; blocks merge if CRITICAL or HIGH vulnerabilities are present (see workflow above). Weekly scheduled scan against the running production images to catch newly-published CVEs between builds.

---

## 19. Deployment Procedure

### 19.1 VPS Bootstrap

File: `scripts/bootstrap.sh` — same as v2.0 (UFW, fail2ban, Docker, unattended-upgrades, Restic). Additionally installs `sops`, `age`, and `doctl` (for the monthly restore drill).

### 19.2 First Deploy (Staging, then Production)

```bash
# 1. On the fresh VPS
cd /opt && git clone git@forgejo.jubilee.local:jubilee/jubilee-radio-engine.git
cd jubilee-radio-engine

# 2. Decrypt env
sops --decrypt secrets/staging.enc.yaml > .env   # or production.enc.yaml

# 3. Validate config
pnpm install && pnpm run validate-config

# 4. Bring up stack
cd infra
docker compose -f docker-compose.staging.yml up -d  # or .prod.yml

# 5. Migrate and seed
docker compose exec api pnpm drizzle-kit migrate
docker compose exec api pnpm tsx scripts/seed-personas.ts
docker compose exec api pnpm tsx scripts/seed-kingdom-calendar.ts

# 6. Verify health
curl -sf https://staging.jubileeverse.com/api/health
```

### 19.3 Ongoing Deploys

All subsequent deploys flow through CI/CD. Manual SSH deploys are prohibited in production except during a declared incident, and are audit-logged.

---

## 20. Testing Checklist

Each phase requires all applicable boxes ticked before promotion.

### Phase 0 — Foundation
- [ ] Staging VPS operational; SOPS keys distributed; age keypair in password manager.
- [ ] CI pipeline passes lint, typecheck, unit, integration, E2E, Trivy on fresh checkout.
- [ ] Renovate Bot installed and opening PRs.

### Phase 1 — Data Layer
- [ ] Postgres migrations apply cleanly from empty database.
- [ ] 13 personas seeded (Eliana Inspire correctly spelled).
- [ ] 5 stations seeded with correct `ohi_required` defaults.
- [ ] Kingdom Calendar seeded with 5 years of events.
- [ ] `validate-config` passes on all JSON config files.

### Phase 2 — Ingest Pipeline
- [ ] Rejects folder with ≠ 12 audio files.
- [ ] Unknown `persona_id` rejected.
- [ ] With `ohi_enabled: true`, OHI lint and Hebrew guard both enforced.
- [ ] With `ohi_enabled: false`, OHI and Hebrew gates skipped (verified in logs).
- [ ] Validation report accurately reflects which gates ran.
- [ ] Audit log captures every successful and failed ingest.

### Phase 3 — Streaming Engine
- [ ] Icecast-KH responds on all 5 mount points.
- [ ] Liquidsoap connects to Icecast as source.
- [ ] Hot-swap telnet command cycles active slot (A→B→A).
- [ ] Verified crossfade during swap has no audible gap.

### Phase 4 — Scheduler + Kingdom Calendar
- [ ] Scheduler generates 48h of queue items for all 5 stations.
- [ ] OHI-required stations draw only from OHI-enabled albums.
- [ ] OHI-optional stations draw from all albums.
- [ ] Active Sabbath window triggers `programming_profile_id = sabbath` on OHI stations only.
- [ ] Feast days correctly activate their profiles.
- [ ] Scripture of the Hour interstitials injected on top-of-hour boundaries during active profiles.
- [ ] Profile overlap resolved by priority (e.g., Sukkot wins over Sabbath).

### Phase 5 — API
- [ ] `/api/stations/:slug/now-playing` returns current + next + active_profile.
- [ ] `/api/stations/:slug/schedule?limit=12` returns upcoming queue.
- [ ] `/api/tracks/:id/story` returns song story when present, 404 when absent.
- [ ] `/api/calendar/upcoming` returns next 30 days of Kingdom Calendar events.
- [ ] Valkey cache hit ratio > 95% on `/now-playing` under load.
- [ ] Request IDs propagate from Caddy → Fastify → services → BullMQ jobs → logs.
- [ ] Rate limit enforced.

### Phase 6 — Frontend
- [ ] Listener UI plays stream in Chrome, Firefox, Edge, Safari, iOS Safari, Android Chrome.
- [ ] Schedule Guide shows next 12 items with correct relative times.
- [ ] Song Story modal opens and renders markdown.
- [ ] Profile Banner appears during Sabbath/Feast windows.
- [ ] PWA manifest installable; offline mode caches UI shell.
- [ ] Embed route renders in iframe with minimal chrome.

### Phase 7 — Infrastructure
- [ ] Caddy serves HTTPS with valid Cloudflare Origin cert.
- [ ] PgBouncer pool utilization under 60% at expected load.
- [ ] All services restart on VPS reboot.
- [ ] First Restic backup runs and verifies.
- [ ] First monthly restore drill succeeds end-to-end.

### Phase 8 — Observability
- [ ] Grafana shows live listener counts per station.
- [ ] Alertmanager fires StationMountDown alert when Liquidsoap is stopped manually.
- [ ] Discord webhook receives alerts.
- [ ] Email + SMS fire only on critical severity.

---

## 21. Operational Runbook

### 21.1 Common Operations

**Ingest a new album:** drop masters into `storage/masters/<album-slug>/` with `manifest.json` (set `ohi_enabled` appropriately), trigger via admin UI or `POST /api/admin/ingest`.

**Force a scheduler regeneration:** `curl -X POST https://jubileeverse.com/api/admin/scheduler/run -H "Authorization: Bearer $ADMIN_TOKEN"`.

**Hot-swap a playlist manually:** `echo "adult.swap" | nc liquidsoap 1234`.

**Toggle a station's OHI requirement:** `UPDATE stations SET ohi_required = true WHERE slug = 'kids-3-5';` then trigger scheduler regenerate.

**Re-seed Kingdom Calendar:** `pnpm tsx scripts/seed-kingdom-calendar.ts`. Safe to re-run — uses `onConflictDoNothing`.

**Add a new programming profile:** edit `packages/config/programming-profiles.json`, deploy via CI (config-only changes don't require migration).

### 21.2 Common Failures

**All streams dead:** check Liquidsoap logs; most common is a malformed playlist file or a `.liq` syntax error.

**One stream dead, others fine:** that station's playlist file is empty or references missing files. Regenerate via scheduler API.

**OHI-required station playing non-OHI track:** bug in scheduler filter; check the query in `generator.ts` and verify `albums.ohi_enabled` column values.

**Sabbath profile not activating:** verify Kingdom Calendar rows exist for the current window (`SELECT * FROM kingdom_calendar WHERE starts_at <= now() AND ends_at >= now();`).

**PgBouncer saturated:** increase `default_pool_size` in `pgbouncer.ini`; investigate long-running queries in Postgres.

### 21.3 Escalation Tiers

- **Tier 1 (automated):** StationMountDown < 5min auto-recovers; ingest failures logged.
- **Tier 2 (AI developer on-call):** scheduler horizon alerts, PgBouncer saturation, rising 5xx rate.
- **Tier 3 (Gabe):** theological violation slipped past OHI gates, persona misassignment, Scripture reference error, Sabbath profile anomaly.
- **Tier 4 (emergency):** data loss, security incident, full outage > 30 min.

Incident response playbook lives at `docs/handbook/incident-response.md`.

---

## 22. Phase Plan and Milestones

| Phase | Scope | Est. Duration | Gate to Advance |
|---|---|---|---|
| 0 | Staging + production VPS bootstrap, SOPS setup, CI pipeline, Renovate, Trivy | 1 week | CI passes lint + tests + Trivy on main |
| 1 | Drizzle schema, migrations, persona + station + Kingdom Calendar seeds | 1 week | `validate-config` green, 5-year calendar seeded |
| 2 | Ingest pipeline with universal gates + optional OHI gates | 2 weeks | Sample OHI and non-OHI albums both ingest correctly |
| 3 | Icecast-KH + Liquidsoap with hot-swap for all 5 stations | 1 week | Silent-stream to all mounts; hot-swap verified |
| 4 | Scheduler with format rules + Kingdom Calendar integration + interstitials | 2 weeks | 48h horizon on all stations; Sabbath profile activates correctly on OHI station |
| 5 | Fastify API (all endpoints) + Pino structured logging + request IDs | 1 week | All Phase 5 tests green |
| 6 | SvelteKit UI with PWA, Schedule Guide, Song Story, Profile Banner | 2 weeks | All Phase 6 tests green |
| 7 | Caddy + PgBouncer + Cloudflare + prod Docker Compose + domain cutover | 3–5 days | Audio playable worldwide |
| 8 | Observability stack with alert rules + multi-channel delivery + backup drill | 1 week | First monthly restore drill succeeds |
| 9 | Soft launch to internal Jubilee team | 1 week | No Kingdom-invariant violations for 7 days |
| 10 | Public Kingdom Radio launch | — | Final Gabe review |

Total: **12–16 weeks** at sustainable AI-assisted pace.

---

## 23. Roadmap Beyond v1

### v1.1 (2–3 months post-launch)
- **Sixth station: Teaching and Sermons.** Long-form teaching from Inspire Family personas.
- **Listener analytics dashboard.** Session length, geographic distribution, peak hours, most-replayed tracks.
- **Admin UI polish.** Full catalog management, Kingdom Calendar override editor, OHI toggle workflow.

### v1.2 (4–6 months post-launch)
- **Per-persona micro-stations.** 13 dedicated streams, one per Inspire Family persona.
- **Song Story enrichment.** Full catalog backfill with prophetic context and Scripture anchors.
- **Live DJ capability.** Liquidsoap `input.harbor` for Gabe or guest teachers to broadcast live.

### v2.0 (6–12 months post-launch)
- **Kingdom Credits integration with BornAgainDNA.com.** Listening time, feast-day participation, Scripture-paired tracks all accrue Kingdom Credits.
- **Listener prayer request queue.** Moderated submission → spoken interstitial integration.
- **Mobile apps (iOS, Android).** Native Swift + Kotlin, consuming the same API + stream URL.
- **On-demand album playback (Track B).** HLS.js + Service Worker spec from v1.0 activated as a parallel consumption mode.

### v2.x+
- **Translations and multi-language UI.** Hebrew UI option, Spanish Kingdom Radio content expansion.
- **Live event streaming.** Broadcast special Kingdom events (feast celebrations, prophetic gatherings) as time-limited stations.
- **Federation.** Relay Jubilee Kingdom Radio to partner ministries under licensing agreements.

---

## 24. Architecture Decision Records (ADRs)

Every significant decision captured in `docs/adr/` as a short markdown document. Template:

```markdown
# ADR-NNNN: <Decision Title>

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-MMMM
**Date:** YYYY-MM-DD
**Deciders:** Gabe, AI Developer

## Context
What is the problem we're addressing? What are the constraints?

## Decision
What we decided.

## Alternatives Considered
- Alt A — why rejected
- Alt B — why rejected

## Consequences
Positive and negative trade-offs we accept.
```

**Initial ADRs to author during Phase 0:**

- **ADR-0001:** Icecast-KH over stock Icecast
- **ADR-0002:** Drizzle over Prisma
- **ADR-0003:** No AzuraCast fork (AGPL license reasoning)
- **ADR-0004:** Dual-playlist hot-swap over single-playlist reload
- **ADR-0005:** OHI as opt-in, not universal
- **ADR-0006:** Jerusalem-anchored Hebrew calendar with per-instance override
- **ADR-0007:** SOPS + age over HashiCorp Vault
- **ADR-0008:** PgBouncer in transaction mode (rationale for pool_size = 25)
- **ADR-0009:** Cloudflare over self-hosted CDN
- **ADR-0010:** Caddy over nginx
- **ADR-0011:** SvelteKit over Next.js
- **ADR-0012:** Valkey over Redis (licensing)
- **ADR-0013:** Forgejo over GitHub (sovereignty posture)
- **ADR-0014:** Monthly automated restore drills

New ADRs are added whenever a significant architectural decision is made. An ADR is never deleted — if it's reversed, a new ADR supersedes it and the old one is marked Superseded.

### Operational Handbook

`docs/handbook/` contains living operational documentation that evolves with the platform:

- `runbook.md` — expanded version of §21 with detailed failure-mode responses
- `incident-response.md` — escalation paths, communication templates, post-mortem process
- `onboarding-a-persona.md` — step-by-step for adding a new Inspire Family persona
- `adding-a-station.md` — full procedure for adding a new station format
- `theological-guardrails.md` — why the Kingdom invariants exist, when to escalate to Gabe

These documents are updated by whoever encountered the situation, as part of incident cleanup. Stale handbook content is worse than no content — entries carry a `last_verified` date.

---

## 25. What This Spec Is Not

- **Not a DRM design.** Streams are served in the clear.
- **Not a user accounts / billing spec.** Separate concern.
- **Not a mobile app spec.** Native apps are v2.0.
- **Not a Track B (on-demand) spec.** Complementary, build after v1 is live.
- **Not a live DJ / harbor input spec.** v1.2 feature.
- **Not a federation / relay spec.** v2.x feature.

---

## Closing Note

This document is the single source of truth for building the Jubilee Radio Engine v1. Every architectural decision in it was made deliberately, with Jubilee's long-term sovereignty, theological integrity, and operational sustainability as the primary constraints — and performance / stability as the secondary ones.

Build it in order. Do not skip phases. Write ADRs for every significant deviation. When edge cases arise that this spec does not address — and they will — bring them to Gabe before making assumptions about theological naming, Kingdom invariants, OHI posture, Sabbath/Feast programming, or the Inspire Family persona system. The code serves the ministry, never the other way around.

*Shalom. To Yahuah be the glory.*

---

## Appendix A — Legacy Public Radio Page (Pre-v1 Player Footer)

This appendix captures decisions about the **current** JubileeVerse.com radio page (`public/radio.html`) that pre-dates the v1 Jubilee Radio Engine build. These notes apply only until the SvelteKit player from §11 ships and replaces the legacy HTML page.

### A.1 — Heaven's Dial SVG Dimensions (2026-05-11)

The tri-band dial in the sticky `.radio-player` footer was rebalanced so the frequency scale row (`.dial-scale-row`, "HM 300 … HM 400") is always visible:

| | Before | After |
|---|---|---|
| `<svg class="dial-svg">` viewBox | `0 0 700 76` | `0 0 700 57` |
| `.dial-svg` CSS `max-height` (desktop) | `100%` | `75%` |
| `.dial-svg` CSS `min-height` (desktop) | `22px` | `17px` |
| `.dial-svg` mobile (`@max-width: 720px`) `max-height` | `110px` | `83px` |
| `.dial-svg` mobile `min-height` | `92px` | `69px` |
| `getBandY('fivefold')` | `{y1: 4, y2: 47}` | `{y1: 3, y2: 35}` |
| `getBandY('multi')` | `{y1: 14, y2: 56}` | `{y1: 11, y2: 42}` |
| `getBandY('mainstream')` | `{y1: 28, y2: 71}` | `{y1: 21, y2: 53}` |
| Indicator bar `<rect>` | `y=2 height=72` | `y=2 height=53` |
| Indicator bottom `<polygon>` (HTML + JS) | `0,76 0,76 0,72` | `0,57 0,57 0,53` |

**Rationale**: The previous `.dial-svg { max-height: 100% }` paired with `flex: 1 1 auto` let the SVG consume the entire vertical space of `.dial-svg-wrap`, hiding the scale labels. Capping at `max-height: 75%` reserves the bottom 25% for `.dial-scale-row` (18px) plus its 4px margin, and the proportional reduction of all viewBox y-coordinates keeps the bars nicely framed in the new canvas.

**Source of truth**: This change must also be applied in `C:\Websites\JubileeVerse.com-Radio\radio\src\public\radio.html` (the canonical radio workspace per commit `e9cda46`). The copy in this repo's `public/radio.html` is a mirror; deploys to prod's `/var/www/JubileeVerse.com/public/radio.html` flow through `JubileeVerse.com-Radio/radio/deploy/`, not through this repo's `scripts/deploy-production.sh`.

QA coverage: `tests/e2e/radio.spec.js @TC-RADIO-SMOKE-009`.

### A.2 — Prev/Next Buttons Are Play-Skip, Not Tune-Cursor (2026-05-13)

The Previous / Next station buttons in the player footer (`#playerBtnPrev`, `#playerBtnNext`) used to call `selectStation()`, which moved only the dial cursor without touching audio. This was a deliberate "tune first, play later" design, but listener feedback consistently treated the buttons as media-player skip buttons (they have skip-style glyphs).

The buttons now call `playStation()` instead of `selectStation()` in `tuneUp()` / `tuneDown()`. Behaviour contract:

- Clicking Previous/Next **always starts audio playback** on the destination station.
- The step is taken from the **selected** station (`currentStationIdx`), not the playing one — so a listener who tunes via the dial and then clicks Next moves forward from the tune cursor's position.
- Buttons remain disabled at the first/last station of the active filter (`refreshDialTuner()` manages the `disabled` attribute via `pos <= 0` and `pos >= filtered.length - 1`).

QA coverage: `tests/e2e/radio.spec.js @TC-RADIO-SMOKE-010`.

### A.3 — Discover Sidebar Waveform Renders Twice (2026-05-13)

`renderDiscoverSidebar()` writes the same HTML string into **both** the desktop and mobile sidebar host elements (`#discoverSidebar` and the mobile equivalent) so a single render keeps both surfaces in sync. As a side effect there are **two** `.dsb-waveform` elements in the DOM at all times.

Any code that toggles state on `.dsb-waveform` (currently `updateAudioPlayingClasses()` flipping `.is-active` on play/pause) **must** use `querySelectorAll('.dsb-waveform')` + `forEach`, not `querySelector(...)`. With the singular form only the first element was being toggled, leaving the second waveform stuck in its animated state after the listener paused — visible whenever the viewport rendered the "other" sidebar.

This contract applies to any future feature that targets the waveform (e.g. mode-color tinting, click-to-scrub). When the JRE v1 SvelteKit player ships and replaces the legacy page, this duplicate-render quirk goes away (Svelte stores will drive a single component), but the test case below should be carried forward as a regression guard for the legacy page until decommissioned.

QA coverage: `tests/e2e/radio.spec.js @TC-RADIO-SMOKE-011`.

---

**End of Specification v3.0 FINAL**
