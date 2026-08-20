"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { storage, makeStorageKey, MAX_UPLOAD_BYTES, ALLOWED_MIME } from "@/lib/storage";
import { emptyToNull } from "@/lib/validation";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FileCategory } from "@prisma/client";
import { VAULT_CATEGORIES } from "@/lib/utils";

const CATEGORIES = new Set(["IDENTITY", "PASSPORT", "CONTRACT", "PAYMENT_PROOF", "RECEIPT", "REFUND", "VISA", "FLIGHT", "INVOICE", "COMPANY", "LEGAL", "TAX", "EMPLOYEE", "VENDOR", "OTHER"]);
const FAVORITE_PREFIX = "drive.favorite.";
const SHARE_PREFIX = "drive.share.";

function driveDest(folderId?: string | null) {
  return folderId ? `/app/drive?folder=${encodeURIComponent(folderId)}` : "/app/drive";
}

function safeDriveReturn(formData?: FormData, fallback = "/app/drive") {
  const value = String(formData?.get("returnTo") ?? "");
  return value.startsWith("/app/drive") ? value : fallback;
}

function appendToast(path: string, key: "toast" | "toast_error", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

export async function createFolder(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const parentId = emptyToNull(String(formData.get("parentId") ?? ""));
  if (!name) redirect(appendToast(driveDest(parentId), "toast_error", "Folder name is required"));

  if (parentId) {
    const parent = await prisma.folder.findFirst({ where: { id: parentId, isVault: false }, select: { id: true } });
    if (!parent) redirect("/app/drive?toast_error=Parent%20folder%20not%20found");
  }

  const existing = await prisma.folder.findFirst({ where: { name, parentId, isVault: false }, select: { id: true } });
  if (existing) redirect(appendToast(driveDest(parentId), "toast_error", "A folder with this name already exists"));

  const folder = await prisma.folder.create({ data: { name, parentId, isVault: false } });
  await audit({ userId: user.id, action: "FOLDER_CREATE", resourceType: "Folder", resourceId: folder.id, after: { name, parentId } });
  revalidatePath("/app/drive");
  redirect(appendToast(driveDest(parentId), "toast", "Folder created"));
}

export async function uploadFile(formData: FormData): Promise<void> {
  const isVault = String(formData.get("isVault") ?? "") === "1";
  const user = await assertPermission(isVault ? "VAULT_MANAGE" : "FILE_UPLOAD");

  const raw = formData.get("file");
  if (!(raw instanceof File) || raw.size === 0) {
    redirect(`${isVault ? "/app/vault" : "/app/drive"}?toast_error=Please%20choose%20a%20file`);
  }
  if (raw.size > MAX_UPLOAD_BYTES) {
    redirect(`${isVault ? "/app/vault" : "/app/drive"}?toast_error=File%20exceeds%20the%2015%20MB%20limit`);
  }
  const mime = raw.type || "application/octet-stream";
  if (!ALLOWED_MIME.includes(mime)) {
    redirect(`${isVault ? "/app/vault" : "/app/drive"}?toast_error=${encodeURIComponent(`File type not allowed (${mime})`)}`);
  }

  const categoryRaw = String(formData.get("category") ?? "OTHER");
  const category = (CATEGORIES.has(categoryRaw) ? categoryRaw : "OTHER") as FileCategory;
  const vaultCategoryRaw = String(formData.get("vaultCategory") ?? "");
  const vaultCategory = isVault && (VAULT_CATEGORIES as readonly string[]).includes(vaultCategoryRaw) ? vaultCategoryRaw : null;
  const clientId = emptyToNull(String(formData.get("clientId") ?? ""));
  const caseId = emptyToNull(String(formData.get("caseId") ?? ""));
  const folderId = isVault ? null : emptyToNull(String(formData.get("folderId") ?? ""));

  if (clientId && !(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) redirect("/app/drive?toast_error=Linked%20client%20not%20found");
  if (caseId && !(await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } }))) redirect("/app/drive?toast_error=Linked%20case%20not%20found");
  if (folderId && !(await prisma.folder.findFirst({ where: { id: folderId, isVault: false }, select: { id: true } }))) redirect("/app/drive?toast_error=Folder%20not%20found");

  const key = makeStorageKey(isVault ? "vault" : "drive", raw.name);
  const buf = Buffer.from(await raw.arrayBuffer());
  await storage().upload(key, buf, mime);

  const record = await prisma.file.create({
    data: { name: raw.name.slice(0, 200), storageKey: key, mimeType: mime, sizeBytes: raw.size, category, folderId, isVault, vaultCategory, clientId, caseId, uploadedById: user.id },
  });

  await audit({ userId: user.id, action: isVault ? "VAULT_UPLOAD" : "FILE_UPLOAD", resourceType: "File", resourceId: record.id, after: { name: record.name, sizeBytes: raw.size, category, isVault, folderId } });
  await logActivity({ userId: user.id, type: "FILE_UPLOADED", message: `Uploaded ${record.name}`, clientId: clientId ?? undefined, caseId: caseId ?? undefined });

  const dest = isVault ? "/app/vault" : driveDest(folderId);
  revalidatePath(isVault ? "/app/vault" : "/app/drive");
  redirect(appendToast(dest, "toast", "File uploaded"));
}

