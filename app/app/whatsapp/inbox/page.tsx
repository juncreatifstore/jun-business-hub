import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Ban,
  Briefcase,
  CheckCheck,
  ClipboardList,
  Clock3,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileText,
  Flame,
  FolderOpen,
  Inbox,
  MailOpen,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  ShieldOff,
  Star,
  StickyNote,
  Tag,
  UserCog,
  UserMinus,
  UserPlus,
  UserRound,
  WalletCards,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  decodeWhatsAppInboxPayload,
  normalizeWhatsAppPhone,
  type WhatsAppInboxPayload,
} from "@/lib/whatsapp-inbox";
import { getClientCommunicationBan } from "@/lib/client-communication-policy";
import { getClientFinanceOverview } from "@/lib/client-finance-overview";
import {
  addWhatsAppInternalNote,
  assignWhatsAppConversationToMe,
  markWhatsAppConversationRead,
  replyWhatsAppConversation,
  setWhatsAppConversationPriority,
  setWhatsAppConversationStatus,
  unassignWhatsAppConversation,
  updateWhatsAppConversationTags,
  setWhatsAppConversationCase,
  setWhatsAppClientCommunicationBan,
} from "@/services/whatsapp-inbox";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof loadRows>>[number];
type FilterKey = "all" | "unread" | "waiting" | "urgent" | "resolved";
type ConversationStatus = "OPEN" | "WAITING" | "RESOLVED";
type ConversationPriority = "NORMAL" | "HIGH" | "URGENT";
type Assignment = { userId: string; name: string; assignedAt: string } | null;
type NoteItem = { id: string; text: string; author: string; createdAt: string };
type DeliveryState = "ACCEPTED" | "SENT" | "DELIVERED" | "READ" | "FAILED";
type DeliveryInfo = { state: DeliveryState; at: Date; reason?: string | null };

