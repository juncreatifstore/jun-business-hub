import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { updateCaseStatus, addCaseNote } from "@/services/cases";

export const dynamic = "force-dynamic";

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL", "COMPLETED", "CANCELLED", "ARCHIVED"];

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("CASE_READ");
  const c = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      owner: true,
      members: { include: { user: true } },
      tasks: { orderBy: { createdAt: "desc" }, include: { assignee: true } },
      documents: { orderBy: { updatedAt: "desc" } },
      files: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { paidAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 20, include: { user: true } },
    },
  });
  if (!c) notFound();

  const statusAction = updateCaseStatus.bind(null, c.id);
  const noteAction = addCaseNote.bind(null, c.id);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="registry-id text-muted2">{c.caseNumber}</p>
          <h1 className="mt-1 flex items-center gap-3 text-xl font-semibold">
            {c.title} <StatusBadge status={c.status} /> <StatusBadge status={c.priority} />
          </h1>
          <p className="mt-1 text-sm text-muted2">
            <Link href={`/app/clients/${c.clientId}`} className="text-electric hover:underline">
              {c.client.firstName} {c.client.lastName}
            </Link>
            {" · "}{c.type}{c.dueDate ? ` · due ${formatDate(c.dueDate)}` : ""}
            {c.owner ? ` · owned by ${c.owner.firstName} ${c.owner.lastName}` : ""}
          </p>
        </div>
        {can(user, "CASE_UPDATE") ? (
          <form action={statusAction} className="flex items-center gap-2">
            <Select name="status" defaultValue={c.status} className="w-48">
              {STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
            </Select>
            <Button variant="outline" size="sm">Update status</Button>
          </form>
        ) : null}
      </div>

      {c.description ? (
        <Card className="mb-4"><CardContent className="p-4 text-sm whitespace-pre-wrap">{c.description}</CardContent></Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
            <Link href={`/app/tasks/new?caseId=${c.id}&clientId=${c.clientId}`} className="text-sm text-electric hover:underline">Add task</Link>
          </CardHeader>
          <CardContent className="p-0">
            {c.tasks.length === 0 ? <p className="p-5 text-sm text-muted2">No tasks in this case yet.</p> : (
              <ul className="divide-y divide-line">
                {c.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted2">{t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "Unassigned"}{t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}</p>
                    </div>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents & files</CardTitle>
            <Link href={`/app/documents/new?caseId=${c.id}&clientId=${c.clientId}`} className="text-sm text-electric hover:underline">Draft document</Link>
          </CardHeader>
          <CardContent className="p-0">
            {c.documents.length === 0 && c.files.length === 0 ? (
              <p className="p-5 text-sm text-muted2">Nothing attached. Draft a document or upload files from Drive.</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/app/documents/${d.id}`} className="block truncate text-sm font-medium hover:text-electric">{d.title}</Link>
                      <p className="registry-id text-muted2">{d.documentId}</p>
                    </div>
                    <StatusBadge status={d.status} />
                  </li>
                ))}
                {c.files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between px-5 py-3">
                    <Link href={`/api/files/${f.id}`} className="truncate text-sm hover:text-electric">{f.name}</Link>
                    <span className="text-xs text-muted2">{f.category.replaceAll("_", " ")}</span>
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
                      <Link href={`/app/finance/refunds/${r.id}`} className="registry-id text-sm hover:text-electric">{r.reference}</Link>
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

      <div className="mt-4 max-w-2xl">
        <h2 className="mb-2 text-sm font-semibold">Case notes</h2>
        {can(user, "CASE_UPDATE") ? (
          <form action={noteAction} className="mb-4 space-y-2">
            <Textarea name="body" rows={3} placeholder="Add an internal note…" required maxLength={5000} />
            <Button variant="primary" size="sm">Add note</Button>
          </form>
        ) : null}
        {c.notes.length === 0 ? <p className="text-sm text-muted2">No notes yet.</p> : (
          <ul className="space-y-3">
            {c.notes.map((n) => (
              <li key={n.id} className="rounded-xl border border-line bg-white p-4">
                <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                <p className="mt-2 text-xs text-muted2">{n.author.firstName} {n.author.lastName} · {formatDateTime(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
