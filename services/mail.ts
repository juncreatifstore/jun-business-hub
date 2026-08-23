"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { emptyToNull } from "@/lib/validation";
import { classifyEmailAILevel } from "@/services/ai";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const composeSchema = z.object({
  subject: z.string().min(1).max(200),
  toAddr: z.string().email(),
  body: z.string().min(1).max(20000),
  clientId: z.string().optional(),
  mailAccountId: z.string().min(1),
});

function mailPath(accountId:string,extra:string){return `/app/mail?mailbox=${encodeURIComponent(accountId)}&${extra}`;}

export async function composeDraft(formData: FormData): Promise<void> {
  const user = await assertPermission("EMAIL_DRAFT");
  const parsed = composeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/app/mail?compose=1&toast_error=${encodeURIComponent("Invalid draft")}`);
  const d = parsed.data;
  const account = await prisma.mailAccount.findFirst({
    where:{id:d.mailAccountId,OR:[{accessTokenEnc:{not:null}},{refreshTokenEnc:{not:null}}]},
    select:{id:true,email:true},
  });
  if (!account) redirect(`/app/mail?compose=1&toast_error=${encodeURIComponent("Selected mailbox is not connected")}`);
  const aiLevel = await classifyEmailAILevel(d.subject, d.body);
  const thread = await prisma.mailThread.create({
    data: {
      gmailThreadId: `local-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mailAccountId: account.id,
      clientId: emptyToNull(d.clientId ?? ""),
      subject: d.subject,
      snippet: d.body.slice(0, 500),
      fromEmail: account.email,
      toEmails: [d.toAddr],
      aiLevel,
      aiSummary: aiLevel === "BLOCKED" ? "Sensitive topic — manual handling required" : aiLevel === "AUTO" ? "Routine message" : "Needs human approval",
      aiDraft: d.body,
      requiresAttention: aiLevel !== "AUTO",
    },
  });
  await audit({ userId: user.id, action: "EMAIL_DRAFT_CREATE", resourceType: "MailThread", resourceId: thread.id, after: { subject: d.subject, aiLevel, mailbox: account.email, mailAccountId: account.id } });
  revalidatePath("/app/mail");
  redirect(mailPath(account.id,`folder=DRAFTS&thread=${thread.id}&toast=${encodeURIComponent("Draft saved")}`));
}

export async function sendDraft(threadId: string): Promise<void> {
  const user = await assertPermission("EMAIL_SEND");
  if (process.env.NODE_ENV === "production") redirect(`/app/mail?thread=${threadId}&toast_error=${encodeURIComponent("Use Gmail sending in production")}`);
  const thread = await prisma.mailThread.findUnique({ where: { id: threadId } });
  if (!thread || !thread.aiDraft) redirect(`/app/mail?toast_error=Draft not found`);
  if (thread.aiLevel === "BLOCKED") redirect(`/app/mail?thread=${threadId}&toast_error=This draft requires manual handling`);
  await prisma.mailThread.update({
    where: { id: threadId },
    data: { snippet: thread.aiDraft.slice(0, 500), aiDraft: null, lastMessageAt: new Date(), requiresAttention: false },
  });
  await audit({ userId: user.id, action: "EMAIL_SEND", resourceType: "MailThread", resourceId: threadId, after: { delivery: "DEV mock" } });
  revalidatePath("/app/mail");
  redirect(mailPath(thread.mailAccountId,`folder=SENT&thread=${threadId}&toast=${encodeURIComponent("Marked as sent")}`));
}

export async function moveThread(threadId: string, folder: string): Promise<void> {
  const user = await assertPermission("EMAIL_READ");
  const thread = await prisma.mailThread.findUnique({ where: { id: threadId } });
  if (!thread) redirect("/app/mail?toast_error=Thread not found");
  if (folder === "IMPORTANT" || folder === "AI_REVIEW") {
    await prisma.mailThread.update({ where: { id: threadId }, data: { requiresAttention: true } });
  }
  await audit({ userId: user.id, action: "EMAIL_MOVE", resourceType: "MailThread", resourceId: threadId, after: { folder } });
  revalidatePath("/app/mail");
  redirect(mailPath(thread.mailAccountId,`folder=${encodeURIComponent(folder)}&thread=${threadId}`));
}
