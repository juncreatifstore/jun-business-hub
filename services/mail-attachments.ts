"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertMailboxAccess } from "@/lib/mail-security";
import { fetchGmailAttachment, saveChannelAttachmentToDrive } from "@/lib/channel-attachments";

function back(returnTo: string, key: "toast" | "toast_error", message: string): never {
  const base = returnTo.startsWith("/app/mail") ? returnTo : "/app/mail";
  redirect(`${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`);
}

/** Saves one e-mail attachment into JUN Drive, linked to the thread's client. */
export async function saveMailAttachmentToDrive(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const threadId = String(formData.get("threadId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "");
  const filename = String(formData.get("filename") ?? "attachment").slice(0, 200);
  const mimeType = String(formData.get("mimeType") ?? "application/octet-stream").slice(0, 120);
  const from = String(formData.get("from") ?? "").slice(0, 200) || null;
  const returnTo = String(formData.get("returnTo") ?? "/app/mail");
  const clientOverride = String(formData.get("clientId") ?? "").trim() || null;
  if (!threadId || !messageId || !attachmentId) back(returnTo, "toast_error", "Pièce jointe introuvable");

  const thread = await prisma.mailThread.findUnique({
    where: { id: threadId },
    select: { id: true, mailAccountId: true, clientId: true },
  });
  if (!thread) back(returnTo, "toast_error", "Fil introuvable");
  await assertMailboxAccess(user, thread.mailAccountId);

  try {
    const data = await fetchGmailAttachment(thread.mailAccountId, messageId, attachmentId);
    const { fileId, created } = await saveChannelAttachmentToDrive({
      userId: user.id,
      name: filename,
      mimeType,
      data,
      clientId: clientOverride ?? thread.clientId,
      source: { channel: "MAIL", ref: `${messageId}:${attachmentId}`, from },
    });
    revalidatePath("/app/drive");
    back(
      returnTo,
      "toast",
      created
        ? `${filename} enregistré dans Drive`
        : `${filename} était déjà dans Drive (${fileId.slice(0, 6)}…)`,
    );
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    back(returnTo, "toast_error", e instanceof Error ? e.message : "Enregistrement impossible");
  }
}
