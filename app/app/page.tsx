import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDateTime } from "@/lib/utils";
import {
  Users, FolderKanban, CreditCard, Undo2, CheckSquare, FileText,
  ArrowUpRight, TrendingUp, WalletCards, Activity, ChevronRight,
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
  tone: "blue" | "violet" | "green" | "amber";
}) {
  const tones = {
    blue: "bg-blue-500/15 text-blue-400 ring-blue-500/20",
    violet: "bg-violet-500/15 text-violet-400 ring-violet-500/20",
    green: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20",
    amber: "bg-amber-500/15 text-amber-400 ring-amber-500/20",
  };
  return (
    <Link href={href} className="group rounded-2xl border border-white/[0.07] bg-[#101827] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400/25 hover:bg-[#121d2f]">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
        <ArrowUpRight className="h-4 w-4 text-slate-600 transition group-hover:text-slate-300" />
      </div>
      <p className="mt-4 text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-[11px] text-emerald-400">{detail}</p>
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    newClients, openCases, monthPayments, pendingRefunds, recentDocs,
    overdueTasks, recentActivity, paymentsByMonth, recentCases,
  ] = await Promise.all([
    prisma.client.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.case.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL"] } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "CONFIRMED", paidAt: { gte: monthStart } } }),
    prisma.refund.count({ where: { status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_PAID"] } } }),
    prisma.document.findMany({ orderBy: { updatedAt: "desc" }, take: 5, include: { client: true } }),
    prisma.task.findMany({
      where: { status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, dueDate: { lt: now } },
      orderBy: { dueDate: "asc" }, take: 5, include: { assignee: true },
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
    const idx = 5 - (now.getMonth() - p.paidAt.getMonth() + 12 * (now.getFullYear() - p.paidAt.getFullYear()));
    if (idx >= 0 && idx < 6) months[idx].total += Number(p.amount);
  }
  const max = Math.max(1, ...months.map((m) => m.total));
  const monthTotal = Number(monthPayments._sum.amount ?? 0);

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-[#070c14] p-4 text-slate-100 sm:-m-6 sm:p-6 lg:p-7">
      <div className="mx-auto max-w-[1650px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400">JUN Business Hub</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Bienvenue, {user.firstName}. Voici l’état actuel des opérations.</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-[#0e1624] px-4 py-2 text-xs text-slate-400">
            {monthStart.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — {now.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Users} label="Nouveaux clients" value={String(newClients)} detail="Activité du mois en cours" href="/app/clients" tone="blue" />
          <MetricCard icon={FolderKanban} label="Dossiers ouverts" value={String(openCases)} detail="Suivi opérationnel actif" href="/app/cases" tone="violet" />
          <MetricCard icon={CreditCard} label="Paiements confirmés" value={formatMoney(monthTotal)} detail="Encaissements confirmés ce mois" href="/app/finance/payments" tone="green" />
          <MetricCard icon={Undo2} label="Remboursements en cours" value={String(pendingRefunds)} detail="À surveiller ou exécuter" href="/app/finance/refunds" tone="amber" />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,.75fr)]">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0e1624] shadow-sm">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Aperçu des opérations</h2>
                <p className="mt-0.5 text-xs text-slate-500">Paiements confirmés · 6 derniers mois</p>
              </div>
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <div className="p-5">
              <div className="flex h-64 items-end gap-3 border-b border-white/[0.06] pb-2">
                {months.map((m) => (
                  <div key={m.label} className="flex h-full flex-1 flex-col justify-end gap-2">
                    <div className="flex flex-1 items-end">
                      <div className="relative w-full rounded-t-lg bg-gradient-to-t from-blue-600/45 to-blue-400/90 shadow-[0_0_20px_rgba(59,130,246,.08)]" style={{ height: `${Math.max(6, (m.total / max) * 205)}px` }}>
                        <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-[9px] text-slate-500 md:block">{m.total > 0 ? formatMoney(m.total) : ""}</span>
                      </div>
                    </div>
                    <span className="text-center text-[11px] capitalize text-slate-500">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0e1624] shadow-sm">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Trésorerie rapide</h2>
                <p className="mt-0.5 text-xs text-slate-500">Vue financière du mois</p>
              </div>
              <WalletCards className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500">Paiements confirmés</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-white">{formatMoney(monthTotal)}</p>
              <div className="mt-6 space-y-3">
                <Link href="/app/finance/payments" className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-sm text-slate-300 hover:bg-white/[0.05]">
                  <span>Paiements</span><ChevronRight className="h-4 w-4 text-slate-600" />
                </Link>
                <Link href="/app/finance/refunds" className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-sm text-slate-300 hover:bg-white/[0.05]">
                  <span>Remboursements</span><span className="text-xs text-amber-400">{pendingRefunds} en cours</span>
                </Link>
                {user.role === "SUPER_ADMIN" ? <Link href="/app/company-funds" className="flex items-center justify-between rounded-xl border border-blue-500/15 bg-blue-500/[0.06] px-4 py-3 text-sm text-blue-300 hover:bg-blue-500/[0.1]">
                  <span>Company Funds</span><ChevronRight className="h-4 w-4" />
                </Link> : null}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0e1624] shadow-sm">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div><h2 className="text-sm font-semibold text-white">Dossiers récents</h2><p className="mt-0.5 text-xs text-slate-500">Dernières mises à jour CRM</p></div>
              <Link href="/app/cases" className="text-xs text-blue-400 hover:text-blue-300">Voir tout</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/[0.05] text-[10px] uppercase tracking-[0.12em] text-slate-600">
                  <tr><th className="px-5 py-3 font-medium">Client</th><th className="px-5 py-3 font-medium">Dossier</th><th className="px-5 py-3 font-medium">Statut</th><th className="px-5 py-3 font-medium">Mise à jour</th></tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {recentCases.map((c) => (
                    <tr key={c.id} className="transition hover:bg-white/[0.025]">
                      <td className="px-5 py-3 text-slate-300">{c.client ? `${c.client.firstName} ${c.client.lastName}` : "—"}</td>
                      <td className="px-5 py-3"><Link href={`/app/cases/${c.id}`} className="font-medium text-white hover:text-blue-400">{c.caseNumber}</Link></td>
                      <td className="px-5 py-3"><span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-medium text-blue-300">{c.status.replaceAll("_", " ")}</span></td>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(c.updatedAt)}</td>
                    </tr>
                  ))}
                  {recentCases.length === 0 ? <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">Aucun dossier récent.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0e1624] shadow-sm">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div><h2 className="text-sm font-semibold text-white">Activité récente</h2><p className="mt-0.5 text-xs text-slate-500">Ce qui vient de se passer</p></div>
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <div className="divide-y divide-white/[0.05]">
              {recentActivity.map((a) => (
                <div key={a.id} className="flex gap-3 px-5 py-3.5">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,.55)]" />
                  <div className="min-w-0">
                    <p className="text-xs leading-5 text-slate-300">{a.message}</p>
                    <p className="mt-0.5 text-[10px] text-slate-600">{a.user ? `${a.user.firstName} ${a.user.lastName} · ` : ""}{formatDateTime(a.createdAt)}</p>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">L’activité apparaîtra ici.</p> : null}
            </div>
          </section>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0e1624] shadow-sm">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><CheckSquare className="h-4 w-4 text-rose-400" /> Tâches en retard</h2><Link href="/app/tasks" className="text-xs text-blue-400">Voir tout</Link></div>
            <div className="divide-y divide-white/[0.05]">
              {overdueTasks.map((t) => <div key={t.id} className="px-5 py-3.5"><Link href={`/app/tasks?focus=${t.id}`} className="text-sm font-medium text-slate-200 hover:text-blue-400">{t.title}</Link><p className="mt-1 text-[11px] text-slate-600">{t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "Non assigné"} · {formatDateTime(t.dueDate)}</p></div>)}
              {overdueTasks.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Aucune tâche en retard.</p> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0e1624] shadow-sm">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><FileText className="h-4 w-4 text-violet-400" /> Documents récents</h2><Link href="/app/documents" className="text-xs text-blue-400">Voir tout</Link></div>
            <div className="divide-y divide-white/[0.05]">
              {recentDocs.map((d) => <div key={d.id} className="flex items-center justify-between gap-4 px-5 py-3.5"><div className="min-w-0"><Link href={`/app/documents/${d.id}`} className="block truncate text-sm font-medium text-slate-200 hover:text-blue-400">{d.title}</Link><p className="mt-1 truncate text-[11px] text-slate-600">{d.documentId}{d.client ? ` · ${d.client.firstName} ${d.client.lastName}` : ""}</p></div><span className="shrink-0 rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] text-slate-400">{d.status.replaceAll("_", " ")}</span></div>)}
              {recentDocs.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Aucun document récent.</p> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
