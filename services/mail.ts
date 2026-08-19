"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { emptyToNull } from "@/lib/validation";
import { classifyEmailAILevel } from "@/services/ai";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const composeSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200),
  toAddr: z.string().email("Valid recipient email required"),
  body: z.string().min(1, "Message body is required").max(20000),
  clientId: z.string().optional(),
  caseId: z.string().optional(),
});

/** Create a draft thread + message. Gmail sync: Requires external API credentials. */
export async function composeDraft(formData: FormData): Promise<void> {
  const user = await assertPermission("EMAIL_DRAFT");
  const parsed = composeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? "Invalid input";
    redirect(`/app/mail?folder=DRAFTS&toast_error=${encodeURIComponent(first)}`);
  }
  const d = parsed.data;
  const aiLevel = await classifyEmailAILevel(d.subject, d.body);

  const thread = await prisma.emailThread.create({
    data: {
      subject: d.subject,
      folder: "DRAFTS",
      aiLevel,
      aiSummary: aiLevel === "BLOCKED" ? "Sensitive topic or high amount — human handling required" : aiLevel === "AUTO" ? "Routine acknowledgement" : "Needs human approval before automated handling",
      clientId: emptyToNull(d.clientId ?? ""),
      caseId: emptyToNull(d.caseId ?? ""),
      messages: {
        create: { fromAddr: user.email, toAddr: d.toAddr, body: d.body, isDraft: true },
      },
    },
  });

  await audit({ userId: user.id, action: "EMAIL_DRAFT_CREATE", resourceType: "EmailThread", resourceId: thread.id, after: { subject: d.subject, aiLevel } });
  revalidatePath("/app/mail");
  redirect(`/app/mail?folder=DRAFTS&thread=${thread.id}&toast=Draft saved`);
}

/**
 * DEV-ONLY mock send: records the message as sent inside the hub without real
 * delivery. FORBIDDEN in production — production sending goes exclusively through
 * sendDraftViaGmail (services/mailbox.ts), which only marks SENT after the Gmail
 * API accepted the message.
 */
export async function sendDraft(threadId: string): Promise<void> {
  const user = await assertPermission("EMAIL_SEND");
  if (process.env.NODE_ENV === "production") {
    redirect(`/app/mail?thread=${threadId}&toast_error=${encodeURIComponent("Connect a Gmail mailbox before sending emails.")}`);
  }
  const thread = await prisma.emailThread.findUnique({ where: { id: threadId }, include: { messages: { where: { isDraft: true } } } });
  if (!thread) redirect("/app/mail?toast_error=Thread not found");
  if (thread.messages.length === 0) redirect(`/app/mail?thread=${thread.id}&toast_error=No draft to send`);
  if (thread.aiLevel === "BLOCKED") redirect(`/app/mail?thread=${thread.id}&toast_error=This thread is blocked for automation — review it manually`);

  const now = new Date();
  await prisma.$transaction([
    prisma.emailMessage.updateMany({ where: { threadId: thread.id, isDraft: true }, data: { isDraft: false, sentAt: now } }),
    prisma.emailThread.update({ where: { id: thread.id }, data: { folder: "SENT" } }),
  ]);

  await audit({ userId: user.id, action: "EMAIL_SEND", resourceType: "EmailThread", resourceId: thread.id, after: { subject: thread.subject, delivery: "MOCK (development only — no real delivery)" } });
  await logActivity({ userId: user.id, type: "EMAIL_SENT", message: `Sent “${thread.subject}” (dev mock — not delivered)`, clientId: thread.clientId ?? undefined, caseId: thread.caseId ?? undefined });
  revalidatePath("/app/mail");
  redirect(`/app/mail?folder=SENT&thread=${thread.id}&toast=Marked as sent (DEV mock — not delivered)`);
}

export async function moveThread(threadId: string, folder: string): Promise<void> {
  const user = await assertPermission("EMAIL_READ");
  const allowed = ["INBOX", "SENT", "DRAFTS", "IMPORTANT", "AI_REVIEW"];
  if (!allowed.includes(folder)) redirect("/app/mail?toast_error=Unknown folder");
  const thread = await prisma.emailThread.findUnique({ where: { id: threadId } });
  if (!thread) redirect("/app/mail?toast_error=Thread not found");
  await prisma.emailThread.update({ where: { id: threadId }, data: { folder } });
  await audit({ userId: user.id, action: "EMAIL_MOVE", resourceType: "EmailThread", resourceId: threadId, after: { folder } });
  revalidatePath("/app/mail");
  redirect(`/app/mail?folder=${folder}&thread=${threadId}&toast=Moved to ${folder.toLowerCase()}`);
}
