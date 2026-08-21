import "server-only";

import { prisma } from "@/lib/prisma";

export const REFUND_WORKFLOW_PREFIX = "finance.refund.workflow.";

export type RefundWorkflowMeta = {
  refundId: string;
  refundType: "FULL" | "PARTIAL" | "UNLINKED";
  assignedToId: string | null;
  reviewNotes: string;
  decisionReason: string;
  reviewedAt: string | null;
  reviewedById: string | null;
  decidedAt: string | null;
  decidedById: string | null;
  updatedAt: string;
};

function empty(refundId: string): RefundWorkflowMeta {
  return {
    refundId,
    refundType: "UNLINKED",
    assignedToId: null,
    reviewNotes: "",
    decisionReason: "",
    reviewedAt: null,
    reviewedById: null,
    decidedAt: null,
    decidedById: null,
    updatedAt: new Date().toISOString(),
  };
}

function parse(value: string, refundId: string): RefundWorkflowMeta {
  try {
    const row = JSON.parse(value) as Partial<RefundWorkflowMeta>;
    return { ...empty(refundId), ...row, refundId };
  } catch {
    return empty(refundId);
  }
}

export async function getRefundWorkflowMeta(refundId: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: `${REFUND_WORKFLOW_PREFIX}${refundId}` }, select: { value: true } });
  return row ? parse(row.value, refundId) : empty(refundId);
}

export async function saveRefundWorkflowMeta(refundId: string, patch: Partial<RefundWorkflowMeta>) {
  const current = await getRefundWorkflowMeta(refundId);
  const next: RefundWorkflowMeta = { ...current, ...patch, refundId, updatedAt: new Date().toISOString() };
  const key = `${REFUND_WORKFLOW_PREFIX}${refundId}`;
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
  return next;
}

export function refundPaidTotal(installments: { amount: unknown; status: string }[]) {
  return Math.round(installments.filter((i) => i.status === "PAID").reduce((sum, i) => sum + Number(i.amount), 0) * 100) / 100;
}

export function refundRemaining(amount: unknown, installments: { amount: unknown; status: string }[]) {
  return Math.max(0, Math.round((Number(amount) - refundPaidTotal(installments)) * 100) / 100);
}
