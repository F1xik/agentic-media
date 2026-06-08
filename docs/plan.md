# Plan — Automated "Fun Facts" YouTube Shorts Pipeline

## 1. Context & goal

`agentic-media` is an automated, faceless-YouTube Shorts content pipeline. End to end it:

1. **Selects a topic** from a predefined area (*fun facts / TIL*) using **Claude**.
2. **Generates a Short** — one AI-generated vertical (1080×1920, ≤60 s) background image
   with the fact text overlaid, plus a royalty-free soundtrack.
3. Surfaces the result in a **web dashboard** where the **owner reviews** it.
4. **Publishes to YouTube Shorts only after the owner approves** (human-in-the-loop gate).

### Requirements mapped
| Requirement | How it is met |
| --- | --- |
| Deployed | Dashboard on **Vercel**; pipeline on **GitHub Actions**; data on **Supabase** |
| Monitoring dashboard | React dashboard: queue, inline player, statuses, run logs |
| Runs on schedule | GitHub Actions `schedule:` cron triggers generation |
| Wait for confirmation before publish | `pending_review → approved` gate in the dashboard |
| Uses Claude | Claude Code headless in Actions (Pro OAuth token) picks topic + writes copy |
| Prefer free tier | Claude Pro (no API billing), Supabase free, Vercel free, Pollinations free, free runners |
| Short = picture + text | Pollinations image + text composited with `sharp`, rendered by FFmpeg (1080×1920, ≤60 s) |
| Popular open soundtrack | Curated CC0 / CC-BY tracks committed in `assets/music/` |
| YouTube Shorts detection | Title or description must include `#Shorts` so YouTube classifies the upload correctly |

### Confirmed decisions
- **Topic area:** Fun facts / TIL.
- **Claude access:** Claude Code runs **headless in GitHub Actions** authenticated by a
  **Pro-subscription OAuth token** (`claude setup-token` → secret
  `CLAUDE_CODE_OAUTH_TOKEN`, format `sk-ant-oat01-…`, ~1-year validity). No Anthropic
  API billing. The token works only with Claude Code, not the Messages API.
- **Heavy compute** (Claude call + image fetch + FFmpeg render): **GitHub Actions**
  ubuntu runners (ffmpeg preinstalled, free minutes, no bundle-size limit).
- **Background image:** **Pollinations.ai** (free, keyless text-to-image).
- **Soundtrack:** small curated set of genuinely royalty-free / CC0 tracks in the repo.
- **Access control:** **single owner only** — the dashboard is private to the owner via
  Supabase Auth + RLS keyed to the owner's `auth.uid()`.

## 2. Why this architecture

Vercel Hobby functions are too short/small for FFmpeg (10–60 s limit, ~50 MB bundle).
So **all rendering and publishing run in GitHub Actions**, which has ffmpeg, generous
free minutes, and can safely hold the **service-role key** as a secret. Vercel hosts
only the **React dashboard** (anon key + RLS, single owner). The two pipelines meet at
**Supabase** (Postgres state + Storage for the mp4).

```
┌─ GitHub Actions: generate.yml (cron) ──────────────────────────┐
│ 1. claude -p  → JSON {topic, fact_text, image_prompt, music}   │
│ 2. fetch Pollinations image → 3. composite text (sharp)        │
│ 4. ffmpeg: image + audio → 1080x1920 mp4                       │
│ 5. upload mp4 to Supabase Storage; insert videos row=pending   │
└────────────────────────────────────────────────────────────────┘
                 │ (service-role key)
                 ▼
        Supabase Postgres + Storage  ◄──── anon key + RLS (owner only)
                 ▲                              │
                 │ status=approved              │ realtime / query
┌─ GitHub Actions: publish.yml ──────┐   ┌─ Vercel: React dashboard ─┐
│ trigger: repository_dispatch       │   │ queue, player, Approve/   │
│ youtube videos.insert (googleapis) │◄──│ Reject, logs, Generate Now│
│ refresh token → upload mp4         │   └────────────────────────────┘
│ set status=published + url         │
└─────────────────────────────────────┘
```

**Publishing mechanism:** dashboard "Approve" sets `status=approved`, then a thin Vercel
serverless route fires a GitHub **`repository_dispatch`** that runs `publish.yml`. The
YouTube upload happens **in Actions** (not the Vercel function) so the
refresh-token/service-role secrets and the (tens-of-MB) mp4 are handled server-side
without Vercel's 60 s/size limits. The Vercel route holds only a repo-scoped GitHub
dispatch token — no YouTube/Supabase secrets.

## 3. State machine (`videos.status`)

`generating → pending_review → approved → publishing → published`, with `rejected`
(terminal) and `failed` reachable from any active state (error stored in `error`).

| Transition | Trigger |
| --- | --- |
| → generating | `generate.yml` inserts the row at start |
| generating → pending_review | render + Storage upload succeed |
| pending_review → approved | owner clicks **Approve** in dashboard |
| pending_review → rejected | owner clicks **Reject** (terminal) |
| approved → publishing → published | `publish.yml` (via repository_dispatch) |
| * → failed | any unhandled error; `error` text set |

