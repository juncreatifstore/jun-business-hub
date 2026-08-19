import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  await requirePermission("DOCUMENT_READ");
  const docs = await prisma.document.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" }, take: 100,
    include: { client: true, author: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  return (
    <div>
      <PageHeader title="Documents" subtitle="Every JUN document has a registry ID, versions, and — once final — an integrity hash." actionHref="/app/documents/new" actionLabel="New document" />
      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" description="Draft the first contract, receipt, or letter — a registry ID is assigned automatically." actionHref="/app/documents/new" actionLabel="New document" />
      ) : (
        <Table>
          <THead><tr><TH>Registry ID</TH><TH>Title</TH><TH>Type</TH><TH>Client</TH><TH>Version</TH><TH>Status</TH><TH>Updated</TH></tr></THead>
          <tbody>
            {docs.map((d) => (
              <TR key={d.id}>
                <TD><span className="registry-id">{d.documentId}</span></TD>
                <TD><Link href={`/app/documents/${d.id}`} className="font-medium hover:text-electric">{d.title}</Link></TD>
                <TD className="text-muted2">{d.type.replaceAll("_", " ")}</TD>
                <TD>{d.client ? <Link href={`/app/clients/${d.client.id}`} className="hover:text-electric">{d.client.firstName} {d.client.lastName}</Link> : "—"}</TD>
                <TD className="text-muted2">v{d.versions[0]?.version ?? 1}</TD>
                <TD><StatusBadge status={d.status} /></TD>
                <TD className="text-muted2">{formatDate(d.updatedAt)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
