import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { getCaseClosureReadiness, getCaseClosureSnapshot } from "@/lib/case-closure";
import { finalizeCaseClosure } from "@/services/case-closure";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, LockKeyhole, FileCheck2 } from "lucide-react";

export const dynamic="force-dynamic";

export default async function CaseClosurePage({params}:{params:Promise<{id:string}>|{id:string}}){
 const user=await requireUser();if(!can(user,"CASE_READ"))redirect("/app/forbidden");const {id}=await Promise.resolve(params);
 const [r,snapshot]=await Promise.all([getCaseClosureReadiness(id),getCaseClosureSnapshot(id)]);if(!r)notFound();
 const c=r.case;const blockers=r.hardBlockers;
 const blockerCount=Object.values(blockers).reduce((sum,list)=>sum+list.length,0);
 const closed=c.status==="COMPLETED"&&Boolean(snapshot);
 return <div className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/app/cases/${id}/dashboard`} className="text-sm text-muted2 hover:text-electric">← Case 360</Link><div className="mt-2 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">Case Closure & Final Review</h1><StatusBadge status={c.status}/></div><p className="mt-1 text-sm text-muted2">{c.caseNumber} · {c.title} · {c.client.firstName} {c.client.lastName}</p></div><div className="flex gap-2"><Link href={`/app/cases/${id}/operations`}><Button variant="outline">Operations</Button></Link><Link href={`/app/cases/${id}/finance`}><Button variant="outline">Finance</Button></Link></div></div>

  {closed?<div className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4"/><div><strong>Case formally closed.</strong> The final snapshot is preserved and represents the Case position at closure.</div></div>:blockerCount?<div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4"/><div><strong>Closure locked.</strong> {blockerCount} operational or financial item(s) must be resolved before this Case can be completed.</div></div>:<div className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4"/><div><strong>Ready for final review.</strong> All mandatory operational and financial checks are clear.</div></div>}

  <Card><CardHeader><div><CardTitle>Mandatory closure checklist</CardTitle><p className="mt-1 text-xs text-muted2">A Case cannot be formally completed while any mandatory item is unresolved.</p></div></CardHeader><CardContent className="space-y-3">
   <Check label="All tasks closed" ok={blockers.openTasks.length===0} detail={blockers.openTasks.length?`${blockers.openTasks.length} task(s) still open`:"No open task"}/>
   <Check label="All milestones closed" ok={blockers.openMilestones.length===0} detail={blockers.openMilestones.length?`${blockers.openMilestones.length} milestone(s) still active or blocked`:"All milestones done/cancelled"}/>
   <Check label="Invoices settled" ok={blockers.openInvoices.length===0} detail={blockers.openInvoices.length?`${blockers.openInvoices.length} invoice(s) still carry a balance`:"No Case receivable remains"}/>
   <Check label="No pending payment" ok={blockers.pendingPayments.length===0} detail={blockers.pendingPayments.length?`${blockers.pendingPayments.length} payment(s) pending`:"No pending incoming payment"}/>
   <Check label="Refunds fully resolved" ok={blockers.openRefunds.length===0} detail={blockers.openRefunds.length?`${blockers.openRefunds.length} refund(s) still unpaid/in process`:"No outstanding Case refund"}/>
   <Check label="Expenses completed" ok={blockers.openExpenses.length===0} detail={blockers.openExpenses.length?`${blockers.openExpenses.length} expense(s) unfinished`:"No unfinished Case expense"}/>
   <Check label="Payment allocations valid" ok={blockers.allocationAnomalies.length===0} detail={blockers.allocationAnomalies.length?`${blockers.allocationAnomalies.length} allocation anomaly(ies)`:"No overallocated payment"}/>
  </CardContent></Card>

  <div className="grid gap-5 xl:grid-cols-2">
   <Card><CardHeader><CardTitle>Final operational position</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><Row label="Tasks" value={`${r.opFacts.taskDone}/${c.tasks.filter(t=>t.status!=="CANCELLED").length} done`}/><Row label="Milestones" value={`${r.opFacts.milestoneDone}/${r.operations.milestones.filter(m=>m.status!=="CANCELLED").length} done`}/><Row label="Official documents" value={String(c.documents.length)}/><Row label="FINAL / SIGNED documents" value={String(r.finalDocuments.length)}/><Row label="Drive files" value={String(c.files.length)}/><Row label="Critical communications" value={String(r.criticalCommunications.length)}/></CardContent></Card>
   <Card><CardHeader><CardTitle>Final financial position</CardTitle></CardHeader><CardContent className="space-y-3">{r.finance.summaries.length?r.finance.summaries.map(s=><div key={s.currency} className="rounded-lg border border-line p-3 text-sm"><div className="mb-2 font-semibold">{s.currency}</div><div className="grid gap-2 sm:grid-cols-2"><Row label="Billed" value={formatMoney(s.billed,s.currency)}/><Row label="Invoice paid" value={formatMoney(s.invoicePaid,s.currency)}/><Row label="Receivable" value={formatMoney(s.receivable,s.currency)}/><Row label="Refunds paid" value={formatMoney(s.refundsPaid,s.currency)}/><Row label="Expenses paid" value={formatMoney(s.expensePaid,s.currency)}/><Row label="Realized profit" value={formatMoney(s.realizedProfit,s.currency)}/></div></div>):<p className="text-sm text-muted2">No financial activity on this Case.</p>}</CardContent></Card>
  </div>

  {snapshot?<Card className="border-emerald-200"><CardHeader><div><CardTitle>Preserved final report</CardTitle><Badge className="bg-emerald-100 text-emerald-800">IMMUTABLE CLOSURE SNAPSHOT</Badge></div></CardHeader><CardContent className="space-y-3 text-sm"><Row label="Closed" value={formatDateTime(new Date(snapshot.closedAt))}/><Row label="Summary" value={snapshot.summary}/><Row label="Critical communications reviewed" value={snapshot.criticalReviewed?"Yes":"Not required"}/>{snapshot.finance.map(f=><div key={f.currency} className="rounded-lg border border-line p-3"><strong>{f.currency}</strong> · Billed {formatMoney(f.billed,f.currency)} · Paid {formatMoney(f.invoicePaid,f.currency)} · Realized profit {formatMoney(f.realizedProfit,f.currency)}</div>)}</CardContent></Card>:null}

  {!closed&&can(user,"CASE_UPDATE")?<Card className={r.ready?"border-emerald-300":""}><CardHeader><div><CardTitle>Final closure authorization</CardTitle><p className="mt-1 text-xs text-muted2">This creates the final Case snapshot and changes the Case status to COMPLETED.</p></div></CardHeader><CardContent>{r.ready?<form action={finalizeCaseClosure.bind(null,id)} className="max-w-3xl space-y-4"><Textarea name="summary" required minLength={20} rows={6} placeholder="Final professional summary: service delivered, outcome, important decisions, client position and any final observations…"/>{r.criticalCommunications.length?<label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><input type="checkbox" name="criticalReviewed" className="mt-1" required/><span>I confirm that all {r.criticalCommunications.length} CRITICAL communication(s) have been reviewed and do not require additional action before closure.</span></label>:null}<div><label className="mb-1 block text-xs text-muted2">Type CLOSE {c.caseNumber}</label><Input name="confirmation" required autoComplete="off" placeholder={`CLOSE ${c.caseNumber}`}/></div><Button variant="primary"><LockKeyhole className="h-4 w-4"/>Finalize Case closure</Button></form>:<div className="flex items-start gap-2 text-sm text-muted2"><AlertTriangle className="mt-0.5 h-4 w-4"/><p>Final closure remains locked until every mandatory checklist item is complete.</p></div>}</CardContent></Card>:null}
 </div>;
}
function Check({label,ok,detail}:{label:string;ok:boolean;detail:string}){return <div className="flex items-start justify-between gap-4 rounded-lg border border-line p-3"><div className="flex gap-2">{ok?<CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600"/>:<AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600"/>}<div><p className="font-medium">{label}</p><p className="text-xs text-muted2">{detail}</p></div></div><Badge className={ok?"bg-emerald-100 text-emerald-800":"bg-amber-100 text-amber-800"}>{ok?"CLEAR":"REQUIRED"}</Badge></div>}
function Row({label,value}:{label:string;value:string}){return <div className="flex items-start justify-between gap-4 border-b border-line/70 pb-2 last:border-0"><span className="text-muted2">{label}</span><span className="text-right font-medium">{value}</span></div>}
