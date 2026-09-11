import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getAccessibleMailboxIds } from "@/lib/mail-security";
import { getMailThreadStateMap, isSnoozed } from "@/lib/mail-thread-state";
import { getMailConversation } from "@/lib/mail-thread-reader";
import { getCachedMailConversation } from "@/lib/mail-thread-cache";
import { MailLive } from "./mail-live";
import { getGmailMailboxCacheMap } from "@/lib/mail-gmail-cache";
import { syncMailboxV2, syncAllMailboxesV2 } from "@/services/mail-sync-v2";
import {
  archiveMailThread,
  markMailThreadRead,
  markMailThreadUnread,
  restoreMailThread,
  snoozeMailThread,
  toggleMailThreadStar,
  trashMailThread,
} from "@/services/mail-workspace";
import { EmailHtmlFrame } from "@/components/mail/email-html-frame";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import {
  Archive,
  ArrowLeft,
  Bell,
  Clock3,
  FileEdit,
  Inbox,
  RefreshCw,
  Search,
  Send,
  Star,
  Tag,
  Trash2,
  Users,
  MoreHorizontal,
  Reply,
  ReplyAll,
  Forward,
  PenSquare,
} from "lucide-react";

const LIMIT = 20;
const QUERY_LIMIT = 200;
const SERVICES = [
  { email: "contact@juncreatifs.org", label: "Contact", color: "bg-accent/15 text-accent" },
  { email: "support@juncreatifs.org", label: "Support client", color: "bg-success/15 text-success" },
  { email: "finance@juncreatifs.org", label: "Finance", color: "bg-warning/15 text-warning" },
  { email: "travel@juncreatifs.org", label: "Voyages", color: "bg-cyan-500/15 text-cyan-400" },
  { email: "documents@juncreatifs.org", label: "Documents", color: "bg-violet-500/15 text-violet-400" },
  { email: "legal@juncreatifs.org", label: "Juridique", color: "bg-rose-500/15 text-rose-400" },
  { email: "info@juncreatifs.org", label: "Informations", color: "bg-indigo-500/15 text-indigo-400" },
  { email: "noreply@juncreatifs.org", label: "Automatique", color: "bg-neutral/15 text-ink-3" },
] as const;
type Service = (typeof SERVICES)[number];

const FOLDERS = [
  { key: "INBOX", label: "Réception", icon: Inbox },
  { key: "STARRED", label: "Suivis", icon: Star },
  { key: "SNOOZED", label: "Reportés", icon: Clock3 },
  { key: "DRAFTS", label: "Brouillons", icon: FileEdit },
  { key: "SENT", label: "Envoyés", icon: Send },
  { key: "ARCHIVE", label: "Archives", icon: Archive },
  { key: "TRASH", label: "Corbeille", icon: Trash2 },
] as const;
const CATEGORIES = [
  { key: "PRIMARY", label: "Principale", icon: Inbox },
  { key: "PROMOTIONS", label: "Promotions", icon: Tag },
  { key: "SOCIAL", label: "Réseaux sociaux", icon: Users },
  { key: "UPDATES", label: "Mises à jour", icon: Bell },
] as const;
type FolderKey = (typeof FOLDERS)[number]["key"];
type CategoryKey = (typeof CATEGORIES)[number]["key"];
type Params = {
  folder?: string;
  thread?: string;
  q?: string;
  mailbox?: string;
  category?: string;
  alias?: string;
};

function serviceForThread(thread: { toEmails: string[]; fromEmail: string | null }): Service | undefined {
  const addresses = [...thread.toEmails, thread.fromEmail || ""].map((value) => value.toLowerCase());
  return SERVICES.find((service) => addresses.some((value) => value.includes(service.email)));
}

