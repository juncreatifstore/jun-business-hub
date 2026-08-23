import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getMailOwnerId, getMailSlaState } from "@/lib/mail-operations";
import { getMailIntelligence } from "@/lib/mail-intelligence";
import { assignMailOwner, runMailSafeAutomation } from "@/services/mail-operations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

const SLA_CLASS:Record<string,string>={OVERDUE:"bg-red-100 text-red-700",DUE_SOON:"bg-amber-100 text-amber-800",ON_TRACK:"bg-emerald-100 text-emerald-800",PAUSED:"bg-slate-100 text-slate-700",RESOLVED:"bg-blue-100 text-blue-800"};
export async function MailOperationsPanel({threadId}:{threadId:string}){
 const user=await requireUser();if(!can(user,"EMAIL_READ"))return null;
 const [ownerId,sla,intel,staff]=await Promise.all([
  getMailOwnerId(threadId),getMailSlaState(threadId),getMailIntelligence(threadId),
  can(user,"EMAIL_DRAFT")?prisma.user.findMany({where:{status:"ACTIVE",role:{not:"CLIENT"}},orderBy:[{firstName:"asc"},{lastName:"asc"}],select:{id:true,firstName:true,lastName:true,role:true}}):Promise.resolve([]),
 ]);
 if(!sla||!intel)return null;const owner=ownerId?staff.find(s=>s.id===ownerId):null;
 return <Card><CardHeader><CardTitle>Mail Operations</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap items-center gap-2"><Badge className={SLA_CLASS[sla.status]??""}>{sla.status.replaceAll("_"," ")}</Badge><Badge>{intel.priority}</Badge><span className="text-sm text-muted2">Owner: {owner?`${owner.firstName} ${owner.lastName}`:ownerId?"Assigned staff":"Unassigned"}</span></div><div className="rounded-lg border border-line bg-surface/50 p-3 text-sm"><p>SLA: <strong>{sla.hours}h</strong>{sla.dueAt?` · Due ${new Date(sla.dueAt).toLocaleString()}`:""}</p>{sla.pausedReason?<p className="mt-1 text-xs text-muted2">Paused: {sla.pausedReason}</p>:null}</div>{can(user,"EMAIL_DRAFT")?<form action={assignMailOwner.bind(null,threadId)} className="flex gap-2"><Select name="ownerId" defaultValue={ownerId||""}><option value="">Unassigned</option>{staff.map(s=><option key={s.id} value={s.id}>{s.firstName} {s.lastName} · {s.role}</option>)}</Select><Button variant="secondary">Assign owner</Button></form>:null}{can(user,"TASK_CREATE")&&(sla.status==="OVERDUE"||sla.status==="DUE_SOON"||intel.needsReply)?<form action={runMailSafeAutomation.bind(null,threadId)}><Button variant="outline">Create safe follow-up task</Button></form>:null}</CardContent></Card>;
}
