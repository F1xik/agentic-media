# Task 18 — Run logs view and optional stats

**Plan ref:** docs/plan.md §7
**Depends on:** 07

## Objective
Surface per-video step logs for monitoring, and optionally summary stats.

## Checklist
- [ ] Add `RunLogs.tsx` showing the per-video `run_logs` (step, level, message, time).
- [ ] Wire it into `VideoCard` / `VideosPage` for the selected video.
- [ ] *(Optional)* Add `src/features/stats/` with counts by status + last run time
      (Recharts).

## Done when
- A video's step log is viewable in the dashboard; optional stats render if included.
