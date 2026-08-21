import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/utils";
import { getPaymentCoreMetaMap, paymentBalance } from "@/lib/finance-payment-core";
import { CircleDollarSign, Clock3, CreditCard, FileCheck2, Search } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUSES = ["PENDING","CONFIRMED","REJECTED","REFUNDED","PARTIALLY_REFUNDED"];
const METHODS = ["ZELLE","STRIPE","PAYPAL","MERCADO_PAGO","BANK_TRANSFER","CASH","MONCASH","OTHER"];

export default async function PaymentsPage({ searchParams }: { searchParams: { status?: string; method?: string; currency?: string; q?: string } }) {
  await requirePermission("PAYMENT_READ");
  const status = STATUSES.includes(String(searchParams.status)) ? String(searchParams.status) : "ALL";
  const method = METHODS.includes(String(searchParams.method)) ? String(searchParams.method) : "ALL";
  const currency = String(searchParams.currency || "").trim().toUpperCase().slice(0, 3);
  const q = String(searchParams.q || "").trim();

  const where: any = {
    ...(status !== "ALL" ? { status } : {}),
    ...(method !== "ALL" ? { method } : {}),
    ...(currency ? { currency } : {}),
    ...(q ? { OR: [
      { reference: { contains: q, mode: "insensitive" } },
      { providerRef: { contains: q, mode: "insensitive" } },
      { client: { firstName: { contains: q, mode: "insensitive" } } },
      { client: { lastName: { contains: q, mode: "insensitive" } } },
      { client: { internalId: { contains: q, mode: "insensitive" } } },
      { case: { caseNumber: { contains: q, mode: "insensitive" } } },
    ] } : {}),
  };

  const [payments, pendingCount, confirmedCount, confirmedByCurrency, proofCount] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }], take: 200, include: { client: true, case: true, files: { where: { category: "PAYMENT_PROOF", archivedAt: null }, select: { id: true } } } }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.payment.count({ where: { status: "CONFIRMED" } }),
    prisma.payment.groupBy({ by: ["currency"], where: { status: "CONFIRMED" }, _sum: { amount: true }, orderBy: { currency: "asc" } }),
    prisma.file.count({ where: { isVault: false, archivedAt: null, category: "PAYMENT_PROOF", paymentId: { not: null } } }),
  ]);
  const metaMap = await getPaymentCoreMetaMap(payments.map((p) => p.id));
  const collected = confirmedByCurrency.length ? confirmedByCurrency.map((r) => `${r.currency} ${Number(r._sum.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(" · ") : "—";

  return (
    <div>
      <PageHeader title="Payments" subtitle="Finance register for money received, approvals, balances, evidence and receipts." actionHref="/app/finance/payments/new" actionLabel="Record payment" />

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={CircleDollarSign} label="Confirmed collected" value={collected} hint={`${confirmedCount} confirmed payments`} />
        <Metric icon={Clock3} label="Pending approval" value={String(pendingCount)} hint="Awaiting finance validation" />
        <Metric icon={FileCheck2} label="Payment proofs" value={String(proofCount)} hint="Evidence linked to payments" />
        <Metric icon={CreditCard} label="Current result set" value={String(payments.length)} hint="Up to 200 matching records" />
      </div>

      <form className="mb-5 grid gap-2 rounded-xl border border-line bg-white p-3 md:grid-cols-[minmax(220px,1fr)_170px_180px_120px_auto]">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted2" /><Input name="q" defaultValue={q} placeholder="Reference, client, case, transaction ID…" className="pl-9" /></div>
        <Select name="status" defaultValue={status}><option value="ALL">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</Select>
        <Select name="method" defaultValue={method}><option value="ALL">All methods</option>{METHODS.map((m) => <option key={m} value={m}>{m.replaceAll("_"," ")}</option>)}</Select>
        <Input name="currency" defaultValue={currency} placeholder="Currency" maxLength={3} />
        <Button variant="outline">Apply</Button>
      </form>

      {payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No matching payments" description="Adjust the filters or record a new payment." actionHref="/app/finance/payments/new" actionLabel="Record payment" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <Table>
            <THead><tr><TH>Reference</TH><TH>Client / service</TH><TH>Received</TH><TH>Expected / balance</TH><TH>Method</TH><TH>Proof</TH><TH>Status</TH><TH>Date</TH></tr></THead>
            <tbody>
              {payments.map((p) => {
                const meta = metaMap.get(p.id);
                const expected = meta?.expectedAmount ?? null;
                const balance = paymentBalance(Number(p.amount), expected);
                return <TR key={p.id}>
                  <TD><Link href={`/app/finance/payments/${p.id}`} className="registry-id hover:text-electric">{p.reference}</Link>{p.providerRef ? <div className="mt-1 max-w-40 truncate text-[11px] text-muted2">{p.providerRef}</div> : null}</TD>
                  <TD><Link href={`/app/clients/${p.clientId}`} className="hover:text-electric">{p.client.firstName} {p.client.lastName}</Link><div className="mt-1 text-[11px] text-muted2">{meta?.serviceLabel || p.case?.caseNumber || "No service specified"}</div></TD>
                  <TD className="font-medium">{formatMoney(Number(p.amount), p.currency)}</TD>
                  <TD>{expected == null ? <span className="text-muted2">—</span> : <><div>{formatMoney(expected, p.currency)}</div><div className={`text-[11px] ${balance && balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{balance && balance > 0 ? `${formatMoney(balance, p.currency)} due` : balance && balance < 0 ? `${formatMoney(Math.abs(balance), p.currency)} overpaid` : "Paid in full"}</div></>}</TD>
                  <TD className="text-muted2">{p.method.replaceAll("_", " ")}</TD>
                  <TD>{p.files.length ? <span className="text-xs font-medium text-emerald-700">{p.files.length} attached</span> : <span className="text-xs text-muted2">Missing</span>}</TD>
                  <TD><StatusBadge status={p.status} /></TD>
                  <TD className="text-muted2">{formatDate(p.paidAt)}</TD>
                </TR>;
              })}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof CreditCard; label: string; value: string; hint: string }) {
  return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-3 h-5 w-5 text-electric" /><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div><div className="mt-1 text-xs text-muted2">{hint}</div></div>;
}
