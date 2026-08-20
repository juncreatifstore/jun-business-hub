"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { nativeSigningUrl } from "@/lib/native-signature";
import { signatureRecipients, signatureRequestMeta, signatureRecipientsPayload, type SignatureRecipient } from "@/lib/signature-recipients";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const ACTIVE = ["SENT", "VIEWED", "PARTIALLY_SIGNED"] as const;

function clean(value: FormDataEntryValue | null, max = 200) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requestExpiry(meta: ReturnType<typeof signatureRequestMeta>, sentAt: Date | null) {
  const parsed = meta.expiresAt ? new Date(meta.expiresAt) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  const base = sentAt ?? new Date();
  return new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000);
}

async function mailAccount() {
  return prisma.mailAccount.findFirst({ orderBy: { createdAt: "asc" } });
}

async function sendInvitation(input: { requestId: string; documentId: string; title: string; recipient: SignatureRecipient; expiresAt: Date; message?: string; subjectPrefix?: string }) {
  const account = await mailAccount();
  if (!account) throw new Error("Connect a Gmail account before sending signing invitations");
  const link = await nativeSigningUrl(input.requestId, input.recipient.email, input.recipient.order, input.expiresAt, input.recipient.linkVersion ?? 1);
  const { gmailSend } = await import("@/lib/google/gmail");
  await gmailSend(account.id, {
    to: input.recipient.email,
    subject: `${input.subjectPrefix ?? "Signature requested"} — ${input.title} (${input.documentId})`,
    text: `Hello ${input.recipient.name},\n\n${input.message?.trim() ? `${input.message.trim()}\n\n` : ""}A document is waiting for your secure electronic signature.\n\nReview & sign securely:\n${link}\n\nJUN will verify your email with a one-time code before displaying the document. This link expires on ${input.expiresAt.toISOString().slice(0, 10)}.\n\nJUN CREATIF AND TRAVEL LLC`,
  });
}

async function activeRequest(requestId: string) {
  const request = await prisma.signatureRequest.findUnique({ where: { id: requestId }, include: { document: true } });
  if (!request || request.provider !== "JUN_NATIVE" || !ACTIVE.includes(request.status as typeof ACTIVE[number])) return null;
  return request;
}

function currentUnsigned(recipients: SignatureRecipient[]) {
  return recipients.sort((a, b) => a.order - b.order).find((r) => !r.signedAt && !r.declinedAt);
}

export async function resendSigningInvitation(requestId: string, signerEmail: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await activeRequest(requestId);
  if (!request) redirect(`/app/signatures/${requestId}?toast_error=Request is not active`);
  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const recipient = recipients.find((r) => r.email.toLowerCase() === signerEmail.toLowerCase());
  const current = currentUnsigned(recipients);
  if (!recipient || recipient.signedAt || recipient.declinedAt || !current || current.email.toLowerCase() !== recipient.email.toLowerCase()) {
    redirect(`/app/signatures/${requestId}?toast_error=Only the current unsigned signer can receive an invitation`);
  }
  const meta = signatureRequestMeta(request.recipients);
  const expiresAt = requestExpiry(meta, request.sentAt);
  if (expiresAt.getTime() <= Date.now()) redirect(`/app/signatures/${requestId}?toast_error=Request has expired`);
  try {
    await sendInvitation({ requestId, documentId: request.document.documentId, title: request.document.title, recipient, expiresAt, message: meta.message, subjectPrefix: "Signing invitation resent" });
  } catch (error) {
    redirect(`/app/signatures/${requestId}?toast_error=${encodeURIComponent(error instanceof Error ? error.message : "Could not resend invitation")}`);
  }
  const sentAt = new Date().toISOString();
  const index = recipients.findIndex((r) => r.email.toLowerCase() === recipient.email.toLowerCase());
  recipients[index] = { ...recipient, invitationSentAt: sentAt };
  await prisma.signatureRequest.update({ where: { id: requestId }, data: { recipients: signatureRecipientsPayload(recipients, meta) as never } });
  await audit({ userId: user.id, action: "JUN_NATIVE_INVITATION_RESENT", resourceType: "SignatureRequest", resourceId: requestId, before: { signer: recipient.email }, after: { signer: recipient.email, sentAt } });
  revalidatePath(`/app/signatures/${requestId}`);
  redirect(`/app/signatures/${requestId}?toast=Signing invitation resent`);
}

