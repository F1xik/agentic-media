# Task 12 — Review gate UI (Approve / Reject)

**Plan ref:** docs/plan.md §3, §7
**Depends on:** 07

## Objective
Let the owner approve or reject a `pending_review` video, driving the state
machine from the dashboard.

## Checklist
- [ ] Add `approveVideo` (→ `approved`) and `rejectVideo` (→ `rejected`) to
      `features/videos/api.ts`.
- [ ] Add `useApproveVideo.ts` mutations with query invalidation.
- [ ] Add **Approve / Reject** controls to `VideoCard` (shown only for `pending_review`).
- [ ] Confirm signed-URL playback works while reviewing.
- [ ] Reflect status transitions optimistically / on refetch.

## Done when
- Approving a `pending_review` video sets `approved`; rejecting sets `rejected`
  (terminal), and the UI updates.
