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
npm run eval         # real model-graded prompt evals (needs claude CLI + token)
npm run cleanup      # delete Storage mp4s past the 30-day retention window
npm run preview      # preview the production build
```

Run a single test file: `npx vitest run src/path/to/file.test.tsx`

**Prompt evals vs. unit tests.** `*.test.ts` files are deterministic and mock the `claude` CLI; they run in `npm run test` and CI. `scripts/evals/*.eval.ts` are **real** model-graded evals that spawn the live `claude` CLI: the producer eval grades real output with an LLM judge (`scripts/lib/factGrader.ts`), and the evaluator eval checks the evaluator accepts good specs and rejects bad ones. They run via `npm run eval` (config `vitest.eval.config.ts`, which retries to absorb model variance) and are excluded from `npm run test` because the default `**/*.test.ts` glob doesn't match `*.eval.ts`. The `evals.yml` workflow runs them on any change to the prompt files (`generationSpec.ts`, `specEvaluator.ts`, `factGrader.ts`) or the eval suite, gating prompt changes on `CLAUDE_CODE_OAUTH_TOKEN`.

**All code changes must be covered by tests.** New modules get a co-located `*.test.ts(x)`; changed behaviour gets updated tests. Tests live next to the source file they cover (`scripts/lib/foo.test.ts`, `src/features/bar/api.test.ts`).

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

- `scripts/generate.ts` — orchestrates image fetch (Pexels), text compositing (sharp), FFmpeg render, Storage upload, DB insert. Text generation runs a **producer→evaluator feedback loop** (`scripts/lib/producer.ts`): Claude **Sonnet 4.6** (at `medium` effort) produces a spec, a second call to Claude **Sonnet 4.6** (also at `medium` effort, `scripts/lib/specEvaluator.ts`) cross-checks it on factual accuracy/format/engagement/novelty, and the critique is fed back for retries before the video reaches `pending_review` (or `failed` if never approved). To avoid repeats, the last 10 created facts (`recentFacts` in `supabaseAdmin.ts`) are passed to both roles via `avoidFacts`: the producer is told to write a different fact up front, and the evaluator rejects any spec that duplicates or paraphrases one of them. Model per role is set via the CLI `--model` flag (`GENERATION_MODEL` / `EVALUATION_MODEL`); each role's reasoning depth is set via `--effort` (`GENERATION_EFFORT` / `EVALUATION_EFFORT`). Effort is Sonnet/Opus-only; the Haiku grader doesn't pass it.
- `scripts/publish.ts` — YouTube Shorts upload via `googleapis`, sets video status. Must include `#Shorts` in the title or description so YouTube classifies the upload correctly.
- `scripts/cleanup.ts` — 30-day Storage retention. Lists videos whose `created_at` is older than 30 days and still have a `video_path` (`listExpiredVideos`), deletes each mp4 from the `videos` bucket (`deleteVideoObject`), and clears `video_path` while keeping the row + `run_logs` for history. Per-row failures are logged and skipped so one bad object doesn't abort the batch.
- `scripts/lib/supabaseAdmin.ts` — service-role client. **Must never be imported by the frontend.**

### Database (Supabase)

Three tables with RLS policies keyed to a single owner via `public.is_owner()`:

- `topics` — predefined seed areas and used counts to bias Claude.
- `videos` — one row per video; status follows the state machine below.
- `run_logs` — append-only per-video step log.

**Migrations** in `supabase/migrations/` are applied automatically by `.github/workflows/migrate.yml` when commits that touch `supabase/migrations/**` land on `main`. The workflow uses two Actions secrets: `SUPABASE_ACCESS_TOKEN` (personal access token from supabase.com/dashboard/account/tokens) and `SUPABASE_DB_PASSWORD` (database password from Project Settings → Database). The workflow can also be triggered manually via `workflow_dispatch`. No manual `supabase db push` is needed after secrets are set.

**Owner configuration:** `is_owner()` compares `auth.uid()` against the single owner row in `public.app_config` (see migration `0003`). After creating the owner user, run once in the SQL editor:

```sql
insert into public.app_config (id, owner_id)
select true, id from auth.users where email = '<owner-email>'
on conflict (id) do update set owner_id = excluded.owner_id;
```

Until a row exists, `is_owner()` returns false and all rows are invisible to authenticated sessions. The service-role key (Actions only) bypasses RLS.

