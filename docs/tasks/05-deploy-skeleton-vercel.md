# Task 05 — Deploy the empty dashboard to Vercel

**Plan ref:** docs/plan.md §11.1
**Depends on:** 01

## Objective
Get the skeleton deploying to Vercel early so the deploy path is proven before
features land.

## Checklist
- [ ] Connect the repo to a Vercel project (Hobby/free tier).
- [ ] Confirm build command and output dir match the Vite app.
- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel env vars.
- [ ] Verify the `vercel.json` SPA rewrite serves client routes.

## Done when
- A push to the default branch produces a live Vercel deployment of the shell.
- Deep links (client routes) resolve via the SPA rewrite.
