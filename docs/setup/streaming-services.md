
# KJubilee.com Client-Side Radio Streaming Specification

**Purpose:** Stabilize KJubilee radio playback by moving from server-side streaming to a client-side, schedule-driven simulated live radio player.

**Governing principle:** Listener experience wins over everything else. If the player cannot be certain it is playing the right thing at the right moment, it plays nothing and offers a reconnect action rather than playing the wrong thing.

---

## 1. Architecture Overview

The server does three things and nothing more:

1. Generates broadcast schedules from programming rules.
2. Serves those schedules as static, cacheable JSON.
3. Serves a lightweight time endpoint and accepts listenership telemetry.

The browser does everything else: clock alignment, position calculation, file prefetch, crossfade, playback, and recovery.

There is no Icecast connection, no Liquidsoap session per listener, and no persistent socket. Audio files are ordinary MP3s pulled from the Cloudflare CDN.

**Terminology:** "delayed streaming," not live streaming. The system is a synchronized playback clock, not a live feed. This distinction justifies most of the design decisions below.

---

## 2. Station Identity and Numbering

### 2.1 HM band format

Format: `3NN.DD`

- First digit is permanently locked to `3`. This is the HM band branding marker and is never freed.
- Range: `300.00` through `399.99`.
- Capacity: 100 primary values x 100 decimal sub-slots = **10,000 stations**.
- Current lineup uses 101 stations in the `300.00` to `399.90` range, leaving substantial headroom.

Four-digit expansion (`3NNN.DD`, 100,000 stations) was evaluated and rejected. Three digits reads as real radio and 10,000 is well past any realistic ceiling.

### 2.2 Full feed identifier

A station number alone is not sufficient to identify what is playing. The full identifier is:

```
{station_number}-{location_code}
```

Example: `327.40-SMF`

---

## 3. Location Model

### 3.1 Concept

**Station** = content identity and programming rules.
**Location** = the city a station broadcasts from, which determines the wall clock its programming is built against.
**Feed** = a curated station + location pair. Only feeds get schedules generated.

The same station broadcast from three locations plays the same content arc, shifted so that the morning block lands in each location's actual morning.

### 3.2 Location codes

Use IATA airport codes wherever one exists. Listeners already intuit them, and they carry city identity rather than a naked UTC offset.

| Field             | Example                 | Notes                                 |
| ----------------- | ----------------------- | ------------------------------------- |
| `code`          | `SMF`                 | IATA code, 3 characters, uppercase    |
| `city`          | Sacramento              | Listener-facing name                  |
| `country`       | US                      | ISO country code                      |
| `iana_tz`       | `America/Los_Angeles` | Authoritative for all wall clock math |
| `display_label` | "Sacramento"            | Shown in the location dropdown        |

### 3.3 Curation rule

Feeds are curated, never combinatorially generated. A station + location pair exists only when there is a real audience reason for it.

- **Single location is the norm.** Country music from Nashville (BNA) needs exactly one feed. The location is a credibility signal as much as a clock.
- **Multi-location earns its keep with diaspora audiences.** Romanian programming might run from Bucharest (OTP), Chicago (ORD), and Sacramento (SMF), so a Romanian listener on the US East Coast gets morning programming in their own morning.
- Domestic US multi-location is generally unnecessary. A single US feed covers all four continental time zones acceptably.

### 3.4 Listener-facing naming

Never expose IANA identifiers or UTC offsets in the interface. Use the city name.

Good: "Bucharest" / "Sacramento" / "Chicago"
Bad: "Europe/Bucharest" / "UTC+2" / "US West"

---

## 4. Time and Clock Synchronization

### 4.1 Canonical rules

