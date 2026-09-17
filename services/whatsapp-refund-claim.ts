"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createRefundClaimLink, claimUrl } from "@/lib/refund-claims";
import { isClientCommunicationBanned } from "@/lib/client-communication-policy";
import { normalizeWhatsAppPhone, recordOutgoingWhatsAppMessage } from "@/lib/whatsapp-inbox";
import { sendWhatsAppLink } from "@/lib/whatsapp-outreach";

function back(phone: string, key: "toast" | "toast_error", message: string): never {
  const params = new URLSearchParams();
  if (phone) params.set("phone", phone);
  params.set(key, message);
  redirect(`/app/whatsapp/inbox?${params.toString()}`);
}

/**
 * Creates (or reuses) a secure refund-claim link and sends it to the phone
 * of the currently opened WhatsApp Inbox conversation.
 *
 * sendWhatsAppLink() automatically uses free text while the 24 h customer
 * service window is open and the approved outreach template when it is closed.
 */
export async function sendRefundClaimFromWhatsAppInbox(phone: string): Promise<void> {
  const user = await assertPermission("REFUND_CREATE");
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) back("", "toast_error", "Numéro WhatsApp invalide");

  // Prefer the client already linked to this exact Inbox conversation. This
  // also works when the number in the conversation differs from the client's
  // main phone field (for example after a manual Inbox link).
  const linked = await prisma.activity.findFirst({
    where: {
      resourceType: "WhatsAppConversation",
      resourceId: normalized,
      clientId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { clientId: true },
  });
  let client = linked?.clientId
    ? await prisma.client.findFirst({
        where: { id: linked.clientId, archivedAt: null },
        select: { id: true, firstName: true, lastName: true, whatsapp: true, phone: true },
      })
    : null;

  // Fallback for older conversations created before explicit Inbox linking.
  if (!client) {
    const clients = await prisma.client.findMany({
      where: {
        archivedAt: null,
        OR: [{ whatsapp: { not: null } }, { phone: { not: null } }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        whatsapp: true,
        phone: true,
      },
    });
    client =
      clients.find((c) => {
        const wa = normalizeWhatsAppPhone(c.whatsapp || "");
        const tel = normalizeWhatsAppPhone(c.phone || "");
        return wa === normalized || tel === normalized;
      }) ?? null;
  }

  if (!client) {
    back(
      normalized,
      "toast_error",
      "Associez d’abord cette conversation WhatsApp à une fiche client avant d’envoyer le formulaire de remboursement.",
    );
  }
  if (await isClientCommunicationBanned(client.id)) {
    back(normalized, "toast_error", "Les communications sont bloquées pour ce client.");
  }

  // Avoid creating duplicate links when staff click the shortcut more than once.
  let claim = await prisma.refundClaim.findFirst({
    where: {
      clientId: client.id,
      status: "SENT",
      paymentId: null,
      caseId: null,
      submittedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, sentVia: true },
  });
  let created = false;
  if (!claim) {
    const fresh = await createRefundClaimLink({
      clientId: client.id,
      requestedById: user.id,
      language: "fr",
    });
    claim = { id: fresh.id, token: fresh.token, sentVia: fresh.sentVia };
    created = true;
  }

  const url = claimUrl(claim.token);
  const text = `Bonjour ${client.firstName}, pour soumettre votre demande de remboursement, veuillez remplir ce formulaire sécurisé : ${url}`;

  let delivery: Awaited<ReturnType<typeof sendWhatsAppLink>>;
  try {
    delivery = await sendWhatsAppLink({
      to: normalized,
      firstName: client.firstName,
      url,
      subject: "votre demande de remboursement",
      text,
      language: "fr",
      kind: "REFUND_CLAIM",
      recordId: claim.id,
      userId: user.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Envoi WhatsApp impossible";
    back(normalized, "toast_error", message);
  }

  if (!claim.sentVia.includes("WHATSAPP")) {
    await prisma.refundClaim
      .update({
        where: { id: claim.id },
        data: { sentVia: [...claim.sentVia, "WHATSAPP"] },
      })
      .catch(() => null);
  }

  await recordOutgoingWhatsAppMessage({
    phone: normalized,
    messageId: delivery.messageId,
    type: delivery.via === "TEMPLATE" ? "template" : "text",
    text,
    clientId: client.id,
    userId: user.id,
  }).catch(() => null);

  await audit({
    userId: user.id,
    action: created ? "REFUND_CLAIM_LINK_CREATED" : "REFUND_CLAIM_LINK_RESENT",
    resourceType: "RefundClaim",
    resourceId: claim.id,
    after: {
      clientId: client.id,
      channel: "WHATSAPP",
      phone: normalized,
      deliveryMode: delivery.via,
    },
  }).catch(() => null);

  revalidatePath("/app/whatsapp/inbox");
  revalidatePath("/app/finance/refunds");
  back(
    normalized,
    "toast",
    `${delivery.via === "TEMPLATE" ? "Modèle WhatsApp approuvé envoyé" : "Lien WhatsApp envoyé"} — formulaire de remboursement`,
  );
}
