"use server";

import { PDFDocument } from "pdf-lib";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { getWhatsAppConfig, sendWhatsAppGeneralTemplate, sendWhatsAppText } from "@/lib/whatsapp";
import { recordOutgoingWhatsAppMessage } from "@/lib/whatsapp-inbox";
import { isClientCommunicationBanned } from "@/lib/client-communication-policy";
import { nativeSigningExpiry, nativeSigningUrl } from "@/lib/native-signature";
import {
  signatureRecipients,
  signatureRecipientsPayload,
  signatureRequestMeta,
  type SignatureRecipient,
} from "@/lib/signature-recipients";

const ACTIVE_STATUSES = ["READY_FOR_SIGNATURE", "SENT", "VIEWED", "PARTIALLY_SIGNED"] as const;

function documentPath(documentId: string, message: string, error = false) {
  return `/app/documents/${documentId}?${error ? "toast_error" : "toast"}=${encodeURIComponent(message)}`;
}

function cleanError(error: unknown) {
  const raw = error instanceof Error ? error.message : "WhatsApp signature delivery failed";
  return raw.replace(/\s+/g, " ").slice(0, 700);
}

async function officialPdf(documentId: string, finalPdfKey: string | null) {
  if (finalPdfKey) return storage().download(finalPdfKey);
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { client: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc) throw new Error("Document not found");
  const { renderDocumentPdf } = await import("@/services/pdf");
  return Buffer.from(await renderDocumentPdf({
    documentId: doc.documentId,
    title: doc.title,
    type: doc.type,
    status: doc.status,
    html: doc.versions[0]?.content ?? "",
    clientName: doc.client ? `${doc.client.firstName} ${doc.client.lastName}` : null,
  }));
}

async function defaultClientFields(documentId: string, finalPdfKey: string | null) {
  const bytes = await officialPdf(documentId, finalPdfKey);
  const pdf = await PDFDocument.load(bytes);
  const page = Math.max(1, pdf.getPageCount());
  return [
    { type: "SIGNATURE" as const, page, x: 72, y: 675, width: 180, height: 50 },
    { type: "NAME" as const, page, x: 72, y: 730, width: 180, height: 26 },
    { type: "DATE_SIGNED" as const, page, x: 310, y: 690, width: 120, height: 26 },
  ];
}

async function voidLegacyMockRequest(requestId: string, recipients: SignatureRecipient[], meta: ReturnType<typeof signatureRequestMeta>) {
  await prisma.signatureRequest.update({
    where: { id: requestId },
    data: {
      status: "VOIDED",
      recipients: signatureRecipientsPayload(recipients, {
        ...meta,
        cancelledAt: new Date().toISOString(),
        cancelReason: "Replaced by a client-only JUN Secure Sign request delivered through WhatsApp.",
      }) as never,
    },
  });
}

async function deliverSignatureMessage(input: {
  to: string;
  clientName: string;
  documentTitle: string;
  documentReference: string;
  signingUrl: string;
  freeTextMessage: string;
}) {
  const config = await getWhatsAppConfig();

  // Business-initiated free-text messages fail outside Meta's 24-hour customer-service window
  // with error 131047. Prefer the approved JUN notification template whenever it is configured.
  // The secure URL is intentionally carried in the document_reference parameter so WhatsApp
  // delivers the clickable link even when the customer has not replied recently.
  if (config.defaultTemplate) {
    const result = await sendWhatsAppGeneralTemplate({
      to: input.to,
      templateName: config.defaultTemplate,
      languageCode: config.languageCode,
      clientName: input.clientName,
      documentLabel: `Signature électronique · ${input.documentTitle}`,
      documentReference: `${input.documentReference} · ${input.signingUrl}`,
    });
    return { result, mode: "APPROVED_TEMPLATE" as const, template: config.defaultTemplate };
  }

  const result = await sendWhatsAppText(input.to, input.freeTextMessage);
  return { result, mode: "FREE_TEXT" as const, template: null };
}

/**
 * Creates (or reuses) a CLIENT-only JUN Secure Sign request and delivers the
 * revocable signing URL through the configured Meta WhatsApp Business account.
 * The company representative is deliberately not added as a signer.
 */
