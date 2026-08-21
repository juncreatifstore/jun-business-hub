import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processDriveAutomation } from "@/lib/drive-automation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role === "CLIENT" || !can(user, "FILE_UPLOAD")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let fileId = "";
  try { fileId = String((await req.json()).fileId || ""); } catch {}
  if (!fileId) return NextResponse.json({ error: "Missing file id" }, { status: 400 });

  const file = await prisma.file.findFirst({ where: { id: fileId, isVault: false, archivedAt: null }, select: { id: true, mimeType: true, sizeBytes: true, uploadedById: true } });
  if (!file || file.uploadedById !== user.id) return NextResponse.json({ error: "File not found" }, { status: 404 });

  // Avoid downloading large media immediately after upload. Media intelligence can
  // be generated explicitly later without delaying the upload experience.
  if (file.mimeType.startsWith("audio/") || file.mimeType.startsWith("video/") || file.sizeBytes > 30 * 1024 * 1024) {
    return NextResponse.json({ ok: true, deferred: true });
  }

  await processDriveAutomation(file.id, user.id).catch(() => null);
  return NextResponse.json({ ok: true, deferred: false });
}
