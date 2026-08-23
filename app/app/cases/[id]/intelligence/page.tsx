import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { getCaseIntelligence } from "@/lib/case-intelligence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { AlertTriangle, BrainCircuit, CheckCircle2, FileWarning, Landmark, ListTodo, MessageSquareWarning, ShieldCheck } from "lucide-react";

export const dynamic="force-dynamic";

const severityClass:Record<string,string>={LOW:"bg-emerald-100 text-emerald-800",MEDIUM:"bg-amber-100 text-amber-800",HIGH:"bg-orange-100 text-orange-800",CRITICAL:"bg-red-100 text-red-800"};

export default async function CaseIntelligencePage({params}:{params:Promise<{id:string}>|{id:string}}){
 const user=await requireUser();if(!can(user,"CASE_READ"))redirect("/app/forbidden");const {id}=await Promise.resolve(params);
 const intel=await getCaseIntelligence(id);if(!intel)notFound();const c=intel.case;
 return <div className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/app/cases/${id}/dashboard`} className="text-sm text-muted2 hover:text-electric">← Case 360</Link><div className="mt-2 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">Case Intelligence</h1><StatusBadge status={c.status}/><Badge className={severityClass[intel.riskLevel]}>{intel.riskLevel} RISK</Badge></div><p className="mt-1 text-sm text-muted2">{c.caseNumber} · {c.title} · explainable operational and financial intelligence</p></div><div className="flex flex-wrap gap-2"><Link href={`/app/cases/${id}/operations`}><Button variant="outline">Operations</Button></Link><Link href={`/app/cases/${id}/finance`}><Button variant="outline">Finance</Button></Link><Link href={`/app/cases/${id}/closure`}><Button variant="primary">Closure review</Button></Link></div></div>

  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
   <Metric icon={BrainCircuit} label="Risk score" value={`${intel.score}/100`} sub={intel.riskLevel}/>
   <Metric icon={ListTodo} label="Operations" value={`${intel.health.operations}%`} sub="task + milestone progress"/>
   <Metric icon={ShieldCheck} label="Closure" value={intel.health.closureReady?"READY":"BLOCKED"} sub={intel.health.closureReady?"No hard blocker":"Action required"}/>
   <Metric icon={MessageSquareWarning} label="Critical comms" value={String(intel.health.criticalCommunications)} sub="require human review"/>
   <Metric icon={Landmark} label="Currencies" value={String(intel.health.financialCurrencies)} sub="with Case financial activity"/>
  </div>

  {intel.insights.length===0?<div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5"/><div><strong>No active risk detected.</strong> The Case currently has no deterministic warning from Operations, Finance, Documents, Communications or Closure.</div></div>:null}

  <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
   <Card><CardHeader><div><CardTitle>Next best actions</CardTitle><p className="mt-1 text-xs text-muted2">Highest-priority actions derived from real Case data.</p></div></CardHeader><CardContent className="space-y-3">{intel.nextActions.length?intel.nextActions.map((x,i)=><div key={x.id} className="rounded-xl border border-line p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{i+1}. {x.action}</p><Badge className={severityClass[x.severity]}>{x.severity}</Badge></div><p className="mt-2 text-sm text-muted2">{x.detail}</p><Link href={x.href} className="mt-3 inline-block text-sm text-electric hover:underline">Open {x.area.toLowerCase()} →</Link></div>):<p className="text-sm text-muted2">No action required.</p>}</CardContent></Card>

   <Card><CardHeader><div><CardTitle>Explainable risk register</CardTitle><p className="mt-1 text-xs text-muted2">Every alert shows its source area and recommended response. No hidden AI scoring.</p></div></CardHeader><CardContent className="p-0">{intel.insights.length?<div className="divide-y divide-line">{intel.insights.map(x=><div key={x.id} className="grid gap-3 px-5 py-4 md:grid-cols-[115px_130px_minmax(0,1fr)]"><div><Badge className={severityClass[x.severity]}>{x.severity}</Badge></div><div className="text-xs font-medium text-muted2">{x.area}</div><div><Link href={x.href} className="font-medium hover:text-electric">{x.title}</Link><p className="mt-1 text-sm text-muted2">{x.detail}</p><p className="mt-2 text-sm"><strong>Recommended:</strong> {x.action}</p></div></div>)}</div>:<p className="p-5 text-sm text-muted2">No risk item detected.</p>}</CardContent></Card>
  </div>

  <Card><CardHeader><CardTitle>Intelligence rules</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Rule icon={AlertTriangle} title="No invented facts">The engine only evaluates records already linked to this Case.</Rule><Rule icon={FileWarning} title="Closure alignment">The same hard blockers used by Closure also drive Case risk.</Rule><Rule icon={BrainCircuit} title="Explainable score">Each warning adds a documented weight to the 0–100 risk score.</Rule><Rule icon={ShieldCheck} title="Human control">Critical communications and financial corrections still require a responsible person.</Rule></CardContent></Card>
 </div>;
}
function Metric({icon:Icon,label,value,sub}:{icon:any;label:string;value:string;sub:string}){return <Card><CardContent className="p-4"><Icon className="h-4 w-4 text-electric"/><p className="mt-3 text-xs text-muted2">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted2">{sub}</p></CardContent></Card>}
function Rule({icon:Icon,title,children}:{icon:any;title:string;children:React.ReactNode}){return <div className="rounded-xl border border-line p-4"><Icon className="h-4 w-4 text-electric"/><p className="mt-2 font-medium">{title}</p><p className="mt-1 text-xs text-muted2">{children}</p></div>}
