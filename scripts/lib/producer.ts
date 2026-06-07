// Producer/evaluator feedback loop: generate a spec, have the evaluator
// cross-check it, and on rejection feed the critique back into the producer and
// retry. After the max attempts without approval the loop throws, which the
// caller turns into a `failed` video row.

import {
  type CommandRunner,
  type GenerationSpec,
  requestGenerationSpec,
} from "./generationSpec.ts";
import { type Verdict, evaluateSpec } from "./specEvaluator.ts";

export const MAX_ATTEMPTS = 3;

/** An approved spec plus the verdict and number of attempts it took. */
export type ReviewedSpec = {
  spec: GenerationSpec;
  verdict: Verdict;
  attempts: number;
};

export type ProduceOptions = {
  avoidTopics: string[];
  validMusicIds: string[];
  /** Maximum produce→evaluate rounds before giving up (default `MAX_ATTEMPTS`). */
  maxAttempts?: number;
  /** Injectable runner for tests; defaults to spawning the `claude` CLI. */
  run?: CommandRunner;
  /** Invoked after each evaluation round, e.g. to log progress. */
  onRound?: (round: {
    attempt: number;
    spec: GenerationSpec;
    verdict: Verdict;
  }) => void | Promise<void>;
};

/**
 * Run the producer→evaluator loop. Produces a spec (biased away from recent
 * topics and corrected by any prior critique), evaluates it, and returns once
 * approved. Throws if no attempt is approved within `maxAttempts`.
 */
export async function produceReviewedSpec({
  avoidTopics,
  validMusicIds,
  maxAttempts = MAX_ATTEMPTS,
  run,
  onRound,
}: ProduceOptions): Promise<ReviewedSpec> {
  let feedback: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const spec = await requestGenerationSpec({
      avoidTopics,
      validMusicIds,
      feedback,
      run,
    });
    const verdict = await evaluateSpec({ spec, validMusicIds, run });

    await onRound?.({ attempt, spec, verdict });

    if (verdict.approved) return { spec, verdict, attempts: attempt };

    feedback = verdict.issues;
  }

  throw new Error(
    `generation rejected after ${maxAttempts} attempts: ${feedback.join("; ")}`,
  );
}
