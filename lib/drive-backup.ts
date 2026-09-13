import "server-only";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import {
  refreshCloudConnection,
  uploadCloudFile,
  getCloudConnection,
  type CloudConnection,
} from "@/lib/drive-cloud";

export const BACKUP_STATE_KEY = "drive.backup.state";
const ROOT_NAME = "JUN Business Hub — Sauvegarde";
const MAX_BYTES = 200 * 1024 * 1024;

type BackupState = {
  rootFolderId?: string;
  folders?: Record<string, string>;
  lastRunAt?: string;
  lastResult?: { copied: number; failed: number; pending: number };
};

async function loadState(): Promise<BackupState> {
  const row = await prisma.appSetting.findUnique({
    where: { key: BACKUP_STATE_KEY },
    select: { value: true },
  });
  try {
    return row ? (JSON.parse(row.value) as BackupState) : {};
  } catch {
    return {};
  }
}
async function saveState(state: BackupState) {
  const value = JSON.stringify(state);
  await prisma.appSetting.upsert({
    where: { key: BACKUP_STATE_KEY },
    create: { key: BACKUP_STATE_KEY, value },
    update: { value },
  });
}

/** The Google Drive connection used for backups: any admin's connected Drive (admin@ in practice). */
export async function backupConnection(): Promise<CloudConnection | null> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: "drive.cloud.connection.", endsWith: ".google" } },
    select: { key: true },
  });
  for (const r of rows) {
    const userId = r.key.slice("drive.cloud.connection.".length, -".google".length);
    const c = await getCloudConnection(userId, "google").catch(() => null);
    if (c) return c;
  }
  return null;
}

async function ensureFolder(
  token: string,
  name: string,
  parentId: string | null,
  state: BackupState,
  cacheKey: string,
) {
  state.folders ??= {};
  if (state.folders[cacheKey]) {
    const check = await fetch(
      `https://www.googleapis.com/drive/v3/files/${state.folders[cacheKey]}?fields=id,trashed&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (check.ok) {
      const j = (await check.json()) as { id: string; trashed?: boolean };
      if (!j.trashed) return j.id;
    }
  }
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentId ? ` and '${parentId}' in parents` : " and 'root' in parents"}`;
  const found = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const fj = found.ok ? ((await found.json()) as { files?: Array<{ id: string }> }) : { files: [] };
  let id = fj.files?.[0]?.id;
  if (!id) {
    const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Drive folder creation failed (${res.status})`);
    id = ((await res.json()) as { id: string }).id;
  }
  state.folders[cacheKey] = id;
  return id;
}

/**
 * Copies files that have no off-site copy yet (or whose copy failed > 1 day
 * ago) to Google Drive under "JUN Business Hub — Sauvegarde / <year> / <month>".
 * Idempotent per file (backupRef). Budgeted per run.
 */
export async function runDriveBackup(limit = 40, budgetMs = 80_000) {
  const started = Date.now();
  const conn = await backupConnection();
  if (!conn)
    return { ok: false as const, reason: "No Google Drive connection", copied: 0, failed: 0, pending: 0 };
  const c = await refreshCloudConnection(conn);
  const state = await loadState();
  const files = await prisma.file.findMany({
    where: {
      backupRef: null,
      sizeBytes: { lte: MAX_BYTES },
      OR: [{ backupError: null }, { backupAt: { lt: new Date(Date.now() - 86_400_000) } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      name: true,
      mimeType: true,
      storageKey: true,
      createdAt: true,
      isVault: true,
      client: { select: { firstName: true, lastName: true, internalId: true } },
    },
  });
  const root = await ensureFolder(c.accessToken, ROOT_NAME, null, state, "root");
  let copied = 0;
  let failed = 0;
  for (const f of files) {
    if (Date.now() - started > budgetMs) break;
    try {
      const y = String(f.createdAt.getUTCFullYear());
      const m = String(f.createdAt.getUTCMonth() + 1).padStart(2, "0");
      const yFolder = await ensureFolder(c.accessToken, y, root, state, `y:${y}`);
      const mFolder = await ensureFolder(c.accessToken, m, yFolder, state, `m:${y}-${m}`);
      const data = await storage().download(f.storageKey);
      const prefix = f.client ? `${f.client.lastName} ${f.client.firstName} (${f.client.internalId}) — ` : "";
      const name = `${prefix}${f.name}`.slice(0, 200);
      const out = await uploadCloudFile(c, { name, mimeType: f.mimeType, data, folderId: mFolder });
      await prisma.file.update({
        where: { id: f.id },
        data: { backupRef: out.id, backupAt: new Date(), backupError: null },
      });
      copied++;
    } catch (e) {
      failed++;
      await prisma.file
        .update({
          where: { id: f.id },
          data: {
            backupAt: new Date(),
            backupError: (e instanceof Error ? e.message : "backup failed").slice(0, 300),
          },
        })
        .catch(() => null);
    }
  }
  const pending = await prisma.file.count({ where: { backupRef: null, sizeBytes: { lte: MAX_BYTES } } });
  state.rootFolderId = root;
  state.lastRunAt = new Date().toISOString();
  state.lastResult = { copied, failed, pending };
  await saveState(state);
  return { ok: true as const, copied, failed, pending, rootFolderId: root };
}

export async function driveBackupStatus() {
  const [state, total, backedUp, errors, tooBig] = await Promise.all([
    loadState(),
    prisma.file.count(),
    prisma.file.count({ where: { backupRef: { not: null } } }),
    prisma.file.count({ where: { backupRef: null, backupError: { not: null } } }),
    prisma.file.count({ where: { sizeBytes: { gt: MAX_BYTES } } }),
  ]);
  const conn = await backupConnection();
  return {
    connected: Boolean(conn),
    account: conn?.accountEmail ?? null,
    total,
    backedUp,
    errors,
    tooBig,
    lastRunAt: state.lastRunAt ?? null,
    lastResult: state.lastResult ?? null,
    rootFolderId: state.rootFolderId ?? null,
  };
}
