import "server-only";
import { prisma } from "@/lib/prisma";

export type MailWorkflowStatus = "OPEN" | "WAITING_CLIENT" | "WAITING_INTERNAL" | "RESOLVED";
export type MailThreadState = {
  threadId: string;
  isRead: boolean;
  starred: boolean;
  archived: boolean;
  trashed: boolean;
  snoozedUntil: string | null;
  workflowStatus: MailWorkflowStatus;
  updatedAt: string;
  updatedById: string | null;
};

type Row = {
  threadId: string;
  isRead: boolean;
  starred: boolean;
  archived: boolean;
  trashed: boolean;
  snoozedUntil: Date | null;
  workflowStatus: string;
  updatedAt: Date;
  updatedById: string | null;
};

const WORKFLOW: ReadonlySet<string> = new Set(["OPEN", "WAITING_CLIENT", "WAITING_INTERNAL", "RESOLVED"]);

function fromRow(r: Row): MailThreadState {
  return {
    threadId: r.threadId,
    isRead: r.isRead,
    starred: r.starred,
    archived: r.archived,
    trashed: r.trashed,
    snoozedUntil: r.snoozedUntil ? r.snoozedUntil.toISOString() : null,
    workflowStatus: (WORKFLOW.has(r.workflowStatus) ? r.workflowStatus : "OPEN") as MailWorkflowStatus,
    updatedAt: r.updatedAt.toISOString(),
    updatedById: r.updatedById,
  };
}

export function defaultMailThreadState(threadId: string): MailThreadState {
  return {
    threadId,
    isRead: false,
    starred: false,
    archived: false,
    trashed: false,
    snoozedUntil: null,
    workflowStatus: "OPEN",
    updatedAt: new Date(0).toISOString(),
    updatedById: null,
  };
}

export async function getMailThreadState(threadId: string) {
  const row = await prisma.mailThreadState.findUnique({ where: { threadId } });
  return row ? fromRow(row) : defaultMailThreadState(threadId);
}

export async function getMailThreadStateMap(threadIds: string[]) {
  const map = new Map<string, MailThreadState>();
  if (!threadIds.length) return map;
  for (const id of threadIds) map.set(id, defaultMailThreadState(id));
  const rows = await prisma.mailThreadState.findMany({ where: { threadId: { in: threadIds } } });
  for (const r of rows) map.set(r.threadId, fromRow(r));
  return map;
}

export async function saveMailThreadState(state: MailThreadState) {
  const data = {
    isRead: state.isRead,
    starred: state.starred,
    archived: state.archived,
    trashed: state.trashed,
    snoozedUntil: state.snoozedUntil ? new Date(state.snoozedUntil) : null,
    workflowStatus: WORKFLOW.has(state.workflowStatus) ? state.workflowStatus : "OPEN",
    updatedAt: state.updatedAt ? new Date(state.updatedAt) : new Date(),
    updatedById: state.updatedById,
  };
  try {
    await prisma.mailThreadState.upsert({
      where: { threadId: state.threadId },
      create: { threadId: state.threadId, ...data },
      update: data,
    });
  } catch {
    // Thread no longer exists (FK) — state is meaningless without it.
  }
  return state;
}

/** Threads matching flags, for list views that filter on state in SQL. */
export async function findThreadIdsByState(where: {
  mailAccountIds?: string[];
  isRead?: boolean;
  starred?: boolean;
  archived?: boolean;
  trashed?: boolean;
  workflowStatus?: MailWorkflowStatus[];
  snoozed?: boolean;
}) {
  const now = new Date();
  const rows = await prisma.mailThreadState.findMany({
    where: {
      ...(where.isRead !== undefined ? { isRead: where.isRead } : {}),
      ...(where.starred !== undefined ? { starred: where.starred } : {}),
      ...(where.archived !== undefined ? { archived: where.archived } : {}),
      ...(where.trashed !== undefined ? { trashed: where.trashed } : {}),
      ...(where.workflowStatus?.length ? { workflowStatus: { in: where.workflowStatus } } : {}),
      ...(where.snoozed === true
        ? { snoozedUntil: { gt: now } }
        : where.snoozed === false
          ? { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] }
          : {}),
      ...(where.mailAccountIds?.length ? { thread: { mailAccountId: { in: where.mailAccountIds } } } : {}),
    },
    select: { threadId: true },
  });
  return rows.map((r) => r.threadId);
}

export function isSnoozed(state: MailThreadState, now = Date.now()) {
  return Boolean(state.snoozedUntil && new Date(state.snoozedUntil).getTime() > now);
}
