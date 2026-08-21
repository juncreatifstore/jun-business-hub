import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatMoney } from "@/lib/utils";
import { getReceiptMetaMap } from "@/lib/finance-receipts";
import { ReceiptText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  await requirePermission("PAYMENT_READ");
  const payments = await prisma.payment.findMany({
    where: { status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] }, paidAt: { not: null } },
    orderBy: { paidAt: "desc" },
    take: 150,
    include: { client: true, files: { where: { archivedAt: null }, select: { id: true } } },
  });
  const metaMap = await getReceiptMetaMap(payments.map((p) => p.id));

  return (
    <div>
      <PageHeader title="Receipts" subtitle="Official payment receipts with QR verification, proof tracking and controlled void status." />
      {payments.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No receipts yet" description="Confirm a pending payment and its receipt will appear here." actionHref="/app/finance/payments" actionLabel="Go to payments" />
      ) : (
        <Table>
          <THead><tr><TH>Receipt</TH><TH>Client</TH><TH>Amount</TH><TH>Status</TH><TH>Proof</TH><TH>Issued</TH><TH></TH></tr></THead>
          <tbody>{payments.map((p) => {
            const meta = metaMap.get(p.id);
            const receiptReference = meta?.receiptReference || `RCT-${p.reference}`;
            const receiptStatus = meta?.status || "ACTIVE";
            return <TR key={p.id}>
              <TD><Link href={`/app/finance/receipts/${p.id}`} className="registry-id hover:text-electric">{receiptReference}</Link><div className="mt-0.5 text-[11px] text-muted2">{p.reference}</div></TD>
              <TD><Link href={`/app/clients/${p.clientId}`} className="hover:text-electric">{p.client.firstName} {p.client.lastName}</Link></TD>
              <TD className="font-medium">{formatMoney(Number(p.amount), p.currency)}</TD>
              <TD><span className={`rounded-full px-2 py-1 text-xs font-medium ${receiptStatus === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{receiptStatus}</span></TD>
              <TD className="text-muted2">{p.files.length}</TD>
              <TD className="text-muted2">{formatDate(p.paidAt)}</TD>
              <TD><Link href={`/app/finance/receipts/${p.id}`} className="text-electric hover:underline">Open</Link></TD>
            </TR>;
          })}</tbody>
        </Table>
      )}
    </div>
  );
}
