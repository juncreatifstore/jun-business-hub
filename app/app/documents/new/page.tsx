import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { DocumentCreateForm } from "@/components/app/document-create-form";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: { clientId?: string; caseId?: string; type?: string };
}) {
  await requirePermission("DOCUMENT_CREATE");
  const [clients, cases] = await Promise.all([
    prisma.client.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, internalId: true },
    }),
    prisma.case.findMany({
      where: { status: { notIn: ["ARCHIVED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, caseNumber: true, title: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="New document"
        subtitle="Start blank or write it with JUN AI. A registry ID is assigned on creation."
      />
      <DocumentCreateForm
        clients={clients}
        cases={cases}
        templates={[]}
        defaultClientId={searchParams.clientId}
        defaultCaseId={searchParams.caseId}
        defaultType={searchParams.type}
      />
    </div>
  );
}
