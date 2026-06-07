# Deploying the dashboard to Vercel

> Task ref: [`tasks/05-deploy-skeleton-vercel.md`](tasks/05-deploy-skeleton-vercel.md) · Plan §11.1

The dashboard (the Vite app in `src/`) is hosted on Vercel's free **Hobby**
tier. Heavy work (FFmpeg render, YouTube upload) runs in GitHub Actions — Vercel
hosts only the React SPA with the Supabase **anon** key. Never put the
service-role key or YouTube secrets in Vercel.

## One-time setup

1. **Import the repo.** In the [Vercel dashboard](https://vercel.com/new),
   import `f1xik/agentic-media`. Vercel auto-detects the Vite framework; the
   build settings are also pinned explicitly in [`vercel.json`](../vercel.json):

   | Setting          | Value           |
   | ---------------- | --------------- |
   | Framework        | `vite`          |
   | Build command    | `npm run build` |
   | Output directory | `dist`          |
   | Install command  | `npm ci`        |

2. **Set environment variables** (Project → Settings → Environment Variables),
   for the Production, Preview, and Development scopes. Values mirror
   [`.env.example`](../.env.example):

   - `VITE_SUPABASE_URL` — Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key (RLS-restricted; safe
     for the browser).

   `VITE_`-prefixed vars are inlined at build time, so a redeploy is required
   after changing them.

3. **Deploy.** Pushes to the default branch (`main`) produce Production
   deployments; pull requests get Preview deployments automatically.

## SPA routing

`vercel.json` rewrites every path to `/index.html` so client-side routes
(react-router) resolve on hard refresh / deep links instead of returning a
404:

```json
"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
```

## Verify

- A push to `main` produces a live deployment of the dashboard shell.
- Deep links resolve — e.g. opening `https://<project>.vercel.app/some/route`
  directly (or refreshing it) serves the app, not a 404.

## Notes

- The serverless dispatch route (`api/dispatch.ts`) is added later in
  [task 13](tasks/13-vercel-dispatch-route.md); it holds only a repo-scoped
  `GITHUB_DISPATCH_TOKEN`, never Supabase or YouTube secrets.
