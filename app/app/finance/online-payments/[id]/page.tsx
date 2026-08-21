import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOnlinePaymentSession } from "@/lib/finance-online-payments";
import { cancelOnlinePaymentSession } from "@/services/finance-online-payments";
import { OnlinePaymentActions } from "@/components/app/online-payment-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OnlinePaymentDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { token?: string } }) {
  const user = await requirePermission("PAYMENT_READ");
  const session = await getOnlinePaymentSession(params.id);
  if (!session) notFound();
  const payment = await prisma.payment.findUnique({ where: { id: session.paymentId }, include: { client: true, case: true } });
  if (!payment) notFound();
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const publicUrl = searchParams.token ? `${base}/pay/${searchParams.token}` : null;
  const expired = new Date(session.expiresAt).getTime() <= Date.now();

  return <div className="max-w-5xl">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="registry-id text-muted2">{payment.reference}</p><h1 className="mt-1 text-2xl font-semibold">Online payment request</h1><p className="mt-1 text-sm text-muted2">{session.provider.replaceAll("_", " ")} · {session.clientName}</p></div>
      <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold">{session.status}</span>
    </div>

    <div className="mb-4 grid gap-3 md:grid-cols-3"><Metric label="Amount" value={formatMoney(session.amount, session.currency)} /><Metric label="Expires" value={formatDateTime(new Date(session.expiresAt))} /><Metric label="Provider status" value={expired && session.status !== "PAID" ? "EXPIRED" : session.status} /></div>

    <Card><CardHeader><CardTitle>Payment link</CardTitle></CardHeader><CardContent className="space-y-4">
      {publicUrl ? <><div className="break-all rounded-xl border border-line bg-surface p-3 text-xs">{publicUrl}</div><OnlinePaymentActions publicUrl={publicUrl} checkoutUrl={session.checkoutUrl} /><p className="text-xs text-muted2">This bearer link is displayed only in the creation result. Store/share it through an approved JUN communication channel.</p></> : <><OnlinePaymentActions checkoutUrl={session.checkoutUrl} /><p className="text-xs text-muted2">For security, JUN stores only a hash of the public access secret. The original JUN link is not recoverable from the database after you leave the creation page.</p></>}
    </CardContent></Card>

    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Transaction</CardTitle></CardHeader><CardContent><dl className="grid grid-cols-2 gap-3 text-sm"><Info label="Client" value={`${payment.client.firstName} ${payment.client.lastName}`} /><Info label="Case" value={payment.case?.caseNumber || "—"} /><Info label="Description" value={session.description} /><Info label="Currency" value={session.currency} /><Info label="Provider session" value={session.providerSessionId || "—"} /><Info label="Provider payment" value={session.providerPaymentId || "—"} /></dl><div className="mt-4"><Link href={`/app/finance/payments/${payment.id}`} className="text-sm font-medium text-electric hover:underline">Open payment ledger entry</Link></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Security & lifecycle</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div><div className="text-xs text-muted2">Created</div><div>{formatDateTime(new Date(session.createdAt))}</div></div><div><div className="text-xs text-muted2">Last update</div><div>{formatDateTime(new Date(session.updatedAt))}</div></div>{session.lastError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{session.lastError}</div> : null}<p className="text-xs leading-5 text-muted2">Payment confirmation comes from the provider webhook/capture API, never from a browser success parameter.</p></CardContent></Card>
    </div>

    {session.status !== "PAID" && session.status !== "CANCELLED" && can(user, "PAYMENT_APPROVE") ? <Card className="mt-4"><CardHeader><CardTitle>Administrative action</CardTitle></CardHeader><CardContent><form action={cancelOnlinePaymentSession.bind(null, session.id)}><Button variant="danger">Cancel payment request</Button></form></CardContent></Card> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-line bg-white p-4"><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted2">{label}</dt><dd className="mt-0.5 break-all">{value}</dd></div>; }