/** Drive files go to Trash. Vault files remain hard-delete only. */
export async function deleteFile(fileId: string, formData?: FormData): Promise<void> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) redirect("/app/drive?toast_error=File%20not%20found");
  const user = await assertPermission(file.isVault ? "VAULT_MANAGE" : "FILE_DELETE");

  if (!file.isVault) {
    await prisma.file.update({ where: { id: file.id }, data: { archivedAt: new Date() } });
    await audit({ userId: user.id, action: "FILE_TRASH", resourceType: "File", resourceId: file.id, before: { name: file.name, folderId: file.folderId }, after: { archived: true } });
    revalidatePath("/app/drive");
    redirect(appendToast(safeDriveReturn(formData, driveDest(file.folderId)), "toast", "File moved to Trash"));
  }

  await storage().remove(file.storageKey);
  await prisma.file.delete({ where: { id: file.id } });
  await audit({ userId: user.id, action: "FILE_DELETE", resourceType: "File", resourceId: file.id, before: { name: file.name, isVault: true } });
  revalidatePath("/app/vault");
  redirect("/app/vault?toast=File%20deleted");
}

export async function restoreFile(fileId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_DELETE");
  const file = await prisma.file.findFirst({ where: { id: fileId, isVault: false, archivedAt: { not: null } } });
  if (!file) redirect("/app/drive?view=trash&toast_error=File%20not%20found");
  await prisma.file.update({ where: { id: file.id }, data: { archivedAt: null } });
  await audit({ userId: user.id, action: "FILE_RESTORE", resourceType: "File", resourceId: file.id, after: { name: file.name, folderId: file.folderId } });
  revalidatePath("/app/drive");
  redirect(appendToast(safeDriveReturn(formData, "/app/drive?view=trash"), "toast", "File restored"));
}

export async function permanentlyDeleteFile(fileId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_DELETE");
  const file = await prisma.file.findFirst({ where: { id: fileId, isVault: false, archivedAt: { not: null } } });
  if (!file) redirect("/app/drive?view=trash&toast_error=File%20not%20found");
  await storage().remove(file.storageKey);
  await prisma.$transaction([
    prisma.appSetting.deleteMany({ where: { OR: [
      { key: { startsWith: FAVORITE_PREFIX, endsWith: `.${file.id}` } },
      { key: { startsWith: SHARE_PREFIX, endsWith: `.${file.id}` } },
    ] } }),
    prisma.file.delete({ where: { id: file.id } }),
  ]);
  await audit({ userId: user.id, action: "FILE_DELETE_PERMANENT", resourceType: "File", resourceId: file.id, before: { name: file.name } });
  revalidatePath("/app/drive");
  redirect(appendToast(safeDriveReturn(formData, "/app/drive?view=trash"), "toast", "File permanently deleted"));
}

export async function toggleFavorite(fileId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_READ");
  const file = await prisma.file.findFirst({ where: { id: fileId, isVault: false, archivedAt: null }, select: { id: true } });
  if (!file) redirect("/app/drive?toast_error=File%20not%20found");
  const key = `${FAVORITE_PREFIX}${user.id}.${file.id}`;
  const existing = await prisma.appSetting.findUnique({ where: { key }, select: { id: true } });
  if (existing) await prisma.appSetting.delete({ where: { key } });
  else await prisma.appSetting.create({ data: { key, value: "1" } });
  await audit({ userId: user.id, action: existing ? "FILE_UNSTAR" : "FILE_STAR", resourceType: "File", resourceId: file.id });
  revalidatePath("/app/drive");
  redirect(safeDriveReturn(formData));
}

export async function shareFile(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_READ");
  const returnTo = safeDriveReturn(formData);
  const targetUserId = String(formData.get("userId") ?? "").trim();
  if (!targetUserId || targetUserId === user.id) redirect(appendToast(returnTo, "toast_error", "Choose another team member"));

  const [file, target] = await Promise.all([
    prisma.file.findFirst({ where: { id: fileId, isVault: false, archivedAt: null }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true, status: true, firstName: true, lastName: true } }),
  ]);
  if (!file) redirect(appendToast(returnTo, "toast_error", "File not found"));
  if (!target || target.role === "CLIENT" || target.status !== "ACTIVE") redirect(appendToast(returnTo, "toast_error", "Team member unavailable"));

  const key = `${SHARE_PREFIX}${target.id}.${file.id}`;
  await prisma.appSetting.upsert({
    where: { key },
    update: { value: JSON.stringify({ sharedById: user.id, sharedAt: new Date().toISOString() }) },
    create: { key, value: JSON.stringify({ sharedById: user.id, sharedAt: new Date().toISOString() }) },
  });
  await audit({ userId: user.id, action: "FILE_SHARE_INTERNAL", resourceType: "File", resourceId: file.id, after: { sharedWithId: target.id } });
  await logActivity({ userId: user.id, type: "FILE_SHARED", message: `Shared ${file.name} with ${target.firstName} ${target.lastName}`, resourceType: "File", resourceId: file.id });
  revalidatePath("/app/drive");
  redirect(appendToast(returnTo, "toast", "File shared"));
}

export async function unshareFile(fileId: string, targetUserId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_READ");
  const key = `${SHARE_PREFIX}${targetUserId}.${fileId}`;
  await prisma.appSetting.deleteMany({ where: { key } });
  await audit({ userId: user.id, action: "FILE_UNSHARE_INTERNAL", resourceType: "File", resourceId: fileId, after: { sharedWithId: targetUserId } });
  revalidatePath("/app/drive");
  redirect(safeDriveReturn(formData));
}
