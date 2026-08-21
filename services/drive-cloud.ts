"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { storage, makeStorageKey } from "@/lib/storage";
import { assertDriveQuotaForUpload } from "@/lib/drive-enterprise";
import { downloadCloudFile, getCloudConnection, isCloudAdmin, removeCloudConnection, type CloudProvider } from "@/lib/drive-cloud";
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
    await prisma.auditLog.create({ data: { userId: user.id, action: "DRIVE_CLOUD_FILE_IMPORTED", resourceType: "File", resourceId: file.id, after: { provider, externalFileId: fileId, sourceAccount: connection.accountEmail, name: source.name, bytes: source.data.length } } });
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
  await prisma.auditLog.create({ data: { userId: user.id, action: "DRIVE_CLOUD_DISCONNECTED", resourceType: "CloudConnection", resourceId: provider } }).catch(() => undefined);
  revalidatePath("/app/drive/cloud");
  cloudReturn(`${provider === "google" ? "Google Drive" : "OneDrive"} disconnected`);
}
