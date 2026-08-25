# ADR 006 — AI Integration

**Status:** Accepted
**Date:** 2026-02-27
**Deciders:** Jubilee Engineering

---

## Context

PubOS requires AI-assisted content generation (MVP criterion #2) with the ability to
generate Articles, Prayers, and other object types from prompt recipes. The existing
system already integrates 10+ AI providers. A provider abstraction layer is needed to
prevent tight coupling to any single model or vendor.

## Decision

**Anthropic Claude** (`claude-sonnet-4-20250514` or later) as the **primary generation
engine**. All AI generation calls are routed through a **provider interface** abstracted
in `lib/ai-provider.js` (Phase 2), enabling future model swaps without changing
generation logic.

## Rationale

- **Model quality:** Claude Sonnet 4.x consistently produces the highest-quality long-form
  theological content in comparative tests on JubileeVerse use cases.
- **SDK maturity:** `@anthropic-ai/sdk` v0.39+ provides streaming, tool use, and structured
  output. Already in `package.json`.
- **Existing investment:** `lib/jubilee-inspire-persona.js` (800+ lines) and
  `lib/persona-router.js` are production-proven Claude-first pipelines.
- **Provider interface rationale:** Currently server.js hard-codes Anthropic, Kimi, OpenAI,
  Grok, and Deepseek calls inline. This makes A/B testing models or handling API outages
  difficult. A thin provider interface (Phase 2) will route to the correct model based on
  task type and fallback configuration.

## Provider Interface Contract (Phase 2)

```typescript
interface AIProvider {
  generate(prompt: GenerationRequest): Promise<GenerationResponse>
  embed(text: string): Promise<number[]>
  isAvailable(): Promise<boolean>
}
```

Implementations: `AnthropicProvider`, `OpenAIProvider`, `KimiProvider` (existing logic
extracted into classes).

## Model Pinning Policy

- **Primary:** `claude-sonnet-4-20250514` — long-form articles, prompt analysis
- **Fast:** `claude-haiku-4-5-20251001` — translation, summarization, metadata extraction
- **Fallback text:** Kimi (MoonshotAI) via `callKimi()` — already implemented
- **Image:** Leonardo Phoenix → InspireCortex GPU → Grok (fallback chain preserved)

## Prompt Recipes

All generation prompts must be stored in `jv_prompt_recipes` table (Phase 1 schema) or
`prompts/*.md` files (existing pattern). Hard-coded prompts in server.js will be
migrated to `jv_prompt_recipes` rows in Phase 2.

## Consequences

**Positive:**
- Claude's constitutional AI training aligns with JubileeVerse's faith-first content policy.
- Provider abstraction enables cost optimization (route simple tasks to Haiku).
- Existing `lib/` pipelines continue working; no breaking changes.

**Negative:**
- Anthropic API rate limits can bottleneck bulk generation. The existing key rotation
  pattern (PRIMARY/BACKUP keys) mitigates this.
- Provider interface adds indirection; must be designed carefully to not lose provider-
  specific features (streaming, tool use, extended context).
