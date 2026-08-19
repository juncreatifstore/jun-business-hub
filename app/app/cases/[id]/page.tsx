import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!can(user, "CASE_READ")) redirect("/app/forbidden");

  const c = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      owner: true,
      members: { include: { user: true } },
      notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      tasks: { include: { assignee: true }, orderBy: { createdAt: "desc" } },
      files: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
      activities: { include: { user: true }, orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (!c) notFound();

  return (
    <div>
      <PageHeader
        title={c.title}
        subtitle={`${c.caseNumber} · ${c.type}`}
        actions={
          <div className="flex gap-2">
            <Link href={`/app/clients/${c.clientId}`}><Button variant="secondary">View client</Button></Link>
            {can(user, "CASE_UPDATE") ? <Link href={`/app/cases/${c.id}/edit`}><Button variant="primary">Edit case</Button></Link> : null}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Case overview</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-xs uppercase tracking-wide text-muted2">Client</p><Link href={`/app/clients/${c.clientId}`} className="mt-1 block text-electric hover:underline">{c.client.firstName} {c.client.lastName}</Link></div>
              <div><p className="text-xs uppercase tracking-wide text-muted2">Status</p><div className="mt-1"><StatusBadge status={c.status} /></div></div>
              <div><p className="text-xs uppercase tracking-wide text-muted2">Priority</p><p className="mt-1">{c.priority}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted2">Owner</p><p className="mt-1">{c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : "Unassigned"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted2">Due date</p><p className="mt-1">{formatDate(c.dueDate)}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted2">Created</p><p className="mt-1">{formatDate(c.createdAt)}</p></div>
              {c.description ? <div className="sm:col-span-2"><p className="text-xs uppercase tracking-wide text-muted2">Description</p><p className="mt-1 whitespace-pre-wrap text-sm">{c.description}</p></div> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tasks</CardTitle></CardHeader>
            <CardContent className="p-0">
              {c.tasks.length === 0 ? <p className="p-5 text-sm text-muted2">No tasks on this case.</p> : (
                <ul className="divide-y divide-line">
                  {c.tasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div>
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted2">{t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "Unassigned"} · due {formatDate(t.dueDate)}</p>
                      </div>
                      <StatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
            <CardContent className="p-0">
              {c.documents.length === 0 ? <p className="p-5 text-sm text-muted2">No documents on this case.</p> : (
                <ul className="divide-y divide-line">
                  {c.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div>
                        <Link href={`/app/documents/${d.id}`} className="text-sm font-medium hover:text-electric">{d.title}</Link>
                        <p className="registry-id text-xs text-muted2">{d.documentId}</p>
                      </div>
                      <StatusBadge status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Finance</CardTitle>
              <Link href={`/app/finance/payments/new?caseId=${c.id}&clientId=${c.clientId}`} className="text-sm text-electric hover:underline">Record payment</Link>
            </CardHeader>
            <CardContent className="p-0">
              {c.payments.length === 0 && c.refunds.length === 0 ? (
                <p className="p-5 text-sm text-muted2">No payments or refunds on this case.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {c.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <Link href={`/app/finance/payments/${p.id}`} className="registry-id text-sm hover:text-electric">{p.reference}</Link>
                        <p className="text-xs text-muted2">{formatDate(p.paidAt)} · {p.method.replaceAll("_", " ")}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{formatMoney(Number(p.amount), p.currency)}</p>
                        <StatusBadge status={p.status} />
                      </div>
                    </li>
                  ))}
                  {c.refunds.map((r) => (
                    <li key={r.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <Link href={`/app/finance/refunds/${r.id}`} className="registry-id text-sm hover:text-electric">{r.refundNumber}</Link>
                        <p className="text-xs text-muted2">Refund · {formatDate(r.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">-{formatMoney(Number(r.amount), r.currency)}</p>
                        <StatusBadge status={r.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
            <CardContent className="p-0">
              {c.activities.length === 0 ? <p className="p-5 text-sm text-muted2">No activity yet.</p> : (
                <ul className="divide-y divide-line">
                  {c.activities.map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <p className="text-sm">{a.message}</p>
                      <p className="text-xs text-muted2">{a.user ? `${a.user.firstName} ${a.user.lastName} · ` : ""}{formatDateTime(a.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Team</CardTitle></CardHeader>
            <CardContent>
              {c.members.length === 0 ? <p className="text-sm text-muted2">No additional members.</p> : (
                <ul className="space-y-2 text-sm">
                  {c.members.map((m) => <li key={m.userId}>{m.user.firstName} {m.user.lastName}</li>)}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent>
              {c.notes.length === 0 ? <p className="text-sm text-muted2">No notes yet.</p> : (
                <ul className="space-y-4">
                  {c.notes.map((n) => (
                    <li key={n.id} className="rounded-lg border border-line p-3">
                      <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                      <p className="mt-2 text-xs text-muted2">{n.author.firstName} {n.author.lastName} · {formatDateTime(n.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
