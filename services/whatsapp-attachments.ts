"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadWhatsAppMedia, saveChannelAttachmentToDrive } from "@/lib/channel-attachments";

function back(returnTo: string, key: "toast" | "toast_error", message: string): never {
  const base = returnTo.startsWith("/app/whatsapp") ? returnTo : "/app/whatsapp/inbox";
  redirect(`${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`);
}

const EXT: Record<string, string> = {
  image: ".jpg",
  sticker: ".webp",
  video: ".mp4",
  audio: ".ogg",
  document: ".pdf",
};

/** Saves a WhatsApp photo/document/video into JUN Drive, linked to the conversation's client. */
export async function saveWhatsAppMediaToDrive(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const mediaId = String(formData.get("mediaId") ?? "");
  const type = String(formData.get("type") ?? "document");
  const phone = String(formData.get("phone") ?? "").replace(/[^\d+]/g, "");
  const clientId = String(formData.get("clientId") ?? "").trim() || null;
  const contact = String(formData.get("contact") ?? "").slice(0, 120) || null;
  const filenameRaw = String(formData.get("filename") ?? "").slice(0, 200);
  const returnTo = String(formData.get("returnTo") ?? "/app/whatsapp/inbox");
  if (!/^[0-9]{5,40}$/.test(mediaId)) back(returnTo, "toast_error", "Média introuvable");
  // Only media that really came through this inbox can be saved.
  const known = await prisma.activity.findFirst({
    where: { resourceType: "WhatsAppConversation", message: { contains: `"mediaId":"${mediaId}"` } },
    select: { id: true },
  });
  if (!known) back(returnTo, "toast_error", "Média introuvable");

  try {
    const { bytes, mimeType } = await loadWhatsAppMedia(mediaId, type);
    const ext = EXT[type] ?? "";
    const stamp = new Date().toISOString().slice(0, 10);
    const name = filenameRaw || `WhatsApp ${type} ${stamp}${ext}`;
    const { fileId, created } = await saveChannelAttachmentToDrive({
      userId: user.id,
      name,
      mimeType,
      data: bytes,
      clientId,
      source: { channel: "WHATSAPP", ref: mediaId, from: contact ?? (phone || null) },
    });
    revalidatePath("/app/drive");
    back(
      returnTo,
      "toast",
      created ? `${name} enregistré dans Drive` : `Déjà dans Drive (${fileId.slice(0, 6)}…)`,
    );
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    back(returnTo, "toast_error", e instanceof Error ? e.message : "Enregistrement impossible");
  }
}
