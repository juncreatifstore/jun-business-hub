import "server-only";

import { prisma } from "@/lib/prisma";
import { isClientCommunicationBanned } from "@/lib/client-communication-policy";

export type WhatsAppInboxPayload = {
  direction: "INBOUND" | "OUTBOUND";
  phone: string;
  contactName?: string;
  messageId: string;
  type: string;
  text: string;
  mediaId?: string;
  filename?: string;
  caption?: string;
  timestamp: string;
};

export function normalizeWhatsAppPhone(value: string) {
  return String(value || "").replace(/[^0-9]/g, "");
}

export function encodeWhatsAppInboxPayload(payload: WhatsAppInboxPayload) {
  return JSON.stringify(payload);
}

export function decodeWhatsAppInboxPayload(value: string): WhatsAppInboxPayload | null {
  try {
    const parsed = JSON.parse(value) as WhatsAppInboxPayload;
    if (!parsed?.phone || !parsed?.messageId || !parsed?.direction) return null;
    return parsed;
  } catch {
    return null;
  }
}

function incomingText(message: any) {
  const type = String(message?.type || "unknown");
  if (type === "text") return String(message?.text?.body || "").trim();
  if (type === "button") return String(message?.button?.text || message?.button?.payload || "Button reply").trim();
  if (type === "interactive") return String(message?.interactive?.button_reply?.title || message?.interactive?.list_reply?.title || message?.interactive?.button_reply?.id || message?.interactive?.list_reply?.id || "Interactive reply").trim();
  if (type === "document") return String(message?.document?.caption || message?.document?.filename || "Document received").trim();
  if (type === "image") return String(message?.image?.caption || "Image received").trim();
  if (type === "video") return String(message?.video?.caption || "Video received").trim();
  if (type === "audio") return "Audio received";
  if (type === "sticker") return "Sticker received";
  if (type === "location") {
    const name = String(message?.location?.name || "Location received");
    const address = String(message?.location?.address || "");
    return [name, address].filter(Boolean).join(" · ");
  }
  if (type === "contacts") return "Contact card received";
  return `${type.replaceAll("_", " ")} received`;
}

function incomingMedia(message: any) {
  const type = String(message?.type || "");
  const media = message?.[type];
  if (!media || typeof media !== "object") return {};
  return {
    mediaId: media.id ? String(media.id) : undefined,
    filename: media.filename ? String(media.filename) : undefined,
    caption: media.caption ? String(media.caption) : undefined,
  };
}

async function findClientByPhone(phone: string) {
  const clients = await prisma.client.findMany({
    where: { archivedAt: null, OR: [{ whatsapp: { not: null } }, { phone: { not: null } }] },
    select: { id: true, firstName: true, lastName: true, whatsapp: true, phone: true, ownerId: true },
  });
  return clients.find((client) => {
    const wa = normalizeWhatsAppPhone(client.whatsapp || "");
    const tel = normalizeWhatsAppPhone(client.phone || "");
    return Boolean(phone && (wa === phone || tel === phone));
  }) || null;
}

async function notificationRecipients(client: { ownerId: string | null } | null) {
  const ids = new Set<string>();
  if (client?.ownerId) ids.add(client.ownerId);
  const staff = await prisma.user.findMany({ where: { status: "ACTIVE", role: { in: ["SUPER_ADMIN", "DIRECTOR", "ADMIN", "MANAGER"] } }, select: { id: true } });
  staff.forEach((u) => ids.add(u.id));
  return [...ids];
}

export async function recordOutgoingWhatsAppMessage(input: {
  phone: string;
  messageId?: string | null;
  type: string;
  text: string;
  clientId?: string | null;
  caseId?: string | null;
  userId?: string | null;
  mediaId?: string;
  filename?: string;
  caption?: string;
  timestamp?: Date | string;
}) {
  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) return null;
  if (input.clientId && await isClientCommunicationBanned(input.clientId)) return null;
  const messageId = String(input.messageId || `local-${Date.now()}`).trim();
  const duplicate = await prisma.activity.findFirst({ where: { resourceType: "WhatsAppConversation", resourceId: phone, message: { contains: messageId } }, select: { id: true } });
  if (duplicate) return duplicate;
  const timestamp = input.timestamp instanceof Date ? input.timestamp.toISOString() : input.timestamp ? new Date(input.timestamp).toISOString() : new Date().toISOString();
  return prisma.activity.create({
    data: {
      type: "WHATSAPP_OUTBOUND_REPLY",
      message: encodeWhatsAppInboxPayload({ direction: "OUTBOUND", phone, messageId, type: input.type || "text", text: String(input.text || "").trim() || "Message WhatsApp envoyé", mediaId: input.mediaId, filename: input.filename, caption: input.caption, timestamp }),
      userId: input.userId || undefined,
      clientId: input.clientId || undefined,
      caseId: input.caseId || undefined,
      resourceType: "WhatsAppConversation",
      resourceId: phone,
    },
  });
}

export async function recordIncomingWhatsAppMessage(input: { message: any; contactName?: string }) {
  const phone = normalizeWhatsAppPhone(input.message?.from || "");
  const messageId = String(input.message?.id || "").trim();
  if (!phone || !messageId) return null;
  const duplicate = await prisma.activity.findFirst({ where: { resourceType: "WhatsAppConversation", resourceId: phone, message: { contains: messageId } }, select: { id: true } });
  if (duplicate) return duplicate;

  const client = await findClientByPhone(phone);
  if (client && await isClientCommunicationBanned(client.id)) {
    await prisma.activity.create({
      data: { type: "CLIENT_COMMUNICATION_BLOCKED_INBOUND", message: `Inbound WhatsApp blocked from +${phone} · ${messageId}`, clientId: client.id, resourceType: "Client", resourceId: client.id },
    }).catch(() => null);
    return null;
  }

  const activeCase = client ? await prisma.case.findFirst({ where: { clientId: client.id, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL"] } }, orderBy: { updatedAt: "desc" }, select: { id: true } }) : null;
  const type = String(input.message?.type || "unknown");
  const text = incomingText(input.message);
  const media = incomingMedia(input.message);
  const timestampSeconds = Number(input.message?.timestamp || 0);
  const timestamp = timestampSeconds > 0 ? new Date(timestampSeconds * 1000).toISOString() : new Date().toISOString();
  const payload: WhatsAppInboxPayload = { direction: "INBOUND", phone, contactName: input.contactName || undefined, messageId, type, text, ...media, timestamp };
  const activity = await prisma.activity.create({ data: { type: "WHATSAPP_INBOUND_UNREAD", message: encodeWhatsAppInboxPayload(payload), clientId: client?.id, caseId: activeCase?.id, resourceType: "WhatsAppConversation", resourceId: phone } });
  const recipients = await notificationRecipients(client);
  const sender = client ? `${client.firstName} ${client.lastName}` : (input.contactName || `+${phone}`);
  if (recipients.length) await prisma.notification.createMany({ data: recipients.map((userId) => ({ userId, type: "WHATSAPP_INBOUND", title: `New WhatsApp message · ${sender}`, body: text.slice(0, 500) })) });
  return activity;
}
