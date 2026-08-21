"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { taskSchema, emptyToNull, parseDate } from "@/lib/validation";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/services/clients";

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("TASK_CREATE");
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const task = await prisma.task.create({ data: { title: d.title, description: emptyToNull(d.description), caseId: emptyToNull(d.caseId), clientId: emptyToNull(d.clientId), assigneeId: emptyToNull(d.assigneeId), creatorId: user.id, priority: d.priority, status: d.status, dueDate: parseDate(d.dueDate) } });
  if (task.assigneeId && task.assigneeId !== user.id) await prisma.notification.create({ data: { userId: task.assigneeId, type: "TASK_ASSIGNED", title: "New task assigned to you", body: task.title } });
  await logActivity({ type: "TASK_CREATED", message: `Task created: ${task.title}`, userId: user.id, clientId: task.clientId, caseId: task.caseId });
  redirect(`/app/tasks?toast=${encodeURIComponent("Task created")}`);
}

export async function updateTask(taskId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("TASK_UPDATE");
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const before = await prisma.task.findUnique({ where: { id: taskId } });
  if (!before) return { message: "Task not found." };
  const reason = String(formData.get("correctionReason") || "").trim().slice(0, 1000);
  if (!reason) return { message: "Correction reason is required." };
  const caseId = emptyToNull(d.caseId), clientId = emptyToNull(d.clientId), assigneeId = emptyToNull(d.assigneeId);
  if (caseId) {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } });
    if (!c) return { message: "Selected case does not exist." };
    if (clientId && c.clientId !== clientId) return { message: "Selected case belongs to a different client." };
  }
  const task = await prisma.task.update({ where: { id: taskId }, data: { title: d.title, description: emptyToNull(d.description), caseId, clientId, assigneeId, priority: d.priority, status: d.status, dueDate: parseDate(d.dueDate) } });
  if (task.assigneeId && task.assigneeId !== before.assigneeId && task.assigneeId !== user.id) await prisma.notification.create({ data: { userId: task.assigneeId, type: "TASK_ASSIGNED", title: "Task assigned to you", body: task.title } });
  await audit({ userId: user.id, action: "TASK_CORRECTION", resourceType: "Task", resourceId: taskId, before: { title: before.title, description: before.description, caseId: before.caseId, clientId: before.clientId, assigneeId: before.assigneeId, priority: before.priority, status: before.status, dueDate: before.dueDate }, after: { title: task.title, description: task.description, caseId: task.caseId, clientId: task.clientId, assigneeId: task.assigneeId, priority: task.priority, status: task.status, dueDate: task.dueDate, correctionReason: reason } });
  await logActivity({ type: "TASK_UPDATED", message: `Task corrected: ${task.title} · ${reason}`, userId: user.id, clientId: task.clientId, caseId: task.caseId });
  redirect(`/app/tasks?focus=${task.id}&toast=${encodeURIComponent("Task corrected")}`);
}

export async function setTaskStatus(taskId: string, formData: FormData) {
  const user = await assertPermission("TASK_UPDATE");
  const status = String(formData.get("status") ?? "");
  if (!["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"].includes(status)) return;
  const before = await prisma.task.findUnique({ where: { id: taskId } });
  if (!before) return;
  const t = await prisma.task.update({ where: { id: taskId }, data: { status: status as never } });
  await audit({ userId: user.id, action: "TASK_STATUS_CHANGE", resourceType: "Task", resourceId: taskId, before: { status: before.status }, after: { status } });
  await logActivity({ type: "TASK_UPDATED", message: `Task "${t.title}" → ${status.replaceAll("_", " ")}`, userId: user.id, clientId: t.clientId, caseId: t.caseId });
  revalidatePath("/app/tasks");
}