export async function regenerateSignerLink(requestId: string, signerEmail: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await activeRequest(requestId);
  if (!request) redirect(`/app/signatures/${requestId}?toast_error=Request is not active`);
  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const index = recipients.findIndex((r) => r.email.toLowerCase() === signerEmail.toLowerCase());
  if (index < 0 || recipients[index].signedAt || recipients[index].declinedAt) redirect(`/app/signatures/${requestId}?toast_error=Signer link cannot be regenerated`);
  const current = currentUnsigned(recipients);
  if (!current || current.email.toLowerCase() !== recipients[index].email.toLowerCase()) redirect(`/app/signatures/${requestId}?toast_error=Only the current signer link can be regenerated`);
  const oldVersion = recipients[index].linkVersion ?? 1;
  recipients[index] = {
    ...recipients[index],
    linkVersion: oldVersion + 1,
    verifiedAt: null,
    viewedAt: null,
    otpHash: null,
    otpExpiresAt: null,
    otpSentAt: null,
    otpAttempts: 0,
    reminderSentAt: null,
  };
  const meta = signatureRequestMeta(request.recipients);
  await prisma.signatureRequest.update({ where: { id: requestId }, data: { recipients: signatureRecipientsPayload(recipients, meta) as never } });
  const expiresAt = requestExpiry(meta, request.sentAt);
  try {
    await sendInvitation({ requestId, documentId: request.document.documentId, title: request.document.title, recipient: recipients[index], expiresAt, message: meta.message, subjectPrefix: "New secure signing link" });
    recipients[index] = { ...recipients[index], invitationSentAt: new Date().toISOString() };
    await prisma.signatureRequest.update({ where: { id: requestId }, data: { recipients: signatureRecipientsPayload(recipients, meta) as never } });
  } catch (error) {
    await audit({ userId: user.id, action: "JUN_NATIVE_LINK_REGENERATED_EMAIL_FAILED", resourceType: "SignatureRequest", resourceId: requestId, before: { linkVersion: oldVersion }, after: { signer: recipients[index].email, linkVersion: oldVersion + 1, error: error instanceof Error ? error.message.slice(0, 250) : "unknown" } }).catch(() => undefined);
    redirect(`/app/signatures/${requestId}?toast_error=Link was revoked but the replacement email could not be sent`);
  }
  await audit({ userId: user.id, action: "JUN_NATIVE_LINK_REGENERATED", resourceType: "SignatureRequest", resourceId: requestId, before: { signer: signerEmail, linkVersion: oldVersion }, after: { signer: recipients[index].email, linkVersion: oldVersion + 1 } });
  revalidatePath(`/app/signatures/${requestId}`);
  redirect(`/app/signatures/${requestId}?toast=Old link revoked and new link sent`);
}

export async function replacePendingSigner(requestId: string, order: number, formData: FormData): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await activeRequest(requestId);
  if (!request) redirect(`/app/signatures/${requestId}?toast_error=Request is not active`);
  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const index = recipients.findIndex((r) => r.order === order);
  if (index < 0 || recipients[index].signedAt || recipients[index].declinedAt) redirect(`/app/signatures/${requestId}?toast_error=This signer can no longer be changed`);
  const name = clean(formData.get("name"), 160);
  const email = clean(formData.get("email"), 254).toLowerCase();
  const role = clean(formData.get("role"), 100) || null;
  if (name.length < 2 || !validEmail(email)) redirect(`/app/signatures/${requestId}?toast_error=Enter a valid signer name and email`);
  if (recipients.some((r, i) => i !== index && r.email.toLowerCase() === email)) redirect(`/app/signatures/${requestId}?toast_error=That email already belongs to another signer`);

  const before = recipients[index];
  const now = new Date().toISOString();
  recipients[index] = {
    ...before,
    name,
    email,
    role,
    linkVersion: (before.linkVersion ?? 1) + 1,
    viewedAt: null,
    verifiedAt: null,
    otpHash: null,
    otpExpiresAt: null,
    otpSentAt: null,
    otpAttempts: 0,
    reminderSentAt: null,
    invitationSentAt: null,
    replacedAt: now,
    replacedByEmail: email,
  };
  const meta = signatureRequestMeta(request.recipients);
  await prisma.signatureRequest.update({ where: { id: requestId }, data: { recipients: signatureRecipientsPayload(recipients, meta) as never } });

  const current = currentUnsigned(recipients);
  let sent = false;
  if (current?.order === order) {
    try {
      await sendInvitation({ requestId, documentId: request.document.documentId, title: request.document.title, recipient: recipients[index], expiresAt: requestExpiry(meta, request.sentAt), message: meta.message, subjectPrefix: "Updated signing invitation" });
      recipients[index] = { ...recipients[index], invitationSentAt: new Date().toISOString() };
      await prisma.signatureRequest.update({ where: { id: requestId }, data: { recipients: signatureRecipientsPayload(recipients, meta) as never } });
      sent = true;
    } catch {}
  }
  await audit({ userId: user.id, action: "JUN_NATIVE_SIGNER_REPLACED", resourceType: "SignatureRequest", resourceId: requestId, before: { name: before.name, email: before.email, role: before.role, order }, after: { name, email, role, order, linkVersion: recipients[index].linkVersion, invitationSent: sent } });
  revalidatePath(`/app/signatures/${requestId}`);
  redirect(`/app/signatures/${requestId}?toast=${sent ? "Signer updated and new invitation sent" : "Signer updated"}`);
}

