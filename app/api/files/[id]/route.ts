import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, can } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { clientCanAccessFile } from "@/lib/portal";

export const dynamic = "force-dynamic";

function parseRange(header: string | null, total: number) {
  if (!header || !header.startsWith("bytes=")) return null;
  const [startRaw, endRaw] = header.slice(6).split("-");
  const start = Number(startRaw);
  const requestedEnd = endRaw ? Number(endRaw) : Math.min(total - 1, start + 4 * 1024 * 1024 - 1);
  if (!Number.isFinite(start) || start < 0 || start >= total) return null;
  const end = Number.isFinite(requestedEnd) ? Math.min(total - 1, requestedEnd) : total - 1;
  if (end < start) return null;
  return { start, end };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id: params.id } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.role === "CLIENT") {
    const account = await prisma.clientAccount.findUnique({ where: { userId: user.id } });
    if (!account || !clientCanAccessFile(file, account.clientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    if (file.isVault && !can(user, "VAULT_READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!file.isVault && !can(user, "FILE_READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await audit({ userId: user.id, action: file.isVault ? "VAULT_FILE_ACCESS" : "FILE_DOWNLOAD", resourceType: "File", resourceId: file.id, after: { name: file.name, isVault: file.isVault, ranged: Boolean(req.headers.get("range")) } });

  if ((process.env.STORAGE_DRIVER ?? "").toUpperCase() === "SUPABASE") {
    const url = await storage().getSignedUrl(file.storageKey, 300);
    return NextResponse.redirect(url);
  }

  try {
    const driver = storage();
    const range = parseRange(req.headers.get("range"), file.sizeBytes);
    if (range && driver.downloadRange) {
      const buf = await driver.downloadRange(file.storageKey, range.start, range.end);
      return new NextResponse(new Uint8Array(buf), {
        status: 206,
        headers: {
          "Content-Type": file.mimeType,
          "Content-Length": String(buf.length),
          "Content-Range": `bytes ${range.start}-${range.end}/${file.sizeBytes}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `inline; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    const buf = await driver.download(file.storageKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(buf.length),
        "Accept-Ranges": driver.downloadRange ? "bytes" : "none",
        "Content-Disposition": `inline; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File data unavailable" }, { status: 404 });
  }
}
