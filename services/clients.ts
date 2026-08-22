"use server";
// Client CRM server actions. Every action re-checks permissions server-side.
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { clientSchema, emptyToNull, parseDate, parseTags } from "@/lib/validation";
import { nextNumber } from "@/lib/sequence";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export type FormState = { errors?: Record<string, string[]>; message?: string };

function clientData(formData: FormData) {
  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const d = parsed.data;
  return {
    data: {
      firstName: d.firstName,
      lastName: d.lastName,
      email: emptyToNull(d.email)?.toLowerCase() ?? null,
      phone: emptyToNull(d.phone),
      whatsapp: emptyToNull(d.whatsapp),
      address: emptyToNull(d.address),
      country: emptyToNull(d.country),
      nationality: emptyToNull(d.nationality),
      birthDate: parseDate(d.birthDate),
      notes: emptyToNull(d.notes),
      status: d.status,
    },
    tags: parseTags(d.tags),
  };
}

export async function createClient(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("CLIENT_CREATE");
  const r = clientData(formData);
  if ("errors" in r) return { errors: r.errors };

  const internalId = await nextNumber("JUN-CLI");
  const client = await prisma.client.create({
    data: { ...r.data, internalId, ownerId: user.id, tags: { create: r.tags.map((tag) => ({ tag })) } },
  });
  await audit({ userId: user.id, action: "CLIENT_CREATE", resourceType: "Client", resourceId: client.id, after: { internalId, name: `${client.firstName} ${client.lastName}` } });
  await logActivity({ type: "CLIENT_CREATED", message: `Client ${client.firstName} ${client.lastName} created`, userId: user.id, clientId: client.id });
  redirect(`/app/clients/${client.id}?toast=${encodeURIComponent("Client created")}`);
}

export async function updateClient(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("CLIENT_UPDATE");
  const r = clientData(formData);
  if ("errors" in r) return { errors: r.errors };

  const before = await prisma.client.findUnique({ where: { id: clientId } });
  if (!before) return { message: "Client not found." };

  await prisma.$transaction([
    prisma.clientTag.deleteMany({ where: { clientId } }),
    prisma.client.update({
      where: { id: clientId },
      data: { ...r.data, tags: { create: r.tags.map((tag) => ({ tag })) } },
    }),
  ]);
  await audit({
    userId: user.id, action: "CLIENT_UPDATE", resourceType: "Client", resourceId: clientId,
    before: { status: before.status, email: before.email, phone: before.phone },
    after: { status: r.data.status, email: r.data.email, phone: r.data.phone },
  });
  await logActivity({ type: "CLIENT_UPDATED", message: `Client ${r.data.firstName} ${r.data.lastName} updated`, userId: user.id, clientId });
  redirect(`/app/clients/${clientId}?toast=${encodeURIComponent("Client updated")}`);
}

export async function archiveClient(clientId: string) {
  const user = await assertPermission("CLIENT_ARCHIVE");
  const c = await prisma.client.update({
    where: { id: clientId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  await audit({ userId: user.id, action: "CLIENT_ARCHIVE", resourceType: "Client", resourceId: clientId });
  await logActivity({ type: "CLIENT_ARCHIVED", message: `Client ${c.firstName} ${c.lastName} archived`, userId: user.id, clientId });
  revalidatePath("/app/clients");
  redirect(`/app/clients?toast=${encodeURIComponent("Client archived")}`);
}

export async function addClientNote(clientId: string, formData: FormData) {
  const user = await assertPermission("CLIENT_UPDATE");
  const body = String(formData.get("body") ?? "").trim().slice(0, 5000);
  if (!body) return;
  await prisma.clientNote.create({ data: { clientId, authorId: user.id, body } });
  await logActivity({ type: "NOTE_ADDED", message: "Note added to client", userId: user.id, clientId });
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath(`/app/clients/${clientId}/dashboard`);
  revalidatePath(`/app/clients/${clientId}/history`);
}
