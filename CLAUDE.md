# CLAUDE.md

Guidance for Claude Code when working in this repository.

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
npm run cleanup      # delete Storage mp4s past the 48-hour retention window
npm run preview      # preview the production build
```

Run a single test file: `npx vitest run src/path/to/file.test.tsx`

**Prompt evals vs. unit tests.** `*.test.ts` files are deterministic, mock the `claude` CLI, and run in `npm run test` / CI. `scripts/evals/*.eval.ts` (producer, evaluator, image selection, trending) are **real** model-graded evals that spawn the live `claude` CLI, run via `npm run eval` (`vitest.eval.config.ts`, retries to absorb model variance), and are excluded from `npm run test`. The `evals.yml` workflow runs them, gated on `CLAUDE_CODE_OAUTH_TOKEN`, whenever a prompt file (`generationSpec.ts`, `specEvaluator.ts`, `factGrader.ts`, `imageEvaluator.ts`, `trendingTopic.ts`) or the eval suite changes.

**All code changes must be covered by tests.** New modules get a co-located `*.test.ts(x)` next to the source file (`scripts/lib/foo.test.ts`, `src/features/bar/api.test.ts`).

## Architecture

`agentic-media` is an automated faceless-YouTube Shorts content pipeline:

```
GitHub Actions (generate.yml, publish.yml)   ←→   Supabase (Postgres + Storage)   ←→   Vercel (React dashboard)
```

**Why this split:** Vercel Hobby functions are too small for FFmpeg and the heavy pipeline secrets, so all rendering and YouTube publishing run in GitHub Actions; Vercel hosts only the dashboard with the anon key.

### Frontend (`src/`)

- **No `useEffect`+fetch** — use TanStack Query for data fetching.
- `src/features/<name>/` — each feature has `api.ts` (raw Supabase calls), `use*.ts` (TanStack hooks), and page/component files.
- Shared Supabase browser client: `src/lib/supabase.ts` (anon key, subject to RLS).
- `api/dispatch.ts` — Vercel serverless route; authenticates via the owner's Supabase session and forwards `repository_dispatch` events to GitHub with a fine-grained PAT. Holds no service-role or YouTube secrets.

### Pipeline scripts (`scripts/`)

Node + TypeScript, run by GitHub Actions:

- `generate.ts` — orchestrates topic pick, image fetch (Pexels), text compositing (sharp), FFmpeg render, Storage upload, DB insert. Text generation is a **producer→evaluator loop** (`lib/producer.ts`): Claude Sonnet 4.6 at `medium` effort drafts a spec, a second Sonnet 4.6 call (`lib/specEvaluator.ts`, also `medium`) checks it for factual accuracy/format/engagement/novelty, and the critique feeds back into retries until approved (or `failed`). The last 5 facts (`recentFacts` in `supabaseAdmin.ts`) are passed to both roles so neither repeats itself. Every pipeline `claude` call goes through `buildClaudeArgs` (`generationSpec.ts`), which swaps the full agent system prompt for a one-line minimal one and strips tool schemas to cut fixed token overhead; `defaultRunner` also spawns from the OS temp dir so this repo's own CLAUDE.md isn't auto-loaded. The trending-topic picker (`trendingTopic.ts`) is a cheap web-grounded lookup on Haiku 4.5 instead of Sonnet. Music is picked by the same spec (one of the tracks in `assets/music/`, resolved via `lib/musicAssets.ts`) and its attribution is stored on the row.
- `publish.ts` — uploads to YouTube Shorts via `googleapis`; idempotent (no-ops if `youtube_id` is already set). Title/description always include `#Shorts` so YouTube classifies it correctly.
- `cleanup.ts` — 48-hour Storage retention: lists videos whose mp4 has outlived the window, deletes each Storage object, and clears `video_path` (keeping the row + `run_logs`). Per-row failures are logged and skipped so one bad object doesn't abort the batch.
- `lib/supabaseAdmin.ts` — service-role client. **Must never be imported by the frontend.**

### Database (Supabase)

Three tables, RLS keyed to a single owner via `public.is_owner()`: `topics` (seed areas + used counts), `videos` (one row per video, status per the state machine below), `run_logs` (append-only per-video step log).

**Migrations** live in one file, `supabase/migrations/0001_initial_schema.sql`, applied automatically by `.github/workflows/migrate.yml` on pushes to `main` that touch `supabase/migrations/**` (or manually via `workflow_dispatch`). Needs `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` as Actions secrets.

> **Reconciling an already-provisioned project:** if the schema already exists but isn't recorded in the migrations ledger (check with `supabase migration list --linked`), `db push` will fail trying to re-apply `0001`. Run `supabase migration repair --status applied 0001 --linked` once, then re-verify with `migration list`.

**Owner configuration:** `is_owner()` checks `auth.uid()` against the single row in `public.app_config`. After creating the owner user, run once in the SQL editor:

```sql
insert into public.app_config (id, owner_id)
select true, id from auth.users where email = '<owner-email>'
on conflict (id) do update set owner_id = excluded.owner_id;
```

Until that row exists, `is_owner()` returns false and all rows are invisible to authenticated sessions. The service-role key (Actions only) bypasses RLS.

### `videos.status` state machine

```
generating → pending_review → approved → publishing → published
                            ↘ rejected (terminal)
* → failed (terminal)
```

`generate.yml` inserts at `generating`, advances to `pending_review` on success. Dashboard Approve/Reject moves to `approved`/`rejected`. `publish.yml` handles `approved → publishing → published`.

### GitHub Actions workflows

- `ci.yml` — lint, format check, typecheck, build, test on every push/PR.
- `generate.yml` — daily `schedule:` cron + `repository_dispatch: generate_video` + `workflow_dispatch` (optional `topic` input). Runs the generation pipeline; an optional subject (dashboard or manual input) is passed via `GENERATION_TOPIC` and skips the automatic trending pick.
- `publish.yml` — `repository_dispatch: publish_video` (or manual, with a `video_id` input). Uploads the approved video to YouTube.
- `cleanup.yml` — daily `schedule:` cron + `workflow_dispatch`. Enforces the 48-hour Storage retention policy.
- `evals.yml` — runs the real model-graded prompt evals when prompt files or the eval suite change; gates those changes on the evals passing.

### Environment variables

Frontend (`.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

GitHub Actions secrets: `CLAUDE_CODE_OAUTH_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `PEXELS_API_KEY`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`, `YT_PRIVACY_STATUS` (optional, `private`/`unlisted`/`public`, defaults to `private`).

Vercel env: `GITHUB_DISPATCH_TOKEN` (fine-grained PAT, dispatch-only), `GITHUB_REPOSITORY` (`owner/repo`), plus `SUPABASE_URL`/`SUPABASE_ANON_KEY` for `api/dispatch.ts` to validate the caller's session.

## Key constraints

- Service-role key and YouTube secrets live **only** in GitHub Actions secrets — never in Vercel or the browser.
- YouTube uploads via an unverified API project land as **private**; the owner publishes manually in YouTube Studio. Default `privacyStatus` to `private`.
- Uploads must include `#Shorts` in the title or description so YouTube classifies them as Shorts.
- Background image comes from Pexels: `fetchBestBackground` (`lib/backgroundImage.ts`) fetches 3 distinct candidates, and a vision-based LLM judge (`lib/imageEvaluator.ts`, Sonnet 4.6 at `low` effort) picks the best match by reading the actual thumbnail pixels, not just alt text. A gradient/solid fallback means a missing key or failed fetch never blocks the pipeline; the judge defaults to the first candidate on failure.
- Text is composited with `sharp` (SVG overlay), not ffmpeg `drawtext`, to avoid font-path/escaping issues.
- Claude Pro OAuth token expires ~1 year from issuance — note the rotation date.
