"use server";

import { randomInt } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth";
import { sha256 } from "@/lib/hash";
import { resolveOtpSenderMailbox } from "@/lib/mail-otp-sender";
import {
  signatureRecipients,
  signatureRequestMeta,
  signatureRecipientsPayload,
} from "@/lib/signature-recipients";
import {
  createVerifiedNativeSigningToken,
  nativeSigningExpiry,
  verifyNativeSigningToken,
} from "@/lib/native-signature";
import { completeJunNativeSignature, declineJunNativeSignature } from "@/services/native-signatures";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_WINDOW_MS = 60 * 60 * 1000;
const OTP_MAX_SENDS_PER_WINDOW = 3;
const OTP_LOCK_MS = 15 * 60 * 1000;

function otpDigest(requestId: string, email: string, code: string) {
  const pepper = process.env.AUTH_SECRET ?? "jun-dev-secret-do-not-use-in-production";
  return sha256(`${pepper}|${requestId}|${email.toLowerCase()}|${code}`);
}

function auditObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function hasActiveBounce(requestId: string, email: string, otpSentAt?: string | null) {
  const logs = await prisma.auditLog.findMany({
    where: { resourceType: "SignatureRequest", resourceId: requestId, action: "JUN_NATIVE_OTP_BOUNCED" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const normalized = email.toLowerCase();
  const lastSentMs = otpSentAt ? new Date(otpSentAt).getTime() : 0;
  return logs.some((log) => {
    const after = auditObject(log.after);
    const bouncedEmail = String(after.recipientEmail ?? after.signer ?? "")
      .trim()
      .toLowerCase();
    return bouncedEmail === normalized && (!lastSentMs || log.createdAt.getTime() >= lastSentMs);
  });
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
  const request = await prisma.signatureRequest.findUnique({
    where: { id: payload.requestId },
    include: { document: true },
  });
  if (
    !request ||
    request.provider !== "JUN_NATIVE" ||
    !["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status)
  )
    return null;
  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const index = recipients.findIndex(
    (r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order,
  );
  if (index < 0) return null;
  return {
    payload,
    request,
    recipients,
    index,
    recipient: recipients[index],
    meta: signatureRequestMeta(request.recipients),
  };
}

export async function sendNativeVerificationCode(token: string): Promise<void> {
  const ctx = await signingContext(token);
  if (!ctx) redirect(`/sign/${encodeURIComponent(token)}?error=request_not_available`);
  const { request, recipients, index, recipient, meta } = ctx;
  if (recipient.signedAt || recipient.declinedAt)
    redirect(`/sign/${encodeURIComponent(token)}?error=request_not_available`);

  const expiresAt = requestExpiry(meta.expiresAt, request.sentAt);
  if (expiresAt.getTime() <= Date.now()) redirect(`/sign/${encodeURIComponent(token)}?error=request_expired`);

  if (await hasActiveBounce(request.id, recipient.email, recipient.otpSentAt)) {
    redirect(`/sign/${encodeURIComponent(token)}?error=otp_email_bounced`);
  }

  const nowMs = Date.now();
  const lockUntil = recipient.otpLockedUntil ? new Date(recipient.otpLockedUntil).getTime() : 0;
  if (lockUntil > nowMs) redirect(`/sign/${encodeURIComponent(token)}?error=otp_locked`);

  const lastSent = recipient.otpSentAt ? new Date(recipient.otpSentAt).getTime() : 0;
  if (lastSent && nowMs - lastSent < OTP_RESEND_MS)
    redirect(`/sign/${encodeURIComponent(token)}?error=otp_wait`);

  const windowStarted = recipient.otpWindowStartedAt ? new Date(recipient.otpWindowStartedAt).getTime() : 0;
  const sameWindow = Boolean(windowStarted && nowMs - windowStarted < OTP_WINDOW_MS);
  const sendCount = sameWindow ? (recipient.otpSendCount ?? 0) : 0;
  if (sendCount >= OTP_MAX_SENDS_PER_WINDOW)
    redirect(`/sign/${encodeURIComponent(token)}?error=otp_rate_limited`);

  let account;
  try {
    account = await resolveOtpSenderMailbox();
  } catch {
    redirect(`/sign/${encodeURIComponent(token)}?error=verification_email_unavailable`);
  }
  if (!account) redirect(`/sign/${encodeURIComponent(token)}?error=verification_email_unavailable`);

  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  recipients[index] = {
    ...recipient,
    otpHash: otpDigest(request.id, recipient.email, code),
    otpExpiresAt: new Date(nowMs + OTP_TTL_MS).toISOString(),
    otpSentAt: now.toISOString(),
    otpAttempts: 0,
    otpSendCount: sendCount + 1,
    otpWindowStartedAt: sameWindow ? recipient.otpWindowStartedAt : now.toISOString(),
    otpLockedUntil: null,
  };
  await prisma.signatureRequest.update({
    where: { id: request.id },
    data: { recipients: signatureRecipientsPayload(recipients, meta) as never },
  });

  const { gmailSend } = await import("@/lib/google/gmail");
  try {
    await gmailSend(account.id, {
      to: recipient.email,
      subject: `Your JUN Secure Sign verification code — ${request.document.documentId}`,
      text: `Hello ${recipient.name},\n\nYour JUN Secure Sign verification code is:\n\n${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\nDocument: ${request.document.documentId} — ${request.document.title}\n\nIf you did not request this code, do not continue with the signature.\n\nJUN CREATIF AND TRAVEL LLC`,
    });
  } catch (error) {
    await audit({
      userId: null,
      action: "JUN_NATIVE_OTP_DELIVERY_FAILED",
      resourceType: "SignatureRequest",
      resourceId: request.id,
      after: {
        signer: recipient.email,
        recipientEmail: recipient.email,
        fromEmail: account.email,
        mailAccountId: account.id,
        attemptedAt: now.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => undefined);
    redirect(`/sign/${encodeURIComponent(token)}?error=verification_email_unavailable`);
  }

  await audit({
    userId: null,
    action: "JUN_NATIVE_OTP_SENT",
    resourceType: "SignatureRequest",
    resourceId: request.id,
    after: {
      signer: recipient.email,
      recipientEmail: recipient.email,
      sentAt: now.toISOString(),
      expiresAt: new Date(nowMs + OTP_TTL_MS).toISOString(),
      expiresInMinutes: 10,
      windowSendCount: sendCount + 1,
      mailAccountId: account.id,
      fromEmail: account.email,
      providerStatus: "ACCEPTED_BY_GMAIL_API",
    },
  }).catch(() => undefined);
  redirect(`/sign/${encodeURIComponent(token)}?otp=sent`);
}

export async function verifyNativeVerificationCode(token: string, formData: FormData): Promise<void> {
  const ctx = await signingContext(token);
  if (!ctx) redirect(`/sign/${encodeURIComponent(token)}?error=request_not_available`);
  const { request, recipients, index, recipient, meta, payload } = ctx;
  const code = String(formData.get("otp") ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);
  if (code.length !== 6) redirect(`/sign/${encodeURIComponent(token)}?error=otp_invalid`);

  const nowMs = Date.now();
  if (recipient.otpLockedUntil && new Date(recipient.otpLockedUntil).getTime() > nowMs)
    redirect(`/sign/${encodeURIComponent(token)}?error=otp_locked`);
  if (!recipient.otpHash || !recipient.otpExpiresAt)
    redirect(`/sign/${encodeURIComponent(token)}?error=otp_send_first`);
  if (new Date(recipient.otpExpiresAt).getTime() <= nowMs)
    redirect(`/sign/${encodeURIComponent(token)}?error=otp_expired`);

  if (otpDigest(request.id, recipient.email, code) !== recipient.otpHash) {
    const attempts = (recipient.otpAttempts ?? 0) + 1;
    const locked = attempts >= OTP_MAX_ATTEMPTS ? new Date(nowMs + OTP_LOCK_MS).toISOString() : null;
    recipients[index] = { ...recipient, otpAttempts: attempts, otpLockedUntil: locked };
    await prisma.signatureRequest.update({
      where: { id: request.id },
      data: { recipients: signatureRecipientsPayload(recipients, meta) as never },
    });
    await audit({
      userId: null,
      action: locked ? "JUN_NATIVE_OTP_LOCKED" : "JUN_NATIVE_OTP_FAILED",
      resourceType: "SignatureRequest",
      resourceId: request.id,
      after: {
        signer: recipient.email,
        recipientEmail: recipient.email,
        attempts,
        attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - attempts),
        lockedUntil: locked,
        failureReason: "INCORRECT_CODE",
      },
    }).catch(() => undefined);
    redirect(`/sign/${encodeURIComponent(token)}?error=${locked ? "otp_locked" : "otp_invalid"}`);
  }

  const now = new Date();
  recipients[index] = {
    ...recipient,
    verifiedAt: now.toISOString(),
    otpHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpLockedUntil: null,
  };
  await prisma.signatureRequest.update({
    where: { id: request.id },
    data: { recipients: signatureRecipientsPayload(recipients, meta) as never },
  });
  await audit({
    userId: null,
    action: "JUN_NATIVE_SIGNER_EMAIL_VERIFIED",
    resourceType: "SignatureRequest",
    resourceId: request.id,
    after: {
      signer: recipient.email,
      recipientEmail: recipient.email,
      order: recipient.order,
      verifiedAt: now.toISOString(),
      verificationMethod: "EMAIL_OTP",
      sessionId: payload.sessionId ?? null,
    },
  }).catch(() => undefined);

  const expiry = requestExpiry(meta.expiresAt, request.sentAt);
  const verifiedToken = await createVerifiedNativeSigningToken(
    {
      requestId: payload.requestId,
      email: payload.email,
      order: payload.order,
      linkVersion: payload.linkVersion,
      sessionId: payload.sessionId,
    },
    expiry,
  );
  redirect(`/sign/${encodeURIComponent(verifiedToken)}?verified=1`);
}

export async function verifySignerInternally(
  requestId: string,
  signerOrder: number,
  formData: FormData,
): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (reason.length < 5)
    redirect(
      `/app/signatures/${requestId}?toast_error=${encodeURIComponent("Indiquez le motif de la vérification interne.")}`,
    );

  const request = await prisma.signatureRequest.findUnique({ where: { id: requestId } });
  if (!request || request.provider !== "JUN_NATIVE")
    redirect(
      `/app/signatures/${requestId}?toast_error=${encodeURIComponent("Demande JUN Secure Sign introuvable.")}`,
    );
  if (!["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status))
    redirect(
      `/app/signatures/${requestId}?toast_error=${encodeURIComponent("Cette demande n'accepte plus de vérification interne.")}`,
    );

  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const meta = signatureRequestMeta(request.recipients);
  const index = recipients.findIndex((r) => r.order === signerOrder);
  if (index < 0)
    redirect(`/app/signatures/${requestId}?toast_error=${encodeURIComponent("Signataire introuvable.")}`);
  const recipient = recipients[index];
  if (recipient.signedAt || recipient.declinedAt)
    redirect(
      `/app/signatures/${requestId}?toast_error=${encodeURIComponent("Ce signataire a déjà terminé son action.")}`,
    );

  const now = new Date();
  recipients[index] = {
    ...recipient,
    verifiedAt: now.toISOString(),
    otpHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpLockedUntil: null,
  };
  await prisma.signatureRequest.update({
    where: { id: requestId },
    data: { recipients: signatureRecipientsPayload(recipients, meta) as never },
  });
  await audit({
    userId: user.id,
    action: "JUN_NATIVE_SIGNER_VERIFIED_INTERNAL",
    resourceType: "SignatureRequest",
    resourceId: requestId,
    after: {
      signer: recipient.email,
      recipientEmail: recipient.email,
      order: recipient.order,
      verifiedAt: now.toISOString(),
      verificationMethod: "INTERNAL_OVERRIDE",
      reason: reason.slice(0, 500),
      verifiedBy: `${user.firstName} ${user.lastName}`,
      verifiedByUserId: user.id,
    },
  });

  revalidatePath(`/app/signatures/${requestId}`);
  redirect(
    `/app/signatures/${requestId}?toast=${encodeURIComponent(`Identité de ${recipient.email} vérifiée en interne`)}`,
  );
}

async function requireVerifiedToken(token: string) {
  const payload = await verifyNativeSigningToken(token);
  if (!payload?.verified) redirect(`/sign/${encodeURIComponent(token)}?error=verification_required`);
  const request = await prisma.signatureRequest.findUnique({ where: { id: payload.requestId } });
  if (!request) redirect(`/sign/${encodeURIComponent(token)}?error=request_not_available`);
  const recipient = signatureRecipients(request.recipients).find(
    (r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order,
  );
  if (!recipient?.verifiedAt) redirect(`/sign/${encodeURIComponent(token)}?error=verification_required`);
  return payload;
}

export async function completeVerifiedJunNativeSignature(token: string, formData: FormData): Promise<void> {
  await requireVerifiedToken(token);
  return completeJunNativeSignature(token, formData);
}

export async function declineVerifiedJunNativeSignature(token: string, formData: FormData): Promise<void> {
  await requireVerifiedToken(token);
  return declineJunNativeSignature(token, formData);
}
