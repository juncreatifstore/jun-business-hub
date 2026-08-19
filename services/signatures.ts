"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { sha256 } from "@/lib/hash";
import { signatureRecipients, type SignatureRecipient } from "@/lib/signature-recipients";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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
    if (!docusignConfigured()) throw new Error("SIGNATURE_PROVIDER=DOCUSIGN but DocuSign credentials are missing");
    return new DocusignProvider(await finalPdf());
  }
  return new MockSignatureProvider();
}

export async function createSignatureRequest(documentId: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const doc = await prisma.document.findUnique({ where: { id: documentId }, include: { client: true } });
  if (!doc) redirect("/app/documents?toast_error=Document not found");
  if (doc.status !== "FINAL") redirect(`/app/documents/${doc.id}?toast_error=Only finalized documents can be sent for signature`);

  const recipients: SignatureRecipient[] = [];
  if (doc.client) recipients.push({ name: `${doc.client.firstName} ${doc.client.lastName}`, email: doc.client.email ?? "unknown@juncreatif.org", order: 1, signedAt: null });
  recipients.push({ name: `${user.firstName} ${user.lastName}`, email: user.email, order: recipients.length + 1, signedAt: null });

  const provider = await signatureProvider(async () => {
    if (doc.finalPdfKey) {
      const { storage } = await import("@/lib/storage");
      return new Uint8Array(await storage().download(doc.finalPdfKey));
    }
    const { renderDocumentPdf } = await import("@/services/pdf");
    const latest = await prisma.documentVersion.findFirst({ where: { documentId: doc.id }, orderBy: { version: "desc" } });
    return renderDocumentPdf({ documentId: doc.documentId, title: doc.title, type: doc.type, status: doc.status, html: latest?.content ?? "", clientName: doc.client ? `${doc.client.firstName} ${doc.client.lastName}` : null });
  });

  const envelope = await provider.createEnvelope({ documentId: doc.documentId, title: doc.title, signers: recipients.map(({ name, email }) => ({ name, email })) });
  const request = await prisma.signatureRequest.create({
    data: {
      documentId: doc.id,
      provider: envelope.provider,
      providerEnvelopeId: envelope.envelopeId,
      status: "SENT",
      recipients: recipients as never,
      createdById: user.id,
      sentAt: new Date(),
    },
  });

  await audit({ userId: user.id, action: "SIGNATURE_REQUEST_CREATE", resourceType: "SignatureRequest", resourceId: request.id, after: { documentId: doc.documentId, provider: envelope.provider, recipients: recipients.length } });
  await logActivity({ userId: user.id, type: "SIGNATURE_REQUESTED", message: `Signature request sent for ${doc.documentId}`, clientId: doc.clientId ?? undefined, caseId: doc.caseId ?? undefined });
  revalidatePath(`/app/documents/${doc.id}`);
  redirect(`/app/signatures/${request.id}?toast=${encodeURIComponent(envelope.provider === "DOCUSIGN" ? "Signature request sent via DocuSign." : `Signature request created via ${envelope.provider}`)}`);
}

export async function mockSignRecipient(requestId: string, recipientIndex: number): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  if (process.env.NODE_ENV === "production") redirect("/app/signatures?toast_error=Mock signing is disabled in production");
  const request = await prisma.signatureRequest.findUnique({
    where: { id: requestId },
    include: { document: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } },
  });
  if (!request) redirect("/app/signatures?toast_error=Request not found");
  if (request.provider !== "MOCK") redirect(`/app/signatures/${request.id}?toast_error=This request uses ${request.provider}`);
  if (["SIGNED", "DECLINED", "EXPIRED", "VOIDED"].includes(request.status)) redirect(`/app/signatures/${request.id}?toast_error=This request is closed`);

  const recipients = signatureRecipients(request.recipients);
  const recipient = recipients[recipientIndex];
  if (!recipient) redirect(`/app/signatures/${request.id}?toast_error=Recipient not found`);
  if (recipient.signedAt) redirect(`/app/signatures/${request.id}?toast_error=Already signed`);
  recipients[recipientIndex] = { ...recipient, signedAt: new Date().toISOString() };
  const complete = recipients.every((r) => Boolean(r.signedAt));

  if (complete) {
    const content = request.document.versions[0]?.content ?? "";
    const signedPdfHash = sha256(`${request.document.documentId}::SIGNED::${content}`);
    await prisma.$transaction([
      prisma.signatureRequest.update({ where: { id: request.id }, data: { recipients: recipients as never, status: "SIGNED", completedAt: new Date(), signedPdfHash } }),
      prisma.document.update({ where: { id: request.documentId }, data: { status: "SIGNED" } }),
    ]);
    await audit({ userId: user.id, action: "SIGNATURE_COMPLETED", resourceType: "SignatureRequest", resourceId: request.id, after: { documentId: request.document.documentId, signedPdfHash } });
  } else {
    await prisma.signatureRequest.update({ where: { id: request.id }, data: { recipients: recipients as never, status: "PARTIALLY_SIGNED" } });
    await audit({ userId: user.id, action: "SIGNER_SIGNED", resourceType: "SignatureRequest", resourceId: request.id, after: { signer: recipient.email } });
  }
  revalidatePath(`/app/signatures/${request.id}`);
  redirect(`/app/signatures/${request.id}?toast=Signature recorded`);
}

export async function voidSignatureRequest(requestId: string): Promise<void> {
  const user = await assertPermission("DOCUMENT_SIGN");
  const request = await prisma.signatureRequest.findUnique({ where: { id: requestId }, include: { document: true } });
  if (!request) redirect("/app/signatures?toast_error=Request not found");
  if (request.status === "SIGNED") redirect(`/app/signatures/${request.id}?toast_error=A completed request cannot be voided`);
  await prisma.signatureRequest.update({ where: { id: request.id }, data: { status: "VOIDED" } });
  await audit({ userId: user.id, action: "SIGNATURE_REQUEST_VOID", resourceType: "SignatureRequest", resourceId: request.id, after: { documentId: request.document.documentId } });
  revalidatePath(`/app/signatures/${request.id}`);
  redirect(`/app/signatures/${request.id}?toast=Request voided`);
}
