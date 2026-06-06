# Task 11 — `generate.yml` GitHub Actions workflow

**Plan ref:** docs/plan.md §5
**Depends on:** 10

## Objective
Run the generation pipeline on a schedule and on demand, with the right secrets
and a preinstalled ffmpeg runner.

## Checklist
- [ ] Add `.github/workflows/generate.yml`.
- [ ] `on: schedule: cron` (e.g. daily) + `workflow_dispatch` ("Generate now").
- [ ] Steps: checkout → setup-node → `npm ci` → run `scripts/generate.ts`.
- [ ] Wire secrets: `CLAUDE_CODE_OAUTH_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Use an ubuntu runner (ffmpeg preinstalled); verify ffmpeg availability.
- [ ] Keep usage modest (one short generation/day) per Claude Pro token limits.

## Done when
- A `workflow_dispatch` run completes green and lands a `pending_review` row + mp4.
