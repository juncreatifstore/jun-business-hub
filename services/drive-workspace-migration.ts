"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { googleWorkspaceConfigured, resolveWorkspacePath, uploadWorkspaceFile } from "@/lib/google-workspace-drive";

const FILE_MARKER = "drive.workspace.migrated.file.";
const VERSION_MARKER = "drive.workspace.migrated.version.";
const VERSION_PREFIX = "drive.version.";
const BUCKET = "jun-files";

function go(message: string, error = false): never {
  redirect(`/app/drive/cloud/migration?${error ? "toast_error" : "toast"}=${encodeURIComponent(message)}`);
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are required to migrate existing storage");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function downloadLegacy(key: string) {
  const { data, error } = await supabaseClient().storage.from(BUCKET).download(key);
  if (error || !data) throw new Error(`Unable to read legacy object ${key}: ${error?.message || "not found"}`);
  return Buffer.from(await data.arrayBuffer());
}

async function copyIfMissing(storageKey: string, mimeType: string) {
  const existing = await resolveWorkspacePath(storageKey, false).catch(() => null);
  if (existing?.file) return "EXISTS" as const;
  const data = await downloadLegacy(storageKey);
  await uploadWorkspaceFile(storageKey, data, mimeType);
  const verified = await resolveWorkspacePath(storageKey, false);
  if (!verified?.file) throw new Error(`Workspace verification failed for ${storageKey}`);
  return "COPIED" as const;
}

export async function migrateLegacyStorageBatch(): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  if (!googleWorkspaceConfigured()) go("Google Workspace Shared Drive is not configured", true);
  if ((process.env.STORAGE_DRIVER || "SUPABASE").toUpperCase() === "GOOGLE_WORKSPACE") go("Migration must be completed before switching STORAGE_DRIVER to GOOGLE_WORKSPACE", true);

  const [fileMarkers, versionMarkers] = await Promise.all([
    prisma.appSetting.findMany({ where: { key: { startsWith: FILE_MARKER } }, select: { key: true } }),
    prisma.appSetting.findMany({ where: { key: { startsWith: VERSION_MARKER } }, select: { key: true } }),
  ]);
  const migratedFiles = new Set(fileMarkers.map((r) => r.key.slice(FILE_MARKER.length)));
  const migratedVersions = new Set(versionMarkers.map((r) => r.key.slice(VERSION_MARKER.length)));

  const candidates = await prisma.file.findMany({ where: { id: { notIn: [...migratedFiles] } }, orderBy: { createdAt: "asc" }, take: 20, select: { id: true, storageKey: true, mimeType: true, name: true } });
  let copiedFiles = 0;
  let existingFiles = 0;
  let failedFiles = 0;
  for (const file of candidates) {
    try {
      const result = await copyIfMissing(file.storageKey, file.mimeType);
      if (result === "COPIED") copiedFiles++; else existingFiles++;
      await prisma.appSetting.upsert({ where: { key: `${FILE_MARKER}${file.id}` }, update: { value: new Date().toISOString() }, create: { key: `${FILE_MARKER}${file.id}`, value: new Date().toISOString() } });
    } catch {
      failedFiles++;
    }
  }

  const versionRows = await prisma.appSetting.findMany({ where: { key: { startsWith: VERSION_PREFIX } }, orderBy: { updatedAt: "asc" }, take: 500, select: { key: true, value: true } });
  let copiedVersions = 0;
  let failedVersions = 0;
  let processedVersions = 0;
  for (const row of versionRows) {
    if (processedVersions >= 20 || migratedVersions.has(row.key)) continue;
    let meta: { storageKey?: string; mimeType?: string } = {};
    try { meta = JSON.parse(row.value); } catch { continue; }
    if (!meta.storageKey) continue;
    processedVersions++;
    try {
      await copyIfMissing(meta.storageKey, meta.mimeType || "application/octet-stream");
      copiedVersions++;
      await prisma.appSetting.upsert({ where: { key: `${VERSION_MARKER}${row.key}` }, update: { value: new Date().toISOString() }, create: { key: `${VERSION_MARKER}${row.key}`, value: new Date().toISOString() } });
    } catch {
      failedVersions++;
    }
  }

  const [totalFiles, markedFiles, totalVersions, markedVersions] = await Promise.all([
    prisma.file.count(),
    prisma.appSetting.count({ where: { key: { startsWith: FILE_MARKER } } }),
    prisma.appSetting.count({ where: { key: { startsWith: VERSION_PREFIX } } }),
    prisma.appSetting.count({ where: { key: { startsWith: VERSION_MARKER } } }),
  ]);
  await prisma.auditLog.create({ data: { userId: user.id, action: "DRIVE_WORKSPACE_MIGRATION_BATCH", resourceType: "Drive", after: { copiedFiles, existingFiles, failedFiles, copiedVersions, failedVersions, totalFiles, markedFiles, totalVersions, markedVersions } } }).catch(() => undefined);
  revalidatePath("/app/drive/cloud/migration");
  const done = markedFiles >= totalFiles && markedVersions >= totalVersions && failedFiles === 0 && failedVersions === 0;
  go(done ? "Migration copy complete. Verify the Workspace files, then set STORAGE_DRIVER=GOOGLE_WORKSPACE." : `Batch complete: ${copiedFiles} files + ${copiedVersions} versions copied. Run another batch to continue.${failedFiles + failedVersions ? ` ${failedFiles + failedVersions} item(s) need retry.` : ""}`);
}
