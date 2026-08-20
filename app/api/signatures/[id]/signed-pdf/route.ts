import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, can } from "@/lib/auth";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "DOCUMENT_READ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const request = await prisma.signatureRequest.findUnique({
    where: { id: params.id },
    include: { document: true },
  });
  if (!request || !request.signedPdfKey || request.status !== "SIGNED") {
    return NextResponse.json({ error: "Signed PDF not available" }, { status: 404 });
  }

  const bytes = await storage().download(request.signedPdfKey);
  const download = req.nextUrl.searchParams.get("download") === "1";
  const body = Uint8Array.from(bytes).buffer;
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${request.document.documentId}-signed.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
