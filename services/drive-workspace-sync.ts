"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ensureWorkspaceFolder, googleWorkspaceConfigured, googleWorkspaceRootFolderId, walkWorkspaceTree } from "@/lib/google-workspace-drive";
import { isCloudAdmin } from "@/lib/drive-cloud";
import { processDriveAutomation } from "@/lib/drive-automation";

const FOLDER_MAP_PREFIX = "drive.workspace.folder.";
const FILE_MAP_PREFIX = "drive.workspace.file.";

function dest(message: string, error = false) {
  redirect(`/app/drive/cloud?${error ? "error" : "toast"}=${encodeURIComponent(message)}`);
}

async function mappedId(prefix: string, externalId: string) {
  return (await prisma.appSetting.findUnique({ where: { key: `${prefix}${externalId}` }, select: { value: true } }))?.value || null;
}

async function saveMap(prefix: string, externalId: string, dbId: string) {
  const key = `${prefix}${externalId}`;
  await prisma.appSetting.upsert({ where: { key }, update: { value: dbId }, create: { key, value: dbId } });
}

export async function syncGoogleWorkspaceDesktop(): Promise<void> {
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  if (!googleWorkspaceConfigured()) dest("Google Workspace Shared Drive is not configured", true);
  if ((process.env.STORAGE_DRIVER || "").toUpperCase() !== "GOOGLE_WORKSPACE") dest("Set STORAGE_DRIVER=GOOGLE_WORKSPACE before syncing Desktop Sync", true);

  const syncName = (process.env.GOOGLE_WORKSPACE_SYNC_FOLDER_NAME || "Desktop Sync").trim() || "Desktop Sync";
  const syncRootId = await ensureWorkspaceFolder(googleWorkspaceRootFolderId(), syncName);
  const tree = await walkWorkspaceTree();
  const relevant = tree.filter((item) => item.id === syncRootId || item.relativePath === syncName || item.relativePath.startsWith(`${syncName}/`));
  const folderItems = relevant.filter((i) => i.isFolder && i.id !== syncRootId).sort((a, b) => a.relativePath.split("/").length - b.relativePath.split("/").length);
  const folderMap = new Map<string, string | null>([[syncRootId, null]]);
  let createdFolders = 0;
  let updatedFolders = 0;

  for (const item of folderItems) {
    const parentDbId = item.parentId ? (folderMap.get(item.parentId) ?? null) : null;
    let dbId = await mappedId(FOLDER_MAP_PREFIX, item.id);
    let folder = dbId ? await prisma.folder.findFirst({ where: { id: dbId, isVault: false } }) : null;
    if (!folder) {
      folder = await prisma.folder.findFirst({ where: { name: item.name, parentId: parentDbId, isVault: false } });
    }
    if (!folder) {
      folder = await prisma.folder.create({ data: { name: item.name.slice(0, 120), parentId: parentDbId, isVault: false } });
      createdFolders++;
    } else if (folder.name !== item.name || folder.parentId !== parentDbId) {
      folder = await prisma.folder.update({ where: { id: folder.id }, data: { name: item.name.slice(0, 120), parentId: parentDbId } });
      updatedFolders++;
    }
    dbId = folder.id;
    folderMap.set(item.id, dbId);
    await saveMap(FOLDER_MAP_PREFIX, item.id, dbId);
  }

  let createdFiles = 0;
  let updatedFiles = 0;
  for (const item of relevant.filter((i) => !i.isFolder)) {
    const parentDbId = item.parentId ? (folderMap.get(item.parentId) ?? null) : null;
    let dbId = await mappedId(FILE_MAP_PREFIX, item.id);
    let file = dbId ? await prisma.file.findFirst({ where: { id: dbId, isVault: false } }) : null;
    if (!file) file = await prisma.file.findFirst({ where: { storageKey: item.relativePath, isVault: false } });
    if (!file) {
      file = await prisma.file.create({
        data: {
          name: item.name.slice(0, 200),
          storageKey: item.relativePath,
          mimeType: item.mimeType || "application/octet-stream",
          sizeBytes: Math.max(0, item.sizeBytes),
          category: "OTHER",
          folderId: parentDbId,
          isVault: false,
          uploadedById: user.id,
        },
      });
      createdFiles++;
      await processDriveAutomation(file.id, user.id).catch(() => null);
    } else if (file.name !== item.name || file.storageKey !== item.relativePath || file.mimeType !== item.mimeType || file.sizeBytes !== item.sizeBytes || file.folderId !== parentDbId) {
      file = await prisma.file.update({ where: { id: file.id }, data: { name: item.name.slice(0, 200), storageKey: item.relativePath, mimeType: item.mimeType || file.mimeType, sizeBytes: Math.max(0, item.sizeBytes), folderId: parentDbId } });
      updatedFiles++;
    }
    await saveMap(FILE_MAP_PREFIX, item.id, file.id);
  }

  await prisma.auditLog.create({ data: { userId: user.id, action: "DRIVE_WORKSPACE_DESKTOP_SYNC", resourceType: "Drive", after: { syncFolder: syncName, scanned: relevant.length, createdFolders, updatedFolders, createdFiles, updatedFiles } } }).catch(() => undefined);
  revalidatePath("/app/drive");
  revalidatePath("/app/drive/cloud");
  dest(`Workspace sync complete: ${createdFiles} new files, ${updatedFiles} updated files, ${createdFolders} new folders`);
}
