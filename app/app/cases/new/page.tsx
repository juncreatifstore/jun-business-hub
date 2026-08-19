import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { CaseForm } from "@/components/app/case-form";

export const dynamic = "force-dynamic";

export default async function NewCasePage({ searchParams }: { searchParams: { clientId?: string } }) {
  await requirePermission("CASE_CREATE");
  const clients = await prisma.client.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, internalId: true },
  });
  return (
    <div>
      <PageHeader title="New case" subtitle="A case number will be assigned automatically." />
      <CaseForm clients={clients} defaultClientId={searchParams.clientId} />
    </div>
  );
}