export async function extendSignatureExpiration(requestId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await activeRequest(requestId);
  if (!request) redirect(`/app/signatures/${requestId}?toast_error=Request is not active`);
  const days = Math.floor(Number(formData.get("days") ?? 0));
  if (!Number.isInteger(days) || days < 1 || days > 30) redirect(`/app/signatures/${requestId}?toast_error=Extension must be between 1 and 30 days`);
  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const meta = signatureRequestMeta(request.recipients);
  const oldExpiry = requestExpiry(meta, request.sentAt);
  const base = oldExpiry.getTime() > Date.now() ? oldExpiry : new Date();
  const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  await prisma.signatureRequest.update({ where: { id: requestId }, data: { recipients: signatureRecipientsPayload(recipients, { ...meta, expiresAt: newExpiry.toISOString() }) as never } });

  const current = currentUnsigned(recipients);
  let invitationSent = false;
  if (current) {
    try {
      await sendInvitation({ requestId, documentId: request.document.documentId, title: request.document.title, recipient: current, expiresAt: newExpiry, message: meta.message, subjectPrefix: "Signing deadline extended" });
      const i = recipients.findIndex((r) => r.order === current.order);
      recipients[i] = { ...recipients[i], invitationSentAt: new Date().toISOString() };
      await prisma.signatureRequest.update({ where: { id: requestId }, data: { recipients: signatureRecipientsPayload(recipients, { ...meta, expiresAt: newExpiry.toISOString() }) as never } });
      invitationSent = true;
    } catch {}
  }
  await audit({ userId: user.id, action: "JUN_NATIVE_EXPIRATION_EXTENDED", resourceType: "SignatureRequest", resourceId: requestId, before: { expiresAt: oldExpiry.toISOString() }, after: { expiresAt: newExpiry.toISOString(), daysAdded: days, invitationSent } });
  revalidatePath(`/app/signatures/${requestId}`);
  redirect(`/app/signatures/${requestId}?toast=Signing deadline extended`);
}

export async function cancelNativeSignatureRequest(requestId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await activeRequest(requestId);
  if (!request) redirect(`/app/signatures/${requestId}?toast_error=Request is not active`);
  const reason = clean(formData.get("reason"), 500);
  if (reason.length < 3) redirect(`/app/signatures/${requestId}?toast_error=Enter a cancellation reason`);
  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const meta = signatureRequestMeta(request.recipients);
  const now = new Date();
  const revoked = recipients.map((r) => r.signedAt ? r : {
    ...r,
    linkVersion: (r.linkVersion ?? 1) + 1,
    otpHash: null,
    otpExpiresAt: null,
    otpSentAt: null,
    verifiedAt: null,
  });
  await prisma.signatureRequest.update({
    where: { id: requestId },
    data: {
      status: "VOIDED",
      completedAt: now,
      recipients: signatureRecipientsPayload(revoked, { ...meta, cancelledAt: now.toISOString(), cancelReason: reason }) as never,
    },
  });

  const account = await mailAccount();
  if (account) {
    const { gmailSend } = await import("@/lib/google/gmail");
    for (const recipient of recipients.filter((r) => r.invitationSentAt)) {
      await gmailSend(account.id, {
        to: recipient.email,
        subject: `Signature request cancelled — ${request.document.title} (${request.document.documentId})`,
        text: `Hello ${recipient.name},\n\nThe JUN Secure Sign request for ${request.document.documentId} has been cancelled.\n\nReason:\n${reason}\n\nAny previous signing link for this request is now invalid.\n\nJUN CREATIF AND TRAVEL LLC`,
      }).catch(() => undefined);
    }
  }
  await audit({ userId: user.id, action: "JUN_NATIVE_REQUEST_CANCELLED", resourceType: "SignatureRequest", resourceId: requestId, before: { status: request.status }, after: { status: "VOIDED", cancelledAt: now.toISOString(), reason, linksRevoked: revoked.filter((r) => !r.signedAt).length } });
  revalidatePath(`/app/signatures/${requestId}`);
  revalidatePath("/app/signatures");
  redirect(`/app/signatures/${requestId}?toast=Signature request cancelled and links revoked`);
}
