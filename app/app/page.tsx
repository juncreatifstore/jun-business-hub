import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDateTime } from "@/lib/utils";
import {
  Users,
  FolderKanban,
  CreditCard,
  Undo2,
  CheckSquare,
  FileText,
  ArrowUpRight,
  TrendingUp,
  Activity,
  ChevronRight,
  MessageCircle,
  PenLine,
} from "lucide-react";

export const dynamic = "force-dynamic";

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  href,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: "blue" | "violet" | "green" | "amber" | "cyan" | "rose";
}) {
  const tones = {
    blue: "bg-blue-500/15 text-accent ring-blue-500/20",
    violet: "bg-violet-500/15 text-violet-400 ring-violet-500/20",
    green: "bg-emerald-500/15 text-success ring-emerald-500/20",
    amber: "bg-amber-500/15 text-warning ring-amber-500/20",
    cyan: "bg-cyan-500/15 text-cyan-400 ring-cyan-500/20",
    rose: "bg-rose-500/15 text-rose-400 ring-rose-500/20",
  };
  return (
    <Link
      href={href}
      className="group min-w-0 rounded-2xl border border-line bg-surface-1 p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400/25 hover:bg-surface-1 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset sm:h-10 sm:w-10 ${tones[tone]}`}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        <ArrowUpRight className="h-4 w-4 text-ink-2 transition group-hover:text-ink-2" />
      </div>
      <p className="mt-3 truncate text-[11px] font-medium text-ink-3 sm:mt-4 sm:text-xs">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">{value}</p>
      <p className="mt-2 line-clamp-2 text-[10px] text-success sm:text-[11px]">{detail}</p>
    </Link>
  );
}

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

  return (
    <div className="-mx-3 -mt-3 min-h-[calc(100dvh-4rem)] overflow-x-hidden bg-surface-1 px-3 pb-28 pt-3 text-ink sm:-m-6 sm:p-6 lg:p-7">
      <div className="mx-auto max-w-[1650px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent sm:text-[11px] sm:tracking-[0.2em]">
              JUN Business Hub · Control Center
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Dashboard</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-3 sm:text-sm">
              Bienvenue, {user.firstName}. Clients, opérations, finance, signatures et communications en un
              coup d’œil.
            </p>
          </div>
          <div className="w-fit rounded-xl border border-line bg-surface-1 px-3 py-2 text-[11px] text-ink-3 sm:px-4 sm:text-xs">
            {monthStart.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} —{" "}
            {now.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            icon={Users}
            label="Nouveaux clients"
            value={String(newClients)}
            detail="Activité du mois"
            href="/app/clients"
            tone="blue"
          />
          <MetricCard
            icon={FolderKanban}
            label="Dossiers ouverts"
            value={String(openCases)}
            detail="Suivi opérationnel actif"
            href="/app/cases"
            tone="violet"
          />
          <MetricCard
            icon={CreditCard}
            label="Paiements confirmés"
            value={formatMoney(monthTotal)}
            detail="Encaissements du mois"
            href="/app/finance/payments"
            tone="green"
          />
          <MetricCard
            icon={Undo2}
            label="Remboursements"
            value={String(pendingRefunds)}
            detail="À surveiller ou exécuter"
            href="/app/finance/refunds"
            tone="amber"
          />
          <MetricCard
            icon={PenLine}
            label="Signatures actives"
            value={String(activeSignatures)}
            detail="En attente de finalisation"
            href="/app/signatures"
            tone="rose"
          />
          <MetricCard
            icon={MessageCircle}
            label="WhatsApp non lus"
            value={String(unreadWhatsApp)}
            detail="Conversations à traiter"
            href="/app/whatsapp/inbox?filter=unread"
            tone="cyan"
          />
        </div>

        <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,.75fr)]">
          <section className="min-w-0 rounded-2xl border border-line bg-surface-1 shadow-sm">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink">Aperçu des opérations</h2>
                <p className="mt-0.5 truncate text-[11px] text-ink-3 sm:text-xs">
                  Paiements confirmés · 6 derniers mois
                </p>
              </div>
              <TrendingUp className="h-4 w-4 shrink-0 text-accent" />
            </div>
            <div className="p-3 sm:p-5">
              <div className="flex h-44 items-end gap-1.5 border-b border-line pb-2 sm:h-64 sm:gap-3">
                {months.map((m) => (
                  <div key={m.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
                    <div className="flex flex-1 items-end">
                      <div
                        className="relative w-full rounded-t-md bg-gradient-to-t from-blue-600/45 to-blue-400/90 shadow-[0_0_20px_rgba(59,130,246,.08)] sm:rounded-t-lg"
                        style={{ height: `${Math.max(5, (m.total / max) * 100)}%` }}
                      >
                        <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-[9px] text-ink-3 md:block">
                          {m.total > 0 ? formatMoney(m.total) : ""}
                        </span>
                      </div>
                    </div>
                    <span className="truncate text-center text-[9px] capitalize text-ink-3 sm:text-[11px]">
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-line bg-surface-1 shadow-sm">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5 sm:py-4">
              <div>
                <h2 className="text-sm font-semibold text-ink">À traiter maintenant</h2>
                <p className="mt-0.5 text-[11px] text-ink-3 sm:text-xs">Files de travail prioritaires</p>
              </div>
              <Activity className="h-4 w-4 text-success" />
            </div>
            <div className="space-y-2.5 p-4 sm:space-y-3 sm:p-5">
              <QuickStatus href="/app/signatures" label="Signatures" value={activeSignatures} tone="rose" />
              <QuickStatus
                href="/app/whatsapp/inbox?filter=unread"
                label="WhatsApp non lus"
                value={unreadWhatsApp}
                tone="cyan"
              />
              <QuickStatus
                href="/app/tasks"
                label="Tâches en retard"
                value={overdueTasks.length}
                tone="amber"
              />
              <QuickStatus
                href="/app/finance/refunds"
                label="Remboursements"
                value={pendingRefunds}
                tone="amber"
              />
              {user.role === "SUPER_ADMIN" ? (
                <Link
                  href="/app/company-funds"
                  className="flex items-center justify-between rounded-xl border border-blue-500/15 bg-blue-500/[0.06] px-3.5 py-3 text-sm text-accent hover:bg-blue-500/[0.1] sm:px-4"
                >
                  <span>Company Funds</span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </section>
        </div>

        <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
          <section className="overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-sm">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5 sm:py-4">
              <div>
                <h2 className="text-sm font-semibold text-ink">Dossiers récents</h2>
                <p className="mt-0.5 text-[11px] text-ink-3 sm:text-xs">Dernières mises à jour CRM</p>
              </div>
              <Link href="/app/cases" className="text-xs text-accent hover:text-accent">
                Voir tout
              </Link>
            </div>
            <div className="divide-y divide-line md:hidden">
              {recentCases.map((c) => (
                <Link
                  key={c.id}
                  href={`/app/cases/${c.id}`}
                  className="block px-4 py-3.5 active:bg-ink/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{c.caseNumber}</div>
                      <div className="mt-1 truncate text-xs text-ink-3">
                        {c.client ? `${c.client.firstName} ${c.client.lastName}` : "Client non lié"}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-medium text-accent">
                      {c.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="mt-2 text-[10px] text-ink-2">Mis à jour {formatDateTime(c.updatedAt)}</div>
                </Link>
              ))}
              {recentCases.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-ink-3">Aucun dossier récent.</div>
              ) : null}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-ink-2">
                  <tr>
                    <th className="px-5 py-3 font-medium">Client</th>
                    <th className="px-5 py-3 font-medium">Dossier</th>
                    <th className="px-5 py-3 font-medium">Statut</th>
                    <th className="px-5 py-3 font-medium">Mise à jour</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recentCases.map((c) => (
                    <tr key={c.id} className="transition hover:bg-ink/[0.025]">
                      <td className="px-5 py-3 text-ink-2">
                        {c.client ? `${c.client.firstName} ${c.client.lastName}` : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <Link href={`/app/cases/${c.id}`} className="font-medium text-ink hover:text-accent">
                          {c.caseNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-medium text-accent">
                          {c.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-ink-3">{formatDateTime(c.updatedAt)}</td>
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
          <section className="rounded-2xl border border-line bg-surface-1 shadow-sm">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5 sm:py-4">
              <div>
                <h2 className="text-sm font-semibold text-ink">Activité récente</h2>
                <p className="mt-0.5 text-[11px] text-ink-3 sm:text-xs">Ce qui vient de se passer</p>
              </div>
              <Activity className="h-4 w-4 text-accent" />
            </div>
            <div className="divide-y divide-line">
              {recentActivity.map((a) => (
                <div key={a.id} className="flex gap-3 px-4 py-3.5 sm:px-5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,.55)]" />
                  <div className="min-w-0">
                    <p className="line-clamp-3 text-xs leading-5 text-ink-2">{a.message}</p>
                    <p className="mt-0.5 truncate text-[10px] text-ink-2">
                      {a.user ? `${a.user.firstName} ${a.user.lastName} · ` : ""}
                      {formatDateTime(a.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-ink-3">L’activité apparaîtra ici.</p>
              ) : null}
            </div>
          </section>
        </div>

        <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-line bg-surface-1 shadow-sm">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5 sm:py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CheckSquare className="h-4 w-4 text-rose-400" /> Tâches en retard
              </h2>
              <Link href="/app/tasks" className="text-xs text-accent">
                Voir tout
              </Link>
            </div>
            <div className="divide-y divide-line">
              {overdueTasks.map((t) => (
                <div key={t.id} className="px-4 py-3.5 sm:px-5">
                  <Link
                    href={`/app/tasks?focus=${t.id}`}
                    className="block truncate text-sm font-medium text-ink hover:text-accent"
                  >
                    {t.title}
                  </Link>
                  <p className="mt-1 truncate text-[11px] text-ink-2">
                    {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "Non assigné"} ·{" "}
                    {formatDateTime(t.dueDate)}
                  </p>
                </div>
              ))}
              {overdueTasks.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-ink-3">Aucune tâche en retard.</p>
              ) : null}
            </div>
          </section>
          <section className="rounded-2xl border border-line bg-surface-1 shadow-sm">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5 sm:py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <FileText className="h-4 w-4 text-violet-400" /> Documents récents
              </h2>
              <Link href="/app/documents" className="text-xs text-accent">
                Voir tout
              </Link>
            </div>
            <div className="divide-y divide-line">
              {recentDocs.map((d) => (
                <div key={d.id} className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <Link
                      href={`/app/documents/${d.id}`}
                      className="block truncate text-sm font-medium text-ink hover:text-accent"
                    >
                      {d.title}
                    </Link>
                    <p className="mt-1 truncate text-[11px] text-ink-2">
                      {d.documentId}
                      {d.client ? ` · ${d.client.firstName} ${d.client.lastName}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-ink/[0.05] px-2 py-1 text-[9px] text-ink-3 sm:px-2.5 sm:text-[10px]">
                    {d.status.replaceAll("_", " ")}
                  </span>
                </div>
              ))}
              {recentDocs.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-ink-3">Aucun document récent.</p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function QuickStatus({
  href,
  label,
  value,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  tone: "rose" | "cyan" | "amber";
}) {
  const cls =
    tone === "rose"
      ? "border-rose-500/15 bg-rose-500/[0.05] text-rose-300"
      : tone === "cyan"
        ? "border-cyan-500/15 bg-cyan-500/[0.05] text-cyan-300"
        : "border-amber-500/15 bg-amber-500/[0.05] text-warning";
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-sm transition hover:bg-ink/[0.05] sm:px-4 ${cls}`}
    >
      <span className="truncate">{label}</span>
      <span className="ml-3 rounded-full bg-black/20 px-2 py-0.5 text-xs font-semibold">{value}</span>
    </Link>
  );
}
