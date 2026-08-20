import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, can } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string; versionId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CLIENT" || !can(user, "FILE_READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const file = await prisma.file.findFirst({ where: { id: params.id, isVault: false }, select: { id: true, name: true } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const setting = await prisma.appSetting.findUnique({ where: { key: `drive.version.${file.id}.${params.versionId}` } });
  if (!setting) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  let meta: { storageKey: string; mimeType: string; name: string };
  try { meta = JSON.parse(setting.value); } catch { return NextResponse.json({ error: "Invalid version metadata" }, { status: 500 }); }

  await audit({ userId: user.id, action: "FILE_VERSION_ACCESS", resourceType: "File", resourceId: file.id, after: { versionId: params.versionId } });

  if (process.env.STORAGE_DRIVER === "SUPABASE") {
    const url = await storage().getSignedUrl(meta.storageKey, 300);
    return NextResponse.redirect(url);
  }

  try {
    const buf = await storage().download(meta.storageKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": meta.mimeType,
        "Content-Disposition": `inline; filename="${meta.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Version data unavailable" }, { status: 404 });
  }
}
