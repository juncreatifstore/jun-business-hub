import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { listMailApprovals } from "@/lib/mail-approval";
import { submitMailForApproval, decideMailApproval } from "@/services/mail-approval";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const dynamic="force-dynamic";
export default async function MailApprovalCenter(){
 const user=await requireUser();if(!can(user,"EMAIL_READ"))redirect("/app/forbidden");
 const [drafts,approvals]=await Promise.all([
  prisma.mailThread.findMany({where:{aiDraft:{not:null}},orderBy:{updatedAt:"desc"},take:150,include:{account:{select:{email:true,displayName:true}},client:{select:{firstName:true,lastName:true,internalId:true}}}}),
  listMailApprovals(),
 ]);
 const map=new Map(approvals.map(a=>[a.threadId,a]));
 const ids=[...new Set(approvals.flatMap(a=>[a.submittedById,a.approvedById,a.rejectedById,a.sentById].filter((x):x is string=>Boolean(x))))];
 const people=ids.length?await prisma.user.findMany({where:{id:{in:ids}},select:{id:true,firstName:true,lastName:true}}):[];const names=new Map(people.map(p=>[p.id,`${p.firstName} ${p.lastName}`]));
 const pending=drafts.filter(d=>map.get(d.id)?.status==="PENDING").length,approved=drafts.filter(d=>map.get(d.id)?.status==="APPROVED").length,rejected=drafts.filter(d=>map.get(d.id)?.status==="REJECTED").length,unsubmitted=drafts.filter(d=>!map.get(d.id)||map.get(d.id)?.status==="DRAFT").length;
 return <div className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">AI Approval Center</h1><p className="mt-1 text-sm text-muted2">Human governance for AI-assisted and sensitive email drafts.</p></div><Link href="/app/mail"><Button variant="outline">Back to Mail</Button></Link></div>
  <div className="grid gap-3 md:grid-cols-4"><Metric label="Needs submission" value={unsubmitted}/><Metric label="Pending approval" value={pending}/><Metric label="Approved" value={approved}/><Metric label="Rejected" value={rejected}/></div>
  <Card><CardHeader><CardTitle>Approval queue</CardTitle></CardHeader><CardContent><div className="space-y-3">{drafts.length?drafts.map(d=>{const a=map.get(d.id);const status=a?.status??"DRAFT";return <div key={d.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge>{status}</Badge><Badge className="border border-line bg-white text-night">{d.aiLevel}</Badge><span className="text-xs text-muted2">{d.account.displayName||d.account.email}</span></div><Link href={`/app/mail?folder=DRAFTS&thread=${d.id}`} className="mt-2 block font-semibold hover:underline">{d.subject||"(no subject)"}</Link><p className="mt-1 text-sm text-muted2">To: {d.toEmails.join(", ")||"—"}{d.client?` · Client: ${d.client.firstName} ${d.client.lastName} (${d.client.internalId})`:""}</p><p className="mt-2 line-clamp-2 text-sm">{d.aiDraft}</p>{a?.submittedAt?<p className="mt-2 text-xs text-muted2">Submitted {new Date(a.submittedAt).toLocaleString()} by {a.submittedById?names.get(a.submittedById)||"User":"User"}</p>:null}{a?.decisionNote?<p className="mt-1 text-xs text-muted2">Decision note: {a.decisionNote}</p>:null}</div><div className="flex min-w-64 flex-col gap-2">{status==="DRAFT"||status==="REJECTED"?<form action={submitMailForApproval.bind(null,d.id)}><Button className="w-full" variant="secondary">Submit for approval</Button></form>:null}{status==="PENDING"&&can(user,"AI_APPROVE")?<><form action={decideMailApproval.bind(null,d.id,"APPROVE")} className="space-y-2"><Input name="note" placeholder="Approval note (optional)"/><Button className="w-full" variant="primary">Approve</Button></form><form action={decideMailApproval.bind(null,d.id,"REJECT")} className="space-y-2"><Input name="note" placeholder="Reason for rejection"/><Button className="w-full" variant="danger">Reject</Button></form></>:null}{status==="APPROVED"?<p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">Approved {a?.approvedAt?new Date(a.approvedAt).toLocaleString():""}{a?.approvedById?` by ${names.get(a.approvedById)||"User"}`:""}. EMAIL_SEND is still required to send.</p>:null}</div></div></div>}):<p className="text-sm text-muted2">No drafts currently require approval.</p>}</div></CardContent></Card>
 </div>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs text-muted2">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>}
