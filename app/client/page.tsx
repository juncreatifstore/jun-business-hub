import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientPortalPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") redirect("/login");

  const account = await prisma.clientAccount.findUnique({ where: { userId: user.id } });
  if (!account) redirect("/login");
  const clientId = account.clientId; // hard scope: everything below is filtered by this id

  const [client, cases, documents, payments, receipts, refunds, files] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.case.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
    prisma.document.findMany({ where: { clientId, status: { in: ["FINAL", "SIGNED"] } }, orderBy: { createdAt: "desc" } }),
    prisma.payment.findMany({ where: { clientId }, orderBy: { paidAt: "desc" } }),
    prisma.receipt.findMany({ where: { payment: { clientId } }, orderBy: { issuedAt: "desc" }, include: { payment: true } }),
    prisma.refund.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, include: { installments: true } }),
    prisma.file.findMany({ where: { clientId, isVault: false }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  if (!client) redirect("/login");

  const totalPaid = payments.filter((p) => p.status === "CONFIRMED").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Welcome, {client.firstName}</h1>
        <p className="mt-1 text-sm text-white/60">Here is a read-only view of your file with JUN CREATIF AND TRAVEL LLC. For any change, contact your agent.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-xs uppercase tracking-wide text-white/50">Active cases</p><p className="mt-1 font-display text-2xl">{cases.filter((c) => !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(c.status)).length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs uppercase tracking-wide text-white/50">Confirmed payments</p><p className="mt-1 font-display text-2xl">{formatMoney(totalPaid)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs uppercase tracking-wide text-white/50">Documents available</p><p className="mt-1 font-display text-2xl">{documents.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Your cases</CardTitle></CardHeader>
        <CardContent className="divide-y divide-white/5">
          {cases.length === 0 ? <p className="py-2 text-sm text-white/50">No cases yet.</p> : cases.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium">{c.title}</p>
                <p className="registry-id text-xs text-white/50">{c.caseNumber} · opened {formatDate(c.createdAt)}</p>
              </div>
              <StatusBadge status={c.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
        <CardContent className="divide-y divide-white/5">
          {documents.length === 0 ? <p className="py-2 text-sm text-white/50">Finalized documents will appear here.</p> : documents.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium">{d.title}</p>
                <p className="registry-id text-xs text-white/50">{d.documentId} · <a href={`/api/documents/${d.id}/pdf`} target="_blank" rel="noreferrer" className="text-gold hover:underline">PDF</a> · <a href={`/verify/${d.documentId}`} className="hover:text-gold">verify</a></p>
              </div>
              <StatusBadge status={d.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent className="divide-y divide-white/5">
            {payments.length === 0 ? <p className="py-2 text-sm text-white/50">No payments recorded.</p> : payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{formatMoney(Number(p.amount), p.currency)}</p>
                  <p className="registry-id text-xs text-white/50">{p.reference} · {formatDate(p.paidAt)} · {p.method}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Receipts</CardTitle></CardHeader>
          <CardContent className="divide-y divide-white/5">
            {receipts.length === 0 ? <p className="py-2 text-sm text-white/50">Receipts are issued when a payment is confirmed.</p> : receipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{formatMoney(Number(r.payment.amount), r.payment.currency)}</p>
                  <p className="registry-id text-xs text-white/50">{r.reference} · issued {formatDate(r.issuedAt)}</p>
                </div>
                <span className="flex gap-3 text-xs"><a href={`/api/receipts/${r.id}/pdf`} target="_blank" rel="noreferrer" className="text-gold hover:underline">PDF</a><a href={`/verify/${r.reference}`} className="text-white/60 hover:text-gold">Verify</a></span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {refunds.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Refunds</CardTitle></CardHeader>
          <CardContent className="divide-y divide-white/5">
            {refunds.map((r) => {
              const paid = r.installments.filter((i) => i.status === "PAID").length;
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{formatMoney(Number(r.amount), r.currency)}</p>
                    <p className="registry-id text-xs text-white/50">{r.reference}{r.installments.length > 0 ? ` · ${paid}/${r.installments.length} installments paid` : ""}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {files.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Shared files</CardTitle></CardHeader>
          <CardContent className="divide-y divide-white/5">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 py-3">
                <div>
                  <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="font-medium hover:text-gold">{f.name}</a>
                  <p className="text-xs text-white/50">{f.category.replace(/_/g, " ")} · {formatDate(f.createdAt)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
