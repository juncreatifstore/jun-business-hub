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
  await prisma.mailAccount.update({ where: { id: acc.id }, data: { refreshTokenEnc: null, accessTokenEnc: null, tokenExpiry: null } });
  await audit({ userId: user.id, action: "MAILBOX_DISCONNECTED", resourceType: "MailAccount", resourceId: acc.id, after: { email: acc.email } });
  revalidatePath("/app/settings/email");
  redirect("/app/settings/email?toast=Mailbox disconnected");
}

export async function syncMailbox(accountId: string): Promise<void> {
  const user = await assertPermission("EMAIL_READ");
  if (!(await rateLimitAsync(`gmail-sync:${user.id}`, 6, 60_000))) redirect("/app/mail?toast_error=Sync rate limit — wait a minute");
  const { syncFolder } = await import("@/lib/google/gmail");
  try {
    let total = 0;
    for (const f of ["INBOX", "SENT", "DRAFTS", "IMPORTANT"] as const) total += await syncFolder(accountId, f, 25);
    await audit({ userId: user.id, action: "GMAIL_SYNC", resourceType: "MailAccount", resourceId: accountId, after: { newThreads: total } });
    revalidatePath("/app/mail");
    redirect(`/app/mail?toast=${encodeURIComponent(`Sync complete — ${total} new thread${total === 1 ? "" : "s"}`)}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    redirect(`/app/mail?toast_error=${encodeURIComponent(e instanceof Error ? e.message : "Gmail sync failed")}`);
  }
}

export async function sendDraftViaGmail(threadId: string): Promise<void> {
  const user = await assertPermission("EMAIL_SEND");
  const thread = await prisma.mailThread.findUnique({ where: { id: threadId }, include: { account: true } });
  if (!thread || !thread.aiDraft) redirect("/app/mail?toast_error=Draft not found");
  if (thread.aiLevel === "BLOCKED") redirect(`/app/mail?thread=${threadId}&toast_error=This topic requires manual handling`);
  const to = thread.toEmails[0];
  if (!to) redirect(`/app/mail?thread=${threadId}&toast_error=No recipient on this draft`);
  const { gmailSend } = await import("@/lib/google/gmail");
  try {
    await gmailSend(thread.mailAccountId, { to, subject: thread.subject ?? "(no subject)", text: thread.aiDraft });
    await prisma.mailThread.update({
      where: { id: thread.id },
      data: { snippet: thread.aiDraft.slice(0, 500), aiDraft: null, lastMessageAt: new Date(), requiresAttention: false },
    });
    await audit({ userId: user.id, action: "EMAIL_SEND_GMAIL", resourceType: "MailThread", resourceId: thread.id, after: { to, subject: thread.subject, mailbox: thread.account.email } });
    revalidatePath("/app/mail");
    redirect(`/app/mail?folder=SENT&thread=${thread.id}&toast=Email sent via ${thread.account.email}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    redirect(`/app/mail?thread=${thread.id}&toast_error=${encodeURIComponent(e instanceof Error ? e.message : "Gmail send failed")}`);
  }
}
