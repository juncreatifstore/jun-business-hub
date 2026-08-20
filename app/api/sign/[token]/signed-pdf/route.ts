import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyNativeSigningToken } from "@/lib/native-signature";
import { signatureRecipients } from "@/lib/signature-recipients";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const payload = await verifyNativeSigningToken(params.token);
  if (!payload) return NextResponse.json({ error: "Invalid or expired signing link" }, { status: 401 });

  const request = await prisma.signatureRequest.findUnique({
    where: { id: payload.requestId },
    include: { document: true },
  });
  if (!request || request.provider !== "JUN_NATIVE" || !request.signedPdfKey) {
    return NextResponse.json({ error: "Signed PDF not available" }, { status: 404 });
  }

  const signer = signatureRecipients(request.recipients).find((r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order);
  if (!signer?.signedAt) return NextResponse.json({ error: "Signer has not completed" }, { status: 403 });

  const bytes = await storage().download(request.signedPdfKey);
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(Uint8Array.from(bytes).buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${request.document.documentId}-signed.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
