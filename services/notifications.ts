"use server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function markNotificationRead(notificationId: string): Promise<void> {
  const user = await requireUser();
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.userId !== user.id) redirect("/app/notifications?toast_error=Notification not found");
  if (!n.readAt) {
    await prisma.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  }
  revalidatePath("/app/notifications");
  redirect("/app/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/app/notifications");
  redirect("/app/notifications?toast=All notifications marked as read");
}
