import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/utils";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await requireUser();
  const q = (searchParams.q ?? "").trim();

  if (!q) {
    return (
      <div>
        <PageHeader title="Recherche globale" subtitle="Recherchez dans les clients, dossiers, documents, paiements, remboursements et signatures." />
        <EmptyState icon={Search} title="Entrez une recherche" description="Utilisez ⌘ K / Ctrl K depuis n’importe quelle page : nom, numéro de dossier, ID document, référence de paiement…" />
      </div>
    );
  }

  const ci = { contains: q, mode: "insensitive" as const };

  const [clients, cases, documents, payments, refunds, signatures] = await Promise.all([
    can(user, "CLIENT_READ")
      ? prisma.client.findMany({ where: { OR: [{ firstName: ci }, { lastName: ci }, { email: ci }, { internalId: ci }, { phone: ci }] }, take: 10 })
      : Promise.resolve([]),
    can(user, "CASE_READ")
      ? prisma.case.findMany({ where: { OR: [{ title: ci }, { caseNumber: ci }, { description: ci }] }, take: 10, include: { client: true } })
      : Promise.resolve([]),
    can(user, "DOCUMENT_READ")
      ? prisma.document.findMany({ where: { OR: [{ title: ci }, { documentId: ci }] }, take: 10 })
      : Promise.resolve([]),
    can(user, "PAYMENT_READ")
      ? prisma.payment.findMany({ where: { OR: [{ reference: ci }, { notes: ci }] }, take: 10, include: { client: true } })
      : Promise.resolve([]),
    can(user, "REFUND_READ")
      ? prisma.refund.findMany({ where: { OR: [{ refundNumber: ci }, { reason: ci }] }, take: 10, include: { client: true } })
      : Promise.resolve([]),
    can(user, "DOCUMENT_READ")
      ? prisma.signatureRequest.findMany({ where: { document: { OR: [{ title: ci }, { documentId: ci }] } }, take: 10, include: { document: true } })
      : Promise.resolve([]),
  ]);

  const total = clients.length + cases.length + documents.length + payments.length + refunds.length + signatures.length;

  return (
    <div>
      <PageHeader title={`Recherche — « ${q} »`} subtitle={`${total} résultat${total === 1 ? "" : "s"} dans JUN Business Hub, selon vos permissions.`} />

      {total === 0 ? (
        <EmptyState icon={Search} title="Aucun résultat" description="Essayez une recherche plus courte : nom de famille, numéro de dossier, référence PAY ou identifiant JUN." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {clients.length > 0 ? (
            <ResultCard title={`Clients (${clients.length})`}>
              {clients.map((c) => (
                <Link key={c.id} href={`/app/clients/${c.id}/dashboard`} className="flex items-center justify-between gap-3 py-3 transition hover:text-electric">
                  <span className="min-w-0"><span className="block truncate font-medium">{c.firstName} {c.lastName}</span><span className="registry-id mt-0.5 block text-xs text-muted2">{c.internalId}</span></span>
                  <StatusBadge status={c.status} />
                </Link>
              ))}
            </ResultCard>
          ) : null}

          {cases.length > 0 ? (
            <ResultCard title={`Dossiers (${cases.length})`}>
              {cases.map((c) => (
                <Link key={c.id} href={`/app/cases/${c.id}/dashboard`} className="flex items-center justify-between gap-3 py-3 transition hover:text-electric">
                  <span className="min-w-0"><span className="registry-id block text-xs">{c.caseNumber}</span><span className="mt-0.5 block truncate font-medium">{c.title}</span><span className="block truncate text-xs text-muted2">{c.client.firstName} {c.client.lastName}</span></span>
                  <StatusBadge status={c.status} />
                </Link>
              ))}
            </ResultCard>
          ) : null}

          {documents.length > 0 ? (
            <ResultCard title={`Documents (${documents.length})`}>
              {documents.map((d) => (
                <Link key={d.id} href={`/app/documents/${d.id}`} className="flex items-center justify-between gap-3 py-3 transition hover:text-electric">
                  <span className="min-w-0"><span className="registry-id block text-xs">{d.documentId}</span><span className="mt-0.5 block truncate font-medium">{d.title}</span></span>
                  <StatusBadge status={d.status} />
                </Link>
              ))}
            </ResultCard>
          ) : null}

          {payments.length > 0 ? (
            <ResultCard title={`Paiements (${payments.length})`}>
              {payments.map((p) => (
                <Link key={p.id} href={`/app/finance/payments/${p.id}`} className="flex items-center justify-between gap-3 py-3 transition hover:text-electric">
                  <span className="min-w-0"><span className="registry-id block text-xs">{p.reference}</span><span className="mt-0.5 block truncate font-medium">{formatMoney(Number(p.amount), p.currency)}</span><span className="block truncate text-xs text-muted2">{p.client.firstName} {p.client.lastName}</span></span>
                  <StatusBadge status={p.status} />
                </Link>
              ))}
            </ResultCard>
          ) : null}

          {refunds.length > 0 ? (
            <ResultCard title={`Remboursements (${refunds.length})`}>
              {refunds.map((r) => (
                <Link key={r.id} href={`/app/finance/refunds/${r.id}`} className="flex items-center justify-between gap-3 py-3 transition hover:text-electric">
                  <span className="min-w-0"><span className="registry-id block text-xs">{r.refundNumber}</span><span className="mt-0.5 block truncate font-medium">{formatMoney(Number(r.amount), r.currency)}</span><span className="block truncate text-xs text-muted2">{r.client.firstName} {r.client.lastName}</span></span>
                  <StatusBadge status={r.status} />
                </Link>
              ))}
            </ResultCard>
          ) : null}

          {signatures.length > 0 ? (
            <ResultCard title={`Signatures (${signatures.length})`}>
              {signatures.map((s) => (
                <Link key={s.id} href={`/app/signatures/${s.id}`} className="flex items-center justify-between gap-3 py-3 transition hover:text-electric">
                  <span className="min-w-0"><span className="registry-id block text-xs">{s.document.documentId}</span><span className="mt-0.5 block truncate font-medium">{s.document.title}</span></span>
                  <StatusBadge status={s.status} />
                </Link>
              ))}
            </ResultCard>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="divide-y divide-white/[0.055]">{children}</CardContent></Card>;
}