function ServiceBadge({ service }: { service: Service }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${service.color}`}>
      {service.label}
    </span>
  );
}

function senderLabel(raw: string | null) {
  const v = (raw || "").trim();
  const name = v.match(/^\s*"?([^"<]+)"?\s*</)?.[1]?.trim();
  if (name) return name;
  const email = v.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] || v;
  return email.split("@")[0] || "Unknown";
}
function senderEmail(raw: string) {
  return raw.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] || raw;
}
function shortDate(d: Date | null) {
  if (!d) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function relativeFr(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return "à l’instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `il y a ${h} h` : `il y a ${Math.floor(h / 24)} j`;
}
function initial(raw: string | null) {
  return senderLabel(raw).charAt(0).toUpperCase();
}

export async function GmailStyleMailCenterV6({ searchParams }: { searchParams: Params }) {
  const user = await requireUser();
  if (!can(user, "EMAIL_READ")) redirect("/app/forbidden");
  const canDraft = can(user, "EMAIL_DRAFT");
  const accessibleIds = await getAccessibleMailboxIds(user, true);
  const accounts = accessibleIds.length
    ? await prisma.mailAccount.findMany({
        where: {
          id: { in: accessibleIds },
          OR: [{ accessTokenEnc: { not: null } }, { refreshTokenEnc: { not: null } }],
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, displayName: true },
      })
    : [];
  const accountIds = accounts.map((a) => a.id),
    requested = searchParams.mailbox || "";
  const mailbox =
    requested === "ALL"
      ? "ALL"
      : accountIds.includes(requested)
        ? requested
        : accounts.length === 1
          ? accounts[0].id
          : "ALL";
  const folder: FolderKey = FOLDERS.some((f) => f.key === searchParams.folder)
    ? (searchParams.folder as FolderKey)
    : "INBOX";
  const category: CategoryKey = CATEGORIES.some((c) => c.key === searchParams.category)
    ? (searchParams.category as CategoryKey)
    : "PRIMARY";
  const scopedIds = mailbox === "ALL" ? accountIds : [mailbox];
  const q = (searchParams.q || "").trim().toLowerCase();
  const selectedAlias = SERVICES.some((service) => service.email === searchParams.alias)
    ? searchParams.alias
    : "";
  const threadQuery = searchParams.thread && accountIds.length ? searchParams.thread : null;
  const [recent, cacheMap, activeThread] = await Promise.all([
    scopedIds.length
      ? prisma.mailThread.findMany({
          where: { mailAccountId: { in: scopedIds } },
          orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
          take: QUERY_LIMIT,
          include: { account: { select: { id: true, email: true, displayName: true } } },
        })
      : Promise.resolve([]),
    getGmailMailboxCacheMap(scopedIds),
    threadQuery
      ? prisma.mailThread.findFirst({
          where: { id: threadQuery, mailAccountId: { in: accountIds } },
          include: { account: true },
        })
      : Promise.resolve(null),
  ]);
  const stateIds = recent.map((t) => t.id);
  if (activeThread && !stateIds.includes(activeThread.id)) stateIds.push(activeThread.id);
  const [stateMap, conversationResult] = await Promise.all([
    getMailThreadStateMap(stateIds),
    activeThread && !activeThread.aiDraft
      ? getCachedMailConversation(activeThread).catch(() => ({ messages: [], source: "gmail" as const }))
      : Promise.resolve({ messages: [], source: "cache" as const }),
  ]);
  const conversation = conversationResult.messages;
  const sent = (t: (typeof recent)[number]) =>
    Boolean(t.fromEmail?.toLowerCase().includes(t.account.email.toLowerCase()) && !t.aiDraft);
  const visible = (t: (typeof recent)[number]) => {
    const s = stateMap.get(t.id)!;
    return !s.trashed && !s.archived && !isSnoozed(s);
  };
  const inFolder = (t: (typeof recent)[number]) => {
    const s = stateMap.get(t.id)!;
    if (folder === "TRASH") return s.trashed;
    if (folder === "ARCHIVE") return s.archived && !s.trashed;
    if (folder === "SNOOZED") return isSnoozed(s) && !s.trashed;
    if (folder === "DRAFTS") return Boolean(t.aiDraft) && !s.trashed;
    if (folder === "SENT") return sent(t) && !s.trashed;
    if (folder === "STARRED") return s.starred && !s.trashed;
    if (folder === "INBOX") {
      const cached = cacheMap.get(t.mailAccountId)?.categoryByThreadId?.[t.gmailThreadId];
      return (
        visible(t) && !sent(t) && !t.aiDraft && (cached === category || (category === "PRIMARY" && !cached))
      );
    }
    return visible(t);
  };
  const matches = (t: (typeof recent)[number]) =>
    !q || `${t.subject ?? ""} ${t.fromEmail ?? ""} ${t.snippet ?? ""}`.toLowerCase().includes(q);
  const folderThreads = recent.filter((t) => inFolder(t) && matches(t));
  const serviceCounts = new Map(
    SERVICES.map((service) => [
      service.email,
      folderThreads.filter((thread) => serviceForThread(thread)?.email === service.email).length,
    ]),
  );
  const threads = folderThreads
    .filter((thread) => !selectedAlias || serviceForThread(thread)?.email === selectedAlias)
    .slice(0, LIMIT);
  const activeService = activeThread ? serviceForThread(activeThread) : undefined;
  const inboxUnread = scopedIds.reduce(
    (sum, id) =>
      sum +
      (cacheMap.get(id)?.labelStats?.INBOX?.threadsUnread ??
        cacheMap.get(id)?.labelStats?.INBOX?.messagesUnread ??
        0),
    0,
  );
  const activeState = activeThread ? (stateMap.get(activeThread.id) ?? null) : null;
  const syncedAt = scopedIds
    .map((id) => cacheMap.get(id)?.updatedAt)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;
  const mailboxLabel =
    mailbox === "ALL" ? "Toutes les boîtes" : (accounts.find((a) => a.id === mailbox)?.email ?? "Mail");
  const qp = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    p.set("mailbox", mailbox);
    p.set("folder", folder);
    if (folder === "INBOX") p.set("category", category);
    if (q) p.set("q", q);
    if (selectedAlias) p.set("alias", selectedAlias);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/app/mail?${p.toString()}`;
  };

  const composeHref = `/app/mail/compose?mailbox=${mailbox === "ALL" ? accounts[0]?.id || "" : mailbox}`;

  /* ───────────────────────── Thread view ───────────────────────── */
  if (activeThread && activeState) {
    const replyHref = (mode: "REPLY" | "REPLY_ALL" | "FORWARD") =>
      `/app/mail/compose?mailbox=${activeThread.mailAccountId}&source=${activeThread.id}&mode=${mode}`;
    const actions = (
      <ThreadActions
        thread={{ id: activeThread.id }}
        state={activeState}
        folder={folder}
        onRestoreTo="INBOX"
      />
    );
    return (
      <>
        {/* Mobile: full-screen reader */}
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas lg:hidden">
          <div className="flex items-center gap-1 border-b border-line bg-surface-1 px-2 pb-2 pt-[max(8px,env(safe-area-inset-top))]">
            <Link
              href={qp({ thread: undefined })}
              aria-label="Retour"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <p className="min-w-0 flex-1 truncate px-1 text-sm text-ink-3">{mailboxLabel}</p>
            <form action={toggleMailThreadStar.bind(null, activeThread.id, folder)}>
              <button
                aria-label={activeState.starred ? "Retirer le suivi" : "Suivre"}
                className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
              >
                <Star className={`h-5 w-5 ${activeState.starred ? "fill-warning text-warning" : ""}`} />
              </button>
            </form>
            <Sheet
              title="Actions"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
              trigger={<MoreHorizontal className="h-5 w-5" />}
            >
              {actions}
            </Sheet>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <h1 className="px-1 font-display text-[22px] font-medium leading-tight text-ink">
              {activeThread.subject || "(sans objet)"}
            </h1>
            {activeService ? (
              <div className="mt-2">
                <ServiceBadge service={activeService} />
              </div>
            ) : null}
            <div className="mt-4 space-y-4">
              {conversation.length ? (
                conversation.map((m) => <MessageCard key={m.id} m={m} />)
              ) : (
                <p className="py-10 text-sm text-ink-3">Impossible de charger la conversation.</p>
              )}
            </div>
          </div>
          {conversation.length && canDraft ? (
            <div className="grid grid-cols-3 gap-2 border-t border-line bg-surface-1 px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
              <Link href={replyHref("REPLY")} className={mobileReplyBtn}>
                <Reply className="h-4 w-4" /> Répondre
              </Link>
              <Link href={replyHref("REPLY_ALL")} className={mobileReplyBtn}>
                <ReplyAll className="h-4 w-4" /> À tous
              </Link>
              <Link href={replyHref("FORWARD")} className={mobileReplyBtn}>
                <Forward className="h-4 w-4" /> Transférer
              </Link>
            </div>
          ) : null}
        </div>

        {/* Desktop reader */}
        <div className="hidden overflow-hidden rounded-xl border border-line bg-surface-1 text-ink shadow-card lg:block">
          <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-line px-3">
            <Link href={qp({ thread: undefined })}>
              <Button size="sm" variant="ghost">
                <ArrowLeft className="h-4 w-4" /> Retour
              </Button>
            </Link>
            <div className="flex flex-wrap gap-2 [&_button]:h-8">{actions}</div>
            <div className="ml-auto text-xs text-ink-3">{mailboxLabel}</div>
          </div>
          <div className="px-6 py-5 md:px-8">
            <h1 className="mb-5 font-display text-2xl font-medium leading-tight text-ink">
              {activeThread.subject || "(sans objet)"}
            </h1>
            {activeService ? (
              <div className="-mt-3 mb-5 flex items-center gap-2">
                <ServiceBadge service={activeService} />
                <span className="text-xs text-ink-3">{activeService.email}</span>
              </div>
            ) : null}
            {conversation.length ? (
              <div className="space-y-4">
                {conversation.map((m, i) => (
                  <MessageCard key={m.id} m={m} last={i === conversation.length - 1}>
                    {i === conversation.length - 1 && canDraft ? (
                      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                        <Link href={replyHref("REPLY")}>
                          <Button variant="outline" size="sm">
                            <Reply className="h-4 w-4" /> Répondre
                          </Button>
                        </Link>
                        <Link href={replyHref("REPLY_ALL")}>
                          <Button variant="outline" size="sm">
                            <ReplyAll className="h-4 w-4" /> Répondre à tous
                          </Button>
                        </Link>
                        <Link href={replyHref("FORWARD")}>
                          <Button variant="outline" size="sm">
                            <Forward className="h-4 w-4" /> Transférer
                          </Button>
                        </Link>
                      </div>
                    ) : null}
                  </MessageCard>
                ))}
              </div>
            ) : (
              <p className="py-10 text-sm text-ink-3">Impossible de charger la conversation.</p>
            )}
          </div>
        </div>
      </>
    );
  }

  /* ───────────────────────── List view ───────────────────────── */
  const syncForm = accounts.length ? (
    <form action={mailbox === "ALL" ? syncAllMailboxesV2 : syncMailboxV2.bind(null, mailbox)}>
      <Button size="sm" variant="outline">
        <RefreshCw className="h-4 w-4" /> Synchroniser
      </Button>
    </form>
  ) : null;

  const rows = threads.length ? (
    threads.map((t) => {
      const s = stateMap.get(t.id)!;
      const unread = !s.isRead;
      const service = serviceForThread(t);
      return (
        <div
          key={t.id}
          className={`flex items-center gap-3 border-b border-line px-3 py-2.5 transition-colors hover:bg-surface-2 lg:px-4 ${unread ? "bg-surface-1" : "bg-surface-1"}`}
        >
          <form action={toggleMailThreadStar.bind(null, t.id, folder)} className="hidden lg:block">
            <button
              type="submit"
              aria-label={s.starred ? "Retirer le suivi" : "Suivre"}
              className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <Star className={`h-4 w-4 ${s.starred ? "fill-warning text-warning" : ""}`} />
            </button>
          </form>
          <Link href={qp({ thread: t.id })} className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold lg:hidden ${
                unread ? "bg-accent text-accent-fg" : "tint-accent text-accent"
              }`}
            >
              {initial(t.fromEmail)}
            </span>
            <span className="min-w-0 flex-1 lg:grid lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-center lg:gap-3">
              <span className="flex items-baseline justify-between gap-2 lg:contents">
                <span
                  className={`truncate text-[15px] lg:text-sm ${unread ? "font-semibold text-ink" : "text-ink"}`}
                >
                  {senderLabel(t.fromEmail)}
                </span>
                <span
                  className={`shrink-0 text-2xs tabular-nums lg:order-last lg:text-xs ${unread ? "text-accent lg:text-ink-2" : "text-ink-3"}`}
                >
                  {shortDate(t.lastMessageAt)}
                </span>
              </span>
              <span className="mt-0.5 block min-w-0 truncate text-sm lg:mt-0">
                <span className="inline-flex min-w-0 items-center gap-2">
                  {service ? <ServiceBadge service={service} /> : null}
                  <span className={unread ? "font-semibold text-ink" : "text-ink"}>
                    {t.subject || "(sans objet)"}
                  </span>
                </span>
                <span className="text-ink-3"> — {t.snippet || ""}</span>
              </span>
            </span>
            {s.starred ? <Star className="h-4 w-4 shrink-0 fill-warning text-warning lg:hidden" /> : null}
          </Link>
        </div>
      );
    })
  ) : (
    <div className="px-4 py-16 text-center">
      <Inbox className="mx-auto h-8 w-8 text-ink-3" />
      <p className="mt-3 text-sm text-ink-2">Aucun message dans les {LIMIT} derniers.</p>
      <div className="mt-4 flex justify-center">{syncForm}</div>
    </div>
  );

  return (
    <>
      <MailLive />
      {/* Mobile list */}
      <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:hidden">
        <div className="sticky top-16 z-20 border-b border-line bg-canvas/95 px-4 pb-2.5 pt-3 backdrop-blur-md">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-[26px] font-medium leading-none tracking-tight text-ink">
                Mail
              </h1>
              <p className="mt-1.5 truncate text-xs text-ink-3">
                {inboxUnread > 0 ? `${inboxUnread} non lu${inboxUnread > 1 ? "s" : ""} · ` : ""}
                {mailboxLabel}
              </p>
            </div>
            {canDraft && accounts.length ? (
              <Link
                href={composeHref}
                aria-label="Nouveau message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg shadow-card"
              >
                <PenSquare className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
          <form className="mt-3">
            <input type="hidden" name="mailbox" value={mailbox} />
            <input type="hidden" name="folder" value={folder} />
            {folder === "INBOX" ? <input type="hidden" name="category" value={category} /> : null}
            {selectedAlias ? <input type="hidden" name="alias" value={selectedAlias} /> : null}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                name="q"
                type="search"
                defaultValue={searchParams.q}
                placeholder="Rechercher"
                className="h-10 w-full rounded-full border border-line bg-surface-1 pl-9 pr-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
            </div>
          </form>
          <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FOLDERS.map((f) => {
              const active = folder === f.key;
              return (
                <Link
                  key={f.key}
                  href={`/app/mail?mailbox=${encodeURIComponent(mailbox)}&folder=${f.key}${f.key === "INBOX" ? "&category=PRIMARY" : ""}`}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    active ? "border-ink bg-ink text-canvas" : "border-line bg-surface-1 text-ink-2"
                  }`}
                >
                  <f.icon className="h-3.5 w-3.5" />
                  {f.label}
                  {f.key === "INBOX" && inboxUnread > 0 ? (
                    <span className={`tabular-nums ${active ? "text-canvas/70" : "text-accent"}`}>
                      {inboxUnread}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link
              href={qp({ alias: undefined, thread: undefined })}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${!selectedAlias ? "border-accent bg-accent text-accent-fg" : "border-line text-ink-2"}`}
            >
              Tous services
            </Link>
            {SERVICES.map((service) => (
              <Link
                key={service.email}
                href={qp({ alias: service.email, thread: undefined })}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${selectedAlias === service.email ? "border-accent bg-accent text-accent-fg" : "border-line text-ink-2"}`}
              >
                {service.label} <span className="opacity-70">{serviceCounts.get(service.email) || 0}</span>
              </Link>
            ))}
          </div>
          {folder === "INBOX" ? (
            <div className="-mx-4 mt-2 flex gap-4 overflow-x-auto border-t border-line px-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CATEGORIES.map((c) => (
                <Link
                  key={c.key}
                  href={qp({ folder: "INBOX", category: c.key, thread: undefined })}
                  className={`shrink-0 border-b-2 py-1.5 text-xs font-medium ${
                    category === c.key ? "border-ink text-ink" : "border-transparent text-ink-3"
                  }`}
                >
                  {c.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="bg-surface-1">{rows}</div>
        {threads.length ? (
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-ink-3">
            <span>{syncedAt ? `Synchronisé ${relativeFr(syncedAt)}` : `${LIMIT} conversations max.`}</span>
            {syncForm}
          </div>
        ) : null}
      </div>

      {/* Desktop */}
      <div className="hidden min-h-[68vh] overflow-hidden rounded-xl border border-line bg-surface-1 text-ink shadow-card lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="border-r border-line bg-surface-2/60 p-3">
          {canDraft && accounts.length ? (
            <Link href={composeHref}>
              <Button variant="primary" className="mb-4 w-full">
                <PenSquare className="h-4 w-4" /> Nouveau message
              </Button>
            </Link>
          ) : null}
          <nav className="space-y-0.5">
            {FOLDERS.map((f) => (
              <Link
                key={f.key}
                href={`/app/mail?mailbox=${encodeURIComponent(mailbox)}&folder=${f.key}${f.key === "INBOX" ? "&category=PRIMARY" : ""}`}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  folder === f.key
                    ? "bg-surface-1 font-medium text-ink shadow-card"
                    : "text-ink-2 hover:bg-surface-1 hover:text-ink"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <f.icon className="h-4 w-4 text-ink-3" />
                  {f.label}
                </span>
                {f.key === "INBOX" && inboxUnread > 0 ? (
                  <span className="rounded-md tint-accent px-1.5 py-0.5 text-2xs font-semibold text-accent tabular-nums">
                    {inboxUnread}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 px-3 text-2xs font-semibold uppercase tracking-wider text-ink-3">
              Services / alias
            </p>
            <nav className="space-y-0.5">
              <Link
                href={qp({ alias: undefined, thread: undefined })}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${!selectedAlias ? "bg-surface-1 font-medium text-ink shadow-card" : "text-ink-2 hover:bg-surface-1"}`}
              >
                <span>Tous les services</span>
                <span className="text-2xs text-ink-3">{folderThreads.length}</span>
              </Link>
              {SERVICES.map((service) => (
                <Link
                  key={service.email}
                  href={qp({ alias: service.email, thread: undefined })}
                  title={service.email}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${selectedAlias === service.email ? "bg-surface-1 font-medium text-ink shadow-card" : "text-ink-2 hover:bg-surface-1"}`}
                >
                  <span className="truncate">{service.label}</span>
                  <span className="text-2xs text-ink-3">{serviceCounts.get(service.email) || 0}</span>
                </Link>
              ))}
            </nav>
          </div>
        </aside>
        <section className="min-w-0">
          <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-line px-3">
            {syncForm}
            <form className="flex min-w-[220px] flex-1 items-center gap-2">
              <input type="hidden" name="mailbox" value={mailbox} />
              <input type="hidden" name="folder" value={folder} />
              {folder === "INBOX" ? <input type="hidden" name="category" value={category} /> : null}
              {selectedAlias ? <input type="hidden" name="alias" value={selectedAlias} /> : null}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <input
                  name="q"
                  defaultValue={searchParams.q}
                  placeholder="Rechercher dans ces conversations"
                  className="h-9 w-full rounded-full border border-line bg-surface-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                />
              </div>
            </form>
            {accounts.length > 1 ? (
              <form className="flex gap-2">
                <Select name="mailbox" defaultValue={mailbox} className="h-9 w-48">
                  <option value="ALL">Toutes les boîtes</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName || a.email}
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="outline">
                  Ouvrir
                </Button>
              </form>
            ) : null}
          </div>
          {folder === "INBOX" ? (
            <div className="flex gap-1 border-b border-line px-3">
              {CATEGORIES.map((c) => (
                <Link
                  key={c.key}
                  href={qp({ folder: "INBOX", category: c.key, thread: undefined })}
                  className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                    category === c.key
                      ? "border-accent font-medium text-ink"
                      : "border-transparent text-ink-3 hover:text-ink"
                  }`}
                >
                  <c.icon className="h-4 w-4" />
                  {c.label}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="border-b border-line px-4 py-2 text-xs text-ink-3">
            {selectedAlias ? `${SERVICES.find((service) => service.email === selectedAlias)?.label} · ` : ""}
            {threads.length} conversation{threads.length > 1 ? "s" : ""} affichée
            {threads.length > 1 ? "s" : ""} · {mailboxLabel}
            {syncedAt ? ` · synchronisé ${relativeFr(syncedAt)}` : ""}
          </div>
          <div>{rows}</div>
        </section>
      </div>
    </>
  );
}

const mobileReplyBtn =
  "flex h-10 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-1 text-sm font-medium text-ink active:bg-surface-2";

function MessageCard({
  m,
  last,
  children,
}: {
  m: Awaited<ReturnType<typeof getMailConversation>>[number];
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface-1">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {senderLabel(m.from)}{" "}
            <span className="font-normal text-ink-3">&lt;{senderEmail(m.from)}&gt;</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-3">à {m.to.join(", ") || "moi"}</p>
        </div>
        <span className="shrink-0 text-xs text-ink-3">{m.date.toLocaleString("fr-FR")}</span>
      </div>
      {/* Email bodies are rendered as light paper regardless of theme. */}
      <div className="overflow-hidden bg-white p-0 text-ink md:p-3" data-theme="light">
        {m.htmlBody ? (
          <EmailHtmlFrame html={m.htmlBody} title={m.subject} />
        ) : (
          <div className="whitespace-pre-wrap break-words px-4 py-3 text-[15px] leading-7 md:px-2">
            {m.body || m.snippet || "Aucun contenu lisible."}
          </div>
        )}
      </div>
      {last ? children : null}
    </article>
  );
}

function ThreadActions({
  thread,
  state,
  folder,
  onRestoreTo,
}: {
  thread: { id: string };
  state: { isRead: boolean; starred: boolean; archived: boolean; trashed: boolean };
  folder: FolderKey;
  onRestoreTo: FolderKey;
}) {
  const item =
    "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] text-ink active:bg-surface-2 lg:h-8 lg:w-auto lg:rounded-lg lg:border lg:border-line-strong lg:bg-surface-1 lg:px-3 lg:py-0 lg:text-sm lg:font-medium lg:hover:bg-surface-2";
  const icon = "h-5 w-5 text-ink-3 lg:h-4 lg:w-4";
  return (
    <div className="-mx-1 divide-y divide-line lg:mx-0 lg:flex lg:flex-wrap lg:gap-2 lg:divide-y-0">
      {state.isRead ? (
        <form action={markMailThreadUnread.bind(null, thread.id, folder)}>
          <button className={item}>
            <Inbox className={icon} /> Marquer non lu
          </button>
        </form>
      ) : (
        <form action={markMailThreadRead.bind(null, thread.id, folder)}>
          <button className={item}>
            <Inbox className={icon} /> Marquer lu
          </button>
        </form>
      )}
      <form action={toggleMailThreadStar.bind(null, thread.id, folder)} className="lg:block">
        <button className={item}>
          <Star className={icon} /> {state.starred ? "Retirer le suivi" : "Suivre"}
        </button>
      </form>
      {!state.archived && !state.trashed ? (
        <form action={archiveMailThread.bind(null, thread.id)}>
          <button className={item}>
            <Archive className={icon} /> Archiver
          </button>
        </form>
      ) : null}
      {!state.trashed ? (
        <form action={snoozeMailThread.bind(null, thread.id)}>
          <input type="hidden" name="hours" value="24" />
          <button className={item}>
            <Clock3 className={icon} /> Reporter de 24 h
          </button>
        </form>
      ) : null}
      {!state.trashed ? (
        <form action={trashMailThread.bind(null, thread.id)}>
          <button className={`${item} text-danger lg:text-danger`}>
            <Trash2 className="h-5 w-5 lg:h-4 lg:w-4" /> Supprimer
          </button>
        </form>
      ) : (
        <form action={restoreMailThread.bind(null, thread.id, onRestoreTo)}>
          <button className={item}>
            <Inbox className={icon} /> Restaurer
          </button>
        </form>
      )}
    </div>
  );
}
