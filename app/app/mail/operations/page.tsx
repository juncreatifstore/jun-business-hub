import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getMailIntelligenceMap } from "@/lib/mail-intelligence";
import { getMailThreadStateMap } from "@/lib/mail-thread-state";
import { getMailOwnerMap, getMailSlaConfig, listMailSlaStates, listMailAutomationRuns } from "@/lib/mail-operations";
import { assignMailOwner, runMailSafeAutomation, updateMailSlaConfig } from "@/services/mail-operations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";

export const dynamic="force-dynamic";
const SLA_CLASS:Record<string,string>={OVERDUE:"bg-red-100 text-red-700",DUE_SOON:"bg-amber-100 text-amber-800",ON_TRACK:"bg-emerald-100 text-emerald-800",PAUSED:"bg-slate-100 text-slate-700",RESOLVED:"bg-blue-100 text-blue-800"};
export default async function MailOperationsPage({searchParams}:{searchParams:{filter?:string;q?:string}}){
 const user=await requireUser();if(!can(user,"EMAIL_READ"))redirect("/app/forbidden");
 const threads=await prisma.mailThread.findMany({where:{aiDraft:null},orderBy:{lastMessageAt:"desc"},take:300,include:{account:{select:{email:true,displayName:true}},client:{select:{firstName:true,lastName:true,internalId:true}}}});
 const ids=threads.map(t=>t.id);
 const [intelMap,stateMap,ownerMap,slaMap,staff,config,runs]=await Promise.all([
  getMailIntelligenceMap(ids),getMailThreadStateMap(ids),getMailOwnerMap(ids),listMailSlaStates(ids),
  prisma.user.findMany({where:{status:"ACTIVE",role:{not:"CLIENT"}},orderBy:[{firstName:"asc"},{lastName:"asc"}],select:{id:true,firstName:true,lastName:true,role:true}}),
  getMailSlaConfig(),listMailAutomationRuns(20),
 ]);
 const names=new Map(staff.map(s=>[s.id,`${s.firstName} ${s.lastName}`]));
 const filter=(searchParams.filter||"ALL").toUpperCase(),q=(searchParams.q||"").trim().toLowerCase();
 const rows=threads.map(t=>({t,intel:intelMap.get(t.id),state:stateMap.get(t.id),ownerId:ownerMap.get(t.id)||null,sla:slaMap.get(t.id)})).filter(r=>r.intel&&r.sla).filter(r=>{
  if(q&&!`${r.t.subject??""} ${r.t.fromEmail??""} ${r.t.client?.firstName??""} ${r.t.client?.lastName??""} ${r.t.account.email}`.toLowerCase().includes(q))return false;
  if(filter==="OVERDUE")return r.sla?.status==="OVERDUE";
  if(filter==="DUE_SOON")return r.sla?.status==="DUE_SOON";
  if(filter==="UNASSIGNED")return !r.ownerId&&r.sla?.status!=="RESOLVED";
  if(filter==="WAITING_INTERNAL")return r.state?.workflowStatus==="WAITING_INTERNAL";
  if(filter==="NEEDS_REPLY")return r.intel?.needsReply;
  return true;
 });
 const all=[...slaMap.values()];const overdue=all.filter(s=>s.status==="OVERDUE").length,dueSoon=all.filter(s=>s.status==="DUE_SOON").length,unassigned=threads.filter(t=>!ownerMap.get(t.id)&&slaMap.get(t.id)?.status!=="RESOLVED").length,needsReply=[...intelMap.values()].filter(i=>i.needsReply).length;
 const workload=new Map<string,{open:number;overdue:number}>();for(const t of threads){const o=ownerMap.get(t.id);const s=slaMap.get(t.id);if(!o||!s||s.status==="RESOLVED")continue;const w=workload.get(o)??{open:0,overdue:0};w.open++;if(s.status==="OVERDUE")w.overdue++;workload.set(o,w);}
 return <div className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Mail Operations & SLA</h1><p className="mt-1 text-sm text-muted2">Ownership, response deadlines, overdue work and safe follow-up automation.</p></div><div className="flex gap-2"><Link href="/app/mail/intelligence"><Button variant="outline">Intelligence</Button></Link><Link href="/app/mail"><Button variant="outline">Back to Mail</Button></Link></div></div>
  <div className="grid gap-3 md:grid-cols-4"><Metric label="Overdue" value={overdue}/><Metric label="Due soon" value={dueSoon}/><Metric label="Unassigned" value={unassigned}/><Metric label="Needs reply" value={needsReply}/></div>
  {can(user,"SETTINGS_MANAGE")?<Card><CardHeader><CardTitle>SLA policy</CardTitle></CardHeader><CardContent><form action={updateMailSlaConfig} className="grid gap-3 md:grid-cols-5"><SlaInput label="Urgent (hours)" name="URGENT" value={config.URGENT}/><SlaInput label="High" name="HIGH" value={config.HIGH}/><SlaInput label="Medium" name="MEDIUM" value={config.MEDIUM}/><SlaInput label="Low" name="LOW" value={config.LOW}/><div className="flex items-end"><Button className="w-full">Save SLA</Button></div></form></CardContent></Card>:null}
  <Card><CardHeader><CardTitle>Owner workload</CardTitle></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-3">{[...workload.entries()].sort((a,b)=>b[1].open-a[1].open).map(([id,w])=><div key={id} className="rounded-lg border border-line p-3"><p className="font-medium">{names.get(id)||"Staff"}</p><p className="mt-1 text-xs text-muted2">{w.open} active · {w.overdue} overdue</p></div>)}{!workload.size?<p className="text-sm text-muted2">No assigned active conversations.</p>:null}</div></CardContent></Card>
  <Card><CardHeader><CardTitle>Operations queue</CardTitle></CardHeader><CardContent className="space-y-3"><form className="flex flex-wrap gap-2"><Select name="filter" defaultValue={filter} className="w-48"><option value="ALL">All</option><option value="OVERDUE">Overdue</option><option value="DUE_SOON">Due soon</option><option value="UNASSIGNED">Unassigned</option><option value="WAITING_INTERNAL">Waiting internal</option><option value="NEEDS_REPLY">Needs reply</option></Select><Input name="q" defaultValue={searchParams.q} placeholder="Search…" className="max-w-sm"/><Button variant="outline">Filter</Button></form>{rows.length?rows.slice(0,150).map(({t,intel,state,ownerId,sla})=><div key={t.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Badge className={SLA_CLASS[sla!.status]??""}>{sla!.status.replaceAll("_"," ")}</Badge><Badge>{intel!.priority}</Badge><Badge>{intel!.category}</Badge><span className="text-xs text-muted2">{t.account.displayName||t.account.email}</span></div><Link href={`/app/mail?mailbox=${t.mailAccountId}&thread=${t.id}`} className="mt-2 block font-semibold hover:underline">{t.subject||"(no subject)"}</Link><p className="mt-1 text-xs text-muted2">{t.client?`${t.client.firstName} ${t.client.lastName} (${t.client.internalId}) · `:""}{state?.workflowStatus.replaceAll("_"," ")}{sla!.dueAt?` · Due ${new Date(sla!.dueAt).toLocaleString()}`:""}</p><p className="mt-2 text-sm text-muted2">Owner: {ownerId?names.get(ownerId)||"Staff":"Unassigned"}</p></div><div className="w-full max-w-sm space-y-2"><form action={assignMailOwner.bind(null,t.id)} className="flex gap-2"><Select name="ownerId" defaultValue={ownerId||""}><option value="">Unassigned</option>{staff.map(s=><option key={s.id} value={s.id}>{s.firstName} {s.lastName} · {s.role}</option>)}</Select><Button variant="secondary">Assign</Button></form>{can(user,"TASK_CREATE")&&(sla!.status==="OVERDUE"||sla!.status==="DUE_SOON"||intel!.needsReply)?<form action={runMailSafeAutomation.bind(null,t.id)}><Button className="w-full" variant="outline">Create safe follow-up task</Button></form>:null}</div></div></div>):<p className="text-sm text-muted2">No conversations match this filter.</p>}</CardContent></Card>
  <Card><CardHeader><CardTitle>Recent safe automation runs</CardTitle></CardHeader><CardContent>{runs.length?<div className="space-y-2">{runs.map(r=><div key={r.id} className="rounded-lg border border-line p-3 text-sm"><p className="font-medium">{r.actions.join(" · ")}</p><p className="mt-1 text-xs text-muted2">{new Date(r.ranAt).toLocaleString()} · Thread {r.threadId}{r.createdTaskId?` · Task ${r.createdTaskId}`:""}</p></div>)}</div>:<p className="text-sm text-muted2">No automation runs yet.</p>}</CardContent></Card>
 </div>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs text-muted2">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>}
function SlaInput({label,name,value}:{label:string;name:string;value:number}){return <label className="text-sm"><span className="mb-1 block text-xs text-muted2">{label}</span><Input name={name} type="number" min={1} max={168} defaultValue={value}/></label>}
