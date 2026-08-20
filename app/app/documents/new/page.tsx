import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { DocumentCreateForm } from "@/components/app/document-create-form";

export const dynamic = "force-dynamic";

type TemplateRow = {
  id: string;
  name: string;
  type: string;
  content: string;
  category: string;
  language: string;
  variables: unknown;
};

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: { clientId?: string; caseId?: string; type?: string; templateId?: string };
}) {
  await requirePermission("DOCUMENT_CREATE");
  const [clients, cases, templates] = await Promise.all([
    prisma.client.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, internalId: true },
    }),
    prisma.case.findMany({
      where: { status: { notIn: ["ARCHIVED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, caseNumber: true, title: true, clientId: true },
    }),
    prisma.$queryRaw<TemplateRow[]>`
      SELECT id,name,type::text AS type,content,category,language,variables
      FROM "DocumentTemplate"
      WHERE "isActive"=true AND "isReference"=false
      ORDER BY category ASC,name ASC
    `.catch(() => [] as TemplateRow[]),
  ]);

  return (
    <div>
      <PageHeader
        title="New document"
        subtitle="Start blank, reuse an active JUN template, or generate a draft with JUN AI. A registry ID is assigned automatically."
      />
      <DocumentCreateForm
        clients={clients}
        cases={cases}
        templates={templates}
        defaultClientId={searchParams.clientId}
        defaultCaseId={searchParams.caseId}
        defaultType={searchParams.type}
        defaultTemplateId={searchParams.templateId}
      />
    </div>
  );
}
