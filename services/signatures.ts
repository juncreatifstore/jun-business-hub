"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { sha256 } from "@/lib/hash";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/**
 * Signature provider abstraction.
 * The MOCK provider is fully functional for the MVP (in-app signing with audit trail).
 * DocuSign / Dropbox Sign adapters can be plugged in later behind the same interface.
 * External providers: "Requires external API credentials".
 */
type ProviderResult = { envelopeId: string; provider: string };

interface SignatureProvider {
  readonly name: string;
  createEnvelope(input: { documentId: string; title: string; signers: { name: string; email: string }[] }): Promise<ProviderResult>;
}

class MockSignatureProvider implements SignatureProvider {
  readonly name = "MOCK";
  async createEnvelope(input: { documentId: string; title: string }): Promise<ProviderResult> {
    return { envelopeId: `mock_${input.documentId}_${Date.now()}`, provider: this.name };
  }
}

class DocusignProvider implements SignatureProvider {
  readonly name = "DOCUSIGN";
  constructor(private pdfBytes: Uint8Array) {}
  async createEnvelope(input: { documentId: string; title: string; signers: { name: string; email: string }[] }): Promise<ProviderResult> {
    const { docusignCreateEnvelope } = await import("@/lib/docusign");
    const { envelopeId } = await docusignCreateEnvelope({
      documentId: input.documentId,
      title: input.title,
      pdfBytes: this.pdfBytes,
      signers: input.signers.map((s, i) => ({ ...s, order: i + 1 })),
    });
    return { envelopeId, provider: this.name };
  }
}

async function signatureProvider(finalPdf: () => Promise<Uint8Array>): Promise<SignatureProvider> {
  const { docusignConfigured } = await import("@/lib/docusign");
  const wanted = process.env.SIGNATURE_PROVIDER ?? "MOCK";
  if (wanted === "DOCUSIGN") {
    if (!docusignConfigured()) {
      throw new Error("SIGNATURE_PROVIDER=DOCUSIGN but DocuSign credentials are missing — see .env.example (READY — CREDENTIALS REQUIRED)");
    }
    return new DocusignProvider(await finalPdf());
  }
  return new MockSignatureProvider(); // dev-only fallback
}

export async function createSignatureRequest(documentId: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { client: true },
  });
  if (!doc) redirect("/app/documents?toast_error=Document not found");
  if (doc.status !== "FINAL") redirect(`/app/documents/${doc.id}?toast_error=Only finalized documents can be sent for signature`);

  const signers: { name: string; email: string; order: number }[] = [];
  if (doc.client) signers.push({ name: `${doc.client.firstName} ${doc.client.lastName}`, email: doc.client.email ?? "unknown@juncreatif.org", order: 1 });
  signers.push({ name: `${user.firstName} ${user.lastName}`, email: user.email, order: signers.length + 1 });

  const provider = await signatureProvider(async () => {
    // Envelope carries the exact final PDF (stored bytes if present, else fresh render).
    if (doc.finalPdfKey) {
      const { storage } = await import("@/lib/storage");
      return new Uint8Array(await storage().download(doc.finalPdfKey));
    }
    const { renderDocumentPdf } = await import("@/services/pdf");
    const latest = await prisma.documentVersion.findFirst({ where: { documentId: doc.id }, orderBy: { version: "desc" } });
    return renderDocumentPdf({ documentId: doc.documentId, title: doc.title, type: doc.type, status: doc.status, html: latest?.content ?? "", clientName: doc.client ? `${doc.client.firstName} ${doc.client.lastName}` : null });
  });
  const envelope = await provider.createEnvelope({
    documentId: doc.documentId,
    title: doc.title,
    signers,
  });

  const request = await prisma.signatureRequest.create({
    data: {
      documentId: doc.id,
      provider: envelope.provider,
      providerEnvelopeId: envelope.envelopeId,
      status: "SENT",
      createdById: user.id,
      auditTrail: [
        { at: new Date().toISOString(), event: "REQUEST_CREATED", by: user.email, provider: envelope.provider },
        { at: new Date().toISOString(), event: "SENT", signers: signers.map((s) => s.email) },
      ],
      signers: { create: signers },
    },
  });

  await audit({ userId: user.id, action: "SIGNATURE_REQUEST_CREATE", resourceType: "SignatureRequest", resourceId: request.id, after: { documentId: doc.documentId, provider: envelope.provider, signers: signers.length } });
  await logActivity({ userId: user.id, type: "SIGNATURE_REQUESTED", message: `Signature request sent for ${doc.documentId}`, clientId: doc.clientId ?? undefined, caseId: doc.caseId ?? undefined });

  revalidatePath(`/app/documents/${doc.id}`);
  redirect(`/app/signatures/${request.id}?toast=${encodeURIComponent(
    envelope.provider === "DOCUSIGN" ? "Signature request sent via DocuSign." : `Signature request created via ${envelope.provider}`
  )}`);
}

