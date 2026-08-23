"use server";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getCaseOperations, saveCaseOperations, type CaseMilestoneStatus } from "@/lib/case-operations";

const ALLOWED: CaseMilestoneStatus[] = ["TODO","IN_PROGRESS","WAITING","DONE","CANCELLED"];
function refresh(caseId:string){revalidatePath(`/app/cases/${caseId}/operations`);revalidatePath(`/app/cases/${caseId}/dashboard`);revalidatePath(`/app/cases/${caseId}`);}

export async function addCaseMilestone(caseId:string,formData:FormData){
 const user=await assertPermission("CASE_UPDATE");
 const c=await prisma.case.findUnique({where:{id:caseId},select:{id:true,clientId:true,caseNumber:true}});if(!c)return;
 const title=String(formData.get("title")||"").trim().slice(0,180);if(!title)return;
 const description=String(formData.get("description")||"").trim().slice(0,1500);
 const ownerId=String(formData.get("ownerId")||"").trim()||null;
 const dueDate=String(formData.get("dueDate")||"").trim()||null;
 if(ownerId){const exists=await prisma.user.findUnique({where:{id:ownerId},select:{id:true}});if(!exists)return;}
 const state=await getCaseOperations(caseId);const now=new Date().toISOString();
 state.milestones.push({id:randomUUID(),title,description,status:"TODO",ownerId,dueDate,blocker:"",createdAt:now,updatedAt:now});
 await saveCaseOperations(state);await audit({userId:user.id,action:"CASE_MILESTONE_CREATE",resourceType:"Case",resourceId:caseId,after:{title,ownerId,dueDate}});await logActivity({type:"CASE_UPDATED",message:`Milestone added to ${c.caseNumber}: ${title}`,userId:user.id,clientId:c.clientId,caseId});refresh(caseId);
}

export async function updateCaseMilestone(caseId:string,milestoneId:string,formData:FormData){
 const user=await assertPermission("CASE_UPDATE");const c=await prisma.case.findUnique({where:{id:caseId},select:{clientId:true,caseNumber:true}});if(!c)return;
 const state=await getCaseOperations(caseId);const item=state.milestones.find(m=>m.id===milestoneId);if(!item)return;
 const before={...item};const status=String(formData.get("status")||item.status) as CaseMilestoneStatus;if(!ALLOWED.includes(status))return;
 const title=String(formData.get("title")||item.title).trim().slice(0,180)||item.title;
 const description=String(formData.get("description")??item.description).trim().slice(0,1500);
 const ownerId=String(formData.get("ownerId")??item.ownerId??"").trim()||null;
 const dueDate=String(formData.get("dueDate")??item.dueDate??"").trim()||null;
 const blocker=String(formData.get("blocker")??item.blocker).trim().slice(0,1000);
 Object.assign(item,{title,description,status,ownerId,dueDate,blocker,updatedAt:new Date().toISOString()});await saveCaseOperations(state);
 await audit({userId:user.id,action:"CASE_MILESTONE_UPDATE",resourceType:"Case",resourceId:caseId,before,after:{...item}});await logActivity({type:"CASE_UPDATED",message:`Milestone "${item.title}" → ${status.replaceAll("_"," ")}`,userId:user.id,clientId:c.clientId,caseId});refresh(caseId);
}

export async function deleteCaseMilestone(caseId:string,milestoneId:string){
 const user=await assertPermission("CASE_UPDATE");const c=await prisma.case.findUnique({where:{id:caseId},select:{clientId:true,caseNumber:true}});if(!c)return;
 const state=await getCaseOperations(caseId);const item=state.milestones.find(m=>m.id===milestoneId);if(!item)return;state.milestones=state.milestones.filter(m=>m.id!==milestoneId);await saveCaseOperations(state);
 await audit({userId:user.id,action:"CASE_MILESTONE_DELETE",resourceType:"Case",resourceId:caseId,before:item});await logActivity({type:"CASE_UPDATED",message:`Milestone removed from ${c.caseNumber}: ${item.title}`,userId:user.id,clientId:c.clientId,caseId});refresh(caseId);
}
