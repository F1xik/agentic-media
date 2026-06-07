# Task 21 — Producer/evaluator feedback loop (follow-up to Task 10)

**Plan ref:** follow-up to Task 10 (generation script)
**Depends on:** 10

## Objective
Cross-check generated text before it reaches review. A second **Claude** call acts as
an LLM-as-judge that evaluates each spec on **factual accuracy**, **format/constraints**,
and **engagement**; on rejection its critique is fed back into the producer and we retry.

## Checklist
- [x] `buildPrompt` accepts optional evaluator `feedback`, appended to the prompt on retry.
- [x] `scripts/lib/specEvaluator.ts` — `buildEvaluatorPrompt`, `parseVerdict`, `evaluateSpec`
      returning `{ approved, issues }` (reuses the `claude` runner + JSON extraction).
- [x] `scripts/lib/producer.ts` — `produceReviewedSpec` loops produce→evaluate up to
      `MAX_ATTEMPTS` (3), feeding `verdict.issues` back as feedback; throws when exhausted.
- [x] `scripts/generate.ts` uses `produceReviewedSpec` and logs each round under `evaluate`;
      an exhausted loop propagates to the existing handler → `status='failed'`.
- [x] Prompt-evaluation and loop tests (`generationSpec.test.ts`, `specEvaluator.test.ts`,
      `producer.test.ts`, updated `generate.test.ts`).

## Done when
- A generated spec is approved by the evaluator (possibly after feedback-driven retries)
  before the video reaches `pending_review`.
- A spec the evaluator keeps rejecting lands the row at `failed` with the issues as `error`.
