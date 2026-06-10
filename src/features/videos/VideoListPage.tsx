import { useVideos } from "./useVideos";
import { VideoCard } from "./VideoCard";
import { type VideoTab } from "./tabs";

export function VideoListPage({ tab }: { tab: VideoTab }) {
  const { data: videos, isLoading, isError } = useVideos(tab.statuses);

  function renderBody() {
    if (isLoading) {
      return (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg bg-slate-100"
            />
          ))}
        </div>
      );
    }

    if (isError) {
      return (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          Failed to load videos.
        </p>
      );
    }

    if (!videos || videos.length === 0) {
      return (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-xl font-semibold">No {tab.label} videos</h2>
          <p className="mt-2 text-slate-500">
            Videos in this state will appear here.
          </p>
        </section>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">
        {tab.label}{" "}
        {videos && (
          <span className="font-normal text-slate-400">({videos.length})</span>
        )}
      </h1>
      {renderBody()}
    </div>
  );
}
