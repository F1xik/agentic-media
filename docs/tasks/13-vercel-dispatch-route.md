# Task 13 — Vercel dispatch route (`api/dispatch.ts`)

**Plan ref:** docs/plan.md §7, §10
**Depends on:** 06

## Objective
Provide a thin owner-authenticated serverless route that fires GitHub
`repository_dispatch` events, holding only a repo-scoped dispatch token.

## Checklist
- [ ] Add `api/dispatch.ts` (Vercel serverless function).
- [ ] Authenticate the caller via the owner's Supabase session (reject otherwise).
- [ ] Forward a `repository_dispatch` to GitHub using `GITHUB_DISPATCH_TOKEN`
      (fine-grained PAT scoped to this repo only).
- [ ] Support both event types: trigger generation and trigger publish (payload incl. `video_id`).
- [ ] Hold **no** YouTube/Supabase service-role secrets in this route.

## Done when
- An authenticated owner request dispatches the correct GitHub event; unauthenticated
  requests are rejected.
