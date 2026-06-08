// Generation orchestrator (see docs/tasks/10-generate-script.md):
// topic selection → Claude fact → background image → text composite → render →
// upload + record, producing a `pending_review` video row.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  insertVideo,
  updateVideo,
  appendLog,
  uploadVideo,
  recentTopics,
  bumpTopic,
} from "./lib/supabaseAdmin.ts";
import { parseCredits, getAttribution, MUSIC_DIR } from "./lib/musicAssets.ts";
import { produceReviewedSpec } from "./lib/producer.ts";
import { fetchBackground } from "./lib/backgroundImage.ts";
import { compositeFrame, renderVideo } from "./lib/render.ts";

const FRAME_PATH = "frame.png";
const OUT_PATH = "out.mp4";

/**
 * Run the full generation pipeline. Inserts a `videos` row at `generating`,
 * advances it to `pending_review` on success, and marks it `failed` (with the
 * error text) on any step failure. Returns the video id.
 */
export async function generate(): Promise<string> {
  const { id } = await insertVideo({
    status: "generating",
    run_id: process.env.GITHUB_RUN_ID,
  });

  try {
    await appendLog(id, "init", "info", "generation started");

    // 1. Produce a spec, biased away from recently-used topics, and have the
    //    evaluator cross-check it; retry with feedback until approved (or fail).
    const avoidTopics = await recentTopics();
    const validMusicIds = parseCredits().map((t) => t.id);
    const { spec } = await produceReviewedSpec({
      avoidTopics,
      validMusicIds,
      onRound: ({ attempt, verdict }) =>
        appendLog(
          id,
          "evaluate",
          verdict.approved ? "info" : "warn",
          verdict.approved
            ? `approved on attempt ${attempt}`
            : `attempt ${attempt} rejected: ${verdict.issues.join("; ")}`,
        ),
    });
    const musicAttribution = getAttribution(spec.music);
    await updateVideo(id, {
      topic: spec.topic,
      fact_text: spec.fact_text,
      image_prompt: spec.image_prompt,
      music_track: spec.music,
      music_attribution: musicAttribution,
    });
    await appendLog(id, "spec", "info", `topic="${spec.topic}"`);

    // 2. Background image (gradient fallback never blocks the pipeline).
    const { buffer: bg, usedFallback } = await fetchBackground(
      spec.image_prompt,
    );
    await appendLog(
      id,
      "image",
      usedFallback ? "warn" : "info",
      usedFallback
        ? "pollinations fetch failed; using gradient fallback"
        : "fetched background image",
    );

    // 3. Composite the fact text and render the mp4.
    const frame = await compositeFrame(bg, spec.hook, spec.fact_text);
    await writeFile(FRAME_PATH, frame);
    const musicPath = join(MUSIC_DIR, `${spec.music}.mp3`);
    await renderVideo({
      framePath: FRAME_PATH,
      musicPath,
      outPath: OUT_PATH,
    });
    await appendLog(id, "render", "info", "rendered mp4");

    // 4. Upload to Storage and mark ready for review.
    const buffer = await readFile(OUT_PATH);
    const videoPath = await uploadVideo(id, buffer);
    await updateVideo(id, { status: "pending_review", video_path: videoPath });
    await bumpTopic(spec.topic);
    await appendLog(id, "done", "info", "uploaded; status=pending_review");

    return id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendLog(id, "error", "error", message);
    await updateVideo(id, { status: "failed", error: message });
    throw err;
  }
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generate()
    .then((id) => {
      console.log(`generated video ${id}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
