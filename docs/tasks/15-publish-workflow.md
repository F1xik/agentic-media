# Task 15 — `publish.yml` GitHub Actions workflow

**Plan ref:** docs/plan.md §5
**Depends on:** 14

## Objective
Run the publish script when a video is approved (via dispatch) or manually.

## Checklist
- [ ] Add `.github/workflows/publish.yml`.
- [ ] `on: repository_dispatch: types: [publish_video]` + `workflow_dispatch`.
- [ ] Steps: checkout → setup-node → `npm ci` → run `scripts/publish.ts` with the
      `video_id` from the payload.
- [ ] Wire secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `YT_CLIENT_ID`,
      `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.

## Done when
- A `publish_video` dispatch runs the workflow green and the video reaches
  `published`.
