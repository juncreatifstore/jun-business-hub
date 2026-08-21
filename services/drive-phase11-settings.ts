"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { DRIVE_ENTERPRISE_SETTINGS_KEY, getDriveEnterpriseSettings } from "@/lib/drive-enterprise";
import { DRIVE_PRIVACY_FILE_PREFIX, DRIVE_PRIVACY_GLOBAL_KEY, getDrivePrivacyPolicy, type DrivePrivacyPolicy } from "@/lib/drive-privacy";

function toast(path: string, message: string, error = false) {
  return `${path}${path.includes("?") ? "&" : "?"}${error ? "toast_error" : "toast"}=${encodeURIComponent(message)}`;
}

export async function setDriveQuotaToTwoTb(formData?: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const current = await getDriveEnterpriseSettings();
  const next = { ...current, quotaBytes: 2 * 1024 * 1024 * 1024 * 1024 };
  await prisma.appSetting.upsert({ where: { key: DRIVE_ENTERPRISE_SETTINGS_KEY }, update: { value: JSON.stringify(next) }, create: { key: DRIVE_ENTERPRISE_SETTINGS_KEY, value: JSON.stringify(next) } });
  await audit({ userId: user.id, action: "DRIVE_QUOTA_SET_2TB", resourceType: "Drive", before: current as any, after: next as any });
  revalidatePath("/app/drive/enterprise");
  revalidatePath("/app/drive/cloud");
  redirect(toast("/app/drive/cloud", "JUN Drive quota set to 2 TB"));
}

export async function saveGlobalDrivePrivacyPolicy(formData: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 12000);
  if (!title || body.length < 50) redirect(toast("/app/drive/privacy", "Provide a title and a confidentiality text of at least 50 characters", true));
  const previous = await getDrivePrivacyPolicy("__global_preview__");
  const policy: DrivePrivacyPolicy = { version: new Date().toISOString(), title, body, updatedAt: new Date().toISOString(), required: String(formData.get("required") ?? "") !== "0" };
  await prisma.appSetting.upsert({ where: { key: DRIVE_PRIVACY_GLOBAL_KEY }, update: { value: JSON.stringify(policy) }, create: { key: DRIVE_PRIVACY_GLOBAL_KEY, value: JSON.stringify(policy) } });
  await audit({ userId: user.id, action: "DRIVE_PRIVACY_GLOBAL_UPDATE", resourceType: "Drive", before: previous as any, after: policy as any });
  revalidatePath("/app/drive/privacy");
  redirect(toast("/app/drive/privacy", "Global confidentiality policy updated. Existing consents must be accepted again because the policy version changed."));
}

export async function saveFileDrivePrivacyPolicy(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const file = await prisma.file.findFirst({ where: { id: fileId, isVault: false }, select: { id: true, name: true } });
  if (!file) redirect(toast("/app/drive/privacy", "File not found", true));
  const useGlobal = String(formData.get("useGlobal") ?? "") === "1";
  const key = `${DRIVE_PRIVACY_FILE_PREFIX}${file.id}`;
  if (useGlobal) {
    await prisma.appSetting.deleteMany({ where: { key } });
    await audit({ userId: user.id, action: "DRIVE_PRIVACY_FILE_RESET", resourceType: "File", resourceId: file.id });
    revalidatePath("/app/drive/privacy");
    redirect(toast("/app/drive/privacy", `${file.name} now uses the global confidentiality policy`));
  }
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 12000);
  if (!title || body.length < 50) redirect(toast("/app/drive/privacy", "Provide a valid per-file confidentiality policy", true));
  const policy: DrivePrivacyPolicy = { version: new Date().toISOString(), title, body, updatedAt: new Date().toISOString(), required: true };
  await prisma.appSetting.upsert({ where: { key }, update: { value: JSON.stringify(policy) }, create: { key, value: JSON.stringify(policy) } });
  await audit({ userId: user.id, action: "DRIVE_PRIVACY_FILE_UPDATE", resourceType: "File", resourceId: file.id, after: { version: policy.version, title: policy.title } });
  revalidatePath("/app/drive/privacy");
  redirect(toast("/app/drive/privacy", `Custom confidentiality policy saved for ${file.name}`));
}
