"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { taskSchema, emptyToNull, parseDate } from "@/lib/validation";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/services/clients";

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("TASK_CREATE");
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  const task = await prisma.task.create({
    data: {
      title: d.title,
      description: emptyToNull(d.description),
      caseId: emptyToNull(d.caseId),
      clientId: emptyToNull(d.clientId),
      assigneeId: emptyToNull(d.assigneeId),
      creatorId: user.id,
      priority: d.priority,
      status: d.status,
      dueDate: parseDate(d.dueDate),
    },
  });
  if (task.assigneeId && task.assigneeId !== user.id) {
    await prisma.notification.create({
      data: {
        userId: task.assigneeId,
        type: "TASK_ASSIGNED",
        title: "New task assigned to you",
        body: task.title,
        href: `/app/tasks?focus=${task.id}`,
      },
    });
  }
  await logActivity({ type: "TASK_CREATED", message: `Task created: ${task.title}`, userId: user.id, clientId: task.clientId, caseId: task.caseId });
  redirect(`/app/tasks?toast=${encodeURIComponent("Task created")}`);
}

export async function setTaskStatus(taskId: string, formData: FormData) {
  const user = await assertPermission("TASK_UPDATE");
  const status = String(formData.get("status") ?? "");
  if (!["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"].includes(status)) return;
  const t = await prisma.task.update({ where: { id: taskId }, data: { status: status as never } });
  await logActivity({ type: "TASK_UPDATED", message: `Task "${t.title}" → ${status.replaceAll("_", " ")}`, userId: user.id, clientId: t.clientId, caseId: t.caseId });
  revalidatePath("/app/tasks");
}
