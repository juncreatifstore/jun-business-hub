import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Serves a staff proof of delivered service to the client, only when referenced by a claim decision and the claim token matches. */
export async function GET(req: NextRequest, props: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await props.params;
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const claim = token
    ? await prisma.refundClaim.findUnique({ where: { token }, select: { decision: true } })
    : null;
  const ids = ((claim?.decision as { proofFileIds?: string[] } | null)?.proofFileIds ?? []) as string[];
  if (!ids.includes(fileId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = await prisma.file.findFirst({
    where: { id: fileId, archivedAt: null },
    select: { storageKey: true, mimeType: true, name: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buf = await storage().download(file.storageKey);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
