# Task 19 — Enable schedule and write the README

**Plan ref:** docs/plan.md §10, §11.6
**Depends on:** 11, 16

## Objective
Turn on the daily cron and document full setup plus the operational caveats.

## Checklist
- [ ] Enable the `generate.yml` `schedule:` cron (e.g. one daily run).
- [ ] Write the README: architecture overview, env vars, secrets, deploy steps
      (Vercel + Supabase + Actions), and the YouTube OAuth setup. Under Supabase
      setup, note that migrations in `supabase/migrations/` are applied automatically
      on push to `main` via the Supabase GitHub integration — no manual `supabase db push`
      required.
- [ ] Document caveats: unverified-app private lock, YouTube quota (~6 uploads/day),
      Claude Pro token rotation (~1 year), Pollinations fallback, ffmpeg-via-sharp text,
      fact-accuracy review gate, idempotency, secret hygiene.

## Done when
- The cron is active and the README lets a new operator set up the project from scratch.
