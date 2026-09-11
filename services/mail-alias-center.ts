"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertMailboxAccess } from "@/lib/mail-security";
import { getMailThreadState, saveMailThreadState, type MailWorkflowStatus } from "@/lib/mail-thread-state";
import { setMailOwnerId } from "@/lib/mail-operations";

function back(alias: string, message: string, error = false): never {
  const params = new URLSearchParams();
  if (alias) params.set("alias", alias);
  params.set(error ? "toast_error" : "toast", message);
  redirect(`/app/mail/aliases?${params.toString()}`);
}

async function getThread(threadId: string) {
  const user = await assertPermission("EMAIL_DRAFT");
  const thread = await prisma.mailThread.findUnique({
    where: { id: threadId },
    select: { id: true, subject: true, mailAccountId: true },
  });
  if (!thread) back("", "Conversation introuvable.", true);
  try {
    await assertMailboxAccess(user, thread.mailAccountId);
  } catch {
    back("", "Accès à cette boîte refusé.", true);
  }
  return { user, thread };
}

export async function assignAliasConversation(
  threadId: string,
  alias: string,
  formData: FormData,
): Promise<void> {
  const { user, thread } = await getThread(threadId);
  const ownerId = String(formData.get("ownerId") ?? "").trim() || null;
  let ownerName: string | null = null;
  if (ownerId) {
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, status: "ACTIVE", role: { not: "CLIENT" } },
      select: { firstName: true, lastName: true },
    });
    if (!owner) back(alias, "Le responsable sélectionné est invalide.", true);
    ownerName = `${owner.firstName} ${owner.lastName}`;
  }
  await setMailOwnerId(threadId, ownerId);
  if (ownerId && ownerId !== user.id) {
    await prisma.notification
      .create({
        data: {
          userId: ownerId,
          type: "TASK_ASSIGNED",
          title: `Conversation ${alias || "e-mail"} assignée`,
          body: thread.subject ?? "Conversation e-mail",
        },
      })
      .catch(() => null);
  }
  await audit({
    userId: user.id,
    action: "ALIAS_MAIL_OWNER_ASSIGNED",
    resourceType: "MailThread",
    resourceId: threadId,
    after: { alias, ownerId, ownerName },
  });
  revalidatePath("/app/mail/aliases");
  revalidatePath("/app/mail/operations");
  back(alias, ownerId ? `Conversation attribuée à ${ownerName}.` : "Conversation non attribuée.");
}

export async function setAliasConversationStatus(
  threadId: string,
  alias: string,
  formData: FormData,
): Promise<void> {
  const { user } = await getThread(threadId);
  const status = String(formData.get("workflowStatus") ?? "") as MailWorkflowStatus;
  if (!["OPEN", "WAITING_CLIENT", "WAITING_INTERNAL", "RESOLVED"].includes(status)) {
    back(alias, "Statut invalide.", true);
  }
  const current = await getMailThreadState(threadId);
  await saveMailThreadState({
    ...current,
    workflowStatus: status,
    updatedAt: new Date().toISOString(),
    updatedById: user.id,
  });
  await audit({
    userId: user.id,
    action: "ALIAS_MAIL_STATUS_UPDATED",
    resourceType: "MailThread",
    resourceId: threadId,
    before: { workflowStatus: current.workflowStatus },
    after: { alias, workflowStatus: status },
  });
  revalidatePath("/app/mail/aliases");
  revalidatePath("/app/mail/operations");
  revalidatePath("/app/mail");
  back(alias, `Statut changé : ${status.replaceAll("_", " ")}.`);
}