async function loadRows() {
  return prisma.activity.findMany({
    where: {
      OR: [
        {
          resourceType: "WhatsAppConversation",
          type: { in: ["WHATSAPP_INBOUND_UNREAD", "WHATSAPP_INBOUND_READ", "WHATSAPP_OUTBOUND_REPLY"] },
          resourceId: { not: null },
        },
        {
          type: {
            in: [
              "WHATSAPP_ACCEPTED",
              "WHATSAPP_SENT",
              "WHATSAPP_DELIVERED",
              "WHATSAPP_READ",
              "WHATSAPP_FAILED",
            ],
          },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 2500,
    include: {
      client: {
        select: { id: true, internalId: true, firstName: true, lastName: true, whatsapp: true, phone: true },
      },
      case: { select: { id: true, caseNumber: true, title: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  });
}

async function loadInboxSettings() {
  const rows = await prisma.appSetting.findMany({
    where: {
      OR: [
        { key: { startsWith: "whatsapp.inbox.status." } },
        { key: { startsWith: "whatsapp.inbox.priority." } },
        { key: { startsWith: "whatsapp.inbox.assignment." } },
        { key: { startsWith: "whatsapp.inbox.tags." } },
        { key: { startsWith: "whatsapp.inbox.notes." } },
        { key: { startsWith: "whatsapp.inbox.case." } },
      ],
    },
    select: { key: true, value: true },
  });
  const status = new Map<string, ConversationStatus>(),
    priority = new Map<string, ConversationPriority>(),
    assignment = new Map<string, Assignment>(),
    tags = new Map<string, string[]>(),
    notes = new Map<string, NoteItem[]>(),
    cases = new Map<string, string>();
  for (const row of rows) {
    if (row.key.startsWith("whatsapp.inbox.status.")) {
      const p = row.key.replace("whatsapp.inbox.status.", "");
      if (["OPEN", "WAITING", "RESOLVED"].includes(row.value)) status.set(p, row.value as ConversationStatus);
    } else if (row.key.startsWith("whatsapp.inbox.priority.")) {
      const p = row.key.replace("whatsapp.inbox.priority.", "");
      if (["NORMAL", "HIGH", "URGENT"].includes(row.value))
        priority.set(p, row.value as ConversationPriority);
    } else if (row.key.startsWith("whatsapp.inbox.assignment.")) {
      const p = row.key.replace("whatsapp.inbox.assignment.", "");
      try {
        assignment.set(p, JSON.parse(row.value));
      } catch {
        assignment.set(p, null);
      }
    } else if (row.key.startsWith("whatsapp.inbox.tags.")) {
      const p = row.key.replace("whatsapp.inbox.tags.", "");
      try {
        tags.set(p, JSON.parse(row.value));
      } catch {
        tags.set(p, []);
      }
    } else if (row.key.startsWith("whatsapp.inbox.notes.")) {
      const p = row.key.replace("whatsapp.inbox.notes.", "");
      try {
        notes.set(p, JSON.parse(row.value));
      } catch {
        notes.set(p, []);
      }
    } else if (row.key.startsWith("whatsapp.inbox.case."))
      cases.set(row.key.replace("whatsapp.inbox.case.", ""), row.value);
  }
  return { status, priority, assignment, tags, notes, cases };
}

export default async function WhatsAppInboxPage({
  searchParams,
}: {
  searchParams: { phone?: string; q?: string; filter?: string };
}) {
  const user = await requireUser();
  if (user.role === "CLIENT")
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-danger">
        WhatsApp Inbox est réservée au personnel JUN.
      </div>
    );

  const [rows, settings] = await Promise.all([loadRows(), loadInboxSettings()]);
  const allConversations = groupConversations(rows).map((c) => ({
    ...c,
    status: settings.status.get(c.phone) || ("OPEN" as ConversationStatus),
    priority: settings.priority.get(c.phone) || ("NORMAL" as ConversationPriority),
    assignment: settings.assignment.get(c.phone) || null,
    tags: settings.tags.get(c.phone) || [],
    notes: settings.notes.get(c.phone) || [],
    attachedCaseId: settings.cases.get(c.phone) || c.caseId || null,
  }));
  const query = String(searchParams.q || "")
    .trim()
    .toLowerCase();
  const rawFilter = String(searchParams.filter || "all") as FilterKey;
  const filter: FilterKey = ["all", "unread", "waiting", "urgent", "resolved"].includes(rawFilter)
    ? rawFilter
    : "all";
  const conversations = allConversations.filter((c) => {
    const m =
      !query ||
      [c.name, c.phone, c.internalId || "", c.caseNumber || "", c.preview, ...c.tags]
        .join(" ")
        .toLowerCase()
        .includes(query);
    if (!m) return false;
    if (filter === "unread") return c.unread > 0;
    if (filter === "waiting") return c.status === "WAITING";
    if (filter === "urgent") return c.priority === "URGENT";
    if (filter === "resolved") return c.status === "RESOLVED";
    return true;
  });
  const requested = normalizeWhatsAppPhone(String(searchParams.phone || ""));
  const explicitConversation = Boolean(requested && allConversations.some((c) => c.phone === requested));
  const selectedPhone = explicitConversation
    ? requested
    : conversations[0]?.phone || allConversations[0]?.phone || "";
  const selected = allConversations.find((c) => c.phone === selectedPhone);
  const mobileBackParams = new URLSearchParams();
  if (searchParams.q) mobileBackParams.set("q", searchParams.q);
  if (filter !== "all") mobileBackParams.set("filter", filter);
  const mobileBackHref = `/app/whatsapp/inbox${mobileBackParams.toString() ? `?${mobileBackParams}` : ""}`;

  const selectedRows = rows.filter((r) => rowPhone(r) === selectedPhone);
  const rawMessages = selectedRows
    .map((r) => ({ row: r, payload: payloadForRow(r) }))
    .filter((x): x is { row: Row; payload: WhatsAppInboxPayload } => Boolean(x.payload))
    .reverse();
  const messages = dedupeTimeline(rawMessages);
  const deliveryStatuses = buildDeliveryStatuses(selectedRows);
  const unreadTotal = rows.filter((r) => r.type === "WHATSAPP_INBOUND_UNREAD").length;
  const unreadConversations = allConversations.filter((c) => c.unread > 0).length;
  const waitingCount = allConversations.filter((c) => c.status === "WAITING").length;
  const urgentCount = allConversations.filter((c) => c.priority === "URGENT").length;
  const resolvedCount = allConversations.filter((c) => c.status === "RESOLVED").length;
  const clientSummary = selected?.clientId ? await loadClientSummary(selected.clientId) : null;
  const ban = selected?.clientId ? await getClientCommunicationBan(selected.clientId) : { banned: false };

  return (
    <div className="space-y-4">
      <div
        className={`flex flex-wrap items-end justify-between gap-4 ${explicitConversation ? "hidden xl:flex" : "flex"}`}
      >
        <div>
          <p className="text-xs uppercase tracking-[.18em] text-muted2">Communication · Premium workspace</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold sm:text-3xl">
            <MessageCircle className="h-7 w-7" /> WhatsApp Inbox
          </h1>
          <p className="mt-1 hidden text-sm text-muted2 sm:block">
            Conversations, dossier, finance et activité client dans une seule vue.
          </p>
        </div>
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <Metric label="Conversations" value={allConversations.length} />
          <Metric label="Non lus" value={unreadTotal} emphasis={unreadTotal > 0} />
          <Metric label="Urgentes" value={urgentCount} danger={urgentCount > 0} />
          <Link
            href="/app/whatsapp"
            className="rounded-xl bg-electric px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm"
          >
            Nouvel envoi
          </Link>
        </div>
      </div>

      {!allConversations.length ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Inbox className="mx-auto h-10 w-10 text-muted2" />
            <div className="mt-3 font-medium">Aucune conversation WhatsApp</div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-h-[calc(100dvh-190px)] overflow-hidden rounded-2xl border border-line bg-white shadow-sm xl:min-h-[780px] xl:grid-cols-[350px_minmax(0,1fr)_330px]">
          <aside
            className={`${explicitConversation ? "hidden xl:block" : "block"} border-b border-line bg-white xl:border-b-0 xl:border-r`}
          >
            <div className="sticky top-0 z-10 border-b border-line bg-white p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between sm:hidden">
                <div>
                  <div className="text-lg font-semibold">Messages</div>
                  <div className="text-xs text-muted2">
                    {unreadConversations} conversation{unreadConversations === 1 ? "" : "s"} non lue
                    {unreadConversations === 1 ? "" : "s"}
                  </div>
                </div>
                <Link
                  href="/app/whatsapp"
                  className="rounded-xl bg-electric px-3 py-2 text-xs font-semibold text-white"
                >
                  Nouveau
                </Link>
              </div>
              <form method="get" className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
                  <input
                    name="q"
                    defaultValue={searchParams.q || ""}
                    placeholder="Nom, téléphone, dossier, tag…"
                    className="h-10 w-full rounded-xl border border-line bg-surface/40 pl-9 pr-3 text-sm outline-none focus:border-electric"
                  />
                </div>
                <div className="grid grid-cols-5 gap-1 rounded-xl bg-surface p-1 text-[9px] font-medium sm:text-[10px]">
                  {(
                    [
                      ["all", "Tous", allConversations.length],
                      ["unread", "Non lus", unreadConversations],
                      ["waiting", "Attente", waitingCount],
                      ["urgent", "Urgent", urgentCount],
                      ["resolved", "Résolus", resolvedCount],
                    ] as const
                  ).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="submit"
                      name="filter"
                      value={key}
                      className={`rounded-lg px-1 py-2 ${filter === key ? "bg-white text-ink shadow-sm" : "text-muted2"}`}
                    >
                      <span className="block truncate">{label}</span>
                      <span className="block opacity-70">{count}</span>
                    </button>
                  ))}
                </div>
              </form>
            </div>
            <div className="max-h-[calc(100dvh-315px)] overflow-y-auto xl:max-h-[710px]">
              {conversations.map((c) => {
                const params = new URLSearchParams();
                params.set("phone", c.phone);
                if (searchParams.q) params.set("q", searchParams.q);
                if (filter !== "all") params.set("filter", filter);
                return (
                  <Link
                    key={c.phone}
                    href={`/app/whatsapp/inbox?${params}`}
                    className={`block border-b border-line/70 p-3.5 transition sm:p-4 ${c.phone === selectedPhone ? "bg-electric/[0.06]" : "hover:bg-surface/70"}`}
                  >
                    <div className="flex gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${c.phone === selectedPhone ? "bg-electric text-white" : "bg-surface"}`}
                      >
                        {initials(c.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2">
                          <div className={`truncate text-sm ${c.unread ? "font-semibold" : "font-medium"}`}>
                            {c.name}
                          </div>
                          <div className="text-[10px] text-muted2">{formatListWhen(c.lastAt)}</div>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <ConversationStatusBadge status={c.status} compact />
                          <PriorityBadge priority={c.priority} compact />
                          {c.assignment ? (
                            <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">
                              {c.assignment.name.split(" ")[0]}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <div className="truncate text-xs text-muted2">{c.preview}</div>
                          {c.unread ? (
                            <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-ink">
                              {c.unread}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </aside>

          <section
            className={`${explicitConversation ? "flex" : "hidden xl:flex"} min-w-0 flex-col bg-surface-2`}
          >
            {selected ? (
              <>
                <div className="sticky top-0 z-20 border-b border-line bg-white px-3 py-3 sm:px-5 sm:py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Link
                        href={mobileBackHref}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-muted2 xl:hidden"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Link>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-electric text-sm font-semibold text-white sm:h-11 sm:w-11">
                        {initials(selected.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate font-semibold">{selected.name}</h2>
                          <span className="hidden sm:inline">
                            <ConversationStatusBadge status={selected.status} />
                          </span>
                          <span className="hidden sm:inline">
                            <PriorityBadge priority={selected.priority} />
                          </span>
                          {ban.banned ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-700">
                              BANNI
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted2">
                          +{selected.phone}
                          {selected.internalId ? ` · ${selected.internalId}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="hidden gap-2 md:flex">
                      {selected.unread ? (
                        <form action={markWhatsAppConversationRead.bind(null, selected.phone)}>
                          <Button variant="outline" size="sm">
                            <MailOpen className="h-4 w-4" /> Lu
                          </Button>
                        </form>
                      ) : null}
                      <form action={setWhatsAppConversationStatus.bind(null, selected.phone, "WAITING")}>
                        <Button variant="outline" size="sm">
                          En attente
                        </Button>
                      </form>
                      <form
                        action={setWhatsAppConversationStatus.bind(
                          null,
                          selected.phone,
                          selected.status === "RESOLVED" ? "OPEN" : "RESOLVED",
                        )}
                      >
                        <Button variant="outline" size="sm">
                          {selected.status === "RESOLVED" ? "Rouvrir" : "Résoudre"}
                        </Button>
                      </form>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5 md:hidden">
                    <ConversationStatusBadge status={selected.status} />
                    <PriorityBadge priority={selected.priority} />
                    {selected.unread ? (
                      <form action={markWhatsAppConversationRead.bind(null, selected.phone)}>
                        <button className="whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[10px] font-medium">
                          Marquer lu
                        </button>
                      </form>
                    ) : null}
                    <form action={setWhatsAppConversationStatus.bind(null, selected.phone, "WAITING")}>
                      <button className="whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[10px] font-medium">
                        En attente
                      </button>
                    </form>
                    <form
                      action={setWhatsAppConversationStatus.bind(
                        null,
                        selected.phone,
                        selected.status === "RESOLVED" ? "OPEN" : "RESOLVED",
                      )}
                    >
                      <button className="whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[10px] font-medium">
                        {selected.status === "RESOLVED" ? "Rouvrir" : "Résoudre"}
                      </button>
                    </form>
                  </div>
                </div>

                <div className="border-b border-line bg-white px-3 py-2 xl:hidden">
                  <MobileClientSummary selected={selected} clientSummary={clientSummary} ban={ban} />
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 md:px-6">
                  <div className="mx-auto max-w-4xl space-y-1.5">
                    {messages.map(({ row, payload }, index) => {
                      const previous = index > 0 ? messages[index - 1]?.payload : null;
                      const showDate = !previous || dayKey(previous.timestamp) !== dayKey(payload.timestamp);
                      const outbound = payload.direction === "OUTBOUND";
                      const documentLike = payload.type === "document" || payload.filename;
                      const delivery = outbound ? deliveryStatuses.get(payload.messageId) : null;
                      return (
                        <div key={row.id}>
                          {showDate ? (
                            <div className="my-3 flex items-center gap-3 text-[10px] uppercase text-muted2">
                              <div className="h-px flex-1 bg-line" />
                              <span>{formatDay(new Date(payload.timestamp))}</span>
                              <div className="h-px flex-1 bg-line" />
                            </div>
                          ) : null}
                          <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`min-w-[130px] max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[82%] md:max-w-[74%] ${outbound ? "rounded-br-md bg-surface-1 text-ink" : "rounded-bl-md border border-line bg-white"}`}
                            >
                              {payload.type !== "text" ? (
                                <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase opacity-70">
                                  <Paperclip className="h-3 w-3" />
                                  {payload.type}
                                </div>
                              ) : null}
                              {documentLike ? (
                                <div
                                  className={`mb-2 flex items-center gap-2 rounded-xl p-2.5 ${outbound ? "bg-ink/10" : "bg-surface"}`}
                                >
                                  <FileText className="h-5 w-5" />
                                  <div className="truncate text-xs font-semibold">
                                    {payload.filename || "Document WhatsApp"}
                                  </div>
                                </div>
                              ) : null}
                              <div className="whitespace-pre-wrap break-words">{payload.text}</div>
                              <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                                {formatTime(new Date(payload.timestamp))}
                                {outbound ? <DeliveryReceipt delivery={delivery} /> : null}
                                {outbound && row.user ? <span>· {row.user.firstName}</span> : null}
                              </div>
                              {delivery?.state === "FAILED" && delivery.reason ? (
                                <div className="mt-2 rounded-lg border border-red-300/25 bg-red-500/10 px-2.5 py-2 text-[10px] leading-relaxed text-red-100">
                                  <strong>Échec WhatsApp :</strong> {delivery.reason}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {ban.banned ? (
                  <div className="sticky bottom-0 border-t border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:p-4">
                    <div className="mx-auto max-w-4xl flex items-center gap-3">
                      <Ban className="h-5 w-5" />
                      <div>
                        <div className="font-semibold">Communication bloquée globalement</div>
                        <div className="text-xs">
                          WhatsApp et email sortants sont désactivés.
                          {ban.reason ? ` Motif : ${ban.reason}` : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form
                    action={replyWhatsAppConversation.bind(null, selected.phone)}
                    className="sticky bottom-0 z-10 border-t border-line bg-ink/95 px-2.5 py-2.5 backdrop-blur sm:px-4 sm:py-3"
                  >
                    <div className="mx-auto max-w-4xl rounded-2xl border border-line bg-white shadow-sm">
                      <Textarea
                        name="message"
                        rows={2}
                        required
                        maxLength={4096}
                        placeholder="Écrire une réponse…"
                        className="min-h-[56px] resize-none border-0 sm:min-h-[62px]"
                      />
                      <div className="flex items-center justify-between gap-2 border-t border-line px-2.5 py-2 sm:px-3">
                        <div className="min-w-0 text-[10px] text-muted2 sm:text-[11px]">
                          <span className="hidden sm:inline">
                            <Link href="/app/whatsapp" className="mr-3">
                              <FileText className="mr-1 inline h-3.5 w-3.5" />
                              Modèles
                            </Link>
                            <Link href="/app/documents" className="mr-3">
                              <Paperclip className="mr-1 inline h-3.5 w-3.5" />
                              Documents
                            </Link>
                          </span>
                          <span className="truncate">
                            <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                            {serviceWindowLabel(selected.lastInboundAt)}
                          </span>
                        </div>
                        <Button variant="primary" type="submit" size="sm">
                          <Send className="h-4 w-4" />
                          <span className="hidden sm:inline"> Envoyer</span>
                        </Button>
                      </div>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted2">
                Sélectionnez une conversation.
              </div>
            )}
          </section>

          <aside className="hidden border-l border-line bg-white xl:block">
            {selected ? (
              <div className="max-h-[780px] overflow-y-auto p-4">
                <div className="rounded-2xl border border-line bg-surface/45 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-electric/10 text-sm font-semibold text-electric">
                      {initials(selected.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{selected.name}</div>
                      <div className="truncate text-xs text-muted2">+{selected.phone}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <ConversationStatusBadge status={selected.status} />
                    <PriorityBadge priority={selected.priority} />
                    {selected.assignment ? <ContextTag label={selected.assignment.name} tone="blue" /> : null}
                  </div>
                  {selected.clientId ? (
                    <Link
                      href={`/app/clients/${selected.clientId}/dashboard`}
                      className="mt-3 block text-xs font-medium text-electric"
                    >
                      Ouvrir Client 360 →
                    </Link>
                  ) : null}
                </div>

                {clientSummary ? (
                  <>
                    <PanelSection title="Finance" icon={<DollarSign className="h-3.5 w-3.5" />} defaultOpen>
                      <div className="grid grid-cols-2 gap-2">
                        <MiniStat
                          label="Net reçu"
                          value={formatMoney(clientSummary.netReceived, clientSummary.primaryCurrency)}
                        />
                        <MiniStat
                          label="Remboursé"
                          value={formatMoney(clientSummary.refundPaid, clientSummary.primaryCurrency)}
                        />
                        <MiniStat
                          label="Dépenses"
                          value={formatMoney(clientSummary.expensePaid, clientSummary.primaryCurrency)}
                        />
                        <MiniStat
                          label="Profit"
                          value={formatMoney(clientSummary.realizedProfit, clientSummary.primaryCurrency)}
                        />
                      </div>
                      <Link
                        href={`/app/clients/${selected.clientId}/finance`}
                        className="mt-2 block text-xs font-medium text-electric"
                      >
                        Finance complète →
                      </Link>
                    </PanelSection>
                    <PanelSection title="Dossier attaché" icon={<Briefcase className="h-3.5 w-3.5" />}>
                      <form
                        action={setWhatsAppConversationCase.bind(null, selected.phone)}
                        className="space-y-2"
                      >
                        <select
                          name="caseId"
                          defaultValue={selected.attachedCaseId || ""}
                          className="w-full rounded-lg border border-line bg-white px-2 py-2 text-xs"
                        >
                          <option value="">— Aucun dossier —</option>
                          {clientSummary.cases.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.caseNumber} · {c.title}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" variant="outline" className="w-full">
                          Enregistrer
                        </Button>
                      </form>
                    </PanelSection>
                    <PanelSection title="Activité récente" icon={<Activity className="h-3.5 w-3.5" />}>
                      <div className="space-y-2">
                        {clientSummary.activities.length ? (
                          clientSummary.activities.slice(0, 4).map((a) => (
                            <div key={a.id} className="rounded-lg bg-surface p-2 text-xs">
                              <div className="font-medium text-ink">{a.type.replaceAll("_", " ")}</div>
                              <div className="mt-0.5 line-clamp-2 text-muted2">{a.message}</div>
                              <div className="mt-1 text-[10px] text-muted2">{formatWhen(a.createdAt)}</div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-muted2">Aucune activité récente.</div>
                        )}
                      </div>
                    </PanelSection>
                    <PanelSection title="Indicateurs" icon={<WalletCards className="h-3.5 w-3.5" />}>
                      <div className="grid grid-cols-3 gap-2">
                        <MiniStat label="Dossiers" value={String(clientSummary.cases.length)} />
                        <MiniStat label="Documents" value={String(clientSummary.documentCount)} />
                        <MiniStat label="Paiements" value={String(clientSummary.paymentCount)} />
                      </div>
                    </PanelSection>
                  </>
                ) : null}

                <PanelSection title="Gestion conversation" icon={<UserCog className="h-3.5 w-3.5" />}>
                  <div className="grid grid-cols-2 gap-2">
                    <form action={assignWhatsAppConversationToMe.bind(null, selected.phone)}>
                      <Button variant="outline" size="sm" className="w-full">
                        <UserPlus className="h-3.5 w-3.5" /> À moi
                      </Button>
                    </form>
                    <form action={unassignWhatsAppConversation.bind(null, selected.phone)}>
                      <Button variant="outline" size="sm" className="w-full">
                        <UserMinus className="h-3.5 w-3.5" /> Libérer
                      </Button>
                    </form>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {(["NORMAL", "HIGH", "URGENT"] as const).map((p) => (
                      <form key={p} action={setWhatsAppConversationPriority.bind(null, selected.phone, p)}>
                        <button
                          className={`w-full rounded-lg border px-1 py-2 text-[9px] font-semibold ${selected.priority === p ? "border-electric bg-electric/5 text-electric" : "border-line text-muted2"}`}
                        >
                          {p === "NORMAL" ? "Normal" : p === "HIGH" ? "Haute" : "Urgente"}
                        </button>
                      </form>
                    ))}
                  </div>
                </PanelSection>
                <PanelSection title="Tags" icon={<Tag className="h-3.5 w-3.5" />}>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {selected.tags.map((tag) => (
                      <ContextTag key={tag} label={tag} tone="blue" />
                    ))}
                  </div>
                  <form
                    action={updateWhatsAppConversationTags.bind(null, selected.phone)}
                    className="flex gap-2"
                  >
                    <input
                      name="tags"
                      defaultValue={selected.tags.join(", ")}
                      className="min-w-0 flex-1 rounded-lg border border-line px-2 py-2 text-xs"
                    />
                    <Button size="sm" variant="outline">
                      Sauver
                    </Button>
                  </form>
                </PanelSection>
                <PanelSection title="Actions rapides" icon={<ClipboardList className="h-3.5 w-3.5" />}>
                  <div className="grid gap-2">
                    {selected.clientId ? (
                      <QuickLink
                        href={`/app/clients/${selected.clientId}/dashboard`}
                        icon={<UserRound className="h-4 w-4" />}
                        label="Client 360"
                      />
                    ) : null}
                    {selected.attachedCaseId ? (
                      <QuickLink
                        href={`/app/cases/${selected.attachedCaseId}/dashboard`}
                        icon={<Briefcase className="h-4 w-4" />}
                        label="Dossier attaché"
                      />
                    ) : null}
                    <QuickLink
                      href="/app/documents"
                      icon={<FolderOpen className="h-4 w-4" />}
                      label="Documents"
                    />
                    <QuickLink
                      href="/app/finance/payments"
                      icon={<CreditCard className="h-4 w-4" />}
                      label="Paiements"
                    />
                  </div>
                </PanelSection>
                <PanelSection title="Notes internes" icon={<StickyNote className="h-3.5 w-3.5" />}>
                  <form action={addWhatsAppInternalNote.bind(null, selected.phone)} className="space-y-2">
                    <textarea
                      name="note"
                      rows={3}
                      maxLength={2000}
                      placeholder="Note invisible au client…"
                      className="w-full resize-none rounded-xl border border-line px-3 py-2 text-xs"
                    />
                    <Button size="sm" variant="outline">
                      Ajouter
                    </Button>
                  </form>
                  <div className="mt-3 space-y-2">
                    {selected.notes.slice(0, 3).map((note) => (
                      <div key={note.id} className="rounded-xl bg-surface p-3 text-xs">
                        <div>{note.text}</div>
                        <div className="mt-1 text-[10px] text-muted2">
                          {note.author} · {formatWhen(new Date(note.createdAt))}
                        </div>
                      </div>
                    ))}
                  </div>
                </PanelSection>
                <PanelSection title="Sécurité / Ban" icon={<Ban className="h-3.5 w-3.5" />}>
                  {selected.clientId ? (
                    ban.banned ? (
                      <>
                        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                          <div className="font-bold">CLIENT BANNI PARTOUT</div>
                          <div className="mt-1">
                            WhatsApp + Email bloqués.{ban.reason ? ` ${ban.reason}` : ""}
                          </div>
                        </div>
                        <form
                          action={setWhatsAppClientCommunicationBan.bind(null, selected.phone, false)}
                          className="mt-2"
                        >
                          <Button variant="outline" size="sm" className="w-full">
                            <ShieldOff className="h-4 w-4" /> Lever le ban
                          </Button>
                        </form>
                      </>
                    ) : (
                      <form
                        action={setWhatsAppClientCommunicationBan.bind(null, selected.phone, true)}
                        className="space-y-2"
                      >
                        <textarea
                          name="reason"
                          rows={2}
                          placeholder="Motif…"
                          className="w-full resize-none rounded-lg border border-line px-2 py-2 text-xs"
                        />
                        <Button variant="outline" size="sm" className="w-full">
                          <Ban className="h-4 w-4" /> Bannir partout
                        </Button>
                      </form>
                    )
                  ) : (
                    <div className="text-xs text-muted2">Le contact doit être lié à un client.</div>
                  )}
                </PanelSection>
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

function MobileClientSummary({
  selected,
  clientSummary,
  ban,
}: {
  selected: any;
  clientSummary: Awaited<ReturnType<typeof loadClientSummary>> | null;
  ban: any;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1 py-1 text-xs font-medium text-ink">
        <span className="flex min-w-0 items-center gap-2">
          <UserRound className="h-4 w-4 text-electric" />
          <span className="truncate">Résumé client</span>
          {clientSummary ? (
            <span className="text-muted2">
              · {formatMoney(clientSummary.netReceived, clientSummary.primaryCurrency)} net
            </span>
          ) : null}
        </span>
        <span className="text-[10px] text-electric group-open:hidden">Voir</span>
        <span className="hidden text-[10px] text-electric group-open:inline">Fermer</span>
      </summary>
      <div className="mt-2 grid gap-2 rounded-xl bg-surface/60 p-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          {clientSummary ? (
            <>
              <MiniStat
                label="Net reçu"
                value={formatMoney(clientSummary.netReceived, clientSummary.primaryCurrency)}
              />
              <MiniStat
                label="Profit"
                value={formatMoney(clientSummary.realizedProfit, clientSummary.primaryCurrency)}
              />
              <MiniStat label="Documents" value={String(clientSummary.documentCount)} />
              <MiniStat label="Dossiers" value={String(clientSummary.cases.length)} />
            </>
          ) : (
            <MiniStat label="Téléphone" value={`+${selected.phone}`} />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.clientId ? (
            <Link
              href={`/app/clients/${selected.clientId}/dashboard`}
              className="rounded-lg border border-line bg-white px-2.5 py-2 font-medium text-electric"
            >
              Client 360
            </Link>
          ) : null}
          {selected.attachedCaseId ? (
            <Link
              href={`/app/cases/${selected.attachedCaseId}/dashboard`}
              className="rounded-lg border border-line bg-white px-2.5 py-2 font-medium"
            >
              Dossier
            </Link>
          ) : null}
          {ban.banned ? (
            <span className="rounded-lg bg-red-50 px-2.5 py-2 font-semibold text-red-700">
              Communication bloquée
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}

async function loadClientSummary(clientId: string) {
  const [cases, activities, documentCount, finance] = await Promise.all([
    prisma.case.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: { id: true, caseNumber: true, title: true, status: true },
    }),
    prisma.activity.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, type: true, message: true, createdAt: true },
    }),
    prisma.document.count({ where: { clientId } }),
    getClientFinanceOverview(clientId),
  ]);
  const preferred = finance.summaries.find((s) => s.currency === "USD") || finance.summaries[0];
  const primaryCurrency = preferred?.currency || "USD";
  return {
    cases,
    activities,
    documentCount,
    paymentCount: finance.payments.length,
    refundCount: finance.refunds.length,
    primaryCurrency,
    grossReceived: preferred?.grossReceived || 0,
    netReceived: preferred?.netReceived || 0,
    approvedRefunds: preferred?.approvedRefunds || 0,
    refundPaid: preferred?.refundPaid || 0,
    expensePaid: preferred?.expensePaid || 0,
    realizedProfit: preferred?.realizedProfit || 0,
  };
}

function rowPhone(row: Row) {
  if (row.resourceType === "WhatsAppConversation")
    return normalizeWhatsAppPhone(String(row.resourceId || ""));
  return normalizeWhatsAppPhone(row.client?.whatsapp || row.client?.phone || "");
}
function payloadForRow(row: Row): WhatsAppInboxPayload | null {
  const d = decodeWhatsAppInboxPayload(row.message);
  if (d) return d;
  if (row.type !== "WHATSAPP_ACCEPTED") return null;
  const phone = rowPhone(row);
  if (!phone) return null;
  const messageId = String(row.message || "").match(/\s·\s([^\s·]+)\s*$/)?.[1] || `legacy-${row.id}`;
  const dm = row.message.match(/^Document\s+(.+?)\s+accepted by Meta/i),
    sm = row.message.match(/^Statement\s+(.+?)\s+accepted by Meta/i);
  if (dm) {
    const r = dm[1].trim();
    return {
      direction: "OUTBOUND",
      phone,
      messageId,
      type: "document",
      text: `Document envoyé · ${r}`,
      filename: `${r}.pdf`,
      timestamp: row.createdAt.toISOString(),
    };
  }
  if (sm) {
    const r = sm[1].trim();
    return {
      direction: "OUTBOUND",
      phone,
      messageId,
      type: "document",
      text: `Relevé envoyé · ${r}`,
      filename: `${r}.pdf`,
      timestamp: row.createdAt.toISOString(),
    };
  }
  return {
    direction: "OUTBOUND",
    phone,
    messageId,
    type: row.message.startsWith("WhatsApp template") ? "template" : "text",
    text: "Message WhatsApp envoyé",
    timestamp: row.createdAt.toISOString(),
  };
}
function groupConversations(rows: Row[]) {
  const map = new Map<
    string,
    {
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
    }
  >();
  for (const row of rows) {
    const phone = rowPhone(row);
    if (!phone) continue;
    const payload = payloadForRow(row);
    if (!payload) continue;
    const existing = map.get(phone),
      inbound = payload.direction === "INBOUND";
    if (!existing)
      map.set(phone, {
        phone,
        name: row.client
          ? `${row.client.firstName} ${row.client.lastName}`
          : payload.contactName || `+${phone}`,
        clientId: row.client?.id || null,
        internalId: row.client?.internalId || null,
        caseId: row.case?.id || null,
        caseNumber: row.case?.caseNumber || null,
        preview: payload.text,
        lastAt: row.createdAt,
        lastInboundAt: inbound ? new Date(payload.timestamp) : null,
        unread: row.type === "WHATSAPP_INBOUND_UNREAD" ? 1 : 0,
      });
    else {
      if (row.type === "WHATSAPP_INBOUND_UNREAD") existing.unread++;
      if (!existing.lastInboundAt && inbound) existing.lastInboundAt = new Date(payload.timestamp);
      if (!existing.clientId && row.client) {
        existing.clientId = row.client.id;
        existing.internalId = row.client.internalId;
        existing.name = `${row.client.firstName} ${row.client.lastName}`;
      }
      if (!existing.caseId && row.case) {
        existing.caseId = row.case.id;
        existing.caseNumber = row.case.caseNumber;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}
function dedupeTimeline<T extends { row: Row; payload: WhatsAppInboxPayload }>(items: T[]) {
  const result: T[] = [],
    seen = new Set<string>();
  for (const item of items) {
    const id = item.payload.messageId;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    result.push(item);
  }
  return result;
}
function buildDeliveryStatuses(rows: Row[]) {
  const out = new Map<string, DeliveryInfo>();
  for (const row of rows) {
    const state = deliveryStateFromType(row.type);
    if (!state) continue;
    const messageId = extractWhatsAppMessageId(row.message);
    if (!messageId || out.has(messageId)) continue;
    out.set(messageId, {
      state,
      at: row.createdAt,
      reason: state === "FAILED" ? extractFailureReason(row.message) : null,
    });
  }
  return out;
}
function deliveryStateFromType(type: string): DeliveryState | null {
  if (type === "WHATSAPP_ACCEPTED") return "ACCEPTED";
  if (type === "WHATSAPP_SENT") return "SENT";
  if (type === "WHATSAPP_DELIVERED") return "DELIVERED";
  if (type === "WHATSAPP_READ") return "READ";
  if (type === "WHATSAPP_FAILED") return "FAILED";
  return null;
}
function extractWhatsAppMessageId(message: string) {
  return message.match(/(wamid\.[^\s·]+)/)?.[1] || message.match(/\s·\s([^\s·]+)\s*(?:·|$)/)?.[1] || null;
}
function extractFailureReason(message: string) {
  const parts = message.split(" · ");
  if (parts.length <= 2) return message.slice(0, 700);
  return parts.slice(2).join(" · ").slice(0, 700);
}
function DeliveryReceipt({ delivery }: { delivery: DeliveryInfo | null | undefined }) {
  if (!delivery)
    return (
      <span className="inline-flex items-center gap-0.5">
        <CheckCheck className="h-3.5 w-3.5" />
        <span>Accepté</span>
      </span>
    );
  if (delivery.state === "FAILED")
    return (
      <span className="inline-flex items-center gap-1 font-medium text-danger">
        <AlertTriangle className="h-3.5 w-3.5" />
        Échec
      </span>
    );
  if (delivery.state === "READ")
    return (
      <span className="inline-flex items-center gap-1 font-medium text-sky-300">
        <CheckCheck className="h-3.5 w-3.5" />
        Lu
      </span>
    );
  if (delivery.state === "DELIVERED")
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckCheck className="h-3.5 w-3.5" />
        Livré
      </span>
    );
  if (delivery.state === "SENT")
    return (
      <span className="inline-flex items-center gap-1">
        <CheckCheck className="h-3.5 w-3.5" />
        Envoyé
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <Clock3 className="h-3.5 w-3.5" />
      Accepté
    </span>
  );
}
function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "WA"
  );
}
function formatWhen(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
function formatTime(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(value);
}
function formatListWhen(value: Date) {
  return dayKey(new Date()) === dayKey(value)
    ? formatTime(value)
    : new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(value);
}
function dayKey(value: Date | string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function formatDay(value: Date) {
  const now = new Date(),
    y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (dayKey(value) === dayKey(now)) return "Aujourd’hui";
  if (dayKey(value) === dayKey(y)) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "long" }).format(value);
}
function serviceWindowLabel(lastInboundAt: Date | null) {
  if (!lastInboundAt) return "Fenêtre Meta indisponible";
  const r = lastInboundAt.getTime() + 86400000 - Date.now();
  if (r <= 0) return "Fenêtre expirée · modèle requis";
  return `Fenêtre active · ${Math.floor(r / 3600000)} h ${Math.floor((r % 3600000) / 60000)
    .toString()
    .padStart(2, "0")}`;
}
function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(value);
}
function ConversationStatusBadge({
  status,
  compact = false,
}: {
  status: ConversationStatus;
  compact?: boolean;
}) {
  const s =
    status === "RESOLVED"
      ? "bg-slate-100 text-ink-2"
      : status === "WAITING"
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";
  return (
    <span
      className={`rounded-full font-semibold ${s} ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"}`}
    >
      {status === "RESOLVED" ? "Résolu" : status === "WAITING" ? "En attente" : "Ouvert"}
    </span>
  );
}
function PriorityBadge({ priority, compact = false }: { priority: ConversationPriority; compact?: boolean }) {
  if (priority === "NORMAL")
    return compact ? null : (
      <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted2">
        <Star className="mr-1 inline h-3 w-3" />
        Normal
      </span>
    );
  const u = priority === "URGENT";
  return (
    <span
      className={`rounded-full font-semibold ${u ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"} ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"}`}
    >
      {u ? <AlertTriangle className="mr-1 inline h-3 w-3" /> : <Flame className="mr-1 inline h-3 w-3" />}
      {u ? "Urgente" : "Haute"}
    </span>
  );
}
function ContextTag({
  label,
  tone = "green",
}: {
  label: string;
  tone?: "green" | "amber" | "blue" | "slate";
}) {
  const s =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : tone === "slate"
          ? "bg-slate-100 text-ink-2"
          : "bg-emerald-50 text-emerald-700";
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${s}`}>{label}</span>;
}
function Metric({
  label,
  value,
  emphasis = false,
  danger = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-xs ${danger ? "border-red-200 bg-red-50 text-red-700" : emphasis ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-line bg-white text-muted2"}`}
    >
      <strong className="text-ink">{value}</strong> {label}
    </div>
  );
}
function PanelSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group mt-3 rounded-xl border border-line bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted2">
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <span className="text-[9px] text-electric group-open:hidden">Ouvrir</span>
        <span className="hidden text-[9px] text-electric group-open:inline">Fermer</span>
      </summary>
      <div className="border-t border-line px-3 py-3">{children}</div>
    </details>
  );
}
function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm font-medium hover:bg-surface"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ExternalLink className="h-3.5 w-3.5 text-muted2" />
    </Link>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface p-2.5">
      <div className="text-[9px] uppercase tracking-wide text-muted2">{label}</div>
      <div className="mt-1 truncate text-xs font-semibold text-ink">{value}</div>
    </div>
  );
}