## 4. Supabase data model (`supabase/migrations/0001_initial_schema.sql`)

Lower-case SQL, RLS keyed to `auth.uid()`, per-status indexes.

**Migration deployment:** `.github/workflows/migrate.yml` runs `supabase db push`
automatically whenever a commit that touches `supabase/migrations/**` lands on `main`.
Requires `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` Actions secrets.
`supabase/.temp/` (local CLI state) is gitignored and never committed.

- **`topics`** — predefined seed areas / recently-used topics to bias Claude and avoid
  repeats. `id, area, used_count int default 0, created_at`.
- **`videos`** — one row per generated video.
  `id uuid pk, status text default 'generating', topic, fact_text, image_prompt,
  music_track, music_attribution, video_path (Storage key), youtube_id, youtube_url,
  error, run_id (GH run id), created_at, updated_at`.
- **`run_logs`** — append-only step log for monitoring:
  `id, video_id fk, step, level, message, created_at`.

**Owner model:** single owner. A SQL helper `public.is_owner()` checks `auth.uid()`
equals the configured owner id; RLS on all tables is `for all using (public.is_owner())`.
The **service-role key (used only in Actions) bypasses RLS** to drive the pipeline.

**Storage:** private bucket `videos/` holding `{video_id}.mp4`. Dashboard plays via a
short-lived **signed URL**; Actions uploads with the service-role key.

## 5. GitHub Actions workflows (`.github/workflows/`)

### `generate.yml` (scheduled)
- `on: schedule: cron` (e.g. daily) + `repository_dispatch: types: [generate_video]` (dashboard "Generate now" via the Vercel route) + `workflow_dispatch` (manual from the Actions tab).
- Steps:
  1. checkout, setup-node, `npm ci`.
  2. **Claude** — `anthropics/claude-code-action` (or `claude -p "…" --output-format json`)
     with `CLAUDE_CODE_OAUTH_TOKEN`. Prompt asks for a single JSON object
     `{topic, fact_text (≤160 chars, verifiable), image_prompt, music: <filename>}`,
     instructed to avoid recently-used topics.
  3. **Image** — fetch Pollinations
     `https://image.pollinations.ai/prompt/{urlencoded image_prompt}?width=1080&height=1920&nologo=true`
     → `bg.png`. Fallback: gradient/solid via sharp/ffmpeg if the fetch fails.
  4. **Composite text** — `sharp` draws the wrapped fact text (SVG overlay + contrast
     band) onto `bg.png` → `frame.png` (avoids ffmpeg `drawtext` font/escaping pitfalls).
  5. **Render** — pick `assets/music/{track}.mp3`; ffmpeg:
     `ffmpeg -loop 1 -i frame.png -i music.mp3 -c:v libx264 -tune stillimage -c:a aac
      -b:a 192k -pix_fmt yuv420p -shortest -t 30 -vf scale=1080:1920 out.mp4`.
  6. **Upload + record** — Node script using `@supabase/supabase-js` +
     **service-role key**: upload `out.mp4` to Storage, set the `videos` row to
     `pending_review`, write `run_logs`.
- Secrets: `CLAUDE_CODE_OAUTH_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

### `publish.yml` (on approval)
- `on: repository_dispatch: types: [publish_video]` + `workflow_dispatch`.
- Steps: read `videos` row (id from payload) → set `publishing` → download mp4 from
  Storage → **YouTube upload** via `googleapis` `youtube.videos.insert` (scope
  `youtube.upload`, OAuth2 with stored refresh token; title/description from
  `fact_text` + topic + music attribution + **`#Shorts`** hashtag; `privacyStatus`) →
  set `published` + `youtube_id/url`, else `failed`.
  **Idempotency:** no-op if `youtube_id` already set.
  **`#Shorts` is required** in the title or description for YouTube to classify the
  upload as a Short.
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `YT_CLIENT_ID`,
  `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.

## 6. Pipeline scripts (`scripts/`, Node + TS)

Run by the workflows, separate from the Vite app:
`scripts/generate.ts` (orchestrates steps 3–6), `scripts/publish.ts` (YouTube upload),
`scripts/lib/supabaseAdmin.ts` (service-role client — **never imported by the frontend**).

## 7. Frontend dashboard (Vite app)

Stack mirrors the house conventions used in the sibling `service-tracker` repo: React 18,
TypeScript, Vite 6, Tailwind v4 (`@tailwindcss/vite`), TanStack Query (no
`useEffect`+fetch), react-router, Supabase Auth, Vitest + React Testing Library,
eslint/prettier/husky, `vercel.json` SPA rewrite. Env: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`. Single shared client in `src/lib/supabase.ts`.

