import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea, Select } from "@/components/ui/input";
import { composeDraft, sendDraft, moveThread } from "@/services/mail";
import { syncMailbox, sendDraftViaGmail } from "@/services/mailbox";
import { formatDateTime } from "@/lib/utils";
import { Inbox, Send, FileEdit, Star, Bot, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

const FOLDERS = [
  { key: "INBOX", label: "Inbox", icon: Inbox },
  { key: "SENT", label: "Sent", icon: Send },
  { key: "DRAFTS", label: "Drafts", icon: FileEdit },
  { key: "IMPORTANT", label: "Important", icon: Star },
  { key: "AI_REVIEW", label: "AI Review", icon: Bot },
] as const;

const AI_BADGE: Record<string, string> = {
  AUTO: "bg-emerald-100 text-emerald-800",
  APPROVAL_REQUIRED: "bg-amber-100 text-amber-800",
  BLOCKED: "bg-red-100 text-red-700",
};

export default async function MailPage({ searchParams }: { searchParams: { folder?: string; thread?: string; compose?: string } }) {
  const user = await requireUser();
  if (!can(user, "EMAIL_READ")) redirect("/app/forbidden");
  const canDraft = can(user, "EMAIL_DRAFT");
  const canSend = can(user, "EMAIL_SEND");

  const folder = FOLDERS.some((f) => f.key === searchParams.folder) ? (searchParams.folder as string) : "INBOX";
  const composing = searchParams.compose === "1";

  const gmailAccount = await prisma.mailAccount.findFirst({ where: { status: "CONNECTED" }, orderBy: { createdAt: "asc" } });
  const [threads, counts, clients, cases, activeThread] = await Promise.all([
    prisma.emailThread.findMany({
      where: { folder },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { client: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.emailThread.groupBy({ by: ["folder"], _count: { _all: true } }),
    canDraft ? prisma.client.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, firstName: true, lastName: true, internalId: true } }) : Promise.resolve([]),
    canDraft ? prisma.case.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, caseNumber: true, title: true } }) : Promise.resolve([]),
    searchParams.thread
      ? prisma.emailThread.findUnique({
          where: { id: searchParams.thread },
          include: { client: true, case: true, messages: { orderBy: { createdAt: "asc" } } },
        })
      : Promise.resolve(null),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.folder, c._count._all]));

  return (
    <div>
      <PageHeader
        title="Mail"
        subtitle={gmailAccount ? `Connected to Gmail — ${gmailAccount.email}. Sync, triage and real sending are live.` : "No mailbox connected. Connect a Gmail mailbox in Settings → Email to sync and send."}
        actions={
          <div className="flex items-center gap-2">
            {gmailAccount ? (
              <form action={syncMailbox.bind(null, gmailAccount.id)}><Button variant="secondary">Sync {gmailAccount.email}</Button></form>
            ) : null}
            {canDraft ? <Link href={`/app/mail?folder=${folder}&compose=1`}><Button variant="primary">Compose</Button></Link> : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[200px_1fr_1.2fr]">
        {/* Folders */}
        <nav className="space-y-1">
          {FOLDERS.map((f) => (
            <Link
              key={f.key}
              href={`/app/mail?folder=${f.key}`}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${folder === f.key ? "bg-electric/10 text-electric" : "text-muted2 hover:bg-white/5 hover:text-white"}`}
            >
              <span className="flex items-center gap-2"><f.icon className="h-4 w-4" /> {f.label}</span>
              <span className="registry-id text-xs">{countMap[f.key] ?? 0}</span>
            </Link>
          ))}
        </nav>

        {/* Thread list */}
        <div className="min-w-0">
          {threads.length === 0 ? (
            <EmptyState icon={Mail} title={`No threads in ${folder.toLowerCase().replace("_", " ")}`} description={folder === "DRAFTS" ? "Compose a message to create your first draft." : "Connected mailboxes will populate this folder."} />
          ) : (
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
              {threads.map((t) => (
                <li key={t.id}>
                  <Link href={`/app/mail?folder=${folder}&thread=${t.id}`} className={`block px-4 py-3 hover:bg-white/5 ${activeThread?.id === t.id ? "bg-white/5" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{t.subject}</p>
                      <Badge className={AI_BADGE[t.aiLevel] ?? ""}>{t.aiLevel.replaceAll("_", " ")}</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted2">{t.messages[0]?.body?.slice(0, 90) ?? "—"}</p>
                    <p className="mt-1 text-xs text-muted2">
                      {t.client ? `${t.client.firstName} ${t.client.lastName} · ` : ""}{formatDateTime(t.updatedAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reading pane / composer */}
        <div className="min-w-0">
          {composing && canDraft ? (
            <Card>
              <CardHeader><CardTitle>New message</CardTitle></CardHeader>
              <CardContent>
                <form action={composeDraft} className="space-y-4">
                  <Field label="To"><Input name="toAddr" type="email" required placeholder="client@example.com" /></Field>
                  <Field label="Subject"><Input name="subject" required maxLength={200} /></Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Link to client (optional)">
                      <Select name="clientId" defaultValue="">
                        <option value="">— None —</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.internalId})</option>)}
                      </Select>
                    </Field>
                    <Field label="Link to case (optional)">
                      <Select name="caseId" defaultValue="">
                        <option value="">— None —</option>
                        {cases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Message"><Textarea name="body" rows={8} required /></Field>
                  <div className="flex gap-3">
                    <Button type="submit" variant="primary">Save draft</Button>
                    <Link href={`/app/mail?folder=${folder}`}><Button type="button" variant="ghost">Cancel</Button></Link>
                  </div>
                  <p className="text-xs text-muted2">{gmailAccount ? `Drafts are triaged by JUN AI, then sent for real through ${gmailAccount.email}.` : "Drafts are triaged by JUN AI (auto / approval required / blocked). Connect a Gmail mailbox in Settings → Email to enable sending."}</p>
                </form>
              </CardContent>
            </Card>
          ) : activeThread ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{activeThread.subject}</CardTitle>
                  <Badge className={AI_BADGE[activeThread.aiLevel] ?? ""}>{activeThread.aiLevel.replaceAll("_", " ")}</Badge>
                </div>
                <p className="text-sm text-muted2">
                  {activeThread.client ? <>Client: <Link className="text-electric" href={`/app/clients/${activeThread.clientId}`}>{activeThread.client.firstName} {activeThread.client.lastName}</Link> · </> : null}
                  {activeThread.case ? <>Case: <Link className="text-electric registry-id" href={`/app/cases/${activeThread.caseId}`}>{activeThread.case.caseNumber}</Link> · </> : null}
                  {activeThread.aiSummary ?? ""}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeThread.messages.map((m) => (
                  <div key={m.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs text-muted2">
                      <span className="font-medium text-white/80">{m.fromAddr}</span> → {m.toAddr} · {m.isDraft ? "Draft" : m.sentAt ? `Sent ${formatDateTime(m.sentAt)}` : formatDateTime(m.createdAt)}
                      {m.isAIDraft ? <span className="ml-2 rounded bg-electric/10 px-1.5 py-0.5 text-electric">AI draft</span> : null}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-2">
                  {activeThread.messages.some((m) => m.isDraft) && canSend ? (
                    gmailAccount ? (
                      <form action={sendDraftViaGmail.bind(null, activeThread.id)}><Button variant="gold">Send via {gmailAccount.email}</Button></form>
                    ) : process.env.NODE_ENV !== "production" ? (
                      <form action={sendDraft.bind(null, activeThread.id)}><Button variant="secondary">Mark as sent (DEV mock)</Button></form>
                    ) : (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">Send disabled — Connect a Gmail mailbox before sending emails.</div>
                    )
                  ) : null}
                  {activeThread.folder !== "IMPORTANT" ? (
                    <form action={moveThread.bind(null, activeThread.id, "IMPORTANT")}><Button variant="secondary">Mark important</Button></form>
                  ) : null}
                  {activeThread.folder !== "AI_REVIEW" && activeThread.aiLevel !== "AUTO" ? (
                    <form action={moveThread.bind(null, activeThread.id, "AI_REVIEW")}><Button variant="secondary">Send to AI review</Button></form>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : (
            <EmptyState icon={Mail} title="Select a thread" description="Pick a conversation from the list to read it here." />
          )}
        </div>
      </div>
    </div>
  );
}
