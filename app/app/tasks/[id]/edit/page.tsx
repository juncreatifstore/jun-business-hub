import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { TaskEditForm } from "@/components/app/task-edit-form";
import { Button } from "@/components/ui/button";
export const dynamic="force-dynamic";
export default async function EditTaskPage({params}:{params:{id:string}}){
 await requirePermission("TASK_UPDATE");
 const [t,users,clients,cases]=await Promise.all([
  prisma.task.findUnique({where:{id:params.id}}),
  prisma.user.findMany({where:{status:"ACTIVE",role:{not:"CLIENT"}},orderBy:{firstName:"asc"},select:{id:true,firstName:true,lastName:true}}),
  prisma.client.findMany({where:{status:{not:"ARCHIVED"}},orderBy:{lastName:"asc"},select:{id:true,firstName:true,lastName:true,internalId:true}}),
  prisma.case.findMany({where:{status:{not:"ARCHIVED"}},orderBy:{createdAt:"desc"},take:500,select:{id:true,caseNumber:true,title:true}}),
 ]);
 if(!t) notFound();
 return <div><PageHeader title="Correct task" subtitle="Edit task details. Every correction is audited."><Link href="/app/tasks"><Button variant="outline">Cancel</Button></Link></PageHeader><TaskEditForm taskId={t.id} users={users} clients={clients} cases={cases} value={{title:t.title,description:t.description||"",clientId:t.clientId||"",caseId:t.caseId||"",assigneeId:t.assigneeId||"",priority:t.priority,status:t.status,dueDate:t.dueDate?t.dueDate.toISOString().slice(0,10):""}}/></div>
}
