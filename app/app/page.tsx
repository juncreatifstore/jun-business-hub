import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge, Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    newClients,
    openCases,
    monthPayments,
    pendingRefunds,
    activeSignatures,
    unreadWhatsApp,
    recentDocs,
    overdueTasks,
    recentActivity,
    paymentsByMonth,
    recentCases,
  ] = await Promise.all([
    prisma.client.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.case.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL"] } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: "CONFIRMED", paidAt: { gte: monthStart } },
    }),
    prisma.refund.count({
      where: { status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_PAID"] } },
    }),
    prisma.signatureRequest.count({
      where: { status: { in: ["READY_FOR_SIGNATURE", "SENT", "VIEWED", "PARTIALLY_SIGNED"] } },
    }),
    prisma.activity.count({ where: { type: "WHATSAPP_INBOUND_UNREAD" } }),
    prisma.document.findMany({ orderBy: { updatedAt: "desc" }, take: 5, include: { client: true } }),
    prisma.task.findMany({
      where: { status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, dueDate: { lt: now } },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { assignee: true },
    }),
    prisma.activity.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { user: true } }),
    prisma.payment.findMany({
      where: { status: "CONFIRMED", paidAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
      select: { amount: true, paidAt: true },
    }),
    prisma.case.findMany({ orderBy: { updatedAt: "desc" }, take: 5, include: { client: true } }),
  ]);

  const months: { label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleString("fr-FR", { month: "short" }), total: 0 });
  }
  for (const p of paymentsByMonth) {
    if (!p.paidAt) continue;
    const idx =
      5 - (now.getMonth() - p.paidAt.getMonth() + 12 * (now.getFullYear() - p.paidAt.getFullYear()));
    if (idx >= 0 && idx < 6) months[idx].total += Number(p.amount);
  }
  const max = Math.max(1, ...months.map((m) => m.total));
  const monthTotal = Number(monthPayments._sum.amount ?? 0);

  const period = `${monthStart.toLocaleDateString("fr-FR", { day: "numeric" })}–${now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;

  const metrics: { label: string; value: string; href: string; note: string }[] = [
    { label: "Nouveaux clients", value: String(newClients), href: "/app/clients", note: "ce mois" },
    { label: "Dossiers ouverts", value: String(openCases), href: "/app/cases", note: "en cours" },
    {
      label: "Encaissements",
      value: formatMoney(monthTotal),
      href: "/app/finance/payments",
      note: "confirmés ce mois",
    },
    {
      label: "Remboursements",
      value: String(pendingRefunds),
      href: "/app/finance/refunds",
      note: "à traiter",
    },
    { label: "Signatures", value: String(activeSignatures), href: "/app/signatures", note: "en attente" },
    {
      label: "WhatsApp",
      value: String(unreadWhatsApp),
      href: "/app/whatsapp/inbox?filter=unread",
      note: "non lus",
    },
  ];

  const queue: { href: string; label: string; value: number }[] = [
    { href: "/app/signatures", label: "Signatures à finaliser", value: activeSignatures },
    {
      href: "/app/whatsapp/inbox?filter=unread",
      label: "Conversations WhatsApp non lues",
      value: unreadWhatsApp,
    },
    { href: "/app/tasks", label: "Tâches en retard", value: overdueTasks.length },
    { href: "/app/finance/refunds", label: "Remboursements en attente", value: pendingRefunds },
  ];

  return (
    <div className="mx-auto max-w-[1650px]">
      <PageHeader title={`Bonjour, ${user.firstName}`} subtitle={`Activité du ${period}.`} />

      {/* Key figures — one strip, hairline-separated. Numbers carry the page. */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-card sm:grid-cols-3 2xl:grid-cols-6">
        {metrics.map((m, i) => (
          <Link
            key={m.label}
            href={m.href}
            className="group min-w-0 bg-surface-1 px-4 py-4 transition-colors hover:bg-surface-2 sm:px-5"
          >
            <p className="truncate text-xs text-ink-3">{m.label}</p>
            <p className="mt-1 truncate font-display text-[28px] font-medium leading-none tracking-tight text-ink tabular-nums sm:text-[32px]">
              {m.value}
            </p>
            <p className="mt-2 truncate text-xs text-ink-2">{m.note}</p>
          </Link>
        ))}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,.75fr)]">
        {/* Six-month bar chart */}
        <section className="min-w-0 rounded-xl border border-line bg-surface-1 shadow-card">
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">Encaissements confirmés</h2>
            <p className="text-xs text-ink-3">6 derniers mois</p>
          </div>
          <div className="p-5">
            <div className="flex h-56 items-end gap-3 border-b border-line pb-2 sm:h-64 sm:gap-5">
              {months.map((m, i) => {
                const current = i === months.length - 1;
                return (
                  <div key={m.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
                    <div className="flex flex-1 items-end">
                      <div
                        className={`relative w-full rounded-t ${current ? "bg-accent" : "bg-accent/40"}`}
                        style={{ height: `${Math.max(2, (m.total / max) * 100)}%` }}
                      >
                        {m.total > 0 ? (
                          <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap font-mono text-2xs text-ink-2 tabular-nums md:block">
                            {formatMoney(m.total)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`truncate text-center text-xs capitalize ${current ? "font-medium text-ink" : "text-ink-3"}`}
                    >
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Work queue */}
        <section className="rounded-xl border border-line bg-surface-1 shadow-card">
          <div className="border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">À traiter</h2>
          </div>
          <div className="divide-y divide-line">
            {queue.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-surface-2"
              >
                <span className={q.value > 0 ? "text-ink" : "text-ink-3"}>{q.label}</span>
                <Badge tone={q.value > 0 ? "warning" : "neutral"} className="tabular-nums">
                  {q.value}
                </Badge>
              </Link>
            ))}
            {user.role === "SUPER_ADMIN" ? (
              <Link
                href="/app/company-funds"
                className="flex items-center justify-between px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
              >
                Company Funds
                <ChevronRight className="h-4 w-4 text-ink-3" />
              </Link>
            ) : null}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        {/* Recent cases */}
        <section className="overflow-hidden rounded-xl border border-line bg-surface-1 shadow-card">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">Dossiers récents</h2>
            <Link href="/app/cases" className="text-xs font-medium text-accent hover:underline">
              Voir tous les dossiers
            </Link>
          </div>
          <div className="divide-y divide-line md:hidden">
            {recentCases.map((c) => (
              <Link key={c.id} href={`/app/cases/${c.id}`} className="block px-5 py-3 active:bg-surface-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm text-ink">{c.caseNumber}</div>
                    <div className="mt-0.5 truncate text-xs text-ink-2">
                      {c.client ? `${c.client.firstName} ${c.client.lastName}` : "Client non lié"}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-1.5 text-xs text-ink-3">{formatDateTime(c.updatedAt)}</div>
              </Link>
            ))}
            {recentCases.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-3">Aucun dossier récent.</p>
            ) : null}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs font-medium text-ink-2">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Client</th>
                  <th className="px-5 py-2.5 font-medium">Dossier</th>
                  <th className="px-5 py-2.5 font-medium">Statut</th>
                  <th className="px-5 py-2.5 text-right font-medium">Mise à jour</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recentCases.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/70">
                    <td className="px-5 py-3 text-ink">
                      {c.client ? `${c.client.firstName} ${c.client.lastName}` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/app/cases/${c.id}`} className="font-mono text-ink hover:text-accent">
                        {c.caseNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-ink-3 tabular-nums">
                      {formatDateTime(c.updatedAt)}
                    </td>
                  </tr>
                ))}
                {recentCases.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-ink-3">
                      Aucun dossier récent.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {/* Activity */}
        <section className="rounded-xl border border-line bg-surface-1 shadow-card">
          <div className="border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">Activité récente</h2>
          </div>
          <div className="divide-y divide-line">
            {recentActivity.map((a) => (
              <div key={a.id} className="px-5 py-3">
                <p className="line-clamp-2 text-sm leading-5 text-ink">{humanizeActivity(a.message)}</p>
                <p className="mt-0.5 truncate text-xs text-ink-3">
                  {a.user ? `${a.user.firstName} ${a.user.lastName} · ` : ""}
                  {formatDateTime(a.createdAt)}
                </p>
              </div>
            ))}
            {recentActivity.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-3">L’activité apparaîtra ici.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Overdue tasks */}
        <section className="rounded-xl border border-line bg-surface-1 shadow-card">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">Tâches en retard</h2>
            <Link href="/app/tasks" className="text-xs font-medium text-accent hover:underline">
              Toutes les tâches
            </Link>
          </div>
          <div className="divide-y divide-line">
            {overdueTasks.map((t) => (
              <div key={t.id} className="px-5 py-3">
                <Link
                  href={`/app/tasks?focus=${t.id}`}
                  className="block truncate text-sm font-medium text-ink hover:text-accent"
                >
                  {t.title}
                </Link>
                <p className="mt-0.5 truncate text-xs text-ink-3">
                  {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "Non assignée"} · échéance{" "}
                  <span className="text-danger">{formatDateTime(t.dueDate)}</span>
                </p>
              </div>
            ))}
            {overdueTasks.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-3">Aucune tâche en retard.</p>
            ) : null}
          </div>
        </section>

        {/* Recent documents */}
        <section className="rounded-xl border border-line bg-surface-1 shadow-card">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">Documents récents</h2>
            <Link href="/app/documents" className="text-xs font-medium text-accent hover:underline">
              Tous les documents
            </Link>
          </div>
          <div className="divide-y divide-line">
            {recentDocs.map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/app/documents/${d.id}`}
                    className="block truncate text-sm font-medium text-ink hover:text-accent"
                  >
                    {d.title}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-ink-3">
                    <span className="font-mono">{d.documentId}</span>
                    {d.client ? ` · ${d.client.firstName} ${d.client.lastName}` : ""}
                  </p>
                </div>
                <StatusBadge status={d.status} />
              </div>
            ))}
            {recentDocs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-3">Aucun document récent.</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Activity messages are written by integrations and may carry provider
 *  identifiers (WhatsApp `wamid.…`, envelope ids). People don't need those. */
function humanizeActivity(message: string) {
  return message
    .replace(/\s*·?\s*wamid\.[A-Za-z0-9=_-]+/g, "")
    .replace(/\s*·\s*$/, "")
    .trim();
}
