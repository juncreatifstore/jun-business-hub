import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getManualTransferOrders, getManualTransferReceivers } from "@/lib/finance-manual-transfers";
import { createManualTransferOrder } from "@/services/finance-manual-transfers";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ManualTransfersPage() {
  await requirePermission("PAYMENT_READ");
  const [receivers, orders, clients, cases] = await Promise.all([
    getManualTransferReceivers(true),
    getManualTransferOrders(),
    prisma.client.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { lastName: "asc" }, take: 300, select: { id: true, firstName: true, lastName: true, internalId: true } }),
    prisma.case.findMany({ where: { status: { notIn: ["ARCHIVED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, caseNumber: true, title: true } }),
  ]);

  return <div>
    <PageHeader title="Manual Transfer Orders" subtitle="Generate professional Western Union and bank-transfer instructions with fees, route and net amount calculated before the transaction." />
    <div className="mb-4 flex justify-end"><Link href="/app/finance/manual-transfers/receivers"><Button variant="outline">Configure receivers</Button></Link></div>

    <Card className="mb-6"><CardHeader><CardTitle>Create payment order</CardTitle></CardHeader><CardContent>
      {receivers.length ? <form action={createManualTransferOrder} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Receiver"><Select name="receiverId" required><option value="">Select receiver…</option>{receivers.map((r) => <option key={r.id} value={r.id}>{r.label} — {r.rail.replaceAll("_", " ")} · {r.currency}</option>)}</Select></Field>
        <Field label="Payer / partner name"><Input name="payerName" placeholder="Client or partner sending the funds" /></Field>
        <Field label="Client (optional)"><Select name="clientId" defaultValue=""><option value="">— None —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>)}</Select></Field>
        <Field label="Case (optional)"><Select name="caseId" defaultValue=""><option value="">— None —</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}</Select></Field>
        <Field label="Origin country"><Input name="originCountry" required placeholder="Country where money is sent" /></Field>
        <Field label="Destination country"><Input name="destinationCountry" required placeholder="Receiver country" /></Field>
        <Field label="Amount to send"><Input name="sendAmount" type="number" min="0.01" step="0.01" required /></Field>
        <Field label="Sending currency"><Input name="sendCurrency" defaultValue="USD" maxLength={3} required /></Field>
        <Field label="Receiving currency"><Input name="receiveCurrency" defaultValue="USD" maxLength={3} required /></Field>
        <Field label="Exchange rate"><Input name="exchangeRate" type="number" min="0.0000001" step="0.000001" defaultValue="1" required /></Field>
        <Field label="Instruction language"><Input name="language" defaultValue="French" placeholder="French, Spanish, Haitian Creole, Arabic…" /></Field>
        <Field label="Payment purpose"><Input name="purpose" defaultValue="Commercial payment" placeholder="Invoice, service, reservation…" /></Field>
        <div className="md:col-span-2 xl:col-span-4 rounded-xl border border-line bg-surface p-4 text-xs text-muted2">Fees come from the selected receiver configuration. Net received = (amount sent − fees) × exchange rate. Instructions explicitly describe the transfer as a truthful business/commercial payment and never instruct the sender to disguise it as personal.</div>
        <div className="md:col-span-2 xl:col-span-4"><Button variant="primary">Generate payment order</Button></div>
      </form> : <div className="text-sm text-muted2">No active receiver is configured. <Link href="/app/finance/manual-transfers/receivers" className="text-electric hover:underline">Configure a Western Union or bank receiver first.</Link></div>}
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Recent orders</CardTitle></CardHeader><CardContent className="p-0">{orders.length ? <div className="divide-y divide-line">{orders.map((o) => <Link key={o.id} href={`/app/finance/manual-transfers/${o.id}`} className="grid gap-2 px-5 py-4 hover:bg-surface md:grid-cols-[1.3fr_1fr_1fr_1fr_auto]"><div><div className="registry-id font-medium">{o.orderNumber}</div><div className="text-xs text-muted2">{o.receiverSnapshot.label} · {o.receiverSnapshot.rail.replaceAll("_", " ")}</div></div><div className="text-sm">{o.originCountry} → {o.destinationCountry}</div><div><div className="text-sm font-medium">{formatMoney(o.sendAmount, o.sendCurrency)}</div><div className="text-xs text-muted2">fees {formatMoney(o.feeAmount, o.sendCurrency)}</div></div><div><div className="text-sm font-medium">{formatMoney(o.receiveAmount, o.receiveCurrency)}</div><div className="text-xs text-muted2">net received</div></div><span className="self-start rounded-full bg-surface px-2 py-1 text-xs">{o.status}</span></Link>)}</div> : <p className="p-5 text-sm text-muted2">No manual transfer orders yet.</p>}</CardContent></Card>
  </div>;
}
