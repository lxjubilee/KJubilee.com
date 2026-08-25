# ADR 003 — Search Engine

**Status:** Accepted
**Date:** 2026-02-27
**Deciders:** Jubilee Engineering

---

## Context

PubOS requires full-text search filtered by taxonomy, persona, site, language, and
publication status (MVP success criterion #7). Options evaluated:

1. **Elasticsearch 8.x** — Industry standard; requires separate service (~4 GB RAM)
2. **OpenSearch** — AWS-managed Elasticsearch fork; similar operational overhead
3. **pgvector + tsvector** — PostgreSQL extensions; zero new infrastructure

## Decision

**pgvector extension for semantic vector search + PostgreSQL tsvector for full-text search**,
all within the existing PostgreSQL 15+ instance.

## Rationale

- **Zero new infrastructure:** No additional Docker container, hosted service, or index
  synchronization job. All queries run against the existing `jubileeverse` database.
- **pgvector maturity:** Version 0.7+ supports HNSW indexing with sub-millisecond query
  times at the content volumes JubileeVerse operates (< 100k objects at MVP).
- **tsvector sufficiency:** PostgreSQL's built-in full-text search handles keyword matching,
  stemming, ranking (ts_rank), and faceted counts via SQL aggregates. It meets all
  MVP search requirements without Elasticsearch.
- **Embedding generation:** Claude API (text-embedding-3-small or equivalent) generates
  embeddings at write time, stored in a `embedding vector(1536)` column on each object table.
  This enables semantic similarity search ("find articles about forgiveness") beyond keyword
  matching.
- **Elasticsearch deferral:** If query latency becomes a bottleneck above ~1M objects, an
  Elasticsearch migration can be evaluated at that time. The search abstraction layer
  introduced in Phase 2 will make this swap low-risk.

## Consequences

**Positive:**
- No new service to deploy, monitor, or pay for.
- Semantic + keyword search in a single SQL query.
- pgvector HNSW indexes provide O(log n) approximate nearest-neighbor performance.

**Negative:**
- PostgreSQL CPU will spike during bulk embedding generation (batch inserts).
- pgvector requires the extension to be installed: `CREATE EXTENSION IF NOT EXISTS vector`.
- Maximum practical scale lower than Elasticsearch (~10M vs ~1B documents).

## Implementation Notes (Phase 2+)

- Add `embedding vector(1536)` column to `jv_articles`, `jv_prayers`, `jv_music`, etc.
- Add `search_vector tsvector` column + GIN index for full-text.
- Create `search_indexer` background job that computes embeddings via Claude API on insert/update.
- Expose `/api/search?q=...&type=...&taxonomy=...&site=...&status=...` endpoint.
