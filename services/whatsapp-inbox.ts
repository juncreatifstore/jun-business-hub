"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { encodeWhatsAppInboxPayload, normalizeWhatsAppPhone } from "@/lib/whatsapp-inbox";

function assertStaff(role: string) {
  if (role === "CLIENT") throw new Error("Forbidden");
}

export async function markWhatsAppConversationRead(phone: string) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return;
  await prisma.activity.updateMany({
    where: {
      resourceType: "WhatsAppConversation",
      resourceId: normalized,
      type: "WHATSAPP_INBOUND_UNREAD",
    },
    data: { type: "WHATSAPP_INBOUND_READ" },
  });
  revalidatePath("/app/whatsapp");
}

export async function replyWhatsAppConversation(phone: string, formData: FormData) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = normalizeWhatsAppPhone(phone);
  const body = String(formData.get("message") || "").trim();
  if (!normalized) throw new Error("Invalid WhatsApp number");
  if (!body) throw new Error("Message is empty");

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

  await prisma.activity.updateMany({
    where: { resourceType: "WhatsAppConversation", resourceId: normalized, type: "WHATSAPP_INBOUND_UNREAD" },
    data: { type: "WHATSAPP_INBOUND_READ" },
  });

  revalidatePath("/app/whatsapp");
}
