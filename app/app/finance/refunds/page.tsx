import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatMoney } from "@/lib/utils";
import { refundPaidTotal, refundRemaining } from "@/lib/finance-refund-workflow";
import { syncOverdueRefundInstallments } from "@/lib/finance-refund-installments";
import { AlertTriangle, CheckCircle2, Clock3, SearchCheck, Undo2, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RefundsPage() {
  await requirePermission("REFUND_READ");
  await syncOverdueRefundInstallments();
  const refunds = await prisma.refund.findMany({ orderBy: { createdAt: "desc" }, take: 150, include: { client: true, payment: { select: { reference: true } }, installments: { orderBy: { dueDate: "asc" } }, files: { where: { archivedAt: null }, select: { id: true } } } });
  const review = refunds.filter((r) => ["REQUESTED", "UNDER_REVIEW"].includes(r.status)).length;
  const approved = refunds.filter((r) => r.status === "APPROVED").length;
  const paying = refunds.filter((r) => r.status === "PARTIALLY_PAID").length;
  const completed = refunds.filter((r) => r.status === "PAID").length;
  const overdue = refunds.reduce((sum, r) => sum + r.installments.filter((i) => i.status === "LATE").length, 0);
  const activeStatuses = new Set(["REQUESTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_PAID"]);
  const activeByPayment = new Map<string, number>();
  for (const r of refunds) if (r.paymentId && activeStatuses.has(r.status)) activeByPayment.set(r.paymentId, (activeByPayment.get(r.paymentId) || 0) + 1);
  const duplicateGroups = [...activeByPayment.values()].filter((count) => count > 1).length;
  const globalBalanceActive = refunds.filter((r) => !r.paymentId && activeStatuses.has(r.status)).length;

  return <div>
    <PageHeader title="Refunds" subtitle="Controlled request, approval, scheduling and payout workflow with payment reconciliation." actionHref="/app/finance/refunds/new" actionLabel="New refund" />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric icon={SearchCheck} label="Needs review" value={review} /><Metric icon={Clock3} label="Approved / awaiting payout" value={approved} /><Metric icon={WalletCards} label="Partially paid" value={paying} /><Metric icon={AlertTriangle} label="Overdue installments" value={overdue} /><Metric icon={CheckCircle2} label="Completed" value={completed} /></div>
    {duplicateGroups > 0 ? <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"/><div><div className="font-medium text-amber-900">Refund reconciliation attention required</div><div className="mt-1 text-amber-800">{duplicateGroups} original payment(s) have more than one active refund request. Review them before any payout.</div><div className="mt-1 text-xs text-amber-700">Cancelled and rejected requests do not count toward active duplicate warnings. Global client balance refunds are valid and do not require an original payment link.</div></div></div></div> : null}
    {globalBalanceActive > 0 ? <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-xs text-blue-900"><strong>{globalBalanceActive} active refund request(s)</strong> use the Global Client Balance source. These are valid refunds and are intentionally not linked to one specific payment.</div> : null}
    {refunds.length === 0 ? <EmptyState icon={Undo2} title="No refunds" description="When a refund is requested it will move through review and approval here." actionHref="/app/finance/refunds/new" actionLabel="Create refund request" /> : <Table>
      <THead><tr><TH>Reference</TH><TH>Client</TH><TH>Refund source</TH><TH>Requested</TH><TH>Paid / remaining</TH><TH>Next due</TH><TH>Status</TH><TH>Created</TH></tr></THead>
      <tbody>{refunds.map((r) => {
        const paid = refundPaidTotal(r.installments);
        const remaining = refundRemaining(r.amount, r.installments);
        const open = r.installments.filter((i) => !["PAID", "CANCELLED"].includes(i.status));
        const next = open[0] || null;
        const late = r.installments.filter((i) => i.status === "LATE").length;
        const possibleDuplicate = Boolean(r.paymentId && activeStatuses.has(r.status) && (activeByPayment.get(r.paymentId) || 0) > 1);
        const nextLabel = r.status === "PAID" ? "Complete" : r.status === "CANCELLED" ? "Cancelled" : r.status === "REJECTED" ? "Rejected" : "No schedule";
        return <TR key={r.id}>
          <TD><Link href={`/app/finance/refunds/${r.id}`} className="registry-id hover:text-electric">{r.refundNumber}</Link>{possibleDuplicate ? <div className="mt-1"><Badge className="border border-red-200 bg-red-50 text-red-700">POSSIBLE DUPLICATE</Badge></div> : null}</TD>
          <TD><Link href={`/app/clients/${r.clientId}`} className="hover:text-electric">{r.client.firstName} {r.client.lastName}</Link></TD>
          <TD>{r.payment ? <div><span className="registry-id">{r.payment.reference}</span><div className="mt-1 text-[11px] text-muted2">Specific payment</div></div> : <div><Badge className="border border-blue-200 bg-blue-50 text-blue-800">GLOBAL BALANCE</Badge><div className="mt-1 text-[11px] text-muted2">No payment link required</div></div>}</TD>
          <TD className="font-medium">{formatMoney(Number(r.amount), r.currency)}</TD>
          <TD><div className="text-sm">{formatMoney(paid, r.currency)} paid</div><div className="text-xs text-muted2">{formatMoney(remaining, r.currency)} remaining</div></TD>
          <TD>{next ? <div><div className={late ? "font-medium text-amber-700" : "text-sm"}>{formatDate(next.dueDate)}</div><div className="text-xs text-muted2">{formatMoney(Number(next.amount), r.currency)}{late ? ` · ${late} late` : ""}</div></div> : <span className="text-muted2">{nextLabel}</span>}</TD>
          <TD><StatusBadge status={r.status} /></TD>
          <TD className="text-muted2">{formatDate(r.createdAt)}</TD>
        </TR>;
      })}</tbody>
    </Table>}
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof SearchCheck; label: string; value: number }) { return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-3 h-5 w-5 text-electric" /><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>; }
