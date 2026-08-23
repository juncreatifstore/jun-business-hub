import "server-only";

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

const PREFIX = "case.communication.";

export type CaseCommunicationChannel = "EMAIL" | "WHATSAPP" | "PHONE" | "MEETING" | "SMS" | "OTHER";
export type CaseCommunicationDirection = "INBOUND" | "OUTBOUND" | "INTERNAL";
export type CaseCommunicationImportance = "NORMAL" | "IMPORTANT" | "CRITICAL";

export type CaseCommunication = {
  id: string;
  caseId: string;
  clientId: string;
  channel: CaseCommunicationChannel;
  direction: CaseCommunicationDirection;
  importance: CaseCommunicationImportance;
  subject: string;
  summary: string;
  contact: string;
  occurredAt: string;
  createdAt: string;
  createdById: string;
};

function key(id:string){return `${PREFIX}${id}`;}
function parse(value:string):CaseCommunication|null{
  try{
    const v=JSON.parse(value) as CaseCommunication;
    if(!v?.id||!v.caseId||!v.clientId||!v.subject||!v.occurredAt)return null;
    return v;
  }catch{return null;}
}

export async function listCaseCommunications(caseId:string){
  const rows=await prisma.appSetting.findMany({where:{key:{startsWith:PREFIX}},select:{value:true},take:5000});
  return rows.map(r=>parse(r.value)).filter((v):v is CaseCommunication=>Boolean(v)&&v.caseId===caseId).sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime());
}

export async function createCaseCommunication(input:Omit<CaseCommunication,"id"|"createdAt">){
  const now=new Date().toISOString();
  const row:CaseCommunication={...input,id:randomUUID(),createdAt:now};
  await prisma.appSetting.create({data:{key:key(row.id),value:JSON.stringify(row)}});
  return row;
}

export async function deleteCaseCommunicationRecord(id:string){
  await prisma.appSetting.deleteMany({where:{key:key(id)}});
}
