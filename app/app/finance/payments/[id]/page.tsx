import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { confirmPayment, rejectPayment } from "@/services/finance";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("PAYMENT_READ");
  const p = await prisma.payment.findUnique({
    where: { id: params.id },
    include: { client: true, case: true, createdBy: true, receipt: true, refunds: true, proofs: true },
  });
  if (!p) notFound();

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="registry-id text-muted2">{p.reference}</p>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            {formatMoney(Number(p.amount), p.currency)} <StatusBadge status={p.status} />
          </h1>
          <p className="mt-1 text-sm text-muted2">
            <Link href={`/app/clients/${p.clientId}`} className="text-electric hover:underline">{p.client.firstName} {p.client.lastName}</Link>
            {p.case ? <> · <Link href={`/app/cases/${p.case.id}`} className="registry-id hover:text-electric">{p.case.caseNumber}</Link></> : null}
          </p>
        </div>
        {p.status === "PENDING" && can(user, "PAYMENT_APPROVE") ? (
          <div className="flex gap-2">
            <form action={confirmPayment.bind(null, p.id)}><Button variant="primary">Confirm & issue receipt</Button></form>
            <form action={rejectPayment.bind(null, p.id)}><Button variant="danger">Reject</Button></form>
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-xs text-muted2">Method</dt><dd className="mt-0.5">{p.method.replaceAll("_"," ")}</dd></div>
            <div><dt className="text-xs text-muted2">Payment date</dt><dd className="mt-0.5">{formatDateTime(p.paidAt)}</dd></div>
            <div><dt className="text-xs text-muted2">Recorded by</dt><dd className="mt-0.5">{p.createdBy.firstName} {p.createdBy.lastName}</dd></div>
            <div><dt className="text-xs text-muted2">Recorded at</dt><dd className="mt-0.5">{formatDateTime(p.createdAt)}</dd></div>
            {p.notes ? <div className="col-span-2"><dt className="text-xs text-muted2">Notes</dt><dd className="mt-0.5 whitespace-pre-wrap">{p.notes}</dd></div> : null}
          </dl>
        </CardContent>
      </Card>

      {p.receipt ? (
        <Card className="mt-4">
          <CardHeader><CardTitle>Receipt</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="registry-id">{p.receipt.reference}</p>
              <p className="text-xs text-muted2">Issued {formatDateTime(p.receipt.issuedAt)}</p>
            </div>
            <Link href={`/app/finance/receipts/${p.receipt.id}/print`}><Button variant="outline">Open printable receipt</Button></Link>
          </CardContent>
        </Card>
      ) : null}

      {p.refunds.length > 0 ? (
        <Card className="mt-4">
          <CardHeader><CardTitle>Linked refunds</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-line">
              {p.refunds.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-5 py-3">
                  <Link href={`/app/finance/refunds/${r.id}`} className="registry-id hover:text-electric">{r.reference}</Link>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">-{formatMoney(Number(r.amount), r.currency)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
