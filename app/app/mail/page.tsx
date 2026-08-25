import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getAccessibleMailboxIds } from "@/lib/mail-security";
import { getMailComposeMeta } from "@/lib/mail-compose-meta";
import { GmailStyleMailCenterV5 } from "@/components/mail/gmail-style-mail-center-v5";
import { Button } from "@/components/ui/button";

export const dynamic="force-dynamic";

export default async function MailPage({searchParams}:{searchParams:{folder?:string;thread?:string;compose?:string;q?:string;mailbox?:string;source?:string;mode?:string;category?:string}}){
 const user=await requireUser();if(!can(user,"EMAIL_READ"))redirect("/app/forbidden");
 const accessibleIds=await getAccessibleMailboxIds(user,true);
 if(searchParams.compose==="1"){
  const p=new URLSearchParams();if(searchParams.mailbox&&accessibleIds.includes(searchParams.mailbox))p.set("mailbox",searchParams.mailbox);if(searchParams.source)p.set("source",searchParams.source);if(searchParams.mode)p.set("mode",searchParams.mode);redirect(`/app/mail/compose?${p.toString()}`);
 }
 if(searchParams.folder==="DRAFTS"&&searchParams.thread){const meta=await getMailComposeMeta(searchParams.thread);if(meta){const t=await prisma.mailThread.findFirst({where:{id:searchParams.thread,mailAccountId:{in:accessibleIds}},select:{mailAccountId:true,aiDraft:true}});if(t?.aiDraft)redirect(`/app/mail/compose?mailbox=${encodeURIComponent(t.mailAccountId)}&draft=${searchParams.thread}`);}}
 const active=searchParams.thread&&accessibleIds.length?await prisma.mailThread.findFirst({where:{id:searchParams.thread,mailAccountId:{in:accessibleIds}},select:{mailAccountId:true}}):null;
 const mailbox=active?.mailAccountId||(searchParams.mailbox&&accessibleIds.includes(searchParams.mailbox)?searchParams.mailbox:"ALL");
 return <div className="space-y-3">
  <GmailStyleMailCenterV5 searchParams={{...searchParams,mailbox}}/>
  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2"><span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted2">JUN tools</span><Link href="/app/mail/search"><Button size="sm" variant="ghost">Search</Button></Link><Link href="/app/mail/analytics"><Button size="sm" variant="ghost">Analytics</Button></Link><Link href="/app/mail/operations"><Button size="sm" variant="ghost">Operations & SLA</Button></Link><Link href="/app/mail/intelligence"><Button size="sm" variant="ghost">Intelligence</Button></Link><Link href="/app/mail/approvals"><Button size="sm" variant="ghost">AI approvals</Button></Link>{can(user,"EMAIL_MANAGE")?<Link href="/app/mail/security"><Button size="sm" variant="ghost">Security</Button></Link>:null}</div>
 </div>;
}
