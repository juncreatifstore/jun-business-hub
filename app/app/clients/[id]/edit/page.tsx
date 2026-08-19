import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { ClientForm } from "@/components/app/client-form";
import { updateClient } from "@/services/clients";

export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: { params: { id: string } }) {
  await requirePermission("CLIENT_UPDATE");
  const client = await prisma.client.findUnique({ where: { id: params.id }, include: { tags: true } });
  if (!client) notFound();
  const action = updateClient.bind(null, client.id);
  return (
    <div>
      <PageHeader title={`Edit ${client.firstName} ${client.lastName}`} subtitle={client.internalId} />
      <ClientForm
        action={action}
        submitLabel="Save changes"
        defaults={{
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email ?? "",
          phone: client.phone ?? "",
          whatsapp: client.whatsapp ?? "",
          address: client.address ?? "",
          country: client.country ?? "",
          nationality: client.nationality ?? "",
          birthDate: client.birthDate ? client.birthDate.toISOString().slice(0, 10) : "",
          notes: client.notes ?? "",
          status: client.status,
          tags: client.tags.map((t) => t.tag).join(", "),
        }}
      />
    </div>
  );
}
