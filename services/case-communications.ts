"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createCaseCommunication, deleteCaseCommunicationRecord, listCaseCommunications, type CaseCommunicationChannel, type CaseCommunicationDirection, type CaseCommunicationImportance } from "@/lib/case-communications";

const CHANNELS=["EMAIL","WHATSAPP","PHONE","MEETING","SMS","OTHER"];
const DIRECTIONS=["INBOUND","OUTBOUND","INTERNAL"];
const IMPORTANCE=["NORMAL","IMPORTANT","CRITICAL"];

function path(caseId:string,msg?:string,error=false){return `/app/cases/${caseId}/history${msg?`?${error?"toast_error":"toast"}=${encodeURIComponent(msg)}`:""}`;}

export async function addCaseCommunication(caseId:string,formData:FormData){
  const user=await assertPermission("CASE_UPDATE");
  const c=await prisma.case.findUnique({where:{id:caseId},select:{id:true,clientId:true,caseNumber:true}});
  if(!c)redirect("/app/cases?toast_error=Case%20not%20found");
  const channel=String(formData.get("channel")||"").toUpperCase();
  const direction=String(formData.get("direction")||"").toUpperCase();
  const importance=String(formData.get("importance")||"NORMAL").toUpperCase();
  const subject=String(formData.get("subject")||"").trim().slice(0,200);
  const summary=String(formData.get("summary")||"").trim().slice(0,5000);
  const contact=String(formData.get("contact")||"").trim().slice(0,250);
  const occurredRaw=String(formData.get("occurredAt")||"").trim();
  if(!CHANNELS.includes(channel)||!DIRECTIONS.includes(direction)||!IMPORTANCE.includes(importance)||!subject||!summary)redirect(path(caseId,"Channel, direction, subject and summary are required.",true));
  const occurredAt=occurredRaw&& !Number.isNaN(new Date(occurredRaw).getTime())?new Date(occurredRaw).toISOString():new Date().toISOString();
  const row=await createCaseCommunication({caseId,clientId:c.clientId,channel:channel as CaseCommunicationChannel,direction:direction as CaseCommunicationDirection,importance:importance as CaseCommunicationImportance,subject,summary,contact,occurredAt,createdById:user.id});
  await audit({userId:user.id,action:"CASE_COMMUNICATION_LOGGED",resourceType:"Case",resourceId:caseId,after:{communicationId:row.id,channel,direction,importance,subject,contact,occurredAt}});
  await logActivity({userId:user.id,type:"CASE_UPDATED",message:`${channel} communication logged: ${subject}`,clientId:c.clientId,caseId});
  revalidatePath(`/app/cases/${caseId}/history`);revalidatePath(`/app/cases/${caseId}/dashboard`);
  redirect(path(caseId,"Communication logged"));
}

export async function deleteCaseCommunication(caseId:string,communicationId:string,formData:FormData){
  const user=await assertPermission("CASE_UPDATE");
  const reason=String(formData.get("reason")||"").trim().slice(0,500);
  if(reason.length<5)redirect(path(caseId,"A deletion reason is required.",true));
  const row=(await listCaseCommunications(caseId)).find(x=>x.id===communicationId);
  if(!row)redirect(path(caseId,"Communication not found.",true));
  await deleteCaseCommunicationRecord(communicationId);
  await audit({userId:user.id,action:"CASE_COMMUNICATION_DELETED",resourceType:"Case",resourceId:caseId,before:row,after:{reason}});
  await logActivity({userId:user.id,type:"CASE_UPDATED",message:`Communication record removed: ${row.subject} · ${reason}`,clientId:row.clientId,caseId});
  revalidatePath(`/app/cases/${caseId}/history`);
  redirect(path(caseId,"Communication record removed"));
}
