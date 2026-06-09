import { type Video } from "./api";
import { useSignedVideoUrl, useSignedVideoDownloadUrl } from "./useVideos";
import { useApproveVideo, useRejectVideo } from "./useApproveVideo";

interface Props {
  video: Video;
}

export function VideoCard({ video }: Props) {
  const { data: signedUrl, isLoading: urlLoading } = useSignedVideoUrl(
    video.video_path,
  );
  const { data: downloadUrl } = useSignedVideoDownloadUrl(video.video_path);
  const approve = useApproveVideo();
  const reject = useRejectVideo();
  const isPending = approve.isPending || reject.isPending;
  const mutationError = approve.error ?? reject.error;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {video.video_path && (
        <div className="bg-slate-100">
          {urlLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              Loading video…
            </div>
          ) : signedUrl ? (
            <video
              controls
              className="w-full"
              style={{ maxHeight: "320px" }}
              src={signedUrl}
            />
          ) : null}
        </div>
      )}

      <div className="p-4 space-y-2">
        {video.topic && (
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {video.topic}
          </p>
        )}
        {video.fact_text && (
          <p className="text-sm text-slate-700">{video.fact_text}</p>
        )}
        {video.music_attribution && (
          <p className="text-xs text-slate-400">{video.music_attribution}</p>
        )}
        {video.youtube_url && (
          <a
            href={video.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs font-medium text-blue-600 hover:underline"
          >
            Watch on YouTube ↗
          </a>
        )}
        {video.status === "failed" && video.error && (
          <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">
            {video.error}
          </p>
        )}

        {video.video_path && (
          <a
            href={downloadUrl ?? undefined}
            download
            aria-disabled={!downloadUrl}
            className={`inline-block rounded bg-blue-600 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-blue-700 ${
              downloadUrl ? "" : "pointer-events-none opacity-50"
            }`}
          >
            Download
          </a>
        )}

        {video.status === "pending_review" && (
          <div className="space-y-2 pt-1">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => approve.mutate(video.id)}
                className="flex-1 rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => reject.mutate(video.id)}
                className="flex-1 rounded bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
            {mutationError && (
              <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">
                {mutationError.message}
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-slate-300">
          {new Date(video.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
