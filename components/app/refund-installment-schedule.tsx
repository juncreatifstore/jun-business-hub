import { RefundPaymentConfirm } from "@/components/app/refund-payment-confirm";
import { randomUUID } from "crypto";
import { RefundPaymentPlan } from "@/components/app/refund-payment-plan";
import { refundPlanSnapshot } from "@/lib/refund-payment-plan";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { RefundInstallmentProofUpload } from "@/components/app/refund-installment-proof-upload";
import { getRefundInstallmentMetaMap } from "@/lib/finance-refund-installments";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { rescheduleRefundInstallment, saveRefundInstallmentPayout, sendRefundInstallmentReminder } from "@/services/refunds";
import { confirmLegacyRefundFullyPaidAuthorized } from "@/services/refund-financial-authorization";

type Installment = { id: string; number: number; amount: unknown; dueDate: Date; paidAt: Date | null; status: string };
type RefundFile = { id: string; name: string };

export async function RefundInstallmentSchedule({ refundId, clientId, caseId, currency, refundStatus, installments, files, approver, refundAmount }: {
  refundId: string;
  refundAmount: number;
  clientId: string;
  caseId: string | null;
  currency: string;
  refundStatus: string;
  installments: Installment[];
  files: RefundFile[];
  approver: boolean;
}) {
  const paid = installments.filter(i => i.status === "PAID").reduce((sum,i) => sum + Math.round(Number(i.amount) * 100), 0);
  const remaining = Math.max(0, Math.round(refundAmount * 100) - paid);
  const active = installments.filter(i => i.status !== "CANCELLED");
  const snapshot = refundPlanSnapshot(installments);
  const planner = approver && ["APPROVED","PARTIALLY_PAID"].includes(refundStatus) && remaining > 0
    ? <RefundPaymentPlan key={snapshot} refundId={refundId} remaining={remaining} currency={currency} snapshot={snapshot} requestId={randomUUID()} defaultDate={new Date().toISOString().slice(0,10)} /> : null;
  if (installments.length === 0 && planner) return planner;
  if (installments.length === 0) {
    if (refundStatus === "PAID") {
      return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><strong>Refund fully paid.</strong><div className="mt-1 text-xs">This legacy refund is already closed.</div></div>;
    }
    if (!approver || refundStatus !== "APPROVED") {
      return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>No payout installment exists.</strong><div className="mt-1 text-xs">This is a legacy refund record. Once approved, an authorized finance user can confirm the full payout here.</div></div>;
    }
    return <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
      <div className="mb-4">
        <div className="text-sm font-semibold text-amber-950">Confirm refund fully paid</div>
        <p className="mt-1 text-xs text-amber-800">This approved refund has no installment schedule because it was created under the older workflow. Confirming payment will create one settlement installment for the full refund amount and close the refund as PAID.</p>
      </div>
      {files.length === 0 ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">Attach the payout proof in Supporting documents first. A refund cannot be marked paid without evidence.</div> : <form action={confirmLegacyRefundFullyPaidAuthorized.bind(null, refundId)} className="grid gap-3 md:grid-cols-2">
        <div><p className="mb-1 text-xs text-muted2">Payment method</p><Select name="method" defaultValue="" required><option value="" disabled>Choisir la méthode…</option><option value="BANK_TRANSFER">Bank transfer</option><option value="WESTERN_UNION">Western Union</option><option value="ZELLE">Zelle</option><option value="PAYPAL">PayPal</option><option value="MERCADO_PAGO">Mercado Pago</option><option value="MONCASH">MonCash</option><option value="CASH">Cash</option><option value="OTHER">Other</option></Select></div>
        <div><p className="mb-1 text-xs text-muted2">Référence de transaction</p><Input name="transactionRef" placeholder="Bank / Zelle / transfer reference" required /></div>
        <div><p className="mb-1 text-xs text-muted2">Payout proof</p><Select name="proofFileId" defaultValue="" required><option value="" disabled>Select attached proof…</option>{files.map((file)=><option key={file.id} value={file.id}>{file.name}</option>)}</Select></div>
        <div><p className="mb-1 text-xs text-muted2">Internal note</p><Input name="notes" placeholder="Optional payout note" /></div>
        <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 pt-3"><p className="text-xs text-amber-800">Use this only after verifying that the client actually received the complete refund.</p><Button variant="primary">Confirm full refund paid</Button></div>
      </form>}
    </div>;
  }

  const metas = await getRefundInstallmentMetaMap(installments.map((i) => i.id));
  return <div className="min-w-0 space-y-4">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-xl border border-line p-3"><p className="text-xs text-muted2">Total à rembourser</p><p className="font-semibold">{formatMoney(refundAmount,currency)}</p></div><div className="rounded-xl border border-line p-3"><p className="text-xs text-muted2">Déjà versé</p><p className="font-semibold text-emerald-300">{formatMoney(paid/100,currency)}</p></div><div className="rounded-xl border border-line p-3"><p className="text-xs text-muted2">Reste à payer</p><p className="font-semibold">{formatMoney(remaining/100,currency)}</p></div></div>
    {planner}
    <h3 className="font-semibold">Versements et historique des paiements</h3>
    {installments.some(i=>i.status==="CANCELLED")&&<details className="rounded-xl border border-line p-3 text-sm"><summary className="min-h-11 cursor-pointer">Anciennes tranches annulées ou remplacées</summary>{installments.filter(i=>i.status==="CANCELLED").map(i=><p key={i.id} className="py-1">Tranche {i.number} · {formatMoney(Number(i.amount),currency)} · {formatDate(i.dueDate)}</p>)}</details>}
    {active.map((i) => {
    const meta = metas.get(i.id)!;
    const proof = meta.proofFileId ? files.find((f) => f.id === meta.proofFileId) : null;
    const payable = approver && ["APPROVED", "PARTIALLY_PAID"].includes(refundStatus) && !["PAID", "CANCELLED"].includes(i.status);
    const ready = Boolean(meta.method && meta.transactionRef && proof);
    return <div key={i.id} className={`rounded-xl border p-4 ${i.status === "LATE" ? "border-amber-400/30 bg-amber-500/5" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-semibold">Tranche {i.number} — {formatMoney(Number(i.amount), currency)}</p><p className="mt-1 text-xs text-muted2">Échéance {formatDate(i.dueDate)}{i.paidAt ? ` · payé le ${formatDate(i.paidAt)}` : ""}</p></div>
        <StatusBadge status={i.status} />
      </div>
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-3 [&>div]:min-w-0">
        <div><p className="mb-1 text-xs text-muted2">Échéance</p>{approver && !["PAID", "CANCELLED"].includes(i.status) ? <form action={rescheduleRefundInstallment.bind(null, i.id)} className="grid min-w-0 gap-2 sm:grid-cols-[1fr_auto]"><Input name="dueDate" type="date" defaultValue={i.dueDate.toISOString().slice(0, 10)} required /><Button size="sm" variant="outline">Modifier la date</Button></form> : <p className="text-sm">{formatDate(i.dueDate)}</p>}</div>
        <div><p className="mb-1 text-xs text-muted2">Informations du versement</p>{payable ? <form action={saveRefundInstallmentPayout.bind(null, i.id)} className="space-y-2"><Select name="method" defaultValue={meta.method || ""}><option value="" disabled>Choisir la méthode…</option><option value="BANK_TRANSFER">Bank transfer</option><option value="WESTERN_UNION">Western Union</option><option value="ZELLE">Zelle</option><option value="PAYPAL">PayPal</option><option value="MERCADO_PAGO">Mercado Pago</option><option value="MONCASH">MonCash</option><option value="CASH">Cash</option><option value="OTHER">Other</option></Select><Input name="transactionRef" defaultValue={meta.transactionRef || ""} placeholder="Référence de transaction" required /><Input name="notes" defaultValue={meta.notes || ""} placeholder="Note facultative" /><Button size="sm" variant="outline">Enregistrer les informations</Button></form> : <div className="text-sm"><p>{meta.method?.replaceAll("_", " ") || "—"}</p><p className="registry-id mt-1 text-xs">{meta.transactionRef || "Sans référence"}</p></div>}</div>
        <div><p className="mb-1 text-xs text-muted2">Justificatif et rappel</p>{proof ? <a href={`/api/files/${proof.id}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-electric hover:underline">Ouvrir le justificatif : {proof.name}</a> : payable ? <RefundInstallmentProofUpload refundId={refundId} installmentId={i.id} clientId={clientId} caseId={caseId} /> : <p className="text-sm text-muted2">Aucun justificatif</p>}{approver && !["PAID", "CANCELLED"].includes(i.status) ? <form action={sendRefundInstallmentReminder.bind(null, i.id)} className="mt-2"><Button size="sm" variant="outline">Envoyer un rappel{meta.reminderCount ? ` (${meta.reminderCount})` : ""}</Button></form> : null}{meta.lastReminderAt ? <p className="mt-1 text-[11px] text-muted2">Dernier rappel {formatDateTime(new Date(meta.lastReminderAt))}</p> : null}</div>
      </div>
      {payable ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><p className={`text-xs ${ready ? "text-emerald-300" : "text-amber-300"}`}>{ready ? "Prêt à confirmer ce versement." : "Méthode, référence et justificatif obligatoires pour ce versement."}</p><RefundPaymentConfirm installmentId={i.id} ready={ready} last={remaining === Math.round(Number(i.amount)*100)} /></div> : null}
    </div>;
  })}</div>;
}
