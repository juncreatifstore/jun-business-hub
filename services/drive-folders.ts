"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { FOLDER_SHARE_PREFIX, FOLDER_TRASH_PREFIX } from "@/lib/drive-folder-constants";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const VERSION_PREFIX = "drive.version.";

function safeReturn(formData?: FormData, fallback = "/app/drive") {
  const value = String(formData?.get("returnTo") ?? "");
  return value.startsWith("/app/drive") ? value : fallback;
}

function toast(path: string, key: "toast" | "toast_error", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

async function getFolder(id: string) {
  return prisma.folder.findFirst({ where: { id, isVault: false } });
}

async function descendantIds(rootId: string) {
  const out = new Set<string>([rootId]);
  let frontier = [rootId];
  for (let depth = 0; frontier.length && depth < 50; depth++) {
    const rows = await prisma.folder.findMany({ where: { isVault: false, parentId: { in: frontier } }, select: { id: true } });
    const next = rows.map((r) => r.id).filter((id) => !out.has(id));
    next.forEach((id) => out.add(id));
    frontier = next;
  }
  return [...out];
}

export async function renameDriveFolder(folderId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const folder = await getFolder(folderId);
  if (!folder) redirect(toast(returnTo, "toast_error", "Folder not found"));
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!name) redirect(toast(returnTo, "toast_error", "Folder name is required"));
  const duplicate = await prisma.folder.findFirst({ where: { isVault: false, parentId: folder.parentId, name, id: { not: folder.id } }, select: { id: true } });
  if (duplicate) redirect(toast(returnTo, "toast_error", "A folder with this name already exists here"));
  await prisma.folder.update({ where: { id: folder.id }, data: { name } });
  await audit({ userId: user.id, action: "FOLDER_RENAME", resourceType: "Folder", resourceId: folder.id, before: { name: folder.name }, after: { name } });
  await logActivity({ userId: user.id, type: "FOLDER_RENAMED", message: `Renamed folder ${folder.name} to ${name}`, resourceType: "Folder", resourceId: folder.id });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "Folder renamed"));
}

export async function moveDriveFolder(folderId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const folder = await getFolder(folderId);
  if (!folder) redirect(toast(returnTo, "toast_error", "Folder not found"));
  const targetId = String(formData.get("parentId") ?? "").trim() || null;
  if (targetId === folder.id) redirect(toast(returnTo, "toast_error", "A folder cannot be moved into itself"));
  const descendants = await descendantIds(folder.id);
  if (targetId && descendants.includes(targetId)) redirect(toast(returnTo, "toast_error", "A folder cannot be moved into one of its subfolders"));
  if (targetId && !(await getFolder(targetId))) redirect(toast(returnTo, "toast_error", "Destination folder not found"));
  const duplicate = await prisma.folder.findFirst({ where: { isVault: false, parentId: targetId, name: folder.name, id: { not: folder.id } }, select: { id: true } });
  if (duplicate) redirect(toast(returnTo, "toast_error", "A folder with this name already exists in the destination"));
  await prisma.folder.update({ where: { id: folder.id }, data: { parentId: targetId } });
  await audit({ userId: user.id, action: "FOLDER_MOVE", resourceType: "Folder", resourceId: folder.id, before: { parentId: folder.parentId }, after: { parentId: targetId } });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "Folder moved"));
}

export async function shareDriveFolder(folderId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_READ");
  const returnTo = safeReturn(formData);
  const targetUserId = String(formData.get("userId") ?? "").trim();
  if (!targetUserId || targetUserId === user.id) redirect(toast(returnTo, "toast_error", "Choose another team member"));
  const [folder, target] = await Promise.all([
    getFolder(folderId),
    prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true, status: true, firstName: true, lastName: true } }),
  ]);
  if (!folder) redirect(toast(returnTo, "toast_error", "Folder not found"));
  if (!target || target.role === "CLIENT" || target.status !== "ACTIVE") redirect(toast(returnTo, "toast_error", "Team member unavailable"));
  const key = `${FOLDER_SHARE_PREFIX}${target.id}.${folder.id}`;
  await prisma.appSetting.upsert({ where: { key }, update: { value: JSON.stringify({ sharedById: user.id, sharedAt: new Date().toISOString() }) }, create: { key, value: JSON.stringify({ sharedById: user.id, sharedAt: new Date().toISOString() }) } });
  await audit({ userId: user.id, action: "FOLDER_SHARE_INTERNAL", resourceType: "Folder", resourceId: folder.id, after: { sharedWithId: target.id, inherited: true } });
  await logActivity({ userId: user.id, type: "FOLDER_SHARED", message: `Shared folder ${folder.name} with ${target.firstName} ${target.lastName}`, resourceType: "Folder", resourceId: folder.id });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "Folder shared with inherited access"));
}

