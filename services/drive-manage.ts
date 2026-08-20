"use server";

import { randomBytes, randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { storage, makeStorageKey, MAX_UPLOAD_BYTES, ALLOWED_MIME } from "@/lib/storage";
import { assertDriveQuotaForUpload } from "@/lib/drive-enterprise";

const NOTE_PREFIX = "drive.note.";
const PUBLIC_DISABLED_PREFIX = "drive.public.disabled.";
const PUBLIC_TOKEN_PREFIX = "drive.public.token.";
const VERSION_PREFIX = "drive.version.";

function safeReturn(formData?: FormData, fallback = "/app/drive") {
  const value = String(formData?.get("returnTo") ?? "");
  return value.startsWith("/app/drive") ? value : fallback;
}

function toast(path: string, key: "toast" | "toast_error", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

async function activeDriveFile(fileId: string) {
  return prisma.file.findFirst({ where: { id: fileId, isVault: false, archivedAt: null } });
}

function quotaMessage(quota: Awaited<ReturnType<typeof assertDriveQuotaForUpload>>) {
  return `Drive quota exceeded (${(quota.usage.totalBytes / 1073741824).toFixed(2)} GB used / ${(quota.settings.quotaBytes / 1073741824).toFixed(0)} GB)`;
}

export async function renameDriveFile(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const file = await activeDriveFile(fileId);
  if (!file) redirect(toast(returnTo, "toast_error", "File not found"));
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  if (!name) redirect(toast(returnTo, "toast_error", "File name is required"));
  if (name === file.name) redirect(returnTo);
  await prisma.file.update({ where: { id: file.id }, data: { name } });
  await audit({ userId: user.id, action: "FILE_RENAME", resourceType: "File", resourceId: file.id, before: { name: file.name }, after: { name } });
  await logActivity({ userId: user.id, type: "FILE_RENAMED", message: `Renamed ${file.name} to ${name}`, resourceType: "File", resourceId: file.id });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "File renamed"));
}

export async function duplicateDriveFile(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const file = await activeDriveFile(fileId);
  if (!file) redirect(toast(returnTo, "toast_error", "File not found"));
  const quota = await assertDriveQuotaForUpload(file.sizeBytes);
  if (!quota.allowed) redirect(toast(returnTo, "toast_error", quotaMessage(quota)));
  const buf = await storage().download(file.storageKey);
  const requested = String(formData.get("name") ?? "").trim();
  const name = (requested || `Copy of ${file.name}`).slice(0, 200);
  const key = makeStorageKey("drive", name);
  await storage().upload(key, buf, file.mimeType);
  const copy = await prisma.file.create({
    data: {
      name,
      storageKey: key,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      category: file.category,
      folderId: file.folderId,
      clientId: file.clientId,
      caseId: file.caseId,
      paymentId: file.paymentId,
      refundId: file.refundId,
      uploadedById: user.id,
      isVault: false,
    },
  });
  await audit({ userId: user.id, action: "FILE_DUPLICATE", resourceType: "File", resourceId: copy.id, after: { sourceFileId: file.id, name } });
  await logActivity({ userId: user.id, type: "FILE_DUPLICATED", message: `Duplicated ${file.name}`, resourceType: "File", resourceId: copy.id });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "File duplicated"));
}

export async function saveDriveFileNote(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const file = await activeDriveFile(fileId);
  if (!file) redirect(toast(returnTo, "toast_error", "File not found"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 4000);
  const key = `${NOTE_PREFIX}${file.id}`;
  if (note) await prisma.appSetting.upsert({ where: { key }, update: { value: note }, create: { key, value: note } });
  else await prisma.appSetting.deleteMany({ where: { key } });
  await audit({ userId: user.id, action: "FILE_NOTE_UPDATE", resourceType: "File", resourceId: file.id, after: { hasNote: Boolean(note) } });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "File note saved"));
}

