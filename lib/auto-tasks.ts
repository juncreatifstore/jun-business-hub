import "server-only";
import { prisma } from "@/lib/prisma";
import { DOC_TYPE_LABELS, EXPIRING_DOC_TYPES, type DocType } from "@/lib/file-extraction";

/**
 * Tasks created automatically from events. Each has a marker in the description
 * (`[auto:<key>]`) so the same event never creates two open tasks.
 */
const MARK = (key: string) => `[auto:${key}]`;

async function upsertAutoTask(input: {
  key: string;
  title: string;
  description: string;
  clientId?: string | null;
  caseId?: string | null;
  assigneeId?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  dueDate?: Date | null;
  creatorId: string;
}) {
  const marker = MARK(input.key);
  const existing = await prisma.task.findFirst({
    where: { description: { contains: marker }, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const task = await prisma.task.create({
    data: {
      title: input.title.slice(0, 200),
      description: `${input.description}\n${marker}`.slice(0, 2000),
      clientId: input.clientId ?? null,
      caseId: input.caseId ?? null,
      assigneeId: input.assigneeId ?? null,
      creatorId: input.creatorId,
      priority: input.priority ?? "MEDIUM",
      dueDate: input.dueDate ?? null,
    },
  });
  if (task.assigneeId && task.assigneeId !== input.creatorId)
    await prisma.notification
      .create({
        data: { userId: task.assigneeId, type: "TASK_ASSIGNED", title: "Nouvelle tâche", body: task.title },
      })
      .catch(() => null);
  return task.id;
}

/** Closes the open auto task for a key (event resolved). */
export async function completeAutoTask(key: string) {
  await prisma.task.updateMany({
    where: { description: { contains: MARK(key) }, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } },
    data: { status: "DONE" },
  });
}

async function caseOwner(caseId: string | null | undefined, clientId: string | null | undefined) {
  if (caseId) {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { ownerId: true } });
    if (c?.ownerId) return c.ownerId;
  }
  if (clientId) {
    const c = await prisma.client.findUnique({ where: { id: clientId }, select: { ownerId: true } });
    if (c?.ownerId) return c.ownerId;
  }
  return null;
}

/** A document arrived through a request link → verify it. */
export async function taskDocumentReceived(input: {
  requestId: string;
  index: number;
  clientId: string;
  caseId: string | null;
  requesterId: string;
  docLabel: string;
  clientName: string;
  fileId: string;
}) {
  const assignee = (await caseOwner(input.caseId, input.clientId)) ?? input.requesterId;
  return upsertAutoTask({
    key: `docreq:${input.requestId}:${input.index}`,
    title: `Vérifier « ${input.docLabel} » reçu de ${input.clientName}`,
    description: `Pièce déposée par le client via le lien de demande. Vérifier lisibilité, validité et cohérence.\nFichier : /app/drive?q=${encodeURIComponent(input.docLabel)}`,
    clientId: input.clientId,
    caseId: input.caseId,
    assigneeId: assignee,
    priority: "MEDIUM",
    dueDate: new Date(Date.now() + 2 * 86_400_000),
    creatorId: input.requesterId,
  });
}

/** A refund claim was submitted → process it before the SLA. */
export async function taskRefundClaimSubmitted(input: {
  claimId: string;
  clientId: string;
  caseId: string | null;
  requesterId: string;
  clientName: string;
  amount: string;
  dueAt: Date | null;
}) {
  const finance = await prisma.user.findFirst({
    where: { role: "FINANCE", status: "ACTIVE" },
    select: { id: true },
  });
  return upsertAutoTask({
    key: `claim:${input.claimId}`,
    title: `Traiter la demande de remboursement de ${input.clientName} (${input.amount})`,
    description: `Examiner identité, preuve de paiement, motif ; décider (intégral / partiel / refus).\n/app/finance/refunds/claims/${input.claimId}`,
    clientId: input.clientId,
    caseId: input.caseId,
    assigneeId: finance?.id ?? input.requesterId,
    priority: "HIGH",
    dueDate: input.dueAt,
    creatorId: input.requesterId,
  });
}

