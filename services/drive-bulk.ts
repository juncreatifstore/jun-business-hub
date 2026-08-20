"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function parseIds(formData: FormData): string[] {
  const raw = String(formData.get("fileIds") ?? "");
  let ids: unknown = [];
  try { ids = JSON.parse(raw); } catch {}
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, 100);
}

function safeReturn(formData: FormData, fallback = "/app/drive") {
  const value = String(formData.get("returnTo") ?? "");
  return value.startsWith("/app/drive") ? value : fallback;
}

function toast(path: string, message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}toast=${encodeURIComponent(message)}`;
}

function toastError(path: string, message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}toast_error=${encodeURIComponent(message)}`;
}

export async function moveFiles(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const ids = parseIds(formData);
  const returnTo = safeReturn(formData);
  const rawFolderId = String(formData.get("folderId") ?? "").trim();
  const folderId = rawFolderId || null;
  if (!ids.length) redirect(toastError(returnTo, "Select at least one file"));

  if (folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: folderId, isVault: false }, select: { id: true } });
    if (!folder) redirect(toastError(returnTo, "Destination folder not found"));
  }

  const files = await prisma.file.findMany({ where: { id: { in: ids }, isVault: false, archivedAt: null }, select: { id: true, folderId: true, name: true } });
  if (!files.length) redirect(toastError(returnTo, "No movable files found"));
  await prisma.file.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { folderId } });
  await audit({ userId: user.id, action: "FILE_BULK_MOVE", resourceType: "File", after: { ids: files.map((f) => f.id), folderId } });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, `${files.length} file${files.length === 1 ? "" : "s"} moved`));
}

export async function trashFiles(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_DELETE");
  const ids = parseIds(formData);
  const returnTo = safeReturn(formData);
  if (!ids.length) redirect(toastError(returnTo, "Select at least one file"));
  const files = await prisma.file.findMany({ where: { id: { in: ids }, isVault: false, archivedAt: null }, select: { id: true } });
  if (!files.length) redirect(toastError(returnTo, "No files available"));
  await prisma.file.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { archivedAt: new Date() } });
  await audit({ userId: user.id, action: "FILE_BULK_TRASH", resourceType: "File", after: { ids: files.map((f) => f.id) } });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, `${files.length} file${files.length === 1 ? "" : "s"} moved to Trash`));
}

export async function restoreFiles(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_DELETE");
  const ids = parseIds(formData);
  const returnTo = safeReturn(formData, "/app/drive?view=trash");
  if (!ids.length) redirect(toastError(returnTo, "Select at least one file"));
  const files = await prisma.file.findMany({ where: { id: { in: ids }, isVault: false, archivedAt: { not: null } }, select: { id: true } });
  if (!files.length) redirect(toastError(returnTo, "No restorable files found"));
  await prisma.file.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { archivedAt: null } });
  await audit({ userId: user.id, action: "FILE_BULK_RESTORE", resourceType: "File", after: { ids: files.map((f) => f.id) } });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, `${files.length} file${files.length === 1 ? "" : "s"} restored`));
}

export async function permanentlyDeleteFiles(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_DELETE");
  const ids = parseIds(formData);
  const returnTo = safeReturn(formData, "/app/drive?view=trash");
  if (!ids.length) redirect(toastError(returnTo, "Select at least one file"));
  const files = await prisma.file.findMany({ where: { id: { in: ids }, isVault: false, archivedAt: { not: null } }, select: { id: true, storageKey: true } });
  if (!files.length) redirect(toastError(returnTo, "No deletable files found"));
  for (const file of files) await storage().remove(file.storageKey).catch(() => undefined);
  await prisma.$transaction([
    prisma.appSetting.deleteMany({ where: { OR: files.flatMap((file) => [
      { key: { startsWith: "drive.favorite.", endsWith: `.${file.id}` } },
      { key: { startsWith: "drive.share.", endsWith: `.${file.id}` } },
    ]) } }),
    prisma.file.deleteMany({ where: { id: { in: files.map((f) => f.id) } } }),
  ]);
  await audit({ userId: user.id, action: "FILE_BULK_DELETE_PERMANENT", resourceType: "File", after: { ids: files.map((f) => f.id) } });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, `${files.length} file${files.length === 1 ? "" : "s"} permanently deleted`));
}