export async function setDrivePublicEnabled(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const file = await activeDriveFile(fileId);
  if (!file) redirect(toast(returnTo, "toast_error", "File not found"));
  const enabled = String(formData.get("enabled") ?? "") === "1";
  const key = `${PUBLIC_DISABLED_PREFIX}${file.id}`;
  if (enabled) await prisma.appSetting.deleteMany({ where: { key } });
  else await prisma.appSetting.upsert({ where: { key }, update: { value: "1" }, create: { key, value: "1" } });
  await audit({ userId: user.id, action: enabled ? "FILE_PUBLIC_ENABLE" : "FILE_PUBLIC_DISABLE", resourceType: "File", resourceId: file.id });
  revalidatePath("/app/drive");
  revalidatePath(`/view/file/${file.id}`);
  redirect(toast(returnTo, "toast", enabled ? "Public link enabled" : "Public link disabled"));
}

export async function regenerateDrivePublicLink(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const file = await activeDriveFile(fileId);
  if (!file) redirect(toast(returnTo, "toast_error", "File not found"));
  const token = randomBytes(24).toString("base64url");
  const key = `${PUBLIC_TOKEN_PREFIX}${file.id}`;
  await prisma.appSetting.upsert({ where: { key }, update: { value: token }, create: { key, value: token } });
  await prisma.appSetting.deleteMany({ where: { key: `${PUBLIC_DISABLED_PREFIX}${file.id}` } });
  await audit({ userId: user.id, action: "FILE_PUBLIC_REGENERATE", resourceType: "File", resourceId: file.id });
  revalidatePath("/app/drive");
  revalidatePath(`/view/file/${file.id}`);
  redirect(toast(returnTo, "toast", "Public link regenerated. Old link revoked."));
}

export async function uploadDriveNewVersion(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const file = await activeDriveFile(fileId);
  if (!file) redirect(toast(returnTo, "toast_error", "File not found"));
  const raw = formData.get("file");
  if (!(raw instanceof File) || raw.size === 0) redirect(toast(returnTo, "toast_error", "Choose a replacement file"));
  if (raw.size > MAX_UPLOAD_BYTES) redirect(toast(returnTo, "toast_error", "File exceeds the 15 MB limit"));
  const mime = raw.type || "application/octet-stream";
  if (!ALLOWED_MIME.includes(mime)) redirect(toast(returnTo, "toast_error", `File type not allowed (${mime})`));
  const quota = await assertDriveQuotaForUpload(raw.size);
  if (!quota.allowed) redirect(toast(returnTo, "toast_error", quotaMessage(quota)));

  const previous = await storage().download(file.storageKey);
  const versionId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const versionKey = makeStorageKey("drive-versions", file.name);
  await storage().upload(versionKey, previous, file.mimeType);

  const replacementKey = makeStorageKey("drive", raw.name || file.name);
  const replacement = Buffer.from(await raw.arrayBuffer());
  await storage().upload(replacementKey, replacement, mime);

  const versionMeta = {
    versionId,
    storageKey: versionKey,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    createdAt: new Date().toISOString(),
    createdById: user.id,
    createdBy: `${user.firstName} ${user.lastName}`,
  };
  await prisma.$transaction([
    prisma.appSetting.create({ data: { key: `${VERSION_PREFIX}${file.id}.${versionId}`, value: JSON.stringify(versionMeta) } }),
    prisma.file.update({ where: { id: file.id }, data: { storageKey: replacementKey, mimeType: mime, sizeBytes: raw.size } }),
  ]);
  await storage().remove(file.storageKey);
  await audit({ userId: user.id, action: "FILE_NEW_VERSION", resourceType: "File", resourceId: file.id, after: { versionId, sizeBytes: raw.size, mimeType: mime } });
  await logActivity({ userId: user.id, type: "FILE_NEW_VERSION", message: `Uploaded a new version of ${file.name}`, resourceType: "File", resourceId: file.id });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "New version uploaded"));
}
