# ADR 007 — Authentication

**Status:** Accepted
**Date:** 2026-02-27
**Deciders:** Jubilee Engineering

---

## Context

PubOS requires OAuth 2.0 / OpenID Connect with MFA support for all six user roles.
The existing system uses a custom JWT implementation (HMAC-SHA256, 30-day expiry, users
stored in SQLite). This is functional for the current two-role system but lacks:
- MFA support
- OAuth social login (Google, GitHub)
- Session management / forced logout
- Standardized OIDC claims for role propagation

Three providers were evaluated: Auth0, Clerk, Supabase Auth.

## Decision

**Supabase Auth** for OAuth 2.0/OIDC + MFA.

**Phase 1:** Schema preparation only — `jv_role_permissions` table seeded; ADR documented.
The existing custom JWT system remains active and unmodified.

**Phase 3:** Full migration — Supabase Auth client integrated; existing users migrated;
custom JWT system deprecated.

## Rationale

- **PostgreSQL-native:** Supabase provides managed PostgreSQL + Auth in a single service.
  This aligns with the existing Postgres-first stack (ADR 002). User records live in the
  same ecosystem as content objects.
- **Row-level security:** Supabase Auth integrates directly with PostgreSQL RLS, enabling
  `auth.uid()` in SQL policies. This is the cleanest path to per-site content isolation.
- **Free tier:** 50,000 monthly active users — sufficient for all foreseeable PubOS usage.
- **SDK:** `@supabase/supabase-js` provides React hooks (`useSession`, `useUser`) that
  integrate naturally with the cockpit SPA (ADR 005).
- **Auth0 rejection:** Auth0 is significantly more expensive at scale and adds a second
  external PostgreSQL dependency unnecessary given Supabase's combined offering.
- **Clerk rejection:** Excellent DX but proprietary lock-in and no native PostgreSQL RLS
  integration.

## Migration Path (Phase 3)

1. Create Supabase project; configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env`.
2. Export existing SQLite users; import into Supabase Auth via admin API.
3. Map existing roles (`reviewer` → `reviewer`, `user` → `editor`) to Supabase custom claims.
4. Update `requireReviewer()` middleware to validate Supabase JWTs instead of custom tokens.
5. Wire `cockpit/src/lib/auth.ts` (stub in Phase 1) to live Supabase client.
6. Remove custom JWT generation/validation code from `server.js`.

## Phase 1 Schema

The `jv_role_permissions` table (SQLite) seeds the permission matrix for all six roles:

```
admin, site_owner, publisher, reviewer, editor, persona_operator
```

This table is the authoritative reference for role enforcement middleware, even before
Supabase Auth is live. The existing `requireReviewer()` middleware will be extended to
check `jv_role_permissions` in Phase 2.

## Consequences

**Positive:**
- No auth migration risk in Phase 1; existing users are unaffected.
- Supabase RLS will enable declarative multi-tenant security (Phase 3).
- MFA (TOTP) is built-in to Supabase Auth with no extra code.

**Negative:**
- Two auth systems run in parallel (Phase 1–2): existing custom JWT + Supabase (stub).
  Developers must be careful not to mix token validation logic.
- Supabase project requires an account and free-tier project setup before Phase 3 begins.
