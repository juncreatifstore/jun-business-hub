import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getMailComposeMeta } from "@/lib/mail-compose-meta";
import { MailCenter } from "@/components/mail/mail-center";
import { MailContextPanel } from "@/components/mail/mail-context-panel";
import { MailAICopilotPanel } from "@/components/mail/mail-ai-copilot-panel";
import { Button } from "@/components/ui/button";

export const dynamic="force-dynamic";

export default async function MailPage({searchParams}:{searchParams:{folder?:string;thread?:string;compose?:string;q?:string;mailbox?:string;source?:string;mode?:string}}){
 if(searchParams.compose==="1"){
  const p=new URLSearchParams();if(searchParams.mailbox)p.set("mailbox",searchParams.mailbox);if(searchParams.source)p.set("source",searchParams.source);if(searchParams.mode)p.set("mode",searchParams.mode);redirect(`/app/mail/compose?${p.toString()}`);
 }
 if(searchParams.folder==="DRAFTS"&&searchParams.thread){const meta=await getMailComposeMeta(searchParams.thread);if(meta){const t=await prisma.mailThread.findUnique({where:{id:searchParams.thread},select:{mailAccountId:true,aiDraft:true}});if(t?.aiDraft)redirect(`/app/mail/compose?mailbox=${encodeURIComponent(t.mailAccountId)}&draft=${searchParams.thread}`);}}
 const active=searchParams.thread?await prisma.mailThread.findUnique({where:{id:searchParams.thread},select:{id:true,mailAccountId:true,aiDraft:true}}):null;
 const mailbox=active?.mailAccountId||searchParams.mailbox||"ALL";
 return <div className="space-y-5">
  {active&&!active.aiDraft?<div className="flex flex-wrap justify-end gap-2"><Link href={`/app/mail/compose?mailbox=${encodeURIComponent(active.mailAccountId)}&source=${active.id}&mode=REPLY`}><Button variant="outline">Reply</Button></Link><Link href={`/app/mail/compose?mailbox=${encodeURIComponent(active.mailAccountId)}&source=${active.id}&mode=REPLY_ALL`}><Button variant="outline">Reply all</Button></Link><Link href={`/app/mail/compose?mailbox=${encodeURIComponent(active.mailAccountId)}&source=${active.id}&mode=FORWARD`}><Button variant="outline">Forward</Button></Link></div>:null}
  <MailCenter searchParams={{...searchParams,mailbox}}/>
  {active?<MailAICopilotPanel threadId={active.id} hasDraft={Boolean(active.aiDraft)}/>:null}
  {active?<MailContextPanel threadId={active.id}/>:null}
 </div>;
}
