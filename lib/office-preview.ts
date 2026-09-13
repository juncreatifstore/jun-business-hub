import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getCloudConnection, refreshCloudConnection, type CloudConnection } from "@/lib/drive-cloud";

export const OFFICE_MIMES: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "application/vnd.google-apps.document",
  "application/msword": "application/vnd.google-apps.document",
  "application/vnd.oasis.opendocument.text": "application/vnd.google-apps.document",
  "application/rtf": "application/vnd.google-apps.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "application/vnd.google-apps.spreadsheet",
  "application/vnd.ms-excel": "application/vnd.google-apps.spreadsheet",
  "application/vnd.oasis.opendocument.spreadsheet": "application/vnd.google-apps.spreadsheet",
  "text/csv": "application/vnd.google-apps.spreadsheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "application/vnd.google-apps.presentation",
  "application/vnd.ms-powerpoint": "application/vnd.google-apps.presentation",
  "application/vnd.oasis.opendocument.presentation": "application/vnd.google-apps.presentation",
};
export function isOfficeMime(mime: string) {
  return mime in OFFICE_MIMES;
}

/**
 * The Google Drive connection used as a conversion engine: any admin with a
 * connected Drive (the shared admin@ account in practice).
 */
async function converterConnection(): Promise<CloudConnection | null> {
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

/**
 * Converts an Office document to PDF through Google Drive (upload with
 * conversion → export → delete). Result cached in storage by content hash.
 */
export async function officeToPdf(input: {
  data: Buffer;
  mimeType: string;
  name: string;
}): Promise<Buffer | null> {
  const target = OFFICE_MIMES[input.mimeType];
  if (!target || input.data.byteLength > 30 * 1024 * 1024) return null;
  const hash = createHash("sha256").update(input.data).digest("hex").slice(0, 32);
  const cacheKey = `previews/office/${hash}.pdf`;
  const store = storage();
  try {
    return await store.download(cacheKey);
  } catch {}
  const conn = await converterConnection();
  if (!conn) return null;
  const c = await refreshCloudConnection(conn);
  const boundary = `jun-${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name: `jun-preview-${hash}`, mimeType: target });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
    input.data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: new Uint8Array(body),
  });
  if (!up.ok) return null;
  const { id } = (await up.json()) as { id: string };
  try {
    const ex = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application/pdf`,
      {
        headers: { Authorization: `Bearer ${c.accessToken}` },
      },
    );
    if (!ex.ok) return null;
    const pdf = Buffer.from(await ex.arrayBuffer());
    await store.upload(cacheKey, pdf, "application/pdf").catch(() => null);
    return pdf;
  } finally {
    await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${c.accessToken}` },
    }).catch(() => null);
  }
}
