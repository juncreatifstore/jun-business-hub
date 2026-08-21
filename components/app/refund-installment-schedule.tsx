import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { RefundInstallmentProofUpload } from "@/components/app/refund-installment-proof-upload";
import { getRefundInstallmentMetaMap } from "@/lib/finance-refund-installments";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { markRefundInstallmentPaid, rescheduleRefundInstallment, saveRefundInstallmentPayout, sendRefundInstallmentReminder } from "@/services/refunds";

type Installment = { id: string; number: number; amount: unknown; dueDate: Date; paidAt: Date | null; status: string };
type RefundFile = { id: string; name: string };

export async function RefundInstallmentSchedule({ refundId, clientId, caseId, currency, refundStatus, installments, files, approver }: {
  refundId: string;
  clientId: string;
  caseId: string | null;
  currency: string;
  refundStatus: string;
  installments: Installment[];
  files: RefundFile[];
  approver: boolean;
}) {
  const metas = await getRefundInstallmentMetaMap(installments.map((i) => i.id));
  return <div className="space-y-4">{installments.map((i) => {
    const meta = metas.get(i.id)!;
    const proof = meta.proofFileId ? files.find((f) => f.id === meta.proofFileId) : null;
    const payable = approver && ["APPROVED", "PARTIALLY_PAID"].includes(refundStatus) && !["PAID", "CANCELLED"].includes(i.status);
    const ready = Boolean(meta.method && meta.transactionRef && proof);
    return <div key={i.id} className={`rounded-xl border p-4 ${i.status === "LATE" ? "border-amber-300 bg-amber-50/40" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-semibold">Installment {i.number} — {formatMoney(Number(i.amount), currency)}</p><p className="mt-1 text-xs text-muted2">Due {formatDate(i.dueDate)}{i.paidAt ? ` · paid ${formatDate(i.paidAt)}` : ""}</p></div>
        <StatusBadge status={i.status} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div><p className="mb-1 text-xs text-muted2">Schedule</p>{approver && !["PAID", "CANCELLED"].includes(i.status) ? <form action={rescheduleRefundInstallment.bind(null, i.id)} className="flex gap-2"><Input name="dueDate" type="date" defaultValue={i.dueDate.toISOString().slice(0, 10)} required /><Button size="sm" variant="outline">Reschedule</Button></form> : <p className="text-sm">{formatDate(i.dueDate)}</p>}</div>
        <div><p className="mb-1 text-xs text-muted2">Payout record</p>{payable ? <form action={saveRefundInstallmentPayout.bind(null, i.id)} className="space-y-2"><Select name="method" defaultValue={meta.method || ""}><option value="" disabled>Select method…</option><option value="BANK_TRANSFER">Bank transfer</option><option value="WESTERN_UNION">Western Union</option><option value="ZELLE">Zelle</option><option value="PAYPAL">PayPal</option><option value="MERCADO_PAGO">Mercado Pago</option><option value="MONCASH">MonCash</option><option value="CASH">Cash</option><option value="OTHER">Other</option></Select><Input name="transactionRef" defaultValue={meta.transactionRef || ""} placeholder="Transaction reference" required /><Input name="notes" defaultValue={meta.notes || ""} placeholder="Optional note" /><Button size="sm" variant="outline">Save payout details</Button></form> : <div className="text-sm"><p>{meta.method?.replaceAll("_", " ") || "—"}</p><p className="registry-id mt-1 text-xs">{meta.transactionRef || "No reference"}</p></div>}</div>
        <div><p className="mb-1 text-xs text-muted2">Proof & reminder</p>{proof ? <a href={`/api/files/${proof.id}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-electric hover:underline">Open proof: {proof.name}</a> : payable ? <RefundInstallmentProofUpload refundId={refundId} installmentId={i.id} clientId={clientId} caseId={caseId} /> : <p className="text-sm text-muted2">No payout proof</p>}{approver && !["PAID", "CANCELLED"].includes(i.status) ? <form action={sendRefundInstallmentReminder.bind(null, i.id)} className="mt-2"><Button size="sm" variant="outline">Send reminder{meta.reminderCount ? ` (${meta.reminderCount})` : ""}</Button></form> : null}{meta.lastReminderAt ? <p className="mt-1 text-[11px] text-muted2">Last reminder {formatDateTime(new Date(meta.lastReminderAt))}</p> : null}</div>
      </div>
      {payable ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><p className={`text-xs ${ready ? "text-emerald-700" : "text-amber-700"}`}>{ready ? "Ready to record payment." : "Method, transaction reference and payout proof are required."}</p><form action={markRefundInstallmentPaid.bind(null, i.id)}><Button size="sm" variant="primary" disabled={!ready}>Record installment paid</Button></form></div> : null}
    </div>;
  })}</div>;
}
