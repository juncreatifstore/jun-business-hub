"use server";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { assertPermission, requestMeta } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { sha256 } from "@/lib/hash";
import { makeStorageKey, storage } from "@/lib/storage";
import { buildSignatureCertificate } from "@/lib/signature-certificate";
import { signatureRecipients, signatureRequestMeta, signatureRecipientsPayload, type SignatureRecipient } from "@/lib/signature-recipients";
import { nativeSigningExpiry, nativeSigningUrl, verifyNativeSigningToken } from "@/lib/native-signature";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 4).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

async function renderFallbackPdf(request: {
  document: {
    documentId: string;
    title: string;
    type: string;
    status: string;
    client: { firstName: string; lastName: string } | null;
    versions: { content: string }[];
  };
}) {
  const { renderDocumentPdf } = await import("@/services/pdf");
  return Buffer.from(await renderDocumentPdf({
    documentId: request.document.documentId,
    title: request.document.title,
    type: request.document.type as never,
    status: request.document.status as never,
    html: request.document.versions[0]?.content ?? "",
    clientName: request.document.client ? `${request.document.client.firstName} ${request.document.client.lastName}` : null,
  }));
}

async function sourcePdf(request: {
  signedPdfKey: string | null;
  document: {
    id: string;
    documentId: string;
    title: string;
    type: string;
    status: string;
    finalPdfKey: string | null;
    client: { firstName: string; lastName: string } | null;
    versions: { content: string }[];
  };
}) {
  if (request.signedPdfKey) {
    try { return await storage().download(request.signedPdfKey); } catch {}
  }
  if (request.document.finalPdfKey) {
    try { return await storage().download(request.document.finalPdfKey); } catch {}
  }
  return renderFallbackPdf(request);
}

function fitSize(font: { widthOfTextAtSize(text: string, size: number): number }, text: string, desired: number, width: number) {
  let size = desired;
  while (size > 7 && font.widthOfTextAtSize(text, size) > width) size -= 0.5;
  return size;
}

function parseDrawSignature(value: FormDataEntryValue | null): Buffer | null {
  if (typeof value !== "string") return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || match[1].length > 900_000) return null;
  try {
    const bytes = Buffer.from(match[1], "base64");
    if (!bytes.length || bytes.length > 500_000) return null;
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
    return bytes;
  } catch {
    return null;
  }
}

