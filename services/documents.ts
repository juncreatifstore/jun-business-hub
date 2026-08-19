"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { documentSchema, emptyToNull } from "@/lib/validation";
import { nextNumber, DOC_PREFIX } from "@/lib/sequence";
import { sha256 } from "@/lib/hash";
import { sanitizeDocumentHtml } from "@/lib/sanitize";
import { isDocumentFrozen } from "@/lib/portal";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/services/clients";

export async function createDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("DOCUMENT_CREATE");
  const parsed = documentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  let content = d.content;
  if (!content) content = `<h1>${d.title}</h1><p></p>`;
  content = sanitizeDocumentHtml(content);

  const documentId = await nextNumber(DOC_PREFIX[d.type] ?? "JUN-DOC");
  const doc = await prisma.document.create({
    data: {
      documentId,
      type: d.type,
      title: d.title,
      clientId: emptyToNull(d.clientId),
      caseId: emptyToNull(d.caseId),
      authorId: user.id,
      versions: {
        create: { version: 1, content, authorId: user.id, changeNote: "Initial draft", hash: sha256(content) },
      },
    },
  });
  await audit({ userId: user.id, action: "DOCUMENT_CREATE", resourceType: "Document", resourceId: doc.id, after: { documentId, type: d.type, title: d.title } });
  await logActivity({ type: "DOCUMENT_CREATED", message: `Document ${documentId} created: ${d.title}`, userId: user.id, clientId: doc.clientId, caseId: doc.caseId });
  redirect(`/app/documents/${doc.id}?toast=${encodeURIComponent(`Document ${documentId} created`)}`);
}

// Saves a NEW version — versions are immutable; a FINAL version is never overwritten.
export async function saveDocumentVersion(documentId: string, formData: FormData) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const content = sanitizeDocumentHtml(String(formData.get("content") ?? "").slice(0, 500_000));
  const changeNote = String(formData.get("changeNote") ?? "").trim().slice(0, 300) || null;
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc) return;
  if (isDocumentFrozen(doc.status)) {
    redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent("This document is frozen and cannot be edited")}`);
  }
  const latest = doc.versions[0];
  const nextVersion = (latest?.version ?? 0) + 1;
  await prisma.$transaction([
    prisma.documentVersion.create({
      data: { documentId, version: nextVersion, content, authorId: user.id, changeNote, hash: sha256(content) },
    }),
    prisma.document.update({ where: { id: documentId }, data: { status: "DRAFT", finalHash: null, finalizedAt: null } }),
  ]);
  await audit({ userId: user.id, action: "DOCUMENT_VERSION_SAVE", resourceType: "Document", resourceId: documentId, after: { version: nextVersion } });
  await logActivity({ type: "DOCUMENT_UPDATED", message: `Document ${doc.documentId} — version ${nextVersion} saved`, userId: user.id, clientId: doc.clientId, caseId: doc.caseId });
  revalidatePath(`/app/documents/${documentId}`);
  redirect(`/app/documents/${documentId}?toast=${encodeURIComponent(`Version ${nextVersion} saved`)}`);
}

export async function finalizeDocument(documentId: string) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc || doc.versions.length === 0) return;
  if (doc.status !== "DRAFT") return;
  const latest = doc.versions[0];
  const hash = sha256(latest.content);

  let finalPdfKey: string | null = null;
  let finalPdfHash: string | null = null;
  try {
    const [{ renderDocumentPdf }, { storage, makeStorageKey }, extra] = await Promise.all([
      import("@/services/pdf"),
      import("@/lib/storage"),
      prisma.document.findUnique({ where: { id: documentId }, include: { client: true, case: true } }),
    ]);
    const bytes = await renderDocumentPdf({
      documentId: doc.documentId,
      title: doc.title,
      type: doc.type,
      status: "FINAL",
      html: latest.content,
      clientName: extra?.client ? `${extra.client.firstName} ${extra.client.lastName}` : null,
      caseNumber: extra?.case?.caseNumber ?? null,
    });
    finalPdfKey = makeStorageKey("documents", `${doc.documentId}.pdf`);
    await storage().upload(finalPdfKey, Buffer.from(bytes), "application/pdf");
    finalPdfHash = sha256(Buffer.from(bytes));
  } catch (e) {
    console.error("Final PDF generation failed (document still finalized):", e);
  }

  await prisma.$transaction([
    prisma.documentVersion.update({ where: { id: latest.id }, data: { status: "FINAL", hash } }),
    prisma.document.update({ where: { id: documentId }, data: { status: "FINAL", finalHash: hash, finalizedAt: new Date(), finalPdfKey, finalPdfHash } }),
  ]);
  await audit({ userId: user.id, action: "DOCUMENT_FINALIZE", resourceType: "Document", resourceId: documentId, after: { version: latest.version, hash } });
  await logActivity({ type: "DOCUMENT_FINALIZED", message: `Document ${doc.documentId} finalized (v${latest.version})`, userId: user.id, clientId: doc.clientId, caseId: doc.caseId });
  revalidatePath(`/app/documents/${documentId}`);
  redirect(`/app/documents/${documentId}?toast=${encodeURIComponent("Document finalized — integrity hash recorded")}`);
}

export async function duplicateDocument(documentId: string) {
  const user = await assertPermission("DOCUMENT_CREATE");
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc || doc.versions.length === 0) return;
  const newId = await nextNumber(DOC_PREFIX[doc.type] ?? "JUN-DOC");
  const copy = await prisma.document.create({
    data: {
      documentId: newId,
      type: doc.type,
      title: `${doc.title} (copy)`,
      clientId: doc.clientId,
      caseId: doc.caseId,
      authorId: user.id,
      versions: { create: { version: 1, content: doc.versions[0].content, authorId: user.id, changeNote: `Duplicated from ${doc.documentId}`, hash: doc.versions[0].hash } },
    },
  });
  await audit({ userId: user.id, action: "DOCUMENT_DUPLICATE", resourceType: "Document", resourceId: copy.id, after: { from: doc.documentId, to: newId } });
  redirect(`/app/documents/${copy.id}?toast=${encodeURIComponent(`Duplicated as ${newId}`)}`);
}

export async function archiveDocument(documentId: string) {
  const user = await assertPermission("DOCUMENT_DELETE");
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return;
  await prisma.document.update({ where: { id: documentId }, data: { status: "ARCHIVED" } });
  await audit({ userId: user.id, action: "DOCUMENT_ARCHIVE", resourceType: "Document", resourceId: documentId, before: { status: doc.status }, after: { status: "ARCHIVED" } });
  redirect(`/app/documents?toast=${encodeURIComponent("Document archived")}`);
}
