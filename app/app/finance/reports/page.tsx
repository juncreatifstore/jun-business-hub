import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requirePermission("PAYMENT_READ");
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [confirmed, pending, refundsPaid, refundsOpen, byMethod] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { status: "CONFIRMED", paidAt: { gte: yearStart } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { status: "PENDING" } }),
    prisma.refund.aggregate({ _sum: { amount: true }, _count: true, where: { status: "PAID" } }),
    prisma.refund.aggregate({ _sum: { amount: true }, _count: true, where: { status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_PAID"] } } }),
    prisma.payment.groupBy({ by: ["method"], _sum: { amount: true }, _count: true, where: { status: "CONFIRMED", paidAt: { gte: yearStart } } }),
  ]);

  const stats = [
    { label: `Confirmed in ${yearStart.getFullYear()}`, value: formatMoney(Number(confirmed._sum.amount ?? 0)), sub: `${confirmed._count} payments` },
    { label: "Pending confirmation", value: formatMoney(Number(pending._sum.amount ?? 0)), sub: `${pending._count} payments` },
    { label: "Refunds paid out", value: formatMoney(Number(refundsPaid._sum.amount ?? 0)), sub: `${refundsPaid._count} refunds` },
    { label: "Refund exposure", value: formatMoney(Number(refundsOpen._sum.amount ?? 0)), sub: `${refundsOpen._count} in progress` },
  ];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Year-to-date view of money in and refund exposure." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}><CardContent className="p-4">
            <p className="text-xs text-muted2">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold">{s.value}</p>
            <p className="text-xs text-muted2">{s.sub}</p>
          </CardContent></Card>
        ))}
      </div>
      <Card className="mt-4 max-w-xl">
        <CardHeader><CardTitle>Confirmed by method (YTD)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {byMethod.length === 0 ? <p className="p-5 text-sm text-muted2">No confirmed payments yet this year.</p> : (
            <ul className="divide-y divide-line">
              {byMethod.map((m) => (
                <li key={m.method} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span>{m.method.replaceAll("_", " ")}</span>
                  <span className="font-medium">{formatMoney(Number(m._sum.amount ?? 0))} <span className="text-xs text-muted2">({m._count})</span></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
