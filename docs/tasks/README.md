# Tasks — Automated "Fun Facts" YouTube Pipeline

Atomic, independently-reviewable tasks decomposed from [`../plan.md`](../plan.md).
Each file follows a lightweight checklist format (objective → checklist → done-when)
and links back to the relevant plan section. Work them roughly in number order,
respecting each task's **Depends on**.

## Index (by build-order phase, plan §11)

### Phase 1 — Scaffold + deploy skeleton
- [01 — Scaffold the Vite frontend app](01-scaffold-frontend.md)
- [02 — Supabase schema migration `0001`](02-supabase-schema-migration.md)
- [03 — Supabase Storage bucket](03-supabase-storage-bucket.md)
- [04 — Shared Supabase client (frontend)](04-supabase-client.md)
- [05 — Deploy the empty dashboard to Vercel](05-deploy-skeleton-vercel.md)

### Phase 2 — Auth + read UI
- [06 — Owner-only authentication](06-owner-auth.md)
- [07 — Videos read UI (queue + inline player)](07-videos-read-ui.md)

### Phase 3 — Generation pipeline
- [08 — Service-role Supabase client for scripts](08-supabase-admin-client.md)
- [09 — Royalty-free music assets](09-music-assets.md)
- [10 — Generation script (`scripts/generate.ts`)](10-generate-script.md)
- [11 — `generate.yml` GitHub Actions workflow](11-generate-workflow.md)

### Phase 4 — Review gate
- [12 — Review gate UI (Approve / Reject)](12-review-gate-ui.md)

### Phase 5 — Publishing
- [13 — Vercel dispatch route (`api/dispatch.ts`)](13-vercel-dispatch-route.md)
- [14 — Publish script (`scripts/publish.ts`)](14-publish-script.md)
- [15 — `publish.yml` GitHub Actions workflow](15-publish-workflow.md)
- [16 — Wire "Generate now" and "Approve → publish"](16-wire-generate-and-publish.md)
- [17 — One-time YouTube OAuth setup](17-youtube-oauth-setup.md)

### Phase 6 — Schedule + monitoring
- [18 — Run logs view and optional stats](18-run-logs-and-stats.md)
- [19 — Enable schedule and write the README](19-schedule-and-readme.md)
- [20 — Tests and CI](20-tests-and-ci.md)
