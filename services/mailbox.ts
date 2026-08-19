"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitAsync } from "@/lib/rate-limit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function disconnectMailbox(accountId: string): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const acc = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!acc) redirect("/app/settings/email?toast_error=Mailbox not found");
  await prisma.mailAccount.update({ where: { id: acc.id }, data: { status: "REVOKED", refreshTokenEnc: null, accessToken: null } });
  await audit({ userId: user.id, action: "MAILBOX_DISCONNECTED", resourceType: "MailAccount", resourceId: acc.id, after: { email: acc.email } });
  revalidatePath("/app/settings/email");
  redirect("/app/settings/email?toast=Mailbox disconnected");
}

/** Pull recent messages from Gmail into JUN Mail (INBOX + SENT + DRAFTS + IMPORTANT). */
export async function syncMailbox(accountId: string): Promise<void> {
  const user = await assertPermission("EMAIL_READ");
  if (!(await rateLimitAsync(`gmail-sync:${user.id}`, 6, 60_000))) redirect("/app/mail?toast_error=Sync rate limit — wait a minute");
  const { syncFolder } = await import("@/lib/google/gmail");
  try {
    let total = 0;
    for (const f of ["INBOX", "SENT", "DRAFTS", "IMPORTANT"] as const) total += await syncFolder(accountId, f, 25);
    await audit({ userId: user.id, action: "GMAIL_SYNC", resourceType: "MailAccount", resourceId: accountId, after: { newMessages: total } });
    revalidatePath("/app/mail");
    redirect(`/app/mail?toast=${encodeURIComponent(`Sync complete — ${total} new message${total === 1 ? "" : "s"}`)}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // let redirect() through
    redirect(`/app/mail?toast_error=${encodeURIComponent(e instanceof Error ? e.message : "Gmail sync failed")}`);
  }
}

/**
 * Really send a draft through the connected Gmail mailbox.
 * BLOCKED-level threads (refunds, legal, banking, high amounts) can never be sent
 * from here without explicit human handling — enforced in services/mail.sendDraft too.
 */
export async function sendDraftViaGmail(threadId: string): Promise<void> {
  const user = await assertPermission("EMAIL_SEND");
  const thread = await prisma.emailThread.findUnique({ where: { id: threadId }, include: { messages: { where: { isDraft: true }, orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!thread) redirect("/app/mail?toast_error=Thread not found");
  const draft = thread.messages[0];
  if (!draft) redirect(`/app/mail?thread=${thread.id}&toast_error=No draft to send`);
  if (thread.aiLevel === "BLOCKED") redirect(`/app/mail?thread=${thread.id}&toast_error=This topic requires manual handling — automated send is blocked`);

  const account = await prisma.mailAccount.findFirst({ where: { status: "CONNECTED" }, orderBy: { createdAt: "asc" } });
  if (!account) redirect(`/app/mail?thread=${thread.id}&toast_error=No Gmail mailbox connected (Settings → Email)`);

  const { gmailSend } = await import("@/lib/google/gmail");
  try {
    const gmailId = await gmailSend(account.id, { to: draft.toAddr, subject: thread.subject, text: draft.body });
    await prisma.$transaction([
      prisma.emailMessage.update({ where: { id: draft.id }, data: { isDraft: false, sentAt: new Date(), gmailId } }),
      prisma.emailThread.update({ where: { id: thread.id }, data: { folder: "SENT" } }),
    ]);
    await audit({ userId: user.id, action: "EMAIL_SEND_GMAIL", resourceType: "EmailThread", resourceId: thread.id, after: { to: draft.toAddr, subject: thread.subject, gmailId, mailbox: account.email } });
    revalidatePath("/app/mail");
    redirect(`/app/mail?folder=SENT&thread=${thread.id}&toast=Email sent via ${account.email}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    redirect(`/app/mail?thread=${thread.id}&toast_error=${encodeURIComponent(e instanceof Error ? e.message : "Gmail send failed")}`);
  }
}
