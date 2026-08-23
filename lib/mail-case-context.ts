import "server-only";
import { prisma } from "@/lib/prisma";

const PREFIX="mail.case.context.";
export type MailCaseContext={threadId:string;caseId:string|null;updatedAt:string;updatedById:string};
function key(threadId:string){return `${PREFIX}${threadId}`;}

export async function getMailCaseContext(threadId:string):Promise<MailCaseContext>{
 const row=await prisma.appSetting.findUnique({where:{key:key(threadId)},select:{value:true}});
 if(!row)return{threadId,caseId:null,updatedAt:new Date(0).toISOString(),updatedById:"SYSTEM"};
 try{const v=JSON.parse(row.value) as MailCaseContext;return{threadId,caseId:v.caseId??null,updatedAt:v.updatedAt||new Date(0).toISOString(),updatedById:v.updatedById||"SYSTEM"};}catch{return{threadId,caseId:null,updatedAt:new Date(0).toISOString(),updatedById:"SYSTEM"};}
}

export async function getMailCaseContextMap(threadIds:string[]){
 const unique=[...new Set(threadIds.filter(Boolean))];
 const rows=unique.length?await prisma.appSetting.findMany({where:{key:{in:unique.map(key)}},select:{key:true,value:true}}):[];
 const map=new Map<string,MailCaseContext>();
 for(const id of unique)map.set(id,{threadId:id,caseId:null,updatedAt:new Date(0).toISOString(),updatedById:"SYSTEM"});
 for(const row of rows){const threadId=row.key.slice(PREFIX.length);try{const v=JSON.parse(row.value) as MailCaseContext;map.set(threadId,{threadId,caseId:v.caseId??null,updatedAt:v.updatedAt||new Date(0).toISOString(),updatedById:v.updatedById||"SYSTEM"});}catch{}}
 return map;
}

export async function saveMailCaseContext(input:MailCaseContext){
 await prisma.appSetting.upsert({where:{key:key(input.threadId)},update:{value:JSON.stringify(input)},create:{key:key(input.threadId),value:JSON.stringify(input)}});
 return input;
}
