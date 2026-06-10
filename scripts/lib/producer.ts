// Producer/evaluator feedback loop: generate a spec, have the evaluator
// cross-check it, and on rejection feed the critique back into the producer and
// retry. After the max attempts without approval the loop throws, which the
// caller turns into a `failed` video row.

import {
  type CommandRunner,
  type GenerationSpec,
  SpecValidationError,
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
  /** Currently-trending subject area to anchor the fact around, if any. The
   *  evaluator stays trend-agnostic and keeps judging the final spec on
   *  accuracy/format/engagement, so a trend can't lower the accuracy bar. */
  trendingTopic?: string;
  /** Explicit subject the user requested in the dashboard. Takes precedence
   *  over `trendingTopic`; the evaluator stays subject-agnostic, so a user
   *  request can't lower the accuracy bar either. */
  requestedTopic?: string;
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
  /** Invoked when an attempt's reply fails local parsing/validation and is
   *  retried, e.g. to log the discarded round. */
  onInvalid?: (round: {
    attempt: number;
    error: SpecValidationError;
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
  trendingTopic,
  requestedTopic,
  maxAttempts = MAX_ATTEMPTS,
  run,
  onRound,
  onInvalid,
}: ProduceOptions): Promise<ReviewedSpec> {
  let feedback: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let spec: GenerationSpec;
    try {
      spec = await requestGenerationSpec({
        avoidTopics,
        validMusicIds,
        feedback,
        trendingTopic,
        requestedTopic,
        run,
      });
    } catch (err) {
      // A reply that fails local validation is just a bad sample: feed the
      // error back and retry (consuming the attempt). Anything else — e.g.
      // the CLI failing to spawn — is not the model's fault, so rethrow.
      if (!(err instanceof SpecValidationError)) throw err;
      await onInvalid?.({ attempt, error: err });
      feedback = [
        `Your previous reply was invalid and was rejected before review: ${err.message}. Reply again with ONE corrected JSON object.`,
      ];
      continue;
    }
    const verdict = await evaluateSpec({ spec, validMusicIds, run });

    await onRound?.({ attempt, spec, verdict });

    if (verdict.approved) return { spec, verdict, attempts: attempt };

    feedback = verdict.issues;
  }

  throw new Error(
    `generation rejected after ${maxAttempts} attempts: ${feedback.join("; ")}`,
  );
}
