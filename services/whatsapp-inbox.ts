"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { decodeWhatsAppInboxPayload, encodeWhatsAppInboxPayload, normalizeWhatsAppPhone } from "@/lib/whatsapp-inbox";
import { getClientCommunicationBan, isClientCommunicationBanned, setClientCommunicationBan } from "@/lib/client-communication-policy";

function assertStaff(role: string) {
  if (role === "CLIENT") throw new Error("Forbidden");
}

function statusKey(phone: string) { return `whatsapp.inbox.status.${phone}`; }
function priorityKey(phone: string) { return `whatsapp.inbox.priority.${phone}`; }
function assignmentKey(phone: string) { return `whatsapp.inbox.assignment.${phone}`; }
function tagsKey(phone: string) { return `whatsapp.inbox.tags.${phone}`; }
function notesKey(phone: string) { return `whatsapp.inbox.notes.${phone}`; }
function caseKey(phone: string) { return `whatsapp.inbox.case.${phone}`; }

function cleanPhone(phone: string) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) throw new Error("Invalid WhatsApp number");
  return normalized;
}

function refreshInbox() {
  revalidatePath("/app/whatsapp");
  revalidatePath("/app/whatsapp/inbox");
}

async function conversationClient(phone: string) {
  const activity = await prisma.activity.findFirst({
    where: { resourceType: "WhatsAppConversation", resourceId: phone, clientId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { clientId: true, caseId: true },
  });
  if (activity?.clientId) return activity;

  // Fallback for conversations reconstructed from legacy WhatsApp history where
  // the latest WhatsAppConversation activity is not yet linked to the client.
  const clients = await prisma.client.findMany({
    where: { archivedAt: null, OR: [{ whatsapp: { not: null } }, { phone: { not: null } }] },
    select: { id: true, whatsapp: true, phone: true },
  });
  const client = clients.find((row) => {
    const wa = normalizeWhatsAppPhone(row.whatsapp || "");
    const tel = normalizeWhatsAppPhone(row.phone || "");
    return wa === phone || tel === phone;
  });
  return client ? { clientId: client.id, caseId: null } : null;
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
  await prisma.appSetting.upsert({ where: { key: statusKey(normalized) }, create: { key: statusKey(normalized), value: status }, update: { value: status } });
  if (status === "RESOLVED") {
    await prisma.activity.updateMany({ where: { resourceType: "WhatsAppConversation", resourceId: normalized, type: "WHATSAPP_INBOUND_UNREAD" }, data: { type: "WHATSAPP_INBOUND_READ" } });
  }
  refreshInbox();
}

export async function setWhatsAppConversationPriority(phone: string, priority: "NORMAL" | "HIGH" | "URGENT") {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  await prisma.appSetting.upsert({ where: { key: priorityKey(normalized) }, create: { key: priorityKey(normalized), value: priority }, update: { value: priority } });
  refreshInbox();
}

export async function assignWhatsAppConversationToMe(phone: string) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Utilisateur JUN";
  const value = JSON.stringify({ userId: user.id, name, assignedAt: new Date().toISOString() });
  await prisma.appSetting.upsert({ where: { key: assignmentKey(normalized) }, create: { key: assignmentKey(normalized), value }, update: { value } });
  refreshInbox();
}

export async function unassignWhatsAppConversation(phone: string) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  await prisma.appSetting.deleteMany({ where: { key: assignmentKey(normalized) } });
  refreshInbox();
}

export async function setWhatsAppConversationCase(phone: string, formData: FormData) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  const caseId = String(formData.get("caseId") || "").trim();
  const origin = await conversationClient(normalized);

  // Do not let a normal UI action crash the entire Inbox. If the number is not
  // linked yet, simply leave the conversation unchanged.
  if (!origin?.clientId) {
    refreshInbox();
    return;
  }

  if (!caseId) {
    await prisma.appSetting.deleteMany({ where: { key: caseKey(normalized) } });
    refreshInbox();
    return;
  }

  const validCase = await prisma.case.findFirst({
    where: { id: caseId, clientId: origin.clientId },
    select: { id: true },
  });
  if (!validCase) {
    refreshInbox();
    return;
  }

  await prisma.appSetting.upsert({
    where: { key: caseKey(normalized) },
    create: { key: caseKey(normalized), value: validCase.id },
    update: { value: validCase.id },
  });

  // Keep current/future WhatsApp timeline records connected to the chosen case.
  await prisma.activity.updateMany({
    where: {
      resourceType: "WhatsAppConversation",
      resourceId: normalized,
      clientId: origin.clientId,
      caseId: null,
    },
    data: { caseId: validCase.id },
  }).catch(() => null);

  revalidatePath(`/app/cases/${validCase.id}`);
  revalidatePath(`/app/clients/${origin.clientId}`);
  refreshInbox();
}