1. **UTC is the only internal time.** Every stored timestamp, every schedule entry, every comparison.
2. **The generator resolves wall clock to UTC.** A "6 AM morning block" for OTP is resolved against `Europe/Bucharest` and written into the schedule as an absolute UTC instant.
3. **The client never does time zone math.** It compares `now` (UTC) against absolute timestamps. Nothing else.
4. **Pacific is a display convenience only.** Admin views render Pacific for operational readability. It has no role in the data model.
5. **Listeners see their own local time**, with an option to view station-local time.

### 4.2 DST protection

Because Pacific and most station locations shift between standard and daylight time, the generator must build in UTC. Building in local time produces a duplicated hour every fall and a missing hour every spring.

### 4.3 Client clock sync

The device clock cannot be trusted. It may be minutes off, manually wrong, or reset after sleep.

**Sync procedure:**

1. Client records `t0 = performance.now()`.
2. Client requests the time endpoint (a minimal response containing only a UTC timestamp).
3. On response, client records `t1 = performance.now()`.
4. Round trip = `t1 - t0`. Estimated server instant at receipt = `server_time + (round_trip / 2)`.
5. Client stores `offset = estimated_server_instant - local_clock`.
6. All position math thereafter uses `local_clock + offset`.

**Re-sync triggers:**

- Every 5 minutes during active playback.
- On `visibilitychange` when the tab becomes visible.
- On resume from sleep or suspend.
- Whenever the monotonic clock and the wall clock diverge (see 4.4).

### 4.4 Monotonic clock guard

Track `performance.now()` alongside `Date.now()`. If elapsed monotonic time and elapsed wall clock time disagree by more than a small tolerance, the system clock changed underneath you. Discard the stored offset and force a fresh sync before trusting any position calculation.

---

## 5. Schedule Generation

### 5.1 On-demand generation

Schedules are generated lazily, never speculatively.

- First request for a given feed + day materializes the schedule, stores it, and serves it.
- Every subsequent listener that day receives the cached copy.
- A feed with zero listeners generates nothing.

This keeps generation load proportional to actual demand rather than to catalog size.

### 5.2 Generation window

**48 hours: today plus the full next day.**

A rolling window was considered and rejected as unnecessarily complex. The 48 hour block gives buffer across the midnight boundary and serves the next set of listeners without a second generation pass.

### 5.3 Pre-generation for active listeners

Track active listeners per feed. If a feed has listeners at the time the next day's window would be needed, pre-generate it in the background. If it has none, do nothing.

### 5.4 First-listener latency

The first listener of the day absorbs generation time. This is acceptable:

- Conventional streaming services routinely take 20 seconds to a minute to spin up.
- Script execution here should land in a few seconds.
- Even the worst case is a win against the industry norm.

**Interface handling:** show a "Loading streaming services" state. Do not explain the mechanism to the listener.

If generation time ever exceeds a few seconds, add a background warm pass for feeds that had listeners the previous day.

### 5.5 Schedule payload shape

Each entry carries, at minimum:

| Field                  | Purpose                         |
| ---------------------- | ------------------------------- |
| `start_utc`          | Absolute start instant          |
| `duration_ms`        | Exact file duration             |
| `file_url`           | CDN URL                         |
| `track_id`           | Stable identifier for telemetry |
| `type`               | `music` or `spoken`         |
| `title` / `artist` | Media Session metadata          |
| `loudness_lufs`      | Verified normalization value    |

The schedule as a whole carries a `version` / `checksum` and the feed identifier.

### 5.6 Preflight validation gate

**No schedule is ever served until it passes assertion.** Catching one bad schedule on the server is worth a hundred recovery paths on the client.

Required assertions before a generated schedule is stored or served:

| Assertion                                 | Failure meaning                 |
| ----------------------------------------- | ------------------------------- |
| Start times strictly monotonic            | Generator ordering bug          |
| No gaps between entries                   | Listener hits silence           |
| No overlaps between entries               | Position math becomes ambiguous |
| Every`file_url` reachable               | Listener hits a dead load       |
| Every file`normalized = true`           | Volume jump mid-broadcast       |
| Total coverage spans the full window      | Playback cliff at the edge      |
| Every`duration_ms` present and non-zero | Crossfade lands wrong           |

