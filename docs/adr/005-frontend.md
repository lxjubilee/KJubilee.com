# ADR 005 — Frontend Framework (Back-Office Cockpit)

**Status:** Accepted
**Date:** 2026-02-27
**Deciders:** Jubilee Engineering

---

## Context

PubOS requires a back-office cockpit for editors, reviewers, publishers, and admins.
The existing admin panel (`public/admin/dashboard.html`) is ~4,700 lines of vanilla
JavaScript — functional but not scalable for the full PubOS feature set (multi-site
management, taxonomy browsing, AI generation UI, revision history, role management).

Two approaches were considered:
1. **Progressively enhance** `dashboard.html` with TypeScript component islands.
2. **New React SPA** in a dedicated `cockpit/` directory.

## Decision

**React 18 + TypeScript + Vite + Shadcn/UI**, scaffolded in `cockpit/` as a standalone
SPA that is built separately from the Express server.

## Rationale

- **TypeScript type safety:** The 13 object types and 6 role permission matrix are complex
  enough that runtime type errors in vanilla JS would be a constant maintenance burden.
  TypeScript interfaces defined in `cockpit/src/types/` serve as the single source of truth.
- **React 18 ecosystem:** React Router, TanStack Query, and Shadcn/UI provide a mature
  component library without lock-in.
- **Shadcn/UI:** Copies components into the project (no runtime dependency); uses
  Tailwind CSS; fully accessible via Radix UI primitives. Works well with Vite.
- **Parallel operation:** The existing `dashboard.html` remains fully functional during the
  cockpit rollout. No forced migration deadline for existing reviewers.
- **Vite:** Sub-second HMR; TypeScript + React plugin; static build output to `cockpit/dist/`
  which Express can serve from `/cockpit/` in production.

## Consequences

**Positive:**
- Full TypeScript inference across all 13 object types and API responses.
- Modern DX (HMR, component storybook) for cockpit development.
- Shadcn/UI components are owned (not imported at runtime), so UI remains stable.

**Negative:**
- Two separate JavaScript ecosystems (vanilla JS portal + React cockpit) require separate
  `node_modules` and build steps.
- Cockpit requires `npm run build` before production deployment; CI must build it.

## Directory Structure

```
cockpit/
├── package.json          React 18, TypeScript, Vite, React Router, Shadcn/UI
├── vite.config.ts        Builds to cockpit/dist/; proxies /api/* to localhost:3107
├── tsconfig.json
├── tailwind.config.ts
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx            Router setup
    ├── types/
    │   ├── objects.ts     TypeScript interfaces for all 13 PubOS object types
    │   └── roles.ts       Role enum + PermissionMatrix type
    ├── lib/
    │   └── auth.ts        Supabase Auth client (stub in Phase 1)
    └── pages/
        ├── Dashboard.tsx
        ├── Login.tsx
        └── NotFound.tsx
```

## Production Serving

Express in `server.js` will serve `cockpit/dist/` as a static directory at `/cockpit/`.
In development, run `vite` from the `cockpit/` directory on port 5173; API calls proxy
to `:3107`.
