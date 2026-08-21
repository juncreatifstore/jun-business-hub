import "server-only";
import { prisma } from "@/lib/prisma";

export type RefundInstallmentMeta = {
  method: string | null;
  transactionRef: string | null;
  notes: string | null;
  proofFileId: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  updatedAt: string | null;
};

const defaults: RefundInstallmentMeta = {
  method: null,
  transactionRef: null,
  notes: null,
  proofFileId: null,
  reminderCount: 0,
  lastReminderAt: null,
  updatedAt: null,
};

function key(id: string) { return `finance.refund.installment.${id}`; }

export async function getRefundInstallmentMeta(id: string): Promise<RefundInstallmentMeta> {
  const row = await prisma.appSetting.findUnique({ where: { key: key(id) }, select: { value: true } });
  if (!row) return { ...defaults };
  try { return { ...defaults, ...JSON.parse(row.value) } as RefundInstallmentMeta; } catch { return { ...defaults }; }
}

export async function saveRefundInstallmentMeta(id: string, patch: Partial<RefundInstallmentMeta>) {
  const current = await getRefundInstallmentMeta(id);
  const next: RefundInstallmentMeta = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await prisma.appSetting.upsert({
    where: { key: key(id) },
    create: { key: key(id), value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

export async function getRefundInstallmentMetaMap(ids: string[]) {
  const rows = ids.length ? await prisma.appSetting.findMany({ where: { key: { in: ids.map(key) } }, select: { key: true, value: true } }) : [];
  const map = new Map<string, RefundInstallmentMeta>();
  for (const id of ids) map.set(id, { ...defaults });
  for (const row of rows) {
    const id = row.key.replace("finance.refund.installment.", "");
    try { map.set(id, { ...defaults, ...JSON.parse(row.value) }); } catch {}
  }
  return map;
}

export function isInstallmentOverdue(status: string, dueDate: Date, now = new Date()) {
  if (!["SCHEDULED", "LATE"].includes(status)) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return dueDate.getTime() < today;
}

export async function syncOverdueRefundInstallments(refundId?: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const where = { status: "SCHEDULED" as const, dueDate: { lt: today }, ...(refundId ? { refundId } : {}) };
  const result = await prisma.refundInstallment.updateMany({ where, data: { status: "LATE" } });
  return result.count;
}
