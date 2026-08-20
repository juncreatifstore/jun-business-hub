import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea, Select } from "@/components/ui/input";
import { composeDraft, sendDraft, moveThread } from "@/services/mail";
import { syncMailbox, sendDraftViaGmail, draftReplyWithJunAI, updateMailDraft } from "@/services/mailbox";
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

type FolderKey = (typeof FOLDERS)[number]["key"];

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
  const folder: FolderKey = FOLDERS.some((f) => f.key === searchParams.folder) ? (searchParams.folder as FolderKey) : "INBOX";
  const composing = searchParams.compose === "1";

  const gmailAccount = await prisma.mailAccount.findFirst({ where: { OR: [{ accessTokenEnc: { not: null } }, { refreshTokenEnc: { not: null } }] }, orderBy: { createdAt: "asc" } });

  const [allThreads, clients, activeThread] = await Promise.all([
    gmailAccount ? prisma.mailThread.findMany({ where: { mailAccountId: gmailAccount.id }, orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }], take: 200, include: { client: true } }) : Promise.resolve([]),
    canDraft ? prisma.client.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, firstName: true, lastName: true, internalId: true } }) : Promise.resolve([]),
    searchParams.thread ? prisma.mailThread.findUnique({ where: { id: searchParams.thread }, include: { client: true, account: true } }) : Promise.resolve(null),
  ]);

  const accountEmail = gmailAccount?.email.toLowerCase() ?? "";
  const inFolder = (t: (typeof allThreads)[number], key: FolderKey) => {
    const sent = Boolean(accountEmail && t.fromEmail?.toLowerCase().includes(accountEmail) && !t.aiDraft);
    if (key === "DRAFTS") return Boolean(t.aiDraft);
    if (key === "SENT") return sent;
    if (key === "IMPORTANT") return t.requiresAttention;
    if (key === "AI_REVIEW") return t.requiresAttention || t.aiLevel !== "AUTO";
    return !t.aiDraft && !sent;
  };
  const threads = allThreads.filter((t) => inFolder(t, folder)).slice(0, 50);
  const countMap = Object.fromEntries(FOLDERS.map((f) => [f.key, allThreads.filter((t) => inFolder(t, f.key)).length]));

  return (
    <div>
      <PageHeader
        title="Mail"
        subtitle={gmailAccount ? `Connected to Gmail — ${gmailAccount.email}.` : "No mailbox connected. Connect Gmail in Settings → Email."}
        actions={<div className="flex items-center gap-2">{gmailAccount ? <form action={syncMailbox.bind(null, gmailAccount.id)}><Button variant="secondary">Sync {gmailAccount.email}</Button></form> : null}{canDraft && gmailAccount ? <Link href={`/app/mail?folder=${folder}&compose=1`}><Button variant="primary">Compose</Button></Link> : null}</div>}
      />

      <div className="grid gap-6 lg:grid-cols-[200px_1fr_1.2fr]">
        <nav className="space-y-1">
          {FOLDERS.map((f) => (
            <Link key={f.key} href={`/app/mail?folder=${f.key}`} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${folder === f.key ? "bg-electric/10 text-electric" : "text-muted2 hover:bg-white/5 hover:text-white"}`}>
              <span className="flex items-center gap-2"><f.icon className="h-4 w-4" /> {f.label}</span>
              <span className="registry-id text-xs">{countMap[f.key] ?? 0}</span>
            </Link>
          ))}
        </nav>

        <div className="min-w-0">
          {threads.length === 0 ? <EmptyState icon={Mail} title={`No threads in ${folder.toLowerCase().replace("_", " ")}`} description={gmailAccount ? "Sync Gmail or choose another folder." : "Connect a Gmail mailbox to populate JUN Mail."} /> : (
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
              {threads.map((t) => (
                <li key={t.id}><Link href={`/app/mail?folder=${folder}&thread=${t.id}`} className={`block px-4 py-3 hover:bg-white/5 ${activeThread?.id === t.id ? "bg-white/5" : ""}`}>
                  <div className="flex items-center justify-between gap-2"><p className="truncate font-medium">{t.subject ?? "(no subject)"}</p><Badge className={AI_BADGE[t.aiLevel] ?? ""}>{t.aiLevel.replaceAll("_", " ")}</Badge></div>
                  <p className="mt-1 truncate text-sm text-muted2">{t.aiDraft ?? t.snippet ?? "—"}</p>
                  <p className="mt-1 text-xs text-muted2">{t.client ? `${t.client.firstName} ${t.client.lastName} · ` : ""}{formatDateTime(t.lastMessageAt ?? t.updatedAt)}</p>
                </Link></li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {composing && canDraft && gmailAccount ? (
            <Card><CardHeader><CardTitle>New message</CardTitle></CardHeader><CardContent><form action={composeDraft} className="space-y-4">
              <Field label="To"><Input name="toAddr" type="email" required placeholder="client@example.com" /></Field>
              <Field label="Subject"><Input name="subject" required maxLength={200} /></Field>
              <Field label="Link to client (optional)"><Select name="clientId" defaultValue=""><option value="">— None —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.internalId})</option>)}</Select></Field>
              <Field label="Message"><Textarea name="body" rows={8} required /></Field>
              <div className="flex gap-3"><Button type="submit" variant="primary">Save draft</Button><Link href={`/app/mail?folder=${folder}`}><Button type="button" variant="ghost">Cancel</Button></Link></div>
            </form></CardContent></Card>
          ) : activeThread ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{activeThread.subject ?? "(no subject)"}</CardTitle><Badge className={AI_BADGE[activeThread.aiLevel] ?? ""}>{activeThread.aiLevel.replaceAll("_", " ")}</Badge></div>
                <p className="text-sm text-muted2">{activeThread.client ? <>Client: <Link className="text-electric" href={`/app/clients/${activeThread.clientId}`}>{activeThread.client.firstName} {activeThread.client.lastName}</Link> · </> : null}{activeThread.aiSummary ?? ""}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeThread.aiDraft && canDraft ? (
                  <>
                    <form action={updateMailDraft.bind(null, activeThread.id)} className="space-y-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <Field label="To"><Input name="to" type="email" required defaultValue={activeThread.toEmails[0] ?? ""} /></Field>
                      <Field label="Subject"><Input name="subject" required maxLength={200} defaultValue={activeThread.subject ?? ""} /></Field>
                      <Field label="Message"><Textarea name="body" rows={10} required defaultValue={activeThread.aiDraft} /></Field>
                      <Button type="submit" variant="secondary">Save changes</Button>
                    </form>
                    {canSend && gmailAccount ? <form action={sendDraftViaGmail.bind(null, activeThread.id)}><Button variant="gold">Send via {gmailAccount.email}</Button></form> : null}
                  </>
                ) : (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs text-muted2"><span className="font-medium text-white/80">{activeThread.fromEmail ?? activeThread.account.email}</span> → {activeThread.toEmails.join(", ") || "—"} · {formatDateTime(activeThread.lastMessageAt ?? activeThread.updatedAt)}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{activeThread.snippet ?? "No preview available."}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  {!activeThread.aiDraft && canDraft && activeThread.fromEmail && !activeThread.fromEmail.toLowerCase().includes(activeThread.account.email.toLowerCase()) ? <form action={draftReplyWithJunAI.bind(null, activeThread.id)}><Button variant="primary">Draft reply with JUN AI</Button></form> : null}
                  {!activeThread.requiresAttention ? <form action={moveThread.bind(null, activeThread.id, "IMPORTANT")}><Button variant="secondary">Mark important</Button></form> : null}
                  {!activeThread.requiresAttention && activeThread.aiLevel !== "AUTO" ? <form action={moveThread.bind(null, activeThread.id, "AI_REVIEW")}><Button variant="secondary">Send to AI review</Button></form> : null}
                  {activeThread.aiDraft && canSend && !gmailAccount && process.env.NODE_ENV !== "production" ? <form action={sendDraft.bind(null, activeThread.id)}><Button variant="secondary">Mark as sent</Button></form> : null}
                </div>
              </CardContent>
            </Card>
          ) : <EmptyState icon={Mail} title="Select a thread" description="Pick a conversation from the list to read it here." />}
        </div>
      </div>
    </div>
  );
}
