# Task 06 — Owner-only authentication

**Plan ref:** docs/plan.md §7
**Depends on:** 04

## Objective
Restrict the dashboard to the single owner via Supabase Auth, complementing the
RLS `is_owner()` gate.

## Checklist
- [ ] Create `src/features/auth/` with sign-in UI and session handling.
- [ ] Use Supabase Auth (email/magic-link or chosen provider) for sign-in/out.
- [ ] Gate all routes behind an authenticated owner session (redirect to sign-in).
- [ ] Surface a clear "not authorized" state for non-owner sessions (RLS returns no data).

## Done when
- The owner can sign in and reach the dashboard; signing out returns to sign-in.
- A non-owner session cannot view any video data.
