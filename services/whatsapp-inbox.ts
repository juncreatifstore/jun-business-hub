"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { decodeWhatsAppInboxPayload, encodeWhatsAppInboxPayload, normalizeWhatsAppPhone } from "@/lib/whatsapp-inbox";

function assertStaff(role: string) {
  if (role === "CLIENT") throw new Error("Forbidden");
}

function statusKey(phone: string) {
  return `whatsapp.inbox.status.${phone}`;
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
  revalidatePath("/app/whatsapp/inbox");
}

export async function setWhatsAppConversationStatus(phone: string, status: "OPEN" | "WAITING" | "RESOLVED") {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) throw new Error("Invalid WhatsApp number");

  await prisma.appSetting.upsert({
    where: { key: statusKey(normalized) },
    create: { key: statusKey(normalized), value: status },
    update: { value: status },
  });

  if (status === "RESOLVED") {
    await prisma.activity.updateMany({
      where: {
        resourceType: "WhatsAppConversation",
        resourceId: normalized,
        type: "WHATSAPP_INBOUND_UNREAD",
      },
      data: { type: "WHATSAPP_INBOUND_READ" },
    });
  }

  revalidatePath("/app/whatsapp/inbox");
}

export async function replyWhatsAppConversation(phone: string, formData: FormData) {
  const user = await requireUser();
  assertStaff(user.role);
  const normalized = normalizeWhatsAppPhone(phone);
  const body = String(formData.get("message") || "").trim();
  if (!normalized) throw new Error("Invalid WhatsApp number");
  if (!body) throw new Error("Message is empty");

  // Protect operators from accidental double-click / rapid resubmission.
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
    revalidatePath("/app/whatsapp/inbox");
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

  revalidatePath("/app/whatsapp");
  revalidatePath("/app/whatsapp/inbox");
}
