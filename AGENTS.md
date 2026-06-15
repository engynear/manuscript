# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

Manuscript Forge turns Markdown into a print-ready PDF styled as an ancient fantasy manuscript (parchment, drop caps, ornaments, AI illustrations, A4 layout). AI plans the manuscript structure and generates illustrations; **the body prose is never rewritten by the model** — section bodies are restored from the source Markdown after the AI plan returns.

## Repository layout — two stacks mid-migration

The repo is transitioning from a single Next.js app to a **SvelteKit frontend + Go backend** split. Both coexist on the `forge` branch:

- **`frontend/`** — SvelteKit 5 + Vite app (`adapter-node`). The current UI: library, shelves, reader, cover, sharing, settings. Talks to the Go API via `frontend/src/lib/api.ts` (JWT in `localStorage`, NDJSON streaming helper). Client-side manuscript preview is built in `frontend/src/lib/manuscript.ts` from `static/assets/manuscript/manifest.json`; PDF pagination uses `pagedjs`.
- **`backend/`** — Go (chi router, pgx/Postgres). Auth, books, shelves, shares persistence + serving generated media. Routes are all wired in `backend/pkg/api/server.go`. Layered as `api/` (handlers) → `store/` (Postgres queries) → `db/` (pool + migrations in `db/migrations/`). Config from env in `pkg/config/config.go`.
- **`app/` + `lib/` (root, Next.js 16 / React 19)** — the original/legacy generation pipeline. `app/api/generate/route.ts` streams NDJSON progress and runs the full plan → illustrations → HTML → PDF pipeline in `lib/`. The Go backend has OpenAI config too, but the heavy generation logic still lives here in TypeScript.

When changing behavior, know which stack you're in. UI work and persistence → `frontend/` + `backend/`. The Markdown→PDF rendering pipeline → root `lib/`.

## The generation pipeline (root `lib/`)

`app/api/generate/route.ts` orchestrates, streaming progress events. Key stages (README "Где менять поведение"):

- `lib/openai.ts` — OpenAI client + model selection (also `.env`).
- `lib/generatePlan.ts` — AI manuscript plan via OpenAI Structured Outputs (`lib/manuscriptSchema.ts`). `contentHash` keys the cache.
- `lib/postProcessPlan.ts` — restores section bodies from source Markdown (the "don't rewrite prose" guarantee).
- `lib/ensureIllustrations.ts` — tops up illustration count when the AI plan is short.
- `lib/generateImages.ts` — OpenAI Images + illustration prompt style.
- `lib/imageOverrides.ts` — user edits to prompt/type/caption.
- `lib/renderManuscriptHtml.ts` + `styles/manuscript.css` — deterministic HTML/CSS layout.
- `lib/renderPdf.ts` — PDF export via Playwright/Chromium.

Storage: `.cache/plans`, `.cache/pdf-assets`, `public/generated`, `public/assets/manuscript` (in Docker → `manuscript_cache` / `manuscript_generated` volumes).

## Commands

Root (Next.js pipeline app):

```bash
npm install
npm run dev          # next dev, http://localhost:3000
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run build
```

Frontend (SvelteKit):

```bash
cd frontend
npm run dev          # vite dev, :5173
npm run check        # svelte-kit sync && svelte-check
npm run lint
npm run build && npm run start   # node build
```

Backend (Go):

```bash
cd backend
go run ./cmd/server          # migrations auto-apply on boot
go test ./...                # e.g. pkg/auth/auth_test.go
go test ./pkg/auth -run TestX
```

Full stack (Postgres + backend + web):

```bash
docker compose up -d --build   # postgres:5432, backend:8080, web:3000
```

## Environment

Root pipeline needs `OPENAI_API_KEY` (in `.env.local`). Optional: `OPENAI_PLAN_MODEL` (gpt-4.1), `OPENAI_IMAGE_MODEL` (gpt-image-1), `OPENAI_IMAGE_QUALITY` (low|medium|high), `MANUSCRIPT_IMAGE_CACHE_VERSION`.

Backend needs `DATABASE_URL`, `JWT_SECRET`, plus the same OpenAI vars, `MEDIA_DIR`, `MEDIA_BASE_URL`, `CORS_ORIGINS`. Frontend uses `PUBLIC_API_BASE` (base URL of the Go API).

## Design system (do not swap fonts/colors for generic alternatives)

See `.impeccable.md` and `PRODUCT.md`. Tokens live in `frontend/src/app.css`.

- **Type**: Spectral (chrome/body), Cinzel (display), EB Garamond (manuscript body), IM Fell English (scribe). Manuscript faces (`Forge *`) appear only inside previews, covers, and the reader — never in app chrome.
- **Color**: parchment/cream surfaces, deep ink/sepia text, **oxblood** primary accent, **gilt** for selection/highlight, muted wood/leather for shelving. Light theme by default; reading/immersive surfaces go dark leather.
- **Principles**: show the manuscript not just controls; keep app chrome separate from exported/printed PDF styling; treat long documents as the default; motion is supportive and respects `prefers-reduced-motion`.

i18n is EN/RU — many models/fields carry a `*Ru` counterpart (e.g. shelf `name`/`nameRu`). Keep both in sync.
