import "server-only";
import { prisma } from "@/lib/prisma";
import { getMailIntelligenceMap, type MailCategory, type MailDepartment, type MailIntelligencePriority } from "@/lib/mail-intelligence";
import { getMailOwnerMap, listMailAutomationRuns, listMailSlaStates } from "@/lib/mail-operations";
import { getMailThreadStateMap } from "@/lib/mail-thread-state";
import { listMailApprovals } from "@/lib/mail-approval";

export type MailAnalyticsPeriod=7|30|90|365;
export type MailSearchFilters={
 q?:string;mailboxId?:string;category?:MailCategory;priority?:MailIntelligencePriority;department?:MailDepartment;ownerId?:string;workflowStatus?:string;from?:string;to?:string;days?:number;
};

function pct(n:number,d:number){return d?Math.round((n/d)*1000)/10:0;}
function avg(values:number[]){return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;}

export async function searchMailThreads(filters:MailSearchFilters){
 const days=Math.max(1,Math.min(Number(filters.days)||90,3650));
 const since=new Date(Date.now()-days*86400000);
 const q=(filters.q??"").trim();
 const threads=await prisma.mailThread.findMany({
  where:{
   updatedAt:{gte:since},
   ...(filters.mailboxId?{mailAccountId:filters.mailboxId}:{}),
   ...(filters.from?{fromEmail:{contains:filters.from,mode:"insensitive"}}:{}),
   ...(filters.to?{toEmails:{has:filters.to.toLowerCase()}}:{}),
   ...(q?{OR:[
    {subject:{contains:q,mode:"insensitive"}},{snippet:{contains:q,mode:"insensitive"}},{fromEmail:{contains:q,mode:"insensitive"}},
    {client:{firstName:{contains:q,mode:"insensitive"}}},{client:{lastName:{contains:q,mode:"insensitive"}}},{client:{internalId:{contains:q,mode:"insensitive"}}},
   ]}:{}),
  },
  orderBy:[{lastMessageAt:"desc"},{updatedAt:"desc"}],take:300,
  include:{account:{select:{id:true,email:true,displayName:true}},client:{select:{id:true,firstName:true,lastName:true,internalId:true}}},
 });
 const ids=threads.map(t=>t.id);
 const [intelMap,ownerMap,stateMap,slaMap]=await Promise.all([getMailIntelligenceMap(ids),getMailOwnerMap(ids),getMailThreadStateMap(ids),listMailSlaStates(ids)]);
 const ownerIds=[...new Set([...ownerMap.values()])];
 const owners=ownerIds.length?await prisma.user.findMany({where:{id:{in:ownerIds}},select:{id:true,firstName:true,lastName:true}}):[];
 const ownerNames=new Map(owners.map(u=>[u.id,`${u.firstName} ${u.lastName}`]));
 return threads.map(t=>({thread:t,intelligence:intelMap.get(t.id)??null,ownerId:ownerMap.get(t.id)??null,ownerName:ownerNames.get(ownerMap.get(t.id)??"")??null,state:stateMap.get(t.id)!,sla:slaMap.get(t.id)??null})).filter(r=>{
  if(filters.category&&r.intelligence?.category!==filters.category)return false;
  if(filters.priority&&r.intelligence?.priority!==filters.priority)return false;
  if(filters.department&&r.intelligence?.department!==filters.department)return false;
  if(filters.ownerId&&r.ownerId!==filters.ownerId)return false;
  if(filters.workflowStatus&&r.state.workflowStatus!==filters.workflowStatus)return false;
  return true;
 });
}

