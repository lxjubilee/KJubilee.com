# ADR 004 — Object Storage

**Status:** Accepted
**Date:** 2026-02-27
**Deciders:** Jubilee Engineering

---

## Context

PubOS manages binary assets: hero images, audio files (radio/podcast), video, and
documents. These must be stored durably, served via CDN, and referenced from the
`jv_assets` table. Current state: images are stored on the local filesystem at
`public/images/` and served directly by Express/IIS.

## Decision

**Phase 1–2: Local filesystem** at `public/images/` for images; no change to current behavior.
**Phase 3+: AWS S3** (or S3-compatible MinIO for local development) for all binary assets.

## Rationale

- **Phase 1 scope:** Phase 1 is foundational (schemas, ADRs, CI). Migrating binary assets
  to S3 before the canonical `jv_assets` table is wired into the upload pipeline would
  create orphaned files.
- **S3 inevitability:** Multi-site content reuse (MVP criterion #4) requires assets to be
  accessible from any origin without server-local paths. S3 + CloudFront CDN is the correct
  long-term architecture.
- **MinIO for local dev:** Provides an S3-compatible API on localhost so developers can test
  the full upload/download flow without AWS credentials.

## Migration Path

1. **Phase 3:** Add `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` to `.env`.
2. Add `@aws-sdk/client-s3` to dependencies.
3. Create `lib/storage.js` with `uploadAsset(buffer, key, mimeType)` → returns `cdn_url`.
4. Update image generation pipeline to call `uploadAsset()` instead of writing to `public/images/`.
5. Run backfill script to migrate existing `public/images/` to S3 and update DB paths.

## Current Constraints

- All new `jv_assets` rows with local paths use the convention `/images/{site}/{slug}/{id}.jpg`.
- `storage_url` in `jv_assets` should store full absolute URL (e.g., `https://cdn.jubileeverse.com/...`).
  During Phase 1–2, this will be a relative path starting with `/images/`.
- Do not hard-code `/public/` in stored paths; Express strips this prefix at serve time.