A failed assertion rejects the schedule and raises an alert. The generator does not ship a partial or patched schedule; it fails loudly and the previous valid schedule remains in place.

### 5.7 Deterministic generation

A schedule is a **pure function of feed identifier, date, and ruleset version**. The same three inputs always produce byte-identical output.

Benefits:

- Regeneration after a cache loss produces exactly what listeners already hold, so recovery never desynchronizes anyone.
- Any schedule can be verified by recomputing it rather than trusting stored state.
- Debugging a listener report becomes reproducible: same inputs, same output, every time.

Any randomness in programming rules (rotation, shuffle, variation) must be seeded from those three inputs, never from a wall clock or a system random source.

---

## 6. Schedule Updates and the Freeze Horizon

### 6.1 Why updates exist

Music files are essentially static. Spoken audio segments are not. Reserve the right to update spoken content in response to current events or circumstances.

### 6.2 Checksum polling

- Client polls the schedule endpoint with an `If-None-Match` header carrying the stored ETag.
- Unchanged schedule returns `304 Not Modified` with essentially no body.
- **Default interval: 20 minutes.**
- **Gated on active playback.** Idle tabs do not poll.
- Interval and on/off state are both configuration values.

**Bandwidth impact is negligible.** A few hundred bytes per listener per 20 minutes, absorbed at the Cloudflare edge without touching origin. Even at 10,000 concurrent listeners this is noise.

### 6.3 The freeze horizon

**Rule: changes only apply beyond a 30 minute lead time. Anything inside that window is frozen and the client ignores edits to it.**

Consequences, all of them good:

- A listener mid-song is never interrupted. Ever.
- A listener who un-pauses right at a change boundary continues with the old schedule. Acceptable.
- The five prefetched files are inside the frozen zone by definition, so **no cache invalidation logic is needed for the prefetch buffer at all**.

This is delayed streaming. A change that takes effect an hour from now is entirely sufficient.

---

## 7. Client Storage

### 7.1 Storage layer assignment

| Data                | Store       | Reason                           |
| ------------------- | ----------- | -------------------------------- |
| Schedules           | IndexedDB   | Structured, queried by timestamp |
| Listenership events | IndexedDB   | Structured, needs durable queue  |
| Audio files         | Cache API   | These are real fetched responses |
| Clock offset        | Memory only | Must be re-derived, never stale  |

### 7.2 Storage is a nice-to-have, never a guarantee

Storage is per browser and per origin. Chrome and Firefox on the same machine share nothing. Private windows start empty and are wiped on close.

**Safari is the strictest case:**

- Can evict IndexedDB after roughly 7 days without a visit.
- Throttles background tabs aggressively, so timers you depend on simply stop firing.

**Design implications:**

1. **Never depend on a timer for correctness.** Recompute position from wall clock on every visibility change and every relevant audio event.
2. A listener arriving with empty storage takes the same cold start path as a first-ever listener. That path must be fast and must always work.
3. Queued telemetry may be sitting in a browser the listener never opens again. Accept the loss; do not build around preventing it.

### 7.3 Cross-platform scope

Must work on: desktop Chrome, Firefox, Safari, Edge; mobile Safari (iOS), mobile Chrome (Android); and React Native. Build the playback logic so the platform is an implementation detail rather than a branch point.

### 7.4 Service Worker as the network layer

**All audio and schedule requests route through a Service Worker.** This is the highest-leverage robustness decision in the entire specification.

Responsibilities consolidated into the worker:

1. Cache read-through and write for audio files and schedules.
2. Retry logic with backoff (see 8.4).
3. Origin failover.
4. Offline fallback when the network is unavailable.

Why it matters:

