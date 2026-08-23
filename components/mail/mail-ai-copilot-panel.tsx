import { requireUser, can } from "@/lib/auth";
import { getMailAICopilotAnalysis } from "@/lib/mail-ai-copilot";
import { analyzeMailWithJunAI, draftContextualReplyWithJunAI } from "@/services/mail-ai-copilot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, AlertTriangle } from "lucide-react";

const URGENCY:Record<string,string>={LOW:"bg-slate-100 text-slate-700",MEDIUM:"bg-blue-100 text-blue-800",HIGH:"bg-amber-100 text-amber-800",URGENT:"bg-red-100 text-red-700"};
const SENTIMENT:Record<string,string>={POSITIVE:"bg-emerald-100 text-emerald-800",NEUTRAL:"bg-slate-100 text-slate-700",NEGATIVE:"bg-amber-100 text-amber-800",ESCALATED:"bg-red-100 text-red-700"};

export async function MailAICopilotPanel({threadId,hasDraft=false}:{threadId:string;hasDraft?:boolean}){
 const user=await requireUser();if(!can(user,"AI_USE")||!can(user,"EMAIL_READ"))return null;
 const analysis=await getMailAICopilotAnalysis(threadId);
 return <Card>
  <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4"/>JUN AI Mail Copilot</CardTitle><p className="mt-1 text-xs text-muted2">Context-aware analysis grounded in linked JUN records. Human review remains required.</p></div><div className="flex flex-wrap gap-2"><form action={analyzeMailWithJunAI.bind(null,threadId)}><Button variant="secondary">{analysis?"Re-analyze":"Analyze with JUN AI"}</Button></form>{can(user,"EMAIL_DRAFT")&&!hasDraft?<form action={draftContextualReplyWithJunAI.bind(null,threadId)}><Button variant="primary">Draft contextual reply</Button></form>:null}</div></div></CardHeader>
  <CardContent>
   {!analysis?<div className="rounded-lg border border-dashed border-line p-4 text-sm text-muted2">No contextual analysis yet. JUN AI will use the Gmail conversation plus the linked Client/Case data you are authorized to read.</div>:<div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-4"><div className="rounded-lg border border-line bg-surface/40 p-3"><p className="text-xs text-muted2">Intent</p><p className="mt-1 text-sm font-medium">{analysis.intent}</p></div><div className="rounded-lg border border-line bg-surface/40 p-3"><p className="text-xs text-muted2">Language</p><p className="mt-1 text-sm font-medium">{analysis.language}</p></div><div className="rounded-lg border border-line bg-surface/40 p-3"><p className="text-xs text-muted2">Urgency</p><Badge className={`mt-1 ${URGENCY[analysis.urgency]??""}`}>{analysis.urgency}</Badge></div><div className="rounded-lg border border-line bg-surface/40 p-3"><p className="text-xs text-muted2">Sentiment</p><Badge className={`mt-1 ${SENTIMENT[analysis.sentiment]??""}`}>{analysis.sentiment}</Badge></div></div>
    <div className="rounded-xl border border-line p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted2">Conversation summary</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{analysis.summary}</p></div>
    <div className="grid gap-4 lg:grid-cols-2">
     <Info title="Customer requests" rows={analysis.requestedItems}/><Info title="Suggested internal actions" rows={analysis.internalActions}/><Info title="Missing information" rows={analysis.missingInformation}/><Info title="Caution / verification" rows={analysis.caution} warning/>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs text-muted2"><span>{analysis.verifiedFactsUsed.length} JUN fact group(s) available to the analysis.</span><span>{analysis.modelMode==="MODEL"?"AI model analysis":"Offline safe analysis"} · {new Date(analysis.analyzedAt).toLocaleString()}</span></div>
   </div>}
  </CardContent>
 </Card>;
}
function Info({title,rows,warning=false}:{title:string;rows:string[];warning?:boolean}){return <div className={`rounded-xl border p-4 ${warning&&rows.length?"border-amber-300 bg-amber-50/50":"border-line"}`}><p className="flex items-center gap-2 text-sm font-semibold">{warning&&rows.length?<AlertTriangle className="h-4 w-4"/>:null}{title}</p>{rows.length?<ul className="mt-2 space-y-1 text-sm text-muted2">{rows.map((r,i)=><li key={i}>• {r}</li>)}</ul>:<p className="mt-2 text-sm text-muted2">None identified.</p>}</div>}
