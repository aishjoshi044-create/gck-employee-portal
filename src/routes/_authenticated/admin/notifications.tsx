import { createFileRoute } from "@tanstack/react-router";
import { NotificationsView } from "@/components/notifications/NotificationsView";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  component: () => <NotificationsView isAdmin={true} />,
});
