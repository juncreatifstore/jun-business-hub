import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { FilterBar } from "@/components/ui/filter-bar";
import { ListCount, Pagination, RecordList, RecordCard, RecordField } from "@/components/ui/record-list";
import { formatDate } from "@/lib/utils";
import { Users } from "lucide-react";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;
const SORTS = ["RECENT", "NAME_ASC", "NAME_DESC", "STATUS"] as const;
type SortKey = (typeof SORTS)[number];

type Params = { q?: string; status?: string; sort?: string; page?: string };

function sortOrder(sort: SortKey): Prisma.ClientOrderByWithRelationInput[] {
  if (sort === "NAME_ASC") return [{ firstName: "asc" }, { lastName: "asc" }];
  if (sort === "NAME_DESC") return [{ firstName: "desc" }, { lastName: "desc" }];
  if (sort === "STATUS") return [{ status: "asc" }, { firstName: "asc" }];
  return [{ createdAt: "desc" }];
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export default async function ClientsPage(props: { searchParams: Promise<Params> }) {
  const searchParams = await props.searchParams;
  await requirePermission("CLIENT_READ");
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const sort = SORTS.includes(searchParams.sort as SortKey) ? (searchParams.sort as SortKey) : "RECENT";
  const requestedPage = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
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

  const total = await prisma.client.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const clients = await prisma.client.findMany({
    where,
    orderBy: sortOrder(sort),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { owner: true, tags: true, _count: { select: { cases: true } } },
  });
  const paginationParams = {
    q: q || undefined,
    status: status && status !== "ALL" ? status : undefined,
    sort: sort !== "RECENT" ? sort : undefined,
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Registre central des clients, contacts, dossiers et responsables."
        actionHref="/app/clients/new"
        actionLabel="Nouveau client"
      />

      <FilterBar
        searchValue={q}
        placeholder="Nom, email, téléphone, ID…"
        activeCount={(status ? 1 : 0) + (sort !== "RECENT" ? 1 : 0)}
        resetHref="/app/clients"
      >
        <Select name="status" defaultValue={status ?? "ALL"}>
          <option value="ALL">Tous les statuts actifs</option>
          <option value="LEAD">Lead</option>
          <option value="ACTIVE">Actif</option>
          <option value="INACTIVE">Inactif</option>
          <option value="ARCHIVED">Archivé</option>
        </Select>
        <Select name="sort" defaultValue={sort}>
          <option value="RECENT">Plus récents</option>
          <option value="NAME_ASC">Nom A → Z</option>
          <option value="NAME_DESC">Nom Z → A</option>
          <option value="STATUS">Par statut</option>
        </Select>
      </FilterBar>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "Aucun client trouvé" : "Aucun client"}
          description={
            q
              ? "Essayez un autre nom, email ou identifiant."
              : "Créez le premier client pour démarrer le registre JUN."
          }
          actionHref="/app/clients/new"
          actionLabel="Créer un client"
        />
      ) : (
        <>
          <div className="mb-3">
            <ListCount shown={clients.length} total={total} label="client" />
          </div>

          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Client</TH>
                  <TH>ID interne</TH>
                  <TH>Contact</TH>
                  <TH>Dossiers</TH>
                  <TH>Statut</TH>
                  <TH>Responsable</TH>
                  <TH>Créé</TH>
                </tr>
              </THead>
              <tbody>
                {clients.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link
                        href={`/app/clients/${c.id}/dashboard`}
                        className="font-medium text-ink hover:text-electric"
                      >
                        {c.firstName} {c.lastName}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.tags.slice(0, 3).map((t) => (
                          <Badge key={t.id} className="border border-line bg-ink/[0.03] text-muted2">
                            {t.tag}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD>
                      <Link
                        href={`/app/clients/${c.id}/dashboard`}
                        className="registry-id hover:text-electric"
                      >
                        {c.internalId}
                      </Link>
                    </TD>
                    <TD className="text-muted2">{c.email ?? c.phone ?? "—"}</TD>
                    <TD>{c._count.cases}</TD>
                    <TD>
                      <StatusBadge status={c.status} />
                    </TD>
                    <TD className="text-muted2">
                      {c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : "—"}
                    </TD>
                    <TD className="text-muted2">{formatDate(c.createdAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>

          <RecordList className="md:hidden">
            {clients.map((c) => (
              <RecordCard
                key={c.id}
                href={`/app/clients/${c.id}/dashboard`}
                title={`${c.firstName} ${c.lastName}`}
                subtitle={<span className="registry-id">{c.internalId}</span>}
                leading={
                  <span className="flex h-10 w-10 items-center justify-center rounded-full tint-accent text-sm font-semibold text-accent">
                    {initials(c.firstName, c.lastName)}
                  </span>
                }
                badges={<StatusBadge status={c.status} />}
              >
                <RecordField label="Dossiers" value={c._count.cases} />
                <RecordField label="Contact" value={c.email ?? c.phone ?? "—"} />
                <RecordField
                  label="Responsable"
                  value={c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : "Non assigné"}
                />
              </RecordCard>
            ))}
          </RecordList>

          <Pagination basePath="/app/clients" page={page} totalPages={totalPages} params={paginationParams} />
        </>
      )}
    </div>
  );
}
