import "server-only";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type CurrentUser } from "@/lib/auth";

const ACCESS_PREFIX="mail.access.user.";
const EVENT_PREFIX="mail.reliability.event.";
const SEND_LOCK_PREFIX="mail.send.lock.";

export type MailboxAccessRule={userId:string;accountIds:string[];updatedAt:string;updatedById:string};
export type MailReliabilityEventType="SYNC_ERROR"|"SEND_ERROR"|"TOKEN_ERROR"|"HEALTH_CHECK"|"DOUBLE_SEND_BLOCKED"|"RETRY_SUCCESS"|"ACCESS_DENIED";
export type MailReliabilityEvent={id:string;type:MailReliabilityEventType;createdAt:string;accountId?:string;threadId?:string;userId?:string;message:string;details?:Record<string,string|number|boolean|null>};
export type MailSendLockState="SENDING"|"SENT"|"FAILED";
export type MailSendLock={threadId:string;fingerprint:string;attemptId:string;state:MailSendLockState;userId:string;startedAt:string;sentAt?:string;gmailMessageId?:string;failedAt?:string;error?:string};
export type MailboxHealthStatus="HEALTHY"|"REFRESHABLE"|"DISCONNECTED"|"ERROR";
export type MailboxHealth={accountId:string;email:string;status:MailboxHealthStatus;tokenExpiry:string|null;hasAccessToken:boolean;hasRefreshToken:boolean;message:string};

function accessKey(userId:string){return `${ACCESS_PREFIX}${userId}`;}
function sendLockKey(threadId:string){return `${SEND_LOCK_PREFIX}${threadId}`;}
function cleanMessage(value:unknown){const raw=value instanceof Error?value.message:String(value??"Unknown error");return raw.replace(/(access_token|refresh_token|authorization|bearer)\s*[:=]\s*[^\s,}]+/gi,"$1=[redacted]").slice(0,600);}
function parseLock(value:string):MailSendLock|null{try{const v=JSON.parse(value) as MailSendLock;return v?.threadId&&v?.attemptId?v:null}catch{return null}}

export async function getMailboxAccessRule(userId:string):Promise<MailboxAccessRule|null>{const row=await prisma.appSetting.findUnique({where:{key:accessKey(userId)},select:{value:true}});if(!row)return null;try{const v=JSON.parse(row.value) as MailboxAccessRule;return v?.userId?{...v,accountIds:[...new Set(v.accountIds??[])]}:null}catch{return null}}
export async function saveMailboxAccessRule(input:{userId:string;accountIds:string[];updatedById:string}){const value:MailboxAccessRule={userId:input.userId,accountIds:[...new Set(input.accountIds)],updatedAt:new Date().toISOString(),updatedById:input.updatedById};await prisma.appSetting.upsert({where:{key:accessKey(input.userId)},create:{key:accessKey(input.userId),value:JSON.stringify(value)},update:{value:JSON.stringify(value)}});return value;}
export async function clearMailboxAccessRule(userId:string){await prisma.appSetting.deleteMany({where:{key:accessKey(userId)}});}
export async function listMailboxAccessRules(){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:ACCESS_PREFIX}},select:{value:true}});const out:MailboxAccessRule[]=[];for(const r of rows)try{const v=JSON.parse(r.value) as MailboxAccessRule;if(v?.userId)out.push(v)}catch{}return out;}

export async function getAccessibleMailboxIds(user:CurrentUser,connectedOnly=false){const accounts=await prisma.mailAccount.findMany({where:connectedOnly?{OR:[{accessTokenEnc:{not:null}},{refreshTokenEnc:{not:null}}]}:undefined,select:{id:true}});const all=accounts.map(a=>a.id);if(can(user,"EMAIL_MANAGE"))return all;const rule=await getMailboxAccessRule(user.id);if(!rule)return all;const allowed=new Set(rule.accountIds);return all.filter(id=>allowed.has(id));}
export async function assertMailboxAccess(user:CurrentUser,accountId:string){if(can(user,"EMAIL_MANAGE"))return;const rule=await getMailboxAccessRule(user.id);if(!rule)return;if(!rule.accountIds.includes(accountId)){await recordMailReliabilityEvent({type:"ACCESS_DENIED",accountId,userId:user.id,message:"Mailbox access denied by explicit access rule"});throw new Error("Forbidden: mailbox access denied");}}

