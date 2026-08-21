import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureReceiptMeta, shortReceiptHash } from "@/lib/finance-receipts";
import { voidReceipt } from "@/services/finance-receipts";
import { ReceiptShareActions } from "@/components/app/receipt-share-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { FileCheck2, Hash, QrCode, ReceiptText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReceiptDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("PAYMENT_READ");
  const payment = await prisma.payment.findFirst({
    where: { OR: [{ id: params.id }, { reference: params.id }] },
    include: { client: true, case: true, recordedBy: true, files: { where: { archivedAt: null }, orderBy: { createdAt: "desc" } } },
  });
  if (!payment || !payment.paidAt || !["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)) notFound();
  const meta = await ensureReceiptMeta(payment);
  const verifyPath = `/verify/${meta.receiptReference}`;
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.juncreatif.org").replace(/\/$/, "");
  const verifyUrl = `${baseUrl}${verifyPath}`;
  const pdfUrl = `${baseUrl}/api/receipts/${payment.id}/pdf`;

  return <div className="max-w-5xl">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="registry-id text-muted2">{meta.receiptReference}</p><h1 className="mt-1 text-2xl font-semibold">Official payment receipt</h1><p className="mt-1 text-sm text-muted2">Payment {payment.reference} · {payment.client.firstName} {payment.client.lastName}</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{meta.status}</span>
    </div>

    <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={ReceiptText} label="Amount" value={formatMoney(Number(payment.amount), payment.currency)} hint={payment.method.replaceAll("_", " ")} />
      <Metric icon={FileCheck2} label="Payment proofs" value={String(payment.files.length)} hint="Linked files in JUN Drive" />
      <Metric icon={Hash} label="PDF integrity" value={shortReceiptHash(meta.pdfSha256)} hint={`${meta.downloadCount} PDF view${meta.downloadCount === 1 ? "" : "s"}`} />
      <Metric icon={QrCode} label="Verification" value={meta.status === "ACTIVE" ? "Valid" : "Voided"} hint={verifyPath} />
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Receipt details</CardTitle></CardHeader><CardContent><dl className="grid grid-cols-2 gap-3 text-sm">
        <Info label="Receipt" value={meta.receiptReference} /><Info label="Payment" value={payment.reference} />
        <Info label="Client" value={`${payment.client.firstName} ${payment.client.lastName}`} /><Info label="Client ID" value={payment.client.internalId} />
        <Info label="Paid" value={formatDateTime(payment.paidAt)} /><Info label="Issued" value={formatDateTime(new Date(meta.issuedAt))} />
        <Info label="Payment status" value={payment.status.replaceAll("_", " ")} /><Info label="Recorded by" value={`${payment.recordedBy.firstName} ${payment.recordedBy.lastName}`} />
        {payment.case ? <Info label="Case" value={payment.case.caseNumber} /> : null}
        {meta.lastDownloadedAt ? <Info label="Last PDF access" value={formatDateTime(new Date(meta.lastDownloadedAt))} /> : null}
      </dl></CardContent></Card>

      <Card><CardHeader><CardTitle>Actions & proof</CardTitle></CardHeader><CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {meta.status === "ACTIVE" ? <a href={`/api/receipts/${payment.id}/pdf`} target="_blank" rel="noreferrer"><Button variant="primary">Open PDF</Button></a> : null}
          <Link href={`/app/finance/receipts/${payment.id}/print`}><Button variant="outline">Print view</Button></Link>
          <Link href={verifyPath} target="_blank"><Button variant="outline">Verify QR</Button></Link>
          <Link href={`/app/finance/payments/${payment.id}`}><Button variant="outline">Payment ledger</Button></Link>
        </div>
        <ReceiptShareActions receiptReference={meta.receiptReference} verifyUrl={verifyUrl} pdfUrl={pdfUrl} clientName={payment.client.firstName} active={meta.status === "ACTIVE"} />
        {payment.files.length ? <div className="divide-y divide-line rounded-lg border border-line">{payment.files.map((f) => <div key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><span className="truncate">{f.name}</span><a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="text-electric">Open</a></div>)}</div> : <p className="text-xs text-muted2">No payment proof attached.</p>}
      </CardContent></Card>
    </div>

    {meta.status === "VOID" ? <Card className="mt-4"><CardHeader><CardTitle>Void record</CardTitle></CardHeader><CardContent className="text-sm"><p className="font-medium text-red-700">This receipt is formally void.</p><p className="mt-2 text-muted2">{meta.voidReason || "No reason recorded."}</p>{meta.voidedAt ? <p className="mt-2 text-xs text-muted2">Voided {formatDateTime(new Date(meta.voidedAt))}</p> : null}</CardContent></Card> : can(user, "PAYMENT_APPROVE") ? <Card className="mt-4"><CardHeader><CardTitle>Void receipt</CardTitle></CardHeader><CardContent><form action={voidReceipt.bind(null, payment.id)} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="flex-1"><Field label="Reason required"><Input name="reason" required maxLength={1000} placeholder="Explain why this receipt must be voided" /></Field></div><Button variant="danger" type="submit">Void receipt</Button></form><p className="mt-2 text-xs text-muted2">Voiding never deletes the payment or audit history. The QR verification page will show the receipt as void.</p></CardContent></Card> : null}
  </div>;
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof ReceiptText; label: string; value: string; hint: string }) { return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-3 h-5 w-5 text-electric" /><div className="text-xs text-muted2">{label}</div><div className="mt-1 break-words text-lg font-semibold">{value}</div><div className="mt-1 break-words text-xs text-muted2">{hint}</div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted2">{label}</dt><dd className="mt-0.5 break-words">{value}</dd></div>; }