export async function unshareDriveFolder(folderId: string, targetUserId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_READ");
  const returnTo = safeReturn(formData);
  await prisma.appSetting.deleteMany({ where: { key: `${FOLDER_SHARE_PREFIX}${targetUserId}.${folderId}` } });
  await audit({ userId: user.id, action: "FOLDER_UNSHARE_INTERNAL", resourceType: "Folder", resourceId: folderId, after: { sharedWithId: targetUserId } });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "Folder sharing removed"));
}

export async function trashDriveFolder(folderId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_DELETE");
  const returnTo = safeReturn(formData);
  const folder = await getFolder(folderId);
  if (!folder) redirect(toast(returnTo, "toast_error", "Folder not found"));
  const key = `${FOLDER_TRASH_PREFIX}${folder.id}`;
  await prisma.appSetting.upsert({ where: { key }, update: { value: new Date().toISOString() }, create: { key, value: new Date().toISOString() } });
  await audit({ userId: user.id, action: "FOLDER_TRASH", resourceType: "Folder", resourceId: folder.id, after: { inherited: true } });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "Folder moved to Trash"));
}

export async function restoreDriveFolder(folderId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_DELETE");
  const returnTo = safeReturn(formData, "/app/drive?view=trash");
  const folder = await getFolder(folderId);
  if (!folder) redirect(toast(returnTo, "toast_error", "Folder not found"));
  await prisma.appSetting.deleteMany({ where: { key: `${FOLDER_TRASH_PREFIX}${folder.id}` } });
  await audit({ userId: user.id, action: "FOLDER_RESTORE", resourceType: "Folder", resourceId: folder.id });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "Folder restored"));
}

async function cleanupFileMetadata(fileId: string) {
  const settings = await prisma.appSetting.findMany({ where: { OR: [
    { key: { endsWith: `.${fileId}` } },
    { key: { startsWith: `drive.note.${fileId}` } },
    { key: { startsWith: `drive.public.disabled.${fileId}` } },
    { key: { startsWith: `drive.public.token.${fileId}` } },
    { key: { startsWith: `drive.public.expires.${fileId}` } },
    { key: { startsWith: `drive.public.password.${fileId}` } },
    { key: { startsWith: `drive.intelligence.${fileId}` } },
    { key: { startsWith: `drive.tags.${fileId}` } },
    { key: { startsWith: `${VERSION_PREFIX}${fileId}.` } },
  ] }, select: { key: true, value: true } });
  for (const s of settings) {
    if (s.key.startsWith(`${VERSION_PREFIX}${fileId}.`)) {
      try { const meta = JSON.parse(s.value) as { storageKey?: string }; if (meta.storageKey) await storage().remove(meta.storageKey).catch(() => null); } catch {}
    }
  }
  await prisma.appSetting.deleteMany({ where: { key: { in: settings.map((s) => s.key) } } });
}

export async function permanentlyDeleteDriveFolder(folderId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_DELETE");
  const returnTo = safeReturn(formData, "/app/drive?view=trash");
  const folder = await getFolder(folderId);
  if (!folder) redirect(toast(returnTo, "toast_error", "Folder not found"));
  const trashed = await prisma.appSetting.findUnique({ where: { key: `${FOLDER_TRASH_PREFIX}${folder.id}` }, select: { id: true } });
  if (!trashed) redirect(toast(returnTo, "toast_error", "Move the folder to Trash before permanent deletion"));
  const ids = await descendantIds(folder.id);
  const files = await prisma.file.findMany({ where: { isVault: false, folderId: { in: ids } }, select: { id: true, storageKey: true } });
  for (const file of files) {
    await storage().remove(file.storageKey).catch(() => null);
    await cleanupFileMetadata(file.id);
  }
  if (files.length) await prisma.file.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
  await prisma.appSetting.deleteMany({ where: { OR: [
    { key: { in: ids.map((id) => `${FOLDER_TRASH_PREFIX}${id}`) } },
    ...ids.map((id) => ({ key: { endsWith: `.${id}`, startsWith: FOLDER_SHARE_PREFIX } })),
  ] } });
  const rows = await prisma.folder.findMany({ where: { id: { in: ids } }, select: { id: true, parentId: true } });
  const depth = (id: string) => { let d = 0, cur = rows.find((r) => r.id === id); const seen = new Set<string>(); while (cur?.parentId && !seen.has(cur.parentId)) { seen.add(cur.parentId); d++; cur = rows.find((r) => r.id === cur?.parentId); } return d; };
  for (const row of [...rows].sort((a, b) => depth(b.id) - depth(a.id))) await prisma.folder.delete({ where: { id: row.id } });
  await audit({ userId: user.id, action: "FOLDER_DELETE_PERMANENT", resourceType: "Folder", resourceId: folder.id, before: { name: folder.name, subtreeFolders: ids.length, files: files.length } });
  revalidatePath("/app/drive");
  redirect(toast(returnTo, "toast", "Folder permanently deleted"));
}
