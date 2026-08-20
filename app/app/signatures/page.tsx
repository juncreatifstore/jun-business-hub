import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { signatureRecipients } from "@/lib/signature-recipients";
import { PenLine, Send, Eye, CheckCircle2, Clock3, XCircle, FileSignature } from "lucide-react";

export const dynamic = "force-dynamic";

const metrics = [
  { key: "SENT", label: "Sent", icon: Send },
  { key: "VIEWED", label: "Viewed", icon: Eye },
  { key: "PARTIALLY_SIGNED", label: "Partially signed", icon: Clock3 },
  { key: "SIGNED", label: "Completed", icon: CheckCircle2 },
  { key: "DECLINED", label: "Declined", icon: XCircle },
  { key: "DRAFT", label: "Draft", icon: FileSignature },
] as const;

export default async function SignaturesPage() {
  await requirePermission("DOCUMENT_READ");
  const requests = await prisma.signatureRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { document: true, createdBy: true },
  });

  const counts = Object.fromEntries(metrics.map((m) => [m.key, requests.filter((r) => r.status === m.key).length]));
  const active = requests.filter((r) => ["READY_FOR_SIGNATURE", "SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(r.status)).length;

  return (
    <div>
      <PageHeader
        title="Signature Center"
        subtitle={process.env.SIGNATURE_PROVIDER === "DOCUSIGN" ? "Create, send and track legally auditable signature requests through DocuSign." : "Create and track signature requests. Configure DocuSign before production sending."}
        actions={<Link href="/app/signatures/new"><Button variant="primary">New signature request</Button></Link>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted2">Active</p><p className="mt-2 text-2xl font-semibold">{active}</p></CardContent></Card>
        {metrics.map((m) => (
          <Card key={m.key}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wider text-muted2">{m.label}</p><m.icon className="h-4 w-4 text-muted2" /></div>
              <p className="mt-2 text-2xl font-semibold">{counts[m.key] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {requests.length === 0 ? (
        <EmptyState icon={PenLine} title="No signature requests" description="Create your first signature request from a finalized document." actionHref="/app/signatures/new" actionLabel="New signature request" />
      ) : (
        <Table>
          <THead><tr><TH>Document</TH><TH>Provider</TH><TH>Signers</TH><TH>Status</TH><TH>Created</TH><TH>By</TH></tr></THead>
          <tbody>
            {requests.map((r) => {
              const recipients = signatureRecipients(r.recipients);
              const signed = recipients.filter((s) => s.signedAt).length;
              return (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/app/signatures/${r.id}`} className="registry-id hover:text-electric">{r.document.documentId}</Link>
                    <div className="text-xs text-muted2">{r.document.title}</div>
                  </TD>
                  <TD className="text-muted2">{r.provider}</TD>
                  <TD>
                    <div className="text-sm">{signed}/{recipients.length} signed</div>
                    <div className="text-xs text-muted2">{recipients.map((s) => s.role ?? "Signer").join(" · ") || "—"}</div>
                  </TD>
                  <TD><StatusBadge status={r.status} /></TD>
                  <TD className="text-muted2">{formatDate(r.createdAt)}</TD>
                  <TD className="text-muted2">{r.createdBy.firstName} {r.createdBy.lastName}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
