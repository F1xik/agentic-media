// YouTube upload wrapper (see docs/tasks/14-publish-script.md). Kept as a thin,
// mockable module so publish.ts can be unit-tested without the live API.

import { Readable } from "node:stream";

import { google } from "googleapis";

export type PrivacyStatus = "private" | "unlisted" | "public";

export type YouTubeUpload = {
  title: string;
  description: string;
  privacyStatus: PrivacyStatus;
  buffer: Buffer;
};

/**
 * Upload an mp4 to YouTube via `youtube.videos.insert`, authenticating with the
 * stored OAuth2 refresh token (scope `youtube.upload`). Returns the new video's
 * id and canonical watch URL.
 */
export async function uploadToYouTube({
  title,
  description,
  privacyStatus,
  buffer,
}: YouTubeUpload): Promise<{ id: string; url: string }> {
  const clientId = process.env.YT_CLIENT_ID;
  const clientSecret = process.env.YT_CLIENT_SECRET;
  const refreshToken = process.env.YT_REFRESH_TOKEN;

  if (!clientId) throw new Error("YT_CLIENT_ID is not set");
  if (!clientSecret) throw new Error("YT_CLIENT_SECRET is not set");
  if (!refreshToken) throw new Error("YT_REFRESH_TOKEN is not set");

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({ version: "v3", auth });
  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      // 27 = "Education". Tweak if a different default category is wanted.
      snippet: { title, description, categoryId: "27" },
      status: { privacyStatus, selfDeclaredMadeForKids: false },
    },
    media: { body: Readable.from(buffer) },
  });

  const id = res.data.id;
  if (!id) throw new Error("youtube.videos.insert returned no video id");

  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}
