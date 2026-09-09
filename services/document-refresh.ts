"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { sha256 } from "@/lib/hash";
import { htmlToText, sanitizeDocumentHtml } from "@/lib/sanitize";
import { checkRefundAgreementArithmetic } from "@/lib/document-financial-integrity";
import { generateDocumentDraft } from "@/services/ai";

export type DocumentRefreshState = {
  status?: "success" | "error";
  message?: string;
  version?: number;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Unknown server error while updating the document.";
}

/**
 * Refresh an existing document from the latest authoritative client data.
 * Unlike the previous redirect-only action, this action always returns a visible
 * success/error state to the page so a failed AI/database operation cannot look
 * like a dead button.
 */
export async function refreshDocumentFromLatestDataAction(
  documentId: string,
  _previousState: DocumentRefreshState,
  _formData: FormData,
): Promise<DocumentRefreshState> {
  let user: Awaited<ReturnType<typeof assertPermission>>;
  try {
    user = await assertPermission("DOCUMENT_EDIT");
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }

  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 },
        client: true,
        case: true,
      },
    });

    if (!doc || !doc.versions[0]) {
      return { status: "error", message: "Document or current version not found." };
    }
    if (!doc.clientId || !doc.client) {
      return { status: "error", message: "This document is not linked to a client, so there is no client data to refresh." };
    }
    if (!["DRAFT", "FINAL"].includes(doc.status)) {
      return { status: "error", message: "Only DRAFT or FINAL documents can be updated from latest data." };
    }
    if (!process.env.OPENAI_API_KEY) {
      return { status: "error", message: "JUN AI is not configured on the server (OPENAI_API_KEY is missing)." };
    }

    const latest = doc.versions[0];
    const previousStatus = doc.status;
    const currentText = htmlToText(latest.content).replace(/\s+/g, " ").trim().slice(0, 1400);

    const instruction = [
      `Rebuild the existing ${doc.type.replaceAll("_", " ")} titled “${doc.title}” from ALL latest authoritative financial records currently stored for this client.`,
      "Keep the same business purpose and decision, but replace every obsolete statement saying that no payment or no refund exists when the current records show otherwise.",
      "Recalculate all totals, refund sums and remaining balances. Do not copy an old total unless it is still mathematically correct from the current records.",
      "Preserve the language of the existing document.",
      "Do not add a signature block for the company representative. Company authenticity is established by the document ID, QR code, online verification page and integrity hash.",
      "For an agreement or refund agreement, include a CLIENT acceptance/signature section. State that by signing or electronically accepting, the client confirms having read the document and recognizes the information, transactions, amounts and details accepted by the client as exact.",
      "Include a concise authenticity clause explaining that the electronic document is officially issued by JUN CREATIF AND TRAVEL LLC and verifiable online; do not make an absolute legal-validity claim that overrides applicable law.",
      currentText ? `Existing document context to preserve where still accurate: ${currentText}` : "",
    ].filter(Boolean).join(" ").slice(0, 1990);

    const input = new FormData();
    input.set("instruction", instruction);
    input.set("clientId", doc.clientId);
    if (doc.caseId) input.set("caseId", doc.caseId);

    let generated;
    try {
      generated = await generateDocumentDraft(input);
    } catch (error) {
      await audit({
        userId: user.id,
        action: "DOCUMENT_REFRESH_AI_ERROR",
        resourceType: "Document",
        resourceId: documentId,
        after: { version: latest.version, error: errorMessage(error) },
      }).catch(() => undefined);
      return { status: "error", message: `JUN AI could not update the document: ${errorMessage(error)}` };
    }

    if (!generated.content || generated.error) {
      return { status: "error", message: generated.error || "JUN AI returned no updated document content." };
    }

    const content = sanitizeDocumentHtml(generated.content.slice(0, 500_000));
    if (htmlToText(content).trim().length < 80) {
      return { status: "error", message: "The generated update was unexpectedly empty. The current document was left unchanged." };
    }

    const financialIssues = checkRefundAgreementArithmetic(htmlToText(content));
    if (financialIssues.length) {
      const issue = financialIssues[0];
      await audit({
        userId: user.id,
        action: "DOCUMENT_REFRESH_FINANCIAL_CHECK_FAILED",
        resourceType: "Document",
        resourceId: documentId,
        after: { version: latest.version, code: issue.code, message: issue.message },
      }).catch(() => undefined);
      return { status: "error", message: `${issue.message} The new version was NOT saved.` };
    }

    // Re-read the latest version immediately before writing, so two clicks cannot
    // silently create the same version number from a stale page.
    const current = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { version: "desc" },
      select: { id: true, version: true },
    });
    if (!current || current.id !== latest.id) {
      return { status: "error", message: "The document changed while the update was running. Refresh the page and try again on the newest version." };
    }

    const nextVersion = latest.version + 1;
    const changeNote = previousStatus === "FINAL"
      ? `Revision from FINAL v${latest.version} using latest recorded client data`
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
      prisma.document.update({
        where: { id: documentId },
        data: { status: "DRAFT" },
      }),
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
      message: `Document ${doc.documentId} updated from latest client data as version ${nextVersion}`,
      userId: user.id,
      clientId: doc.clientId,
      caseId: doc.caseId,
      resourceType: "Document",
      resourceId: documentId,
    });

    revalidatePath(`/app/documents/${documentId}`);
    revalidatePath(`/app/documents/${documentId}/finalize`);
    revalidatePath("/app/documents");

    return {
      status: "success",
      version: nextVersion,
      message: `Version ${nextVersion} was created from the latest recorded client data. Review it before finalizing.`,
    };
  } catch (error) {
    await audit({
      userId: user.id,
      action: "DOCUMENT_REFRESH_FAILED",
      resourceType: "Document",
      resourceId: documentId,
      after: { error: errorMessage(error) },
    }).catch(() => undefined);
    return { status: "error", message: `Update failed: ${errorMessage(error)}` };
  }
}
