# ADR 001 — Backend Framework

**Status:** Accepted
**Date:** 2026-02-27
**Deciders:** Jubilee Engineering

---

## Context

JubileeVerse.com is being upgraded from a content portal to a Publishing Operating System
(PubOS). The existing backend is a single Node.js/Express monolith (`server.js`). We must
decide whether to keep this stack or switch to an alternative (Python/FastAPI, Fastify, etc.)
before Phase 1 foundation work begins.

## Decision

**Continue with Node.js 20+ / Express 4.x** as the backend framework.

All API endpoints must follow RESTful conventions. OpenAPI 3.0 documentation will be added
progressively starting in Phase 2.

## Rationale

- **Existing investment:** `server.js` contains ~7,000 lines of battle-tested logic including
  multi-provider AI orchestration, image generation pipelines, portal layout engine, and
  multi-tenant DB scoping logic. A rewrite would be high-risk with no user-visible benefit.
- **Ecosystem fit:** The AI SDK libraries critical to PubOS (`@anthropic-ai/sdk`,
  `@supabase/supabase-js`, `pg`, `better-sqlite3`) have first-class Node.js support.
- **Team proficiency:** All existing tooling (PM2, WinSW, deployment scripts) targets Node.js.
- **Fastify consideration:** Fastify would offer marginally better throughput but requires
  migrating the entire route layer. Deferred to a future architectural review.

## Consequences

**Positive:**
- Zero migration risk; existing portal continues to function without interruption.
- All existing AI integrations, image pipelines, and DB logic are preserved as-is.

**Negative:**
- `server.js` will grow in size as PubOS routes are added. A modular route-splitting
  refactor (Phase 2+) will be required before the file becomes unmanageable.
- Express 4.x lacks native async error handling (must use try/catch wrappers). Express 5
  should be evaluated at Phase 3.

## Compliance

- Node.js engine pinned to `>=20.0.0` in `package.json`.
- ESLint enforces ES2022+ syntax. No CommonJS `require()` in new files; use `import` in
  cockpit/ and new lib/ modules.
