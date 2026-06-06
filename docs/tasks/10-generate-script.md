# Task 10 — Generation script (`scripts/generate.ts`)

**Plan ref:** docs/plan.md §5 (generate.yml steps), §6, §10
**Depends on:** 08, 09

## Objective
Orchestrate topic selection → image → text composite → render → upload + record,
producing a `pending_review` video row.

## Checklist
- [ ] Insert a `videos` row at `status='generating'` (capture `run_id`).
- [ ] Call **Claude** (`claude -p … --output-format json`) for a single JSON object
      `{topic, fact_text (≤160 chars, verifiable), image_prompt, music: <filename>}`,
      biased to avoid recently-used topics.
- [ ] Fetch the Pollinations image
      (`width=1080&height=1920&nologo=true`) → `bg.png`; gradient/solid fallback on failure.
- [ ] Composite wrapped fact text with `sharp` (SVG overlay + contrast band) → `frame.png`.
- [ ] Render with ffmpeg (image + `assets/music/{track}.mp3` → 1080x1920 mp4, `-t 30`,
      `yuv420p`, `-shortest`).
- [ ] Upload `out.mp4` to Storage (`{video_id}.mp4`) and set the row to `pending_review`.
- [ ] Write `run_logs` for each step; on any error set `status='failed'` with `error` text.
- [ ] Factor text-wrap/format helpers into `scripts/lib` (unit-testable — see Task 20).

## Done when
- Running the script produces a real mp4 in Storage and a `pending_review` row with logs.
- Forcing the image fetch to fail still renders via the fallback.
