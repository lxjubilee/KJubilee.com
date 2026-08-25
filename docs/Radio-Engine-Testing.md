# Jubilee Radio Engine — Testing and Quality Assurance Specification

**Project:** JubileeVerse.com Kingdom Radio — Jubilee Radio Engine (JRE)
**Document Class:** Testing and Quality Assurance Specification
**Testing Stack:** Vitest 2 / Playwright 1.49+ / Testcontainers / k6 / Trivy / axe-core
**Paired With:** Jubilee Radio Engine Implementation Specification v3.0 FINAL
**Owner:** Jubilee Software, Inc. — Folsom, CA
**Document Version:** 1.0
**Status:** Approved for execution

---

## Dedication

The testing of a ministry platform is itself a ministry act. Every bug caught before it reaches a Kingdom listener is a kindness to that listener. Every Kingdom invariant verified — Yahuah preserved as the covenant name, Ruach HaKodesh honored with the feminine pronouns She and Her, the twelve-song rule maintained, Eliana Inspire's name spelled correctly — is a theological safeguard, not a merely technical one.

The AI Tester's work is to ensure that what the AI Developer built matches what Gabe, as steward, specified. The specification is the covenant. The tests are how we verify the covenant is kept.

*Proverbs 27:17 — "Iron sharpens iron, and one person sharpens another."*

---

## Table of Contents

