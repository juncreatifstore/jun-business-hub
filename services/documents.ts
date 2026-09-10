"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { documentSchema, emptyToNull } from "@/lib/validation";
import { nextNumber, DOC_PREFIX } from "@/lib/sequence";
import { sha256 } from "@/lib/hash";
import { htmlToText, sanitizeDocumentHtml } from "@/lib/sanitize";
import { checkRefundAgreementArithmetic } from "@/lib/document-financial-integrity";
import { isDocumentFrozen } from "@/lib/portal";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/services/clients";

type TemplateRow = { id: string; name: string; type: string; content: string };

export async function createDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("DOCUMENT_CREATE");
  const parsed = documentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const clientId = emptyToNull(d.clientId);
  const caseId = emptyToNull(d.caseId);
  if (caseId) {
    const selectedCase = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } });
    if (!selectedCase) return { message: "The selected case is no longer available." };
    if (clientId && selectedCase.clientId !== clientId)
      return { message: "The selected case does not belong to the selected client." };
  }
  let template: TemplateRow | null = null;
  if (d.templateId) {
    const rows = await prisma.$queryRaw<
      TemplateRow[]
    >`SELECT id, name, type::text AS type, content FROM "DocumentTemplate" WHERE id = ${d.templateId} LIMIT 1`.catch(
      () => [] as TemplateRow[],
    );
    template = rows[0] ?? null;
    if (!template) return { message: "The selected template is no longer available." };
  }
  let content = d.content;
  if (!content && template?.content) content = template.content;
  if (!content) content = `<h1>${d.title}</h1><p></p>`;
  content = sanitizeDocumentHtml(content);
  const sourceNote = template ? `Template: ${template.name}` : "Blank / custom";
  const changeNote = `Initial draft · Language: ${d.language} · Source: ${sourceNote}`.slice(0, 300);
  const documentId = await nextNumber(DOC_PREFIX[d.type] ?? "JUN-DOC");
  const doc = await prisma.document.create({
    data: {
      documentId,
      type: d.type,
      title: d.title,
      clientId,
      caseId,
      authorId: user.id,
      versions: { create: { version: 1, content, authorId: user.id, changeNote, hash: sha256(content) } },
    },
  });
  await audit({
    userId: user.id,
    action: "DOCUMENT_CREATE",
    resourceType: "Document",
    resourceId: doc.id,
    after: {
      documentId,
      type: d.type,
      title: d.title,
      language: d.language,
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
    },
  });
  await logActivity({
    type: "DOCUMENT_CREATED",
    message: `Document ${documentId} created: ${d.title}`,
    userId: user.id,
    clientId: doc.clientId,
    caseId: doc.caseId,
  });
  redirect(`/app/documents/${doc.id}?toast=${encodeURIComponent(`Document ${documentId} created`)}`);
}

