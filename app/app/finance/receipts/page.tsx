import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatMoney } from "@/lib/utils";
import { ReceiptText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  await requirePermission("PAYMENT_READ");
  const receipts = await prisma.receipt.findMany({
    orderBy: { issuedAt: "desc" }, take: 100,
    include: { client: true, payment: true },
  });
  return (
    <div>
      <PageHeader title="Receipts" subtitle="Issued automatically when a payment is confirmed. Each one is printable and verifiable." />
      {receipts.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No receipts yet" description="Confirm a pending payment and its receipt will appear here." actionHref="/app/finance/payments" actionLabel="Go to payments" />
      ) : (
        <Table>
          <THead><tr><TH>Receipt</TH><TH>Payment</TH><TH>Client</TH><TH>Amount</TH><TH>Issued</TH><TH></TH></tr></THead>
          <tbody>
            {receipts.map((r) => (
              <TR key={r.id}>
                <TD><span className="registry-id">{r.reference}</span></TD>
                <TD><Link href={`/app/finance/payments/${r.paymentId}`} className="registry-id hover:text-electric">{r.payment.reference}</Link></TD>
                <TD><Link href={`/app/clients/${r.clientId}`} className="hover:text-electric">{r.client.firstName} {r.client.lastName}</Link></TD>
                <TD className="font-medium">{formatMoney(Number(r.amount), r.currency)}</TD>
                <TD className="text-muted2">{formatDate(r.issuedAt)}</TD>
                <TD><a href={`/api/receipts/${r.id}/pdf`} target="_blank" rel="noreferrer" className="text-electric hover:underline">PDF</a> · <Link href={`/app/finance/receipts/${r.id}/print`} className="text-muted2 hover:text-electric">Print</Link></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
