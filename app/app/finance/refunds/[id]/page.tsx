import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { getRefundWorkflowMeta, refundPaidTotal, refundRemaining } from "@/lib/finance-refund-workflow";
import { getRefundInstallmentMetaMap, syncOverdueRefundInstallments } from "@/lib/finance-refund-installments";
import { decideRefund, markRefundInstallmentPaid, rescheduleRefundInstallment, saveRefundInstallmentPayout, sendRefundInstallmentReminder, updateRefundReview } from "@/services/refunds";
import { RefundProofUpload } from "@/components/app/refund-proof-upload";
import { RefundInstallmentProofUpload } from "@/components/app/refund-installment-proof-upload";
import { CalendarClock, FileCheck2, History, Scale, UserRoundCheck, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RefundDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("REFUND_READ");
  await syncOverdueRefundInstallments(params.id);
  const [r, meta, assignees] = await Promise.all([
    prisma.refund.findUnique({ where: { id: params.id }, include: { client: true, case: true, payment: true, createdBy: true, installments: { orderBy: { dueDate: "asc" } }, files: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { firstName: true, lastName: true } } } } } }),
    getRefundWorkflowMeta(params.id),
    prisma.user.findMany({ where: { status: "ACTIVE", role: { in: ["SUPER_ADMIN", "DIRECTOR", "ADMIN", "MANAGER", "FINANCE", "ACCOUNTANT"] } }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], select: { id: true, firstName: true, lastName: true, role: true } }),
  ]);
  if (!r) notFound();

  const [approvedBy, installmentMeta, refundAudit, installmentAudit] = await Promise.all([
    r.approvedById ? prisma.user.findUnique({ where: { id: r.approvedById }, select: { firstName: true, lastName: true } }) : Promise.resolve(null),
    getRefundInstallmentMetaMap(r.installments.map((i) => i.id)),
    prisma.auditLog.findMany({ where: { resourceType: "Refund", resourceId: r.id }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { firstName: true, lastName: true } } } }),
    r.installments.length ? prisma.auditLog.findMany({ where: { resourceType: "RefundInstallment", resourceId: { in: r.installments.map((i) => i.id) } }, orderBy: { createdAt: "desc" }, take: 80, include: { user: { select: { firstName: true, lastName: true } } } }) : Promise.resolve([]),
  ]);

  const approver = can(user, "REFUND_APPROVE");
  const canAttach = can(user, "REFUND_CREATE") || approver;
  const paid = refundPaidTotal(r.installments);
  const remaining = refundRemaining(r.amount, r.installments);
  const assignee = meta.assignedToId ? assignees.find((a) => a.id === meta.assignedToId) : null;
  const openInstallments = r.installments.filter((i) => !["PAID", "CANCELLED"].includes(i.status));
  const nextDue = openInstallments[0] || null;
  const overdue = r.installments.filter((i) => i.status === "LATE").length;
  const auditRows = [...refundAudit, ...installmentAudit].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 100);

  return <div className="max-w-5xl">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="registry-id text-muted2">{r.refundNumber}</p><h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold">-{formatMoney(Number(r.amount), r.currency)} <StatusBadge status={r.status} /></h1><p className="mt-1 text-sm text-muted2"><Link href={`/app/clients/${r.clientId}`} className="text-electric hover:underline">{r.client.firstName} {r.client.lastName}</Link>{r.case ? <> · <Link href={`/app/cases/${r.case.id}`} className="registry-id hover:text-electric">{r.case.caseNumber}</Link></> : null}{r.payment ? <> · original <Link href={`/app/finance/payments/${r.payment.id}`} className="registry-id hover:text-electric">{r.payment.reference}</Link></> : null}</p></div>
    </div>

    <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <Metric icon={WalletCards} label="Requested" value={formatMoney(Number(r.amount), r.currency)} hint={`${meta.refundType} refund`} />
      <Metric icon={Scale} label="Paid" value={formatMoney(paid, r.currency)} hint={`${r.installments.filter((i) => i.status === "PAID").length}/${r.installments.length} installments`} />
      <Metric icon={Scale} label="Remaining" value={formatMoney(remaining, r.currency)} hint={r.status.replaceAll("_", " ")} />
      <Metric icon={CalendarClock} label="Next due" value={nextDue ? formatDate(nextDue.dueDate) : "None"} hint={nextDue ? formatMoney(Number(nextDue.amount), r.currency) : "Schedule complete"} />
      <Metric icon={CalendarClock} label="Overdue" value={String(overdue)} hint={overdue ? "Requires attention" : "No late installment"} />
      <Metric icon={UserRoundCheck} label="Responsible" value={assignee ? `${assignee.firstName} ${assignee.lastName}` : "Unassigned"} hint={assignee?.role.replaceAll("_", " ") || "Review owner"} />
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Refund request</CardTitle></CardHeader><CardContent><dl className="grid grid-cols-2 gap-3 text-sm"><Info label="Type" value={meta.refundType} /><Info label="Currency" value={r.currency} /><Info label="Requested by" value={`${r.createdBy.firstName} ${r.createdBy.lastName}`} /><Info label="Requested" value={formatDateTime(r.createdAt)} />{approvedBy ? <Info label="Approved by" value={`${approvedBy.firstName} ${approvedBy.lastName}`} /> : null}{r.payment ? <Info label="Original payment" value={`${r.payment.reference} · ${formatMoney(Number(r.payment.amount), r.payment.currency)}`} /> : null}</dl><div className="mt-4 rounded-lg border border-line bg-surface p-3"><div className="text-xs text-muted2">Reason</div><p className="mt-1 whitespace-pre-wrap text-sm">{r.reason}</p></div>{meta.decisionReason ? <div className="mt-3 rounded-lg border border-line p-3"><div className="text-xs text-muted2">Decision reason</div><p className="mt-1 whitespace-pre-wrap text-sm">{meta.decisionReason}</p></div> : null}</CardContent></Card>

      <Card><CardHeader><CardTitle>Supporting documents</CardTitle></CardHeader><CardContent className="space-y-4">{canAttach ? <RefundProofUpload refundId={r.id} clientId={r.clientId} caseId={r.caseId} /> : null}{r.files.length ? <div className="divide-y divide-line rounded-lg border border-line">{r.files.map((file) => <div key={file.id} className="flex items-center justify-between gap-3 px-3 py-2.5"><div className="min-w-0"><div className="truncate text-sm font-medium">{file.name}</div><div className="text-[11px] text-muted2">{file.uploadedBy.firstName} {file.uploadedBy.lastName} · {formatDate(file.createdAt)}</div></div><a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-electric hover:underline">Open</a></div>)}</div> : <p className="text-xs text-muted2">No supporting document attached yet.</p>}</CardContent></Card>
    </div>

    {approver && ["REQUESTED", "UNDER_REVIEW"].includes(r.status) ? <Card className="mt-4"><CardHeader><CardTitle>Review & responsibility</CardTitle></CardHeader><CardContent><form action={updateRefundReview.bind(null, r.id)} className="grid gap-4 sm:grid-cols-2"><Field label="Responsible reviewer"><Select name="assignedToId" defaultValue={meta.assignedToId || ""}><option value="">Unassigned</option>{assignees.map((a) => <option key={a.id} value={a.id}>{a.firstName} {a.lastName} — {a.role.replaceAll("_", " ")}</option>)}</Select></Field><div className="sm:col-span-2"><Field label="Internal review notes"><Textarea name="reviewNotes" rows={4} defaultValue={meta.reviewNotes} placeholder="Verification performed, documents reviewed, calculations, exceptions…" /></Field></div><div className="sm:col-span-2"><Button variant="outline" type="submit">Save review & start review</Button></div></form></CardContent></Card> : null}

    {approver && r.status === "UNDER_REVIEW" ? <Card className="mt-4"><CardHeader><CardTitle>Decision</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><DecisionForm refundId={r.id} status="APPROVED" label="Approve refund" variant="primary" placeholder="Reason for approval and checks completed" /><DecisionForm refundId={r.id} status="REJECTED" label="Reject refund" variant="danger" placeholder="Reason for rejection" /></CardContent></Card> : null}
    {approver && ["REQUESTED", "UNDER_REVIEW", "APPROVED"].includes(r.status) && paid === 0 ? <Card className="mt-4"><CardHeader><CardTitle>Cancel request</CardTitle></CardHeader><CardContent><DecisionForm refundId={r.id} status="CANCELLED" label="Cancel refund" variant="danger" placeholder="Reason for cancellation" /></CardContent></Card> : null}

    <Card className="mt-4"><CardHeader><CardTitle>Refund installments & scheduling</CardTitle></CardHeader><CardContent className="space-y-4">{r.installments.map((i) => {
      const im = installmentMeta.get(i.id)!;
      const proof = im.proofFileId ? r.files.find((f) => f.id === im.proofFileId) : null;
      const payable = approver && ["APPROVED", "PARTIALLY_PAID"].includes(r.status) && !["PAID", "CANCELLED"].includes(i.status);
      const ready = Boolean(im.method && im.transactionRef && proof);
      return <div key={i.id} className={`rounded-xl border p-4 ${i.status === "LATE" ? "border-amber-300 bg-amber-50/40" : "border-line"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Installment {i.number} — {formatMoney(Number(i.amount), r.currency)}</p><p className="mt-1 text-xs text-muted2">Due {formatDate(i.dueDate)}{i.paidAt ? ` · paid ${formatDate(i.paidAt)}` : ""}</p></div><StatusBadge status={i.status} /></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div><div className="mb-1 text-xs text-muted2">Schedule</div>{approver && !["PAID", "CANCELLED"].includes(i.status) ? <form action={rescheduleRefundInstallment.bind(null, i.id)} className="flex gap-2"><Input name="dueDate" type="date" defaultValue={i.dueDate.toISOString().slice(0, 10)} required /><Button size="sm" variant="outline">Reschedule</Button></form> : <p className="text-sm">{formatDate(i.dueDate)}</p>}</div>
          <div><div className="mb-1 text-xs text-muted2">Payout record</div>{payable ? <form action={saveRefundInstallmentPayout.bind(null, i.id)} className="space-y-2"><Select name="method" defaultValue={im.method || ""><option value="" disabled>Select method…</option><option value="BANK_TRANSFER">Bank transfer</option><option value="WESTERN_UNION">Western Union</option><option value="ZELLE">Zelle</option><option value="PAYPAL">PayPal</option><option value="STRIPE">Stripe</option><option value="MERCADO_PAGO">Mercado Pago</option><option value="MONCASH">MonCash</option><option value="CASH">Cash</option><option value="OTHER">Other</option></Select><Input name="transactionRef" defaultValue={im.transactionRef || ""} placeholder="Transaction / payout reference" required /><Input name="notes" defaultValue={im.notes || ""} placeholder="Optional payout note" /><Button size="sm" variant="outline">Save payout details</Button></form> : <div className="text-sm"><p>{im.method?.replaceAll("_", " ") || "—"}</p><p className="registry-id mt-1 text-xs">{im.transactionRef || "No reference"}</p></div>}</div>
          <div><div className="mb-1 text-xs text-muted2">Proof & reminder</div>{proof ? <a href={`/api/files/${proof.id}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-electric hover:underline">Open proof: {proof.name}</a> : payable ? <RefundInstallmentProofUpload refundId={r.id} installmentId={i.id} clientId={r.clientId} caseId={r.caseId} /> : <p className="text-sm text-muted2">No payout proof</p>}{approver && !["PAID", "CANCELLED"].includes(i.status) ? <form action={sendRefundInstallmentReminder.bind(null, i.id)} className="mt-2"><Button size="sm" variant="outline">Send reminder{im.reminderCount ? ` (${im.reminderCount})` : ""}</Button></form> : null}{im.lastReminderAt ? <p className="mt-1 text-[11px] text-muted2">Last reminder {formatDateTime(new Date(im.lastReminderAt))}</p> : null}</div>
        </div>
        {payable ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><p className={`text-xs ${ready ? "text-emerald-700" : "text-amber-700"}`}>{ready ? "Ready to record: method, transaction reference and payout proof are complete." : "Before recording payment: save method + transaction reference and upload payout proof."}</p><form action={markRefundInstallmentPaid.bind(null, i.id)}><Button size="sm" variant="primary" disabled={!ready}>Record installment paid</Button></form></div> : null}
      </div>;
    })}</CardContent></Card>

    <Card className="mt-4"><CardHeader><CardTitle><span className="flex items-center gap-2"><History className="h-4 w-4" /> Refund & installment audit history</span></CardTitle></CardHeader><CardContent>{auditRows.length ? <div className="space-y-2">{auditRows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs"><div><span className="font-medium">{row.action.replaceAll("_", " ")}</span><span className="ml-2 text-muted2">by {row.user ? `${row.user.firstName} ${row.user.lastName}` : "System"}</span></div><span className="text-muted2">{formatDateTime(row.createdAt)}</span></div>)}</div> : <p className="text-xs text-muted2">No refund audit events yet.</p>}</CardContent></Card>
  </div>;
}

function DecisionForm({ refundId, status, label, variant, placeholder }: { refundId: string; status: "APPROVED" | "REJECTED" | "CANCELLED"; label: string; variant: "primary" | "danger"; placeholder: string }) {
  return <form action={decideRefund.bind(null, refundId)} className="space-y-2"><input type="hidden" name="status" value={status} /><Field label="Decision reason"><Input name="decisionReason" required maxLength={3000} placeholder={placeholder} /></Field><Button type="submit" variant={variant}>{label}</Button></form>;
}
function Metric({ icon: Icon, label, value, hint }: { icon: typeof WalletCards; label: string; value: string; hint: string }) { return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-3 h-5 w-5 text-electric" /><div className="text-xs text-muted2">{label}</div><div className="mt-1 truncate text-base font-semibold" title={value}>{value}</div><div className="mt-1 truncate text-xs text-muted2" title={hint}>{hint}</div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted2">{label}</dt><dd className="mt-0.5 break-words">{value}</dd></div>; }