export async function saveDocumentVersion(documentId: string, formData: FormData) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const content = sanitizeDocumentHtml(String(formData.get("content") ?? "").slice(0, 500_000));
  const changeNote =
    String(formData.get("changeNote") ?? "")
      .trim()
      .slice(0, 300) || null;
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc) return;
  if (doc.status !== "DRAFT" || isDocumentFrozen(doc.status))
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent("Create a revision before editing a finalized document")}`,
    );
  const latest = doc.versions[0];
  const nextVersion = (latest?.version ?? 0) + 1;
  await prisma.$transaction([
    prisma.documentVersion.create({
      data: {
        documentId,
        version: nextVersion,
        content,
        authorId: user.id,
        changeNote,
        hash: sha256(content),
      },
    }),
    prisma.document.update({ where: { id: documentId }, data: { status: "DRAFT" } }),
  ]);
  await audit({
    userId: user.id,
    action: "DOCUMENT_VERSION_SAVE",
    resourceType: "Document",
    resourceId: documentId,
    after: { version: nextVersion },
  });
  await logActivity({
    type: "DOCUMENT_UPDATED",
    message: `Document ${doc.documentId} — version ${nextVersion} saved`,
    userId: user.id,
    clientId: doc.clientId,
    caseId: doc.caseId,
  });
  revalidatePath(`/app/documents/${documentId}`);
  redirect(`/app/documents/${documentId}?toast=${encodeURIComponent(`Version ${nextVersion} saved`)}`);
}

export async function refreshDocumentFromLatestData(documentId: string) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 }, client: true, case: true },
  });
  if (!doc || !doc.versions[0])
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent("Document or current version not found")}`,
    );
  if (!doc.clientId || !doc.client)
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent("This document is not linked to a client, so there is no client data to refresh")}`,
    );
  if (!["DRAFT", "FINAL"].includes(doc.status))
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent("Only DRAFT or FINAL documents can be refreshed from latest data")}`,
    );
  if (!process.env.OPENAI_API_KEY)
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent("JUN AI is not configured, so the document cannot be rebuilt from the latest client data")}`,
    );

  const latest = doc.versions[0];
  const previousStatus = doc.status;
  const currentExcerpt = htmlToText(latest.content).replace(/\s+/g, " ").trim().slice(0, 1050);
  const instruction = [
    `Update and rebuild the existing ${doc.type.replaceAll("_", " ")} titled “${doc.title}” using ALL latest authoritative client financial data now recorded in JUN.`,
    "Preserve the original business purpose, decision and overall structure, but replace any outdated statement that says no payment or no refund exists when the system now contains those records.",
    "Recalculate every total and remaining balance from the supplied current data. Never keep an old amount just because it appears in the previous draft.",
    "Do not add a company representative signature block. Company authenticity is established by the QR code, online verification page and integrity hash.",
    "If client acceptance is applicable, include a CLIENT acceptance/signature section stating that by signing or accepting, the client confirms having read the document and recognizes the listed information, transactions, amounts and details as exact.",
    "Include an authenticity clause stating that the electronic document is officially issued by JUN CREATIF AND TRAVEL LLC, is verifiable online, and is intended to retain its evidentiary/legal effect subject to applicable law.",
    currentExcerpt ? `Previous document excerpt for continuity only: ${currentExcerpt}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1990);

  const formData = new FormData();
  formData.set("instruction", instruction);
  formData.set("clientId", doc.clientId);
  if (doc.caseId) formData.set("caseId", doc.caseId);

  const { generateDocumentDraft } = await import("@/services/ai");
  const generated = await generateDocumentDraft(formData);
  if (!generated.content || generated.error) {
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent(generated.error || "JUN AI could not refresh this document")}`,
    );
  }

  const content = sanitizeDocumentHtml(generated.content.slice(0, 500_000));
  const financialIssues = checkRefundAgreementArithmetic(htmlToText(content));
  if (financialIssues.length) {
    const issue = financialIssues[0];
    await audit({
      userId: user.id,
      action: "DOCUMENT_REFRESH_FINANCIAL_CHECK_FAILED",
      resourceType: "Document",
      resourceId: documentId,
      after: { version: latest.version, code: issue.code, message: issue.message },
    });
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent(`${issue.message} The refreshed version was not saved.`)}`,
    );
  }

  const nextVersion = latest.version + 1;
  const changeNote =
    previousStatus === "FINAL"
      ? `AI revision from FINAL v${latest.version} using latest recorded client data`
      : `Updated from latest recorded client data (from v${latest.version})`;

  await prisma.$transaction([
    prisma.documentVersion.create({
      data: {
        documentId,
        version: nextVersion,
        content,
        authorId: user.id,
        changeNote: changeNote.slice(0, 300),
        hash: sha256(content),
        status: "DRAFT",
      },
    }),
    prisma.document.update({ where: { id: documentId }, data: { status: "DRAFT" } }),
  ]);

  await audit({
    userId: user.id,
    action: "DOCUMENT_REFRESH_FROM_LATEST_DATA",
    resourceType: "Document",
    resourceId: documentId,
    before: { status: previousStatus, version: latest.version, hash: latest.hash },
    after: { status: "DRAFT", version: nextVersion, source: "LATEST_CLIENT_FINANCIAL_DATA" },
  });
  await logActivity({
    type: "DOCUMENT_UPDATED",
    message: `Document ${doc.documentId} refreshed from latest client data as version ${nextVersion}`,
    userId: user.id,
    clientId: doc.clientId,
    caseId: doc.caseId,
  });
  revalidatePath(`/app/documents/${documentId}`);
  redirect(
    `/app/documents/${documentId}?toast=${encodeURIComponent(`Version ${nextVersion} created from the latest recorded client data. Review it before finalizing.`)}`,
  );
}

