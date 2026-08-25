import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getAccessibleMailboxIds } from "@/lib/mail-security";
import { getMailComposeMeta } from "@/lib/mail-compose-meta";
import { MailCenter } from "@/components/mail/mail-center";
import { MailContextPanel } from "@/components/mail/mail-context-panel";
import { MailAICopilotPanel } from "@/components/mail/mail-ai-copilot-panel";
import { MailIntelligencePanel } from "@/components/mail/mail-intelligence-panel";
import { MailOperationsPanel } from "@/components/mail/mail-operations-panel";
import { Button } from "@/components/ui/button";

export const dynamic="force-dynamic";

export default async function MailPage({searchParams}:{searchParams:{folder?:string;thread?:string;compose?:string;q?:string;mailbox?:string;source?:string;mode?:string}}){
 const user=await requireUser();if(!can(user,"EMAIL_READ"))redirect("/app/forbidden");const accessibleIds=await getAccessibleMailboxIds(user,true);
 if(searchParams.compose==="1"){
  const p=new URLSearchParams();if(searchParams.mailbox&&accessibleIds.includes(searchParams.mailbox))p.set("mailbox",searchParams.mailbox);if(searchParams.source)p.set("source",searchParams.source);if(searchParams.mode)p.set("mode",searchParams.mode);redirect(`/app/mail/compose?${p.toString()}`);
 }
 if(searchParams.folder==="DRAFTS"&&searchParams.thread){const meta=await getMailComposeMeta(searchParams.thread);if(meta){const t=await prisma.mailThread.findFirst({where:{id:searchParams.thread,mailAccountId:{in:accessibleIds}},select:{mailAccountId:true,aiDraft:true}});if(t?.aiDraft)redirect(`/app/mail/compose?mailbox=${encodeURIComponent(t.mailAccountId)}&draft=${searchParams.thread}`);}}
 const active=searchParams.thread&&accessibleIds.length?await prisma.mailThread.findFirst({where:{id:searchParams.thread,mailAccountId:{in:accessibleIds}},select:{id:true,mailAccountId:true,aiDraft:true}}):null;
 const mailbox=active?.mailAccountId||(searchParams.mailbox&&accessibleIds.includes(searchParams.mailbox)?searchParams.mailbox:"ALL");
 return <div className="space-y-5">
  <div className="flex flex-wrap justify-end gap-2"><Link href="/app/mail/search"><Button variant="secondary">Advanced Search</Button></Link><Link href="/app/mail/analytics"><Button variant="secondary">Mail Analytics</Button></Link><Link href="/app/mail/operations"><Button variant="secondary">Mail Operations & SLA</Button></Link><Link href="/app/mail/intelligence"><Button variant="secondary">Mail Intelligence</Button></Link><Link href="/app/mail/approvals"><Button variant="secondary">AI Approval Center</Button></Link>{can(user,"EMAIL_MANAGE")?<Link href="/app/mail/security"><Button variant="secondary">Mail Security</Button></Link>:null}{active&&!active.aiDraft?<><Link href={`/app/mail/compose?mailbox=${encodeURIComponent(active.mailAccountId)}&source=${active.id}&mode=REPLY`}><Button variant="outline">Reply</Button></Link><Link href={`/app/mail/compose?mailbox=${encodeURIComponent(active.mailAccountId)}&source=${active.id}&mode=REPLY_ALL`}><Button variant="outline">Reply all</Button></Link><Link href={`/app/mail/compose?mailbox=${encodeURIComponent(active.mailAccountId)}&source=${active.id}&mode=FORWARD`}><Button variant="outline">Forward</Button></Link></>:null}</div>
  <MailCenter searchParams={{...searchParams,mailbox}}/>
  {active?<MailOperationsPanel threadId={active.id}/>:null}
  {active?<MailIntelligencePanel threadId={active.id}/>:null}
  {active?<MailAICopilotPanel threadId={active.id} hasDraft={Boolean(active.aiDraft)}/>:null}
  {active?<MailContextPanel threadId={active.id}/>:null}
 </div>;
}
