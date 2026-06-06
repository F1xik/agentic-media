# Task 08 — Service-role Supabase client for scripts

**Plan ref:** docs/plan.md §6
**Depends on:** 02

## Objective
Provide a service-role Supabase client for pipeline scripts that bypasses RLS,
strictly isolated from the frontend bundle.

## Checklist
- [ ] Create `scripts/lib/supabaseAdmin.ts` using `SUPABASE_URL` +
      `SUPABASE_SERVICE_ROLE_KEY` (from env).
- [ ] Ensure it is **never** imported by anything under `src/` (lint rule or path isolation).
- [ ] Expose helpers used by pipeline steps (insert/update `videos`, write `run_logs`,
      upload to Storage).

## Done when
- Scripts can read/write `videos`, `run_logs`, and Storage with the service-role key.
- A build/lint check confirms the admin client is absent from the frontend bundle.