export function mailboxHealthFromAccount(account:{id:string;email:string;accessTokenEnc:string|null;refreshTokenEnc:string|null;tokenExpiry:Date|null}):MailboxHealth{
 const hasAccess=Boolean(account.accessTokenEnc),hasRefresh=Boolean(account.refreshTokenEnc),expiry=account.tokenExpiry?.toISOString()??null;
 if(!hasAccess&&!hasRefresh)return{accountId:account.id,email:account.email,status:"DISCONNECTED",tokenExpiry:expiry,hasAccessToken:false,hasRefreshToken:false,message:"Mailbox is disconnected"};
 if((!hasAccess||!account.tokenExpiry||account.tokenExpiry.getTime()<=Date.now()+60_000)&&hasRefresh)return{accountId:account.id,email:account.email,status:"REFRESHABLE",tokenExpiry:expiry,hasAccessToken:hasAccess,hasRefreshToken:hasRefresh,message:"Access token needs refresh; refresh token is available"};
 if(!hasRefresh&&account.tokenExpiry&&account.tokenExpiry.getTime()<=Date.now()+60_000)return{accountId:account.id,email:account.email,status:"ERROR",tokenExpiry:expiry,hasAccessToken:hasAccess,hasRefreshToken:false,message:"Token expired and no refresh token is available"};
 return{accountId:account.id,email:account.email,status:"HEALTHY",tokenExpiry:expiry,hasAccessToken:hasAccess,hasRefreshToken:hasRefresh,message:"Credentials are available"};
}

export async function recordMailReliabilityEvent(input:Omit<MailReliabilityEvent,"id"|"createdAt">){const now=new Date(),id=randomUUID(),event:MailReliabilityEvent={...input,id,createdAt:now.toISOString(),message:cleanMessage(input.message)};await prisma.appSetting.create({data:{key:`${EVENT_PREFIX}${now.getTime()}.${id}`,value:JSON.stringify(event)}});return event;}
export async function listMailReliabilityEvents(limit=100){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:EVENT_PREFIX}},orderBy:{key:"desc"},take:Math.max(1,Math.min(limit,300)),select:{value:true}});const out:MailReliabilityEvent[]=[];for(const r of rows)try{const v=JSON.parse(r.value) as MailReliabilityEvent;if(v?.id&&v?.createdAt)out.push(v)}catch{}return out;}

export async function acquireMailSendLock(input:{threadId:string;fingerprint:string;userId:string;ttlMs?:number}){
 const key=sendLockKey(input.threadId),ttl=input.ttlMs??5*60_000,now=Date.now(),attemptId=randomUUID();
 const currentRow=await prisma.appSetting.findUnique({where:{key},select:{id:true,value:true}});const current=currentRow?parseLock(currentRow.value):null;
 if(current?.state==="SENT"&&current.fingerprint===input.fingerprint){await recordMailReliabilityEvent({type:"DOUBLE_SEND_BLOCKED",threadId:input.threadId,userId:input.userId,message:"Duplicate send blocked: this exact draft was already sent"});throw new Error("This exact draft was already sent");}
 if(current?.state==="SENDING"&&now-new Date(current.startedAt).getTime()<ttl){await recordMailReliabilityEvent({type:"DOUBLE_SEND_BLOCKED",threadId:input.threadId,userId:input.userId,message:"Concurrent send blocked: another send attempt is already in progress"});throw new Error("This email is already being sent");}
 const next:MailSendLock={threadId:input.threadId,fingerprint:input.fingerprint,attemptId,state:"SENDING",userId:input.userId,startedAt:new Date(now).toISOString()};
 if(!currentRow){try{await prisma.appSetting.create({data:{key,value:JSON.stringify(next)}});}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==="P2002"){await recordMailReliabilityEvent({type:"DOUBLE_SEND_BLOCKED",threadId:input.threadId,userId:input.userId,message:"Concurrent send lock collision blocked"});throw new Error("This email is already being sent");}throw e;}}
 else{const changed=await prisma.appSetting.updateMany({where:{id:currentRow.id,value:currentRow.value},data:{value:JSON.stringify(next)}});if(changed.count!==1){await recordMailReliabilityEvent({type:"DOUBLE_SEND_BLOCKED",threadId:input.threadId,userId:input.userId,message:"Concurrent send lock update blocked"});throw new Error("This email is already being sent");}}
 return next;
}

export async function markMailSendSuccess(input:{threadId:string;attemptId:string;gmailMessageId?:string}){const key=sendLockKey(input.threadId),row=await prisma.appSetting.findUnique({where:{key},select:{value:true}});if(!row)return;const lock=parseLock(row.value);if(!lock||lock.attemptId!==input.attemptId)return;await prisma.appSetting.update({where:{key},data:{value:JSON.stringify({...lock,state:"SENT" as const,sentAt:new Date().toISOString(),gmailMessageId:input.gmailMessageId})}});}
export async function markMailSendFailure(input:{threadId:string;attemptId:string;error:unknown;accountId?:string;userId?:string}){const key=sendLockKey(input.threadId),row=await prisma.appSetting.findUnique({where:{key},select:{value:true}}),message=cleanMessage(input.error);if(row){const lock=parseLock(row.value);if(lock?.attemptId===input.attemptId)await prisma.appSetting.update({where:{key},data:{value:JSON.stringify({...lock,state:"FAILED" as const,failedAt:new Date().toISOString(),error:message})}});}await recordMailReliabilityEvent({type:"SEND_ERROR",threadId:input.threadId,accountId:input.accountId,userId:input.userId,message});}
export async function getMailSendLock(threadId:string){const row=await prisma.appSetting.findUnique({where:{key:sendLockKey(threadId)},select:{value:true}});return row?parseLock(row.value):null;}
