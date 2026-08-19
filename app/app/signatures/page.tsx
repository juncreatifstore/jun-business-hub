import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { signatureRecipients } from "@/lib/signature-recipients";
import { PenLine } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SignaturesPage() {
  await requirePermission("DOCUMENT_READ");
  const requests = await prisma.signatureRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { document: true, createdBy: true },
  });

  return (
    <div>
      <PageHeader title="Signatures" subtitle={process.env.SIGNATURE_PROVIDER === "DOCUSIGN" ? "Track signature requests — sent and completed via DocuSign." : "Track signature requests. MOCK provider (development) — set SIGNATURE_PROVIDER=DOCUSIGN with credentials for production."} />
      {requests.length === 0 ? (
        <EmptyState icon={PenLine} title="No signature requests" description="Finalize a document, then use “Send for signature” on its page." actionHref="/app/documents" actionLabel="Browse documents" />
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
                  <TD className="text-muted2">{signed}/{recipients.length} signed</TD>
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
