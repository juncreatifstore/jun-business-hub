import "server-only";
import { accessTokenFor } from "@/lib/google/gmail";
import { prisma } from "@/lib/prisma";
import { getMailThreadStateMap, saveMailThreadState } from "@/lib/mail-thread-state";
import { getGmailThreadIdsForQuery } from "@/lib/mail-thread-reader";

const GMAIL="https://gmail.googleapis.com/gmail/v1/users/me";

async function modifyThread(accountId:string,gmailThreadId:string,input:{addLabelIds?:string[];removeLabelIds?:string[]}){
 const {token}=await accessTokenFor(accountId);
 const res=await fetch(`${GMAIL}/threads/${encodeURIComponent(gmailThreadId)}/modify`,{
  method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(input),cache:"no-store",
 });
 if(!res.ok)throw new Error(`Gmail thread update failed (${res.status}): ${await res.text()}`);
}

export async function gmailSetThreadRead(accountId:string,gmailThreadId:string,read:boolean){
 await modifyThread(accountId,gmailThreadId,read?{removeLabelIds:["UNREAD"]}:{addLabelIds:["UNREAD"]});
}
export async function gmailSetThreadStarred(accountId:string,gmailThreadId:string,starred:boolean){
 await modifyThread(accountId,gmailThreadId,starred?{addLabelIds:["STARRED"]}:{removeLabelIds:["STARRED"]});
}
export async function gmailArchiveThread(accountId:string,gmailThreadId:string){
 await modifyThread(accountId,gmailThreadId,{removeLabelIds:["INBOX"]});
}
export async function gmailTrashThread(accountId:string,gmailThreadId:string){
 await modifyThread(accountId,gmailThreadId,{addLabelIds:["TRASH"],removeLabelIds:["INBOX"]});
}
export async function gmailRestoreThread(accountId:string,gmailThreadId:string){
 await modifyThread(accountId,gmailThreadId,{removeLabelIds:["TRASH"],addLabelIds:["INBOX"]});
}

export async function reconcileMailboxStatesFromGmail(accountId:string,max=5000){
 const [inbox,unread,starred,trash,spam,sent,drafts]=await Promise.all([
  getGmailThreadIdsForQuery(accountId,"in:inbox",max),
  getGmailThreadIdsForQuery(accountId,"is:unread",max),
  getGmailThreadIdsForQuery(accountId,"is:starred",max),
  getGmailThreadIdsForQuery(accountId,"in:trash",max),
  getGmailThreadIdsForQuery(accountId,"in:spam",max),
  getGmailThreadIdsForQuery(accountId,"in:sent",max),
  getGmailThreadIdsForQuery(accountId,"in:drafts",max),
 ]);
 const rows=await prisma.mailThread.findMany({where:{mailAccountId:accountId},select:{id:true,gmailThreadId:true},take:5000});
 const states=await getMailThreadStateMap(rows.map(r=>r.id));
 let changed=0;
 for(const row of rows){
  const current=states.get(row.id)!;
  const next={
   ...current,
   isRead:!unread.has(row.gmailThreadId),
   starred:starred.has(row.gmailThreadId),
   trashed:trash.has(row.gmailThreadId),
   archived:!inbox.has(row.gmailThreadId)&&!trash.has(row.gmailThreadId)&&!spam.has(row.gmailThreadId)&&!sent.has(row.gmailThreadId)&&!drafts.has(row.gmailThreadId),
   updatedAt:new Date().toISOString(),
   updatedById:null,
  };
  if(next.isRead!==current.isRead||next.starred!==current.starred||next.trashed!==current.trashed||next.archived!==current.archived){await saveMailThreadState(next);changed++;}
 }
 return changed;
}
