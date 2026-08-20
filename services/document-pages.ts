"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { sanitizeDocumentHtml } from "@/lib/sanitize";
import { sha256 } from "@/lib/hash";
import { audit, logActivity } from "@/lib/audit";
import { isDocumentFrozen } from "@/lib/portal";
import { parseDocumentPages } from "@/lib/document-pages";

export async function saveDocumentPages(documentId: string, formData: FormData) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc || !doc.versions[0]) redirect(`/app/editor?toast_error=${encodeURIComponent("Document not found")}`);
  if (doc.status !== "DRAFT" || isDocumentFrozen(doc.status)) {
    redirect(`/app/editor/${documentId}?toast_error=${encodeURIComponent("Create a revision before reorganizing a finalized document")}`);
  }

  const raw = String(formData.get("content") ?? "").slice(0, 500_000);
  const content = sanitizeDocumentHtml(raw);
  const pages = parseDocumentPages(content);
  if (!content.trim() || pages.length === 0 || pages.length > 250) {
    redirect(`/app/editor/${documentId}/pages?error=${encodeURIComponent("Invalid page structure")}`);
  }

  const current = doc.versions[0];
  if (sha256(content) === sha256(current.content)) {
    redirect(`/app/editor/${documentId}/pages?toast=${encodeURIComponent("No page changes to save")}`);
  }
  const version = current.version + 1;
  await prisma.documentVersion.create({
    data: {
      documentId,
      version,
      content,
      authorId: user.id,
      changeNote: `Page manager: ${pages.length} page(s) organized`.slice(0, 300),
      hash: sha256(content),
    },
  });
  await audit({
    userId: user.id,
    action: "DOCUMENT_PAGES_SAVE",
    resourceType: "Document",
    resourceId: documentId,
    after: { version, pageCount: pages.length, rotations: pages.map((p) => p.rotation) },
  });
  await logActivity({
    type: "DOCUMENT_UPDATED",
    message: `Document ${doc.documentId} — pages reorganized in version ${version}`,
    userId: user.id,
    clientId: doc.clientId,
    caseId: doc.caseId,
  });
  revalidatePath(`/app/editor/${documentId}`);
  revalidatePath(`/app/documents/${documentId}`);
  redirect(`/app/editor/${documentId}/pages?toast=${encodeURIComponent(`Page layout saved as version ${version}`)}`);
}
