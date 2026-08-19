import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/utils";
import { CreditCard } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: { status?: string } }) {
  await requirePermission("PAYMENT_READ");
  const status = searchParams.status;
  const payments = await prisma.payment.findMany({
    where: status && status !== "ALL" ? { status: status as never } : {},
    orderBy: { paidAt: "desc" }, take: 100,
    include: { client: true, case: true },
  });

  return (
    <div>
      <PageHeader title="Payments" subtitle="Recorded money in — confirmed payments issue receipts automatically." actionHref="/app/finance/payments/new" actionLabel="Record payment" />
      <form className="mb-4 flex gap-2">
        <Select name="status" defaultValue={status ?? "ALL"} className="w-48">
          <option value="ALL">All statuses</option>
          {["PENDING","CONFIRMED","REJECTED","REFUNDED","PARTIALLY_REFUNDED"].map((s) => <option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}
        </Select>
        <Button variant="outline">Filter</Button>
      </form>
      {payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" description="Record the first payment to start the finance ledger." actionHref="/app/finance/payments/new" actionLabel="Record payment" />
      ) : (
        <Table>
          <THead><tr><TH>Reference</TH><TH>Client</TH><TH>Case</TH><TH>Amount</TH><TH>Method</TH><TH>Status</TH><TH>Receipt</TH><TH>Date</TH></tr></THead>
          <tbody>
            {payments.map((p) => (
              <TR key={p.id}>
                <TD><Link href={`/app/finance/payments/${p.id}`} className="registry-id hover:text-electric">{p.reference}</Link></TD>
                <TD><Link href={`/app/clients/${p.clientId}`} className="hover:text-electric">{p.client.firstName} {p.client.lastName}</Link></TD>
                <TD className="registry-id text-muted2">{p.case?.caseNumber ?? "—"}</TD>
                <TD className="font-medium">{formatMoney(Number(p.amount), p.currency)}</TD>
                <TD className="text-muted2">{p.method.replaceAll("_", " ")}</TD>
                <TD><StatusBadge status={p.status} /></TD>
                <TD className="registry-id text-muted2">
                  {p.status === "CONFIRMED" && p.paidAt ? (
                    <a href={`/api/receipts/${p.id}/pdf`} target="_blank" rel="noreferrer" className="hover:text-electric">RCT-{p.reference}</a>
                  ) : "—"}
                </TD>
                <TD className="text-muted2">{formatDate(p.paidAt)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
