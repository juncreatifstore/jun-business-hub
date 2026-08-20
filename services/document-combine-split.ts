"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { nextNumber, DOC_PREFIX } from "@/lib/sequence";
import { sha256 } from "@/lib/hash";
import { parseDocumentPages, serializeDocumentPages } from "@/lib/document-pages";
import { sanitizeDocumentHtml } from "@/lib/sanitize";

const MAX_SOURCE_DOCUMENTS = 30;
const MAX_OUTPUT_PAGES = 250;

export async function combineDocuments(formData: FormData) {
  const user = await assertPermission("DOCUMENT_CREATE");
  const sourceIds = formData.getAll("sourceIds").map(String).filter(Boolean).slice(0, MAX_SOURCE_DOCUMENTS);
  if (sourceIds.length < 2) {
    redirect(`/app/documents/combine?error=${encodeURIComponent("Select at least two documents to combine")}`);
  }

  const title = String(formData.get("title") ?? "").trim().slice(0, 180);
  if (!title) redirect(`/app/documents/combine?error=${encodeURIComponent("A title is required")}`);

  const docs = await prisma.document.findMany({
    where: { id: { in: sourceIds } },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const byId = new Map(docs.map((d) => [d.id, d]));
  const ordered = sourceIds.map((id) => byId.get(id)).filter((d): d is NonNullable<typeof d> => Boolean(d?.versions[0]));
  if (ordered.length !== sourceIds.length) {
    redirect(`/app/documents/combine?error=${encodeURIComponent("One or more selected documents are unavailable")}`);
  }

  const pages = ordered.flatMap((doc) => parseDocumentPages(doc.versions[0].content));
  if (pages.length === 0 || pages.length > MAX_OUTPUT_PAGES) {
    redirect(`/app/documents/combine?error=${encodeURIComponent(`Combined document must contain between 1 and ${MAX_OUTPUT_PAGES} pages`)}`);
  }

  const first = ordered[0];
  const sameClient = ordered.every((d) => d.clientId === first.clientId) ? first.clientId : null;
  const sameCase = ordered.every((d) => d.caseId === first.caseId) ? first.caseId : null;
  const type = first.type;
  const content = sanitizeDocumentHtml(serializeDocumentPages(pages));
  const documentId = await nextNumber(DOC_PREFIX[type] ?? "JUN-DOC");

  const combined = await prisma.document.create({
    data: {
      documentId,
      type,
      title,
      clientId: sameClient,
      caseId: sameCase,
      authorId: user.id,
      versions: {
        create: {
          version: 1,
          content,
          authorId: user.id,
          changeNote: `Combined from ${ordered.length} documents / ${pages.length} pages`.slice(0, 300),
          hash: sha256(content),
        },
      },
    },
  });

  await audit({
    userId: user.id,
    action: "DOCUMENT_COMBINE",
    resourceType: "Document",
    resourceId: combined.id,
    after: {
      documentId,
      sourceDocuments: ordered.map((d) => ({ id: d.id, documentId: d.documentId, version: d.versions[0].version })),
      pageCount: pages.length,
    },
  });
  await logActivity({
    type: "DOCUMENT_CREATED",
    message: `Combined document ${documentId} created from ${ordered.length} documents`,
    userId: user.id,
    clientId: combined.clientId,
    caseId: combined.caseId,
  });

  redirect(`/app/documents/${combined.id}/pages?toast=${encodeURIComponent(`Combined ${ordered.length} documents into ${pages.length} pages`)}`);
}

export async function splitDocument(documentId: string, formData: FormData) {
  const user = await assertPermission("DOCUMENT_CREATE");
  const source = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!source || !source.versions[0]) {
    redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent("Source document is unavailable")}`);
  }

  const pages = parseDocumentPages(source.versions[0].content);
  const selected = formData.getAll("pageIndexes")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < pages.length)
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .sort((a, b) => a - b);
  if (!selected.length) {
    redirect(`/app/documents/${documentId}/split?error=${encodeURIComponent("Select at least one page to split")}`);
  }

  const baseTitle = String(formData.get("titlePrefix") ?? "").trim().slice(0, 120) || source.title;
  const created: Array<{ id: string; documentId: string; page: number }> = [];

  for (const pageIndex of selected) {
    const page = pages[pageIndex];
    const content = sanitizeDocumentHtml(serializeDocumentPages([page]));
    const newDocumentId = await nextNumber(DOC_PREFIX[source.type] ?? "JUN-DOC");
    const copy = await prisma.document.create({
      data: {
        documentId: newDocumentId,
        type: source.type,
        title: `${baseTitle} — Page ${pageIndex + 1}`.slice(0, 180),
        clientId: source.clientId,
        caseId: source.caseId,
        authorId: user.id,
        versions: {
          create: {
            version: 1,
            content,
            authorId: user.id,
            changeNote: `Split from ${source.documentId} v${source.versions[0].version}, page ${pageIndex + 1}`.slice(0, 300),
            hash: sha256(content),
          },
        },
      },
    });
    created.push({ id: copy.id, documentId: newDocumentId, page: pageIndex + 1 });
  }

  await audit({
    userId: user.id,
    action: "DOCUMENT_SPLIT",
    resourceType: "Document",
    resourceId: source.id,
    after: {
      sourceDocumentId: source.documentId,
      sourceVersion: source.versions[0].version,
      created,
    },
  });
  await logActivity({
    type: "DOCUMENT_CREATED",
    message: `${created.length} document(s) split from ${source.documentId}`,
    userId: user.id,
    clientId: source.clientId,
    caseId: source.caseId,
  });

  redirect(`/app/documents?toast=${encodeURIComponent(`${created.length} split document(s) created`)}`);
}
