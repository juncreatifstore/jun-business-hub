import Link from "next/link";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { FolderKanban, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL", "COMPLETED", "CANCELLED", "ARCHIVED"];

export default async function CasesPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  const user = await requirePermission("CASE_READ");
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const where: Prisma.CaseWhereInput = {
    ...(status && status !== "ALL" ? { status: status as never } : {}),
    ...(q ? { OR: [
      { title: { contains: q, mode: "insensitive" } },
      { caseNumber: { contains: q, mode: "insensitive" } },
      { client: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] } },
    ] } : {}),
  };
  const cases = await prisma.case.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { client: true, owner: true } });

  return <div>
    <PageHeader title="Dossiers" subtitle="Suivi des services clients, responsables, priorités, échéances et état opérationnel." actionHref="/app/cases/new" actionLabel="Nouveau dossier" />
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      {can(user,"CASE_ADMIN") ? <Link href="/app/cases/dashboard"><Button variant="outline">Dashboard global des dossiers</Button></Link> : <span />}
      <form className="grid flex-1 gap-2 rounded-2xl border border-line bg-night-soft/45 p-3 shadow-sm md:grid-cols-[minmax(240px,1fr)_190px_auto] lg:max-w-3xl">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted2"/><Input name="q" placeholder="Numéro, titre, client…" defaultValue={q} className="pl-9"/></div>
        <Select name="status" defaultValue={status ?? "ALL"}><option value="ALL">Tous les statuts</option>{STATUSES.map((s)=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</Select>
        <Button variant="outline">Filtrer</Button>
      </form>
    </div>
    {cases.length === 0 ? <EmptyState icon={FolderKanban} title="Aucun dossier" description="Ouvrez un dossier pour suivre un engagement client de bout en bout." actionHref="/app/cases/new" actionLabel="Ouvrir un dossier"/> : <Table>
      <THead><tr><TH>Dossier</TH><TH>Titre</TH><TH>Client</TH><TH>Type</TH><TH>Statut</TH><TH>Priorité</TH><TH>Responsable</TH><TH>Échéance</TH></tr></THead>
      <tbody>{cases.map((c)=><TR key={c.id}>
        <TD><Link href={`/app/cases/${c.id}/dashboard`} className="registry-id hover:text-electric">{c.caseNumber}</Link></TD>
        <TD><Link href={`/app/cases/${c.id}/dashboard`} className="font-medium text-ink hover:text-electric">{c.title}</Link></TD>
        <TD><Link href={`/app/clients/${c.clientId}/dashboard`} className="text-muted2 hover:text-electric">{c.client.firstName} {c.client.lastName}</Link></TD>
        <TD className="text-muted2">{c.type}</TD><TD><StatusBadge status={c.status}/></TD><TD><StatusBadge status={c.priority}/></TD>
        <TD className="text-muted2">{c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : "—"}</TD><TD className="text-muted2">{formatDate(c.dueDate)}</TD>
      </TR>)}</tbody>
    </Table>}
  </div>;
}
