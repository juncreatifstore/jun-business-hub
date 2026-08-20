import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { SignaturePlacementEditor } from "@/components/signatures/signature-placement-editor";
import { signatureRecipients } from "@/lib/signature-recipients";
import { saveSignaturePlacements } from "@/services/signature-placement";
import { PDFDocument } from "pdf-lib";

export const dynamic = "force-dynamic";

export default async function SignaturePreparePage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!can(user, "DOCUMENT_SIGN")) notFound();

  const request = await prisma.signatureRequest.findUnique({
    where: { id: params.id },
    include: {
      document: {
        include: {
          client: true,
          versions: { orderBy: { version: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!request) notFound();
  if (request.status !== "READY_FOR_SIGNATURE") notFound();

  const signers = signatureRecipients(request.recipients);
  let pageCount = 1;
  try {
    let bytes: Uint8Array;
    if (request.document.finalPdfKey) {
      const { storage } = await import("@/lib/storage");
      bytes = new Uint8Array(await storage().download(request.document.finalPdfKey));
    } else {
      const { renderDocumentPdf } = await import("@/services/pdf");
      bytes = await renderDocumentPdf({
        documentId: request.document.documentId,
        title: request.document.title,
        type: request.document.type,
        status: request.document.status,
        html: request.document.versions[0]?.content ?? "",
        clientName: request.document.client ? `${request.document.client.firstName} ${request.document.client.lastName}` : null,
      });
    }
    const pdf = await PDFDocument.load(bytes);
    pageCount = Math.max(1, pdf.getPageCount());
  } catch {
    pageCount = 1;
  }

  return (
    <div>
      <PageHeader
        title={`Prepare signature fields — ${request.document.documentId}`}
        subtitle="Place fields directly on the PDF before sending."
        actions={<Link href={`/app/signatures/${request.id}`}><Button variant="secondary">Back to request</Button></Link>}
      />
      <SignaturePlacementEditor
        requestId={request.id}
        documentId={request.documentId}
        signers={signers}
        pageCount={pageCount}
        action={saveSignaturePlacements.bind(null, request.id)}
      />
    </div>
  );
}
