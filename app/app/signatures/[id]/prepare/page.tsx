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
import { ArrowLeft, Move } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SignaturePreparePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
  if (!request || request.status !== "READY_FOR_SIGNATURE") notFound();

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
        clientName: request.document.client
          ? `${request.document.client.firstName} ${request.document.client.lastName}`
          : null,
      });
    }
    const pdf = await PDFDocument.load(bytes);
    pageCount = Math.max(1, pdf.getPageCount());
  } catch {
    pageCount = 1;
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="JUN Secure Sign"
        title={`Placement des champs · ${request.document.documentId}`}
        subtitle="Placez les champs directement sur le PDF avant l’envoi au client. Sur téléphone, faites défiler le document horizontalement si nécessaire."
        actions={
          <Link href={`/app/signatures/${request.id}`} className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full sm:w-auto">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Retour à la demande
            </Button>
          </Link>
        }
      />
      <div className="rounded-2xl border border-blue-400/15 bg-blue-500/[0.04] p-3 text-xs leading-5 text-muted2 sm:p-4">
        <div className="flex items-start gap-2">
          <Move className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p>
            <strong className="text-ink">Conseil mobile :</strong> choisissez le signataire et le type de
            champ, puis touchez le PDF pour placer le champ. Le déplacement et le redimensionnement restent
            disponibles au tactile.
          </p>
        </div>
      </div>
      <div className="min-w-0 overflow-hidden">
        <SignaturePlacementEditor
          requestId={request.id}
          documentId={request.documentId}
          signers={signers}
          pageCount={pageCount}
          action={saveSignaturePlacements.bind(null, request.id)}
        />
      </div>
    </div>
  );
}
