// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateClient, mockGetUser, mockRpc } = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockRpc = vi.fn();
  const mockCreateClient = vi.fn(() => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  }));
  return { mockCreateClient, mockGetUser, mockRpc };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

import handler from "./dispatch";

type Result = { code: number; body: unknown };

function call(req: {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}) {
  const result: Result = { code: 0, body: undefined };
  const res = {
    status(code: number) {
      result.code = code;
      return res;
    },
    json(body: unknown) {
      result.body = body;
      return res;
    },
  };
  return handler(
    {
      method: req.method ?? "POST",
      headers: req.headers ?? {},
      body: req.body,
    },
    res,
  ).then(() => result);
}

const OWNER_HEADERS = { authorization: "Bearer owner-token" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.GITHUB_DISPATCH_TOKEN = "gh-token";
  process.env.GITHUB_REPOSITORY = "owner/repo";

  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  mockRpc.mockResolvedValue({ data: true, error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, text: async () => "" }),
  );
});

describe("dispatch handler", () => {
  it("rejects non-POST methods", async () => {
    const r = await call({ method: "GET" });
    expect(r.code).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects requests without a bearer token", async () => {
    const r = await call({ headers: {}, body: { event: "generate" } });
    expect(r.code).toBe(401);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("rejects invalid sessions", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "bad" },
    });
    const r = await call({
      headers: OWNER_HEADERS,
      body: { event: "generate" },
    });
    expect(r.code).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects non-owner sessions", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const r = await call({
      headers: OWNER_HEADERS,
      body: { event: "generate" },
    });
    expect(r.code).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects when the is_owner check errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "rpc failed" } });
    const r = await call({
      headers: OWNER_HEADERS,
      body: { event: "generate" },
    });
    expect(r.code).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects unknown events", async () => {
    const r = await call({ headers: OWNER_HEADERS, body: { event: "nope" } });
    expect(r.code).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires video_id for publish", async () => {
    const r = await call({
      headers: OWNER_HEADERS,
      body: { event: "publish" },
    });
    expect(r.code).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("dispatches generate_video for a generate event", async () => {
    const r = await call({
      headers: OWNER_HEADERS,
      body: { event: "generate" },
    });
    expect(r.code).toBe(202);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("https://api.github.com/repos/owner/repo/dispatches");
    expect(init.headers.Authorization).toBe("Bearer gh-token");
    const sent = JSON.parse(init.body);
    expect(sent.event_type).toBe("generate_video");
    expect(sent.client_payload).toEqual({});
  });

  it("includes a trimmed topic in the generate payload", async () => {
    const r = await call({
      headers: OWNER_HEADERS,
      body: { event: "generate", topic: "  deep sea creatures  " },
    });
    expect(r.code).toBe(202);
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const sent = JSON.parse(init.body);
    expect(sent.event_type).toBe("generate_video");
    expect(sent.client_payload).toEqual({ topic: "deep sea creatures" });
  });

  it("omits an empty/whitespace topic from the generate payload", async () => {
    const r = await call({
      headers: OWNER_HEADERS,
      body: { event: "generate", topic: "   " },
    });
    expect(r.code).toBe(202);
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(JSON.parse(init.body).client_payload).toEqual({});
  });

  it("rejects an over-long topic", async () => {
    const r = await call({
      headers: OWNER_HEADERS,
      body: { event: "generate", topic: "x".repeat(201) },
    });
    expect(r.code).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("dispatches publish_video with video_id in the payload", async () => {
    const r = await call({
      headers: OWNER_HEADERS,
      body: { event: "publish", video_id: "vid-123" },
    });
    expect(r.code).toBe(202);
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const sent = JSON.parse(init.body);
    expect(sent.event_type).toBe("publish_video");
    expect(sent.client_payload).toEqual({ video_id: "vid-123" });
  });

  it("returns 502 when GitHub rejects the dispatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, text: async () => "boom" }),
    );
    const r = await call({
      headers: OWNER_HEADERS,
      body: { event: "generate" },
    });
    expect(r.code).toBe(502);
  });

  it("returns 500 when GitHub env is missing", async () => {
    delete process.env.GITHUB_DISPATCH_TOKEN;
    const r = await call({
      headers: OWNER_HEADERS,
      body: { event: "generate" },
    });
    expect(r.code).toBe(500);
  });
});
