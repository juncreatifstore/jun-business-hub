"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { storage, makeStorageKey } from "@/lib/storage";
import { assertDriveQuotaForUpload } from "@/lib/drive-enterprise";
import {
  downloadCloudFile,
  getCloudConnection,
  isCloudAdmin,
  removeCloudConnection,
  uploadCloudFile,
  trashCloudFileRemote,
  CLOUD_STAR_PREFIX,
  type CloudProvider,
} from "@/lib/drive-cloud";
import { can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { processDriveAutomation } from "@/lib/drive-automation";

function safeProvider(value: string): CloudProvider | null {
  return value === "google" || value === "microsoft" ? value : null;
}

function cloudReturn(message: string, error = false): never {
  redirect(`/app/drive/cloud?${error ? "error" : "toast"}=${encodeURIComponent(message)}`);
}

export async function importCloudFile(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  const provider = safeProvider(String(formData.get("provider") ?? ""));
  const fileId = String(formData.get("fileId") ?? "").trim();
  if (!provider || !fileId) cloudReturn("Invalid cloud file", true);
  const connection = await getCloudConnection(user.id, provider);
  if (!connection) cloudReturn(`${provider} is not connected`, true);

  let importedName = "file";
  try {
    const source = await downloadCloudFile(connection, fileId);
    importedName = source.name;
    const maxImport = 100 * 1024 * 1024;
    if (source.data.length > maxImport) cloudReturn("Cloud import is limited to 100 MB per file", true);
    const quota = await assertDriveQuotaForUpload(source.data.length);
    if (!quota.allowed) cloudReturn("Drive quota exceeded", true);

    const key = makeStorageKey("drive", source.name);
    await storage().upload(key, source.data, source.mimeType);
    const file = await prisma.file.create({
      data: {
        name: source.name.slice(0, 200),
        storageKey: key,
        mimeType: source.mimeType,
        sizeBytes: source.data.length,
        category: "OTHER",
        isVault: false,
        folderId: null,
        uploadedById: user.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "DRIVE_CLOUD_FILE_IMPORTED",
        resourceType: "File",
        resourceId: file.id,
        after: {
          provider,
          externalFileId: fileId,
          sourceAccount: connection.accountEmail,
          name: source.name,
          bytes: source.data.length,
        },
      },
    });
    await processDriveAutomation(file.id, user.id, source.data).catch(() => null);
    revalidatePath("/app/drive");
    revalidatePath("/app/drive/cloud");
  } catch (e) {
    cloudReturn(e instanceof Error ? e.message : "Cloud import failed", true);
  }
  cloudReturn(`Imported ${importedName}`);
}

export async function disconnectCloudProvider(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  const provider = safeProvider(String(formData.get("provider") ?? ""));
  if (!provider) cloudReturn("Invalid cloud provider", true);
  await removeCloudConnection(user.id, provider);
  await prisma.auditLog
    .create({
      data: {
        userId: user.id,
        action: "DRIVE_CLOUD_DISCONNECTED",
        resourceType: "CloudConnection",
        resourceId: provider,
      },
    })
    .catch(() => undefined);
  revalidatePath("/app/drive/cloud");
  cloudReturn(`${provider === "google" ? "Google Drive" : "OneDrive"} disconnected`);
}

/** Copies a JUN Drive file into the user's connected cloud (Google Drive / OneDrive). */
export async function exportFileToCloud(formData: FormData): Promise<void> {
  const user = await requireUser();
  const provider = safeProvider(String(formData.get("provider") ?? "")) ?? "google";
  const fileId = String(formData.get("fileId") ?? "").trim();
  const folderId = String(formData.get("cloudFolderId") ?? "").trim() || null;
  const returnTo = String(formData.get("returnTo") ?? "/app/drive");
  function back(message: string, error = false): never {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}${error ? "toast_error" : "toast"}=${encodeURIComponent(message)}`,
    );
  }
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  if (!fileId) back("Invalid file", true);
  const file = await prisma.file.findFirst({ where: { id: fileId, archivedAt: null } });
  if (!file) return back("File not found", true);
  if (file.isVault ? !can(user, "VAULT_READ") : !can(user, "FILE_READ")) redirect("/app/forbidden");
  const connection = await getCloudConnection(user.id, provider);
  if (!connection)
    return back(
      `${provider === "google" ? "Google Drive" : "OneDrive"} is not connected — open Drive › Connected Cloud`,
      true,
    );
  try {
    const data = await storage().download(file.storageKey);
    const out = await uploadCloudFile(connection, {
      name: file.name,
      mimeType: file.mimeType,
      data,
      folderId,
    });
    await audit({
      userId: user.id,
      action: "FILE_EXPORTED_TO_CLOUD",
      resourceType: "File",
      resourceId: file.id,
      after: { provider, cloudFileId: out.id, name: file.name },
    });
    back(`${file.name} sent to ${provider === "google" ? "Google Drive" : "OneDrive"}`);
  } catch (e) {
    back(e instanceof Error ? e.message : "Export to cloud failed", true);
  }
}

/** Toggles a JUN-side favourite on a connected-cloud file (per user). */
export async function toggleCloudStar(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  const provider = safeProvider(String(formData.get("provider") ?? "")) ?? "google";
  const fileId = String(formData.get("fileId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? `/app/drive/cloud?provider=${provider}`);
  if (fileId) {
    const key = `${CLOUD_STAR_PREFIX}${user.id}.${provider}.${fileId}`;
    const existing = await prisma.appSetting.findUnique({ where: { key }, select: { id: true } });
    if (existing) await prisma.appSetting.delete({ where: { key } });
    else await prisma.appSetting.create({ data: { key, value: "1" } });
  }
  revalidatePath("/app/drive/cloud");
  redirect(returnTo.startsWith("/app/drive") ? returnTo : `/app/drive/cloud?provider=${provider}`);
}

/** Moves a connected-cloud file to the provider's trash (confirmed client-side). */
export async function trashCloudFile(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  const provider = safeProvider(String(formData.get("provider") ?? "")) ?? "google";
  const fileId = String(formData.get("fileId") ?? "").trim();
  const name = String(formData.get("name") ?? "").slice(0, 200);
  const returnTo = String(formData.get("returnTo") ?? `/app/drive/cloud?provider=${provider}`);
  const base = returnTo.startsWith("/app/drive") ? returnTo : `/app/drive/cloud?provider=${provider}`;
  const toast = (key: "toast" | "toast_error", message: string): never =>
    redirect(`${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`);
  if (!fileId) toast("toast_error", "Invalid file");
  const connection = await getCloudConnection(user.id, provider);
  if (!connection) toast("toast_error", "Cloud not connected");
  try {
    await trashCloudFileRemote(connection, fileId);
    await audit({
      userId: user.id,
      action: "CLOUD_FILE_TRASHED",
      resourceType: "CloudFile",
      resourceId: fileId,
      after: { provider, name },
    });
    await prisma.appSetting.deleteMany({
      where: { key: `${CLOUD_STAR_PREFIX}${user.id}.${provider}.${fileId}` },
    });
    revalidatePath("/app/drive/cloud");
    toast("toast", `${name || "File"} moved to ${provider === "google" ? "Google Drive" : "OneDrive"} trash`);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    toast("toast_error", e instanceof Error ? e.message : "Unable to trash this file");
  }
}