/**
 * DEV-ONLY mock in-app signing. Guarded twice: the request must use the MOCK
 * provider AND NODE_ENV must not be production — real signatures go through
 * DocuSign and its verified webhook.
 */
export async function mockSignSigner(signerId: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  if (process.env.NODE_ENV === "production") {
    redirect("/app/signatures?toast_error=Mock signing is disabled in production");
  }

  const signer = await prisma.signer.findUnique({
    where: { id: signerId },
    include: { request: { include: { signers: true, document: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } } } },
  });
  if (!signer) redirect("/app/signatures?toast_error=Signer not found");
  const request = signer.request;
  if (["SIGNED", "DECLINED", "EXPIRED", "VOIDED"].includes(request.status)) {
    redirect(`/app/signatures/${request.id}?toast_error=This request is closed`);
  }
  if (request.provider !== "MOCK") redirect(`/app/signatures/${request.id}?toast_error=This request uses ${request.provider} — signing happens on the provider side`);
  if (signer.signedAt) redirect(`/app/signatures/${request.id}?toast_error=Already signed`);

  const now = new Date();
  await prisma.signer.update({ where: { id: signer.id }, data: { signedAt: now, ip: "mock-in-app" } });

  const remaining = request.signers.filter((s) => s.id !== signer.id && !s.signedAt).length;
  const trail = Array.isArray(request.auditTrail) ? (request.auditTrail as unknown[]) : [];
  trail.push({ at: now.toISOString(), event: "SIGNER_SIGNED", signer: signer.email, by: user.email, method: "MOCK_IN_APP" });

  if (remaining === 0) {
    const content = request.document.versions[0]?.content ?? "";
    const finalHash = sha256(`${request.document.documentId}::SIGNED::${content}`);
    trail.push({ at: now.toISOString(), event: "COMPLETED", hash: finalHash });
    await prisma.$transaction([
      prisma.signatureRequest.update({ where: { id: request.id }, data: { status: "SIGNED", finalHash, auditTrail: trail as object[] } }),
      prisma.document.update({ where: { id: request.documentId }, data: { status: "SIGNED" } }),
    ]);
    await audit({ userId: user.id, action: "SIGNATURE_COMPLETED", resourceType: "SignatureRequest", resourceId: request.id, after: { documentId: request.document.documentId, finalHash } });
  } else {
    await prisma.signatureRequest.update({ where: { id: request.id }, data: { status: "PARTIALLY_SIGNED", auditTrail: trail as object[] } });
    await audit({ userId: user.id, action: "SIGNER_SIGNED", resourceType: "SignatureRequest", resourceId: request.id, after: { signer: signer.email, remaining } });
  }

  revalidatePath(`/app/signatures/${request.id}`);
  redirect(`/app/signatures/${request.id}?toast=Signature recorded`);
}

export async function voidSignatureRequest(requestId: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await prisma.signatureRequest.findUnique({ where: { id: requestId }, include: { document: true } });
  if (!request) redirect("/app/signatures?toast_error=Request not found");
  if (request.status === "SIGNED") redirect(`/app/signatures/${request.id}?toast_error=A completed request cannot be voided`);

  const trail = Array.isArray(request.auditTrail) ? (request.auditTrail as unknown[]) : [];
  trail.push({ at: new Date().toISOString(), event: "VOIDED", by: user.email });

  await prisma.signatureRequest.update({ where: { id: request.id }, data: { status: "VOIDED", auditTrail: trail as object[] } });
  await audit({ userId: user.id, action: "SIGNATURE_REQUEST_VOID", resourceType: "SignatureRequest", resourceId: request.id, after: { documentId: request.document.documentId } });
  revalidatePath(`/app/signatures/${request.id}`);
  redirect(`/app/signatures/${request.id}?toast=Request voided`);
}
