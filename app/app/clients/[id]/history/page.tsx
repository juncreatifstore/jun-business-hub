import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientFinanceOverview } from "@/lib/client-finance-overview";
import { getClientBlock } from "@/lib/client-transaction-block";
import { addClientNote } from "@/services/clients";
import { ClientWorkspaceHeader } from "@/components/app/client-workspace-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { Activity, FileText, MessageSquareText, ReceiptText } from "lucide-react";

export const dynamic = "force-dynamic";

type TimelineItem = {
  id: string;
  date: Date;
  kind: string;
  title: string;
  description: string;
  status?: string;
  href?: string | null;
  amount?: string | null;
};

export default async function ClientHistoryPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const user = await requirePermission("CLIENT_READ");
  const { id } = await Promise.resolve(params);
  const [client, finance, block] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: {
        tags: true,
        cases: {
          orderBy: { createdAt: "desc" },
          select: { id: true, caseNumber: true, title: true, status: true, createdAt: true },
        },
        documents: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            documentId: true,
            title: true,
            type: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        files: {
          where: { isVault: false, archivedAt: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, category: true, createdAt: true },
        },
        clientNotes: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { firstName: true, lastName: true } } },
        },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 200,
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
    getClientFinanceOverview(id),
    getClientBlock(id),
  ]);
  if (!client) notFound();

  const blocked = Boolean(block?.blocked);
  const archived = client.status === "ARCHIVED";
  const items: TimelineItem[] = [];
  for (const c of client.cases)
    items.push({
      id: `case-${c.id}`,
      date: c.createdAt,
      kind: "SERVICE",
      title: `${c.caseNumber} · ${c.title}`,
      description: "Prestation / dossier ouvert",
      status: c.status,
      href: `/app/cases/${c.id}`,
    });
  for (const d of client.documents)
    items.push({
      id: `doc-${d.id}`,
      date: d.updatedAt,
      kind: "DOCUMENT",
      title: d.title,
      description: `${d.documentId} · ${d.type.replaceAll("_", " ")}`,
      status: d.status,
      href: `/app/documents/${d.id}`,
    });
  for (const f of client.files)
    items.push({
      id: `file-${f.id}`,
      date: f.createdAt,
      kind: "FILE",
      title: f.name,
      description: `Fichier Drive · ${f.category.replaceAll("_", " ")}`,
      href: `/app/drive?q=${encodeURIComponent(f.name)}`,
    });
  for (const p of finance.payments)
    items.push({
      id: `pay-${p.id}`,
      date: p.paidAt || p.createdAt,
      kind: "PAYMENT",
      title: p.reference,
      description: `Brut ${formatMoney(p.gross, p.currency)} · frais ${formatMoney(p.fee, p.currency)} · net ${formatMoney(p.net, p.currency)}`,
      status: p.status,
      href: `/app/finance/payments/${p.id}`,
      amount: formatMoney(p.net, p.currency),
    });
  for (const r of finance.refunds)
    items.push({
      id: `refund-${r.id}`,
      date: r.createdAt,
      kind: "REFUND",
      title: r.refundNumber,
      description: r.reason,
      status: r.status,
      href: `/app/finance/refunds/${r.id}`,
      amount: `-${formatMoney(r.amountNumber, r.currency)}`,
    });
  for (const row of finance.invoices) {
    const i = row.invoice;
    items.push({
      id: `inv-${i.id}`,
      date: new Date(i.createdAt),
      kind: "INVOICE",
      title: i.invoiceNumber,
      description: i.title || "Facture client",
      status: row.state.effectiveStatus,
      href: `/app/finance/invoices/${i.id}`,
      amount: formatMoney(i.total, i.currency),
    });
  }
  for (const e of finance.expenses)
    items.push({
      id: `exp-${e.id}`,
      date: new Date(e.updatedAt),
      kind: "EXPENSE",
      title: e.expenseNumber,
      description: `${e.vendorName} · ${e.category.replaceAll("_", " ")} · ${e.description}`,
      status: e.effectiveStatus,
      href: `/app/finance/expenses/${e.id}`,
      amount: `-${formatMoney(e.amount, e.currency)}`,
    });
  for (const n of client.clientNotes)
    items.push({
      id: `note-${n.id}`,
      date: n.createdAt,
      kind: "NOTE",
      title: `Note équipe · ${n.author.firstName} ${n.author.lastName}`,
      description: n.body,
    });
  items.sort((a, b) => b.date.getTime() - a.date.getTime());

  const noteAction = addClientNote.bind(null, client.id);
  return (
    <div className="space-y-5">
      <ClientWorkspaceHeader
        client={client}
        tags={client.tags}
        blocked={blocked}
        canUpdate={can(user, "CLIENT_UPDATE")}
        newServicesAllowed={!blocked && !archived}
        paymentsAllowed={!archived}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Historique</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Timeline & notes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Historique consolidé des services, finances, documents, fichiers et décisions internes.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/app/clients/${client.id}/statement`}>
            <Button variant="outline">Relevé</Button>
          </Link>
          <a href={`/api/clients/${client.id}/statement.pdf`} target="_blank" rel="noreferrer">
            <Button variant="primary">PDF du relevé</Button>
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Activity} label="Événements" value={String(items.length)} tone="blue" />
        <Metric
          icon={MessageSquareText}
          label="Notes équipe"
          value={String(client.clientNotes.length)}
          tone="violet"
        />
        <Metric icon={FileText} label="Services" value={String(client.cases.length)} tone="green" />
        <Metric
          icon={ReceiptText}
          label="Événements financiers"
          value={String(
            finance.payments.length +
              finance.invoices.length +
              finance.expenses.length +
              finance.refunds.length,
          )}
          tone="amber"
        />
      </div>

      {can(user, "CLIENT_UPDATE") ? (
        <Card className="bg-[#0e1624]">
          <CardHeader>
            <div>
              <CardTitle>Ajouter une note interne</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Visible uniquement par l’équipe JUN.</p>
            </div>
          </CardHeader>
          <CardContent>
            <form action={noteAction} className="flex flex-col gap-3 md:flex-row">
              <Textarea
                name="body"
                placeholder="Ajouter une note sur le client, un suivi, une décision ou une prestation…"
                required
                maxLength={5000}
                className="min-h-[90px] flex-1"
              />
              <div className="flex items-end">
                <Button variant="primary">Ajouter la note</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden bg-[#0e1624]">
        <CardHeader>
          <div>
            <CardTitle>Timeline complète</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Toutes les activités importantes dans l’ordre chronologique.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {items.length ? (
            <div className="divide-y divide-white/[0.055]">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 px-5 py-4 transition hover:bg-white/[0.018] md:grid-cols-[150px_110px_minmax(0,1fr)_auto]"
                >
                  <div className="text-xs text-slate-600">{formatDateTime(item.date)}</div>
                  <div>
                    <Badge className="border border-white/[0.06] bg-white/[0.025] text-slate-500">
                      {item.kind}
                    </Badge>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.href ? (
                        <Link href={item.href} className="font-medium text-slate-200 hover:text-blue-400">
                          {item.title}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-200">{item.title}</span>
                      )}
                      {item.status ? <StatusBadge status={item.status} /> : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{item.description}</p>
                  </div>
                  <div className="text-right font-medium text-slate-300">{item.amount || ""}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-slate-500">Aucun événement pour le moment.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone: "blue" | "violet" | "green" | "amber";
}) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-400",
    violet: "bg-violet-500/10 text-violet-400",
    green: "bg-emerald-500/10 text-emerald-400",
    amber: "bg-amber-500/10 text-amber-400",
  };
  return (
    <Card className="bg-[#0e1624]">
      <CardContent className="p-4">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="mt-3 text-xs text-slate-500">{label}</div>
        <div className="mt-1 text-xl font-semibold text-slate-100">{value}</div>
      </CardContent>
    </Card>
  );
}