export async function createDocumentRevision(documentId: string, formData: FormData) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 300);
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc || doc.status !== "FINAL" || !doc.versions[0])
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent("Only a FINAL document can be reopened as a revision")}`,
    );
  if (!reason)
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent("A revision reason is required")}`,
    );
  const base = doc.versions[0];
  const nextVersion = base.version + 1;
  await prisma.$transaction([
    prisma.documentVersion.create({
      data: {
        documentId,
        version: nextVersion,
        content: base.content,
        authorId: user.id,
        changeNote: `Revision from FINAL v${base.version}: ${reason}`.slice(0, 300),
        hash: sha256(base.content),
        status: "DRAFT",
      },
    }),
    prisma.document.update({ where: { id: documentId }, data: { status: "DRAFT" } }),
  ]);
  await audit({
    userId: user.id,
    action: "DOCUMENT_REVISION_CREATE",
    resourceType: "Document",
    resourceId: documentId,
    before: {
      status: "FINAL",
      version: base.version,
      finalPdfHash: doc.finalPdfHash,
      finalPdfKey: doc.finalPdfKey,
    },
    after: { status: "DRAFT", version: nextVersion, reason },
  });
  await logActivity({
    type: "DOCUMENT_REVISION_CREATED",
    message: `Document ${doc.documentId} reopened as revision v${nextVersion}`,
    userId: user.id,
    clientId: doc.clientId,
    caseId: doc.caseId,
  });
  revalidatePath(`/app/documents/${documentId}`);
  redirect(
    `/app/documents/${documentId}?toast=${encodeURIComponent(`Revision v${nextVersion} created from FINAL v${base.version}`)}`,
  );
}

export async function finalizeDocument(documentId: string, formData?: FormData) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const confirmed = String(formData?.get("confirm") ?? "") === "FINALIZE";
  const acknowledged = String(formData?.get("acknowledge") ?? "") === "yes";
  const expectedVersion = Number(formData?.get("expectedVersion") ?? 0);
  const expectedHash = String(formData?.get("expectedHash") ?? "");
  if (!confirmed || !acknowledged)
    redirect(
      `/app/documents/${documentId}/finalize?error=${encodeURIComponent("Explicit confirmation is required")}`,
    );

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 }, client: true, case: true },
  });
  if (!doc || doc.versions.length === 0)
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent("Document has no version to finalize")}`,
    );
  if (doc.status !== "DRAFT")
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent("Only a DRAFT document can be finalized")}`,
    );
  const latest = doc.versions[0];
  const contentHash = sha256(latest.content);
  if (latest.version !== expectedVersion || contentHash !== expectedHash) {
    await audit({
      userId: user.id,
      action: "DOCUMENT_FINALIZE_STALE_PREVIEW",
      resourceType: "Document",
      resourceId: documentId,
      after: { expectedVersion, actualVersion: latest.version, expectedHash, actualHash: contentHash },
    });
    redirect(
      `/app/documents/${documentId}/finalize?error=${encodeURIComponent("The document changed after this preview was opened. Review the latest version before finalizing.")}`,
    );
  }

  const financialIssues = checkRefundAgreementArithmetic(htmlToText(latest.content));
  if (financialIssues.length) {
    const issue = financialIssues[0];
    await audit({
      userId: user.id,
      action: "DOCUMENT_FINALIZE_FINANCIAL_CHECK_FAILED",
      resourceType: "Document",
      resourceId: documentId,
      after: {
        version: latest.version,
        code: issue.code,
        totalDeposited: issue.totalDeposited,
        refundsReceived: issue.refundsReceived,
        expectedRemaining: issue.expectedRemaining,
        statedRemaining: issue.statedRemaining,
      },
    });
    redirect(
      `/app/documents/${documentId}/finalize?error=${encodeURIComponent(`${issue.message} Correct the draft before sealing it.`)}`,
    );
  }

  let finalPdfKey: string;
  let finalPdfHash: string;
  try {
    const [{ renderDocumentPdf }, { storage, makeStorageKey }] = await Promise.all([
      import("@/services/pdf"),
      import("@/lib/storage"),
    ]);
    const bytes = await renderDocumentPdf({
      documentId: doc.documentId,
      title: doc.title,
      type: doc.type,
      status: "FINAL",
      html: latest.content,
      clientName: doc.client ? `${doc.client.firstName} ${doc.client.lastName}` : null,
      caseNumber: doc.case?.caseNumber ?? null,
    });
    const pdfBuffer = Buffer.from(bytes);
    finalPdfHash = sha256(pdfBuffer);
    finalPdfKey = makeStorageKey(
      "documents/final",
      `${doc.documentId}-v${latest.version}-${finalPdfHash.slice(0, 12)}.pdf`,
    );
    await storage().upload(finalPdfKey, pdfBuffer, "application/pdf");
    const stored = await storage().download(finalPdfKey);
    if (sha256(stored) !== finalPdfHash) throw new Error("Stored PDF integrity verification failed");
  } catch (e) {
    await audit({
      userId: user.id,
      action: "DOCUMENT_FINALIZE_FAILED",
      resourceType: "Document",
      resourceId: documentId,
      after: {
        version: latest.version,
        error: e instanceof Error ? e.message : "PDF generation/storage failed",
      },
    });
    redirect(
      `/app/documents/${documentId}/finalize?error=${encodeURIComponent("Final PDF could not be generated and verified. The document remains DRAFT.")}`,
    );
  }

  await prisma.$transaction([
    prisma.documentVersion.update({ where: { id: latest.id }, data: { status: "FINAL", hash: contentHash } }),
    prisma.document.update({
      where: { id: documentId },
      data: { status: "FINAL", finalHash: contentHash, finalizedAt: new Date(), finalPdfKey, finalPdfHash },
    }),
  ]);
  await audit({
    userId: user.id,
    action: "DOCUMENT_FINALIZE",
    resourceType: "Document",
    resourceId: documentId,
    after: { version: latest.version, contentHash, finalPdfHash, finalPdfKey },
  });
  await logActivity({
    type: "DOCUMENT_FINALIZED",
    message: `Document ${doc.documentId} finalized and sealed (v${latest.version})`,
    userId: user.id,
    clientId: doc.clientId,
    caseId: doc.caseId,
  });
  revalidatePath(`/app/documents/${documentId}`);
  redirect(
    `/app/documents/${documentId}?toast=${encodeURIComponent("Document finalized — PDF and integrity hashes sealed")}`,
  );
}

