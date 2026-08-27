import Link from "next/link";
import {
  MessageCircle,
  CheckCheck,
  UserRound,
  Paperclip,
  Search,
  Send,
  Phone,
  Briefcase,
  ExternalLink,
  Clock3,
  Inbox,
  MoreHorizontal,
  Tag,
  UserCog,
  StickyNote,
  CreditCard,
  FileText,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decodeWhatsAppInboxPayload } from "@/lib/whatsapp-inbox";
import {
  markWhatsAppConversationRead,
  replyWhatsAppConversation,
  setWhatsAppConversationStatus,
} from "@/services/whatsapp-inbox";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof loadRows>>[number];
type FilterKey = "all" | "unread" | "linked" | "unknown";
type ConversationStatus = "OPEN" | "WAITING" | "RESOLVED";

async function loadRows() {
  return prisma.activity.findMany({
    where: {
      resourceType: "WhatsAppConversation",
      type: { in: ["WHATSAPP_INBOUND_UNREAD", "WHATSAPP_INBOUND_READ", "WHATSAPP_OUTBOUND_REPLY"] },
      resourceId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: {
      client: { select: { id: true, internalId: true, firstName: true, lastName: true } },
      case: { select: { id: true, caseNumber: true, title: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  });
}

async function loadConversationStatuses() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: "whatsapp.inbox.status." } },
    select: { key: true, value: true },
  });
  const map = new Map<string, ConversationStatus>();
  for (const row of rows) {
    const phone = row.key.replace("whatsapp.inbox.status.", "");
    if (["OPEN", "WAITING", "RESOLVED"].includes(row.value)) map.set(phone, row.value as ConversationStatus);
  }
  return map;
}

