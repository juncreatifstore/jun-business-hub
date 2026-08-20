"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import {
  signatureRecipients,
  signatureRecipientsPayload,
  signatureRequestMeta,
  type SignatureField,
  type SignatureRecipient,
} from "@/lib/signature-recipients";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = new Set(["CLIENT", "AGENCY", "WITNESS", "GUARANTOR", "PARTNER", "OTHER"]);

async function finalPdfBytes(documentId: string): Promise<Uint8Array> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { client: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc) throw new Error("Document not found");
  if (doc.status !== "FINAL") throw new Error("Only finalized documents can be sent for signature");

  if (doc.finalPdfKey) {
    const { storage } = await import("@/lib/storage");
    return new Uint8Array(await storage().download(doc.finalPdfKey));
  }

  const { renderDocumentPdf } = await import("@/services/pdf");
  return renderDocumentPdf({
    documentId: doc.documentId,
    title: doc.title,
    type: doc.type,
    status: doc.status,
    html: doc.versions[0]?.content ?? "",
    clientName: doc.client ? `${doc.client.firstName} ${doc.client.lastName}` : null,
  });
}

function numberField(formData: FormData, name: string, fallback: number): number {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function placementFields(formData: FormData, i: number): SignatureField[] {
  const signaturePage = Math.max(1, numberField(formData, `signer${i}SignaturePage`, 1));
  const signatureX = numberField(formData, `signer${i}SignatureX`, 72);
  const signatureY = numberField(formData, `signer${i}SignatureY`, 700);
  const fields: SignatureField[] = [{ type: "SIGNATURE", page: signaturePage, x: signatureX, y: signatureY }];

  if (formData.get(`signer${i}AddName`) === "on") {
    fields.push({
      type: "NAME",
      page: Math.max(1, numberField(formData, `signer${i}NamePage`, signaturePage)),
      x: numberField(formData, `signer${i}NameX`, signatureX),
      y: numberField(formData, `signer${i}NameY`, Math.max(0, signatureY - 40)),
    });
  }
  if (formData.get(`signer${i}AddDate`) === "on") {
    fields.push({
      type: "DATE_SIGNED",
      page: Math.max(1, numberField(formData, `signer${i}DatePage`, signaturePage)),
      x: numberField(formData, `signer${i}DateX`, signatureX + 250),
      y: numberField(formData, `signer${i}DateY`, signatureY),
    });
  }
  if (formData.get(`signer${i}AddInitials`) === "on") {
    fields.push({
      type: "INITIALS",
      page: Math.max(1, numberField(formData, `signer${i}InitialsPage`, signaturePage)),
      x: numberField(formData, `signer${i}InitialsX`, signatureX + 350),
      y: numberField(formData, `signer${i}InitialsY`, signatureY),
    });
  }

  return fields;
}

function readRecipients(formData: FormData): SignatureRecipient[] {
  const recipients: SignatureRecipient[] = [];

  for (let i = 1; i <= 4; i += 1) {
    const name = String(formData.get(`signer${i}Name`) ?? "").trim().slice(0, 160);
    const email = String(formData.get(`signer${i}Email`) ?? "").trim().toLowerCase().slice(0, 254);
    const roleRaw = String(formData.get(`signer${i}Role`) ?? "OTHER").trim().toUpperCase();
    if (!name && !email) continue;
    if (!name || !EMAIL_RE.test(email)) throw new Error(`Signer ${i}: valid name and email are required`);
    recipients.push({
      name,
      email,
      role: ALLOWED_ROLES.has(roleRaw) ? roleRaw : "OTHER",
      order: recipients.length + 1,
      signedAt: null,
      fields: placementFields(formData, i),
    });
  }

  if (recipients.length === 0) throw new Error("Add at least one signer");
  if (new Set(recipients.map((r) => r.email)).size !== recipients.length) throw new Error("Each signer must use a different email address");
  return recipients;
}

async function docuSignIsReady(): Promise<boolean> {
  if ((process.env.SIGNATURE_PROVIDER ?? "").toUpperCase() !== "DOCUSIGN") return false;
  const { docusignConfigured } = await import("@/lib/docusign");
  return docusignConfigured();
}

async function dispatchToDocuSign(input: {
  document: { id: string; documentId: string; title: string };
  recipients: SignatureRecipient[];
  message: string;
}) {
  const { docusignCreateEnvelope } = await import("@/lib/docusign");
  const pdfBytes = await finalPdfBytes(input.document.id);
  return docusignCreateEnvelope({
    documentId: input.document.documentId,
    title: input.document.title,
    pdfBytes,
    signers: input.recipients.map((r) => ({
      name: r.name,
      email: r.email,
      order: r.order,
      fields: r.fields,
    })),
    message: input.message,
  });
}

export async function createSignatureCenterRequest(formData: FormData): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const documentId = String(formData.get("documentId") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim().slice(0, 1000);
  if (!documentId) redirect("/app/signatures/new?toast_error=Choose a document");

  let recipients: SignatureRecipient[];
  try {
    recipients = readRecipients(formData);
  } catch (e) {
    redirect(`/app/signatures/new?toast_error=${encodeURIComponent(e instanceof Error ? e.message : "Invalid signers")}`);
  }

  const doc = await prisma.document.findUnique({ where: { id: documentId }, include: { client: true } });
  if (!doc) redirect("/app/signatures/new?toast_error=Document not found");
  if (doc.status !== "FINAL") redirect("/app/signatures/new?toast_error=Only finalized documents can be prepared for signature");

  const duplicate = await prisma.signatureRequest.findFirst({
    where: { documentId: doc.id, status: { in: ["READY_FOR_SIGNATURE", "SENT", "VIEWED", "PARTIALLY_SIGNED"] } },
    select: { id: true },
  });
  if (duplicate) redirect(`/app/signatures/${duplicate.id}?toast_error=This document already has an active signature request`);

  const providerReady = await docuSignIsReady();
  let provider = "PENDING";
  let providerEnvelopeId: string | null = null;
  let status: "READY_FOR_SIGNATURE" | "SENT" = "READY_FOR_SIGNATURE";
  let sentAt: Date | null = null;

  if (providerReady) {
    try {
      const envelope = await dispatchToDocuSign({ document: doc, recipients, message });
      provider = "DOCUSIGN";
      providerEnvelopeId = envelope.envelopeId;
      status = "SENT";
      sentAt = new Date();
    } catch (e) {
      redirect(`/app/signatures/new?toast_error=${encodeURIComponent(e instanceof Error ? e.message : "Could not send signature request")}`);
    }
  }

  const request = await prisma.signatureRequest.create({
    data: {
      documentId: doc.id,
      provider,
      providerEnvelopeId,
      status,
      recipients: signatureRecipientsPayload(recipients, { message }) as never,
      createdById: user.id,
      sentAt,
    },
  });

  const roles: string[] = recipients.map((r) => r.role ?? "OTHER");
  const fieldCount = recipients.reduce((sum, r) => sum + (r.fields?.length ?? 0), 0);

  await audit({
    userId: user.id,
    action: providerReady ? "SIGNATURE_CENTER_REQUEST_CREATE" : "SIGNATURE_CENTER_REQUEST_PREPARED",
    resourceType: "SignatureRequest",
    resourceId: request.id,
    after: {
      documentId: doc.documentId,
      provider,
      signerCount: recipients.length,
      fieldCount,
      roles,
      messageIncluded: Boolean(message),
    },
  });
  await logActivity({
    userId: user.id,
    type: "SIGNATURE_REQUESTED",
    message: providerReady ? `Signature request sent for ${doc.documentId}` : `Signature request prepared for ${doc.documentId}`,
    clientId: doc.clientId ?? undefined,
    caseId: doc.caseId ?? undefined,
  });

  revalidatePath("/app/signatures");
  redirect(`/app/signatures/${request.id}?toast=${encodeURIComponent(providerReady ? "Signature request sent via DocuSign" : "Signature request prepared — configure DocuSign to send it")}`);
}

export async function sendPreparedSignatureRequest(requestId: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await prisma.signatureRequest.findUnique({
    where: { id: requestId },
    include: { document: true },
  });
  if (!request) redirect("/app/signatures?toast_error=Request not found");
  if (request.status !== "READY_FOR_SIGNATURE") redirect(`/app/signatures/${request.id}?toast_error=Only prepared requests can be sent`);

  if (!(await docuSignIsReady())) {
    redirect(`/app/signatures/${request.id}?toast_error=DocuSign is not configured yet. The request remains safely prepared.`);
  }

  const recipients = signatureRecipients(request.recipients);
  const message = signatureRequestMeta(request.recipients).message ?? "";
  if (!recipients.length) redirect(`/app/signatures/${request.id}?toast_error=No signers are configured`);

  try {
    const envelope = await dispatchToDocuSign({ document: request.document, recipients, message });
    await prisma.signatureRequest.update({
      where: { id: request.id },
      data: {
        provider: "DOCUSIGN",
        providerEnvelopeId: envelope.envelopeId,
        status: "SENT",
        sentAt: new Date(),
      },
    });
    await audit({
      userId: user.id,
      action: "SIGNATURE_PREPARED_REQUEST_SENT",
      resourceType: "SignatureRequest",
      resourceId: request.id,
      after: { provider: "DOCUSIGN", signerCount: recipients.length },
    });
  } catch (e) {
    redirect(`/app/signatures/${request.id}?toast_error=${encodeURIComponent(e instanceof Error ? e.message : "DocuSign send failed")}`);
  }

  revalidatePath(`/app/signatures/${request.id}`);
  revalidatePath("/app/signatures");
  redirect(`/app/signatures/${request.id}?toast=Signature request sent via DocuSign`);
}
