import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { isOfficeMime, officeToPdf } from "@/lib/office-preview";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** PDF rendering of an Office file (Word/Excel/PowerPoint) for in-app preview. */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const file = await prisma.file.findFirst({
    where: { id, archivedAt: null },
    select: { id: true, name: true, mimeType: true, storageKey: true, isVault: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (file.isVault ? !can(user, "VAULT_READ") : !can(user, "FILE_READ"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isOfficeMime(file.mimeType))
    return NextResponse.json({ error: "Not an Office file" }, { status: 415 });
  try {
    const data = await storage().download(file.storageKey);
    const pdf = await officeToPdf({ data, mimeType: file.mimeType, name: file.name });
    if (!pdf)
      return NextResponse.json(
        { error: "Preview engine unavailable — connect Google Drive in Drive › Manage connections." },
        { status: 503 },
      );
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `inline; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}.pdf"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Preview failed" }, { status: 500 });
  }
}
