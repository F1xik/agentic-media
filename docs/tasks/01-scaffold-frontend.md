# Task 01 — Scaffold the Vite frontend app

**Plan ref:** docs/plan.md §7, §11.1
**Depends on:** none

## Objective
Stand up the dashboard skeleton using the house conventions (React 18, TS, Vite 6,
Tailwind v4, TanStack Query, react-router) so later features have a home.

## Checklist
- [ ] Init Vite 6 + React 18 + TypeScript project at the repo root.
- [ ] Add Tailwind v4 via `@tailwindcss/vite` and a base stylesheet.
- [ ] Add TanStack Query (`QueryClientProvider`) — no `useEffect`+fetch data loading.
- [ ] Add `react-router` with a top-level layout and a placeholder route.
- [ ] Configure eslint, prettier, and husky pre-commit hooks.
- [ ] Add `vercel.json` with the SPA rewrite to `index.html`.
- [ ] Declare env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (`.env.example`).
- [ ] Add `npm` scripts: `dev`, `build`, `lint`, `format:check`, `typecheck`, `test`.

## Done when
- `npm run dev` serves a blank dashboard shell and `npm run build` succeeds.
- Lint, format:check, and typecheck pass on the scaffold.
