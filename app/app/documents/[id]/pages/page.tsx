import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentPageManager } from "@/components/app/document-page-manager";
import { saveDocumentPages } from "@/services/document-pages";

export const dynamic = "force-dynamic";

export default async function DocumentPagesPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("DOCUMENT_READ");
  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc || !doc.versions[0]) notFound();
  const editable = can(user, "DOCUMENT_EDIT") && doc.status === "DRAFT";
  return (
    <DocumentPageManager
      documentId={doc.id}
      title={doc.title}
      initialHtml={doc.versions[0].content}
      action={saveDocumentPages.bind(null, doc.id)}
      readOnly={!editable}
    />
  );
}
