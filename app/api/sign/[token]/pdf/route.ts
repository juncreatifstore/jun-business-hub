import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyNativeSigningToken } from "@/lib/native-signature";
import { signatureRecipients } from "@/lib/signature-recipients";
import { storage } from "@/lib/storage";
import { renderDocumentPdf } from "@/services/pdf";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const payload = await verifyNativeSigningToken(params.token);
  if (!payload) return NextResponse.json({ error: "Invalid or expired signing link" }, { status: 401 });

  const request = await prisma.signatureRequest.findUnique({
    where: { id: payload.requestId },
    include: { document: { include: { client: true, case: true, versions: { orderBy: { version: "desc" }, take: 1 } } } },
  });
  if (!request || request.provider !== "JUN_NATIVE") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const signer = signatureRecipients(request.recipients).find((r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order);
  if (!signer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let bytes: Buffer;
  if (request.signedPdfKey) bytes = await storage().download(request.signedPdfKey);
  else if (request.document.finalPdfKey) bytes = await storage().download(request.document.finalPdfKey);
  else {
    bytes = Buffer.from(await renderDocumentPdf({
      documentId: request.document.documentId,
      title: request.document.title,
      type: request.document.type,
      status: request.document.status,
      html: request.document.versions[0]?.content ?? "",
      clientName: request.document.client ? `${request.document.client.firstName} ${request.document.client.lastName}` : null,
      caseNumber: request.document.case?.caseNumber ?? null,
      signatureStatus: request.status,
    }));
  }

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${request.document.documentId}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
