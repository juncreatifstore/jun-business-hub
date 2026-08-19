import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { sendAIMessage, reviewAIAction } from "@/services/ai";
import { formatDateTime } from "@/lib/utils";
import { Bot, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AIPage({ searchParams }: { searchParams: { c?: string } }) {
  const user = await requireUser();
  if (!can(user, "AI_USE")) redirect("/app/forbidden");
  const canApprove = can(user, "AI_APPROVE");

  const [conversations, actions] = await Promise.all([
    prisma.aIConversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 30 }),
    canApprove
      ? prisma.aIAction.findMany({ where: { status: "PROPOSED" }, orderBy: { createdAt: "desc" }, take: 20, include: { user: true } })
      : Promise.resolve([]),
  ]);

  const activeId = searchParams.c && conversations.some((c) => c.id === searchParams.c) ? searchParams.c : null;
  const messages = activeId
    ? await prisma.aIMessage.findMany({ where: { conversationId: activeId }, orderBy: { createdAt: "asc" }, take: 100 })
    : [];

  const modelConnected = Boolean(process.env.OPENAI_API_KEY);

  return (
    <div>
      <PageHeader
        title="JUN AI"
        subtitle={modelConnected ? "Model connected. JUN AI drafts and searches — humans approve every sensitive action." : "Offline mode: tool commands work, conversational answers need OPENAI_API_KEY."}
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div>
          <Link href="/app/ai"><Button variant="secondary" className="mb-3 w-full">New conversation</Button></Link>
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/ai?c=${c.id}`}
                  className={`block truncate rounded-lg px-3 py-2 text-sm ${activeId === c.id ? "bg-electric/10 text-electric" : "text-muted2 hover:bg-white/5 hover:text-white"}`}
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              {messages.length === 0 ? (
                <EmptyState
                  icon={Bot}
                  title={activeId ? "Empty conversation" : "Ask JUN AI"}
                  description="Try: “search clients Dupont”, “search payments PAY”, or ask for a summary. JUN AI never signs documents and never sends emails on its own."
                />
              ) : (
                <div className="space-y-4">
                  {messages.map((m) => (
                    <div key={m.id} className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${m.role === "user" ? "ml-auto bg-electric/15" : "bg-white/[0.05]"}`}>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-muted2">{m.role === "user" ? "You" : "JUN AI"} · {formatDateTime(m.createdAt)}</p>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  ))}
                </div>
              )}

              <form action={sendAIMessage.bind(null, activeId)} className="mt-6 flex gap-3">
                <input
                  name="message"
                  required
                  maxLength={4000}
                  placeholder="Message JUN AI… (e.g. search clients Marie)"
                  className="h-11 flex-1 rounded-lg border border-white/10 bg-white/5 px-4 text-sm outline-none focus:border-electric"
                  autoComplete="off"
                />
                <Button type="submit" variant="primary"><Sparkles className="mr-2 h-4 w-4" /> Send</Button>
              </form>
            </CardContent>
          </Card>

          {canApprove ? (
            <Card>
              <CardHeader><CardTitle>Proposed AI actions — human approval required</CardTitle></CardHeader>
              <CardContent>
                {actions.length === 0 ? (
                  <p className="text-sm text-muted2">Nothing pending. When JUN AI proposes a sensitive action (like sending an email), it appears here for review.</p>
                ) : (
                  <ul className="space-y-3">
                    {actions.map((a) => (
                      <li key={a.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">{a.tool.replaceAll("_", " ")}</p>
                            <p className="text-xs text-muted2">Proposed by {a.user.firstName} {a.user.lastName} · {formatDateTime(a.createdAt)}</p>
                          </div>
                          <StatusBadge status={a.status} />
                        </div>
                        <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 text-xs text-muted2">{JSON.stringify(a.args, null, 2)}</pre>
                        <div className="mt-3 flex gap-2">
                          <form action={reviewAIAction.bind(null, a.id)}>
                            <input type="hidden" name="decision" value="APPROVED" />
                            <Button type="submit" variant="gold" size="sm">Approve & execute</Button>
                          </form>
                          <form action={reviewAIAction.bind(null, a.id)}>
                            <input type="hidden" name="decision" value="REJECTED" />
                            <Button type="submit" variant="danger" size="sm">Reject</Button>
                          </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
