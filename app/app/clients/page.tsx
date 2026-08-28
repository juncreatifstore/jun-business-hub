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
import { Search, Users } from "lucide-react";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  await requirePermission("CLIENT_READ");
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const where: Prisma.ClientWhereInput = {
    ...(status && status !== "ALL" ? { status: status as never } : { status: { not: "ARCHIVED" } }),
    ...(q ? { OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { internalId: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };
  const clients = await prisma.client.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { owner: true, tags: true, _count: { select: { cases: true } } } });

  return <div>
    <PageHeader title="Clients" subtitle="Registre central des clients, contacts, dossiers et responsables." actionHref="/app/clients/new" actionLabel="Nouveau client" />
    <form className="mb-5 grid gap-2 rounded-2xl border border-line bg-night-soft/45 p-3 shadow-sm md:grid-cols-[minmax(240px,1fr)_180px_auto]">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted2"/><Input name="q" placeholder="Nom, email, téléphone, ID…" defaultValue={q} className="pl-9" /></div>
      <Select name="status" defaultValue={status ?? "ALL"}><option value="ALL">Tous les statuts</option><option value="LEAD">Lead</option><option value="ACTIVE">Actif</option><option value="INACTIVE">Inactif</option><option value="ARCHIVED">Archivé</option></Select>
      <Button variant="outline">Filtrer</Button>
    </form>
    {clients.length === 0 ? <EmptyState icon={Users} title={q ? "Aucun client trouvé" : "Aucun client"} description={q ? "Essayez un autre nom, email ou identifiant." : "Créez le premier client pour démarrer le registre JUN."} actionHref="/app/clients/new" actionLabel="Créer un client" /> : <Table>
      <THead><tr><TH>Client</TH><TH>ID interne</TH><TH>Contact</TH><TH>Dossiers</TH><TH>Statut</TH><TH>Responsable</TH><TH>Créé</TH></tr></THead>
      <tbody>{clients.map((c) => <TR key={c.id}>
        <TD><Link href={`/app/clients/${c.id}/dashboard`} className="font-medium text-ink hover:text-electric">{c.firstName} {c.lastName}</Link><div className="mt-1 flex flex-wrap gap-1">{c.tags.slice(0,3).map((t)=><Badge key={t.id} className="border border-line bg-white/[0.03] text-muted2">{t.tag}</Badge>)}</div></TD>
        <TD><Link href={`/app/clients/${c.id}/dashboard`} className="registry-id hover:text-electric">{c.internalId}</Link></TD>
        <TD className="text-muted2">{c.email ?? c.phone ?? "—"}</TD>
        <TD>{c._count.cases}</TD>
        <TD><StatusBadge status={c.status}/></TD>
        <TD className="text-muted2">{c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : "—"}</TD>
        <TD className="text-muted2">{formatDate(c.createdAt)}</TD>
      </TR>)}</tbody>
    </Table>}
  </div>;
}