- **One place to reason about.** Caching, retry, and fallback stop being scattered through player code.
- **Survives tab reloads.** The worker persists across page lifecycle events that would otherwise reset in-flight state.
- **Real offline path.** During a brownout the worker serves cached audio without the player needing to know the network is gone.
- **The player gets simpler.** It requests a URL and always receives an answer, success or a clearly typed failure.

The Service Worker is not available in React Native. For that target, implement the same contract as a native network module so the player-facing interface is identical across platforms.

---

## 8. Prefetch and Buffer

### 8.1 Buffer depth

**Default: 5 files ahead. Configurable.**

Applies identically to music and spoken audio. Spoken files are often shorter, which is fine; 5 files still yields a meaningful cushion.

At typical track lengths this covers roughly 20 minutes of total network loss. That matters directly for listeners in regions with brownouts and unreliable connectivity, where playback should continue straight through an outage.

### 8.2 Rolling delete

When the sixth file is fetched, the oldest cached file is evicted. Files already played are eligible for immediate eviction. Maintain a hard cap on total cached bytes and evict least recently used when approached, regardless of buffer position.

### 8.3 Repeat caching

Cloudflare CDN absorbs repeat fetches at no usage cost, so re-fetching a frequently played file is acceptable. Do not build a long-lived favorites cache that grows unbounded; the next-five prefetch is where nearly all the benefit lives.

### 8.4 Multi-origin failover and jittered backoff

Every asset carries a **primary and a secondary origin**. Cloudflare is reliable but not infallible, and a single origin is a single point of failure for the entire platform.

**Retry policy:**

1. Attempt primary origin.
2. On failure, retry with exponential backoff: roughly 1s, 2s, 4s, 8s, capped.
3. **Apply randomized jitter to every delay.** Without jitter, every listener retries in lockstep the instant an origin recovers, which is its own outage.
4. After the capped attempts on primary, fail over to secondary origin and restart the ladder.
5. Report the failover through quality-of-experience telemetry (see 10.7).

Because the prefetch buffer holds 5 files ahead, this entire ladder can run without the listener hearing anything.

---

## 9. Playback Engine

### 9.1 Singleton audio ownership

**Root cause of the current instability:** multiple stations playing simultaneously, skipping, and repeating are the signature of orphaned audio elements. A station switch created a new element without tearing down the previous one, or React re-mounted the player and left the prior instance alive.

**Required design:**

1. Audio elements are owned by a module-level singleton **outside the React component tree**. Components talk to it; they never own it.
2. A **generation counter** increments on every station switch. Any in-flight load, decode, or event callback carrying a stale generation number is discarded on arrival.
3. Teardown is explicit and complete: pause, clear `src`, remove listeners, release the element.

### 9.2 Dual element crossfade

Use two alternating audio elements with a gain ramp on both.

- **Default overlap: 1 to 2 seconds.** Configurable per station.
- Longer sounds mushy; shorter fails to hide the seam.
- This mirrors conventional radio practice: fade the outgoing track down while the incoming track fades up.
- A single element loading the next file creates an audible gap. Do not do this.

### 9.3 Position calculation

On any of: initial load, station switch, visibility change, wake from sleep, or error recovery:

1. Get corrected now (`local_clock + offset`).
2. Find the schedule entry where `start_utc <= now < start_utc + duration_ms`.
3. Compute `seek_offset = now - start_utc`.
4. Set `currentTime = seek_offset / 1000` and play.

Never resume from where the element left off. Always hard-seek from the clock. A laptop that slept four hours comes back with a stale position that must be discarded.

**Continuous drift correction by playback rate, not by seeking.**

Small drift accumulates between the audio element's internal clock and corrected wall clock time. Correct it inaudibly rather than jarringly:

| Drift magnitude | Response                                                                             |
| --------------- | ------------------------------------------------------------------------------------ |
| Under ~50ms     | Ignore                                                                               |
| ~50ms to ~2s    | Nudge`playbackRate` to 0.99 or 1.01 until position reconverges, then return to 1.0 |
| Over ~2s        | Hard seek                                                                            |

