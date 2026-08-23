import "server-only";
import { prisma } from "@/lib/prisma";

const PREFIX="mail.thread.state.";
export type MailWorkflowStatus="OPEN"|"WAITING_CLIENT"|"WAITING_INTERNAL"|"RESOLVED";
export type MailThreadState={threadId:string;isRead:boolean;starred:boolean;archived:boolean;trashed:boolean;snoozedUntil:string|null;workflowStatus:MailWorkflowStatus;updatedAt:string;updatedById:string|null};

function key(threadId:string){return `${PREFIX}${threadId}`;}
export function defaultMailThreadState(threadId:string):MailThreadState{return {threadId,isRead:false,starred:false,archived:false,trashed:false,snoozedUntil:null,workflowStatus:"OPEN",updatedAt:new Date(0).toISOString(),updatedById:null};}
export async function getMailThreadState(threadId:string){const row=await prisma.appSetting.findUnique({where:{key:key(threadId)},select:{value:true}});if(!row)return defaultMailThreadState(threadId);try{return {...defaultMailThreadState(threadId),...(JSON.parse(row.value) as Partial<MailThreadState>),threadId};}catch{return defaultMailThreadState(threadId);}}
export async function getMailThreadStateMap(threadIds:string[]){if(!threadIds.length)return new Map<string,MailThreadState>();const rows=await prisma.appSetting.findMany({where:{key:{in:threadIds.map(key)}},select:{key:true,value:true}});const map=new Map<string,MailThreadState>();for(const id of threadIds)map.set(id,defaultMailThreadState(id));for(const row of rows){const id=row.key.slice(PREFIX.length);try{map.set(id,{...defaultMailThreadState(id),...(JSON.parse(row.value) as Partial<MailThreadState>),threadId:id});}catch{}}return map;}
export async function saveMailThreadState(state:MailThreadState){const value=JSON.stringify(state);await prisma.appSetting.upsert({where:{key:key(state.threadId)},create:{key:key(state.threadId),value},update:{value}});return state;}
export function isSnoozed(state:MailThreadState,now=Date.now()){return Boolean(state.snoozedUntil&&new Date(state.snoozedUntil).getTime()>now);}