export default async function WhatsAppInboxPage({
  searchParams,
}: {
  searchParams: { phone?: string; q?: string; filter?: string };
}) {
  const user = await requireUser();
  if (user.role === "CLIENT") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        WhatsApp Inbox est réservée au personnel JUN.
      </div>
    );
  }

  const [rows, statusMap] = await Promise.all([loadRows(), loadConversationStatuses()]);
  const allConversations = groupConversations(rows).map((c) => ({
    ...c,
    status: statusMap.get(c.phone) || "OPEN" as ConversationStatus,
  }));
  const query = String(searchParams.q || "").trim().toLowerCase();
  const rawFilter = String(searchParams.filter || "all") as FilterKey;
  const filter: FilterKey = ["all", "unread", "linked", "unknown"].includes(rawFilter) ? rawFilter : "all";

  const conversations = allConversations.filter((c) => {
    const matchesQuery = !query || [c.name, c.phone, c.internalId || "", c.caseNumber || "", c.preview]
      .join(" ")
      .toLowerCase()
      .includes(query);
    if (!matchesQuery) return false;
    if (filter === "unread") return c.unread > 0;
    if (filter === "linked") return Boolean(c.clientId);
    if (filter === "unknown") return !c.clientId;
    return true;
  });

  const requested = String(searchParams.phone || "").replace(/[^0-9]/g, "");
  const selectedPhone = conversations.some((c) => c.phone === requested)
    ? requested
    : conversations[0]?.phone || allConversations[0]?.phone || "";
  const selected = allConversations.find((c) => c.phone === selectedPhone);

  const rawMessages = rows
    .filter((r) => r.resourceId === selectedPhone)
    .map((r) => ({ row: r, payload: decodeWhatsAppInboxPayload(r.message) }))
    .filter((x) => x.payload)
    .reverse();
  const messages = dedupeTimeline(rawMessages);

  const unreadTotal = rows.filter((r) => r.type === "WHATSAPP_INBOUND_UNREAD").length;
  const unreadConversations = allConversations.filter((c) => c.unread > 0).length;
  const linkedConversations = allConversations.filter((c) => c.clientId).length;
  const operatorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Utilisateur JUN";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[.18em] text-muted2">Communication</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold">
            <MessageCircle className="h-7 w-7" /> WhatsApp Inbox
          </h1>
          <p className="mt-1 text-sm text-muted2">Centre de conversations clients WhatsApp en temps réel.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs text-muted2">
            <strong className="text-ink">{allConversations.length}</strong> conversations
          </div>
          <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs text-muted2">
            <strong className="text-ink">{unreadTotal}</strong> non lus
          </div>
          <Link href="/app/whatsapp" className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium hover:bg-surface">
            Envoyer une notification
          </Link>
        </div>
      </div>

      {!allConversations.length ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Inbox className="mx-auto h-10 w-10 text-muted2" />
            <div className="mt-3 font-medium">Aucune conversation WhatsApp</div>
            <div className="mt-1 text-sm text-muted2">Les réponses clients apparaîtront automatiquement ici.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-h-[720px] overflow-hidden rounded-2xl border border-line bg-white shadow-sm xl:grid-cols-[330px_minmax(0,1fr)_320px]">
          <aside className="border-b border-line bg-white xl:border-b-0 xl:border-r">
            <div className="border-b border-line p-4">
              <form method="get" className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
                  <input
                    name="q"
                    defaultValue={searchParams.q || ""}
                    placeholder="Rechercher nom, téléphone, dossier…"
                    className="h-10 w-full rounded-xl border border-line bg-surface/40 pl-9 pr-3 text-sm outline-none focus:border-electric focus:bg-white"
                  />
                </div>
                <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface p-1 text-[11px] font-medium">
                  {([
                    ["all", "Tous", allConversations.length],
                    ["unread", "Non lus", unreadConversations],
                    ["linked", "Clients", linkedConversations],
                    ["unknown", "Inconnus", allConversations.length - linkedConversations],
                  ] as const).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="submit"
                      name="filter"
                      value={key}
                      className={`rounded-lg px-2 py-2 text-center ${filter === key ? "bg-white text-ink shadow-sm" : "text-muted2 hover:text-ink"}`}
                    >
                      <span className="block">{label}</span>
                      <span className="mt-0.5 block text-[10px] opacity-70">{count}</span>
                    </button>
                  ))}
                </div>
              </form>
            </div>

            <div className="max-h-[650px] overflow-y-auto">
              {!conversations.length ? (
                <div className="p-8 text-center text-sm text-muted2">Aucune conversation ne correspond à ce filtre.</div>
              ) : (
                conversations.map((c) => {
                  const selectedNow = c.phone === selectedPhone;
                  const params = new URLSearchParams();
                  params.set("phone", c.phone);
                  if (searchParams.q) params.set("q", searchParams.q);
                  if (filter !== "all") params.set("filter", filter);
                  return (
                    <Link
                      key={c.phone}
                      href={`/app/whatsapp/inbox?${params.toString()}`}
                      className={`block border-b border-line/70 p-4 transition ${selectedNow ? "bg-electric/5" : "hover:bg-surface/70"}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${selectedNow ? "bg-electric text-white" : "bg-surface text-ink"}`}>
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className={`truncate text-sm ${c.unread ? "font-semibold" : "font-medium"}`}>{c.name}</div>
                            <div className="shrink-0 text-[10px] text-muted2">{formatListWhen(c.lastAt)}</div>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted2">
                            <span>+{c.phone}</span>
                            {c.clientId ? <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">CLIENT</span> : null}
                            <ConversationStatusBadge status={c.status} compact />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <div className={`truncate text-xs ${c.unread ? "font-medium text-ink" : "text-muted2"}`}>{c.preview}</div>
                            {c.unread ? (
                              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">{c.unread}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </aside>

          <section className="flex min-w-0 flex-col bg-[#f6f7f9]">
            {selected ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-electric text-sm font-semibold text-white">{initials(selected.name)}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold">{selected.name}</h2>
                        <ConversationStatusBadge status={selected.status} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted2">
                        <Phone className="h-3 w-3" /> +{selected.phone}
                        {selected.internalId ? <span>· {selected.internalId}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selected.clientId ? (
                      <Link href={`/app/clients/${selected.clientId}`} className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium hover:bg-surface xl:hidden">Client 360</Link>
                    ) : null}
                    {selected.unread ? (
                      <form action={markWhatsAppConversationRead.bind(null, selected.phone)}>
                        <Button variant="outline" size="sm"><CheckCheck className="h-4 w-4" /> Marquer lu</Button>
                      </form>
                    ) : null}
                    <form action={setWhatsAppConversationStatus.bind(null, selected.phone, "WAITING")}>
                      <Button variant="outline" size="sm">En attente</Button>
                    </form>
                    <form action={setWhatsAppConversationStatus.bind(null, selected.phone, selected.status === "RESOLVED" ? "OPEN" : "RESOLVED")}>
                      <Button variant="outline" size="sm">{selected.status === "RESOLVED" ? "Rouvrir" : "Résoudre"}</Button>
                    </form>
                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-muted2 hover:bg-surface" aria-label="Plus d’options">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
                  <div className="mx-auto max-w-4xl space-y-1.5">
                    {messages.map(({ row, payload }, index) => {
                      if (!payload) return null;
                      const previous = index > 0 ? messages[index - 1]?.payload : null;
                      const showDate = !previous || dayKey(previous.timestamp) !== dayKey(payload.timestamp);
                      const outbound = payload.direction === "OUTBOUND";
                      return (
                        <div key={row.id}>
                          {showDate ? (
                            <div className="my-3 flex items-center gap-3 text-[10px] font-medium uppercase tracking-wide text-muted2">
                              <div className="h-px flex-1 bg-line" />
                              <span>{formatDay(new Date(payload.timestamp))}</span>
                              <div className="h-px flex-1 bg-line" />
                            </div>
                          ) : null}
                          <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                            <div className={`min-w-[138px] max-w-[90%] rounded-2xl px-4 py-2.5 text-sm shadow-sm md:max-w-[74%] ${outbound ? "rounded-br-md bg-[#162033] text-white" : "rounded-bl-md border border-line bg-white text-ink"}`}>
                              {payload.type !== "text" ? (
                                <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase opacity-70"><Paperclip className="h-3 w-3" />{payload.type.replaceAll("_", " ")}</div>
                              ) : null}
                              <div className="whitespace-pre-wrap break-words leading-relaxed">{payload.text}</div>
                              {payload.filename ? <div className="mt-2 rounded-lg bg-black/5 px-2 py-1 text-xs opacity-80">{payload.filename}</div> : null}
                              <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
                                {formatTime(new Date(payload.timestamp))}
                                {outbound ? <CheckCheck className="h-3.5 w-3.5" /> : null}
                                {outbound && row.user ? <span>· {row.user.firstName}</span> : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <form action={replyWhatsAppConversation.bind(null, selected.phone)} className="sticky bottom-0 z-10 border-t border-line bg-white/95 px-4 py-3 backdrop-blur">
                  <div className="mx-auto max-w-4xl rounded-2xl border border-line bg-white shadow-sm focus-within:border-electric">
                    <Textarea
                      name="message"
                      rows={2}
                      required
                      maxLength={4096}
                      placeholder="Écrire une réponse au client…"
                      className="min-h-[58px] resize-none border-0 shadow-none focus:ring-0"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link href="/app/whatsapp" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-muted2 hover:bg-surface hover:text-ink">
                          <FileText className="h-3.5 w-3.5" /> Modèles
                        </Link>
                        <span className="hidden h-4 w-px bg-line sm:block" />
                        <div className="flex items-center gap-1.5 text-[11px] text-muted2">
                          <Clock3 className="h-3.5 w-3.5" />
                          <span className="truncate">{serviceWindowLabel(selected.lastInboundAt)}</span>
                        </div>
                      </div>
                      <Button variant="primary" type="submit"><Send className="h-4 w-4" /> Envoyer</Button>
                    </div>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted2">Sélectionnez une conversation.</div>
            )}
          </section>

          <aside className="hidden border-l border-line bg-white xl:block">
            {selected ? (
              <div className="max-h-[720px] overflow-y-auto p-5">
                <div className="text-xs font-semibold uppercase tracking-[.14em] text-muted2">Client</div>
                <div className="mt-4 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-electric/10 text-lg font-semibold text-electric">{initials(selected.name)}</div>
                  <div className="mt-3 font-semibold">{selected.name}</div>
                  <div className="mt-1 text-xs text-muted2">+{selected.phone}</div>
                  <div className="mt-2 flex justify-center"><ConversationStatusBadge status={selected.status} /></div>
                </div>

                <div className="mt-5 space-y-3 border-t border-line pt-4">
                  <InfoRow label="Client ID" value={selected.internalId || "Non lié"} />
                  <InfoRow label="Dossier" value={selected.caseNumber || "Aucun dossier"} />
                  <InfoRow label="Dernier message" value={formatWhen(selected.lastAt)} />
                  <InfoRow label="Messages non lus" value={String(selected.unread)} />
                  <InfoRow label="Fenêtre Meta" value={serviceWindowLabel(selected.lastInboundAt)} />
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted2"><Tag className="h-3.5 w-3.5" /> Tags</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.clientId ? <ContextTag label="Client" /> : <ContextTag label="Contact non lié" tone="amber" />}
                    {selected.caseId ? <ContextTag label="Dossier actif" tone="blue" /> : null}
                    <ContextTag label={selected.status === "RESOLVED" ? "Résolu" : selected.status === "WAITING" ? "En attente" : "Ouvert"} tone={selected.status === "WAITING" ? "amber" : selected.status === "RESOLVED" ? "slate" : "green"} />
                  </div>
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted2"><UserCog className="h-3.5 w-3.5" /> Opérateur connecté</div>
                  <div className="mt-2 rounded-xl bg-surface px-3 py-2.5 text-sm font-medium text-ink">{operatorName}</div>
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted2">Actions rapides</div>
                  <div className="mt-2 grid gap-2">
                    {selected.clientId ? (
                      <Link href={`/app/clients/${selected.clientId}`} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm font-medium hover:bg-surface">
                        <span className="flex items-center gap-2"><UserRound className="h-4 w-4" /> Client 360</span><ExternalLink className="h-3.5 w-3.5 text-muted2" />
                      </Link>
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Ce numéro n’est pas encore lié à un client JUN.</div>
                    )}
                    {selected.caseId ? (
                      <Link href={`/app/cases/${selected.caseId}`} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm font-medium hover:bg-surface">
                        <span className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Ouvrir le dossier</span><ExternalLink className="h-3.5 w-3.5 text-muted2" />
                      </Link>
                    ) : null}
                    <Link href="/app/payments" className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm font-medium hover:bg-surface">
                      <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Paiements</span><ExternalLink className="h-3.5 w-3.5 text-muted2" />
                    </Link>
                    <Link href="/app/whatsapp" className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm font-medium hover:bg-surface">
                      <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Modèles WhatsApp</span><ExternalLink className="h-3.5 w-3.5 text-muted2" />
                    </Link>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-line bg-surface/70 p-3 text-xs text-muted2">
                  <div className="flex items-center gap-2 font-medium text-ink"><StickyNote className="h-4 w-4" /> Notes internes</div>
                  <p className="mt-1.5 leading-relaxed">Utilisez Client 360 pour consulter ou compléter le contexte client avant une action sensible.</p>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

function groupConversations(rows: Row[]) {
  const map = new Map<string, {
    phone: string;
    name: string;
    clientId: string | null;
    internalId: string | null;
    caseId: string | null;
    caseNumber: string | null;
    preview: string;
    lastAt: Date;
    lastInboundAt: Date | null;
    unread: number;
  }>();

  for (const row of rows) {
    const phone = String(row.resourceId || "");
    if (!phone) continue;
    const payload = decodeWhatsAppInboxPayload(row.message);
    if (!payload) continue;
    const existing = map.get(phone);
    const isInbound = payload.direction === "INBOUND";
    if (!existing) {
      map.set(phone, {
        phone,
        name: row.client ? `${row.client.firstName} ${row.client.lastName}` : (payload.contactName || `+${phone}`),
        clientId: row.client?.id || null,
        internalId: row.client?.internalId || null,
        caseId: row.case?.id || null,
        caseNumber: row.case?.caseNumber || null,
        preview: payload.text,
        lastAt: row.createdAt,
        lastInboundAt: isInbound ? new Date(payload.timestamp) : null,
        unread: row.type === "WHATSAPP_INBOUND_UNREAD" ? 1 : 0,
      });
    } else {
      if (row.type === "WHATSAPP_INBOUND_UNREAD") existing.unread++;
      if (!existing.lastInboundAt && isInbound) existing.lastInboundAt = new Date(payload.timestamp);
    }
  }
  return [...map.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

function dedupeTimeline<T extends { row: Row; payload: ReturnType<typeof decodeWhatsAppInboxPayload> }>(items: T[]) {
  const result: T[] = [];
  const seenIds = new Set<string>();
  for (const item of items) {
    const payload = item.payload;
    if (!payload) continue;
    const id = String(payload.messageId || "").trim();
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);

    const previous = result[result.length - 1]?.payload;
    if (
      previous &&
      payload.direction === "OUTBOUND" &&
      previous.direction === "OUTBOUND" &&
      payload.text.trim() === previous.text.trim() &&
      Math.abs(new Date(payload.timestamp).getTime() - new Date(previous.timestamp).getTime()) <= 15_000
    ) {
      continue;
    }
    result.push(item);
  }
  return result;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "WA";
}

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(value);
}

function formatListWhen(value: Date) {
  const now = new Date();
  if (dayKey(now) === dayKey(value)) return formatTime(value);
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(value);
}

function dayKey(value: Date | string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDay(value: Date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(value) === dayKey(now)) return "Aujourd’hui";
  if (dayKey(value) === dayKey(yesterday)) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "long" }).format(value);
}

function serviceWindowLabel(lastInboundAt: Date | null) {
  if (!lastInboundAt) return "Fenêtre Meta non disponible";
  const expiresAt = lastInboundAt.getTime() + 24 * 60 * 60 * 1000;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Fenêtre Meta expirée · utiliser un modèle";
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `Fenêtre Meta active · ${hours} h ${minutes.toString().padStart(2, "0")} restantes`;
}

function ConversationStatusBadge({ status, compact = false }: { status: ConversationStatus; compact?: boolean }) {
  const styles = status === "RESOLVED"
    ? "bg-slate-100 text-slate-600"
    : status === "WAITING"
      ? "bg-amber-50 text-amber-700"
      : "bg-emerald-50 text-emerald-700";
  const label = status === "RESOLVED" ? "Résolu" : status === "WAITING" ? "En attente" : "Ouvert";
  return <span className={`inline-flex items-center rounded-full font-semibold ${styles} ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"}`}>{label}</span>;
}

function ContextTag({ label, tone = "green" }: { label: string; tone?: "green" | "amber" | "blue" | "slate" }) {
  const style = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : tone === "slate" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700";
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${style}`}>{label}</span>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-muted2">{label}</div><div className="mt-0.5 text-sm font-medium text-ink">{value}</div></div>;
}
