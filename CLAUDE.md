# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start Vite dev server
npm run build        # tsc -b && vite build
npm run typecheck    # tsc -b --noEmit
npm run lint         # eslint
npm run format       # prettier --write .
npm run format:check # prettier --check .
npm run test         # vitest run (all tests, no watch)
npm run preview      # preview the production build
```

Run a single test file: `npx vitest run src/path/to/file.test.tsx`

Pre-commit hook runs `lint && format:check && typecheck` — all three must pass before commit.

CI pipeline (`.github/workflows/ci.yml`) runs lint → format:check → typecheck → build → test.

Before committing, run the full CI check sequence locally:

```bash
npm run lint && npm run format:check && npm run typecheck && npm run build && npm run test
```

## Architecture

`agentic-media` is an automated faceless-YouTube Shorts content pipeline. The three main systems are:

```
GitHub Actions (generate.yml, publish.yml)   ←→   Supabase (Postgres + Storage)   ←→   Vercel (React dashboard)
```

**Why this split:** Vercel Hobby functions are too small for FFmpeg and the heavy pipeline secrets. All rendering and YouTube publishing run in GitHub Actions; Vercel hosts only the dashboard with the anon key.

### Frontend (`src/`)

Stack: React 18, TypeScript, Vite 6, Tailwind v4 (`@tailwindcss/vite`), TanStack Query v5, react-router v7.

- **No `useEffect`+fetch** — use TanStack Query for all data fetching.
- Code is organized as `src/features/<name>/` — each feature has `api.ts` (raw Supabase calls), `use*.ts` (TanStack hooks), and page/component files.
- Shared Supabase browser client lives in `src/lib/supabase.ts` (anon key, subject to RLS).
- Vercel serverless route at `api/dispatch.ts` authenticates via the owner's Supabase session and forwards `repository_dispatch` events to GitHub using a fine-grained PAT. It holds no Supabase service-role or YouTube secrets.

### Pipeline scripts (`scripts/`)

Node + TypeScript scripts run by GitHub Actions workflows:

- `scripts/generate.ts` — orchestrates image fetch (Pollinations), text compositing (sharp), FFmpeg render, Storage upload, DB insert.
- `scripts/publish.ts` — YouTube Shorts upload via `googleapis`, sets video status. Must include `#Shorts` in the title or description so YouTube classifies the upload correctly.
- `scripts/lib/supabaseAdmin.ts` — service-role client. **Must never be imported by the frontend.**

### Database (Supabase)

Three tables with RLS policies keyed to a single owner via `public.is_owner()`:

- `topics` — predefined seed areas and used counts to bias Claude.
- `videos` — one row per video; status follows the state machine below.
- `run_logs` — append-only per-video step log.

**Migrations** in `supabase/migrations/` are auto-applied via the Supabase GitHub integration when commits land on `main`. No manual `supabase db push` is needed.

**Owner configuration:** after creating the owner user, run once as a privileged role:

```sql
alter database postgres set app.owner_id = '<auth.uid>';
```

Until set, `is_owner()` returns false and all rows are invisible to authenticated sessions. The service-role key (Actions only) bypasses RLS.

### `videos.status` state machine

```
generating → pending_review → approved → publishing → published
                            ↘ rejected (terminal)
* → failed (terminal)
```

Transitions: `generate.yml` inserts at `generating` and advances to `pending_review` on success. Dashboard Approve/Reject moves to `approved`/`rejected`. `publish.yml` (triggered by `repository_dispatch`) handles `approved → publishing → published`.

### GitHub Actions workflows

- `generate.yml` — `schedule:` cron + `workflow_dispatch`. Calls Claude Code headless (`CLAUDE_CODE_OAUTH_TOKEN`), fetches a Pollinations image, composites text with sharp, renders mp4 with FFmpeg, uploads to Supabase Storage.
- `publish.yml` — `repository_dispatch: types: [publish_video]`. Downloads mp4, uploads to YouTube, updates row. **Idempotent:** no-ops if `youtube_id` is already set.

### Environment variables

Frontend (`.env.local`):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

GitHub Actions secrets: `CLAUDE_CODE_OAUTH_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.

Vercel env: `GITHUB_DISPATCH_TOKEN` (fine-grained PAT scoped to this repo, dispatch only).

## Key constraints

- Service-role key and YouTube secrets live **only** in GitHub Actions secrets — never in Vercel or the browser.
- YouTube Shorts uploads via an unverified API project land as **private**; the owner manually publishes in YouTube Studio (or applies for a compliance audit). Default `privacyStatus` to `private`.
- The upload must include `#Shorts` in the title or description — YouTube uses this to classify vertical videos as Shorts.
- Background image from Pollinations.ai (`https://image.pollinations.ai/prompt/…`) is keyless/free — always implement a gradient/solid fallback so a failed fetch doesn't block the pipeline.
- Text is composited onto the image with `sharp` (SVG overlay), not ffmpeg `drawtext`, to avoid font-path and escaping issues.
- Claude Pro OAuth token expires ~1 year from issuance — note the rotation date.