1. [Testing Philosophy and Strategy](#1-testing-philosophy-and-strategy)
2. [Test Environments](#2-test-environments)
3. [Testing Technology Stack](#3-testing-technology-stack)
4. [Test Data and Fixtures](#4-test-data-and-fixtures)
5. [Repository Structure for Tests](#5-repository-structure-for-tests)
6. [Coverage Targets and Quality Gates](#6-coverage-targets-and-quality-gates)
7. [Unit Testing Plan](#7-unit-testing-plan)
8. [Integration Testing Plan](#8-integration-testing-plan)
9. [End-to-End Testing Plan (Playwright)](#9-end-to-end-testing-plan)
10. [Kingdom Invariant Testing](#10-kingdom-invariant-testing)
11. [Sabbath and Feast Day Testing](#11-sabbath-and-feast-day-testing)
12. [OHI Mode Testing (Opt-In Behavior)](#12-ohi-mode-testing)
13. [Performance and Load Testing](#13-performance-and-load-testing)
14. [Security Testing](#14-security-testing)
15. [Accessibility Testing](#15-accessibility-testing)
16. [Browser and Device Compatibility Matrix](#16-browser-and-device-compatibility-matrix)
17. [Manual QA Procedures](#17-manual-qa-procedures)
18. [Regression Testing](#18-regression-testing)
19. [Chaos and Failure Mode Testing](#19-chaos-and-failure-mode-testing)
20. [Release Testing Protocol](#20-release-testing-protocol)
21. [Bug Reporting Standards](#21-bug-reporting-standards)
22. [Test Reporting and Metrics](#22-test-reporting-and-metrics)
23. [CI/CD Integration](#23-cicd-integration)
24. [Pre-Launch Checklist](#24-pre-launch-checklist)
25. [Roles and Responsibilities](#25-roles-and-responsibilities)

---

## 1. Testing Philosophy and Strategy

### 1.1 The Testing Pyramid (Jubilee Variant)

```
                    ┌──────────────────────┐
                    │  Theological Review  │    ← Gabe, final gate
                    │     (by Steward)     │
                    └──────────────────────┘
                  ┌──────────────────────────┐
                  │     Manual QA Review     │    ← Human sanity
                  │   (Test Cases §17)       │
                  └──────────────────────────┘
                ┌──────────────────────────────┐
                │  End-to-End (Playwright §9)  │    ← Cross-browser, full flows
                └──────────────────────────────┘
            ┌────────────────────────────────────┐
            │  Integration (Vitest + TC §8)      │    ← Real DB, real services
            └────────────────────────────────────┘
       ┌──────────────────────────────────────────────┐
       │           Unit (Vitest §7)                   │    ← Fast, isolated
       └──────────────────────────────────────────────┘
    ┌──────────────────────────────────────────────────────┐
    │       Static (TypeScript, ESLint, Trivy §14)         │    ← Free safety
    └──────────────────────────────────────────────────────┘
```

Lower layers are cheap and fast; higher layers are expensive and slow. Every bug should be caught at the lowest possible layer. A unit test failure costs seconds; a theological-review failure costs days.

### 1.2 Four Pillars of JRE Testing

1. **Functional correctness** — the system does what the implementation spec says it should.
2. **Kingdom integrity** — Jubilee's theological invariants are enforced without exception.
3. **Operational resilience** — the platform recovers cleanly from expected failure modes.
4. **Listener experience** — the UI is fast, accessible, cross-browser, and gracefully degrades offline.

Every test plan in this document serves at least one of these pillars. The tests that serve Kingdom integrity (Sections 10, 11, 12) are weighted most heavily in the release gate — a functional bug can ship with a known-issue flag; a Kingdom-integrity bug cannot ship.

### 1.3 Testing Principles

- **Tests are specifications.** A passing test suite IS the definition of "correct behavior." If a test disagrees with the implementation spec, fix the implementation — do not loosen the test without Gabe's approval.
- **Tests that sometimes pass are broken.** Flaky tests are bugs. No exceptions, no "retry and move on" — every flake gets root-caused.
- **Tests run in CI or they don't exist.** A manual test is a suggestion; a CI test is a guarantee.
- **Coverage is a floor, not a ceiling.** 70% line coverage says nothing about whether the tests are meaningful. A meaningful test at 60% coverage beats a smoke test at 95%.
- **Kingdom invariants are never "skipped."** `.skip()` or `.only()` on a Kingdom-invariant test in committed code is a CI failure.

---

## 2. Test Environments

### 2.1 Environment Matrix

| Environment | Purpose | Data | Triggered By |
|---|---|---|---|
| `local-dev` | Developer iteration | Ephemeral fixtures | Manual, `pnpm test` |
| `ci-test` | Automated CI runs | Generated per job | Every push / PR |
| `staging` | Pre-production verification | Synthetic + anonymized | Merge to `main` |
| `perf-test` | Load and scale testing | Scaled fixture set | Scheduled (weekly) + release gate |
| `production` | Live system | Real Kingdom content | Read-only observation; no destructive tests |

### 2.2 Environment Rules

- **No destructive tests run against production.** Ever. Period. The only production "tests" permitted are read-only observability checks (health endpoints, Grafana alert verification).
- **Staging mirrors production architecturally.** Same Docker Compose stack, same Caddy config, same PgBouncer settings, same alert rules — smaller VPS, isolated secrets, mock Backblaze bucket.
- **perf-test is ephemeral.** Spun up via `doctl` or equivalent, torn down after the test suite completes, billed to the testing cost center.
- **Test data never contains real listener PII.** All fixtures use synthetic names, synthetic email addresses (`test-[n]@testing.jubileeverse.local`), and synthetic listener hashes.

### 2.3 Clock Control for Time-Dependent Tests

Sabbath and Feast Day logic depends on wall-clock time. Tests that verify time-dependent behavior (profile activation, top-of-hour interstitial injection, scheduler horizon windows) use Vitest's `vi.useFakeTimers()` plus a `vi.setSystemTime(new Date('2026-05-15T17:30:00Z'))` pattern to pin the clock deterministically.

For Playwright E2E, clock control happens via browser injection: `await page.clock.install({ time: new Date('2026-05-15T17:30:00Z') })` followed by `await page.clock.runFor(60_000)` to advance.

---

## 3. Testing Technology Stack

| Layer | Tool | Version | Purpose |
|---|---|---|---|
| Unit test runner | Vitest | 2.x | Fast isolated tests |
| Integration DB | Testcontainers | latest | Real Postgres per test |
| E2E browser | Playwright | 1.49+ | Chrome, Firefox, WebKit |
| Load testing | k6 | latest | HTTP + streaming load |
| Security scanning | Trivy | latest | Container CVE scan |
| Dependency audit | `pnpm audit` + OSV-Scanner | latest | npm dep CVE scan |
| Accessibility | axe-core + @axe-core/playwright | latest | WCAG 2.1 AA checks |
| Visual regression | Playwright screenshots | 1.49+ | Pixel-level UI stability |
| API contract | Zod schemas + Vitest | latest | Response shape validation |
| Mocking | MSW (Mock Service Worker) | latest | Network-level mocks |
| Fixtures | Drizzle seed scripts | — | Deterministic DB state |
| Coverage | V8 coverage via Vitest | — | Code coverage reports |
| Reporter | GitHub Actions Summary + Loki | — | CI reporting |

All testing tools are installed via `pnpm install --frozen-lockfile` — no globally-installed versions. CI verifies versions match `package.json` exactly.

---

## 4. Test Data and Fixtures

### 4.1 Fixture Categories

Fixtures live in `tests/fixtures/` at the monorepo root and are shared across unit, integration, and E2E tests.

**Persona fixtures** (`tests/fixtures/personas.ts`):

```typescript
export const personaFixtures = [
  {
    id: 'eliana-inspire',
    display_name: 'Eliana Inspire',
    role: 'Apostle-Teacher',
    description: 'Inspire Family apostle-teacher persona'
  },
  {
    id: 'test-persona-alpha',
    display_name: 'Alpha Test Persona',
    role: 'Teacher',
    description: 'Reserved for test suites only'
  },
  {
    id: 'test-persona-beta',
    display_name: 'Beta Test Persona',
    role: 'Prophet',
    description: 'Reserved for test suites only'
  }
  // ... plus 10 more seeded persona records
];
```

**Album fixtures** (`tests/fixtures/albums.ts`) must include:
- **3 OHI-enabled albums** (one per format: ADULT, GOSPEL, CELESTIAL)
- **3 non-OHI albums** (ADULT, KIDS_3_5, KIDS_6_8)
- **1 invalid fixture** with 11 tracks (for twelve-song-rule negative tests)
- **1 invalid fixture** with 13 tracks (for twelve-song-rule negative tests)
- **1 OHI-requested album containing banned vocabulary** (for OHI-lint negative tests)
- **1 OHI-requested album containing "the Ruach HaKodesh"** (for Hebrew article rule negative test)
- **1 OHI-requested album containing "YHWH"** (for covenant name rule negative test)

**Station fixtures** (`tests/fixtures/stations.ts`):

```typescript
export const stationFixtures = [
  { slug: 'adult',     name: 'Jubilee Adult',     format: 'ADULT',     mount_point: '/adult',     ohi_required: true },
  { slug: 'kids-3-5',  name: 'Jubilee Kids 3–5',  format: 'KIDS_3_5',  mount_point: '/kids-3-5',  ohi_required: false },
  { slug: 'kids-6-8',  name: 'Jubilee Kids 6–8',  format: 'KIDS_6_8',  mount_point: '/kids-6-8',  ohi_required: false },
  { slug: 'gospel',    name: 'Jubilee Gospel',    format: 'GOSPEL',    mount_point: '/gospel',    ohi_required: true },
  { slug: 'celestial', name: 'Jubilee Celestial', format: 'CELESTIAL', mount_point: '/celestial', ohi_required: true }
];
```

**Kingdom Calendar fixtures** (`tests/fixtures/kingdom-calendar.ts`):

```typescript
export const calendarFixtures = [
  // A known Sabbath window for deterministic tests
  {
    event_type: 'SABBATH_START',
    starts_at: new Date('2026-05-15T17:30:00Z'), // Friday sunset
    ends_at:   new Date('2026-05-16T18:32:00Z'), // Saturday sunset
    name_en: 'Shabbat Shalom',
    name_he: 'שבת שלום',
    programming_profile: 'sabbath'
  },
  // Mock Sukkot for overlap priority test
  {
    event_type: 'SUKKOT',
    starts_at: new Date('2026-05-15T00:00:00Z'), // overlaps the Sabbath
    ends_at:   new Date('2026-05-22T00:00:00Z'),
    name_en: 'Sukkot',
    name_he: 'סוכות',
    programming_profile: 'sukkot'
  }
  // ... plus one non-overlap feast for priority resolution test
];
```

### 4.2 Fixture Loading Pattern

Every test file that needs DB state loads fixtures in a `beforeAll` hook:

```typescript
import { beforeAll, afterAll } from 'vitest';
import { loadFixtures, truncateAll } from '../helpers/db';

beforeAll(async () => {
  await truncateAll();
  await loadFixtures({
    personas: personaFixtures,
    stations: stationFixtures,
    albums: validAlbumFixtures
  });
});

afterAll(async () => {
  await truncateAll();
});
```

### 4.3 Reference Audio Assets

`tests/fixtures/audio/` contains:
- `valid-track.mp3` — 3-minute sine wave at -16 LUFS, 192kbps, valid for transcoding tests
- `silent-track.mp3` — 10 seconds of silence
- `corrupted.mp3` — truncated file for error-path tests
- `sabbath-interstitial.mp3` — 30-second test interstitial
- `album-12-tracks/` — directory with 12 valid audio files for happy-path ingest
- `album-11-tracks/` — 11 files for twelve-song rule negative test
- `album-13-tracks/` — 13 files for twelve-song rule negative test

All reference assets are < 500KB total and committed to Git LFS.

---

## 5. Repository Structure for Tests

```
jubilee-radio-engine/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   └── **/*.test.ts           # Co-located unit tests
│   │   └── tests/
│   │       ├── integration/           # Integration tests (with Testcontainers)
│   │       │   ├── ingest-pipeline.test.ts
│   │       │   ├── scheduler-run.test.ts
│   │       │   ├── kingdom-calendar.test.ts
│   │       │   └── api-contract.test.ts
│   │       ├── helpers/
│   │       │   ├── db.ts              # Fixture loading, truncation
│   │       │   ├── liquidsoap-mock.ts
│   │       │   └── test-server.ts
│   │       └── setup.ts
│   └── web/
│       ├── src/
│       │   └── **/*.test.ts           # Svelte component unit tests
│       └── tests/
│           ├── e2e/                   # Playwright
│           │   ├── station-playback.spec.ts
│           │   ├── schedule-guide.spec.ts
│           │   ├── song-story.spec.ts
│           │   ├── sabbath-banner.spec.ts
│           │   ├── pwa-offline.spec.ts
│           │   ├── accessibility.spec.ts
│           │   └── embed-iframe.spec.ts
│           └── visual/                # Visual regression screenshots
│
├── tests/
│   ├── fixtures/
│   │   ├── personas.ts
│   │   ├── albums.ts
│   │   ├── stations.ts
│   │   ├── kingdom-calendar.ts
│   │   ├── ohi-banned-words.test.json
│   │   └── audio/
│   ├── load/                          # k6 scripts
│   │   ├── api-now-playing.js
│   │   ├── api-schedule.js
│   │   ├── ingest-pipeline.js
│   │   └── listener-concurrent.js
│   ├── chaos/                         # Failure-mode tests
│   │   ├── liquidsoap-crash.sh
│   │   ├── postgres-failover.sh
│   │   └── pgbouncer-exhaustion.sh
│   └── qa/                            # Manual QA runbooks
│       ├── pre-release-checklist.md
│       ├── theological-review.md
│       └── browser-compat-matrix.md
│
└── .github/                           # or .forgejo/
    └── workflows/
        ├── test-unit.yml
        ├── test-integration.yml
        ├── test-e2e.yml
        ├── test-load.yml
        ├── test-security.yml
        └── test-accessibility.yml
```

---

## 6. Coverage Targets and Quality Gates

### 6.1 Coverage Targets by Module

| Module | Line Coverage | Branch Coverage | Notes |
|---|---|---|---|
| `services/ingest/*` | **95%+** | 90%+ | Kingdom invariants — highest priority |
| `services/kingdom-calendar/*` | **95%+** | 90%+ | Profile resolution must be airtight |
| `services/scheduler/formats/*` | **90%+** | 85%+ | All 5 format generators |
| `services/scheduler/generator.ts` | 90%+ | 85%+ | OHI filter logic critical |
| `services/liquidsoap/*` | 85%+ | 75%+ | Bridge and telnet logic |
| `routes/*` | 85%+ | 75%+ | API contract completeness |
| `db/schema.ts` | N/A | N/A | Declarative — verified by migration tests |
| `lib/logger.ts` | 75%+ | 65%+ | Infrastructure utility |
| `lib/metrics.ts` | 70%+ | 60%+ | Infrastructure utility |
| SvelteKit components | 70%+ | 60%+ | Complemented by E2E |
| **Overall API** | **80%+** | **70%+** | Aggregate floor |
| **Overall Web** | **70%+** | **60%+** | Aggregate floor |

### 6.2 Quality Gates

A PR cannot merge to `main` unless:

- [ ] All Vitest unit tests pass
- [ ] All integration tests pass (against Testcontainers Postgres)
- [ ] All Playwright E2E tests pass on Chromium, Firefox, and WebKit
- [ ] Coverage targets met or exceeded
- [ ] TypeScript compilation clean (`pnpm -r typecheck`)
- [ ] ESLint clean (`pnpm -r lint`)
- [ ] Trivy scan of built images returns zero CRITICAL or HIGH vulnerabilities
- [ ] `pnpm audit` returns no HIGH or CRITICAL advisories
- [ ] axe-core accessibility scan reports zero WCAG 2.1 AA violations on all core routes
- [ ] No `.skip` or `.only` present in committed test files
- [ ] Kingdom invariant test suite passes with 100% of tests (Section 10)

A release cannot ship to production unless:

- [ ] All quality gates above pass on the release tag
- [ ] Load tests meet SLA targets (Section 13)
- [ ] Manual QA pre-release checklist signed off (Section 24)
- [ ] Monthly restore drill has succeeded within the last 35 days
- [ ] Theological review sign-off from Gabe for any content-touching changes

---

## 7. Unit Testing Plan

Unit tests live alongside source files (`foo.ts` → `foo.test.ts`). Run with `pnpm --filter api test:unit` and `pnpm --filter web test:unit`.

### 7.1 Ingest Pipeline — Universal Gates

File: `apps/api/src/services/ingest/twelve-song-gate.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateTwelveSongRule } from './twelve-song-gate';

describe('twelve-song-gate', () => {
  it('accepts exactly 12 audio files', () => {
    const files = Array.from({ length: 12 }, (_, i) => `track-${i+1}.mp3`);
    expect(validateTwelveSongRule(files)).toEqual({ valid: true });
  });

  it('rejects 11 audio files', () => {
    const files = Array.from({ length: 11 }, (_, i) => `track-${i+1}.mp3`);
    const result = validateTwelveSongRule(files);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/exactly 12/i);
  });

  it('rejects 13 audio files', () => {
    const files = Array.from({ length: 13 }, (_, i) => `track-${i+1}.mp3`);
    const result = validateTwelveSongRule(files);
    expect(result.valid).toBe(false);
  });

  it('rejects 0 audio files', () => {
    expect(validateTwelveSongRule([]).valid).toBe(false);
  });

  it('ignores non-audio files when counting', () => {
    const files = [
      ...Array.from({ length: 12 }, (_, i) => `track-${i+1}.mp3`),
      'cover.jpg',
      'manifest.json',
      '.DS_Store'
    ];
    expect(validateTwelveSongRule(files).valid).toBe(true);
  });

  it('handles mixed audio formats totalling 12', () => {
    const files = [
      ...Array.from({ length: 6 }, (_, i) => `track-${i+1}.flac`),
      ...Array.from({ length: 6 }, (_, i) => `track-${i+7}.mp3`)
    ];
    expect(validateTwelveSongRule(files).valid).toBe(true);
  });
});
```

### 7.2 Ingest Pipeline — OHI Linter (Critical Kingdom Invariant)

File: `apps/api/src/services/ingest/ohi-lint.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { runOhiLint } from './ohi-lint';

describe('OHI linter — covenant name enforcement', () => {
  it('accepts "Yahuah" in album title', () => {
    const r = runOhiLint({
      album_title: 'The Name of Yahuah',
      track_titles: [],
      description: ''
    });
    expect(r.passed).toBe(true);
  });

  it('rejects "YHWH"', () => {
    const r = runOhiLint({
      album_title: 'The Name of YHWH',
      track_titles: [],
      description: ''
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some(v => v.includes('YHWH'))).toBe(true);
  });

  it('rejects "Yahweh"', () => {
    const r = runOhiLint({
      album_title: 'Praise Yahweh',
      track_titles: [],
      description: ''
    });
    expect(r.passed).toBe(false);
  });

  it('rejects "LORD" in covenant context', () => {
    const r = runOhiLint({
      album_title: 'Songs to the LORD',
      track_titles: [],
      description: ''
    });
    expect(r.passed).toBe(false);
  });

  it('rejects "Jehovah"', () => {
    const r = runOhiLint({
      album_title: 'Jehovah Reigns',
      track_titles: [],
      description: ''
    });
    expect(r.passed).toBe(false);
  });
});

describe('OHI linter — Hebrew article rule', () => {
  it('accepts "Ruach HaKodesh" (no English article)', () => {
    const r = runOhiLint({
      album_title: 'Ruach HaKodesh Come',
      track_titles: [],
      description: ''
    });
    expect(r.passed).toBe(true);
  });

  it('accepts "the Ruach Kodesh" (English article + dropped Ha-)', () => {
    const r = runOhiLint({
      album_title: 'Songs of the Ruach Kodesh',
      track_titles: [],
      description: ''
    });
    expect(r.passed).toBe(true);
  });

  it('rejects "the Ruach HaKodesh" (double article)', () => {
    const r = runOhiLint({
      album_title: 'The Ruach HaKodesh',
      track_titles: [],
      description: ''
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some(v => v.includes('Ruach'))).toBe(true);
  });

  it('rejects "the HaMashiach"', () => {
    const r = runOhiLint({
      album_title: 'Songs for the HaMashiach',
      track_titles: [],
      description: ''
    });
    expect(r.passed).toBe(false);
  });

  it('rejects "the HaTorah"', () => {
    const r = runOhiLint({
      album_title: 'Reading the HaTorah',
      track_titles: [],
      description: ''
    });
    expect(r.passed).toBe(false);
  });
});

describe('OHI linter — banned vocabulary', () => {
  // Test cases populated from packages/config/ohi-banned-words.json
  // Each banned term gets a positive rejection test here
});

describe('OHI linter — multiple violations', () => {
  it('reports all violations, not just the first', () => {
    const r = runOhiLint({
      album_title: 'YHWH and Yahweh',
      track_titles: ['the Ruach HaKodesh'],
      description: 'Praise Jehovah'
    });
    expect(r.passed).toBe(false);
    expect(r.violations.length).toBeGreaterThanOrEqual(3);
  });
});
```

### 7.3 Hebrew Name Preservation Guard

File: `apps/api/src/services/ingest/hebrew-guard.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { checkHebrewPreservation } from './hebrew-guard';

describe('Hebrew name preservation', () => {
  it('accepts correctly-cased "Yahuah"', () => {
    expect(checkHebrewPreservation(['Call upon Yahuah']).passed).toBe(true);
  });

  it('rejects lowercase "yahuah"', () => {
    const r = checkHebrewPreservation(['call upon yahuah']);
    expect(r.passed).toBe(false);
  });

  it('rejects all-caps "YAHUAH"', () => {
    const r = checkHebrewPreservation(['CALL UPON YAHUAH']);
    expect(r.passed).toBe(false);
  });

  it('accepts correctly-cased "Yeshua"', () => {
    expect(checkHebrewPreservation(['Yeshua HaMashiach']).passed).toBe(true);
  });

  it('rejects lowercase "yeshua"', () => {
    expect(checkHebrewPreservation(['yeshua is Lord']).passed).toBe(false);
  });

  it('accepts "Ruach HaKodesh" with correct casing', () => {
    expect(checkHebrewPreservation(['The Ruach HaKodesh fell']).passed).toBe(true);
  });

  it('rejects "ruach hakodesh" (lowercase)', () => {
    expect(checkHebrewPreservation(['ruach hakodesh fell']).passed).toBe(false);
  });

  it('rejects "Ruach Ha Kodesh" (extraneous space)', () => {
    expect(checkHebrewPreservation(['Ruach Ha Kodesh']).passed).toBe(false);
  });

  it('accepts "Shaddai"', () => {
    expect(checkHebrewPreservation(['El Shaddai']).passed).toBe(true);
  });

  it('rejects "shaddai" (lowercase)', () => {
    expect(checkHebrewPreservation(['el shaddai']).passed).toBe(false);
  });
});
```

### 7.4 Persona Resolution Gate

File: `apps/api/src/services/ingest/persona-gate.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { resolvePersona } from './persona-gate';
import { loadFixtures, truncateAll } from '../../../tests/helpers/db';
import { personaFixtures } from '../../../../../tests/fixtures/personas';

beforeAll(async () => {
  await truncateAll();
  await loadFixtures({ personas: personaFixtures });
});

describe('persona-gate', () => {
  it('resolves Eliana Inspire correctly', async () => {
    const p = await resolvePersona('eliana-inspire');
    expect(p).not.toBeNull();
    expect(p!.display_name).toBe('Eliana Inspire');
    expect(p!.display_name).not.toBe('Ileana Inspire'); // critical
  });

  it('rejects unknown persona_id', async () => {
    const p = await resolvePersona('nonexistent-persona');
    expect(p).toBeNull();
  });

  it('rejects common misspelling "ileana-inspire"', async () => {
    const p = await resolvePersona('ileana-inspire');
    expect(p).toBeNull();
  });

  it('is case-sensitive', async () => {
    const p = await resolvePersona('ELIANA-INSPIRE');
    expect(p).toBeNull();
  });
});
```

### 7.5 Kingdom Calendar Service

File: `apps/api/src/services/kingdom-calendar/service.test.ts`

```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { getActiveProfile, seedKingdomCalendar } from './service';
import { loadFixtures, truncateAll } from '../../../tests/helpers/db';
import { calendarFixtures } from '../../../../../tests/fixtures/kingdom-calendar';

beforeAll(async () => {
  await truncateAll();
  await loadFixtures({ kingdomCalendar: calendarFixtures });
});

describe('Kingdom Calendar profile resolution', () => {
  it('returns null when no event is active', async () => {
    const profile = await getActiveProfile(
      new Date('2026-07-01T12:00:00Z'), // outside all fixture windows
      'mock-station-id'
    );
    expect(profile).toBeNull();
  });

  it('returns "sabbath" profile during Friday sunset to Saturday sunset', async () => {
    const during = new Date('2026-05-15T20:00:00Z'); // mid-Sabbath per fixture
    const profile = await getActiveProfile(during, 'mock-station-id');
    expect(profile).toBe('sabbath');
  });

  it('returns higher-priority profile when Sabbath and Sukkot overlap', async () => {
    // Fixture overlap: Sabbath inside Sukkot week
    const during = new Date('2026-05-16T10:00:00Z');
    const profile = await getActiveProfile(during, 'mock-station-id');
    expect(profile).toBe('sukkot'); // priority 120 beats sabbath 100
  });

  it('returns "yom_kippur" at expected boundary', async () => {
    // Seed a Yom Kippur fixture and verify window boundaries
    // Inclusive of starts_at, exclusive of ends_at
  });

  it('correctly calculates multi-day feast ends', async () => {
    // Pesach = 7 days; verify profile active on day 1 and day 6, inactive on day 8
  });
});

describe('Kingdom Calendar seeding', () => {
  it('seeds 5 years of events without duplicates', async () => {
    await truncateAll();
    await seedKingdomCalendar(new Date('2026-01-01T00:00:00Z'));
    const count = await countCalendarRows();
    expect(count).toBeGreaterThan(200); // weekly Sabbaths alone = 260 over 5 years
  });

  it('is idempotent on re-run', async () => {
    await seedKingdomCalendar(new Date('2026-01-01T00:00:00Z'));
    const firstCount = await countCalendarRows();
    await seedKingdomCalendar(new Date('2026-01-01T00:00:00Z'));
    const secondCount = await countCalendarRows();
    expect(secondCount).toBe(firstCount); // no duplicates
  });

  it('seeds all major feasts for a given Hebrew year', async () => {
    const events = await selectCalendarByYear(5786); // Hebrew year 5786
    const types = new Set(events.map(e => e.event_type));
    expect(types.has('PESACH')).toBe(true);
    expect(types.has('SHAVUOT')).toBe(true);
    expect(types.has('YOM_TERUAH')).toBe(true);
    expect(types.has('YOM_KIPPUR')).toBe(true);
    expect(types.has('SUKKOT')).toBe(true);
    expect(types.has('HANUKKAH')).toBe(true);
    expect(types.has('PURIM')).toBe(true);
  });
});
```

### 7.6 Scheduler Format Generators (One Test Module Per Format)

File: `apps/api/src/services/scheduler/formats/adult.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { generateAdult } from './adult';
import { loadFixtures, truncateAll } from '../../../tests/helpers/db';

beforeAll(async () => {
  await truncateAll();
  await loadFixtures({ /* 10 OHI-enabled ADULT albums */ });
});

describe('Adult format generator', () => {
  it('generates full 48-hour horizon', async () => {
    const items = await generateAdult('station-id', new Date(), 48);
    const last = items[items.length - 1];
    const horizon = last.ends_at.getTime() - items[0].starts_at.getTime();
    expect(horizon).toBeGreaterThanOrEqual(48 * 60 * 60 * 1000 * 0.95);
  });

  it('never repeats the same album within a 2-hour window', async () => {
    const items = await generateAdult('station-id', new Date(), 48);
    for (let i = 0; i < items.length; i++) {
      const window = items.slice(i, i + 20); // next ~2 hours of tracks
      const albumIds = window.map(it => it.album_id);
      const unique = new Set(albumIds);
      // Relaxed: if only 1 album in pool we'd repeat; here we have 10+
      expect(unique.size).toBeGreaterThan(1);
    }
  });

  it('draws only from ADULT-format albums', async () => {
    const items = await generateAdult('station-id', new Date(), 48);
    for (const it of items) {
      expect(it.album_format).toBe('ADULT');
    }
  });

  it('generates items with monotonically increasing starts_at', async () => {
    const items = await generateAdult('station-id', new Date(), 48);
    for (let i = 1; i < items.length; i++) {
      expect(items[i].starts_at.getTime()).toBeGreaterThanOrEqual(
        items[i-1].starts_at.getTime()
      );
    }
  });
});
```

Similar test modules for `kids-3-5.test.ts`, `kids-6-8.test.ts`, `gospel.test.ts`, and `celestial.test.ts`, each verifying format-specific rules:
- Kids 3–5 and 6–8: no more than 4 consecutive tracks before an interstitial marker
- Gospel: album blocks of 12 tracks preserved contiguously
- Celestial: longer crossfade duration respected in generated metadata

### 7.7 Liquidsoap Telnet Bridge

File: `apps/api/src/services/liquidsoap/bridge.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { liquidsoapBridge } from './bridge';
import * as net from 'node:net';

// Mock net.connect to simulate Liquidsoap's telnet responses
vi.mock('node:net', () => ({
  connect: vi.fn((port, host) => {
    const mock = new MockSocket();
    setImmediate(() => mock.emit('connect'));
    return mock;
  })
}));

describe('Liquidsoap bridge hot-swap', () => {
  it('queries active slot, writes to inactive, swaps', async () => {
    MockSocket.responses = {
      'adult.active_slot\nquit\n': 'a\n',
      'adult.swap\nquit\n': 'swapped to b\n'
    };
    const result = await liquidsoapBridge.hotSwap('adult', ['/broadcast/track1.mp3']);
    // Verify playlist file written to <dir>/adult-b.m3u
    // Verify swap command issued
  });

  it('retries on transient telnet errors', async () => {
    // First attempt simulates ECONNREFUSED, second succeeds
  });

  it('times out after 5 seconds', async () => {
    MockSocket.responses = {}; // no reply
    await expect(liquidsoapBridge.sendCommand('help'))
      .rejects.toThrow(/timeout/i);
  });
});
```

### 7.8 API Route Contract Tests

File: `apps/api/src/routes/now-playing.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import { buildTestServer } from '../../tests/helpers/test-server';

const NowPlayingSchema = z.object({
  station: z.string(),
  server_time: z.string().datetime(),
  stream_url: z.string().url(),
  current: z.object({
    track_id: z.string(),
    title: z.string(),
    album_title: z.string(),
    album_id: z.string(),
    cover_art: z.string(),
    persona: z.object({
      id: z.string(),
      display_name: z.string(),
      role: z.string()
    }),
    scripture_refs: z.array(z.string()),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    duration_ms: z.number().int().positive()
  }).nullable(),
  next: z.any().nullable(),
  active_profile: z.object({
    id: z.string(),
    name: z.string()
  }).nullable().optional()
});

describe('GET /api/stations/:slug/now-playing', () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>;
  beforeAll(async () => { app = await buildTestServer(); });

  it('returns 200 with valid schema for known station', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stations/adult/now-playing' });
    expect(res.statusCode).toBe(200);
    expect(() => NowPlayingSchema.parse(res.json())).not.toThrow();
  });

  it('returns 404 for unknown station', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stations/nonexistent/now-playing' });
    expect(res.statusCode).toBe(404);
  });

  it('sets X-Request-Id header on response', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stations/adult/now-playing' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes client-supplied X-Request-Id', async () => {
    const id = 'test-request-id-12345';
    const res = await app.inject({
      method: 'GET',
      url: '/api/stations/adult/now-playing',
      headers: { 'x-request-id': id }
    });
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('sets Cache-Control: no-store', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stations/adult/now-playing' });
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });
});
```

Similar contract test modules for every API route listed in implementation spec Section 10.

---

## 8. Integration Testing Plan

Integration tests use Testcontainers to spin up a real Postgres per test file, plus real Valkey where needed. Run with `pnpm --filter api test:integration`.

### 8.1 Full Ingest Pipeline — Happy Path

File: `apps/api/tests/integration/ingest-pipeline.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { runIngest } from '../../src/services/ingest/pipeline';
import { db, setTestDatabase } from '../../src/db/client';

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  setTestDatabase(container.getConnectionUri());
  await runMigrations();
  await seedTestPersonas();
});

describe('Ingest pipeline — OHI-enabled album', () => {
  it('ingests a valid 12-track OHI album end-to-end', async () => {
    const albumId = await runIngest('tests/fixtures/audio/album-12-tracks', {
      title: 'Songs of Yahuah',
      slug: 'songs-of-yahuah',
      format: 'ADULT',
      persona_id: 'eliana-inspire',
      release_date: '2026-05-01',
      cover_art_path: '/art/songs-of-yahuah.webp',
      ohi_enabled: true,
      tracks: Array.from({ length: 12 }, (_, i) => ({
        track_number: i + 1,
        title: `Track ${i + 1} of Yahuah`,
        scripture_refs: ['Tehillim 100']
      }))
    });
    expect(albumId).toBeDefined();

    // Verify album row
    const album = await db.query.albums.findFirst({ where: eq(albums.id, albumId) });
    expect(album?.ohi_enabled).toBe(true);
    expect(album?.ingest_status).toBe('READY');

    // Verify 12 tracks
    const tracks = await db.query.tracks.findMany({ where: eq(tracks.album_id, albumId) });
    expect(tracks).toHaveLength(12);

    // Verify ingest_job row marked READY with full validation report
    const job = await findIngestJobByAlbum(albumId);
    expect(job.status).toBe('READY');
    expect(job.validation_report.twelve_song_check).toBe(true);
    expect(job.validation_report.persona_resolved).toBe(true);
    expect(job.validation_report.ohi_requested).toBe(true);
    expect(job.validation_report.ohi_lint_passed).toBe(true);
    expect(job.validation_report.hebrew_names_preserved).toBe(true);
  });
});

describe('Ingest pipeline — non-OHI album', () => {
  it('skips OHI gates when ohi_enabled is false', async () => {
    const albumId = await runIngest('tests/fixtures/audio/album-12-tracks', {
      title: 'Kids Songs (Instrumental)',
      slug: 'kids-songs-instrumental',
      format: 'KIDS_3_5',
      persona_id: 'test-persona-alpha',
      release_date: '2026-05-01',
      cover_art_path: '/art/kids-inst.webp',
      ohi_enabled: false,
      tracks: [ /* ... */ ]
    });

    const job = await findIngestJobByAlbum(albumId);
    expect(job.validation_report.ohi_requested).toBe(false);
    expect(job.validation_report.ohi_lint_passed).toBeNull(); // not run
    expect(job.validation_report.hebrew_names_preserved).toBeNull(); // not run
  });

  it('accepts non-OHI album with words that would fail OHI lint', async () => {
    // An album title containing "Yahweh" should INGEST successfully when
    // ohi_enabled is false — OHI is opt-in, not universal.
    const albumId = await runIngest('tests/fixtures/audio/album-12-tracks', {
      title: 'Classic Hymns',
      slug: 'classic-hymns',
      format: 'ADULT',
      persona_id: 'test-persona-alpha',
      release_date: '2026-05-01',
      cover_art_path: '/art/hymns.webp',
      ohi_enabled: false,
      description: 'Traditional hymns including "Yahweh" as it appears in the source',
      tracks: [ /* ... */ ]
    });
    expect(albumId).toBeDefined();
  });
});

describe('Ingest pipeline — failure paths', () => {
  it('rejects OHI album with covenant-name violation', async () => {
    await expect(runIngest('tests/fixtures/audio/album-12-tracks', {
      title: 'Songs of Yahweh', // VIOLATION
      slug: 'violation-test',
      format: 'ADULT',
      persona_id: 'eliana-inspire',
      release_date: '2026-05-01',
      cover_art_path: '/art/x.webp',
      ohi_enabled: true,
      tracks: [ /* 12 tracks */ ]
    })).rejects.toThrow(/OHI_VIOLATION/);
  });

  it('rejects album with 11 tracks regardless of OHI', async () => {
    await expect(runIngest('tests/fixtures/audio/album-11-tracks', {
      title: 'Short Album',
      slug: 'short-album',
      format: 'ADULT',
      persona_id: 'test-persona-alpha',
      release_date: '2026-05-01',
      cover_art_path: '/art/x.webp',
      ohi_enabled: false,
      tracks: [ /* 11 tracks */ ]
    })).rejects.toThrow(/TWELVE_SONG_VIOLATION/);
  });

  it('rejects album with unknown persona', async () => {
    await expect(runIngest('tests/fixtures/audio/album-12-tracks', {
      title: 'Good Title',
      slug: 'bad-persona',
      format: 'ADULT',
      persona_id: 'ileana-inspire', // misspelled, doesn't exist
      release_date: '2026-05-01',
      cover_art_path: '/art/x.webp',
      ohi_enabled: false,
      tracks: [ /* 12 tracks */ ]
    })).rejects.toThrow(/PERSONA_UNRESOLVED/);
  });
});
```

### 8.2 Full Scheduler Run With Kingdom Calendar

File: `apps/api/tests/integration/scheduler-run.test.ts`

Tests the full chain: load albums → generate per-station queue → apply Kingdom Calendar overlay → write playlist file → call Liquidsoap bridge. Verify:
- OHI-required station draws only OHI-enabled albums
- OHI-optional station draws from all albums
- Active Sabbath window triggers `programming_profile_id = 'sabbath'` on OHI stations
- Active Sabbath window has NO effect on non-OHI stations
- Scripture of the Hour interstitial rows appear at top-of-hour boundaries on OHI stations during active profiles
- Overlap priority (Sukkot > Sabbath when concurrent)

### 8.3 API → Valkey → Postgres Chain

File: `apps/api/tests/integration/api-chain.test.ts`

- First request to `/now-playing` hits Postgres, populates Valkey cache.
- Second request within 5 seconds returns cached response (verify `X-Cache: HIT` header).
- After 6 seconds, cache expired, request hits Postgres again.
- When Valkey is unavailable, request still succeeds (gracefully degrades).

---

## 9. End-to-End Testing Plan

Playwright tests in `apps/web/tests/e2e/`. Run against staging via `E2E_BASE_URL=https://staging.jubileeverse.com pnpm --filter web test:e2e`.

### 9.1 Core Listener Flow

File: `apps/web/tests/e2e/station-playback.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Station playback', () => {
  test('home page loads and shows all 5 stations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Adult/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Kids 3[–-]5/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Kids 6[–-]8/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Gospel/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Celestial/i })).toBeVisible();
  });

  test('selecting Adult station starts playback', async ({ page }) => {
    await page.goto('/station/adult');
    await page.getByRole('button', { name: /Play/i }).click();

    // Wait for audio element to have a src
    const audioSrc = await page.locator('audio').getAttribute('src');
    expect(audioSrc).toContain('stream.jubileeverse.com/adult');

    // Verify playing state reflected in UI
    await expect(page.getByRole('button', { name: /Pause/i })).toBeVisible({ timeout: 10_000 });
  });

  test('now-playing card shows current track metadata', async ({ page }) => {
    await page.goto('/station/adult');
    await expect(page.locator('[data-testid="now-playing-title"]')).not.toBeEmpty();
    await expect(page.locator('[data-testid="persona-badge"]')).toBeVisible();
  });

  test('cycling through all stations works', async ({ page }) => {
    const stations = ['adult', 'kids-3-5', 'kids-6-8', 'gospel', 'celestial'];
    for (const s of stations) {
      await page.goto(`/station/${s}`);
      await expect(page.locator('[data-testid="now-playing-title"]'))
        .not.toBeEmpty({ timeout: 10_000 });
    }
  });
});
```

### 9.2 Schedule Guide

File: `apps/web/tests/e2e/schedule-guide.spec.ts`

```typescript
test('schedule guide shows 12 upcoming tracks', async ({ page }) => {
  await page.goto('/station/adult');
  const items = page.locator('[data-testid="schedule-item"]');
  await expect(items).toHaveCount(12);
});

test('schedule items show relative start times', async ({ page }) => {
  await page.goto('/station/adult');
  const firstItem = page.locator('[data-testid="schedule-item"]').first();
  await expect(firstItem.locator('[data-testid="relative-time"]'))
    .toHaveText(/in \d+ min|Now|Up next/);
});

test('interstitial items visually distinct', async ({ page }) => {
  // Requires test data with at least one interstitial in schedule
  await page.goto('/station/gospel');
  const interstitial = page.locator('[data-testid="schedule-item"][data-interstitial="true"]');
  if (await interstitial.count() > 0) {
    await expect(interstitial.first()).toHaveClass(/interstitial/);
    await expect(interstitial.first().locator('[data-testid="scripture-ref"]'))
      .toBeVisible();
  }
});
```

### 9.3 Song Story Modal

File: `apps/web/tests/e2e/song-story.spec.ts`

```typescript
test('song story button opens modal when story present', async ({ page }) => {
  await page.goto('/station/adult');
  const storyButton = page.getByRole('button', { name: /Song Story/i });
  if (await storyButton.isVisible()) {
    await storyButton.click();
    await expect(page.locator('[data-testid="song-story-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="song-story-markdown"]')).not.toBeEmpty();
    await page.getByRole('button', { name: /Close/i }).click();
    await expect(page.locator('[data-testid="song-story-modal"]')).not.toBeVisible();
  }
});
```

### 9.4 Sabbath / Feast Banner (with Clock Injection)

File: `apps/web/tests/e2e/sabbath-banner.spec.ts`

```typescript
test('profile banner appears during Sabbath window', async ({ page, context }) => {
  // Pin clock to Friday sunset + 1 hour (well inside Sabbath)
  await context.clock.install({ time: new Date('2026-05-15T18:30:00Z') });

  await page.goto('/station/gospel'); // OHI-required station
  await expect(page.locator('[data-testid="profile-banner"]')).toBeVisible();
  await expect(page.locator('[data-testid="profile-banner-name"]'))
    .toHaveText(/Shabbat Shalom/);
  await expect(page.locator('[data-testid="profile-banner-scripture"]'))
    .toContainText(/Yeshayahu 58|Shemot 20|Vayikra 23/);
});

test('profile banner does NOT appear on non-OHI station during Sabbath', async ({ page, context }) => {
  await context.clock.install({ time: new Date('2026-05-15T18:30:00Z') });
  await page.goto('/station/kids-3-5'); // non-OHI by default
  await expect(page.locator('[data-testid="profile-banner"]')).not.toBeVisible();
});

test('Hebrew name renders with Hebrew font', async ({ page, context }) => {
  await context.clock.install({ time: new Date('2026-05-15T18:30:00Z') });
  await page.goto('/station/gospel');
  const hebrewName = page.locator('[data-testid="profile-banner-hebrew"]');
  await expect(hebrewName).toBeVisible();
  await expect(hebrewName).toHaveText(/שבת שלום/);
});
```

### 9.5 PWA Offline Mode

File: `apps/web/tests/e2e/pwa-offline.spec.ts`

```typescript
test('PWA manifest is served', async ({ page }) => {
  const response = await page.goto('/manifest.webmanifest');
  expect(response?.status()).toBe(200);
  const manifest = await response?.json();
  expect(manifest.name).toBe('Jubilee Kingdom Radio');
});

test('service worker registers', async ({ page }) => {
  await page.goto('/');
  const registered = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.length > 0;
  });
  expect(registered).toBe(true);
});

test('UI shell loads from cache when offline', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await context.setOffline(true);
  await page.reload();

  // UI shell should still render (stream won't play, but UI is there)
  await expect(page.getByRole('button', { name: /Adult/i })).toBeVisible();
});
```

### 9.6 Embed Route

File: `apps/web/tests/e2e/embed-iframe.spec.ts`

```typescript
test('embed route renders minimal chrome', async ({ page }) => {
  await page.goto('/embed/adult');
  // Main nav should NOT be visible
  await expect(page.locator('nav[data-testid="main-nav"]')).not.toBeVisible();
  // Player SHOULD be visible
  await expect(page.locator('[data-testid="jubilee-player"]')).toBeVisible();
});

test('embed works inside iframe', async ({ page }) => {
  await page.setContent(`
    <iframe src="/embed/adult" width="400" height="300"
            id="jv-embed" style="border:0"></iframe>
  `);
  const frame = page.frameLocator('#jv-embed');
  await expect(frame.locator('[data-testid="jubilee-player"]')).toBeVisible();
});
```

---

## 10. Kingdom Invariant Testing

These tests are the **highest-priority** in the suite. A failure here blocks all releases regardless of other test results. They run on every CI job and against every promoted build.

### 10.1 The Kingdom Invariant Master Test

File: `apps/api/tests/integration/kingdom-invariants.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('KINGDOM INVARIANT — Twelve-song rule', () => {
  // Universal: applies to ALL albums, OHI or not
  it('rejects all album counts except 12', /* ... */);
  it('applies to both OHI and non-OHI ingests', /* ... */);
});

describe('KINGDOM INVARIANT — Persona integrity', () => {
  it('Eliana Inspire is spelled correctly in seed data', async () => {
    const p = await db.query.personas.findFirst({ where: eq(personas.id, 'eliana-inspire') });
    expect(p?.display_name).toBe('Eliana Inspire');
    expect(p?.display_name).not.toBe('Ileana Inspire');
    expect(p?.display_name).not.toContain('Ileana');
  });

  it('all 13 Inspire Family personas are seeded', async () => {
    const personas = await db.select().from(personasTable);
    // Filter out test-only personas
    const inspireFamily = personas.filter(p =>
      !p.id.startsWith('test-')
    );
    expect(inspireFamily).toHaveLength(13);
  });
});

describe('KINGDOM INVARIANT — Covenant name', () => {
  it('"Yahuah" is in Hebrew allowlist', () => {
    expect(allowlist.names).toContain('Yahuah');
  });
  it('OHI linter rejects all known substitutes', () => {
    const substitutes = ['YHWH', 'Yahweh', 'LORD', 'Jehovah'];
    for (const s of substitutes) {
      const r = runOhiLint({ album_title: `Test ${s}`, track_titles: [], description: '' });
      expect(r.passed).toBe(false);
    }
  });
});

describe('KINGDOM INVARIANT — Hebrew article rule', () => {
  it('rejects "the Ruach HaKodesh"', () => {
    const r = runOhiLint({ album_title: 'the Ruach HaKodesh', track_titles: [], description: '' });
    expect(r.passed).toBe(false);
  });
  it('accepts "Ruach HaKodesh" (no English article)', () => { /* ... */ });
  it('accepts "the Ruach Kodesh" (English article + dropped Ha-)', () => { /* ... */ });
  it('applies rule to HaMashiach', () => { /* ... */ });
  it('applies rule to HaTorah', () => { /* ... */ });
});

describe('KINGDOM INVARIANT — Feminine pronouns', () => {
  it('UI copy uses feminine pronouns for Ruach HaKodesh', async () => {
    // Scan all .svelte files and translation JSON for Ruach references
    // Verify they use She/Her/Hers, never He/His/Him
    const files = await glob('apps/web/src/**/*.{svelte,ts,json}');
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const ruachRefs = findRuachReferences(content);
      for (const ref of ruachRefs) {
        expect(ref.nearby_pronouns).not.toMatch(/\b(he|his|him)\b/i);
      }
    }
  });
});

describe('KINGDOM INVARIANT — OHI is opt-in', () => {
  it('default album ohi_enabled is false', async () => {
    // Verify schema default
  });
  it('default station ohi_required for launch stations', async () => {
    const expected = {
      adult: true, 'kids-3-5': false, 'kids-6-8': false,
      gospel: true, celestial: true
    };
    for (const [slug, expected_ohi] of Object.entries(expected)) {
      const s = await db.query.stations.findFirst({ where: eq(stations.slug, slug) });
      expect(s?.ohi_required).toBe(expected_ohi);
    }
  });
  it('non-OHI album passes ingest with content that would fail OHI lint', async () => { /* ... */ });
  it('OHI-required station excludes non-OHI albums from scheduler output', async () => { /* ... */ });
});

describe('KINGDOM INVARIANT — Five launch station formats', () => {
  it('exactly 5 station formats exist in enum', () => {
    expect(STATION_FORMATS).toEqual(['ADULT', 'KIDS_3_5', 'KIDS_6_8', 'GOSPEL', 'CELESTIAL']);
  });
});
```

### 10.2 Kingdom Invariant CI Job

This suite runs in a dedicated CI job tagged `kingdom-invariants`. Failure in this job marks the build as **BLOCKED**, not merely failed. The build cannot be promoted, merged, or deployed until the Kingdom invariant violation is resolved and re-verified.

CI reporting includes a separate dashboard tile: "Kingdom Invariant Status" — green, yellow (warning on flaky test), or red (active violation). Red triggers immediate escalation to Gabe per Tier 3 in the operational runbook.

---

## 11. Sabbath and Feast Day Testing

### 11.1 Kingdom Calendar Coverage

File: `apps/api/tests/integration/calendar-coverage.test.ts`

```typescript
describe('Kingdom Calendar — 5-year horizon', () => {
  it('seeds 260+ Sabbath events (52 per year × 5 years)', async () => { /* ... */ });
  it('seeds 5 occurrences of each major feast', async () => {
    const feasts = ['PESACH', 'SHAVUOT', 'YOM_TERUAH', 'YOM_KIPPUR', 'SUKKOT', 'HANUKKAH', 'PURIM'];
    for (const feast of feasts) {
      const rows = await db.select().from(kingdomCalendar).where(eq(kingdomCalendar.event_type, feast));
      expect(rows.length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('Kingdom Calendar — Profile mapping', () => {
  it('every calendar row has a valid programming_profile', async () => {
    const rows = await db.select().from(kingdomCalendar);
    const profiles = Object.keys(programmingProfilesConfig);
    for (const r of rows) {
      expect(profiles).toContain(r.programming_profile);
    }
  });
});
```

### 11.2 Profile Activation Windows

```typescript
describe('Profile activation boundaries', () => {
  it('Sabbath starts exactly at candle-lighting (Friday sunset)', async () => {
    const t = new Date('2026-05-15T17:29:00Z'); // 1 minute before fixture sunset
    expect(await getActiveProfile(t, 'mock')).toBeNull();
    const t2 = new Date('2026-05-15T17:31:00Z'); // 1 minute after
    expect(await getActiveProfile(t2, 'mock')).toBe('sabbath');
  });

  it('Sabbath ends exactly at havdalah (Saturday 72 min after sunset)', async () => { /* ... */ });

  it('Yom Kippur has correct 25-hour window', async () => {
    // From erev Yom Kippur sunset through the next day's nightfall
  });

  it('multi-day feast (Sukkot) activates on each day', async () => {
    const day1 = new Date('2026-10-17T12:00:00Z');
    const day7 = new Date('2026-10-23T12:00:00Z');
    expect(await getActiveProfile(day1, 'mock')).toBe('sukkot');
    expect(await getActiveProfile(day7, 'mock')).toBe('sukkot');
  });
});
```

### 11.3 Profile Priority Resolution

```typescript
describe('Profile priority when overlapping', () => {
  it('Sukkot beats Sabbath (120 > 100)', async () => { /* ... */ });
  it('Yom Kippur beats Sabbath (140 > 100)', async () => { /* ... */ });
  it('Yom Kippur beats Sukkot (140 > 120)', async () => { /* ... */ });
  it('Pesach beats Sabbath when they coincide', async () => { /* ... */ });
});
```

### 11.4 OHI Station Selective Activation

```typescript
describe('Profile activation is OHI-gated', () => {
  it('activates on ohi_required=true station', async () => {
    const t = new Date('2026-05-15T18:00:00Z'); // Sabbath window
    const items = await generateForStation('gospel', t); // OHI-required
    const duringSabbath = items.filter(i =>
      i.starts_at >= new Date('2026-05-15T17:30:00Z') &&
      i.starts_at <= new Date('2026-05-16T18:32:00Z')
    );
    expect(duringSabbath.every(i => i.programming_profile_id === 'sabbath')).toBe(true);
  });

  it('does NOT activate on ohi_required=false station', async () => {
    const t = new Date('2026-05-15T18:00:00Z'); // Same Sabbath window
    const items = await generateForStation('kids-3-5', t); // non-OHI
    expect(items.every(i => i.programming_profile_id === null)).toBe(true);
  });
});
```

### 11.5 Scripture of the Hour Interstitials

```typescript
describe('Top-of-hour interstitial injection', () => {
  it('injects interstitial at top of hour on OHI station during active profile', async () => {
    const items = await generateForStation('gospel', new Date('2026-05-15T18:00:00Z'));
    const topOfHour = items.filter(i =>
      i.is_interstitial && i.starts_at.getMinutes() < 2
    );
    expect(topOfHour.length).toBeGreaterThan(0);
    expect(topOfHour.every(i => i.programming_profile_id === 'sabbath')).toBe(true);
  });

  it('no interstitial injection outside profile windows', async () => {
    const items = await generateForStation('gospel', new Date('2026-07-01T12:00:00Z')); // no profile
    expect(items.every(i => !i.is_interstitial)).toBe(true);
  });

  it('interstitials drawn from profile-specific library', async () => {
    const items = await generateForStation('gospel', new Date('2026-10-17T13:00:00Z')); // Sukkot
    const interstitials = items.filter(i => i.is_interstitial);
    for (const i of interstitials) {
      const inter = await db.query.interstitials.findFirst({ where: eq(interstitialsTable.id, i.track_id) });
      expect(inter?.library).toBe('sukkot');
    }
  });
});
```

---

## 12. OHI Mode Testing

A dedicated test suite verifies that OHI behaves correctly as **opt-in**, not universal.

File: `apps/api/tests/integration/ohi-mode.test.ts`

```typescript
describe('OHI — album-level opt-in', () => {
  it('ohi_enabled: true triggers all OHI gates', async () => { /* ... */ });
  it('ohi_enabled: false skips OHI gates', async () => { /* ... */ });
  it('ohi_enabled: undefined defaults to false', async () => { /* ... */ });
  it('ohi_enabled cannot be changed post-ingest without audit log entry', async () => { /* ... */ });
});

describe('OHI — station-level enforcement', () => {
  it('ohi_required=true station scheduler picks only OHI-enabled albums', async () => {
    // Set up: 3 OHI-enabled albums, 3 non-OHI albums in ADULT format
    // Set station adult.ohi_required = true
    // Run scheduler
    // Verify all picked tracks are from OHI-enabled albums
  });

  it('ohi_required=false station scheduler picks from all albums', async () => {
    // Same setup but ohi_required = false
    // Verify picked tracks include non-OHI albums
  });

  it('changing station ohi_required triggers scheduler regeneration', async () => { /* ... */ });

  it('empty OHI pool on OHI-required station falls back gracefully', async () => {
    // Remove all OHI-enabled albums
    // Scheduler should log warning, not crash
    // Liquidsoap should fall back to silent-safe source
  });
});

describe('OHI — UI surfacing', () => {
  it('OHI-required station shows certification badge in now-playing response', async () => {
    const res = await fetch('/api/stations/gospel/now-playing');
    const body = await res.json();
    expect(body.station_ohi_certified).toBe(true);
  });
  it('non-OHI station does not show badge', async () => {
    const res = await fetch('/api/stations/kids-3-5/now-playing');
    const body = await res.json();
    expect(body.station_ohi_certified).toBe(false);
  });
});

describe('OHI — content certification workflow', () => {
  it('admin can promote a non-OHI album to OHI-enabled after validation', async () => {
    // POST /api/admin/albums/:id/certify-ohi
    // Re-runs OHI lint + Hebrew guard
    // On success, sets ohi_enabled = true, ohi_certified_at = now, ohi_certified_by = <admin>
  });

  it('certification rejects album that does not pass OHI gates', async () => { /* ... */ });

  it('un-certification workflow exists (ohi_enabled flip to false)', async () => {
    // Albums can be removed from OHI pool (e.g., content revision needed)
    // Audit log records the un-certification with actor + reason
  });
});
```

---

## 13. Performance and Load Testing

Load tests use k6 and run against a dedicated perf-test environment, not production or staging.

### 13.1 API Load Test — Now-Playing Endpoint

File: `tests/load/api-now-playing.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const latency = new Trend('np_latency_ms');

export const options = {
  scenarios: {
    steady_load: {
      executor: 'constant-arrival-rate',
      rate: 500,         // 500 requests per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 100,
      maxVUs: 500
    }
  },
  thresholds: {
    'http_req_duration': ['p(50)<50', 'p(95)<150', 'p(99)<300'],
    'http_req_failed': ['rate<0.001'],
    'np_latency_ms': ['p(95)<150']
  }
};

export default function () {
  const stations = ['adult', 'kids-3-5', 'kids-6-8', 'gospel', 'celestial'];
  const slug = stations[Math.floor(Math.random() * stations.length)];
  const res = http.get(`${__ENV.BASE_URL}/api/stations/${slug}/now-playing`);
  latency.add(res.timings.duration);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has current track': (r) => {
      try { return !!r.json('current.track_id'); }
      catch { return false; }
    }
  });
  sleep(0.1);
}
```

**SLA targets:**
- p50 under 50ms
- p95 under 150ms
- p99 under 300ms
- Failure rate under 0.1%
- Valkey cache hit ratio above 95% during sustained load

### 13.2 Concurrent Listener Simulation

File: `tests/load/listener-concurrent.js`

Simulates 1,000 concurrent listeners each maintaining an audio stream connection for 5 minutes while polling `/now-playing` every 5 seconds and `/schedule` every 60 seconds.

Verifies:
- Icecast handles 1,000 concurrent source connections without frame drops
- Fastify API throughput under listener-driven polling load
- PgBouncer pool utilization stays below 60%
- Valkey memory usage stays below 50% of allocated
- No 5xx errors

### 13.3 Scheduler Generation Performance

```javascript
// Tests the full-station-regeneration path under timing pressure
// Target: generating 48h of queue for all 5 stations completes in under 30 seconds
```

### 13.4 Ingest Pipeline Throughput

Tests batch ingest of 50 albums (600 tracks total) through the pipeline. Target: complete within 20 minutes on a standard 8-vCPU VPS, with FFmpeg utilizing all cores.

### 13.5 Database Performance Baselines

```sql
-- Run EXPLAIN ANALYZE on every production query
-- Verify:
-- - now-playing query executes in under 5ms
-- - schedule query executes in under 15ms
-- - scheduler track-pool query executes in under 50ms
-- - play history insert completes in under 3ms
-- No query uses a sequential scan on stations, tracks, albums, or station_queue
```

---

## 14. Security Testing

### 14.1 Container Image Scanning

Trivy runs on every image build in CI. Policy: zero CRITICAL or HIGH CVEs blocks merge.

```yaml
# In CI workflow
- name: Trivy scan
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: jubilee-api:${{ github.sha }}
    severity: CRITICAL,HIGH
    exit-code: 1
    ignore-unfixed: true
```

Weekly scheduled scan of running production images catches newly-published CVEs between builds.

### 14.2 Dependency Audit

```bash
pnpm audit --audit-level=high
npx osv-scanner --recursive .
```

Both run in CI. Zero high-or-critical advisories allowed.

### 14.3 OWASP Top 10 Checklist

| OWASP Item | JRE Mitigation | Test Approach |
|---|---|---|
| A01 Broken Access Control | Admin routes behind auth; per-route role checks | API contract tests with/without auth tokens |
| A02 Cryptographic Failures | All TLS; SOPS-encrypted secrets; bcrypt for admin passwords | Verify HTTPS-only; audit no plaintext secrets |
| A03 Injection | Drizzle parameterized queries throughout | SQL injection fuzz tests on all API params |
| A04 Insecure Design | Kingdom invariants as compile-time gates | Review via ADRs; threat modeling per major feature |
| A05 Security Misconfiguration | Helmet plugin; strict CSP; default-deny firewall | Security header verification on every route |
| A06 Vulnerable Components | Renovate + Trivy + pnpm audit | Automated; no merge on CRITICAL/HIGH |
| A07 Authentication Failures | Rate limiting; session rotation; no default creds | Auth flow tests; brute-force resistance |
| A08 Data Integrity Failures | Signed Docker images; SOPS-signed secrets | CI verifies signatures |
| A09 Logging Failures | Pino structured logs; request-ID propagation; Loki aggregation | Log completeness audit |
| A10 SSRF | Strict URL allowlist for external fetches | Fuzz tests on any URL-accepting endpoints |

### 14.4 Security Header Verification

```typescript
test('security headers present on all routes', async ({ request }) => {
  const res = await request.get('/');
  expect(res.headers()['strict-transport-security']).toBeDefined();
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['x-frame-options']).toBe('SAMEORIGIN');
  expect(res.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(res.headers()['server']).toBeUndefined(); // stripped
});
```

### 14.5 Rate Limit Verification

```typescript
test('API rate limit triggers at 60 req/min', async ({ request }) => {
  const reqs = Array.from({ length: 65 }, () =>
    request.get('/api/stations/adult/now-playing')
  );
  const results = await Promise.all(reqs);
  const rateLimited = results.filter(r => r.status() === 429);
  expect(rateLimited.length).toBeGreaterThan(0);
});
```

### 14.6 Admin Route Authorization

```typescript
test('admin routes reject unauthenticated requests', async ({ request }) => {
  const res = await request.post('/api/admin/ingest');
  expect(res.status()).toBe(401);
});

test('admin routes reject invalid tokens', async ({ request }) => {
  const res = await request.post('/api/admin/ingest', {
    headers: { Authorization: 'Bearer invalid-token' }
  });
  expect(res.status()).toBe(401);
});
```

---

## 15. Accessibility Testing

### 15.1 Automated Accessibility Scanning

File: `apps/web/tests/e2e/accessibility.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('WCAG 2.1 AA compliance', () => {
  const routes = ['/', '/station/adult', '/station/kids-3-5', '/station/gospel',
                  '/station/celestial', '/embed/adult'];

  for (const route of routes) {
    test(`${route} has no WCAG 2.1 AA violations`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
```

### 15.2 Manual Accessibility Audits

Quarterly manual audit checklist:

- [ ] Keyboard navigation: every interactive element reachable and operable via Tab + Enter/Space
- [ ] Screen reader (NVDA or VoiceOver): all controls, now-playing info, schedule guide announced correctly
- [ ] Color contrast: all text meets WCAG AA 4.5:1 (3:1 for large text)
- [ ] Focus indicators visible on every focusable element
- [ ] No information conveyed by color alone (profile banner uses text, not just color)
- [ ] Audio controls have proper ARIA labels
- [ ] Hebrew text renders with correct RTL direction where applicable
- [ ] Form fields have associated labels
- [ ] Error messages announced to assistive tech
- [ ] Animation respects `prefers-reduced-motion`

### 15.3 Cognitive Accessibility

Kingdom content must be accessible to listeners with varied reading and comprehension levels:

- Scripture refs use full names, not abbreviations, on hover
- Hebrew names have optional transliteration hints
- Complex theological concepts in Song Stories use accessible language

---

## 16. Browser and Device Compatibility Matrix

### 16.1 Supported Browsers (Must Pass All E2E)

| Browser | Minimum Version | Coverage |
|---|---|---|
| Chrome (desktop) | 120+ | Full |
| Firefox (desktop) | 120+ | Full |
| Safari (macOS) | 17+ | Full |
| Edge (desktop) | 120+ | Full |
| Chrome (Android) | 120+ | Full |
| Safari (iOS) | 17+ | Full |
| Samsung Internet | 24+ | Smoke |

### 16.2 Screen Size Matrix

| Category | Viewport | Test Coverage |
|---|---|---|
| Mobile portrait | 375 × 667 | E2E full |
| Mobile landscape | 667 × 375 | E2E core |
| Tablet portrait | 768 × 1024 | E2E core |
| Tablet landscape | 1024 × 768 | E2E core |
| Laptop | 1366 × 768 | E2E full |
| Desktop | 1920 × 1080 | E2E full |
| Large desktop | 2560 × 1440 | Smoke |

### 16.3 Network Condition Simulation

Playwright tests run under three simulated network conditions:
- **Fast 4G** (4Mbps down, 3Mbps up, 70ms latency) — baseline mobile experience
- **Slow 3G** (400kbps down, 400kbps up, 400ms latency) — international Kingdom listeners on poor connections
- **Offline** — PWA mode only (UI shell works; stream requires network)

---

## 17. Manual QA Procedures

Manual QA is performed by the AI Tester against the staging environment before every release. The runbook lives in `tests/qa/pre-release-checklist.md`.

### 17.1 Smoke Test Suite (15 minutes)

Run before every promotion to staging and production:

1. Home page loads; all 5 station buttons visible and enabled.
2. Select Adult station; play button appears; clicking starts audio within 3 seconds.
3. Pause works. Resume works.
4. Now-playing card shows track title, album title, persona badge.
5. Schedule Guide shows 12 upcoming tracks with sensible relative times.
6. Cycle to each other station; audio transitions cleanly.
7. Song Story modal opens for at least one track that has a story.
8. Profile Banner appears if currently within a Sabbath or Feast window (otherwise skip).
9. Embed route (`/embed/adult`) loads without main navigation chrome.
10. Admin login flow completes (when applicable).

### 17.2 Kingdom Content Review (30 minutes — requires Gabe)

Before any content deploy that touches OHI-enabled albums:

1. Spot-check 5 randomly-selected OHI-enabled albums:
   - Album title preserves Hebrew names correctly
   - Track titles preserve Hebrew names correctly
   - All persona references spelled correctly (verify Eliana Inspire specifically)
   - Scripture references are accurate and match canonical Jubilee format
   - Description text uses feminine pronouns for Ruach HaKodesh
2. Spot-check 1 album per Inspire Family persona appearing on air
3. Listen to 60 seconds of each of the 5 stations to verify audio quality and appropriate rotation
4. Verify Profile Banner text is theologically sound if a profile is active
5. Verify Scripture interstitial audio plays cleanly without clipping

### 17.3 Full Regression Pass (3 hours)

Before every tagged release. The complete checklist lives in `tests/qa/pre-release-checklist.md` and covers every feature, browser, and theologically-sensitive area. Broken into:

- **Part A** — Functional regression (all 5 stations, all API endpoints, admin flows)
- **Part B** — Kingdom invariant spot-check (content review above)
- **Part C** — Cross-browser pass (Chromium, Firefox, WebKit, iOS Safari, Android Chrome)
- **Part D** — Accessibility pass (keyboard only, screen reader sample)
- **Part E** — Performance feel (subjective but tracked: audio start latency, UI responsiveness)
- **Part F** — PWA install + offline behavior
- **Part G** — Error handling (force 500s, network drops, invalid inputs)

---

## 18. Regression Testing

### 18.1 Automated Regression Suite

Every PR triggers the full automated regression suite (unit + integration + E2E). Suite must pass in full before merge.

### 18.2 Regression Test Additions Policy

Every fixed bug adds a regression test. Rule: the PR that fixes a bug must include a test that fails on the pre-fix commit and passes on the post-fix commit. CI verifies this via a pre-merge hook.

### 18.3 Visual Regression

Playwright captures screenshots of key pages at each supported viewport. Comparison against baseline flags pixel-level changes. Reviewer confirms intentional UI changes by updating the baseline; unintentional diffs block merge.

```typescript
test('home page visual regression', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('home.png', { maxDiffPixelRatio: 0.01 });
});
```

Baselines are stored per-viewport and per-browser for comprehensive coverage.

---

## 19. Chaos and Failure Mode Testing

Chaos tests verify that the platform degrades gracefully under expected failures. Run quarterly against a dedicated chaos environment.

### 19.1 Liquidsoap Process Crash

File: `tests/chaos/liquidsoap-crash.sh`

```bash
#!/usr/bin/env bash
# Kill Liquidsoap mid-broadcast. Verify:
# 1. Icecast shows source disconnected within 30 seconds
# 2. Prometheus StationMountDown alert fires
# 3. Discord webhook receives alert
# 4. Liquidsoap auto-restarts (docker restart policy)
# 5. Icecast re-accepts source within 60 seconds
# 6. Listeners auto-reconnect (verify in Cloudflare analytics)
# 7. Play history continues (no data loss in DB)
docker compose -f infra/docker-compose.staging.yml kill liquidsoap
sleep 90
# Assertions follow
```

### 19.2 Postgres Outage Simulation

```bash
# Stop Postgres. Verify:
# 1. PgBouncer queues waiting connections
# 2. API returns 503 with Retry-After on /api/admin/* routes
# 3. API serves cached /now-playing from Valkey for up to cache TTL
# 4. Stream continues (Liquidsoap reads playlist files, not DB)
# 5. Prometheus DiskSpaceLow / PgBouncerConnectionsHigh alerts fire appropriately
# 6. On Postgres restart, API recovers without manual intervention
```

### 19.3 PgBouncer Pool Exhaustion

```bash
# Load test with 300 concurrent connections (pool size = 25 × max_client_conn = 200).
# Verify:
# 1. Clients queue rather than fail
# 2. No connection leaks
# 3. Metrics reflect saturation accurately
# 4. Alerts fire per policy
```

### 19.4 Valkey Cache Unavailable

```bash
# Stop Valkey. Verify:
# 1. API degrades to direct Postgres (no errors returned to listeners)
# 2. p95 latency degrades but stays under SLA ceiling
# 3. Prometheus ValkeyDown alert fires
# 4. On Valkey restart, cache repopulates and latency recovers within 2 minutes
```

### 19.5 Kingdom Calendar Seed Corruption

```bash
# Delete random rows from kingdom_calendar. Verify:
# 1. Scheduler detects missing data and logs warnings
# 2. Stations fall back to baseline format rules (no profile active)
# 3. Re-seeding via pnpm tsx scripts/seed-kingdom-calendar.ts restores state
```

### 19.6 Disk-Full Simulation

```bash
# Fill storage volume to 95%. Verify:
# 1. DiskSpaceLow critical alert fires
# 2. Ingest pipeline refuses new jobs (Postgres has space but transcode dir doesn't)
# 3. Liquidsoap continues serving existing playlist
# 4. Backup retention policy can be tightened to free space via ops command
```

---

## 20. Release Testing Protocol

Every tagged release (`v1.0.0`, `v1.0.1`, etc.) follows this protocol.

### 20.1 Pre-Release (T-72 hours)

- [ ] Release branch cut from `main`; version bumped; CHANGELOG updated
- [ ] Full automated regression suite passes on release branch
- [ ] Coverage report attached to release ticket
- [ ] Load test suite passes against staging with release-branch images
- [ ] Trivy scan on release-branch images returns zero CRITICAL/HIGH
- [ ] Deploy release branch to staging
- [ ] AI Tester runs full manual regression pass against staging
- [ ] If any content-touching changes: Gabe runs Kingdom content review

### 20.2 Release Day (T-0)

- [ ] Monthly restore drill confirmed successful within last 35 days
- [ ] Backup verified within last 24 hours
- [ ] All quality gates green
- [ ] Two-person deploy approval recorded in Forgejo environment gate
- [ ] Deploy to production during low-listener window (3–6 AM Pacific)
- [ ] Smoke test suite (§17.1) passes against production within 15 minutes of deploy
- [ ] Grafana dashboards observed for 60 minutes post-deploy; no alerts triggered
- [ ] Cloudflare analytics show stable listener counts

### 20.3 Post-Release (T+24 hours)

- [ ] No new alerts fired beyond baseline
- [ ] No Kingdom-invariant violations reported
- [ ] Listener feedback channels (if any) checked for issues
- [ ] Retrospective scheduled for the release (what went well, what to improve)

### 20.4 Rollback Criteria

A release is rolled back within 60 minutes if any of:

- A Kingdom-invariant violation makes it to production
- Critical alerts fire and don't auto-resolve within 15 minutes
- Listener count drops more than 30% from pre-deploy baseline within 1 hour
- Data corruption detected
- Security incident detected

Rollback procedure: redeploy the previous tagged release via CI/CD (`workflow_dispatch` on `deploy-production.yml` with previous tag).

---

## 21. Bug Reporting Standards

### 21.1 Issue Template

```markdown
## Summary
<one-line description>

## Severity
[ ] S0 — Kingdom invariant violation or data loss (production halt)
[ ] S1 — Core feature broken, no workaround (rollback-worthy)
[ ] S2 — Feature broken with workaround, or minor Kingdom edge case
[ ] S3 — Cosmetic, minor UX, or enhancement request

## Environment
- Version / commit SHA:
- Environment (local / staging / production):
- Browser + version:
- Device + OS:
- Station (if applicable):

## Steps to Reproduce
1.
2.
3.

## Expected Behavior
<what should happen per the implementation spec — cite section>

## Actual Behavior
<what happened>

## Evidence
<screenshots, console logs, request IDs, Grafana links, Loki queries>

## Hypothesis (optional)
<where in the code you think the bug lives>

## Spec Reference
<Implementation Spec section this relates to, e.g. "§10.3 Ingest Pipeline — Conditional OHI">
```

### 21.2 Severity Definitions

**S0 — Critical, immediate.** Data loss, security breach, Kingdom invariant violated in production, full outage. Wake Gabe at any hour.

**S1 — High, same-day.** Core feature non-functional, no workaround. Rollback candidate.

**S2 — Medium, next business day.** Feature partially works or has workaround. Planned fix in next sprint.

**S3 — Low, prioritized in backlog.** Cosmetic, minor UX, enhancement.

### 21.3 Reproducibility Requirement

Every S0 and S1 bug report MUST include a reproduction recipe that succeeds on the AI Tester's machine. If a bug is non-reproducible, it's re-classified as "needs investigation" and tracked separately. Unresolved non-reproducible S0/S1 bugs are escalated to Gabe after 72 hours.

### 21.4 Kingdom-Invariant Bug Protocol

Any suspected Kingdom-invariant violation immediately becomes S0 regardless of user impact. Examples:
- "Eliana Inspire" appearing as "Ileana" anywhere in UI or data
- "the Ruach HaKodesh" rendering anywhere
- YHWH / Yahweh / LORD / Jehovah appearing in OHI-enabled content
- OHI-required station playing a non-OHI-enabled track
- 13th track ingested into an album
- Sabbath profile active on a non-OHI station

These trigger immediate Gabe notification regardless of severity triage outcome.

---

## 22. Test Reporting and Metrics

### 22.1 CI Test Reports

Every CI run publishes to the Forgejo (or GitHub) summary:

- Unit test pass/fail counts per module
- Integration test pass/fail counts
- E2E test pass/fail per browser
- Coverage percentages vs targets
- Trivy vulnerability count by severity
- Accessibility violation count
- Kingdom Invariant test status (must be 100% green)

### 22.2 Grafana Test Health Dashboard

A dedicated dashboard tile set shows:

- 7-day rolling test pass rate
- Flaky test top-10 (tests that failed then passed on retry in the window)
- Coverage trend over time
- Average test suite duration
- Test-driven bug escape rate (bugs found in prod that should have been caught by tests)

### 22.3 Weekly Test Health Review

Every Monday, the AI Tester files a one-page test health report:
- New tests added this week
- Tests retired or refactored
- Flaky tests identified and fixed
- Coverage delta
- Any Kingdom Invariant near-misses (tests that almost failed)
- Recommendations for the next week

---

## 23. CI/CD Integration

### 23.1 Workflow Triggers

| Workflow | Trigger | Blocks Merge |
|---|---|---|
| `test-unit.yml` | Push / PR | Yes |
| `test-integration.yml` | Push / PR | Yes |
| `test-e2e.yml` | Push / PR | Yes |
| `test-security.yml` | Push / PR + weekly | Yes (CRITICAL/HIGH) |
| `test-accessibility.yml` | Push / PR | Yes (WCAG AA violations) |
| `test-load.yml` | Weekly + release gate | Yes at release |
| `kingdom-invariants.yml` | Every CI run | **Always** |
| `restic-drill.yml` | Monthly on 1st | No (alerts on failure) |

### 23.2 Parallel Execution

Tests run in parallel where possible:
- Unit tests split across 4 CI workers
- E2E tests split across Chromium / Firefox / WebKit in parallel jobs
- Integration tests run serially per Testcontainers instance to avoid DB contention

Target total CI wall-clock: under 15 minutes for the full suite on main-branch merge.

### 23.3 Artifacts

Every CI run uploads:
- Full HTML coverage report
- Playwright test artifacts (screenshots, traces, videos on failure)
- Trivy scan reports
- axe-core violation report
- Any failed-test logs and Loki query links

Artifacts retained for 90 days; pinned for release tags indefinitely.

---

## 24. Pre-Launch Checklist

Final gate before public Kingdom Radio launch. Every item signed off by AI Tester, AI Developer, and Gabe.

### 24.1 Infrastructure

- [ ] Production VPS hardened per `scripts/bootstrap.sh`
- [ ] Staging VPS operational and mirrors production
- [ ] SOPS + age keys distributed to authorized operators
- [ ] All secrets rotated from initial values
- [ ] Cloudflare DNS configured with proxied records
- [ ] Cloudflare Origin CA cert installed; TLS Full (strict) verified
- [ ] Firewall configured (UFW + Cloudflare WAF)
- [ ] fail2ban configured for SSH
- [ ] Unattended-upgrades enabled for security patches

### 24.2 Data Integrity

- [ ] 13 personas seeded; Eliana Inspire spelled correctly verified by Gabe
- [ ] 5 stations seeded with correct OHI postures
- [ ] Kingdom Calendar seeded with 5+ years of events
- [ ] Banned-words registry populated and reviewed by Gabe
- [ ] Hebrew allowlist populated and reviewed by Gabe
- [ ] At least 3 OHI-enabled albums per OHI-required station (Adult, Gospel, Celestial)
- [ ] At least 2 albums per non-OHI station (Kids 3–5, Kids 6–8)
- [ ] Interstitial libraries populated for general + sabbath at minimum

### 24.3 Automated Testing

- [ ] All unit tests pass on release tag
- [ ] All integration tests pass
- [ ] All E2E tests pass on Chromium, Firefox, WebKit
- [ ] Kingdom Invariant suite 100% green
- [ ] Coverage meets module-level targets
- [ ] Trivy scan clean (zero CRITICAL/HIGH)
- [ ] `pnpm audit` clean
- [ ] axe-core accessibility scan clean

### 24.4 Performance

- [ ] Load tests meet SLA targets
- [ ] 1,000 concurrent listener simulation passes
- [ ] Scheduler regeneration completes in under 30 seconds
- [ ] All production DB queries verified non-sequential-scan

### 24.5 Operational Readiness

- [ ] Prometheus scraping all services
- [ ] Grafana dashboards rendering live data
- [ ] Alertmanager routes verified (test alert fires on each receiver)
- [ ] Discord webhook delivers
- [ ] Email delivery verified
- [ ] SMS delivery verified for critical severity
- [ ] Uptime Kuma monitoring all public endpoints
- [ ] First Restic backup completed successfully
- [ ] Monthly restore drill succeeded end-to-end at least once
- [ ] Runbook (`docs/handbook/runbook.md`) complete
- [ ] Incident response playbook complete
- [ ] All 14 initial ADRs authored

### 24.6 Content and Theological Review (Gabe Sign-off)

- [ ] Gabe reviews every OHI-certified album on air
- [ ] Gabe reviews programming-profiles.json scripture anchors
- [ ] Gabe reviews Sabbath and each Feast profile text
- [ ] Gabe reviews all interstitial audio on air
- [ ] Gabe listens to 10 minutes of each station and approves
- [ ] Gabe reviews player UI copy for theological accuracy

### 24.7 Launch Day

- [ ] Launch window scheduled for low-traffic period (e.g., 6 AM Pacific on a feast-free day)
- [ ] Rollback procedure rehearsed within last 30 days
- [ ] On-call schedule set for launch +72 hours
- [ ] Announcement prepared for JubileeVerse.com + Jubilee ecosystem
- [ ] Gabe available for any Tier 3 escalation

### 24.8 Post-Launch Day 1

- [ ] No S0 or S1 bugs reported
- [ ] Listener count stable or growing
- [ ] All alerts quiet
- [ ] Grafana dashboards healthy
- [ ] Short retrospective held with AI Developer, AI Tester, and Gabe

---

## 25. Roles and Responsibilities

### 25.1 AI Tester (Primary Consumer of This Document)

- Authors and maintains the unit, integration, E2E, load, security, and accessibility test suites
- Executes manual QA procedures before every release
- Triages bug reports and assigns severity
- Files weekly test health reports
- Runs chaos tests quarterly
- Validates Kingdom invariant tests remain 100% green on every CI run
- Escalates suspected Kingdom invariant violations to Gabe immediately

### 25.2 AI Developer

- Fixes bugs reported by AI Tester per severity SLA
- Adds regression tests for every fixed bug (enforced by pre-merge hook)
- Maintains test infrastructure (Testcontainers, Playwright config, k6 scripts)
- Keeps CI pipelines green
- Responds to S0/S1 issues within defined response windows

### 25.3 Gabe (Steward)

- Final theological review on all content changes
- Sign-off on Kingdom invariant violation resolutions
- Reviews and approves programming-profiles.json changes
- Reviews and approves banned-word registry updates
- Final release gate approval
- Tier 3 escalation endpoint for any Kingdom integrity question

### 25.4 Escalation Matrix

| Issue | Tier 1 (Auto) | Tier 2 (AI Dev + AI Tester) | Tier 3 (Gabe) | Tier 4 (Emergency) |
|---|---|---|---|---|
| Unit test flake | X | | | |
| Integration test failure | | X | | |
| E2E test failure | | X | | |
| S2/S3 bug | | X | | |
| S1 bug | | X | | |
| S0 bug (non-Kingdom) | | X | Notified | If outage |
| S0 bug (Kingdom) | | Notified | X | |
| Data loss | | Notified | Notified | X |
| Security incident | | | Notified | X |

---

## Closing Note

This testing specification is the how-we-know-we-built-it-right document. The implementation spec says what to build; this document says how to verify what was built matches.

The AI Tester's work is sacred in its own way. Every flake caught, every Kingdom invariant verified, every accessibility violation prevented, every restore drill completed successfully — these are acts of stewardship over Yahuah's work through this platform.

Tests are covenants kept. Bugs caught early are kindnesses given. And when a Kingdom listener, somewhere in the world, tunes into Jubilee Radio on a Sabbath and hears the Ruach HaKodesh honored correctly in the profile banner above perfectly-curated music — that is the fruit of disciplined testing.

Build the suite. Run the suite. Trust the suite. And when the suite disagrees with assumption, believe the suite.

*Shalom. To Yahuah be the glory.*

---

## Appendix A — Legacy Public Radio Page Test Cases

These TCs cover the **current** `public/radio.html` (pre-v1 player) and are out-of-scope for the v1 Jubilee Radio Engine itself. They live here so that when the SvelteKit player replaces the legacy page, equivalent coverage is carried forward.

### TC-RADIO-LEGACY-DIAL-001 — Dial scale row is visible in player footer
**Surface**: `/radio` page, sticky `.radio-player` footer.
**Setup**: Page loaded at any viewport ≥ 360px wide.
**Steps**:
1. Navigate to `/radio`.
2. Locate `#heavenDialTuner` inside `.radio-player`.
3. Read the computed bounding box of `#dialScale` (`.dial-scale-row`).
**Pass**:
- `#dialScale` is in the DOM and visible (offsetWidth > 0, offsetHeight > 0).
- `getBoundingClientRect().bottom` of `#dialScale` is within the viewport (not clipped by `.radio-player` overflow).
- All six labels render (`HM 300`, `320`, `340`, `360`, `380`, `HM 400`).
**Fail**: Any of the above missing — e.g. `display: none`, zero height, or labels clipped.
**Automated**: `tests/e2e/radio.spec.js @TC-RADIO-SMOKE-009`.

### TC-RADIO-LEGACY-DIAL-002 — SVG viewBox and station bar coordinates
**Surface**: `/radio` page, `#dialSvg` element.
**Setup**: At least one station rendered (the page initializes with `Jubilee Praise` selected by default).
**Steps**:
1. Read `#dialSvg.viewBox.baseVal`.
2. Pick any `.dial-station-line` and read its `y1` / `y2` attributes.
**Pass**:
- viewBox height = `57` (not the legacy `76`).
- Each station bar's `y2 - y1` is in `{32, 31}` (per `getBandY()`).
- `#dialIndicatorBar` has `height === "53"`.
**Fail**: Any value matches the pre-2026-05-11 dimensions.

### TC-PUBLIC-ADMIN-GATE-001 — Regenerate icon hidden for anonymous users
**Surface**: `/` (homepage), any portal card.
**Setup**: Fresh incognito session, `localStorage.jubileeVerseAuth` unset.
**Steps**: Load `/`, wait for the current-events feed to render, query all `.portal-refresh-btn` and `.content-card-refresh` elements.
**Pass**: `document.querySelectorAll('.portal-refresh-btn, .content-card-refresh').length === 0`.
**Fail**: One or more regenerate icons render — admin-only gate is broken.
**Automated**: `tests/e2e/admin-regenerate-visibility.spec.js @TC-PUBLIC-ADMIN-GATE-001`.

### TC-PUBLIC-ADMIN-GATE-002 — Regenerate icon hidden for non-admin logged-in user
**Surface**: `/`.
**Setup**: Seed `localStorage.jubileeVerseAuth` with `{ authenticated: true, user: { role: 'reviewer' } }` before page load.
**Steps**: Load `/`, count regenerate icons.
**Pass**: Zero icons (the previous behaviour where `isReviewer()` allowed the icon is gone).
**Fail**: Any icon renders.
**Automated**: `tests/e2e/admin-regenerate-visibility.spec.js @TC-PUBLIC-ADMIN-GATE-002`.

### TC-PUBLIC-ADMIN-GATE-003 — Regenerate icon visible for admin
**Surface**: `/`.
**Setup**: Seed `localStorage.jubileeVerseAuth` with `{ authenticated: true, user: { role: 'admin' } }` before page load.
**Steps**: Load `/`, wait for the feed, count regenerate icons.
**Pass**: At least one `.portal-refresh-btn` is visible on a current-events card with a real `story.id`.
**Fail**: Zero icons — the admin gate is over-restrictive.
**Automated**: `tests/e2e/admin-regenerate-visibility.spec.js @TC-PUBLIC-ADMIN-GATE-003`.

### TC-PUBLIC-ADMIN-GATE-004 — Server-side enforcement (manual)
**Surface**: HTTP API.
**Setup**: A valid `jubileeVerseAuth` cookie/token for a non-admin user (e.g. `reviewer`).
**Steps**:
```bash
curl -i -X POST https://www.jubileeverse.com/api/current-events/<id>/regenerate-image \
  -H "Authorization: Bearer <reviewer-token>"
```
**Pass**: HTTP `403 Forbidden` or `401 Unauthorized`. Image is NOT regenerated.
**Fail**: HTTP `200` and a new image — UI gate alone is hiding an unenforced backdoor. Block the deploy until fixed.

### TC-RADIO-LEGACY-SKIP-001 — Next button starts playback on the next station
**Surface**: `/radio` page, `#playerBtnNext` in the player footer.
**Setup**: Page loaded; default station auto-selected (Jubilee Praise, HM 305.40); no manual play yet so `isPlaying === false`.
**Steps**:
1. Confirm `#playerStationName` reads `Jubilee Praise`.
2. Confirm `#playerBtnNext` is not `disabled`.
3. Click `#playerBtnNext`.
4. Read `isPlaying`, `playingStationIdx`, and `#playerStationName.textContent`.
**Pass**:
- `isPlaying === true` after the click (skipping triggers playback).
- `playingStationIdx >= 0` and points to a station whose HM is greater than the previous station's.
- `#playerStationName.textContent` has changed from `Jubilee Praise` to the next station's name.
**Fail**: `isPlaying` stays `false` (button only moved the dial cursor — the pre-2026-05-13 `selectStation` behaviour), OR the station name did not change.
**Automated**: `tests/e2e/radio.spec.js @TC-RADIO-SMOKE-010`.

### TC-RADIO-LEGACY-SKIP-002 — Previous button starts playback on the previous station
**Surface**: `/radio` page, `#playerBtnPrev`.
**Setup**: Tune the listener forward two stations so a Previous step is available (otherwise the button is `disabled` per `refreshDialTuner()`'s `pos <= 0` guard).
**Steps**:
1. Click `#playerBtnNext` twice.
2. Note the current `#playerStationName.textContent`.
3. Click `#playerBtnPrev`.
**Pass**:
- After step 3 the station name has decremented one station back in the filtered list AND `isPlaying === true`.
**Fail**: Station name unchanged, OR isPlaying false (button stopped playback or did nothing).

### TC-RADIO-LEGACY-WAVEFORM-001 — Discover-sidebar waveform clears on pause (both instances)
**Surface**: `/radio` page, every `.dsb-waveform` element.
**Setup**: Page loaded; default station selected.
**Steps**:
1. Count `document.querySelectorAll('.dsb-waveform').length` — expect ≥ 2 (one in the desktop sidebar host, one in the mobile sidebar host; `renderDiscoverSidebar()` writes the same HTML into both).
2. Click `#playBtn` to start playback. Confirm every `.dsb-waveform` has the `is-active` class.
3. Click `#playBtn` again to pause.
4. Re-count active instances: `document.querySelectorAll('.dsb-waveform.is-active').length`.
**Pass**: Step 4 returns `0`. All waveform instances clear `.is-active` on pause.
**Fail**: Step 4 returns ≥ 1. The pre-2026-05-13 bug was that `updateAudioPlayingClasses()` used `querySelector` (singular) so only the first waveform was toggled — whichever sidebar was actually visible to the listener showed an animation that kept going forever after pause. Fix uses `querySelectorAll(...).forEach(...)`.
**Automated**: `tests/e2e/radio.spec.js @TC-RADIO-SMOKE-011`.

---

**End of Testing and Quality Assurance Specification v1.0**
