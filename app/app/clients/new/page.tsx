import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/app/page-header";
import { ClientForm } from "@/components/app/client-form";
import { createClient } from "@/services/clients";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  await requirePermission("CLIENT_CREATE");
  return (
    <div>
      <PageHeader title="New client" subtitle="An internal registry ID will be assigned automatically." />
      <ClientForm action={createClient} submitLabel="Create client" />
    </div>
  );
}
