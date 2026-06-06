# Task 20 — Tests and CI

**Plan ref:** docs/plan.md §12
**Depends on:** 07, 10

## Objective
Add unit tests and a CI pipeline so changes stay green without hitting real
backends.

## Checklist
- [ ] Vitest unit tests for text-wrap/format helpers in `scripts/lib`.
- [ ] Vitest + React Testing Library tests for `videos` api mutations with a **mocked**
      `src/lib/supabase.ts` (never hit a real backend).
- [ ] CI workflow running `lint`, `format:check`, `typecheck`, `build`, and `test`.
- [ ] Ensure tests run on PRs to the default branch.

## Done when
- CI runs all checks green on a PR; tests use mocks only (no live Supabase/YouTube).
