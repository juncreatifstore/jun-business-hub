import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classifyMailText, getMailIntelligence } from "@/lib/mail-intelligence";
import { refreshThreadMailIntelligence } from "@/services/mail-intelligence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit } from "lucide-react";

const PRIORITY:Record<string,string>={LOW:"bg-slate-100 text-slate-700",MEDIUM:"bg-blue-100 text-blue-800",HIGH:"bg-amber-100 text-amber-800",URGENT:"bg-red-100 text-red-700"};
const ESCALATION:Record<string,string>={NONE:"bg-slate-100 text-slate-700",WATCH:"bg-blue-100 text-blue-800",HIGH:"bg-amber-100 text-amber-800",CRITICAL:"bg-red-100 text-red-700"};
export async function MailIntelligencePanel({threadId}:{threadId:string}){
 const user=await requireUser();if(!can(user,"EMAIL_READ"))return null;
 const thread=await prisma.mailThread.findUnique({where:{id:threadId},include:{account:{select:{email:true}}}});if(!thread)return null;
 const intel=await getMailIntelligence(threadId)??classifyMailText({threadId:thread.id,subject:thread.subject,snippet:thread.aiDraft??thread.snippet,fromEmail:thread.fromEmail,ownEmail:thread.account.email,hasDraft:Boolean(thread.aiDraft),requiresAttention:thread.requiresAttention});
 return <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-4 w-4"/>Mail Intelligence</CardTitle><p className="mt-1 text-xs text-muted2">Explainable operational triage. Recommendations only.</p></div><form action={refreshThreadMailIntelligence.bind(null,threadId)}><Button size="sm" variant="outline">Reclassify</Button></form></div></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><Badge>{intel.category}</Badge><Badge className={PRIORITY[intel.priority]??""}>{intel.priority}</Badge><Badge className={ESCALATION[intel.escalation]??""}>{intel.escalation}</Badge>{intel.needsReply?<Badge className="bg-violet-100 text-violet-800">NEEDS REPLY</Badge>:null}<Badge className="border border-line bg-white text-night">{intel.department}</Badge></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted2">Why JUN classified it this way</p><ul className="mt-2 space-y-1 text-sm text-muted2">{intel.reason.map((r,i)=><li key={i}>• {r}</li>)}</ul></div><p className="border-t border-line pt-3 text-xs text-muted2">{intel.source} · classified {new Date(intel.classifiedAt).toLocaleString()}</p></CardContent></Card>;
}
