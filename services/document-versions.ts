"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { sha256 } from "@/lib/hash";
import { isDocumentFrozen } from "@/lib/portal";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function restoreDocumentVersion(documentId: string, versionId: string) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  if (!doc) redirect(`/app/documents?toast_error=${encodeURIComponent("Document not found")}`);
  if (isDocumentFrozen(doc.status)) redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent("This document is frozen and cannot be restored")}`);

  const source = doc.versions.find((v) => v.id === versionId);
  if (!source) redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent("Version not found")}`);
  const latest = doc.versions[0];
  if (latest?.id === source.id) redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent("That version is already current")}`);

  const nextVersion = (latest?.version ?? 0) + 1;
  await prisma.$transaction([
    prisma.documentVersion.create({
      data: {
        documentId,
        version: nextVersion,
        content: source.content,
        authorId: user.id,
        changeNote: `Restored from version ${source.version}`,
        hash: sha256(source.content),
      },
    }),
    prisma.document.update({
      where: { id: documentId },
      data: { status: "DRAFT", finalHash: null, finalizedAt: null, finalPdfKey: null, finalPdfHash: null },
    }),
  ]);

  await audit({
    userId: user.id,
    action: "DOCUMENT_VERSION_RESTORE",
    resourceType: "Document",
    resourceId: documentId,
    before: { currentVersion: latest?.version ?? null },
    after: { restoredFromVersion: source.version, newVersion: nextVersion },
  });
  await logActivity({
    type: "DOCUMENT_VERSION_RESTORED",
    message: `Document ${doc.documentId}: version ${source.version} restored as version ${nextVersion}`,
    userId: user.id,
    clientId: doc.clientId,
    caseId: doc.caseId,
    resourceType: "Document",
    resourceId: documentId,
  });
  revalidatePath(`/app/documents/${documentId}`);
  redirect(`/app/documents/${documentId}?toast=${encodeURIComponent(`Version ${source.version} restored as v${nextVersion}`)}`);
}
