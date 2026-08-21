import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { FileCategory } from "@prisma/client";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeStorageKey } from "@/lib/storage";
import { assertDriveQuotaForUpload } from "@/lib/drive-enterprise";
import { createWorkspaceResumableUploadSession } from "@/lib/google-workspace-drive";

export const dynamic = "force-dynamic";

const BUCKET = "jun-files";
const MAX_DIRECT_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const CATEGORIES = new Set(["IDENTITY", "PASSPORT", "CONTRACT", "PAYMENT_PROOF", "RECEIPT", "REFUND", "VISA", "FLIGHT", "INVOICE", "COMPANY", "LEGAL", "TAX", "EMPLOYEE", "VENDOR", "OTHER"]);
const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", wave: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", flac: "audio/flac", weba: "audio/webm",
  mp4: "video/mp4", m4v: "video/x-m4v", mov: "video/quicktime", webm: "video/webm", ogv: "video/ogg", mpg: "video/mpeg", mpeg: "video/mpeg",
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
  txt: "text/plain", csv: "text/csv", md: "text/markdown", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function normalizeMime(name: string, raw: string) {
  const value = raw.trim().toLowerCase();
  if (value && value !== "application/octet-stream") return value;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

function allowedMime(mime: string) {
  return mime.startsWith("audio/") || mime.startsWith("video/") || mime.startsWith("image/") || mime.startsWith("text/") || [
    "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ].includes(mime);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role === "CLIENT" || !can(user, "FILE_UPLOAD")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { name?: string; sizeBytes?: number; mimeType?: string; category?: string; folderId?: string | null; clientId?: string | null; caseId?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const name = String(body.name || "").trim().slice(0, 200);
  const sizeBytes = Math.max(0, Number(body.sizeBytes || 0));
  const mimeType = normalizeMime(name, String(body.mimeType || ""));
  const category = (CATEGORIES.has(String(body.category || "OTHER")) ? String(body.category || "OTHER") : "OTHER") as FileCategory;
  const folderId = body.folderId ? String(body.folderId) : null;
  const clientId = body.clientId ? String(body.clientId) : null;
  const caseId = body.caseId ? String(body.caseId) : null;

  if (!name || !sizeBytes) return NextResponse.json({ error: "Choose a file" }, { status: 400 });
  if (sizeBytes > MAX_DIRECT_UPLOAD_BYTES) return NextResponse.json({ error: "File exceeds the 2 GB direct-upload limit" }, { status: 413 });
  if (!allowedMime(mimeType)) return NextResponse.json({ error: `File type not allowed (${mimeType})` }, { status: 415 });

  const [folder, client, caseRow, quota] = await Promise.all([
    folderId ? prisma.folder.findFirst({ where: { id: folderId, isVault: false }, select: { id: true } }) : Promise.resolve(null),
    clientId ? prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }) : Promise.resolve(null),
    caseId ? prisma.case.findUnique({ where: { id: caseId }, select: { id: true } }) : Promise.resolve(null),
    assertDriveQuotaForUpload(sizeBytes),
  ]);
  if (folderId && !folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  if (clientId && !client) return NextResponse.json({ error: "Linked client not found" }, { status: 404 });
  if (caseId && !caseRow) return NextResponse.json({ error: "Linked case not found" }, { status: 404 });
  if (!quota.allowed) return NextResponse.json({ error: "Drive quota exceeded" }, { status: 413 });

  const key = makeStorageKey("drive", name);
  const uploadId = randomUUID();
  const pendingKey = `drive.upload.pending.${uploadId}`;
  const driver = (process.env.STORAGE_DRIVER || "SUPABASE").toUpperCase();
  let mode: "supabase-signed" | "google-resumable";
  let uploadUrl: string;

  if (driver === "GOOGLE_WORKSPACE") {
    mode = "google-resumable";
    uploadUrl = await createWorkspaceResumableUploadSession(key, mimeType, sizeBytes);
  } else {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return NextResponse.json({ error: "Storage is not configured" }, { status: 500 });
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(key);
    if (error || !data) return NextResponse.json({ error: error?.message || "Unable to initialize upload" }, { status: 500 });
    mode = "supabase-signed";
    uploadUrl = data.signedUrl;
  }

  await prisma.appSetting.create({ data: { key: pendingKey, value: JSON.stringify({ userId: user.id, key, name, sizeBytes, mimeType, category, folderId, clientId, caseId, mode, createdAt: new Date().toISOString() }) } });
  return NextResponse.json({ uploadId, mode, uploadUrl, mimeType, maxBytes: MAX_DIRECT_UPLOAD_BYTES });
}
