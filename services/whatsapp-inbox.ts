"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { decodeWhatsAppInboxPayload, encodeWhatsAppInboxPayload, normalizeWhatsAppPhone } from "@/lib/whatsapp-inbox";

function assertStaff(role: string) {
  if (role === "CLIENT") throw new Error("Forbidden");
}

function statusKey(phone: string) { return `whatsapp.inbox.status.${phone}`; }
function priorityKey(phone: string) { return `whatsapp.inbox.priority.${phone}`; }
function assignmentKey(phone: string) { return `whatsapp.inbox.assignment.${phone}`; }
function tagsKey(phone: string) { return `whatsapp.inbox.tags.${phone}`; }
function notesKey(phone: string) { return `whatsapp.inbox.notes.${phone}`; }

function cleanPhone(phone: string) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) throw new Error("Invalid WhatsApp number");
  return normalized;
}

function refreshInbox() {
  revalidatePath("/app/whatsapp");
  revalidatePath("/app/whatsapp/inbox");
}

export async function markWhatsAppConversationRead(phone: string) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  await prisma.activity.updateMany({
    where: { resourceType: "WhatsAppConversation", resourceId: normalized, type: "WHATSAPP_INBOUND_UNREAD" },
    data: { type: "WHATSAPP_INBOUND_READ" },
  });
  refreshInbox();
}

export async function setWhatsAppConversationStatus(phone: string, status: "OPEN" | "WAITING" | "RESOLVED") {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);

  await prisma.appSetting.upsert({
    where: { key: statusKey(normalized) },
    create: { key: statusKey(normalized), value: status },
    update: { value: status },
  });

  if (status === "RESOLVED") {
    await prisma.activity.updateMany({
      where: { resourceType: "WhatsAppConversation", resourceId: normalized, type: "WHATSAPP_INBOUND_UNREAD" },
      data: { type: "WHATSAPP_INBOUND_READ" },
    });
  }
  refreshInbox();
}

export async function setWhatsAppConversationPriority(phone: string, priority: "NORMAL" | "HIGH" | "URGENT") {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  await prisma.appSetting.upsert({
    where: { key: priorityKey(normalized) },
    create: { key: priorityKey(normalized), value: priority },
    update: { value: priority },
  });
  refreshInbox();
}

export async function assignWhatsAppConversationToMe(phone: string) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Utilisateur JUN";
  await prisma.appSetting.upsert({
    where: { key: assignmentKey(normalized) },
    create: { key: assignmentKey(normalized), value: JSON.stringify({ userId: user.id, name, assignedAt: new Date().toISOString() }) },
    update: { value: JSON.stringify({ userId: user.id, name, assignedAt: new Date().toISOString() }) },
  });
  refreshInbox();
}

export async function unassignWhatsAppConversation(phone: string) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  await prisma.appSetting.deleteMany({ where: { key: assignmentKey(normalized) } });
  refreshInbox();
}

export async function updateWhatsAppConversationTags(phone: string, formData: FormData) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
  await prisma.appSetting.upsert({
    where: { key: tagsKey(normalized) },
    create: { key: tagsKey(normalized), value: JSON.stringify(tags) },
    update: { value: JSON.stringify(tags) },
  });
  refreshInbox();
}

export async function addWhatsAppInternalNote(phone: string, formData: FormData) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  const text = String(formData.get("note") || "").trim();
  if (!text) return;
  const existing = await prisma.appSetting.findUnique({ where: { key: notesKey(normalized) }, select: { value: true } });
  let notes: Array<{ id: string; text: string; author: string; createdAt: string }> = [];
  try { notes = existing?.value ? JSON.parse(existing.value) : []; } catch { notes = []; }
  const author = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Utilisateur JUN";
  notes.unshift({ id: `${Date.now()}-${user.id}`, text: text.slice(0, 2000), author, createdAt: new Date().toISOString() });
  notes = notes.slice(0, 30);
  await prisma.appSetting.upsert({
    where: { key: notesKey(normalized) },
    create: { key: notesKey(normalized), value: JSON.stringify(notes) },
    update: { value: JSON.stringify(notes) },
  });
  refreshInbox();
}

export async function replyWhatsAppConversation(phone: string, formData: FormData) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  const body = String(formData.get("message") || "").trim();
  if (!body) throw new Error("Message is empty");

  const recent = await prisma.activity.findMany({
    where: {
      resourceType: "WhatsAppConversation",
      resourceId: normalized,
      type: "WHATSAPP_OUTBOUND_REPLY",
      createdAt: { gte: new Date(Date.now() - 15_000) },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { message: true },
  });
  const duplicate = recent.some((row) => {
    const payload = decodeWhatsAppInboxPayload(row.message);
    return payload?.direction === "OUTBOUND" && payload.text.trim() === body;
  });
  if (duplicate) {
    refreshInbox();
    return;
  }

  const result = await sendWhatsAppText(normalized, body);
  const messageId = String(result.messages?.[0]?.id || `local-${Date.now()}`);
  const origin = await prisma.activity.findFirst({
    where: { resourceType: "WhatsAppConversation", resourceId: normalized, clientId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { clientId: true, caseId: true },
  });

  await prisma.activity.create({
    data: {
      type: "WHATSAPP_OUTBOUND_REPLY",
      message: encodeWhatsAppInboxPayload({
        direction: "OUTBOUND",
        phone: normalized,
        messageId,
        type: "text",
        text: body,
        timestamp: new Date().toISOString(),
      }),
      userId: user.id,
      clientId: origin?.clientId ?? undefined,
      caseId: origin?.caseId ?? undefined,
      resourceType: "WhatsAppConversation",
      resourceId: normalized,
    },
  });

  await Promise.all([
    prisma.activity.updateMany({
      where: { resourceType: "WhatsAppConversation", resourceId: normalized, type: "WHATSAPP_INBOUND_UNREAD" },
      data: { type: "WHATSAPP_INBOUND_READ" },
    }),
    prisma.appSetting.upsert({
      where: { key: statusKey(normalized) },
      create: { key: statusKey(normalized), value: "OPEN" },
      update: { value: "OPEN" },
    }),
  ]);

  refreshInbox();
}
