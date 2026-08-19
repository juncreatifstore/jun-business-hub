import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { Users, FolderKanban, CreditCard, Undo2, PenTool, FileText, CheckSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const now = new Date();

  const [
    newClients, openCases, monthPayments, pendingRefunds, contractsToSign,
    recentDocs, overdueTasks, recentActivity, paymentsByMonth,
  ] = await Promise.all([
    prisma.client.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.case.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL"] } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "CONFIRMED", paidAt: { gte: monthStart } } }),
    prisma.refund.count({ where: { status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_PAID"] } } }),
    prisma.signatureRequest.count({ where: { status: { in: ["READY_FOR_SIGNATURE", "SENT", "VIEWED", "PARTIALLY_SIGNED"] } } }),
    prisma.document.findMany({ orderBy: { updatedAt: "desc" }, take: 5, include: { client: true } }),
    prisma.task.findMany({
      where: { status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, dueDate: { lt: now } },
      orderBy: { dueDate: "asc" }, take: 5, include: { assignee: true },
    }),
    prisma.activity.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: true } }),
    prisma.payment.findMany({
      where: { status: "CONFIRMED", paidAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
      select: { amount: true, paidAt: true },
    }),
  ]);

  // 6-month revenue series for the chart (computed server-side, rendered as pure SVG-free bars)
  const months: { label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleString("en-US", { month: "short" }), total: 0 });
  }
  for (const p of paymentsByMonth) {
    const idx = 5 - (now.getMonth() - p.paidAt.getMonth() + 12 * (now.getFullYear() - p.paidAt.getFullYear()));
    if (idx >= 0 && idx < 6) months[idx].total += Number(p.amount);
  }
  const max = Math.max(1, ...months.map((m) => m.total));

  const stats = [
    { icon: Users, label: "New clients this month", value: String(newClients), href: "/app/clients" },
    { icon: FolderKanban, label: "Open cases", value: String(openCases), href: "/app/cases" },
    { icon: CreditCard, label: "Confirmed this month", value: formatMoney(Number(monthPayments._sum.amount ?? 0)), href: "/app/finance/payments" },
    { icon: Undo2, label: "Refunds in progress", value: String(pendingRefunds), href: "/app/finance/refunds" },
    { icon: PenTool, label: "Awaiting signature", value: String(contractsToSign), href: "/app/signatures" },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold">Good {now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening"}, {user.firstName}</h1>
      <p className="mt-0.5 text-sm text-muted2">Here is where JUN stands right now.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition hover:border-electric/40">
              <CardContent className="p-4">
                <s.icon className="h-4 w-4 text-electric" />
                <p className="mt-3 text-2xl font-semibold tracking-tight">{s.value}</p>
                <p className="mt-0.5 text-xs text-muted2">{s.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Confirmed payments — last 6 months</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-44 items-end gap-3">
              {months.map((m) => (
                <div key={m.label} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10px] text-muted2">{m.total > 0 ? formatMoney(m.total) : ""}</span>
                  <div
                    className="w-full rounded-t-md bg-electric/80"
                    style={{ height: `${Math.max(3, (m.total / max) * 130)}px` }}
                  />
                  <span className="text-xs text-muted2">{m.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckSquare className="h-4 w-4 text-red-600" /> Overdue tasks</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {overdueTasks.length === 0 ? (
              <p className="p-5 text-sm text-muted2">Nothing overdue. Well kept.</p>
            ) : (
              <ul className="divide-y divide-line">
                {overdueTasks.map((t) => (
                  <li key={t.id} className="px-5 py-3">
                    <Link href={`/app/tasks?focus=${t.id}`} className="text-sm font-medium hover:text-electric">{t.title}</Link>
                    <p className="text-xs text-muted2">
                      {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "Unassigned"} · due {formatDateTime(t.dueDate)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-electric" /> Recent documents</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentDocs.length === 0 ? (
              <p className="p-5 text-sm text-muted2">No documents yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recentDocs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/app/documents/${d.id}`} className="block truncate text-sm font-medium hover:text-electric">{d.title}</Link>
                      <p className="registry-id text-muted2">{d.documentId}{d.client ? ` · ${d.client.firstName} ${d.client.lastName}` : ""}</p>
                    </div>
                    <StatusBadge status={d.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent className="p-0">
            {recentActivity.length === 0 ? (
              <p className="p-5 text-sm text-muted2">Activity will appear here as the team works.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recentActivity.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <p className="text-sm">{a.message}</p>
                    <p className="text-xs text-muted2">
                      {a.user ? `${a.user.firstName} ${a.user.lastName} · ` : ""}{formatDateTime(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
