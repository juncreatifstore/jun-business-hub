import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatMoney } from "@/lib/utils";
import { Undo2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RefundsPage() {
  await requirePermission("REFUND_READ");
  const refunds = await prisma.refund.findMany({
    orderBy: { createdAt: "desc" }, take: 100,
    include: { client: true, installments: true },
  });
  return (
    <div>
      <PageHeader title="Refunds" subtitle="Requested, reviewed, approved, then paid — optionally in installments." actionHref="/app/finance/refunds/new" actionLabel="New refund" />
      {refunds.length === 0 ? (
        <EmptyState icon={Undo2} title="No refunds" description="When a refund is requested it will move through review and approval here." actionHref="/app/finance/refunds/new" actionLabel="Create refund request" />
      ) : (
        <Table>
          <THead><tr><TH>Reference</TH><TH>Client</TH><TH>Amount</TH><TH>Schedule</TH><TH>Status</TH><TH>Created</TH></tr></THead>
          <tbody>
            {refunds.map((r) => {
              const paid = r.installments.filter((i) => i.status === "PAID").length;
              return (
                <TR key={r.id}>
                  <TD><Link href={`/app/finance/refunds/${r.id}`} className="registry-id hover:text-electric">{r.refundNumber}</Link></TD>
                  <TD><Link href={`/app/clients/${r.clientId}`} className="hover:text-electric">{r.client.firstName} {r.client.lastName}</Link></TD>
                  <TD className="font-medium">{formatMoney(Number(r.amount), r.currency)}</TD>
                  <TD className="text-muted2">{paid}/{r.installments.length} installments paid</TD>
                  <TD><StatusBadge status={r.status} /></TD>
                  <TD className="text-muted2">{formatDate(r.createdAt)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
