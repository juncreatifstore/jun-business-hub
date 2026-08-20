"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import type { SignatureRecipient } from "@/lib/signature-recipients";
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
    });
  }

  if (recipients.length === 0) throw new Error("Add at least one signer");
  if (new Set(recipients.map((r) => r.email)).size !== recipients.length) throw new Error("Each signer must use a different email address");
  return recipients;
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
  if (doc.status !== "FINAL") redirect("/app/signatures/new?toast_error=Only finalized documents can be sent for signature");

  const duplicate = await prisma.signatureRequest.findFirst({
    where: { documentId: doc.id, status: { in: ["READY_FOR_SIGNATURE", "SENT", "VIEWED", "PARTIALLY_SIGNED"] } },
    select: { id: true },
  });
  if (duplicate) redirect(`/app/signatures/${duplicate.id}?toast_error=This document already has an active signature request`);

  const wanted = process.env.SIGNATURE_PROVIDER ?? "MOCK";
  let provider = "MOCK";
  let providerEnvelopeId: string | null = null;

  try {
    if (wanted === "DOCUSIGN") {
      const { docusignConfigured, docusignCreateEnvelope } = await import("@/lib/docusign");
      if (!docusignConfigured()) throw new Error("DocuSign credentials are missing");
      const pdfBytes = await finalPdfBytes(doc.id);
      const envelope = await docusignCreateEnvelope({
        documentId: doc.documentId,
        title: doc.title,
        pdfBytes,
        signers: recipients.map((r) => ({ name: r.name, email: r.email, order: r.order })),
        message,
      });
      provider = "DOCUSIGN";
      providerEnvelopeId = envelope.envelopeId;
    } else if (process.env.NODE_ENV === "production") {
      throw new Error("Signature provider is not configured. Set SIGNATURE_PROVIDER=DOCUSIGN for production.");
    } else {
      providerEnvelopeId = `mock_${doc.documentId}_${Date.now()}`;
    }
  } catch (e) {
    redirect(`/app/signatures/new?toast_error=${encodeURIComponent(e instanceof Error ? e.message : "Could not create signature request")}`);
  }

  const request = await prisma.signatureRequest.create({
    data: {
      documentId: doc.id,
      provider,
      providerEnvelopeId,
      status: "SENT",
      recipients: recipients as never,
      createdById: user.id,
      sentAt: new Date(),
    },
  });

  const roles: string[] = recipients.map((r) => r.role ?? "OTHER");

  await audit({
    userId: user.id,
    action: "SIGNATURE_CENTER_REQUEST_CREATE",
    resourceType: "SignatureRequest",
    resourceId: request.id,
    after: {
      documentId: doc.documentId,
      provider,
      signerCount: recipients.length,
      roles,
      messageIncluded: Boolean(message),
    },
  });
  await logActivity({
    userId: user.id,
    type: "SIGNATURE_REQUESTED",
    message: `Signature request sent for ${doc.documentId}`,
    clientId: doc.clientId ?? undefined,
    caseId: doc.caseId ?? undefined,
  });

  revalidatePath("/app/signatures");
  redirect(`/app/signatures/${request.id}?toast=${encodeURIComponent(provider === "DOCUSIGN" ? "Signature request sent via DocuSign" : "Signature request created")}`);
}
