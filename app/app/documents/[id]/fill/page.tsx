import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentFillPreview } from "@/components/app/document-fill-preview";

export const dynamic = "force-dynamic";

export default async function DocumentFillPage({ params }: { params: { id: string } }) {
  await requirePermission("DOCUMENT_READ");
  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc) notFound();
  return <DocumentFillPreview documentId={doc.id} title={doc.title} html={doc.versions[0]?.content ?? "<p></p>"} />;
}
