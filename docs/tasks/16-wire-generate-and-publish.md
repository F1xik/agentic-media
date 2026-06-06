# Task 16 — Wire "Generate now" and "Approve → publish"

**Plan ref:** docs/plan.md §7
**Depends on:** 12, 13, 15

## Objective
Connect the dashboard actions to the Vercel dispatch route so the full
human-in-the-loop loop works.

## Checklist
- [ ] Add `triggerGenerate` to `features/videos/api.ts` calling the Vercel dispatch route.
- [ ] Add a **"Generate now"** button that fires the generate dispatch.
- [ ] On **Approve**, after setting `status='approved'`, fire the `publish_video` dispatch
      (with `video_id`).
- [ ] Handle dispatch errors with user feedback; avoid duplicate dispatches.

## Done when
- "Generate now" kicks off `generate.yml`; approving a video kicks off `publish.yml`,
  both observable end to end from the dashboard.