Rate nudging at one percent is imperceptible and keeps every listener genuinely locked to the same moment across a long session. Reserve hard-seek for real discontinuities: sleep, tab restore, station switch, error recovery.

### 9.4 Autoplay and user gesture

Browsers block audio without a user gesture. The play button must be the origin of the first playback call. iOS additionally will not preload multiple files without interaction, so prefetch begins after the first gesture, not before.

### 9.5 Required audio event handling

| Event                | Handling                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `error`            | A failed load fires an event rather than throwing. Unhandled, the player sits silent. Catch, log, attempt recovery, then surface reconnect. |
| `stalled`          | Early warning that the buffer is draining. Log and monitor.                                                                                 |
| `waiting`          | Same. If sustained, degrade honestly.                                                                                                       |
| `ended`            | Confirm handoff completed; verify against schedule rather than assuming.                                                                    |
| `visibilitychange` | Re-sync clock, recompute position, hard-seek.                                                                                               |
| `devicechange`     | Headphone unplug or Bluetooth disconnect silently pauses playback. Detect and either resume or surface true state.                          |

### 9.6 Media Session API

Set metadata (station, title, artist, artwork) and wire the play/pause action handlers. Without this, lock screen controls, headphone buttons, and car controls do nothing, which reads as broken on mobile.

### 9.7 Multi-tab protection

Two tabs on the same station both playing produces doubled audio. Use a BroadcastChannel or a Web Lock so the second tab detects the first and offers to take over playback rather than joining it.

### 9.8 Uninterrupted navigation

Audio must continue playing while the listener navigates the site.

- **Requires a single page application with client-side routing.** The singleton element already lives outside the route tree, so this comes free.
- **Every internal link must go through the router.** A single stray anchor tag causing a full document load kills audio.
- **Third-party widgets are a known risk.** They can slip in a full reload. Stress-test for this specifically.
- **Browser back button must be handled by the router history**, not fall through to a document load.

### 9.9 Failure posture

If the player cannot establish correct state, it plays nothing and shows a reconnect action. Silence with a clear recovery path is strictly better than playing the wrong content. One bad listening experience discredits the whole product.

**Graceful degradation on sync failure:** if the time endpoint or the next schedule is unreachable, keep playing from the cached buffer rather than stalling, and re-sync when connectivity returns.

**Station ident bed.** Each station carries one short, permanently cached station identifier and instrumental bed. When position cannot be resolved at all, loop the ident bed behind the reconnect prompt rather than going fully silent.

This is not wrong content, it is honest content. Silence reads as a broken product; a station ident reads as a station having a moment. The ident bed is cached on first visit and is exempt from all eviction policy.

### 9.10 Schedule gap handling

If the computed position lands between entries or past the end of the schedule, do not play silence. Fall back to the next entry or request a fresh schedule, and surface state if neither resolves.

### 9.11 Playback progress watchdog

**The worst failure mode is not an error, it is the silent stall:** internal state says playing, no audio is coming out, and no event ever fires. Every player that feels rock solid has a watchdog; this is what separates one from a player that occasionally just stops.

**Implementation:**

1. Every 2 seconds while state is `playing`, sample `currentTime`.
2. If it has not advanced since the previous sample, increment a stall counter.
3. On the first missed tick, log it as a rebuffer event.
4. After a small number of consecutive missed ticks, force a full recovery cycle: re-sync clock, recompute position, hard-seek, resume.
5. If recovery fails twice in a row, fall back to the station ident bed and surface reconnect (see 9.9).

The watchdog is authoritative over reported element state. If the element claims to be playing and the clock disagrees, the clock wins.

### 9.12 Duration reconciliation

When a file finishes loading, compare its actual decoded duration against the `duration_ms` the schedule declared.