> Earlier migrations keyed `is_owner()` to the `app.owner_id` Postgres GUC via `alter database postgres set ...`. That fails on hosted Supabase (`42501: permission denied to set parameter` — the project role is not a superuser), so `0003` moved owner identification to `app_config`.

### `videos.status` state machine

```
generating → pending_review → approved → publishing → published
                            ↘ rejected (terminal)
* → failed (terminal)
```

Transitions: `generate.yml` inserts at `generating` and advances to `pending_review` on success. Dashboard Approve/Reject moves to `approved`/`rejected`. `publish.yml` (triggered by `repository_dispatch`) handles `approved → publishing → published`.

### GitHub Actions workflows

- `generate.yml` — `schedule:` cron + `repository_dispatch: types: [generate_video]` + `workflow_dispatch` (with an optional `topic` input). Calls Claude Code headless (`CLAUDE_CODE_OAUTH_TOKEN`), fetches a Pexels image (`PEXELS_API_KEY`), composites text with sharp, renders mp4 with FFmpeg, uploads to Supabase Storage. An optional subject (dashboard input → `client_payload.topic`, or the `workflow_dispatch` input) is passed to `generate.ts` via the `GENERATION_TOPIC` env var; when set it anchors the fact and skips the automatic trending pick.
- `publish.yml` — `repository_dispatch: types: [publish_video]`. Downloads mp4, uploads to YouTube, updates row. **Idempotent:** no-ops if `youtube_id` is already set.
- `cleanup.yml` — `schedule:` cron (daily 03:00 UTC) + `workflow_dispatch`. Runs `npm run cleanup` with `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` to enforce the 30-day Storage retention policy (deletes expired mp4s, clears `video_path`, keeps rows).
- `evals.yml` — `pull_request`/`push` filtered to the prompt files + eval suite (plus `workflow_dispatch`). Runs `npm run eval` (real model-graded prompt evals) with `CLAUDE_CODE_OAUTH_TOKEN`, so prompt changes are gated on the evals passing.

### Environment variables

Frontend (`.env.local`):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

GitHub Actions secrets: `CLAUDE_CODE_OAUTH_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `PEXELS_API_KEY`.

Vercel env: `GITHUB_DISPATCH_TOKEN` (fine-grained PAT scoped to this repo, dispatch only), `GITHUB_REPOSITORY` (`owner/repo` the dispatch route targets), plus `SUPABASE_URL`/`SUPABASE_ANON_KEY` (or the `VITE_`-prefixed equivalents) so `api/dispatch.ts` can validate the caller's session. The route fires `repository_dispatch` events `generate_video` (with an optional free-text `topic` client payload typed in the dashboard) and `publish_video` (with a `video_id` client payload).

## Key constraints

- Service-role key and YouTube secrets live **only** in GitHub Actions secrets — never in Vercel or the browser.
- YouTube Shorts uploads via an unverified API project land as **private**; the owner manually publishes in YouTube Studio (or applies for a compliance audit). Default `privacyStatus` to `private`.
- The upload must include `#Shorts` in the title or description — YouTube uses this to classify vertical videos as Shorts.
- Background image from Pexels (`PEXELS_API_KEY` GitHub Actions secret, `https://api.pexels.com/v1/search`). `fetchBestBackground` (`scripts/lib/backgroundImage.ts`) fetches 5 distinct candidates (one `per_page=30` search, first 5 distinct-by-`id` photos, downloaded in parallel) and an LLM judge (`scripts/lib/imageEvaluator.ts`, Claude **Sonnet 4.6** at `medium` effort) picks the best match against the spec's `image_prompt`/`topic`/`fact_text`. The judge is **vision-based**: it writes each candidate to a temp thumbnail and reads the actual pixels via the CLI's `Read` tool (`--allowedTools Read`), using each photo's `alt`/`avg_color` only as a hint — so it can reject shots where the subject is tiny/distant/cluttered, not just trust alt text. Always implement a gradient/solid fallback so a missing key or failed fetch doesn't block the pipeline; the judge defaults to the first candidate if its call fails (temp files are always cleaned up).
- Text is composited onto the image with `sharp` (SVG overlay), not ffmpeg `drawtext`, to avoid font-path and escaping issues.
- Claude Pro OAuth token expires ~1 year from issuance — note the rotation date.
