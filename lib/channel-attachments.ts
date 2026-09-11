import "server-only";
import { prisma } from "@/lib/prisma";
import { storage, makeStorageKey } from "@/lib/storage";
import { accessTokenFor } from "@/lib/google/gmail";
import { audit, logActivity } from "@/lib/audit";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Raw bytes of one Gmail attachment (size-limited: 25 MB is Gmail's own cap). */
export async function fetchGmailAttachment(accountId: string, messageId: string, attachmentId: string) {
  const { token } = await accessTokenFor(accountId);
  const res = await fetch(
    `${GMAIL}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Gmail attachment fetch failed (${res.status})`);
  const body = (await res.json()) as { data?: string; size?: number };
  if (!body.data) throw new Error("Empty attachment");
  return Buffer.from(body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Bytes + MIME of a WhatsApp media object: from the archive, else re-fetched
 * from Meta (and archived). Mirrors /api/whatsapp/media/[id].
 */
export async function loadWhatsAppMedia(mediaId: string, payloadType: string) {
  const key = `whatsapp/media/${mediaId}`;
  const store = storage();
  try {
    const bytes = await store.download(key);
    const mimeType =
      payloadType === "audio"
        ? "audio/ogg"
        : payloadType === "image" || payloadType === "sticker"
          ? "image/jpeg"
          : payloadType === "video"
            ? "video/mp4"
            : payloadType === "document"
              ? "application/pdf"
              : "application/octet-stream";
    return { bytes, mimeType };
  } catch {
    const { fetchWhatsAppMedia } = await import("@/lib/whatsapp");
    const fetched = await fetchWhatsAppMedia(mediaId);
    await store.upload(key, fetched.bytes, fetched.mimeType).catch(() => null);
    return { bytes: fetched.bytes, mimeType: fetched.mimeType };
  }
}

export type SaveToDriveInput = {
  userId: string;
  name: string;
  mimeType: string;
  data: Buffer;
  clientId?: string | null;
  caseId?: string | null;
  source: { channel: "MAIL" | "WHATSAPP"; ref: string; from?: string | null };
};

/**
 * Registers channel bytes as a Drive file, linked to the client when known,
 * and kicks off document typing. Idempotent per (channel, ref): re-saving the
 * same attachment returns the existing file.
 */
export async function saveChannelAttachmentToDrive(input: SaveToDriveInput) {
  const dedupeKey = `drive.source.${input.source.channel}.${input.source.ref}`;
  const existing = await prisma.appSetting.findUnique({ where: { key: dedupeKey }, select: { value: true } });
  if (existing) {
    const file = await prisma.file.findFirst({
      where: { id: existing.value, archivedAt: null },
      select: { id: true },
    });
    if (file) return { fileId: file.id, created: false };
  }
  const key = makeStorageKey("drive", input.name);
  await storage().upload(key, input.data, input.mimeType);
  const file = await prisma.file.create({
    data: {
      name: input.name.slice(0, 200),
      storageKey: key,
      mimeType: input.mimeType,
      sizeBytes: input.data.length,
      category: "OTHER",
      isVault: false,
      folderId: null,
      clientId: input.clientId ?? null,
      caseId: input.caseId ?? null,
      uploadedById: input.userId,
    },
  });
  await prisma.appSetting.upsert({
    where: { key: dedupeKey },
    create: { key: dedupeKey, value: file.id },
    update: { value: file.id },
  });
  const note = `Reçu par ${input.source.channel === "MAIL" ? "e-mail" : "WhatsApp"}${input.source.from ? ` de ${input.source.from}` : ""}`;
  await prisma.appSetting.upsert({
    where: { key: `drive.note.${file.id}` },
    create: { key: `drive.note.${file.id}`, value: note },
    update: { value: note },
  });
  await audit({
    userId: input.userId,
    action: "FILE_SAVED_FROM_CHANNEL",
    resourceType: "File",
    resourceId: file.id,
    after: {
      channel: input.source.channel,
      ref: input.source.ref,
      name: file.name,
      clientId: input.clientId ?? null,
    },
  });
  await logActivity({
    userId: input.userId,
    type: "FILE_UPLOADED",
    message: `${note} — ${file.name}`,
    clientId: input.clientId ?? undefined,
    caseId: input.caseId ?? undefined,
  });
  // Typing + key-field extraction in the background (needs the bytes; already in memory here).
  void import("@/services/drive-intelligence")
    .then(({ extractFileInBackground }) => extractFileInBackground(file.id))
    .catch(() => null);
  return { fileId: file.id, created: true };
}
