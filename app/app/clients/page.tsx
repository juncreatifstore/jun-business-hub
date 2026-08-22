import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Users } from "lucide-react";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  await requirePermission("CLIENT_READ");
  const q = searchParams.q?.trim();
  const status = searchParams.status;

  const where: Prisma.ClientWhereInput = {
    ...(status && status !== "ALL" ? { status: status as never } : { status: { not: "ARCHIVED" } }),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { internalId: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const clients = await prisma.client.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { owner: true, tags: true, _count: { select: { cases: true } } },
  });

  return (
    <div>
      <PageHeader title="Clients" subtitle="Every person JUN is responsible for." actionHref="/app/clients/new" actionLabel="New client" />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" placeholder="Search name, email, phone, ID…" defaultValue={q} className="max-w-xs" />
        <Select name="status" defaultValue={status ?? "ALL"} className="w-40">
          <option value="ALL">All statuses</option>
          <option value="LEAD">Lead</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Button variant="outline">Filter</Button>
      </form>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "No clients match this search" : "No clients yet"}
          description={q ? "Try a different name, email, or internal ID." : "Create the first client file to start building the JUN registry."}
          actionHref="/app/clients/new"
          actionLabel="Create client"
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Client</TH><TH>Internal ID</TH><TH>Contact</TH><TH>Cases</TH><TH>Status</TH><TH>Owner</TH><TH>Created</TH>
            </tr>
          </THead>
          <tbody>
            {clients.map((c) => (
              <TR key={c.id}>
                <TD>
                  <Link href={`/app/clients/${c.id}/dashboard`} className="font-medium hover:text-electric">
                    {c.firstName} {c.lastName}
                  </Link>
                  <div className="mt-0.5 flex gap-1">
                    {c.tags.slice(0, 3).map((t) => (
                      <Badge key={t.id} className="bg-surface text-muted2 border border-line">{t.tag}</Badge>
                    ))}
                  </div>
                </TD>
                <TD><Link href={`/app/clients/${c.id}/dashboard`} className="registry-id hover:text-electric">{c.internalId}</Link></TD>
                <TD className="text-muted2">{c.email ?? c.phone ?? "—"}</TD>
                <TD>{c._count.cases}</TD>
                <TD><StatusBadge status={c.status} /></TD>
                <TD className="text-muted2">{c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : "—"}</TD>
                <TD className="text-muted2">{formatDate(c.createdAt)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
