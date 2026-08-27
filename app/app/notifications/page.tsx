import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { markNotificationRead, markNotificationUnread, markAllNotificationsRead } from "@/services/notifications";
import {
  Bell,
  BellDot,
  Search,
  MessageCircle,
  CreditCard,
  RotateCcw,
  Briefcase,
  FileText,
  ShieldAlert,
  CheckCircle2,
  Mail,
  Clock3,
  ArrowUpRight,
  Circle,
  CircleDot,
} from "lucide-react";

export const dynamic = "force-dynamic";

type FilterKey = "all" | "unread" | "whatsapp" | "finance" | "cases" | "documents" | "system";

type NotificationRow = Awaited<ReturnType<typeof loadNotifications>>[number];

async function loadNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 250,
  });
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { q?: string; filter?: string };
}) {
  const user = await requireUser();
  const notifications = await loadNotifications(user.id);
  const unread = notifications.filter((n) => !n.readAt).length;

  const query = String(searchParams.q || "").trim().toLowerCase();
  const requestedFilter = String(searchParams.filter || "all") as FilterKey;
  const filter: FilterKey = ["all", "unread", "whatsapp", "finance", "cases", "documents", "system"].includes(requestedFilter)
    ? requestedFilter
    : "all";

  const enriched = notifications.map((n) => ({ ...n, category: categoryFor(n.type), href: hrefFor(n.type) }));
  const filtered = enriched.filter((n) => {
    const matchesSearch = !query || `${n.title} ${n.body || ""} ${n.type}`.toLowerCase().includes(query);
    if (!matchesSearch) return false;
    if (filter === "unread") return !n.readAt;
    if (filter === "all") return true;
    return n.category === filter;
  });

  const counts = {
    all: notifications.length,
    unread,
    whatsapp: enriched.filter((n) => n.category === "whatsapp").length,
    finance: enriched.filter((n) => n.category === "finance").length,
    cases: enriched.filter((n) => n.category === "cases").length,
    documents: enriched.filter((n) => n.category === "documents").length,
    system: enriched.filter((n) => n.category === "system").length,
  };

  const groups = groupByDay(filtered);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} notification${unread > 1 ? "s" : ""} non lue${unread > 1 ? "s" : ""}` : "Tout est à jour."}
        actions={
          unread > 0 ? (
            <form action={markAllNotificationsRead}>
              <Button variant="secondary">Tout marquer comme lu</Button>
            </form>
          ) : undefined
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Total" value={counts.all} icon={<Bell className="h-4 w-4" />} />
        <MetricCard label="Non lues" value={counts.unread} icon={<BellDot className="h-4 w-4" />} emphasis={counts.unread > 0} />
        <MetricCard label="WhatsApp" value={counts.whatsapp} icon={<MessageCircle className="h-4 w-4" />} />
        <MetricCard label="Finance" value={counts.finance} icon={<CreditCard className="h-4 w-4" />} />
      </div>

      <div className="rounded-2xl border border-line bg-white p-3 shadow-sm">
        <form method="get" className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1 xl:max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
            <input
              name="q"
              defaultValue={searchParams.q || ""}
              placeholder="Rechercher une notification, un client, un paiement…"
              className="h-10 w-full rounded-xl border border-line bg-surface/40 pl-9 pr-3 text-sm outline-none focus:border-electric focus:bg-white"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ["all", "Toutes", counts.all],
              ["unread", "Non lues", counts.unread],
              ["whatsapp", "WhatsApp", counts.whatsapp],
              ["finance", "Finance", counts.finance],
              ["cases", "Dossiers", counts.cases],
              ["documents", "Documents", counts.documents],
              ["system", "Système", counts.system],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                type="submit"
                name="filter"
                value={key}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  filter === key ? "border-electric bg-electric/5 text-electric" : "border-line bg-white text-muted2 hover:bg-surface"
                }`}
              >
                {label} <span className="ml-1 opacity-60">{count}</span>
              </button>
            ))}
          </div>
        </form>
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="Aucune notification" description="Les messages WhatsApp, paiements, remboursements, dossiers et documents apparaîtront ici." />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted2">Aucune notification ne correspond à ce filtre.</div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-2 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.12em] text-muted2">
                <span>{group.label}</span>
                <div className="h-px flex-1 bg-line" />
              </div>
              <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
                {group.items.map((n, index) => {
                  const meta = notificationMeta(n.type);
                  return (
                    <div key={n.id} className={`relative flex gap-3 p-4 ${index ? "border-t border-line" : ""} ${n.readAt ? "bg-white" : "bg-electric/[0.035]"}`}>
                      {!n.readAt ? <span className="absolute left-0 top-4 h-10 w-1 rounded-r-full bg-electric" /> : null}
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.iconClass}`}>{meta.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className={`text-sm ${n.readAt ? "font-medium text-ink" : "font-semibold text-ink"}`}>{n.title}</h3>
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${meta.badgeClass}`}>{meta.label}</span>
                              {!n.readAt ? <span className="rounded-full bg-electric/10 px-2 py-0.5 text-[9px] font-semibold text-electric">NOUVEAU</span> : null}
                            </div>
                            {n.body ? <p className="mt-1 max-w-5xl whitespace-pre-wrap text-sm leading-relaxed text-muted2">{n.body}</p> : null}
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted2">
                              <Clock3 className="h-3.5 w-3.5" />
                              <span>{formatWhen(n.createdAt)}</span>
                              <span>·</span>
                              <span>{n.type.replaceAll("_", " ")}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Link href={n.href} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink hover:bg-surface">
                              Ouvrir <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                            {n.readAt ? (
                              <form action={markNotificationUnread.bind(null, n.id)}>
                                <button className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted2 hover:bg-surface hover:text-ink">
                                  <CircleDot className="h-3.5 w-3.5" /> Non lue
                                </button>
                              </form>
                            ) : (
                              <form action={markNotificationRead.bind(null, n.id)}>
                                <button className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted2 hover:bg-surface hover:text-ink">
                                  <Circle className="h-3.5 w-3.5" /> Marquer lue
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function categoryFor(type: string): Exclude<FilterKey, "all" | "unread"> {
  const t = type.toUpperCase();
  if (t.includes("WHATSAPP")) return "whatsapp";
  if (/(PAYMENT|REFUND|INVOICE|RECEIPT|FINANCE|EXPENSE)/.test(t)) return "finance";
  if (/(CASE|TASK|ASSIGN)/.test(t)) return "cases";
  if (/(DOCUMENT|SIGNATURE|FILE|VAULT)/.test(t)) return "documents";
  return "system";
}

function hrefFor(type: string) {
  const category = categoryFor(type);
  if (category === "whatsapp") return "/app/whatsapp/inbox";
  if (category === "finance") return "/app/payments";
  if (category === "cases") return "/app/cases";
  if (category === "documents") return "/app/documents";
  return "/app";
}

function notificationMeta(type: string) {
  const category = categoryFor(type);
  if (category === "whatsapp") return { label: "WhatsApp", icon: <MessageCircle className="h-4 w-4" />, iconClass: "bg-emerald-50 text-emerald-700", badgeClass: "bg-emerald-50 text-emerald-700" };
  if (category === "finance") {
    if (type.toUpperCase().includes("REFUND")) return { label: "Remboursement", icon: <RotateCcw className="h-4 w-4" />, iconClass: "bg-amber-50 text-amber-700", badgeClass: "bg-amber-50 text-amber-700" };
    return { label: "Finance", icon: <CreditCard className="h-4 w-4" />, iconClass: "bg-blue-50 text-blue-700", badgeClass: "bg-blue-50 text-blue-700" };
  }
  if (category === "cases") return { label: "Dossier", icon: <Briefcase className="h-4 w-4" />, iconClass: "bg-violet-50 text-violet-700", badgeClass: "bg-violet-50 text-violet-700" };
  if (category === "documents") return { label: "Document", icon: <FileText className="h-4 w-4" />, iconClass: "bg-slate-100 text-slate-700", badgeClass: "bg-slate-100 text-slate-700" };
  if (/MAIL|EMAIL/.test(type.toUpperCase())) return { label: "Email", icon: <Mail className="h-4 w-4" />, iconClass: "bg-cyan-50 text-cyan-700", badgeClass: "bg-cyan-50 text-cyan-700" };
  if (/SECURITY|BAN|WARNING|ALERT/.test(type.toUpperCase())) return { label: "Sécurité", icon: <ShieldAlert className="h-4 w-4" />, iconClass: "bg-red-50 text-red-700", badgeClass: "bg-red-50 text-red-700" };
  return { label: "Système", icon: <CheckCircle2 className="h-4 w-4" />, iconClass: "bg-surface text-muted2", badgeClass: "bg-surface text-muted2" };
}

function groupByDay(items: Array<NotificationRow & { category: ReturnType<typeof categoryFor>; href: string }>) {
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = dayKey(item.createdAt);
    const existing = groups.get(key) || [];
    existing.push(item);
    groups.set(key, existing);
  }
  return [...groups.entries()].map(([key, groupItems]) => ({ key, label: dayLabel(groupItems[0].createdAt), items: groupItems }));
}

function dayKey(value: Date) {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function dayLabel(value: Date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(value) === dayKey(now)) return "Aujourd’hui";
  if (dayKey(value) === dayKey(yesterday)) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(value);
}

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
}

function MetricCard({ label, value, icon, emphasis = false }: { label: string; value: number; icon: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${emphasis ? "border-electric/30 bg-electric/[0.04]" : "border-line bg-white"}`}>
      <div className="flex items-center justify-between text-xs text-muted2"><span>{label}</span><span className={emphasis ? "text-electric" : "text-muted2"}>{icon}</span></div>
      <div className="mt-2 text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}
