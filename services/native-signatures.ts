"use server";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { assertPermission, requestMeta } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { sha256 } from "@/lib/hash";
import { makeStorageKey, storage } from "@/lib/storage";
import { signatureRecipients, signatureRequestMeta, signatureRecipientsPayload, type SignatureRecipient } from "@/lib/signature-recipients";
import { verifyNativeSigningToken } from "@/lib/native-signature";
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
    try {
      return await storage().download(request.signedPdfKey);
    } catch {
      // Continue to the finalized source or a live render. A stale storage key
      // must never prevent the next signer from completing the document.
    }
  }

  if (request.document.finalPdfKey) {
    try {
      return await storage().download(request.document.finalPdfKey);
    } catch {
      // Same fallback used by the public signing PDF route: regenerate a
      // readable source from the locked document if the stored object cannot
      // be retrieved.
    }
  }

  return renderFallbackPdf(request);
}

function fitSize(font: { widthOfTextAtSize(text: string, size: number): number }, text: string, desired: number, width: number) {
  let size = desired;
  while (size > 7 && font.widthOfTextAtSize(text, size) > width) size -= 0.5;
  return size;
}

async function stampSigner(pdfBytes: Buffer, recipient: SignatureRecipient, signatureName: string, signedAt: Date) {
  const pdf = await PDFDocument.load(pdfBytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const dateText = signedAt.toISOString().slice(0, 10);

  for (const field of recipient.fields ?? []) {
    const pageIndex = Math.max(0, Math.min(pdf.getPageCount() - 1, field.page - 1));
    const page = pdf.getPage(pageIndex);
    const { height } = page.getSize();
    const width = Math.max(40, field.width ?? (field.type === "SIGNATURE" ? 150 : field.type === "NAME" ? 130 : 90));
    const fieldHeight = Math.max(18, field.height ?? (field.type === "SIGNATURE" ? 42 : 24));
    const x = Math.max(0, field.x);
    const topY = Math.max(0, field.y);
    const y = Math.max(0, height - topY - fieldHeight + 5);

    let text = signatureName;
    let font = regular;
    let desired = 11;
    if (field.type === "SIGNATURE") { font = italic; desired = 18; }
    else if (field.type === "INITIALS") { text = initials(signatureName); desired = 12; }
    else if (field.type === "DATE_SIGNED") { text = dateText; desired = 10; }
    else if (field.type === "NAME") { text = signatureName; desired = 10; }

    const size = fitSize(font, text, desired, width - 6);
    page.drawText(text, { x: x + 3, y, size, font, color: rgb(0.06, 0.09, 0.16), maxWidth: width - 6 });
  }

  return Buffer.from(await pdf.save());
}

export async function activateJunNativeSigning(requestId: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await prisma.signatureRequest.findUnique({ where: { id: requestId }, include: { document: true } });
  if (!request) redirect("/app/signatures?toast_error=Request not found");
  if (request.status !== "READY_FOR_SIGNATURE") redirect(`/app/signatures/${request.id}?toast_error=Request is not ready for activation`);

  const recipients = signatureRecipients(request.recipients);
  if (!recipients.length || recipients.some((r) => !(r.fields ?? []).some((f) => f.type === "SIGNATURE"))) {
    redirect(`/app/signatures/${request.id}/prepare?toast_error=Every signer needs a Signature field before activation`);
  }

  await prisma.signatureRequest.update({
    where: { id: request.id },
    data: { provider: "JUN_NATIVE", status: "SENT", sentAt: new Date() },
  });
  await audit({ userId: user.id, action: "JUN_NATIVE_SIGNATURE_ACTIVATED", resourceType: "SignatureRequest", resourceId: request.id, after: { documentId: request.document.documentId, signerCount: recipients.length } });
  revalidatePath(`/app/signatures/${request.id}`);
  revalidatePath("/app/signatures");
  redirect(`/app/signatures/${request.id}?toast=JUN native signing activated`);
}

export async function completeJunNativeSignature(token: string, formData: FormData): Promise<void> {
  const payload = await verifyNativeSigningToken(token);
  if (!payload) redirect(`/sign/${encodeURIComponent(token)}?error=invalid_or_expired_link`);

  const consent = String(formData.get("consent") ?? "") === "on";
  const signatureName = String(formData.get("signatureName") ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (!consent) redirect(`/sign/${encodeURIComponent(token)}?error=consent_required`);
  if (signatureName.length < 2) redirect(`/sign/${encodeURIComponent(token)}?error=signature_name_required`);

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

  const firstUnsigned = recipients.find((r) => !r.signedAt);
  if (!firstUnsigned || firstUnsigned.email.toLowerCase() !== recipient.email.toLowerCase()) {
    redirect(`/sign/${encodeURIComponent(token)}?error=waiting_for_previous_signer`);
  }

  const now = new Date();
  const before = await sourcePdf(request as never);
  const stamped = await stampSigner(before, recipient, signatureName, now);
  const key = makeStorageKey("signed/native", `${request.document.documentId}-${recipient.order}.pdf`);
  await storage().upload(key, stamped, "application/pdf");
  const hash = sha256(stamped);

  recipients[index] = { ...recipient, signedAt: now.toISOString() };
  const complete = recipients.every((r) => Boolean(r.signedAt));
  const meta = signatureRequestMeta(request.recipients);
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
    after: { signer: recipient.email, order: recipient.order, consent: true, signedAt: now.toISOString(), ipHash, pdfHash: hash, complete },
  }).catch(() => undefined);

  if (complete) {
    await prisma.notification.create({
      data: { userId: request.createdById, type: "CONTRACT_SIGNED", title: `${request.document.documentId} signed in JUN`, body: "All signers completed. The signed PDF was archived with a SHA-256 integrity hash." },
    }).catch(() => undefined);
    await logActivity({ userId: request.createdById, type: "SIGNATURE_COMPLETED", message: `Native signature completed for ${request.document.documentId}`, clientId: request.document.clientId ?? undefined, caseId: request.document.caseId ?? undefined }).catch(() => undefined);
  }

  revalidatePath(`/app/signatures/${request.id}`);
  revalidatePath("/app/signatures");
  redirect(`/sign/${encodeURIComponent(token)}?done=${complete ? "completed" : "signed"}`);
}
