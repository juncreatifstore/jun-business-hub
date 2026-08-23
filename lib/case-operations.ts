import "server-only";
import { prisma } from "@/lib/prisma";

const PREFIX = "case.operations.";

export type CaseMilestoneStatus = "TODO" | "IN_PROGRESS" | "WAITING" | "DONE" | "CANCELLED";
export type CaseMilestone = {
  id: string;
  title: string;
  description: string;
  status: CaseMilestoneStatus;
  ownerId: string | null;
  dueDate: string | null;
  blocker: string;
  createdAt: string;
  updatedAt: string;
};

export type CaseOperationsState = { caseId: string; milestones: CaseMilestone[] };

function key(caseId: string) { return `${PREFIX}${caseId}`; }

export async function getCaseOperations(caseId: string): Promise<CaseOperationsState> {
  const row = await prisma.appSetting.findUnique({ where: { key: key(caseId) }, select: { value: true } }).catch(() => null);
  if (!row?.value) return { caseId, milestones: [] };
  try {
    const parsed = JSON.parse(row.value) as Partial<CaseOperationsState>;
    return { caseId, milestones: Array.isArray(parsed.milestones) ? parsed.milestones : [] };
  } catch { return { caseId, milestones: [] }; }
}

export async function saveCaseOperations(state: CaseOperationsState) {
  await prisma.appSetting.upsert({ where: { key: key(state.caseId) }, create: { key: key(state.caseId), value: JSON.stringify(state) }, update: { value: JSON.stringify(state) } });
}

export function caseOperationFacts(milestones: CaseMilestone[], tasks: { status: string; dueDate: Date | null }[]) {
  const milestoneActive = milestones.filter((m) => !["DONE", "CANCELLED"].includes(m.status));
  const milestoneDone = milestones.filter((m) => m.status === "DONE").length;
  const taskActive = tasks.filter((t) => !["DONE", "CANCELLED"].includes(t.status));
  const taskDone = tasks.filter((t) => t.status === "DONE").length;
  const totalTrackable = milestones.filter((m) => m.status !== "CANCELLED").length + tasks.filter((t) => t.status !== "CANCELLED").length;
  const totalDone = milestoneDone + taskDone;
  const progress = totalTrackable ? Math.round((totalDone / totalTrackable) * 100) : 0;
  const now = Date.now();
  const overdueMilestones = milestoneActive.filter((m) => m.dueDate && new Date(m.dueDate).getTime() < now);
  const overdueTasks = taskActive.filter((t) => t.dueDate && t.dueDate.getTime() < now);
  const blockedMilestones = milestoneActive.filter((m) => m.blocker.trim().length > 0);
  return { progress, milestoneActive, milestoneDone, taskActive, taskDone, overdueMilestones, overdueTasks, blockedMilestones };
}