export async function getMailAnalytics(period:MailAnalyticsPeriod=30){
 const since=new Date(Date.now()-period*86400000);
 const threads=await prisma.mailThread.findMany({where:{updatedAt:{gte:since}},orderBy:{updatedAt:"desc"},take:2000,include:{account:{select:{id:true,email:true,displayName:true}}}});
 const ids=threads.map(t=>t.id);
 const [intelMap,ownerMap,stateMap,slaMap,approvals,automationRuns,auditRows]=await Promise.all([
  getMailIntelligenceMap(ids),getMailOwnerMap(ids),getMailThreadStateMap(ids),listMailSlaStates(ids),listMailApprovals(),listMailAutomationRuns(1000),
  prisma.auditLog.findMany({where:{resourceType:"MailThread",createdAt:{gte:since},action:{contains:"EMAIL"}},orderBy:{createdAt:"asc"},take:5000,select:{resourceId:true,userId:true,action:true,createdAt:true}}),
 ]);
 const set=new Set(ids);
 const relevantApprovals=approvals.filter(a=>set.has(a.threadId));
 const relevantRuns=automationRuns.filter(r=>set.has(r.threadId)&&new Date(r.ranAt)>=since);
 const ownerIds=[...new Set([...ownerMap.values()])];
 const userIds=[...new Set([...ownerIds,...auditRows.map(a=>a.userId).filter((x):x is string=>Boolean(x))])];
 const users=userIds.length?await prisma.user.findMany({where:{id:{in:userIds}},select:{id:true,firstName:true,lastName:true,department:{select:{name:true}}}}):[];
 const userMap=new Map(users.map(u=>[u.id,u]));

 let needsReply=0,overdue=0,dueSoon=0,assigned=0,aiReview=0;
 const categories=new Map<string,number>(),departments=new Map<string,number>(),priorities=new Map<string,number>(),owners=new Map<string,{name:string;department:string;threads:number;overdue:number;needsReply:number}>();
 for(const t of threads){
  const intel=intelMap.get(t.id),sla=slaMap.get(t.id);const ownerId=ownerMap.get(t.id);
  if(intel){categories.set(intel.category,(categories.get(intel.category)??0)+1);departments.set(intel.department,(departments.get(intel.department)??0)+1);priorities.set(intel.priority,(priorities.get(intel.priority)??0)+1);if(intel.needsReply)needsReply++;}
  if(sla?.status==="OVERDUE")overdue++;if(sla?.status==="DUE_SOON")dueSoon++;if(ownerId)assigned++;if(t.aiLevel!=="AUTO"||t.requiresAttention)aiReview++;
  if(ownerId){const u=userMap.get(ownerId);const cur=owners.get(ownerId)??{name:u?`${u.firstName} ${u.lastName}`:"Unknown",department:u?.department?.name??"—",threads:0,overdue:0,needsReply:0};cur.threads++;if(sla?.status==="OVERDUE")cur.overdue++;if(intel?.needsReply)cur.needsReply++;owners.set(ownerId,cur);}
 }

 const sendActions=auditRows.filter(a=>/SEND|SENT/i.test(a.action)&&a.resourceId&&set.has(a.resourceId));
 const responseMinutes:number[]=[];
 for(const t of threads){
  const sent=sendActions.find(a=>a.resourceId===t.id&&a.createdAt>=(t.createdAt??since));
  if(sent){const start=t.createdAt;const mins=Math.max(0,Math.round((sent.createdAt.getTime()-start.getTime())/60000));responseMinutes.push(mins);}
 }
 const approvalSubmitted=relevantApprovals.filter(a=>a.submittedAt&&new Date(a.submittedAt)>=since).length;
 const approvalApproved=relevantApprovals.filter(a=>a.approvedAt&&new Date(a.approvedAt)>=since).length;
 const approvalRejected=relevantApprovals.filter(a=>a.rejectedAt&&new Date(a.rejectedAt)>=since).length;
 const approvalSent=relevantApprovals.filter(a=>a.sentAt&&new Date(a.sentAt)>=since).length;
 const aiDraftEvents=auditRows.filter(a=>/AI_EMAIL_REPLY_DRAFTED|MAIL_AI_CONTEXTUAL_DRAFT/i.test(a.action)).length;
 const sendEvents=sendActions.length;

 return{
  period,since:since.toISOString(),totalThreads:threads.length,needsReply,overdue,dueSoon,assigned,unassigned:threads.length-assigned,assignmentRate:pct(assigned,threads.length),slaOverdueRate:pct(overdue,Math.max(1,needsReply)),aiReview,
  measuredResponses:responseMinutes.length,averageRecordedResponseMinutes:avg(responseMinutes),sendEvents,aiDraftEvents,aiAssistedSendRatio:pct(Math.min(aiDraftEvents,sendEvents),sendEvents),
  approvals:{submitted:approvalSubmitted,approved:approvalApproved,rejected:approvalRejected,sent:approvalSent,approvalRate:pct(approvalApproved,approvalSubmitted)},safeAutomations:relevantRuns.length,
  categories:[...categories.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),
  departments:[...departments.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),
  priorities:[...priorities.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),
  owners:[...owners.entries()].map(([id,v])=>({id,...v})).sort((a,b)=>b.threads-a.threads),
 };
}
