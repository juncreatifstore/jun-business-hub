import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listOnlinePaymentSessions } from "@/lib/finance-online-payments";
import { createOnlinePaymentRequest } from "@/services/finance-online-payments";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OnlinePaymentsPage() {
  await requirePermission("PAYMENT_READ");
  const [sessions, clients, cases] = await Promise.all([
    listOnlinePaymentSessions(),
    prisma.client.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { lastName: "asc" }, take: 300, select: { id: true, firstName: true, lastName: true, internalId: true } }),
    prisma.case.findMany({ where: { status: { notIn: ["ARCHIVED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, caseNumber: true, title: true } }),
  ]);
  const paymentRows = sessions.length ? await prisma.payment.findMany({ where: { id: { in: sessions.map((s) => s.paymentId) } }, select: { id: true, reference: true } }) : [];
  const refs = new Map(paymentRows.map((p) => [p.id, p.reference]));
  const paid = sessions.filter((s) => s.status === "PAID").length;
  const pending = sessions.filter((s) => s.status === "PENDING").length;
  const failed = sessions.filter((s) => ["FAILED","CANCELLED","EXPIRED"].includes(s.status)).length;

  const providers = [
    { name: "Stripe", ready: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) },
    { name: "PayPal", ready: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_WEBHOOK_ID) },
    { name: "Mercado Pago", ready: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN && process.env.MERCADO_PAGO_WEBHOOK_SECRET) },
  ];

  return <div>
    <PageHeader title="Online Payments" subtitle="Secure checkout links, provider confirmation and webhook-driven payment status." />
    <div className="mb-5 grid gap-3 md:grid-cols-3"><Metric label="Pending checkout" value={String(pending)} /><Metric label="Confirmed online" value={String(paid)} /><Metric label="Failed / expired" value={String(failed)} /></div>

    <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <Card><CardHeader><CardTitle>Create secure payment link</CardTitle></CardHeader><CardContent>
        <form action={createOnlinePaymentRequest} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Client"><Select name="clientId" required defaultValue=""><option value="" disabled>Select client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>)}</Select></Field></div>
          <Field label="Case (optional)"><Select name="caseId" defaultValue=""><option value="">No case</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}</Select></Field>
          <Field label="Provider"><Select name="provider" defaultValue="STRIPE"><option value="STRIPE">Stripe</option><option value="PAYPAL">PayPal</option><option value="MERCADO_PAGO">Mercado Pago</option></Select></Field>
          <Field label="Amount"><Input name="amount" type="number" step="0.01" min="0.01" required /></Field>
          <Field label="Currency"><Input name="currency" defaultValue="USD" maxLength={3} required /></Field>
          <div className="sm:col-span-2"><Field label="Description"><Input name="description" placeholder="Service or invoice being paid" required maxLength={180} /></Field></div>
          <Field label="Link validity"><Select name="expiryMinutes" defaultValue="30"><option value="30">30 minutes</option><option value="60">1 hour</option><option value="180">3 hours</option><option value="720">12 hours</option><option value="1440">24 hours</option></Select></Field>
          <div className="flex items-end"><Button variant="primary" type="submit">Create payment link</Button></div>
        </form>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Provider readiness</CardTitle></CardHeader><CardContent className="space-y-3">{providers.map((p) => <div key={p.name} className="flex items-center justify-between rounded-xl border border-line p-3"><div><div className="text-sm font-medium">{p.name}</div><div className="text-xs text-muted2">Server credentials + webhook verification</div></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${p.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{p.ready ? "Ready" : "Needs configuration"}</span></div>)}</CardContent></Card>
    </div>

    <Card className="mt-5"><CardHeader><CardTitle>Recent online payment requests</CardTitle></CardHeader><CardContent className="p-0">{sessions.length ? <div className="divide-y divide-line">{sessions.map((s) => <Link key={s.id} href={`/app/finance/online-payments/${s.id}`} className="grid gap-2 px-5 py-4 hover:bg-surface md:grid-cols-[1.2fr_.8fr_.8fr_.8fr_1fr]"><div><div className="text-sm font-medium">{refs.get(s.paymentId) || s.id}</div><div className="text-xs text-muted2">{s.clientName} · {s.description}</div></div><div className="text-sm">{s.provider.replaceAll("_", " ")}</div><div className="text-sm font-medium">{formatMoney(s.amount, s.currency)}</div><div><span className="rounded-full bg-surface px-2 py-1 text-xs">{s.status}</span></div><div className="text-xs text-muted2">{formatDateTime(new Date(s.updatedAt))}</div></Link>)}</div> : <div className="p-6 text-sm text-muted2">No online payment request yet.</div>}</CardContent></Card>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-line bg-white p-4"><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>; }
