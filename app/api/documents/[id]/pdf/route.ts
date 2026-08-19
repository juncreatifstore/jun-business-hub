import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, can } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { renderDocumentPdf } from "@/services/pdf";
import { sha256 } from "@/lib/hash";
import { clientCanAccessDocument } from "@/lib/portal";

export const dynamic = "force-dynamic";

/**
 * Official PDF of a document.
 * - FINAL/SIGNED docs with a stored final PDF: serve the exact stored bytes and
 *   verify sha256 against Document.finalPdfHash (tamper detection).
 * - Otherwise render a live PDF marked with the current status (DRAFT preview).
 * Staff need DOCUMENT_READ; CLIENT users only get their own FINAL/SIGNED docs.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      case: true,
      versions: { orderBy: { version: "desc" }, take: 1 },
      signatures: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.role === "CLIENT") {
    const account = await prisma.clientAccount.findUnique({ where: { userId: user.id } });
    if (!account || !clientCanAccessDocument(doc, account.clientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (!can(user, "DOCUMENT_READ")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let bytes: Uint8Array;
  let integrity: "verified" | "TAMPERED" | "live-render" = "live-render";

  if (doc.finalPdfKey && (doc.status === "FINAL" || doc.status === "SIGNED")) {
    try {
      const stored = await storage().download(doc.finalPdfKey);
      bytes = new Uint8Array(stored);
      integrity = doc.finalPdfHash && sha256(stored) === doc.finalPdfHash ? "verified" : "TAMPERED";
      if (integrity === "TAMPERED") {
        await audit({ userId: user.id, action: "DOCUMENT_PDF_TAMPER_DETECTED", resourceType: "Document", resourceId: doc.id, after: { documentId: doc.documentId } });
        return NextResponse.json({ error: "Stored PDF failed integrity verification — contact an administrator" }, { status: 409 });
      }
    } catch {
      bytes = await renderLive(doc);
    }
  } else {
    bytes = await renderLive(doc);
  }

  await audit({ userId: user.id, action: "DOCUMENT_DOWNLOAD", resourceType: "Document", resourceId: doc.id, after: { documentId: doc.documentId, integrity } });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.documentId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

type DocWithRels = NonNullable<Awaited<ReturnType<typeof prisma.document.findUnique<{ where: { id: string }; include: { client: true; case: true; versions: true; signatures: true } }>>>>;

async function renderLive(doc: DocWithRels): Promise<Uint8Array> {
  return renderDocumentPdf({
    documentId: doc.documentId,
    title: doc.title,
    type: doc.type,
    status: doc.status,
    html: doc.versions[0]?.content ?? "",
    clientName: doc.client ? `${doc.client.firstName} ${doc.client.lastName}` : null,
    caseNumber: doc.case?.caseNumber ?? null,
    signatureStatus: doc.signatures[0]?.status ?? null,
  });
}
