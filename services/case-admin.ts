"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

function ids(formData:FormData){return [...new Set(formData.getAll("caseIds").map(v=>String(v)).filter(Boolean))].slice(0,100);}
function back(message:string,error=false){redirect(`/app/cases/dashboard?${error?"toast_error":"toast"}=${encodeURIComponent(message)}`);}

export async function bulkAssignCases(formData:FormData){
 const user=await assertPermission("CASE_ADMIN");const caseIds=ids(formData);const ownerId=String(formData.get("ownerId")||"").trim();
 if(!caseIds.length)back("Select at least one Case.",true);
 if(!ownerId)back("Select a responsible owner.",true);
 const owner=await prisma.user.findUnique({where:{id:ownerId},select:{id:true,firstName:true,lastName:true,status:true}});if(!owner||owner.status!=="ACTIVE")back("Selected owner is not active.",true);
 const before=await prisma.case.findMany({where:{id:{in:caseIds}},select:{id:true,caseNumber:true,clientId:true,ownerId:true}});
 if(!before.length)back("No valid Case selected.",true);
 await prisma.case.updateMany({where:{id:{in:before.map(c=>c.id)}},data:{ownerId}});
 for(const c of before){await audit({userId:user.id,action:"CASE_ADMIN_REASSIGN",resourceType:"Case",resourceId:c.id,before:{ownerId:c.ownerId},after:{ownerId,ownerName:`${owner.firstName} ${owner.lastName}`}});await logActivity({type:"CASE_UPDATED",message:`Case ${c.caseNumber} reassigned to ${owner.firstName} ${owner.lastName}`,userId:user.id,clientId:c.clientId,caseId:c.id});}
 revalidatePath("/app/cases");revalidatePath("/app/cases/dashboard");back(`${before.length} Case(s) reassigned.`);
}

export async function bulkSetCasePriority(formData:FormData){
 const user=await assertPermission("CASE_ADMIN");const caseIds=ids(formData);const priority=String(formData.get("priority")||"").toUpperCase();
 if(!caseIds.length)back("Select at least one Case.",true);
 if(!["LOW","MEDIUM","HIGH","URGENT"].includes(priority))back("Invalid priority.",true);
 const before=await prisma.case.findMany({where:{id:{in:caseIds}},select:{id:true,caseNumber:true,clientId:true,priority:true}});if(!before.length)back("No valid Case selected.",true);
 await prisma.case.updateMany({where:{id:{in:before.map(c=>c.id)}},data:{priority:priority as never}});
 for(const c of before){await audit({userId:user.id,action:"CASE_ADMIN_PRIORITY",resourceType:"Case",resourceId:c.id,before:{priority:c.priority},after:{priority}});await logActivity({type:"CASE_UPDATED",message:`Case ${c.caseNumber} priority changed to ${priority}`,userId:user.id,clientId:c.clientId,caseId:c.id});}
 revalidatePath("/app/cases");revalidatePath("/app/cases/dashboard");back(`${before.length} Case(s) updated to ${priority}.`);
}
