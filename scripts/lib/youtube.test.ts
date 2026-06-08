// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";

const { mockInsert, mockYoutube, mockSetCredentials, OAuth2 } = vi.hoisted(
  () => {
    const mockInsert = vi.fn();
    const mockYoutube = vi.fn(() => ({ videos: { insert: mockInsert } }));
    const mockSetCredentials = vi.fn();
    const OAuth2 = vi.fn(() => ({ setCredentials: mockSetCredentials }));
    return { mockInsert, mockYoutube, mockSetCredentials, OAuth2 };
  },
);

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2 },
    youtube: mockYoutube,
  },
}));

import { uploadToYouTube } from "./youtube.ts";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.YT_CLIENT_ID = "client-id";
  process.env.YT_CLIENT_SECRET = "client-secret";
  process.env.YT_REFRESH_TOKEN = "refresh-token";
});

const params = {
  title: "A fact #Shorts",
  description: "A fact\n\n#Shorts",
  privacyStatus: "private" as const,
  buffer: Buffer.from("mp4"),
};

describe("uploadToYouTube", () => {
  it("authenticates and inserts the video, returning id and url", async () => {
    mockInsert.mockResolvedValue({ data: { id: "yt-abc" } });

    const result = await uploadToYouTube(params);

    expect(OAuth2).toHaveBeenCalledWith("client-id", "client-secret");
    expect(mockSetCredentials).toHaveBeenCalledWith({
      refresh_token: "refresh-token",
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: "A fact #Shorts",
            description: "A fact\n\n#Shorts",
            categoryId: "27",
          },
          status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
        },
        media: { body: expect.any(Readable) },
      }),
    );
    expect(result).toEqual({
      id: "yt-abc",
      url: "https://www.youtube.com/watch?v=yt-abc",
    });
  });

  it("throws when a YT_* env var is missing", async () => {
    delete process.env.YT_REFRESH_TOKEN;

    await expect(uploadToYouTube(params)).rejects.toThrow(
      "YT_REFRESH_TOKEN is not set",
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("throws when the API returns no video id", async () => {
    mockInsert.mockResolvedValue({ data: {} });

    await expect(uploadToYouTube(params)).rejects.toThrow("no video id");
  });
});