async function stampSigner(pdfBytes: Buffer, recipient: SignatureRecipient, signatureName: string, signedAt: Date, signatureImage: Buffer | null) {
  const pdf = await PDFDocument.load(pdfBytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const drawn = signatureImage ? await pdf.embedPng(signatureImage) : null;
  const dateText = signedAt.toISOString().slice(0, 10);

  for (const field of recipient.fields ?? []) {
    const pageIndex = Math.max(0, Math.min(pdf.getPageCount() - 1, field.page - 1));
    const page = pdf.getPage(pageIndex);
    const { height } = page.getSize();
    const width = Math.max(40, field.width ?? (field.type === "SIGNATURE" ? 150 : field.type === "NAME" ? 130 : 90));
    const fieldHeight = Math.max(18, field.height ?? (field.type === "SIGNATURE" ? 42 : 24));
    const x = Math.max(0, field.x);
    const topY = Math.max(0, field.y);
    const fieldBottom = Math.max(0, height - topY - fieldHeight);

    if (field.type === "SIGNATURE" && drawn) {
      const maxWidth = Math.max(12, width - 6);
      const maxHeight = Math.max(12, fieldHeight - 6);
      const scale = Math.min(maxWidth / drawn.width, maxHeight / drawn.height);
      const imageWidth = drawn.width * scale;
      const imageHeight = drawn.height * scale;
      page.drawImage(drawn, {
        x: x + 3,
        y: fieldBottom + Math.max(3, (fieldHeight - imageHeight) / 2),
        width: imageWidth,
        height: imageHeight,
      });
      continue;
    }

    let text = signatureName;
    let font = regular;
    let desired = 11;
    if (field.type === "SIGNATURE") { font = italic; desired = 18; }
    else if (field.type === "INITIALS") { text = initials(signatureName); desired = 12; }
    else if (field.type === "DATE_SIGNED") { text = dateText; desired = 10; }
    else if (field.type === "NAME") { text = signatureName; desired = 10; }

    const size = fitSize(font, text, desired, width - 6);
    page.drawText(text, { x: x + 3, y: fieldBottom + 5, size, font, color: rgb(0.06, 0.09, 0.16), maxWidth: width - 6 });
  }

  return Buffer.from(await pdf.save());
}

function requestExpiry(metaExpiresAt: string | undefined, sentAt: Date | null) {
  if (metaExpiresAt) {
    const d = new Date(metaExpiresAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return nativeSigningExpiry(sentAt ?? new Date());
}

async function primaryMailAccount() {
  return prisma.mailAccount.findFirst({ orderBy: { createdAt: "asc" } });
}

async function sendSigningInvitation(input: {
  accountId: string;
  requestId: string;
  documentId: string;
  documentTitle: string;
  recipient: SignatureRecipient;
  expiresAt: Date;
  message?: string;
  reminder?: boolean;
}) {
  const link = await nativeSigningUrl(input.requestId, input.recipient.email, input.recipient.order, input.expiresAt);
  const { gmailSend } = await import("@/lib/google/gmail");
  const intro = input.reminder
    ? `This is a reminder that ${input.documentId} is waiting for your electronic signature.`
    : `A document is ready for your secure electronic signature.`;
  const extra = input.message?.trim() ? `\n\nMessage from JUN:\n${input.message.trim()}` : "";
  return gmailSend(input.accountId, {
    to: input.recipient.email,
    subject: `${input.reminder ? "Signature reminder" : "Signature requested"} — ${input.documentTitle} (${input.documentId})`,
    text: `Hello ${input.recipient.name},\n\n${intro}${extra}\n\nReview & sign securely:\n${link}\n\nFor your security, JUN will verify your email with a one-time code before displaying the document. This signing link expires on ${input.expiresAt.toISOString().slice(0, 10)}.\n\nIf the document is incorrect, you can decline it from the secure signing page.\n\nJUN CREATIF AND TRAVEL LLC`,
  });
}

async function deliverCompletedPackage(input: {
  accountId: string;
  requestId: string;
  documentId: string;
  documentTitle: string;
  pdf: Buffer;
  pdfHash: string;
  recipients: SignatureRecipient[];
}) {
  const certificate = await buildSignatureCertificate(input.requestId);
  if (!certificate) throw new Error("Signature certificate is unavailable after completion");
  const { gmailSend } = await import("@/lib/google/gmail");
  const deliveredAt = new Date().toISOString();
  const delivered = new Set<string>();

  for (const recipient of input.recipients) {
    try {
      await gmailSend(input.accountId, {
        to: recipient.email,
        subject: `Signed document completed — ${input.documentTitle} (${input.documentId})`,
        text: `Hello ${recipient.name},\n\nThe electronic signature process for ${input.documentId} is complete.\n\nAttached are:\n• the final signed PDF\n• the JUN electronic signature certificate / audit trail\n\nFinal PDF SHA-256:\n${input.pdfHash}\n\nPlease keep these files for your records.\n\nJUN CREATIF AND TRAVEL LLC`,
        attachments: [
          { filename: `${input.documentId}-signed.pdf`, mimeType: "application/pdf", data: input.pdf },
          { filename: certificate.filename, mimeType: "application/pdf", data: certificate.bytes },
        ],
      });
      delivered.add(recipient.email.toLowerCase());
      await audit({ userId: null, action: "JUN_NATIVE_COMPLETION_EMAIL_SENT", resourceType: "SignatureRequest", resourceId: input.requestId, after: { signer: recipient.email, sentAt: deliveredAt, attachments: 2 } }).catch(() => undefined);
    } catch (error) {
      await audit({ userId: null, action: "JUN_NATIVE_COMPLETION_EMAIL_FAILED", resourceType: "SignatureRequest", resourceId: input.requestId, after: { signer: recipient.email, error: error instanceof Error ? error.message.slice(0, 300) : "unknown" } }).catch(() => undefined);
    }
  }
  return { delivered, deliveredAt };
}

export async function activateJunNativeSigning(requestId: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await prisma.signatureRequest.findUnique({ where: { id: requestId }, include: { document: true } });
  if (!request) redirect("/app/signatures?toast_error=Request not found");
  if (request.status !== "READY_FOR_SIGNATURE") redirect(`/app/signatures/${request.id}?toast_error=Request is not ready for activation`);

  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const oldMeta = signatureRequestMeta(request.recipients);
  if (!recipients.length || recipients.some((r) => !(r.fields ?? []).some((f) => f.type === "SIGNATURE"))) {
    redirect(`/app/signatures/${request.id}/prepare?toast_error=Every signer needs a Signature field before activation`);
  }
  const account = await primaryMailAccount();
  if (!account) redirect(`/app/signatures/${request.id}?toast_error=Connect a Gmail account before starting JUN signing`);

  const now = new Date();
  const expiresAt = nativeSigningExpiry(now);
  await prisma.signatureRequest.update({
    where: { id: request.id },
    data: {
      provider: "JUN_NATIVE",
      status: "SENT",
      sentAt: now,
      recipients: signatureRecipientsPayload(recipients, { ...oldMeta, expiresAt: expiresAt.toISOString() }) as never,
    },
  });

  try {
    await sendSigningInvitation({
      accountId: account.id,
      requestId: request.id,
      documentId: request.document.documentId,
      documentTitle: request.document.title,
      recipient: recipients[0],
      expiresAt,
      message: oldMeta.message,
    });
  } catch (error) {
    await prisma.signatureRequest.update({
      where: { id: request.id },
      data: { provider: request.provider, status: "READY_FOR_SIGNATURE", sentAt: request.sentAt, recipients: request.recipients as never },
    }).catch(() => undefined);
    await audit({ userId: user.id, action: "JUN_NATIVE_INVITATION_FAILED", resourceType: "SignatureRequest", resourceId: request.id, after: { signer: recipients[0].email, error: error instanceof Error ? error.message.slice(0, 300) : "unknown" } }).catch(() => undefined);
    redirect(`/app/signatures/${request.id}?toast_error=Could not send the first signing invitation. Request was not activated.`);
  }

  recipients[0] = { ...recipients[0], invitationSentAt: now.toISOString() };
  await prisma.signatureRequest.update({ where: { id: request.id }, data: { recipients: signatureRecipientsPayload(recipients, { ...oldMeta, expiresAt: expiresAt.toISOString() }) as never } });
  await audit({ userId: user.id, action: "JUN_NATIVE_SIGNATURE_ACTIVATED", resourceType: "SignatureRequest", resourceId: request.id, after: { documentId: request.document.documentId, signerCount: recipients.length, firstInvitation: recipients[0].email, expiresAt: expiresAt.toISOString() } });
  revalidatePath(`/app/signatures/${request.id}`);
  revalidatePath("/app/signatures");
  redirect(`/app/signatures/${request.id}?toast=JUN signing activated and first invitation sent`);
}

export async function markNativeSignatureViewed(token: string): Promise<void> {
  const payload = await verifyNativeSigningToken(token);
  if (!payload) return;
  const request = await prisma.signatureRequest.findUnique({ where: { id: payload.requestId } });
  if (!request || request.provider !== "JUN_NATIVE" || !["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status)) return;

  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const index = recipients.findIndex((r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order);
  if (index < 0 || recipients[index].signedAt || recipients[index].declinedAt) return;
  const meta = signatureRequestMeta(request.recipients);
  const expiresAt = requestExpiry(meta.expiresAt, request.sentAt);
  if (expiresAt.getTime() <= Date.now()) {
    await prisma.signatureRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } }).catch(() => undefined);
    return;
  }

  if (!recipients[index].viewedAt) recipients[index] = { ...recipients[index], viewedAt: new Date().toISOString() };
  await prisma.signatureRequest.update({
    where: { id: request.id },
    data: {
      recipients: signatureRecipientsPayload(recipients, meta) as never,
      ...(request.status === "SENT" ? { status: "VIEWED" as const } : {}),
    },
  }).catch(() => undefined);
}

export async function declineJunNativeSignature(token: string, formData: FormData): Promise<void> {
  const payload = await verifyNativeSigningToken(token);
  if (!payload) redirect(`/sign/${encodeURIComponent(token)}?error=invalid_or_expired_link`);
  const reason = String(formData.get("reason") ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
  if (reason.length < 3) redirect(`/sign/${encodeURIComponent(token)}?error=decline_reason_required`);

  const request = await prisma.signatureRequest.findUnique({ where: { id: payload.requestId }, include: { document: true } });
  if (!request || request.provider !== "JUN_NATIVE" || !["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status)) {
    redirect(`/sign/${encodeURIComponent(token)}?error=request_not_available`);
  }
  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const index = recipients.findIndex((r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order);
  if (index < 0) redirect(`/sign/${encodeURIComponent(token)}?error=signer_not_found`);
  const recipient = recipients[index];
  if (recipient.signedAt) redirect(`/sign/${encodeURIComponent(token)}?done=already_signed`);

  const now = new Date();
  recipients[index] = { ...recipient, viewedAt: recipient.viewedAt ?? now.toISOString(), declinedAt: now.toISOString(), declineReason: reason };
  const meta = signatureRequestMeta(request.recipients);
  await prisma.signatureRequest.update({
    where: { id: request.id },
    data: { status: "DECLINED", completedAt: now, recipients: signatureRecipientsPayload(recipients, meta) as never },
  });
  await audit({ userId: null, action: "JUN_NATIVE_SIGNATURE_DECLINED", resourceType: "SignatureRequest", resourceId: request.id, after: { signer: recipient.email, order: recipient.order, declinedAt: now.toISOString(), reason } }).catch(() => undefined);
  await prisma.notification.create({
    data: { userId: request.createdById, type: "SIGNATURE_DECLINED", title: `${request.document.documentId} was declined`, body: `${recipient.name} declined the signature request.` },
  }).catch(() => undefined);
  revalidatePath(`/app/signatures/${request.id}`);
  revalidatePath("/app/signatures");
  redirect(`/sign/${encodeURIComponent(token)}?declined=1`);
}

export async function sendJunNativeReminder(requestId: string, signerEmail: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await prisma.signatureRequest.findUnique({ where: { id: requestId }, include: { document: true } });
  if (!request || request.provider !== "JUN_NATIVE" || !["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status)) {
    redirect(`/app/signatures/${requestId}?toast_error=This request cannot receive reminders`);
  }
  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const index = recipients.findIndex((r) => r.email.toLowerCase() === signerEmail.toLowerCase());
  if (index < 0 || recipients[index].signedAt || recipients[index].declinedAt) redirect(`/app/signatures/${requestId}?toast_error=Signer is not awaiting signature`);
  const firstUnsigned = recipients.find((r) => !r.signedAt);
  if (!firstUnsigned || firstUnsigned.email.toLowerCase() !== recipients[index].email.toLowerCase()) {
    redirect(`/app/signatures/${requestId}?toast_error=Reminder can only be sent to the current signer`);
  }

  const meta = signatureRequestMeta(request.recipients);
  const expiresAt = requestExpiry(meta.expiresAt, request.sentAt);
  if (expiresAt.getTime() <= Date.now()) {
    await prisma.signatureRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
    redirect(`/app/signatures/${requestId}?toast_error=This signing request has expired`);
  }

  const account = await primaryMailAccount();
  if (!account) redirect(`/app/signatures/${requestId}?toast_error=Connect a Gmail account before sending reminders`);
  await sendSigningInvitation({ accountId: account.id, requestId: request.id, documentId: request.document.documentId, documentTitle: request.document.title, recipient: recipients[index], expiresAt, message: meta.message, reminder: true });
  const now = new Date().toISOString();
  recipients[index] = { ...recipients[index], reminderSentAt: now };
  await prisma.signatureRequest.update({ where: { id: request.id }, data: { recipients: signatureRecipientsPayload(recipients, meta) as never } });
  await audit({ userId: user.id, action: "JUN_NATIVE_SIGNATURE_REMINDER_SENT", resourceType: "SignatureRequest", resourceId: request.id, after: { signer: recipients[index].email, reminderSentAt: now } }).catch(() => undefined);
  revalidatePath(`/app/signatures/${request.id}`);
  redirect(`/app/signatures/${request.id}?toast=Signature reminder sent`);
}

export async function completeJunNativeSignature(token: string, formData: FormData): Promise<void> {
  const payload = await verifyNativeSigningToken(token);
  if (!payload) redirect(`/sign/${encodeURIComponent(token)}?error=invalid_or_expired_link`);

  const consent = String(formData.get("consent") ?? "") === "on";
  const signatureName = String(formData.get("signatureName") ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  const signatureMethod = String(formData.get("signatureMethod") ?? "TYPE").toUpperCase() === "DRAW" ? "DRAW" as const : "TYPE" as const;
  const signatureImage = signatureMethod === "DRAW" ? parseDrawSignature(formData.get("signatureData")) : null;
  if (!consent) redirect(`/sign/${encodeURIComponent(token)}?error=consent_required`);
  if (signatureName.length < 2) redirect(`/sign/${encodeURIComponent(token)}?error=signature_name_required`);
  if (signatureMethod === "DRAW" && !signatureImage) redirect(`/sign/${encodeURIComponent(token)}?error=signature_draw_required`);

  const request = await prisma.signatureRequest.findUnique({
    where: { id: payload.requestId },
    include: { document: { include: { client: true, versions: { orderBy: { version: "desc" }, take: 1 } } } },
  });
  if (!request || request.provider !== "JUN_NATIVE" || !["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status)) {
    redirect(`/sign/${encodeURIComponent(token)}?error=request_not_available`);
  }

  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const index = recipients.findIndex((r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order);
  if (index < 0) redirect(`/sign/${encodeURIComponent(token)}?error=signer_not_found`);
  const recipient = recipients[index];
  if (recipient.signedAt) redirect(`/sign/${encodeURIComponent(token)}?done=already_signed`);
  if (recipient.declinedAt) redirect(`/sign/${encodeURIComponent(token)}?error=request_not_available`);

  const meta = signatureRequestMeta(request.recipients);
  const expiresAt = requestExpiry(meta.expiresAt, request.sentAt);
  if (expiresAt.getTime() <= Date.now()) {
    await prisma.signatureRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } }).catch(() => undefined);
    redirect(`/sign/${encodeURIComponent(token)}?error=request_expired`);
  }

  const firstUnsigned = recipients.find((r) => !r.signedAt);
  if (!firstUnsigned || firstUnsigned.email.toLowerCase() !== recipient.email.toLowerCase()) {
    redirect(`/sign/${encodeURIComponent(token)}?error=waiting_for_previous_signer`);
  }

  const now = new Date();
  const before = await sourcePdf(request as never);
  const stamped = await stampSigner(before, recipient, signatureName, now, signatureImage);
  const key = makeStorageKey("signed/native", `${request.document.documentId}-${recipient.order}.pdf`);
  await storage().upload(key, stamped, "application/pdf");
  const hash = sha256(stamped);
  const signatureImageHash = signatureImage ? sha256(signatureImage) : null;

  recipients[index] = {
    ...recipient,
    viewedAt: recipient.viewedAt ?? now.toISOString(),
    signedAt: now.toISOString(),
    signatureMethod,
    signatureImageHash,
  };
  const complete = recipients.every((r) => Boolean(r.signedAt));
  const reqMeta = requestMeta();
  const ipHash = reqMeta.ip ? sha256(reqMeta.ip) : null;

  await prisma.$transaction([
    prisma.signatureRequest.update({
      where: { id: request.id },
      data: {
        recipients: signatureRecipientsPayload(recipients, meta) as never,
        status: complete ? "SIGNED" : "PARTIALLY_SIGNED",
        signedPdfKey: key,
        signedPdfHash: hash,
        completedAt: complete ? now : null,
      },
    }),
    ...(complete ? [prisma.document.update({
      where: { id: request.documentId },
      data: { status: "SIGNED", finalPdfKey: key, finalPdfHash: hash, finalizedAt: now },
    })] : []),
  ]);

  await audit({
    userId: null,
    action: complete ? "JUN_NATIVE_SIGNATURE_COMPLETED" : "JUN_NATIVE_SIGNER_COMPLETED",
    resourceType: "SignatureRequest",
    resourceId: request.id,
    after: { signer: recipient.email, order: recipient.order, consent: true, signedAt: now.toISOString(), signatureMethod, signatureImageHash, ipHash, pdfHash: hash, complete },
  }).catch(() => undefined);

  const account = await primaryMailAccount();
  if (!complete) {
    const nextIndex = recipients.findIndex((r) => !r.signedAt && !r.declinedAt);
    if (account && nextIndex >= 0) {
      try {
        await sendSigningInvitation({ accountId: account.id, requestId: request.id, documentId: request.document.documentId, documentTitle: request.document.title, recipient: recipients[nextIndex], expiresAt, message: meta.message });
        recipients[nextIndex] = { ...recipients[nextIndex], invitationSentAt: new Date().toISOString() };
        await prisma.signatureRequest.update({ where: { id: request.id }, data: { recipients: signatureRecipientsPayload(recipients, meta) as never } });
        await audit({ userId: null, action: "JUN_NATIVE_NEXT_INVITATION_SENT", resourceType: "SignatureRequest", resourceId: request.id, after: { signer: recipients[nextIndex].email, order: recipients[nextIndex].order, sentAt: recipients[nextIndex].invitationSentAt } }).catch(() => undefined);
      } catch (error) {
        await prisma.notification.create({ data: { userId: request.createdById, type: "SIGNATURE_EMAIL_FAILED", title: `Invitation failed for ${request.document.documentId}`, body: `Signer ${recipients[nextIndex].name} is next, but JUN could not send the automatic invitation.` } }).catch(() => undefined);
        await audit({ userId: null, action: "JUN_NATIVE_NEXT_INVITATION_FAILED", resourceType: "SignatureRequest", resourceId: request.id, after: { signer: recipients[nextIndex].email, error: error instanceof Error ? error.message.slice(0, 300) : "unknown" } }).catch(() => undefined);
      }
    }
  } else {
    await prisma.notification.create({
      data: { userId: request.createdById, type: "CONTRACT_SIGNED", title: `${request.document.documentId} signed in JUN`, body: "All signers completed. The signed PDF was archived with a SHA-256 integrity hash." },
    }).catch(() => undefined);
    await logActivity({ userId: request.createdById, type: "SIGNATURE_COMPLETED", message: `Native signature completed for ${request.document.documentId}`, clientId: request.document.clientId ?? undefined, caseId: request.document.caseId ?? undefined }).catch(() => undefined);

    if (account) {
      try {
        const delivery = await deliverCompletedPackage({ accountId: account.id, requestId: request.id, documentId: request.document.documentId, documentTitle: request.document.title, pdf: stamped, pdfHash: hash, recipients });
        for (let i = 0; i < recipients.length; i++) {
          if (delivery.delivered.has(recipients[i].email.toLowerCase())) recipients[i] = { ...recipients[i], completionEmailSentAt: delivery.deliveredAt };
        }
        await prisma.signatureRequest.update({ where: { id: request.id }, data: { recipients: signatureRecipientsPayload(recipients, meta) as never } });
      } catch (error) {
        await prisma.notification.create({ data: { userId: request.createdById, type: "SIGNATURE_EMAIL_FAILED", title: `Signed package email failed for ${request.document.documentId}`, body: "The signature is valid and archived, but JUN could not complete automatic email delivery. Use the Signed package buttons to send the files manually." } }).catch(() => undefined);
        await audit({ userId: null, action: "JUN_NATIVE_COMPLETION_DELIVERY_FAILED", resourceType: "SignatureRequest", resourceId: request.id, after: { error: error instanceof Error ? error.message.slice(0, 300) : "unknown" } }).catch(() => undefined);
      }
    }
  }

  revalidatePath(`/app/signatures/${request.id}`);
  revalidatePath("/app/signatures");
  redirect(`/sign/${encodeURIComponent(token)}?done=${complete ? "completed" : "signed"}`);
}
