import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { CaseEditForm } from "@/components/app/case-edit-form";
import { Button } from "@/components/ui/button";

export const dynamic="force-dynamic";
export default async function EditCasePage({params}:{params:{id:string}}){
  await requirePermission("CASE_UPDATE");
  const [c,clients]=await Promise.all([
    prisma.case.findUnique({where:{id:params.id}}),
    prisma.client.findMany({where:{status:{not:"ARCHIVED"}},orderBy:{lastName:"asc"},select:{id:true,firstName:true,lastName:true,internalId:true}}),
  ]);
  if(!c) notFound();
  return <div><PageHeader title={`Correct ${c.caseNumber}`} subtitle="Edit case information. Every correction is audited."><Link href={`/app/cases/${c.id}`}><Button variant="outline">Cancel</Button></Link></PageHeader><CaseEditForm caseId={c.id} clients={clients} value={{clientId:c.clientId,title:c.title,type:c.type,priority:c.priority,status:c.status,dueDate:c.dueDate?c.dueDate.toISOString().slice(0,10):"",tags:c.tags.join(", "),description:c.description||""}}/></div>;
}
