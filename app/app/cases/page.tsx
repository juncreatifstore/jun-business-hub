import Link from "next/link";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { FilterBar } from "@/components/ui/filter-bar";
import { Button } from "@/components/ui/button";
import { ListCount, Pagination, RecordList, RecordCard, RecordField } from "@/components/ui/record-list";
import { formatDate } from "@/lib/utils";
import { FolderKanban } from "lucide-react";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "WAITING_INTERNAL",
  "COMPLETED",
  "CANCELLED",
  "ARCHIVED",
];
const SORTS = ["RECENT", "DUE_ASC", "PRIORITY", "CLIENT"] as const;
type SortKey = (typeof SORTS)[number];
const PAGE_SIZE = 25;

type Params = { q?: string; status?: string; sort?: string; page?: string };

function caseOrder(sort: SortKey): Prisma.CaseOrderByWithRelationInput[] {
  if (sort === "DUE_ASC") return [{ dueDate: "asc" }, { createdAt: "desc" }];
  if (sort === "PRIORITY") return [{ priority: "desc" }, { createdAt: "desc" }];
  if (sort === "CLIENT") return [{ client: { firstName: "asc" } }, { client: { lastName: "asc" } }];
  return [{ createdAt: "desc" }];
}

export default async function CasesPage({ searchParams }: { searchParams: Params }) {
  const user = await requirePermission("CASE_READ");
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const sort = SORTS.includes(searchParams.sort as SortKey) ? (searchParams.sort as SortKey) : "RECENT";
  const requestedPage = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const where: Prisma.CaseWhereInput = {
    ...(status && status !== "ALL" ? { status: status as never } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { caseNumber: { contains: q, mode: "insensitive" } },
            {
              client: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          ],
        }
      : {}),
  };
  const total = await prisma.case.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const cases = await prisma.case.findMany({
    where,
    orderBy: caseOrder(sort),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { client: true, owner: true },
  });
  const paginationParams = {
    q: q || undefined,
    status: status && status !== "ALL" ? status : undefined,
    sort: sort !== "RECENT" ? sort : undefined,
  };

  return (
    <div>
      <PageHeader
        title="Dossiers"
        subtitle="Suivi des services clients, responsables, priorités, échéances et état opérationnel."
        actionHref="/app/cases/new"
        actionLabel="Nouveau dossier"
      />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {can(user, "CASE_ADMIN") ? (
          <Link href="/app/cases/dashboard">
            <Button variant="outline">Dashboard global des dossiers</Button>
          </Link>
        ) : (
          <span />
        )}
        <FilterBar
          searchValue={q}
          placeholder="Numéro, titre, client…"
          activeCount={(status ? 1 : 0) + (sort !== "RECENT" ? 1 : 0)}
          resetHref="/app/cases"
          className="mb-0 flex-1 lg:max-w-4xl"
        >
          <Select name="status" defaultValue={status ?? "ALL"}>
            <option value="ALL">Tous les statuts</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
          <Select name="sort" defaultValue={sort}>
            <option value="RECENT">Plus récents</option>
            <option value="DUE_ASC">Échéance proche</option>
            <option value="PRIORITY">Priorité</option>
            <option value="CLIENT">Client A → Z</option>
          </Select>
        </FilterBar>
      </div>
      {cases.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Aucun dossier"
          description="Ouvrez un dossier pour suivre un engagement client de bout en bout."
          actionHref="/app/cases/new"
          actionLabel="Ouvrir un dossier"
        />
      ) : (
        <>
          <div className="mb-3">
            <ListCount shown={cases.length} total={total} label="dossier" />
          </div>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Dossier</TH>
                  <TH>Titre</TH>
                  <TH>Client</TH>
                  <TH>Type</TH>
                  <TH>Statut</TH>
                  <TH>Priorité</TH>
                  <TH>Responsable</TH>
                  <TH>Échéance</TH>
                </tr>
              </THead>
              <tbody>
                {cases.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/app/cases/${c.id}/dashboard`} className="registry-id hover:text-electric">
                        {c.caseNumber}
                      </Link>
                    </TD>
                    <TD>
                      <Link
                        href={`/app/cases/${c.id}/dashboard`}
                        className="font-medium text-ink hover:text-electric"
                      >
                        {c.title}
                      </Link>
                    </TD>
                    <TD>
                      <Link
                        href={`/app/clients/${c.clientId}/dashboard`}
                        className="text-muted2 hover:text-electric"
                      >
                        {c.client.firstName} {c.client.lastName}
                      </Link>
                    </TD>
                    <TD className="text-muted2">{c.type}</TD>
                    <TD>
                      <StatusBadge status={c.status} />
                    </TD>
                    <TD>
                      <StatusBadge status={c.priority} />
                    </TD>
                    <TD className="text-muted2">
                      {c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : "—"}
                    </TD>
                    <TD className="text-muted2">{formatDate(c.dueDate)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
          <RecordList className="md:hidden">
            {cases.map((c) => (
              <RecordCard
                key={c.id}
                href={`/app/cases/${c.id}/dashboard`}
                title={c.title}
                subtitle={<span className="registry-id">{c.caseNumber}</span>}
                badges={<StatusBadge status={c.status} />}
                footer={c.dueDate ? `Échéance ${formatDate(c.dueDate)}` : undefined}
              >
                {c.priority !== "MEDIUM" && c.priority !== "LOW" ? (
                  <RecordField label="Priorité" value={c.priority} valueClassName="text-warning" />
                ) : null}
                <RecordField label="Client" value={`${c.client.firstName} ${c.client.lastName}`} />
                <RecordField
                  label="Responsable"
                  value={c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : "Non assigné"}
                />
              </RecordCard>
            ))}
          </RecordList>
          <Pagination basePath="/app/cases" page={page} totalPages={totalPages} params={paginationParams} />
        </>
      )}
    </div>
  );
}