export async function sendClientSignatureViaWhatsApp(documentId: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      client: true,
      signatures: {
        where: { status: { in: [...ACTIVE_STATUSES] } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!doc) redirect("/app/documents?toast_error=Document not found");
  if (doc.status !== "FINAL") {
    redirect(documentPath(doc.id, "Finalize the document before requesting the client's signature by WhatsApp.", true));
  }
  if (!doc.client) {
    redirect(documentPath(doc.id, "This document is not linked to a client.", true));
  }
  if (await isClientCommunicationBanned(doc.client.id)) {
    redirect(documentPath(doc.id, "Client banni — la demande de signature WhatsApp est bloquée.", true));
  }

  const to = String(doc.client.whatsapp || doc.client.phone || "").trim();
  if (!to) {
    redirect(documentPath(doc.id, "Ajoutez d'abord un numéro WhatsApp au dossier du client.", true));
  }
  const clientEmail = String(doc.client.email || "").trim().toLowerCase();
  if (!clientEmail) {
    redirect(documentPath(doc.id, "Ajoutez aussi l'adresse e-mail du client. JUN Secure Sign utilise un code de vérification envoyé à cet e-mail avant d'afficher le document.", true));
  }

  const clientName = `${doc.client.firstName} ${doc.client.lastName}`.trim();
  let request: (typeof doc.signatures)[number] | null = doc.signatures.length > 0 ? doc.signatures[0] : null;
  let newlyCreated = false;

  if (request) {
    const existingRecipients = signatureRecipients(request.recipients);
    const existingMeta = signatureRequestMeta(request.recipients);

    if (request.provider === "MOCK") {
      await voidLegacyMockRequest(request.id, existingRecipients, existingMeta);
      await audit({
        userId: user.id,
        action: "SIGNATURE_LEGACY_MOCK_REPLACED",
        resourceType: "SignatureRequest",
        resourceId: request.id,
        after: { documentId: doc.documentId, replacementChannel: "WHATSAPP" },
      }).catch(() => undefined);
      request = null;
    } else if (request.provider !== "JUN_NATIVE" && request.status !== "READY_FOR_SIGNATURE") {
      redirect(documentPath(doc.id, `An active ${request.provider} signature request already exists. Void or complete it before starting a WhatsApp signing request.`, true));
    } else {
      const clientRecipient = existingRecipients.find((recipient) =>
        recipient.role === "CLIENT" || recipient.email.toLowerCase() === clientEmail
      );
      if (!clientRecipient || existingRecipients.length !== 1) {
        redirect(documentPath(doc.id, "The active signature request is not client-only. Void it first so JUN can create the new client-only WhatsApp request.", true));
      }
      if (!(clientRecipient.fields ?? []).some((field) => field.type === "SIGNATURE")) {
        redirect(documentPath(doc.id, "The prepared client signer has no signature field. Open the signature request and place a Signature field first.", true));
      }

      const expiresAt = existingMeta.expiresAt ? new Date(existingMeta.expiresAt) : nativeSigningExpiry(request.sentAt ?? new Date());
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        await prisma.signatureRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
        request = null;
      }
    }
  }

  if (!request) {
    const fields = await defaultClientFields(doc.id, doc.finalPdfKey);
    const recipient: SignatureRecipient = {
      name: clientName,
      email: clientEmail,
      order: 1,
      role: "CLIENT",
      signedAt: null,
      linkVersion: 1,
      fields,
    };
    const expiresAt = nativeSigningExpiry(new Date());
    request = await prisma.signatureRequest.create({
      data: {
        documentId: doc.id,
        provider: "JUN_NATIVE",
        providerEnvelopeId: null,
        status: "READY_FOR_SIGNATURE",
        recipients: signatureRecipientsPayload([recipient], {
          message: "Signature du client demandée par WhatsApp.",
          expiresAt: expiresAt.toISOString(),
        }) as never,
        createdById: user.id,
      },
    });
    newlyCreated = true;
  }

  let recipients = signatureRecipients(request.recipients);
  const recipientIndex = recipients.findIndex((recipient) =>
    recipient.role === "CLIENT" || recipient.email.toLowerCase() === clientEmail
  );
  if (recipientIndex < 0) {
    if (newlyCreated) await prisma.signatureRequest.delete({ where: { id: request.id } }).catch(() => undefined);
    redirect(documentPath(doc.id, "Client signer could not be prepared.", true));
  }

  const meta = signatureRequestMeta(request.recipients);
  const now = new Date();
  const expiresAt = meta.expiresAt && new Date(meta.expiresAt).getTime() > Date.now()
    ? new Date(meta.expiresAt)
    : nativeSigningExpiry(now);

  await prisma.signatureRequest.update({
    where: { id: request.id },
    data: {
      provider: "JUN_NATIVE",
      status: request.status === "READY_FOR_SIGNATURE" ? "SENT" : request.status,
      sentAt: request.sentAt ?? now,
      recipients: signatureRecipientsPayload(recipients, { ...meta, expiresAt: expiresAt.toISOString() }) as never,
    },
  });

  const recipient = recipients[recipientIndex];
  const signingUrl = await nativeSigningUrl(request.id, recipient.email, recipient.order, expiresAt, recipient.linkVersion ?? 1);
  const reminder = request.status !== "READY_FOR_SIGNATURE";
  const message = [
    `Bonjour ${doc.client.firstName},`,
    "",
    reminder
      ? `Rappel : le document « ${doc.title} » (${doc.documentId}) attend votre signature électronique.`
      : `JUN CREATIF AND TRAVEL LLC vous invite à lire et signer électroniquement le document « ${doc.title} » (${doc.documentId}).`,
    "",
    "Lien sécurisé de signature :",
    signingUrl,
    "",
    "Pour votre sécurité, JUN vérifiera votre identité avant d'afficher le document. Le document officiel reste authentifiable en ligne grâce à son QR code, son identifiant et son empreinte d'intégrité.",
    "",
    `Ce lien expire le ${expiresAt.toISOString().slice(0, 10)}.`,
    "",
    "JUN CREATIF AND TRAVEL LLC",
  ].join("\n");

  try {
    const delivery = await deliverSignatureMessage({
      to,
      clientName,
      documentTitle: doc.title,
      documentReference: doc.documentId,
      signingUrl,
      freeTextMessage: message,
    });
    const messageId = delivery.result.messages?.[0]?.id ?? null;
    recipients[recipientIndex] = { ...recipient, invitationSentAt: now.toISOString() };
    await prisma.signatureRequest.update({
      where: { id: request.id },
      data: {
        provider: "JUN_NATIVE",
        status: request.status === "READY_FOR_SIGNATURE" ? "SENT" : request.status,
        sentAt: request.sentAt ?? now,
        recipients: signatureRecipientsPayload(recipients, {
          ...meta,
          expiresAt: expiresAt.toISOString(),
          whatsappDeliveryMode: delivery.mode,
          whatsappMessageId: messageId,
        } as never) as never,
      },
    });

    await audit({
      userId: user.id,
      action: reminder ? "SIGNATURE_WHATSAPP_REMINDER_ACCEPTED" : "SIGNATURE_WHATSAPP_ACCEPTED",
      resourceType: "SignatureRequest",
      resourceId: request.id,
      after: {
        documentId: doc.documentId,
        clientId: doc.client.id,
        to,
        messageId,
        provider: "JUN_NATIVE",
        signerRole: "CLIENT",
        deliveryMode: delivery.mode,
        template: delivery.template,
        expiresAt: expiresAt.toISOString(),
      },
    });
    await logActivity({
      userId: user.id,
      type: "SIGNATURE_REQUESTED",
      message: `Client signature invitation for ${doc.documentId} accepted by Meta via ${delivery.mode}${messageId ? ` · ${messageId}` : ""}`,
      clientId: doc.client.id,
      caseId: doc.caseId,
      resourceType: "SignatureRequest",
      resourceId: request.id,
    });
    await recordOutgoingWhatsAppMessage({
      phone: to,
      messageId,
      type: "text",
      text: `Demande de signature · ${doc.title} (${doc.documentId}) · ${signingUrl}`,
      clientId: doc.client.id,
      caseId: doc.caseId,
      userId: user.id,
    }).catch(() => undefined);
  } catch (error) {
    if (newlyCreated) {
      await prisma.signatureRequest.delete({ where: { id: request.id } }).catch(() => undefined);
    } else if (request.status === "READY_FOR_SIGNATURE") {
      await prisma.signatureRequest.update({
        where: { id: request.id },
        data: { status: "READY_FOR_SIGNATURE", sentAt: request.sentAt },
      }).catch(() => undefined);
    }
    await audit({
      userId: user.id,
      action: "SIGNATURE_WHATSAPP_SEND_FAILED",
      resourceType: "Document",
      resourceId: doc.id,
      after: { documentId: doc.documentId, clientId: doc.client.id, error: cleanError(error) },
    }).catch(() => undefined);
    redirect(documentPath(doc.id, `WhatsApp n'a pas accepté la demande de signature : ${cleanError(error)}`, true));
  }

  revalidatePath(`/app/documents/${doc.id}`);
  revalidatePath(`/app/signatures/${request.id}`);
  revalidatePath("/app/signatures");
  revalidatePath("/app/whatsapp/inbox");
  redirect(documentPath(doc.id, `Invitation de signature acceptée par Meta pour ${clientName}. JUN suivra ensuite le statut Delivered / Read / Failed.`));
}
