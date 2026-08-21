import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatMoney } from "@/lib/utils";
import { refundPaidTotal, refundRemaining } from "@/lib/finance-refund-workflow";
import { CheckCircle2, Clock3, SearchCheck, Undo2, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RefundsPage() {
  await requirePermission("REFUND_READ");
  const refunds = await prisma.refund.findMany({ orderBy: { createdAt: "desc" }, take: 150, include: { client: true, payment: { select: { reference: true } }, installments: true, files: { where: { archivedAt: null }, select: { id: true } } } });
  const review = refunds.filter((r) => ["REQUESTED", "UNDER_REVIEW"].includes(r.status)).length;
  const approved = refunds.filter((r) => r.status === "APPROVED").length;
  const paying = refunds.filter((r) => r.status === "PARTIALLY_PAID").length;
  const completed = refunds.filter((r) => r.status === "PAID").length;

  return <div>
    <PageHeader title="Refunds" subtitle="Controlled request, review, approval and payout workflow with payment reconciliation." actionHref="/app/finance/refunds/new" actionLabel="New refund" />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={SearchCheck} label="Needs review" value={review} /><Metric icon={Clock3} label="Approved / awaiting payout" value={approved} /><Metric icon={WalletCards} label="Partially paid" value={paying} /><Metric icon={CheckCircle2} label="Completed" value={completed} /></div>
    {refunds.length === 0 ? <EmptyState icon={Undo2} title="No refunds" description="When a refund is requested it will move through review and approval here." actionHref="/app/finance/refunds/new" actionLabel="Create refund request" /> : <Table>
      <THead><tr><TH>Reference</TH><TH>Client</TH><TH>Original payment</TH><TH>Requested</TH><TH>Paid / remaining</TH><TH>Evidence</TH><TH>Status</TH><TH>Created</TH></tr></THead>
      <tbody>{refunds.map((r) => {
        const paid = refundPaidTotal(r.installments);
        const remaining = refundRemaining(r.amount, r.installments);
        return <TR key={r.id}>
          <TD><Link href={`/app/finance/refunds/${r.id}`} className="registry-id hover:text-electric">{r.refundNumber}</Link></TD>
          <TD><Link href={`/app/clients/${r.clientId}`} className="hover:text-electric">{r.client.firstName} {r.client.lastName}</Link></TD>
          <TD>{r.payment ? <span className="registry-id">{r.payment.reference}</span> : <span className="text-muted2">Unlinked</span>}</TD>
          <TD className="font-medium">{formatMoney(Number(r.amount), r.currency)}</TD>
          <TD><div className="text-sm">{formatMoney(paid, r.currency)} paid</div><div className="text-xs text-muted2">{formatMoney(remaining, r.currency)} remaining</div></TD>
          <TD className="text-muted2">{r.files.length} file{r.files.length === 1 ? "" : "s"}</TD>
          <TD><StatusBadge status={r.status} /></TD>
          <TD className="text-muted2">{formatDate(r.createdAt)}</TD>
        </TR>;
      })}</tbody>
    </Table>}
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof SearchCheck; label: string; value: number }) { return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-3 h-5 w-5 text-electric" /><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>; }
