import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit, logActivity } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role === "CLIENT" || !can(user, "FILE_UPLOAD")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let uploadId = "";
  try { uploadId = String((await req.json()).uploadId || ""); } catch {}
  if (!uploadId) return NextResponse.json({ error: "Missing upload id" }, { status: 400 });

  const pendingKey = `drive.upload.pending.${uploadId}`;
  const row = await prisma.appSetting.findUnique({ where: { key: pendingKey }, select: { value: true } });
  if (!row) return NextResponse.json({ error: "Upload session expired or already finalized" }, { status: 404 });

  let meta: { userId: string; key: string; name: string; sizeBytes: number; mimeType: string; category: any; folderId: string | null; clientId: string | null; caseId: string | null; mode: string };
  try { meta = JSON.parse(row.value); } catch { return NextResponse.json({ error: "Invalid upload session" }, { status: 400 }); }
  if (meta.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const record = await prisma.$transaction(async (tx) => {
    await tx.appSetting.delete({ where: { key: pendingKey } });
    return tx.file.create({ data: {
      name: meta.name,
      storageKey: meta.key,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      category: meta.category,
      folderId: meta.folderId,
      clientId: meta.clientId,
      caseId: meta.caseId,
      isVault: false,
      uploadedById: user.id,
    } });
  });

  await audit({ userId: user.id, action: "FILE_UPLOAD", resourceType: "File", resourceId: record.id, after: { name: record.name, sizeBytes: record.sizeBytes, category: record.category, folderId: record.folderId, directUpload: true, mode: meta.mode } });
  await logActivity({ userId: user.id, type: "FILE_UPLOADED", message: `Uploaded ${record.name}`, clientId: meta.clientId ?? undefined, caseId: meta.caseId ?? undefined });

  return NextResponse.json({ ok: true, fileId: record.id, name: record.name, folderId: record.folderId });
}
