"use server";

import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/hash";
import { signatureRecipients, signatureRequestMeta, signatureRecipientsPayload } from "@/lib/signature-recipients";
import { createVerifiedNativeSigningToken, nativeSigningExpiry, verifyNativeSigningToken } from "@/lib/native-signature";
import { completeJunNativeSignature, declineJunNativeSignature } from "@/services/native-signatures";
import { redirect } from "next/navigation";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function otpDigest(requestId: string, email: string, code: string) {
  const pepper = process.env.AUTH_SECRET ?? "jun-dev-secret-do-not-use-in-production";
  return sha256(`${pepper}|${requestId}|${email.toLowerCase()}|${code}`);
}

function requestExpiry(metaExpiresAt: string | undefined, sentAt: Date | null) {
  if (metaExpiresAt) {
    const parsed = new Date(metaExpiresAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return nativeSigningExpiry(sentAt ?? new Date());
}

async function signingContext(token: string) {
  const payload = await verifyNativeSigningToken(token);
  if (!payload) return null;
  const request = await prisma.signatureRequest.findUnique({ where: { id: payload.requestId }, include: { document: true } });
  if (!request || request.provider !== "JUN_NATIVE" || !["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status)) return null;
  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const index = recipients.findIndex((r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order);
  if (index < 0) return null;
  return { payload, request, recipients, index, recipient: recipients[index], meta: signatureRequestMeta(request.recipients) };
}

export async function sendNativeVerificationCode(token: string): Promise<void> {
  const ctx = await signingContext(token);
  if (!ctx) redirect(`/sign/${encodeURIComponent(token)}?error=request_not_available`);
  const { request, recipients, index, recipient, meta } = ctx;
  if (recipient.signedAt || recipient.declinedAt) redirect(`/sign/${encodeURIComponent(token)}?error=request_not_available`);

  const expiresAt = requestExpiry(meta.expiresAt, request.sentAt);
  if (expiresAt.getTime() <= Date.now()) redirect(`/sign/${encodeURIComponent(token)}?error=request_expired`);

  const lastSent = recipient.otpSentAt ? new Date(recipient.otpSentAt).getTime() : 0;
  if (lastSent && Date.now() - lastSent < OTP_RESEND_MS) redirect(`/sign/${encodeURIComponent(token)}?error=otp_wait`);

  const account = await prisma.mailAccount.findFirst({ orderBy: { createdAt: "asc" } });
  if (!account) redirect(`/sign/${encodeURIComponent(token)}?error=verification_email_unavailable`);

  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  recipients[index] = {
    ...recipient,
    otpHash: otpDigest(request.id, recipient.email, code),
    otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
    otpSentAt: now.toISOString(),
    otpAttempts: 0,
  };
  await prisma.signatureRequest.update({
    where: { id: request.id },
    data: { recipients: signatureRecipientsPayload(recipients, meta) as never },
  });

  const { gmailSend } = await import("@/lib/google/gmail");
  await gmailSend(account.id, {
    to: recipient.email,
    subject: `Your JUN Secure Sign verification code — ${request.document.documentId}`,
    text: `Hello ${recipient.name},\n\nYour JUN Secure Sign verification code is:\n\n${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\nDocument: ${request.document.documentId} — ${request.document.title}\n\nIf you did not request this code, do not continue with the signature.\n\nJUN CREATIF AND TRAVEL LLC`,
  });
  await audit({ userId: null, action: "JUN_NATIVE_OTP_SENT", resourceType: "SignatureRequest", resourceId: request.id, after: { signer: recipient.email, sentAt: now.toISOString(), expiresInMinutes: 10 } }).catch(() => undefined);
  redirect(`/sign/${encodeURIComponent(token)}?otp=sent`);
}

export async function verifyNativeVerificationCode(token: string, formData: FormData): Promise<void> {
  const ctx = await signingContext(token);
  if (!ctx) redirect(`/sign/${encodeURIComponent(token)}?error=request_not_available`);
  const { request, recipients, index, recipient, meta, payload } = ctx;
  const code = String(formData.get("otp") ?? "").replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) redirect(`/sign/${encodeURIComponent(token)}?error=otp_invalid`);
  if (!recipient.otpHash || !recipient.otpExpiresAt) redirect(`/sign/${encodeURIComponent(token)}?error=otp_send_first`);
  if ((recipient.otpAttempts ?? 0) >= OTP_MAX_ATTEMPTS) redirect(`/sign/${encodeURIComponent(token)}?error=otp_locked`);
  if (new Date(recipient.otpExpiresAt).getTime() <= Date.now()) redirect(`/sign/${encodeURIComponent(token)}?error=otp_expired`);

  if (otpDigest(request.id, recipient.email, code) !== recipient.otpHash) {
    recipients[index] = { ...recipient, otpAttempts: (recipient.otpAttempts ?? 0) + 1 };
    await prisma.signatureRequest.update({ where: { id: request.id }, data: { recipients: signatureRecipientsPayload(recipients, meta) as never } });
    redirect(`/sign/${encodeURIComponent(token)}?error=otp_invalid`);
  }

  const now = new Date();
  recipients[index] = {
    ...recipient,
    verifiedAt: now.toISOString(),
    otpHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
  };
  await prisma.signatureRequest.update({ where: { id: request.id }, data: { recipients: signatureRecipientsPayload(recipients, meta) as never } });
  await audit({ userId: null, action: "JUN_NATIVE_SIGNER_EMAIL_VERIFIED", resourceType: "SignatureRequest", resourceId: request.id, after: { signer: recipient.email, order: recipient.order, verifiedAt: now.toISOString() } }).catch(() => undefined);

  const expiry = requestExpiry(meta.expiresAt, request.sentAt);
  const verifiedToken = await createVerifiedNativeSigningToken({ requestId: payload.requestId, email: payload.email, order: payload.order }, expiry);
  redirect(`/sign/${encodeURIComponent(verifiedToken)}?verified=1`);
}

async function requireVerifiedToken(token: string) {
  const payload = await verifyNativeSigningToken(token);
  if (!payload?.verified) redirect(`/sign/${encodeURIComponent(token)}?error=verification_required`);
  const request = await prisma.signatureRequest.findUnique({ where: { id: payload.requestId } });
  if (!request) redirect(`/sign/${encodeURIComponent(token)}?error=request_not_available`);
  const recipient = signatureRecipients(request.recipients).find((r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order);
  if (!recipient?.verifiedAt) redirect(`/sign/${encodeURIComponent(token)}?error=verification_required`);
}

export async function completeVerifiedJunNativeSignature(token: string, formData: FormData): Promise<void> {
  await requireVerifiedToken(token);
  return completeJunNativeSignature(token, formData);
}

export async function declineVerifiedJunNativeSignature(token: string, formData: FormData): Promise<void> {
  await requireVerifiedToken(token);
  return declineJunNativeSignature(token, formData);
}
