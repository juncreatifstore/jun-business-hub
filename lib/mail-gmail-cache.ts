import "server-only";
import { prisma } from "@/lib/prisma";
import { getGmailSystemLabelStats } from "@/lib/google/gmail";
import { getGmailThreadIdsForQuery } from "@/lib/mail-thread-reader";

const PREFIX="mail.gmail.cache.";
const DEFAULT_LIMIT=20;
export type GmailCategory="PRIMARY"|"PROMOTIONS"|"SOCIAL"|"UPDATES"|"NONE";
export type GmailMailboxCache={accountId:string;updatedAt:string;labelStats:Record<string,{messagesTotal:number;messagesUnread:number;threadsTotal:number;threadsUnread:number}>;categoryByThreadId:Record<string,GmailCategory>};
function key(accountId:string){return `${PREFIX}${accountId}`;}
export async function getGmailMailboxCache(accountId:string):Promise<GmailMailboxCache|null>{const row=await prisma.appSetting.findUnique({where:{key:key(accountId)},select:{value:true}});if(!row)return null;try{return JSON.parse(row.value) as GmailMailboxCache}catch{return null}}
export async function getGmailMailboxCacheMap(accountIds:string[]){if(!accountIds.length)return new Map<string,GmailMailboxCache>();const rows=await prisma.appSetting.findMany({where:{key:{in:accountIds.map(key)}},select:{key:true,value:true}});const out=new Map<string,GmailMailboxCache>();for(const row of rows){try{const v=JSON.parse(row.value) as GmailMailboxCache;if(v?.accountId)out.set(v.accountId,v)}catch{}}return out;}
export async function refreshGmailMailboxCache(accountId:string,max=DEFAULT_LIMIT){
 const limit=Math.max(1,Math.min(max,DEFAULT_LIMIT));
 const [labelStats,primary,promotions,social,updates,threads]=await Promise.all([
  getGmailSystemLabelStats(accountId),
  getGmailThreadIdsForQuery(accountId,"in:inbox category:primary",limit),
  getGmailThreadIdsForQuery(accountId,"in:inbox category:promotions",limit),
  getGmailThreadIdsForQuery(accountId,"in:inbox category:social",limit),
  getGmailThreadIdsForQuery(accountId,"in:inbox category:updates",limit),
  prisma.mailThread.findMany({where:{mailAccountId:accountId},orderBy:[{lastMessageAt:"desc"},{updatedAt:"desc"}],take:limit,select:{gmailThreadId:true}}),
 ]);
 const categoryByThreadId:Record<string,GmailCategory>={};
 for(const t of threads){const id=t.gmailThreadId;categoryByThreadId[id]=primary.has(id)?"PRIMARY":promotions.has(id)?"PROMOTIONS":social.has(id)?"SOCIAL":updates.has(id)?"UPDATES":"NONE";}
 const value:GmailMailboxCache={accountId,updatedAt:new Date().toISOString(),labelStats,categoryByThreadId};
 await prisma.appSetting.upsert({where:{key:key(accountId)},create:{key:key(accountId),value:JSON.stringify(value)},update:{value:JSON.stringify(value)}});
 return value;
}
