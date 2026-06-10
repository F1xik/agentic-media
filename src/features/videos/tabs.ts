import type { VideoStatus } from "./api";

/** Route path for the generate ("+") tab; it has no status list of its own. */
export const GENERATE_PATH = "/generate";

export interface VideoTab {
  key: string;
  /** Route path, e.g. "/pending". */
  path: string;
  label: string;
  /**
   * Statuses folded into this tab. Some pipeline statuses don't get their own
   * tab, so they ride along with the closest one (e.g. published → Approved,
   * failed → Rejected) to keep every video visible.
   */
  statuses: VideoStatus[];
}

/** Ordered list tabs shown in the bottom nav, after the "+" generate tab. */
export const TABS: VideoTab[] = [
  {
    key: "pending",
    path: "/pending",
    label: "Pending",
    statuses: ["pending_review"],
  },
  {
    key: "approved",
    path: "/approved",
    label: "Approved",
    statuses: ["approved", "publishing", "published"],
  },
  {
    key: "rejected",
    path: "/rejected",
    label: "Rejected",
    statuses: ["rejected", "failed"],
  },
  {
    key: "generating",
    path: "/generating",
    label: "Generating",
    statuses: ["generating"],
  },
];
