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

  const payments = await prisma.payment.findMany({
    where: {
      status: "CONFIRMED",
      paidAt: { not: null },
    },
    orderBy: { paidAt: "desc" },
    take: 100,
    include: { client: true },
  });

  return (
    <div>
      <PageHeader title="Receipts" subtitle="Issued automatically when a payment is confirmed. Each one is printable and verifiable." />
      {payments.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No receipts yet" description="Confirm a pending payment and its receipt will appear here." actionHref="/app/finance/payments" actionLabel="Go to payments" />
      ) : (
        <Table>
          <THead><tr><TH>Receipt</TH><TH>Payment</TH><TH>Client</TH><TH>Amount</TH><TH>Issued</TH><TH></TH></tr></THead>
          <tbody>
            {payments.map((p) => {
              const receiptReference = `RCT-${p.reference}`;
              return (
                <TR key={p.id}>
                  <TD><span className="registry-id">{receiptReference}</span></TD>
                  <TD><Link href={`/app/finance/payments/${p.id}`} className="registry-id hover:text-electric">{p.reference}</Link></TD>
                  <TD><Link href={`/app/clients/${p.clientId}`} className="hover:text-electric">{p.client.firstName} {p.client.lastName}</Link></TD>
                  <TD className="font-medium">{formatMoney(Number(p.amount), p.currency)}</TD>
                  <TD className="text-muted2">{formatDate(p.paidAt)}</TD>
                  <TD><a href={`/api/receipts/${p.id}/pdf`} target="_blank" rel="noreferrer" className="text-electric hover:underline">PDF</a> · <Link href={`/app/finance/receipts/${p.id}/print`} className="text-muted2 hover:text-electric">Print</Link></TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
