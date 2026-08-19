import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/utils";
import { setRefundStatus, markInstallmentPaid } from "@/services/finance";

export const dynamic = "force-dynamic";

export default async function RefundDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("REFUND_READ");
  const r = await prisma.refund.findUnique({
    where: { id: params.id },
    include: { client: true, case: true, payment: true, createdBy: true, approvedBy: true, installments: { orderBy: { dueDate: "asc" } }, attachments: true },
  });
  if (!r) notFound();
  const approver = can(user, "REFUND_APPROVE");

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="registry-id text-muted2">{r.reference}</p>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            -{formatMoney(Number(r.amount), r.currency)} <StatusBadge status={r.status} />
          </h1>
          <p className="mt-1 text-sm text-muted2">
            <Link href={`/app/clients/${r.clientId}`} className="text-electric hover:underline">{r.client.firstName} {r.client.lastName}</Link>
            {r.case ? <> · <Link href={`/app/cases/${r.case.id}`} className="registry-id hover:text-electric">{r.case.caseNumber}</Link></> : null}
            {r.payment ? <> · original <Link href={`/app/finance/payments/${r.payment.id}`} className="registry-id hover:text-electric">{r.payment.reference}</Link></> : null}
          </p>
        </div>
        {approver && ["REQUESTED", "UNDER_REVIEW"].includes(r.status) ? (
          <div className="flex gap-2">
            {r.status === "REQUESTED" ? (
              <form action={setRefundStatus.bind(null, r.id)}>
                <input type="hidden" name="status" value="UNDER_REVIEW" />
                <Button variant="outline">Start review</Button>
              </form>
            ) : null}
            <form action={setRefundStatus.bind(null, r.id)}>
              <input type="hidden" name="status" value="APPROVED" />
              <Button variant="primary">Approve</Button>
            </form>
            <form action={setRefundStatus.bind(null, r.id)}>
              <input type="hidden" name="status" value="REJECTED" />
              <Button variant="danger">Reject</Button>
            </form>
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader><CardTitle>Request</CardTitle></CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{r.reason}</p>
          <p className="mt-3 text-xs text-muted2">
            Requested by {r.createdBy.firstName} {r.createdBy.lastName} on {formatDate(r.createdAt)}
            {r.approvedBy ? ` · approved by ${r.approvedBy.firstName} ${r.approvedBy.lastName} on ${formatDate(r.approvedAt)}` : ""}
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Installment schedule</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-line">
            {r.installments.map((i, idx) => (
              <li key={i.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium">Installment {idx + 1} — {formatMoney(Number(i.amount), r.currency)}</p>
                  <p className="text-xs text-muted2">Due {formatDate(i.dueDate)}{i.paidAt ? ` · paid ${formatDate(i.paidAt)}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={i.status} />
                  {approver && i.status === "SCHEDULED" && ["APPROVED", "PARTIALLY_PAID"].includes(r.status) ? (
                    <form action={markInstallmentPaid.bind(null, i.id)}>
                      <Button size="sm" variant="outline">Mark paid</Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
