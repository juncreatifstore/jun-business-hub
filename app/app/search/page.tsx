import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatMoney } from "@/lib/utils";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await requireUser();
  const q = (searchParams.q ?? "").trim();

  if (!q) {
    return (
      <div>
        <PageHeader title="Search" subtitle="Search across clients, cases, documents, payments and refunds." />
        <EmptyState icon={Search} title="Type a query" description="Use the search bar in the header — names, case numbers, document ids, payment references…" />
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
      <PageHeader title={`Search — “${q}”`} subtitle={`${total} result${total === 1 ? "" : "s"} across the hub (limited to what your role can read).`} />

      {total === 0 ? (
        <EmptyState icon={Search} title="No results" description="Try a shorter query — a last name, a CASE- number, a PAY- reference or a JUN- document id." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {clients.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Clients ({clients.length})</CardTitle></CardHeader>
              <CardContent className="divide-y divide-white/5">
                {clients.map((c) => (
                  <Link key={c.id} href={`/app/clients/${c.id}`} className="flex items-center justify-between py-2 hover:text-electric">
                    <span>{c.firstName} {c.lastName}<span className="ml-2 registry-id text-xs text-muted2">{c.internalId}</span></span>
                    <StatusBadge status={c.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {cases.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Cases ({cases.length})</CardTitle></CardHeader>
              <CardContent className="divide-y divide-white/5">
                {cases.map((c) => (
                  <Link key={c.id} href={`/app/cases/${c.id}`} className="flex items-center justify-between py-2 hover:text-electric">
                    <span><span className="registry-id text-xs">{c.caseNumber}</span> · {c.title}<span className="ml-2 text-xs text-muted2">{c.client.firstName} {c.client.lastName}</span></span>
                    <StatusBadge status={c.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {documents.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Documents ({documents.length})</CardTitle></CardHeader>
              <CardContent className="divide-y divide-white/5">
                {documents.map((d) => (
                  <Link key={d.id} href={`/app/documents/${d.id}`} className="flex items-center justify-between py-2 hover:text-electric">
                    <span><span className="registry-id text-xs">{d.documentId}</span> · {d.title}</span>
                    <StatusBadge status={d.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {payments.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Payments ({payments.length})</CardTitle></CardHeader>
              <CardContent className="divide-y divide-white/5">
                {payments.map((p) => (
                  <Link key={p.id} href={`/app/finance/payments/${p.id}`} className="flex items-center justify-between py-2 hover:text-electric">
                    <span><span className="registry-id text-xs">{p.reference}</span> · {formatMoney(Number(p.amount), p.currency)}<span className="ml-2 text-xs text-muted2">{p.client.firstName} {p.client.lastName}</span></span>
                    <StatusBadge status={p.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {refunds.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Refunds ({refunds.length})</CardTitle></CardHeader>
              <CardContent className="divide-y divide-white/5">
                {refunds.map((r) => (
                  <Link key={r.id} href={`/app/finance/refunds/${r.id}`} className="flex items-center justify-between py-2 hover:text-electric">
                    <span><span className="registry-id text-xs">{r.refundNumber}</span> · {formatMoney(Number(r.amount), r.currency)}<span className="ml-2 text-xs text-muted2">{r.client.firstName} {r.client.lastName}</span></span>
                    <StatusBadge status={r.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {signatures.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Signatures ({signatures.length})</CardTitle></CardHeader>
              <CardContent className="divide-y divide-white/5">
                {signatures.map((s) => (
                  <Link key={s.id} href={`/app/signatures/${s.id}`} className="flex items-center justify-between py-2 hover:text-electric">
                    <span><span className="registry-id text-xs">{s.document.documentId}</span> · {s.document.title}</span>
                    <StatusBadge status={s.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
