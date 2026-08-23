import "server-only";
import { prisma } from "@/lib/prisma";
import { getMailIntelligence, type MailIntelligencePriority } from "@/lib/mail-intelligence";
import { getMailThreadState } from "@/lib/mail-thread-state";

const OWNER_PREFIX="mail.owner.";
const RUN_PREFIX="mail.automation.run.";
const CONFIG_KEY="mail.sla.config";

export type MailSlaConfig={URGENT:number;HIGH:number;MEDIUM:number;LOW:number};
export type MailSlaState={threadId:string;priority:MailIntelligencePriority;hours:number;startedAt:string;dueAt:string|null;remainingMinutes:number|null;status:"ON_TRACK"|"DUE_SOON"|"OVERDUE"|"PAUSED"|"RESOLVED";pausedReason?:string};
export type MailAutomationRun={id:string;threadId:string;ranAt:string;actions:string[];createdTaskId?:string;notifiedOwnerId?:string};

const DEFAULT_SLA:MailSlaConfig={URGENT:1,HIGH:4,MEDIUM:12,LOW:24};
function ownerKey(threadId:string){return `${OWNER_PREFIX}${threadId}`;}
function runKey(id:string){return `${RUN_PREFIX}${id}`;}

export async function getMailSlaConfig():Promise<MailSlaConfig>{const row=await prisma.appSetting.findUnique({where:{key:CONFIG_KEY},select:{value:true}});if(!row)return DEFAULT_SLA;try{const v=JSON.parse(row.value) as Partial<MailSlaConfig>;return {URGENT:Number(v.URGENT)||1,HIGH:Number(v.HIGH)||4,MEDIUM:Number(v.MEDIUM)||12,LOW:Number(v.LOW)||24};}catch{return DEFAULT_SLA;}}
export async function saveMailSlaConfig(config:MailSlaConfig){await prisma.appSetting.upsert({where:{key:CONFIG_KEY},create:{key:CONFIG_KEY,value:JSON.stringify(config)},update:{value:JSON.stringify(config)}});return config;}

export async function getMailOwnerId(threadId:string):Promise<string|null>{const row=await prisma.appSetting.findUnique({where:{key:ownerKey(threadId)},select:{value:true}});return row?.value||null;}
export async function getMailOwnerMap(threadIds:string[]){if(!threadIds.length)return new Map<string,string>();const rows=await prisma.appSetting.findMany({where:{key:{in:threadIds.map(ownerKey)}},select:{key:true,value:true}});return new Map(rows.map(r=>[r.key.slice(OWNER_PREFIX.length),r.value]));}
export async function setMailOwnerId(threadId:string,ownerId:string|null){if(ownerId){await prisma.appSetting.upsert({where:{key:ownerKey(threadId)},create:{key:ownerKey(threadId),value:ownerId},update:{value:ownerId}});}else{await prisma.appSetting.deleteMany({where:{key:ownerKey(threadId)}});}return ownerId;}

export async function getMailSlaState(threadId:string,now=new Date()):Promise<MailSlaState|null>{
 const [thread,intel,state,config]=await Promise.all([
  prisma.mailThread.findUnique({where:{id:threadId},select:{id:true,lastMessageAt:true,updatedAt:true,createdAt:true,aiDraft:true}}),
  getMailIntelligence(threadId),getMailThreadState(threadId),getMailSlaConfig(),
 ]);
 if(!thread||!intel)return null;
 const priority=intel.priority;const hours=config[priority];const started=thread.lastMessageAt??thread.updatedAt??thread.createdAt;
 if(state.workflowStatus==="RESOLVED")return{threadId,priority,hours,startedAt:started.toISOString(),dueAt:null,remainingMinutes:null,status:"RESOLVED"};
 if(state.workflowStatus==="WAITING_CLIENT")return{threadId,priority,hours,startedAt:started.toISOString(),dueAt:null,remainingMinutes:null,status:"PAUSED",pausedReason:"Waiting for client"};
 if(!intel.needsReply&&state.workflowStatus!=="WAITING_INTERNAL")return{threadId,priority,hours,startedAt:started.toISOString(),dueAt:null,remainingMinutes:null,status:"PAUSED",pausedReason:"No reply required"};
 const due=new Date(started.getTime()+hours*60*60*1000);const remaining=Math.ceil((due.getTime()-now.getTime())/60000);
 return{threadId,priority,hours,startedAt:started.toISOString(),dueAt:due.toISOString(),remainingMinutes:remaining,status:remaining<0?"OVERDUE":remaining<=Math.max(30,Math.floor(hours*60*.25))?"DUE_SOON":"ON_TRACK"};
}

export async function listMailSlaStates(threadIds:string[],now=new Date()){const results=await Promise.all(threadIds.map(id=>getMailSlaState(id,now)));return new Map(results.filter((x):x is MailSlaState=>Boolean(x)).map(x=>[x.threadId,x]));}

export async function saveMailAutomationRun(run:MailAutomationRun){await prisma.appSetting.create({data:{key:runKey(run.id),value:JSON.stringify(run)}});return run;}
export async function listMailAutomationRuns(limit=50){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:RUN_PREFIX}},select:{value:true}});const runs:MailAutomationRun[]=[];for(const r of rows)try{const v=JSON.parse(r.value) as MailAutomationRun;if(v?.id&&v?.ranAt)runs.push(v)}catch{}return runs.sort((a,b)=>b.ranAt.localeCompare(a.ranAt)).slice(0,limit);}