- A mismatch of even a few hundred milliseconds compounds across a broadcast day and lands crossfades in the wrong place.
- On mismatch: log the discrepancy, correct the local timeline for the current session, and flag the file record for reingest so the catalog metadata gets fixed at the source.
- Persistent mismatches on a file should block it from future scheduling, the same way an unnormalized file is blocked.

---

## 10. Listenership Telemetry

### 10.1 What is tracked

Song-completion events, capturing plays per track and plays per track per user. Accounts are required, so user attribution is available.

### 10.2 Wire format: maximally lean

**Positional arrays, not keyed objects.** Both ends know the schema by contract. No field labels, no envelope metadata, no per-record redundancy.

```
[[station_id, track_id, finished_at_utc, event_id], ...]
```

Schema version is carried once at the batch level, not per record.

### 10.3 Batching

Do not send one request per song. Flush a batch on an interval of several minutes and on `pagehide` / `visibilitychange` to hidden.

### 10.4 Handshake and idempotency

1. Each event carries a client-generated `event_id`.
2. Client sends a batch and marks nothing as sent.
3. Server stores and acknowledges the specific `event_id` values it persisted.
4. Client marks only acknowledged IDs as sent. Everything else stays queued.
5. Unacknowledged events retry on the next flush opportunity, indefinitely, until acknowledged.
6. Server discards duplicate `event_id` values, so retries are safe.

### 10.5 Retention

**30 day rolling window in IndexedDB.** Anything older than 30 days is deleted whether or not it was ever acknowledged. If it has not reached the server in 30 days, it is written off.

### 10.6 Uses

Feed-level demand data drives on-demand generation decisions, pre-generation targeting, curation of station + location pairs, and capacity planning.

### 10.7 Quality-of-experience telemetry

Listenership telemetry answers "who is listening." QoE telemetry answers "is it actually working." **Stability has to become a number you can watch, not something diagnosed by listening to the station yourself.**

Tracked alongside listenership, in the same positional-array format, through the same acknowledgment queue:

| Metric                            | Why it matters                                     |
| --------------------------------- | -------------------------------------------------- |
| Time to first audio               | Direct measure of the cold-start experience        |
| Rebuffer count and total duration | The listener-perceived stability number            |
| Error taxonomy                    | Which failures are actually happening, by type     |
| Drift magnitude distribution      | Whether clock sync is holding across long sessions |
| Recovery cycle count              | How often the watchdog is intervening              |
| Origin failover events            | Early warning of CDN trouble                       |
| Schedule fetch failures           | Whether the freeze horizon is absorbing them       |

Segment every metric by **browser, station, and region**. Safari on iOS in a region with poor connectivity is a completely different reliability profile from desktop Chrome, and an aggregate number hides exactly the failures worth fixing.

Set alert thresholds on rebuffer rate and time to first audio so degradation surfaces before listeners report it.

---

## 11. Audio Asset Standards

### 11.1 Loudness normalization is mandatory

An unnormalized quiet spoken segment following a mastered song sends listeners to the volume control every few minutes. Normalize at ingest, not in the browser.

### 11.2 Tracking and enforcement

- Every file record carries a `normalized` flag and the measured `loudness_lufs` value.
- The ingest pipeline flags and reprocesses anything that arrives unnormalized.
- **The schedule generator refuses to program any file that is not cleared as normalized.** This is a hard gate, not a warning.

### 11.3 Applies to all audio

Music and spoken segments alike, across all stations, from launch.

---

## 12. Station Landing Pages

Replace the current visual card plus popup pattern. Popups are insufficient for the content and conversion job.

**Each station gets a dedicated landing page containing:**

1. Play button at the **top** of the page.
2. Marketing copy: what this station is, what it offers, and the concrete benefit to the listener.
3. **Radio station location dropdown**, listing the curated locations available for that station by city name.
4. Play button at the **bottom** of the page.

The location dropdown is the listener-facing surface of the feed model. Selecting a location switches the feed and triggers a full position recompute.

