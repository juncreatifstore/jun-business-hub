import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { getManualTransferOrder, receiverPaymentDetails } from "@/lib/finance-manual-transfers";
import { getUniversalFinancialReceiptForSource } from "@/lib/finance-universal-receipts";
import { prisma } from "@/lib/prisma";
import { setManualTransferOrderStatusWithReceipt } from "@/services/manual-transfer-receipt-status";
import { regenerateManualTransferOrderAsNew } from "@/services/manual-transfer-regenerate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";
import { ManualTransferActions } from "@/components/app/manual-transfer-actions";

export const dynamic = "force-dynamic";

export default async function ManualTransferOrderPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("PAYMENT_READ");
  const order = await getManualTransferOrder(params.id);
  if (!order) notFound();
  const receipt = order.status === "COMPLETED" ? await getUniversalFinancialReceiptForSource("MANUAL_TRANSFER", order.id) : null;
  const paymentLink = order.status === "COMPLETED"
    ? await prisma.appSetting.findUnique({ where: { key: `finance.manual.payment.${order.id}` }, select: { value: true } })
    : null;
  const linkedPayment = paymentLink?.value
    ? await prisma.payment.findUnique({ where: { id: paymentLink.value }, select: { id: true, reference: true, amount: true, currency: true, status: true } })
    : null;
  const r = order.receiverSnapshot;
  return <div className="max-w-5xl">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className="registry-id text-muted2">{order.orderNumber}</p><h1 className="mt-1 text-2xl font-semibold">Manual payment order</h1><p className="mt-1 text-sm text-muted2">{r.rail.replaceAll("_", " ")} · {order.originCountry} → {order.destinationCountry} · {order.language}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-surface px-3 py-1 text-xs font-medium">{order.status}</span><a href={`/api/finance/manual-transfers/${order.id}/pdf`} target="_blank" className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium">Payment order PDF</a>{receipt?<a href={`/api/finance/receipts/${receipt.id}/pdf`} target="_blank" className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium">Receipt PDF</a>:null}{linkedPayment?<Link href={`/app/finance/payments/${linkedPayment.id}`} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">Payment {linkedPayment.reference}</Link>:null}</div></div>

    {order.status === "COMPLETED" ? <div className={`mb-4 rounded-xl border p-4 text-sm ${linkedPayment ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      {linkedPayment
        ? <>This completed order is registered in <strong>Payments</strong> as <span className="registry-id">{linkedPayment.reference}</span> · {formatMoney(Number(linkedPayment.amount), linkedPayment.currency)} · {linkedPayment.status}.</>
        : <>This order is completed but has not yet been registered in <strong>Payments</strong>. Use <strong>Register payment</strong> below to synchronize this older order without creating a duplicate receipt.</>}
    </div> : null}

    <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric label="Amount to send" value={formatMoney(order.sendAmount, order.sendCurrency)} /><Metric label="Fees deducted" value={formatMoney(order.feeAmount, order.sendCurrency)} /><Metric label="Net after fees" value={formatMoney(order.netAfterFees, order.sendCurrency)} /><Metric label="Estimated received" value={formatMoney(order.receiveAmount, order.receiveCurrency)} /></div>

    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Transfer details</CardTitle></CardHeader><CardContent><dl className="grid grid-cols-2 gap-3 text-sm"><Info label="Payer / partner" value={order.payerName || "—"} /><Info label="Purpose" value={order.purpose || "Commercial payment"} /><Info label="Origin country" value={order.originCountry} /><Info label="Destination country" value={order.destinationCountry} /><Info label="Sending currency" value={order.sendCurrency} /><Info label="Receiving currency" value={order.receiveCurrency} /><Info label="Exchange rate" value={String(order.exchangeRate)} /><Info label="Receiver" value={r.legalName} /></dl></CardContent></Card><Card><CardHeader><CardTitle>Receiver / bank information</CardTitle></CardHeader><CardContent><pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">{receiverPaymentDetails(r, order.language)}</pre>{r.complianceNote ? <div className="mt-4 rounded-lg border border-line bg-surface p-3 text-xs text-muted2">{r.complianceNote}</div> : null}</CardContent></Card></div>

    <Card className="mt-4"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Instructions to sender</CardTitle><ManualTransferActions text={order.instructions} /></div></CardHeader><CardContent><pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface p-4 font-sans text-sm leading-6">{order.instructions}</pre></CardContent></Card>

    {can(user, "PAYMENT_CREATE") ? <Card className="mt-4"><CardHeader><CardTitle>Refresh sender instructions</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-muted2">If the receiver or bank details were corrected after this order was issued, generate a new order using the current receiver data. The original order remains unchanged for audit history.</p><form action={regenerateManualTransferOrderAsNew.bind(null, order.id)}><Button variant="outline">Regenerate as new order</Button></form></CardContent></Card> : null}

    {can(user, "PAYMENT_APPROVE") ? <Card className="mt-4"><CardHeader><CardTitle>Order status</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><form action={setManualTransferOrderStatusWithReceipt.bind(null, order.id)}><input type="hidden" name="status" value="ISSUED" /><Button variant="outline">Mark issued</Button></form><form action={setManualTransferOrderStatusWithReceipt.bind(null, order.id)}><input type="hidden" name="status" value="COMPLETED" /><Button variant="primary">{order.status === "COMPLETED" && !linkedPayment ? "Register payment" : "Mark completed"}</Button></form><form action={setManualTransferOrderStatusWithReceipt.bind(null, order.id)}><input type="hidden" name="status" value="CANCELLED" /><Button variant="danger">Cancel order</Button></form></CardContent></Card> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-line bg-white p-4"><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted2">{label}</dt><dd className="mt-0.5 break-words">{value}</dd></div>; }
