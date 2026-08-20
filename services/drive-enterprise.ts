"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  DEFAULT_DRIVE_ENTERPRISE_SETTINGS,
  DRIVE_ENTERPRISE_SETTINGS_KEY,
  DRIVE_VERSION_PREFIX,
  getDriveEnterpriseSettings,
  type DriveEnterpriseSettings,
} from "@/lib/drive-enterprise";

function safeReturn(formData?: FormData, fallback = "/app/drive/enterprise") {
  const value = String(formData?.get("returnTo") ?? "");
  return value.startsWith("/app/drive") ? value : fallback;
}

function toast(path: string, key: "toast" | "toast_error", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

function int(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

export async function saveDriveEnterpriseSettings(formData: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const returnTo = safeReturn(formData);
  const current = await getDriveEnterpriseSettings();
  const quotaGb = int(formData.get("quotaGb"), Math.round(current.quotaBytes / 1073741824), 1, 2048);
  const zipMaxFiles = int(formData.get("zipMaxFiles"), current.zipMaxFiles, 1, 200);
  const zipMaxMb = int(formData.get("zipMaxMb"), Math.round(current.zipMaxBytes / 1048576), 5, 500);
  const retentionTrashDays = int(formData.get("retentionTrashDays"), current.retentionTrashDays, 1, 3650);
  const maxPublicLinkDays = int(formData.get("maxPublicLinkDays"), current.maxPublicLinkDays, 0, 3650);
  const policyRaw = String(formData.get("publicLinkPolicy") ?? "ALLOW");
  const publicLinkPolicy: DriveEnterpriseSettings["publicLinkPolicy"] = policyRaw === "PASSWORD_REQUIRED" || policyRaw === "DISABLED" ? policyRaw : "ALLOW";
  const settings: DriveEnterpriseSettings = {
    quotaBytes: quotaGb * 1073741824,
    zipMaxFiles,
    zipMaxBytes: zipMaxMb * 1048576,
    retentionEnabled: String(formData.get("retentionEnabled") ?? "") === "1",
    retentionTrashDays,
    publicLinkPolicy,
    maxPublicLinkDays,
  };
  await prisma.appSetting.upsert({
    where: { key: DRIVE_ENTERPRISE_SETTINGS_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: DRIVE_ENTERPRISE_SETTINGS_KEY, value: JSON.stringify(settings) },
  });
  await audit({ userId: user.id, action: "DRIVE_ENTERPRISE_SETTINGS_UPDATE", resourceType: "Drive", before: current as any, after: settings as any });
  revalidatePath("/app/drive");
  revalidatePath("/app/drive/enterprise");
  redirect(toast(returnTo, "toast", "Enterprise policies saved"));
}

async function cleanupFileMetadata(fileId: string) {
  const rows = await prisma.appSetting.findMany({ where: { OR: [
    { key: { endsWith: `.${fileId}` } },
    { key: { startsWith: `drive.note.${fileId}` } },
    { key: { startsWith: `drive.public.disabled.${fileId}` } },
    { key: { startsWith: `drive.public.token.${fileId}` } },
    { key: { startsWith: `drive.public.expires.${fileId}` } },
    { key: { startsWith: `drive.public.password.${fileId}` } },
    { key: { startsWith: `drive.intelligence.${fileId}` } },
    { key: { startsWith: `drive.hash.${fileId}` } },
    { key: { startsWith: `drive.tags.${fileId}` } },
    { key: { startsWith: `drive.duplicate.${fileId}` } },
    { key: { startsWith: `drive.expiry.${fileId}` } },
    { key: { startsWith: `drive.collaboration.File.${fileId}` } },
    { key: { startsWith: `${DRIVE_VERSION_PREFIX}${fileId}.` } },
  ] }, select: { key: true, value: true } });
  for (const row of rows) {
    if (!row.key.startsWith(`${DRIVE_VERSION_PREFIX}${fileId}.`)) continue;
    try {
      const meta = JSON.parse(row.value) as { storageKey?: string };
      if (meta.storageKey) await storage().remove(meta.storageKey).catch(() => undefined);
    } catch {}
  }
  if (rows.length) await prisma.appSetting.deleteMany({ where: { key: { in: rows.map((r) => r.key) } } });
}

export async function runDriveRetentionMaintenance(formData?: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const returnTo = safeReturn(formData);
  const settings = await getDriveEnterpriseSettings();
  if (!settings.retentionEnabled) redirect(toast(returnTo, "toast_error", "Retention policy is disabled"));
  const cutoff = new Date(Date.now() - settings.retentionTrashDays * 86400000);
  const files = await prisma.file.findMany({
    where: { isVault: false, archivedAt: { not: null, lte: cutoff } },
    select: { id: true, name: true, storageKey: true, archivedAt: true },
    take: 200,
  });
  let deleted = 0;
  for (const file of files) {
    await storage().remove(file.storageKey).catch(() => undefined);
    await cleanupFileMetadata(file.id);
    await prisma.file.delete({ where: { id: file.id } }).catch(() => undefined);
    deleted++;
  }
  await audit({ userId: user.id, action: "DRIVE_RETENTION_RUN", resourceType: "Drive", after: { cutoff: cutoff.toISOString(), deleted, batchLimit: 200 } });
  revalidatePath("/app/drive");
  revalidatePath("/app/drive/enterprise");
  redirect(toast(returnTo, "toast", `Retention complete: ${deleted} file${deleted === 1 ? "" : "s"} permanently deleted`));
}

export async function resetDriveEnterpriseSettings(formData?: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const returnTo = safeReturn(formData);
  await prisma.appSetting.upsert({
    where: { key: DRIVE_ENTERPRISE_SETTINGS_KEY },
    update: { value: JSON.stringify(DEFAULT_DRIVE_ENTERPRISE_SETTINGS) },
    create: { key: DRIVE_ENTERPRISE_SETTINGS_KEY, value: JSON.stringify(DEFAULT_DRIVE_ENTERPRISE_SETTINGS) },
  });
  await audit({ userId: user.id, action: "DRIVE_ENTERPRISE_SETTINGS_RESET", resourceType: "Drive", after: DEFAULT_DRIVE_ENTERPRISE_SETTINGS as any });
  revalidatePath("/app/drive/enterprise");
  redirect(toast(returnTo, "toast", "Enterprise policies reset to safe defaults"));
}