export async function setWhatsAppClientCommunicationBan(phone: string, banned: boolean, formData?: FormData) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  const origin = await conversationClient(normalized);
  if (!origin?.clientId) throw new Error("This WhatsApp contact is not linked to a JUN client");
  const reason = String(formData?.get("reason") || "").trim();
  await setClientCommunicationBan({ clientId: origin.clientId, banned, reason, userId: user.id });
  await prisma.activity.create({
    data: {
      userId: user.id,
      clientId: origin.clientId,
      caseId: origin.caseId ?? undefined,
      type: banned ? "CLIENT_COMMUNICATION_BANNED" : "CLIENT_COMMUNICATION_UNBANNED",
      message: banned ? `Global communication ban enabled${reason ? ` · ${reason}` : ""}` : "Global communication ban removed",
      resourceType: "Client",
      resourceId: origin.clientId,
    },
  }).catch(() => null);
  refreshInbox();
  revalidatePath(`/app/clients/${origin.clientId}`);
}

export async function updateWhatsAppConversationTags(phone: string, formData: FormData) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  const tags = String(formData.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  const value = JSON.stringify(tags);
  await prisma.appSetting.upsert({ where: { key: tagsKey(normalized) }, create: { key: tagsKey(normalized), value }, update: { value } });
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
  const value = JSON.stringify(notes);
  await prisma.appSetting.upsert({ where: { key: notesKey(normalized) }, create: { key: notesKey(normalized), value }, update: { value } });
  refreshInbox();
}

export async function replyWhatsAppConversation(phone: string, formData: FormData) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = cleanPhone(phone);
  const body = String(formData.get("message") || "").trim();
  if (!body) throw new Error("Message is empty");

  const origin = await conversationClient(normalized);
  if (origin?.clientId && await isClientCommunicationBanned(origin.clientId)) {
    const ban = await getClientCommunicationBan(origin.clientId);
    throw new Error(`Client banni — aucun message WhatsApp ne peut être envoyé${ban.reason ? `: ${ban.reason}` : ""}`);
  }

  const recent = await prisma.activity.findMany({
    where: { resourceType: "WhatsAppConversation", resourceId: normalized, type: "WHATSAPP_OUTBOUND_REPLY", createdAt: { gte: new Date(Date.now() - 15_000) } },
    orderBy: { createdAt: "desc" }, take: 5, select: { message: true },
  });
  const duplicate = recent.some((row) => {
    const payload = decodeWhatsAppInboxPayload(row.message);
    return payload?.direction === "OUTBOUND" && payload.text.trim() === body;
  });
  if (duplicate) { refreshInbox(); return; }

  let attachedCaseId = origin?.caseId ?? undefined;
  const caseSetting = await prisma.appSetting.findUnique({ where: { key: caseKey(normalized) }, select: { value: true } });
  if (caseSetting?.value && origin?.clientId) {
    const valid = await prisma.case.findFirst({ where: { id: caseSetting.value, clientId: origin.clientId }, select: { id: true } });
    if (valid) attachedCaseId = valid.id;
  }

  const result = await sendWhatsAppText(normalized, body);
  const messageId = String(result.messages?.[0]?.id || `local-${Date.now()}`);
  await prisma.activity.create({
    data: {
      type: "WHATSAPP_OUTBOUND_REPLY",
      message: encodeWhatsAppInboxPayload({ direction: "OUTBOUND", phone: normalized, messageId, type: "text", text: body, timestamp: new Date().toISOString() }),
      userId: user.id,
      clientId: origin?.clientId ?? undefined,
      caseId: attachedCaseId,
      resourceType: "WhatsAppConversation",
      resourceId: normalized,
    },
  });

  await Promise.all([
    prisma.activity.updateMany({ where: { resourceType: "WhatsAppConversation", resourceId: normalized, type: "WHATSAPP_INBOUND_UNREAD" }, data: { type: "WHATSAPP_INBOUND_READ" } }),
    prisma.appSetting.upsert({ where: { key: statusKey(normalized) }, create: { key: statusKey(normalized), value: "OPEN" }, update: { value: "OPEN" } }),
  ]);
  refreshInbox();
}
