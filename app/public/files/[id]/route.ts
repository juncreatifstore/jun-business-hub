import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { canAccessPublicDriveFile } from "@/lib/drive-public";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const suppliedToken = new URL(req.url).searchParams.get("key");
  if (!(await canAccessPublicDriveFile(params.id, suppliedToken))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await prisma.file.findFirst({
    where: { id: params.id, isVault: false, archivedAt: null },
    select: { storageKey: true, mimeType: true, name: true },
  });

  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (process.env.STORAGE_DRIVER === "SUPABASE") {
    const url = await storage().getSignedUrl(file.storageKey, 300);
    const response = NextResponse.redirect(url);
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  try {
    const buf = await storage().download(file.storageKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch {
    return NextResponse.json({ error: "File data unavailable" }, { status: 404 });
  }
}