/** A payment proof was submitted → confirm the payment. */
export async function taskPaymentProofSubmitted(input: {
  requestId: string;
  clientId: string;
  caseId: string | null;
  requesterId: string;
  clientName: string;
  amount: string;
  reference: string;
}) {
  const finance = await prisma.user.findFirst({
    where: { role: { in: ["FINANCE", "ACCOUNTANT"] }, status: "ACTIVE" },
    select: { id: true },
  });
  return upsertAutoTask({
    key: `payreq:${input.requestId}`,
    title: `Confirmer le paiement ${input.reference} de ${input.clientName} (${input.amount})`,
    description: `Preuve déposée par le client. Vérifier la réception des fonds puis confirmer (émet le reçu).\n/app/finance/payments/requests/${input.requestId}`,
    clientId: input.clientId,
    caseId: input.caseId,
    assigneeId: finance?.id ?? input.requesterId,
    priority: "HIGH",
    dueDate: new Date(Date.now() + 86_400_000),
    creatorId: input.requesterId,
  });
}

/** Cron: identity/travel documents expiring within 60 days → follow-up task; unanswered requests after 7 days → chase. */
export async function generateScheduledAutoTasks() {
  const system = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "DIRECTOR"] }, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!system) return { expiring: 0, chased: 0 };
  let expiring = 0;
  const soon = await prisma.fileExtraction.findMany({
    where: {
      expiresAt: {
        lte: new Date(Date.now() + 60 * 86_400_000),
        gte: new Date(Date.now() - 365 * 86_400_000),
      },
      docType: { in: Array.from(EXPIRING_DOC_TYPES) },
      file: { archivedAt: null, isVault: false, clientId: { not: null } },
    },
    take: 50,
    select: {
      fileId: true,
      docType: true,
      expiresAt: true,
      holderName: true,
      file: {
        select: { clientId: true, caseId: true, client: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  for (const x of soon) {
    if (!x.file.clientId) continue;
    const expired = x.expiresAt!.getTime() < Date.now();
    const assignee = await caseOwner(x.file.caseId, x.file.clientId);
    const id = await upsertAutoTask({
      key: `expiry:${x.fileId}`,
      title: `${expired ? "Expiré" : "Expire bientôt"} : ${DOC_TYPE_LABELS[x.docType as DocType]} de ${x.file.client?.firstName ?? ""} ${x.file.client?.lastName ?? ""} (${x.expiresAt!.toLocaleDateString("fr-FR")})`,
      description: `Relancer le client pour le renouvellement et demander la nouvelle pièce (Drive › By client).`,
      clientId: x.file.clientId,
      caseId: x.file.caseId,
      assigneeId: assignee ?? system.id,
      priority: expired ? "HIGH" : "MEDIUM",
      dueDate: expired ? new Date() : new Date(x.expiresAt!.getTime() - 30 * 86_400_000),
      creatorId: system.id,
    });
    if (id) expiring++;
  }
  let chased = 0;
  const stale = await prisma.documentRequest.findMany({
    where: {
      status: { in: ["PENDING", "PARTIAL"] },
      createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) },
      expiresAt: { gt: new Date() },
    },
    take: 30,
    select: {
      id: true,
      clientId: true,
      caseId: true,
      requestedById: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  for (const r of stale) {
    await upsertAutoTask({
      key: `docreq-chase:${r.id}`,
      title: `Relancer ${r.client.firstName} ${r.client.lastName} : documents toujours manquants`,
      description: `La demande de documents envoyée il y a plus de 7 jours n’est pas complète malgré les rappels automatiques. Appeler ou écrire au client.`,
      clientId: r.clientId,
      caseId: r.caseId,
      assigneeId: (await caseOwner(r.caseId, r.clientId)) ?? r.requestedById,
      priority: "MEDIUM",
      dueDate: new Date(Date.now() + 2 * 86_400_000),
      creatorId: r.requestedById,
    });
    chased++;
  }
  return { expiring, chased };
}