export async function restoreDocumentVersion(documentId: string, versionId: string) {
  const user = await assertPermission("DOCUMENT_EDIT");
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  if (!doc) return;
  if (doc.status !== "DRAFT")
    redirect(
      `/app/documents/${documentId}?toast_error=${encodeURIComponent("Create a revision before restoring content into a finalized document")}`,
    );
  const source = doc.versions.find((v) => v.id === versionId);
  if (!source) return;
  const nextVersion = (doc.versions[0]?.version ?? 0) + 1;
  await prisma.documentVersion.create({
    data: {
      documentId,
      version: nextVersion,
      content: source.content,
      authorId: user.id,
      changeNote: `Restored from version ${source.version}`,
      hash: sha256(source.content),
    },
  });
  await audit({
    userId: user.id,
    action: "DOCUMENT_VERSION_RESTORE",
    resourceType: "Document",
    resourceId: documentId,
    after: { fromVersion: source.version, newVersion: nextVersion },
  });
  await logActivity({
    type: "DOCUMENT_UPDATED",
    message: `Document ${doc.documentId} — restored v${source.version} as v${nextVersion}`,
    userId: user.id,
    clientId: doc.clientId,
    caseId: doc.caseId,
  });
  revalidatePath(`/app/documents/${documentId}`);
  redirect(
    `/app/documents/${documentId}?toast=${encodeURIComponent(`Version ${source.version} restored as version ${nextVersion}`)}`,
  );
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
      versions: {
        create: {
          version: 1,
          content: doc.versions[0].content,
          authorId: user.id,
          changeNote: `Duplicated from ${doc.documentId}`,
          hash: doc.versions[0].hash,
        },
      },
    },
  });
  await audit({
    userId: user.id,
    action: "DOCUMENT_DUPLICATE",
    resourceType: "Document",
    resourceId: copy.id,
    after: { from: doc.documentId, to: newId },
  });
  redirect(`/app/documents/${copy.id}?toast=${encodeURIComponent(`Duplicated as ${newId}`)}`);
}

export async function archiveDocument(documentId: string) {
  const user = await assertPermission("DOCUMENT_DELETE");
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return;
  await prisma.document.update({ where: { id: documentId }, data: { status: "ARCHIVED" } });
  await audit({
    userId: user.id,
    action: "DOCUMENT_ARCHIVE",
    resourceType: "Document",
    resourceId: documentId,
    before: { status: doc.status },
    after: { status: "ARCHIVED" },
  });
  redirect(`/app/documents?toast=${encodeURIComponent("Document archived")}`);
}
