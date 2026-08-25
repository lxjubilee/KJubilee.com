# Radio Cross-Reference

The Radio page (`/radio.html`) has its own dedicated, deep QA suite that
**lives in a separate workspace**. This document tells you where it is
and how the two suites relate.

---

## Where the Radio QA suite lives

```
C:\Websites\JubileeVerse.com-Radio\radio\qa\
├── README.md                          # index + workflow
├── 01-test-plan.md                    # radio-specific scope, strategy
├── 02-feature-inventory.md            # 20 radio modules catalogued
├── 03-test-cases.csv                  # 150 cases, radio-only
├── 04-test-execution-guide.md         # radio setup + execution
├── 05-bug-report-template.md          # bug skeleton (radio-specific examples)
├── 06-regression-checklist.md         # 15-check radio smoke
└── cycles/
    └── 2026-05-04-prod/               # last executed cycle
        ├── test-execution-results.csv # 150 cases with results filled in
        ├── qa-execution-report.md     # cycle summary
        ├── blocked-test-cases.csv     # subset that needs browser
        ├── blocked-test-cases.md      # same as MD with module grouping
        └── p0-blocker-checklist.md    # 18 P0 items for human tester
```

The Radio repo (`JubileeVerse.com-Radio`) is the source workspace that
**deploys** the radio page into the legacy public folder
(`/var/www/JubileeVerse.com/public/radio.html` on prod). The two
codebases are intentionally separate:

- `JubileeVerse.com` — main site server + all non-radio surfaces.
- `JubileeVerse.com-Radio` — radio-specific source, docs, deploy automation, QA.

---

## How this consolidated QA relates to the Radio QA

| Concern | This consolidated suite | Radio QA suite |
|---|---|---|
| **Scope** | All visitor pages on jubileeverse.com (20+ pages, public APIs, auth) | Radio page only (`/radio.html`) — but in depth |
| **Number of cases** | 260 | 150 |
| **Radio coverage in this suite** | Smoke-level only (8 cases, prefixed `TC-RADIO-SMOKE-*`) | Full coverage (150 cases across 25 radio modules) |
| **Use case** | Site-wide regression / release candidate testing | Radio-feature-specific testing, cycles after radio deploys |
| **Owned by** | JubileeVerse engineering / QA team | Radio engineering team |

The 8 radio smoke cases in this suite (`TC-RADIO-SMOKE-001` through
`TC-RADIO-SMOKE-008`) confirm:

1. The page loads.
2. The default station (Jubilee Praise, HM 305.40) is selected.
3. Console is clean of regression bugs.
4. Audio plays from the primary stream.
5. Locked dimensions render correctly.
6. Countries map zoom controls present.
7. All 5 Icecast streams reachable.
8. The deep coverage is documented and findable.

For anything beyond those eight, **use the Radio QA suite**.

---

## When to use which suite

### Use *this* consolidated suite when:

- Running a full-site QA cycle before a release.
- Smoke-testing the homepage / auth / scanner / search flows after a deploy.
- Validating cross-site concerns: CSP / HSTS / CSRF / rate-limiting / responsive.
- A non-radio page has a bug.

### Use the *Radio* QA suite when:

- Deploying changes to `radio.html` (the dedicated `radio/deploy/` scripts ship from `JubileeVerse.com-Radio`).
- A radio-specific feature has a bug.
- Testing dimension chips / Heaven's Dial / countries map / player footer / favorites/follows on the radio page.
- Regression-testing radio-specific bug fixes.

---

## Combined coverage workflow (full release candidate)

For a comprehensive pre-release pass:

1. **Radio smoke first** — run `JubileeVerse.com-Radio/radio/qa/06-regression-checklist.md` (15 checks, ~10 min). Catches radio-specific issues fast.
2. **Site smoke next** — run this suite's `06-regression-checklist.md` (20 checks, ~15 min). Covers the rest of jubileeverse.com.
3. **Full radio regression** — execute Radio QA's `03-test-cases.csv` filtered to P0+P1 (~80 cases, ~3 hours).
4. **Full site regression** — execute this suite's `03-test-cases.csv` filtered to P0+P1 (~160 cases, ~4 hours).
5. **Cross-browser pass** — run both regression checklists in Firefox, Safari, Edge.
6. **Real-device mobile pass** — run both regression checklists on iPhone + Android.

Total for an RC: ~2 days for one tester, parallelisable across a team.

---

## Linking bug reports across both suites

If a bug affects both suites (e.g. a CSS variable used by both the
homepage and `/radio`):

- File **one** bug under the team that owns the code change.
- Reference it from the *other* suite's regression test case if a
  permanent regression case is added to that suite too.

Cross-reference IDs in the bug Markdown's "Related" section.

---

## Why two QA suites instead of one big one?

- **Different audiences.** Radio is a feature owned by a smaller team; the rest of jubileeverse.com involves more contributors.
- **Different cadences.** Radio deploys via its own pipeline (`radio/deploy/deploy-prod.ps1`) more frequently than the legacy monolith deploys; QA cycles run more often there.
- **Different depths.** The radio page has 7,800 lines of inline JS in one file — it warrants its own deep test plan. The rest of jubileeverse.com is broader-but-shallower per-page.
- **Different test data.** Radio uses station registry + Icecast streams. Site uses Postgres + InspireCodex API + RSS feeds.

Keeping the suites separate respects these differences. This consolidated
suite cross-references rather than duplicates.
