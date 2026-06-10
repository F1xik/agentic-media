import { useState } from "react";
import { useGenerateVideo } from "./useGenerateVideo";

/** Mirrors the topic cap enforced by the dispatch route (api/dispatch.ts). */
const MAX_TOPIC_LENGTH = 200;

export function GeneratePage() {
  const generate = useGenerateVideo();
  const [topic, setTopic] = useState("");

  function handleGenerate() {
    const trimmed = topic.trim();
    generate.mutate(trimmed || undefined, {
      onSuccess: () => setTopic(""),
    });
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Generate video</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kick off a new render. Leave the topic blank to let the pipeline pick
          a trending subject.
        </p>
      </div>

      <form
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleGenerate();
        }}
      >
        <input
          type="text"
          value={topic}
          maxLength={MAX_TOPIC_LENGTH}
          disabled={generate.isPending}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Optional topic (e.g. deep sea creatures)"
          aria-label="Video topic"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={generate.isPending}
          className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {generate.isPending ? "Generating…" : "Generate now"}
        </button>
        {generate.error && (
          <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">
            {generate.error.message}
          </p>
        )}
      </form>
    </div>
  );
}
