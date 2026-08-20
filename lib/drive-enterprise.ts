import "server-only";

import { prisma } from "@/lib/prisma";

export const DRIVE_ENTERPRISE_SETTINGS_KEY = "drive.enterprise.settings";
export const DRIVE_VERSION_PREFIX = "drive.version.";

export type DriveEnterpriseSettings = {
  quotaBytes: number;
  zipMaxFiles: number;
  zipMaxBytes: number;
  retentionEnabled: boolean;
  retentionTrashDays: number;
  publicLinkPolicy: "ALLOW" | "PASSWORD_REQUIRED" | "DISABLED";
  maxPublicLinkDays: number;
};

export const DEFAULT_DRIVE_ENTERPRISE_SETTINGS: DriveEnterpriseSettings = {
  quotaBytes: 20 * 1024 * 1024 * 1024,
  zipMaxFiles: 50,
  zipMaxBytes: 100 * 1024 * 1024,
  retentionEnabled: false,
  retentionTrashDays: 30,
  publicLinkPolicy: "ALLOW",
  maxPublicLinkDays: 0,
};

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

export async function getDriveEnterpriseSettings(): Promise<DriveEnterpriseSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: DRIVE_ENTERPRISE_SETTINGS_KEY }, select: { value: true } });
  if (!row) return DEFAULT_DRIVE_ENTERPRISE_SETTINGS;
  try {
    const parsed = JSON.parse(row.value) as Partial<DriveEnterpriseSettings>;
    const policy = parsed.publicLinkPolicy === "PASSWORD_REQUIRED" || parsed.publicLinkPolicy === "DISABLED" ? parsed.publicLinkPolicy : "ALLOW";
    return {
      quotaBytes: boundedInt(parsed.quotaBytes, DEFAULT_DRIVE_ENTERPRISE_SETTINGS.quotaBytes, 100 * 1024 * 1024, 2 * 1024 * 1024 * 1024 * 1024),
      zipMaxFiles: boundedInt(parsed.zipMaxFiles, DEFAULT_DRIVE_ENTERPRISE_SETTINGS.zipMaxFiles, 1, 200),
      zipMaxBytes: boundedInt(parsed.zipMaxBytes, DEFAULT_DRIVE_ENTERPRISE_SETTINGS.zipMaxBytes, 5 * 1024 * 1024, 500 * 1024 * 1024),
      retentionEnabled: parsed.retentionEnabled === true,
      retentionTrashDays: boundedInt(parsed.retentionTrashDays, DEFAULT_DRIVE_ENTERPRISE_SETTINGS.retentionTrashDays, 1, 3650),
      publicLinkPolicy: policy,
      maxPublicLinkDays: boundedInt(parsed.maxPublicLinkDays, DEFAULT_DRIVE_ENTERPRISE_SETTINGS.maxPublicLinkDays, 0, 3650),
    };
  } catch {
    return DEFAULT_DRIVE_ENTERPRISE_SETTINGS;
  }
}

export async function getDriveStorageUsage() {
  const [files, versionRows] = await Promise.all([
    prisma.file.aggregate({ where: { isVault: false }, _sum: { sizeBytes: true }, _count: { id: true } }),
    prisma.appSetting.findMany({ where: { key: { startsWith: DRIVE_VERSION_PREFIX } }, select: { value: true } }),
  ]);
  let versionBytes = 0;
  let versions = 0;
  for (const row of versionRows) {
    try {
      const meta = JSON.parse(row.value) as { sizeBytes?: number };
      if (Number.isFinite(meta.sizeBytes)) versionBytes += Math.max(0, Number(meta.sizeBytes));
      versions++;
    } catch {}
  }
  const currentBytes = Number(files._sum.sizeBytes ?? 0);
  return { currentBytes, versionBytes, totalBytes: currentBytes + versionBytes, files: files._count.id, versions };
}

export async function assertDriveQuotaForUpload(incomingBytes: number) {
  const [settings, usage] = await Promise.all([getDriveEnterpriseSettings(), getDriveStorageUsage()]);
  return { allowed: usage.totalBytes + Math.max(0, incomingBytes) <= settings.quotaBytes, settings, usage };
}

export async function getDriveEnterpriseReport() {
  const [settings, usage, activeFiles, trashFiles, folders, audits, publicSettings] = await Promise.all([
    getDriveEnterpriseSettings(),
    getDriveStorageUsage(),
    prisma.file.count({ where: { isVault: false, archivedAt: null } }),
    prisma.file.count({ where: { isVault: false, archivedAt: { not: null } } }),
    prisma.folder.count({ where: { isVault: false } }),
    prisma.auditLog.count({ where: { resourceType: "File" } }),
    prisma.appSetting.findMany({ where: { OR: [
      { key: { startsWith: "drive.public.disabled." } },
      { key: { startsWith: "drive.public.password." } },
      { key: { startsWith: "drive.public.expires." } },
      { key: { startsWith: "drive.public.token." } },
    ] }, select: { key: true } }),
  ]);
  const disabled = new Set<string>();
  const password = new Set<string>();
  const expires = new Set<string>();
  const token = new Set<string>();
  for (const row of publicSettings) {
    if (row.key.startsWith("drive.public.disabled.")) disabled.add(row.key.slice("drive.public.disabled.".length));
    else if (row.key.startsWith("drive.public.password.")) password.add(row.key.slice("drive.public.password.".length));
    else if (row.key.startsWith("drive.public.expires.")) expires.add(row.key.slice("drive.public.expires.".length));
    else if (row.key.startsWith("drive.public.token.")) token.add(row.key.slice("drive.public.token.".length));
  }
  const publicCandidates = new Set([...password, ...expires, ...token]);
  let nonCompliantPublicLinks = 0;
  for (const id of publicCandidates) {
    if (disabled.has(id)) continue;
    if (settings.publicLinkPolicy === "DISABLED") nonCompliantPublicLinks++;
    else if (settings.publicLinkPolicy === "PASSWORD_REQUIRED" && !password.has(id)) nonCompliantPublicLinks++;
    else if (settings.maxPublicLinkDays > 0 && !expires.has(id)) nonCompliantPublicLinks++;
  }
  return { settings, usage, activeFiles, trashFiles, folders, auditEvents: audits, publicCandidates: publicCandidates.size, nonCompliantPublicLinks };
}

export function drivePublicPolicyAllows(settings: DriveEnterpriseSettings, security: { passwordHash: string | null; expiresAt: Date | null }) {
  if (settings.publicLinkPolicy === "DISABLED") return false;
  if (settings.publicLinkPolicy === "PASSWORD_REQUIRED" && !security.passwordHash) return false;
  if (settings.maxPublicLinkDays > 0) {
    if (!security.expiresAt) return false;
    const max = Date.now() + settings.maxPublicLinkDays * 86400000 + 60000;
    if (security.expiresAt.getTime() > max) return false;
  }
  return true;
}
