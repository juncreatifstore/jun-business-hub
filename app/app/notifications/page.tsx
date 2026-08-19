import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { markNotificationRead, markAllNotificationsRead } from "@/services/notifications";
import { formatDateTime } from "@/lib/utils";
import { Bell, BellDot } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "You're all caught up."}
        actions={unread > 0 ? <form action={markAllNotificationsRead}><Button variant="secondary">Mark all as read</Button></form> : undefined}
      />
      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="Task assignments, payment confirmations and refund updates will appear here." />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <form action={markNotificationRead.bind(null, n.id)}>
                <button type="submit" className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${n.readAt ? "border-white/5 bg-white/[0.02] text-muted2" : "border-electric/30 bg-electric/5"}`}>
                  {n.readAt ? <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted2" /> : <BellDot className="mt-0.5 h-4 w-4 shrink-0 text-electric" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-white">{n.title}</span>
                    {n.body ? <span className="mt-0.5 block truncate text-sm text-muted2">{n.body}</span> : null}
                    <span className="mt-1 block text-xs text-muted2">{n.type.replaceAll("_", " ")} · {formatDateTime(n.createdAt)}</span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
