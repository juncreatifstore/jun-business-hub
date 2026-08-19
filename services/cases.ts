"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { caseSchema, emptyToNull, parseDate, parseTags } from "@/lib/validation";
import { nextNumber } from "@/lib/sequence";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/services/clients";

export async function createCase(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("CASE_CREATE");
  const parsed = caseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  const client = await prisma.client.findUnique({ where: { id: d.clientId } });
  if (!client) return { message: "Selected client does not exist." };

  const caseNumber = await nextNumber("CASE");
  const c = await prisma.case.create({
    data: {
      caseNumber,
      clientId: d.clientId,
      type: d.type,
      title: d.title,
      description: emptyToNull(d.description),
      priority: d.priority,
      status: d.status,
      dueDate: parseDate(d.dueDate),
      tags: parseTags(d.tags),
      ownerId: user.id,
      members: { create: { userId: user.id } },
    },
  });
  await audit({ userId: user.id, action: "CASE_CREATE", resourceType: "Case", resourceId: c.id, after: { caseNumber, title: c.title } });
  await logActivity({ type: "CASE_CREATED", message: `Case ${caseNumber} opened: ${c.title}`, userId: user.id, clientId: d.clientId, caseId: c.id });
  redirect(`/app/cases/${c.id}?toast=${encodeURIComponent("Case created")}`);
}

export async function updateCaseStatus(caseId: string, formData: FormData) {
  const user = await assertPermission("CASE_UPDATE");
  const status = String(formData.get("status") ?? "");
  const allowed = ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL", "COMPLETED", "CANCELLED", "ARCHIVED"];
  if (!allowed.includes(status)) return;
  const before = await prisma.case.findUnique({ where: { id: caseId } });
  if (!before) return;
  const updated = await prisma.case.update({ where: { id: caseId }, data: { status: status as never } });
  await audit({ userId: user.id, action: "CASE_STATUS_CHANGE", resourceType: "Case", resourceId: caseId, before: { status: before.status }, after: { status } });
  await logActivity({ type: "CASE_UPDATED", message: `Case ${updated.caseNumber} moved to ${status.replaceAll("_", " ")}`, userId: user.id, clientId: updated.clientId, caseId });
  revalidatePath(`/app/cases/${caseId}`);
}

export async function addCaseNote(caseId: string, formData: FormData) {
  const user = await assertPermission("CASE_UPDATE");
  const body = String(formData.get("body") ?? "").trim().slice(0, 5000);
  if (!body) return;
  const c = await prisma.case.findUnique({ where: { id: caseId } });
  if (!c) return;
  await prisma.caseNote.create({ data: { caseId, authorId: user.id, body } });
  await logActivity({ type: "NOTE_ADDED", message: `Note added to ${c.caseNumber}`, userId: user.id, caseId, clientId: c.clientId });
  revalidatePath(`/app/cases/${caseId}`);
}
