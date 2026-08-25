# ADR 002 — Database

**Status:** Accepted
**Date:** 2026-02-27
**Deciders:** Jubilee Engineering

---

## Context

The system needs a primary relational store capable of supporting multi-tenant content,
hierarchical taxonomies, JSONB extension fields, and row-level security for site isolation.
The existing stack already uses PostgreSQL (shared multi-tenant DB) and SQLite (local state).

## Decision

**PostgreSQL 15+ as the primary relational store** for all PubOS canonical content objects.

- Use **JSONB columns** (`extensions`) on every object table for type-specific fields that
  don't warrant dedicated columns.
- All PubOS tables use the **`jv_` prefix** to distinguish them from the shared multi-tenant
  tables (`categories`, `current_events`, `articles`, etc.) used by other Jubilee network sites.
- **SQLite** (`data/jubileeverse.db`) continues to serve local auth state, radio favorites,
  newsletter subscribers, and pulse tasks.
- **Row-level security (RLS)** will be implemented in Phase 2 when multi-user write access
  to PubOS tables is introduced.

## Rationale

- **Existing infrastructure:** PostgreSQL pool is already connected and proven in production.
  No new service is required.
- **JSONB:** Avoids premature column normalization for sparse extension fields (e.g.,
  `focal_point` on images, `chapters` on videos). Schema can evolve without migrations.
- **`jv_` prefix:** The shared DB is owned by Jubilee Solutions and accessed by 40+ sites.
  Namespacing prevents accidental joins against other sites' data.
- **SQLite for local state:** Low-latency synchronous reads for auth checks. Better-sqlite3
  provides a zero-async API that simplifies middleware code.

## Consequences

**Positive:**
- Single PostgreSQL connection pool; no additional DB service required.
- JSONB enables rapid iteration on object schemas without ALTER TABLE in every sprint.
- `jv_` prefix makes it immediately obvious which tables are PubOS-owned vs shared.

**Negative:**
- JSONB fields are not validated at the DB layer — application-layer validation required.
- SQLite and PostgreSQL diverge on data types; developers must be mindful of which DB a
  query targets.
- RLS implementation (Phase 2) will require a DB superuser connection for initial policy setup.

## Table Naming Convention

| Prefix | Owner | Examples |
|--------|-------|---------|
| *(none)* | Shared Jubilee network | `categories`, `articles`, `current_events` |
| `jv_` | JubileeVerse PubOS | `jv_articles`, `jv_taxonomy`, `jv_personas` |

## Migration Strategy

All DDL lives inside `runMigrations()` in `server.js` as `CREATE TABLE IF NOT EXISTS`
statements. Each statement is idempotent. Migrations run automatically on server startup.
