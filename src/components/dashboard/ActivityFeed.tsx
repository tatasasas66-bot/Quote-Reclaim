import { listRecentEvents } from "@/lib/intelligence/list-recent-events";
import { ActivityFeedView } from "./ActivityFeedView";

export async function ActivityFeed({ userId }: { userId: string }) {
  const events = await listRecentEvents(userId, 8);
  return <ActivityFeedView events={events} />;
}