Features under `src/features/*` (each with `api.ts` + `use*.ts` + page/components):
- **`auth/`** — Supabase Auth sign-in restricted to the single owner.
- **`videos/`** (dashboard core):
  - `api.ts`: `getVideos(statusFilter)`, `approveVideo`, `rejectVideo`,
    `getSignedVideoUrl`, `triggerGenerate` (calls the Vercel dispatch route).
  - `useVideos.ts`, `useApproveVideo.ts` (queries + mutations + invalidation).
  - `VideosPage.tsx` — queue grouped by status; `VideoCard` with inline `<video>`
    (signed URL), topic, fact text, music attribution, **Approve / Reject**, and a
    YouTube link once published.
  - `RunLogs.tsx` — per-video step log for monitoring.
  - **"Generate now"** button → repository_dispatch via the Vercel route.
- **`stats/`** *(optional)* — counts by status + last run time (Recharts).

**Vercel serverless route** (`api/dispatch.ts`): authenticated by the owner's Supabase
session; forwards a `repository_dispatch` to GitHub using a fine-grained PAT (secret
`GITHUB_DISPATCH_TOKEN`, scoped to this repo). Used by both "Generate now" and
"Approve → publish".

## 8. One-time YouTube OAuth setup (documented in README)
1. Google Cloud project → enable **YouTube Data API v3**.
2. OAuth consent screen (External; add self as test user) → create **OAuth Client
   (Desktop)** → client id/secret.
3. Obtain a **refresh token** for scope `…/auth/youtube.upload` (local helper / OAuth
   playground).
4. Store `YT_CLIENT_ID` / `YT_CLIENT_SECRET` / `YT_REFRESH_TOKEN` as GitHub secrets.

## 9. Music assets
Commit ~3–5 CC0 / CC-BY tracks under `assets/music/` (Pixabay Music / Incompetech / Free
Music Archive) with `assets/music/CREDITS.md`. Store the chosen track's attribution in
`videos.music_attribution` and append it to the YouTube description.

## 10. Risks & caveats
- **YouTube unverified-app lock (important):** videos uploaded by an **unverified** API
  project (created after 2020-07-28) are **locked to private** until the project passes a
  YouTube **compliance audit**. So uploads succeed but land as **private**; the owner
  flips them public in YouTube Studio, or applies for the audit to enable public/unlisted
  via API. This complements the human-in-the-loop gate — **default `privacyStatus` to
  `private`/`unlisted`** and surface the Studio link in the dashboard.
- **YouTube quota:** `videos.insert` = 1600 of 10,000 units/day → ~6 uploads/day max; one
  daily video is comfortable.
- **Claude Pro OAuth token & automation:** keep usage modest (one short generation/day);
  token expires ~1 year — note rotation.
- **Pollinations reliability:** keyless/free may rate-limit or fail — the gradient/solid
  fallback keeps a render from ever blocking the pipeline.
- **FFmpeg fonts/text:** pre-composite text with `sharp` (SVG) instead of ffmpeg
  `drawtext` to dodge font-path and escaping issues.
- **Fact accuracy:** Claude can hallucinate — prompt for verifiable, well-known facts;
  the human review gate is the safety net before publish.
- **Idempotency:** `publish.yml` must no-op if `youtube_id` is already set.
- **Secret hygiene:** service-role + YouTube secrets live **only** in GitHub Actions; the
  Vercel route holds only a repo-scoped dispatch PAT; the browser holds only the anon key.

## 11. Build order
1. **Scaffold + deploy skeleton** — Vite app from house conventions; Supabase project
   with `migrate.yml` workflow (migrations auto-apply on push to `main` via Actions);
   migration `0001` (tables, RLS, `is_owner()`, Storage bucket); deploy empty dashboard to Vercel.
2. **Auth + read UI** — owner-only Supabase Auth; `videos` list + inline player reading
   from Supabase (seed a row manually to test).
3. **Generation pipeline** — `scripts/generate.ts` + `generate.yml`; verify a real mp4
   lands in Storage and a `pending_review` row appears (run via `workflow_dispatch`).
4. **Review gate** — Approve / Reject + signed-URL playback in the dashboard.
5. **Publishing** — YouTube OAuth setup; `scripts/publish.ts` + `publish.yml`; Vercel
   dispatch route; wire Approve → publish and "Generate now".
6. **Schedule + monitoring** — enable cron; add `run_logs` view / optional stats; write
   README with full setup steps and the caveats above.

## 12. Verification
- **Unit (Vitest):** text-wrap/format helpers in `scripts/lib`; `videos` api mutations
  with a mocked `src/lib/supabase.ts` (never hit a real backend in tests). CI runs
  lint + format:check + typecheck + build + test.
- **Pipeline E2E (manual):** trigger `generate.yml` via `workflow_dispatch` → confirm mp4
  in Storage + `pending_review` row → open dashboard, play video, Approve → confirm
  `publish.yml` runs and `videos.status=published` with the (private) video on the channel.
- **Limits:** confirm one daily run stays within YouTube quota and that the Pollinations
  fallback triggers when the image fetch is forced to fail.
