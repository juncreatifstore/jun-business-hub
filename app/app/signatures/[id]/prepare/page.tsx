import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { SignaturePlacementEditor } from "@/components/signatures/signature-placement-editor";
import { signatureRecipients } from "@/lib/signature-recipients";
import { saveSignaturePlacements } from "@/services/signature-placement";

export const dynamic = "force-dynamic";

export default async function SignaturePreparePage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!can(user, "DOCUMENT_SIGN")) notFound();

  const request = await prisma.signatureRequest.findUnique({
    where: { id: params.id },
    include: { document: true },
  });
  if (!request) notFound();
  if (request.status !== "READY_FOR_SIGNATURE") notFound();

  const signers = signatureRecipients(request.recipients);

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
        action={saveSignaturePlacements.bind(null, request.id)}
      />
    </div>
  );
}
