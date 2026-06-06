# Task 14 — Publish script (`scripts/publish.ts`)

**Plan ref:** docs/plan.md §5 (publish.yml steps), §6, §10
**Depends on:** 08, 17

## Objective
Upload an approved video to YouTube and record the result, idempotently.

## Checklist
- [ ] Read the `videos` row by id (from dispatch payload); set `status='publishing'`.
- [ ] **Idempotency:** no-op if `youtube_id` is already set.
- [ ] Download the mp4 from Storage with the service-role key.
- [ ] Upload via `googleapis` `youtube.videos.insert` (scope `youtube.upload`, OAuth2
      with stored refresh token).
- [ ] Build title/description from `fact_text` + topic + music attribution.
- [ ] Default `privacyStatus` to `private`/`unlisted` (unverified-app lock caveat).
- [ ] On success set `status='published'` + `youtube_id`/`youtube_url`; else `failed` + `error`.

## Done when
- An approved video uploads to YouTube and the row becomes `published` with id/url.
- Re-running the script for the same video is a no-op.
