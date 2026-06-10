import { createClient } from "@supabase/supabase-js";

// ── Vercel serverless types ─────────────────────────────────────────────────
// Defined inline so this route stays dependency-free (no `@vercel/node`). The
// shapes match what Vercel's Node runtime passes to the handler.
interface DispatchRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

interface DispatchResponse {
  status(code: number): DispatchResponse;
  json(body: unknown): DispatchResponse | void;
}

// ── request payload ─────────────────────────────────────────────────────────
type DispatchEvent = "generate" | "publish";

// Maps the dashboard's logical event to the GitHub `repository_dispatch`
// `event_type` the workflows listen for.
const EVENT_TYPES: Record<DispatchEvent, string> = {
  generate: "generate_video",
  publish: "publish_video",
};

/** Upper bound on the optional free-text topic, mirroring the UI input limit. */
const MAX_TOPIC_LENGTH = 200;

function header(
  headers: DispatchRequest["headers"],
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function bearerToken(req: DispatchRequest): string | undefined {
  const auth = header(req.headers, "authorization");
  if (!auth) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1];
}

/**
 * Owner-authenticated relay that fires GitHub `repository_dispatch` events.
 *
 * Holds only a repo-scoped dispatch PAT (`GITHUB_DISPATCH_TOKEN`) — no
 * Supabase service-role key and no YouTube secrets. The caller proves identity
 * with their Supabase access token (Bearer); we validate it and check
 * `is_owner()` before dispatching.
 */
export default async function handler(
  req: DispatchRequest,
  res: DispatchResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const githubToken = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: "Supabase env not configured" });
    return;
  }
  if (!githubToken || !repo) {
    res.status(500).json({ error: "GitHub dispatch env not configured" });
    return;
  }

  // Authenticate + authorize using the caller's own session (anon key + their
  // access token, subject to RLS). No service-role key here.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  const { data: isOwner, error: ownerError } = await supabase.rpc("is_owner");
  if (ownerError || isOwner !== true) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  // ── validate payload ──────────────────────────────────────────────────────
  const body = (req.body ?? {}) as {
    event?: unknown;
    video_id?: unknown;
    topic?: unknown;
  };
  const event = body.event;
  if (event !== "generate" && event !== "publish") {
    res.status(400).json({ error: "Unknown event; expected generate|publish" });
    return;
  }

  const clientPayload: Record<string, string> = {};
  if (event === "publish") {
    if (typeof body.video_id !== "string" || body.video_id.length === 0) {
      res.status(400).json({ error: "publish event requires video_id" });
      return;
    }
    clientPayload.video_id = body.video_id;
  }
  if (event === "generate" && typeof body.topic === "string") {
    // Optional free-text subject typed in the dashboard. Trim and cap it so the
    // workflow never receives an empty or unbounded string.
    const topic = body.topic.trim();
    if (topic.length > MAX_TOPIC_LENGTH) {
      res.status(400).json({
        error: `topic must be at most ${MAX_TOPIC_LENGTH} characters`,
      });
      return;
    }
    if (topic.length > 0) clientPayload.topic = topic;
  }

  // ── fire repository_dispatch ──────────────────────────────────────────────
  const ghResponse = await fetch(
    `https://api.github.com/repos/${repo}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: EVENT_TYPES[event],
        client_payload: clientPayload,
      }),
    },
  );

  if (!ghResponse.ok) {
    const detail = await ghResponse.text().catch(() => "");
    res.status(502).json({ error: "GitHub dispatch failed", detail });
    return;
  }

  res.status(202).json({ ok: true, event_type: EVENT_TYPES[event] });
}
