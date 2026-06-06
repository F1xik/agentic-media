# Task 04 — Shared Supabase client (frontend)

**Plan ref:** docs/plan.md §7
**Depends on:** 01

## Objective
Provide a single shared anon Supabase client for the dashboard, wired to the
Vite env vars.

## Checklist
- [ ] Create `src/lib/supabase.ts` exporting one `createClient` instance.
- [ ] Read `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `import.meta.env`.
- [ ] Fail fast (clear error) if either env var is missing.
- [ ] Ensure the client carries only the **anon** key — never the service-role key.

## Done when
- Features can `import { supabase } from '@/lib/supabase'` and run a query.
- No service-role secret is referenced anywhere in `src/`.