---

## 13. Configuration and Remote Control

### 13.1 Remote config delivery

**Configuration is a small document the client fetches on load and refreshes on every checksum poll.** It is not baked into the build.

When something breaks at 2 AM, the fix is changing a value, not shipping a release. This is the difference between a ten minute recovery and a next-day recovery.

The config document carries every value in the table below plus the safe-mode flag.

### 13.2 Safe mode kill switch

A single remote flag that immediately drops the player to its simplest possible behavior:

- Crossfade disabled, plain sequential playback.
- Drift correction disabled, hard-seek only.
- Prefetch reduced to 2 files.
- Checksum polling disabled.

Safe mode trades polish for certainty. It exists so that a bad interaction discovered in production can be neutralized platform-wide in seconds while the real fix is developed.

### 13.3 Defaults

| Setting                               | Default                            | Configurable     |
| ------------------------------------- | ---------------------------------- | ---------------- |
| Prefetch buffer depth                 | 5 files                            | Yes              |
| Crossfade overlap                     | 1 to 2 seconds                     | Yes, per station |
| Checksum poll interval                | 20 minutes                         | Yes              |
| Checksum polling                      | On, during active playback only    | Yes              |
| Schedule freeze horizon               | 30 minutes                         | Yes              |
| Generation window                     | 48 hours                           | Yes              |
| Clock re-sync interval                | 5 minutes during playback          | Yes              |
| Drift ignore threshold                | 50ms                               | Yes              |
| Drift hard-seek threshold             | 2 seconds                          | Yes              |
| Watchdog sample interval              | 2 seconds                          | Yes              |
| Watchdog missed ticks before recovery | 3                                  | Yes              |
| Retry ladder                          | 1s, 2s, 4s, 8s, jittered           | Yes              |
| Telemetry retention                   | 30 days                            | Yes              |
| Telemetry flush interval              | Several minutes, plus on page hide | Yes              |
| Safe mode                             | Off                                | Yes, remote      |
| Station number format                 | `3NN.DD`                         | No, locked       |

---

## 14. Build Order

### Phase 1: Stop the bleeding

1. Time endpoint, clock sync, and monotonic guard.
2. Singleton audio engine with generation counter and full event handling.
3. Position calculation and hard-seek recovery paths.
4. **Playback progress watchdog (9.11).**
5. Schedule generator with location-aware UTC materialization, on-demand plus 48 hour window.
6. **Preflight validation gate (5.6).**

These six resolve the current instability. Items 2, 4, and 6 target the three failure classes listeners actually notice: doubled or crossed audio, silent stalls, and bad data reaching the client.

### Phase 2: Make it durable

7. **Service Worker network layer (7.4).**
8. IndexedDB schedule store plus Cache API prefetch with rolling delete.
9. **Multi-origin failover with jittered backoff (8.4).**
10. **Remote config and safe mode kill switch (13.1, 13.2).**
11. Checksum polling and freeze horizon.

### Phase 3: Make it measurable

12. Telemetry queue with acknowledgment handshake.
13. **Quality-of-experience telemetry (10.7).**
14. **Deterministic generation from seed (5.7).**

### Phase 4: Make it feel finished

15. Dual element crossfade.
16. **Drift correction by playback rate (9.3).**
17. **Duration reconciliation (9.12).**
18. Media Session, device change, multi-tab lock.
19. **Station ident bed (9.9).**
20. Station landing pages with location dropdown.
21. Normalization enforcement in ingest and generator gate.

Bolded items are the ten stability recommendations layered onto the original build.

---

## 15. Open Items

- Exact schedule JSON schema and field names.
- Initial curated feed matrix: which of the 101 stations get which locations.
- Location code assignments for stations without an obvious home city.
- Server-side telemetry storage model and aggregation cadence.
- React Native audio layer: whether the singleton abstraction holds unchanged or needs a platform adapter.
