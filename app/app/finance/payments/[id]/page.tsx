import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { confirmPayment, rejectPayment } from "@/services/finance";
import { getPaymentCoreMeta, paymentBalance } from "@/lib/finance-payment-core";
import { PaymentProofUpload } from "@/components/app/payment-proof-upload";
import { FileCheck2, History, ReceiptText, Scale } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("PAYMENT_READ");
  const [p, meta, auditRows] = await Promise.all([
    prisma.payment.findUnique({
      where: { id: params.id },
      include: { client: true, case: true, recordedBy: true, refunds: { orderBy: { createdAt: "desc" } }, files: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { firstName: true, lastName: true } } } } },
    }),
    getPaymentCoreMeta(params.id),
    prisma.auditLog.findMany({ where: { OR: [{ resourceType: "Payment", resourceId: params.id }, { action: "PAYMENT_PROOF_UPLOAD", after: { path: ["paymentId"], equals: params.id } as any }] }, orderBy: { createdAt: "desc" }, take: 40, include: { user: { select: { firstName: true, lastName: true } } } }),
  ]);
  if (!p) notFound();

  const amount = Number(p.amount);
  const balance = paymentBalance(amount, meta.expectedAmount);
  const committedRefund = p.refunds.filter((r) => !["REJECTED", "CANCELLED"].includes(r.status)).reduce((sum, r) => sum + Number(r.amount), 0);
  const refundable = Math.max(0, Math.round((amount - committedRefund) * 100) / 100);
  const receiptAvailable = ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status);

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="registry-id text-muted2">{p.reference}</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold">{formatMoney(amount, p.currency)} <StatusBadge status={p.status} /></h1>
          <p className="mt-1 text-sm text-muted2">
            <Link href={`/app/clients/${p.clientId}`} className="text-electric hover:underline">{p.client.firstName} {p.client.lastName}</Link>
            {p.case ? <> · <Link href={`/app/cases/${p.case.id}`} className="registry-id hover:text-electric">{p.case.caseNumber}</Link></> : null}
            {meta.serviceLabel ? <> · {meta.serviceLabel}</> : null}
          </p>
        </div>
        {p.status === "PENDING" && can(user, "PAYMENT_APPROVE") ? <div className="flex gap-2"><form action={confirmPayment.bind(null, p.id)}><Button variant="primary">Confirm & issue receipt</Button></form><form action={rejectPayment.bind(null, p.id)}><Button variant="danger">Reject</Button></form></div> : null}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ReceiptText} label="Received" value={formatMoney(amount, p.currency)} hint={p.method.replaceAll("_", " ")} />
        <Metric icon={Scale} label="Expected" value={meta.expectedAmount == null ? "Not specified" : formatMoney(meta.expectedAmount, p.currency)} hint={balance == null ? "Add expected amount on new payments" : balance > 0 ? `${formatMoney(balance, p.currency)} still due` : balance < 0 ? `${formatMoney(Math.abs(balance), p.currency)} overpaid` : "Paid in full"} />
        <Metric icon={FileCheck2} label="Evidence" value={`${p.files.length} file${p.files.length === 1 ? "" : "s"}`} hint={p.files.length ? "Stored in JUN Drive" : "No payment proof attached"} />
        <Metric icon={Scale} label="Refundable now" value={formatMoney(refundable, p.currency)} hint={`${formatMoney(committedRefund, p.currency)} committed to refunds`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Payment details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-xs text-muted2">Method</dt><dd className="mt-0.5">{p.method.replaceAll("_"," ")}</dd></div>
              <div><dt className="text-xs text-muted2">Payment date</dt><dd className="mt-0.5">{formatDateTime(p.paidAt)}</dd></div>
              <div><dt className="text-xs text-muted2">Provider reference</dt><dd className="mt-0.5 break-all">{p.providerRef || meta.providerRef || "—"}</dd></div>
              <div><dt className="text-xs text-muted2">Service / purpose</dt><dd className="mt-0.5">{meta.serviceLabel || "—"}</dd></div>
              <div><dt className="text-xs text-muted2">Recorded by</dt><dd className="mt-0.5">{p.recordedBy.firstName} {p.recordedBy.lastName}</dd></div>
              <div><dt className="text-xs text-muted2">Recorded at</dt><dd className="mt-0.5">{formatDateTime(p.createdAt)}</dd></div>
              {p.notes ? <div className="col-span-2"><dt className="text-xs text-muted2">Notes</dt><dd className="mt-0.5 whitespace-pre-wrap">{p.notes}</dd></div> : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payment evidence</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {can(user, "FILE_UPLOAD") ? <PaymentProofUpload paymentId={p.id} clientId={p.clientId} caseId={p.caseId} /> : null}
            {p.files.length ? <div className="divide-y divide-line rounded-lg border border-line">{p.files.map((file) => <div key={file.id} className="flex items-center justify-between gap-3 px-3 py-2.5"><div className="min-w-0"><div className="truncate text-sm font-medium">{file.name}</div><div className="text-[11px] text-muted2">{file.category.replaceAll("_", " ")} · {file.uploadedBy.firstName} {file.uploadedBy.lastName}</div></div><a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-electric hover:underline">Open</a></div>)}</div> : <p className="text-xs text-muted2">No proof or supporting file is linked to this payment yet.</p>}
          </CardContent>
        </Card>
      </div>

      {receiptAvailable ? <Card className="mt-4"><CardHeader><CardTitle>Receipt</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3"><div><p className="registry-id">RCT-{p.reference}</p><p className="text-xs text-muted2">Official receipt generated from the confirmed payment.</p></div><a href={`/api/receipts/${p.id}/pdf`} target="_blank" rel="noreferrer"><Button variant="outline">Open receipt PDF</Button></a></CardContent></Card> : null}

      {p.refunds.length > 0 ? <Card className="mt-4"><CardHeader><CardTitle>Linked refunds</CardTitle></CardHeader><CardContent className="p-0"><ul className="divide-y divide-line">{p.refunds.map((r) => <li key={r.id} className="flex items-center justify-between px-5 py-3"><Link href={`/app/finance/refunds/${r.id}`} className="registry-id hover:text-electric">{r.refundNumber}</Link><div className="flex items-center gap-3"><span className="text-sm font-medium">-{formatMoney(Number(r.amount), r.currency)}</span><StatusBadge status={r.status} /></div></li>)}</ul></CardContent></Card> : null}

      <Card className="mt-4">
        <CardHeader><CardTitle><span className="flex items-center gap-2"><History className="h-4 w-4" /> Finance history</span></CardTitle></CardHeader>
        <CardContent>{auditRows.length ? <div className="space-y-2">{auditRows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs"><div><span className="font-medium">{row.action.replaceAll("_", " ")}</span><span className="ml-2 text-muted2">by {row.user ? `${row.user.firstName} ${row.user.lastName}` : "System"}</span></div><span className="text-muted2">{formatDateTime(row.createdAt)}</span></div>)}</div> : <p className="text-xs text-muted2">No finance audit events yet.</p>}</CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof ReceiptText; label: string; value: string; hint: string }) {
  return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-3 h-5 w-5 text-electric" /><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div><div className="mt-1 text-xs text-muted2">{hint}</div></div>;
}
