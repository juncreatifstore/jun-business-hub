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
import { FolderKanban } from "lucide-react";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL", "COMPLETED", "CANCELLED", "ARCHIVED"];

export default async function CasesPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  const user=await requirePermission("CASE_READ");const q = searchParams.q?.trim();const status = searchParams.status;
  const where: Prisma.CaseWhereInput = {...(status && status !== "ALL" ? { status: status as never } : {}),...(q?{OR:[{title:{contains:q,mode:"insensitive"}},{caseNumber:{contains:q,mode:"insensitive"}},{client:{OR:[{firstName:{contains:q,mode:"insensitive"}},{lastName:{contains:q,mode:"insensitive"}}]}}]}:{})};
  const cases = await prisma.case.findMany({where,orderBy:{createdAt:"desc"},take:100,include:{client:true,owner:true}});
  return <div>
    <PageHeader title="Cases" subtitle="Every client service and operational commitment, with an owner, deadline and financial position." actionHref="/app/cases/new" actionLabel="New case" />
    {can(user,"CASE_ADMIN")?<div className="mb-4"><Link href="/app/cases/dashboard"><Button variant="outline">Global Case Dashboard</Button></Link></div>:null}
    <form className="mb-4 flex flex-wrap gap-2"><Input name="q" placeholder="Search case number, title, client…" defaultValue={q} className="max-w-xs"/><Select name="status" defaultValue={status??"ALL"} className="w-48"><option value="ALL">All statuses</option>{STATUSES.map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</Select><Button variant="outline">Filter</Button></form>
    {cases.length===0?<EmptyState icon={FolderKanban} title="No cases yet" description="Open a case to track a client engagement from start to finish." actionHref="/app/cases/new" actionLabel="Open case"/>:<Table><THead><tr><TH>Case</TH><TH>Title</TH><TH>Client</TH><TH>Type</TH><TH>Status</TH><TH>Priority</TH><TH>Owner</TH><TH>Due</TH></tr></THead><tbody>{cases.map(c=><TR key={c.id}><TD><Link href={`/app/cases/${c.id}/dashboard`} className="registry-id hover:text-electric">{c.caseNumber}</Link></TD><TD><Link href={`/app/cases/${c.id}/dashboard`} className="font-medium hover:text-electric">{c.title}</Link></TD><TD><Link href={`/app/clients/${c.clientId}/dashboard`} className="text-muted2 hover:text-electric">{c.client.firstName} {c.client.lastName}</Link></TD><TD className="text-muted2">{c.type}</TD><TD><StatusBadge status={c.status}/></TD><TD><StatusBadge status={c.priority}/></TD><TD className="text-muted2">{c.owner?`${c.owner.firstName} ${c.owner.lastName}`:"—"}</TD><TD className="text-muted2">{formatDate(c.dueDate)}</TD></TR>)}</tbody></Table>}
  </div>;
}
