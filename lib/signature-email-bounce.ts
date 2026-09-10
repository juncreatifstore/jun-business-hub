import "server-only";

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  signatureRecipients,
  signatureRequestMeta,
  signatureRecipientsPayload,
} from "@/lib/signature-recipients";

const BOUNCE_SEND_ACTIONS = [
  "JUN_NATIVE_OTP_SENT",
  "JUN_NATIVE_INVITATION_RESENT",
  "JUN_NATIVE_COMPLETION_EMAIL_SENT",
] as const;

function normalizeEmail(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isDeliveryFailure(input: { subject: string; from: string; body: string; snippet?: string | null }) {
  const text = `${input.subject}\n${input.from}\n${input.body}\n${input.snippet ?? ""}`.toLowerCase();
  return (
    text.includes("mail delivery subsystem") ||
    text.includes("mailer-daemon") ||
    text.includes("delivery status notification (failure)") ||
    text.includes("address not found") ||
    text.includes("adresse introuvable") ||
    text.includes("550 5.1.1") ||
    text.includes("does not exist") ||
    text.includes("couldn't be delivered") ||
    text.includes("wasn't delivered")
  );
}

function smtpCode(text: string) {
  return text.match(/\b([245]\d\d\s+[245]\.\d\.\d)\b/i)?.[1] ?? text.match(/\b([245]\d\d)\b/)?.[1] ?? null;
}

function bounceReason(text: string) {
  const lower = text.toLowerCase();
  if (
    lower.includes("550 5.1.1") ||
    lower.includes("does not exist") ||
    lower.includes("address not found") ||
    lower.includes("adresse introuvable")
  )
    return "Adresse email inexistante ou introuvable";
  if (lower.includes("mailbox full") || lower.includes("quota exceeded"))
    return "Boîte du destinataire pleine";
  if (lower.includes("blocked") || lower.includes("rejected"))
    return "Message rejeté par le serveur destinataire";
  return "Le serveur destinataire n’a pas pu livrer l’email";
}

export async function detectSignatureEmailBounce(input: {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  subject: string;
  from: string;
  body: string;
  snippet?: string | null;
  receivedAt: Date;
}) {
  if (!isDeliveryFailure(input)) return null;

  const fullText = `${input.subject}\n${input.from}\n${input.body}\n${input.snippet ?? ""}`;
  const lowerText = fullText.toLowerCase();
  const recent = await prisma.auditLog.findMany({
    where: {
      resourceType: "SignatureRequest",
      action: { in: [...BOUNCE_SEND_ACTIONS] },
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  const matched = recent.find((log) => {
    const after = objectValue(log.after);
    const email = normalizeEmail(after.recipientEmail ?? after.signer);
    if (!email || !lowerText.includes(email)) return false;
    const mailAccountId = String(after.mailAccountId ?? "");
    return !mailAccountId || mailAccountId === input.accountId;
  });
  if (!matched?.resourceId) return null;

  const after = objectValue(matched.after);
  const recipientEmail = normalizeEmail(after.recipientEmail ?? after.signer);
  if (!recipientEmail) return null;

  const existing = await prisma.auditLog.findMany({
    where: {
      resourceType: "SignatureRequest",
      resourceId: matched.resourceId,
      action: "JUN_NATIVE_OTP_BOUNCED",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (existing.some((log) => String(objectValue(log.after).gmailMessageId ?? "") === input.gmailMessageId)) {
    return { requestId: matched.resourceId, recipientEmail, alreadyRecorded: true };
  }

  const request = await prisma.signatureRequest.findUnique({
    where: { id: matched.resourceId },
    include: { document: true },
  });
  if (!request) return null;

  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const meta = signatureRequestMeta(request.recipients);
  const index = recipients.findIndex((r) => normalizeEmail(r.email) === recipientEmail);
  if (index >= 0 && !recipients[index].signedAt && !recipients[index].declinedAt) {
    recipients[index] = {
      ...recipients[index],
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      otpLockedUntil: null,
    };
    await prisma.signatureRequest.update({
      where: { id: request.id },
      data: { recipients: signatureRecipientsPayload(recipients, meta) as never },
    });
  }

  const code = smtpCode(fullText);
  const reason = bounceReason(fullText);
  await audit({
    userId: null,
    action: "JUN_NATIVE_OTP_BOUNCED",
    resourceType: "SignatureRequest",
    resourceId: request.id,
    after: {
      signer: recipientEmail,
      recipientEmail,
      fromEmail: input.accountEmail,
      mailAccountId: input.accountId,
      providerStatus: "BOUNCED",
      smtpCode: code,
      reason,
      gmailMessageId: input.gmailMessageId,
      detectedAt: input.receivedAt.toISOString(),
    },
  }).catch(() => undefined);

  if (request.document.clientId) {
    await prisma.activity
      .create({
        data: {
          clientId: request.document.clientId,
          caseId: request.document.caseId,
          type: "SIGNATURE_OTP_EMAIL_BOUNCED",
          message: `OTP non livré à ${recipientEmail} · ${reason}${code ? ` · ${code}` : ""}`,
          resourceType: "SignatureRequest",
          resourceId: request.id,
        },
      })
      .catch(() => undefined);
  }

  return { requestId: request.id, recipientEmail, alreadyRecorded: false };
}
