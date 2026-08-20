import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { buildStoredZip } from "@/lib/zip-store";
import { getDriveEnterpriseSettings } from "@/lib/drive-enterprise";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "FILE_READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  let ids = form.getAll("fileId").map(String).filter(Boolean);
  if (!ids.length) {
    try {
      const parsed = JSON.parse(String(form.get("fileIds") ?? "[]"));
      if (Array.isArray(parsed)) ids = parsed.map(String).filter(Boolean);
    } catch {}
  }
  ids = [...new Set(ids)];

  const settings = await getDriveEnterpriseSettings();
  if (!ids.length) return NextResponse.json({ error: "No files selected" }, { status: 400 });
  if (ids.length > settings.zipMaxFiles) return NextResponse.json({ error: `Archive limit is ${settings.zipMaxFiles} files` }, { status: 413 });

  const files = await prisma.file.findMany({
    where: { id: { in: ids }, isVault: false, archivedAt: null },
    select: { id: true, name: true, storageKey: true, sizeBytes: true, createdAt: true },
  });
  if (files.length !== ids.length) return NextResponse.json({ error: "One or more files are unavailable" }, { status: 404 });
  const total = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  if (total > settings.zipMaxBytes) return NextResponse.json({ error: `Archive exceeds ${Math.round(settings.zipMaxBytes / 1048576)} MB limit` }, { status: 413 });

  const entries: Array<{ name: string; data: Buffer; modifiedAt: Date }> = [];
  for (const file of files) entries.push({ name: file.name, data: await storage().download(file.storageKey), modifiedAt: file.createdAt });
  const zip = buildStoredZip(entries);

  await audit({ userId: user.id, action: "DRIVE_BULK_DOWNLOAD_ZIP", resourceType: "Drive", after: { fileIds: files.map((f) => f.id), files: files.length, bytes: total } });
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="jun-drive-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
