import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getMailThreadStateMap, isSnoozed } from "@/lib/mail-thread-state";
import { getMailConversation, getUnreadGmailThreadIds } from "@/lib/mail-thread-reader";
import { classifyMailText, getMailIntelligenceMap } from "@/lib/mail-intelligence";
import { composeDraft } from "@/services/mail";
import { syncMailbox, sendDraftViaGmail, draftReplyWithJunAI, updateMailDraft } from "@/services/mailbox";
import { syncAllMailboxes } from "@/services/mail-multi";
import { archiveMailThread, markMailThreadRead, restoreMailThread, setMailWorkflowStatus, snoozeMailThread, toggleMailThreadStar, trashMailThread } from "@/services/mail-workspace";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import { Archive, Bot, Clock3, FileEdit, Inbox, Mail, MessageSquareReply, Search, Send, Settings, Star, Trash2 } from "lucide-react";

const FOLDERS=[
 {key:"INBOX",label:"Inbox",icon:Inbox},
 {key:"NEEDS_REPLY",label:"Needs reply",icon:MessageSquareReply},
 {key:"STARRED",label:"Starred",icon:Star},
 {key:"AI_REVIEW",label:"AI Review",icon:Bot},
 {key:"SNOOZED",label:"Snoozed",icon:Clock3},
 {key:"DRAFTS",label:"Drafts",icon:FileEdit},
 {key:"SENT",label:"Sent",icon:Send},
 {key:"ARCHIVE",label:"Archive",icon:Archive},
 {key:"TRASH",label:"Trash",icon:Trash2},
] as const;
type FolderKey=(typeof FOLDERS)[number]["key"];
const AI_BADGE:Record<string,string>={AUTO:"bg-emerald-100 text-emerald-800",APPROVAL_REQUIRED:"bg-amber-100 text-amber-800",BLOCKED:"bg-red-100 text-red-700"};
const STATUS_BADGE:Record<string,string>={OPEN:"bg-blue-100 text-blue-800",WAITING_CLIENT:"bg-violet-100 text-violet-800",WAITING_INTERNAL:"bg-amber-100 text-amber-800",RESOLVED:"bg-emerald-100 text-emerald-800"};
const INTELLIGENCE_PRIORITY:Record<string,string>={LOW:"bg-slate-100 text-slate-700",MEDIUM:"bg-blue-100 text-blue-800",HIGH:"bg-amber-100 text-amber-800",URGENT:"bg-red-100 text-red-700"};

type Params={folder?:string;thread?:string;compose?:string;q?:string;mailbox?:string};

export async function MailCenter({searchParams}:{searchParams:Params}){
 const user=await requireUser();
 if(!can(user,"EMAIL_READ"))redirect("/app/forbidden");
 const canDraft=can(user,"EMAIL_DRAFT"),canSend=can(user,"EMAIL_SEND");
 const accounts=await prisma.mailAccount.findMany({
  where:{OR:[{accessTokenEnc:{not:null}},{refreshTokenEnc:{not:null}}]},
  orderBy:{createdAt:"asc"},
  select:{id:true,email:true,displayName:true,aiEnabled:true},
 });
 const accountIds=accounts.map(a=>a.id);
 const requestedMailbox=searchParams.mailbox||"";
 const mailbox=requestedMailbox==="ALL"?"ALL":accountIds.includes(requestedMailbox)?requestedMailbox:accounts.length===1?accounts[0].id:"ALL";
 const folder:FolderKey=FOLDERS.some(f=>f.key===searchParams.folder)?searchParams.folder as FolderKey:"INBOX";
 const composing=searchParams.compose==="1";
 const q=(searchParams.q||"").trim().toLowerCase();
 const scopedIds=mailbox==="ALL"?accountIds:[mailbox];
 const [allThreads,clients,unreadPairs]=await Promise.all([
  scopedIds.length?prisma.mailThread.findMany({where:{mailAccountId:{in:scopedIds}},orderBy:[{lastMessageAt:"desc"},{updatedAt:"desc"}],take:500,include:{client:true,account:{select:{id:true,email:true,displayName:true}}}}):Promise.resolve([]),
  canDraft?prisma.client.findMany({orderBy:{createdAt:"desc"},take:300,select:{id:true,firstName:true,lastName:true,internalId:true,email:true}}):Promise.resolve([]),
  Promise.all(scopedIds.map(async id=>[id,await getUnreadGmailThreadIds(id).catch(()=>new Set<string>())] as const)),
 ]);
 const unreadByAccount=new Map(unreadPairs);
 const [stateMap,intelligenceMap]=await Promise.all([getMailThreadStateMap(allThreads.map(t=>t.id)),getMailIntelligenceMap(allThreads.map(t=>t.id))]);
 const intelligence=(t:(typeof allThreads)[number])=>intelligenceMap.get(t.id)??classifyMailText({threadId:t.id,subject:t.subject,snippet:t.aiDraft??t.snippet,fromEmail:t.fromEmail,ownEmail:t.account.email,hasDraft:Boolean(t.aiDraft),requiresAttention:t.requiresAttention});
 const isUnread=(t:(typeof allThreads)[number])=>unreadByAccount.get(t.mailAccountId)?.has(t.gmailThreadId)??false;
 const sent=(t:(typeof allThreads)[number])=>Boolean(t.fromEmail?.toLowerCase().includes(t.account.email.toLowerCase())&&!t.aiDraft);
 const visibleBase=(t:(typeof allThreads)[number])=>{const s=stateMap.get(t.id)!;return !s.trashed&&!s.archived&&!isSnoozed(s);};
 const inFolder=(t:(typeof allThreads)[number],key:FolderKey)=>{const s=stateMap.get(t.id)!;const isSent=sent(t),incoming=!t.aiDraft&&!isSent;
  if(key==="TRASH")return s.trashed;
  if(key==="ARCHIVE")return s.archived&&!s.trashed;
  if(key==="SNOOZED")return isSnoozed(s)&&!s.trashed;
  if(key==="DRAFTS")return Boolean(t.aiDraft)&&!s.trashed;
  if(key==="SENT")return isSent&&!s.trashed;
  if(key==="STARRED")return s.starred&&!s.trashed;
  if(key==="AI_REVIEW")return visibleBase(t)&&(t.requiresAttention||t.aiLevel!=="AUTO");
  if(key==="NEEDS_REPLY")return visibleBase(t)&&intelligence(t).needsReply&&s.workflowStatus==="OPEN";
  return visibleBase(t)&&incoming;
 };
 const matches=(t:(typeof allThreads)[number])=>!q||`${t.subject??""} ${t.fromEmail??""} ${t.snippet??""} ${t.account.email} ${t.client?.firstName??""} ${t.client?.lastName??""} ${t.client?.internalId??""}`.toLowerCase().includes(q);
 const threads=allThreads.filter(t=>inFolder(t,folder)&&matches(t)).slice(0,100);
 const countMap=Object.fromEntries(FOLDERS.map(f=>[f.key,allThreads.filter(t=>inFolder(t,f.key)).length]));
 const unreadInbox=allThreads.filter(t=>inFolder(t,"INBOX")&&isUnread(t)).length;
 const accountStats=new Map(accounts.map(a=>[a.id,{threads:0,unread:0}]));
 for(const t of allThreads){const stat=accountStats.get(t.mailAccountId);if(stat){stat.threads++;if(inFolder(t,"INBOX")&&isUnread(t))stat.unread++;}}
 const activeThread=searchParams.thread&&accountIds.length?await prisma.mailThread.findFirst({where:{id:searchParams.thread,mailAccountId:{in:accountIds}},include:{client:true,account:true}}):null;
 const activeState=activeThread?stateMap.get(activeThread.id)??(await getMailThreadStateMap([activeThread.id])).get(activeThread.id)??null:null;
 const conversation=activeThread&&!activeThread.aiDraft?await getMailConversation(activeThread.mailAccountId,activeThread.gmailThreadId).catch(()=>[]):[];
 const activeUnread=Boolean(activeThread&&unreadByAccount.get(activeThread.mailAccountId)?.has(activeThread.gmailThreadId));
 const defaultFrom=mailbox!=="ALL"?mailbox:activeThread?.mailAccountId||accounts[0]?.id||"";
 const qp=(extra:Record<string,string|undefined>)=>{const p=new URLSearchParams();p.set("mailbox",mailbox);p.set("folder",folder);if(q)p.set("q",q);for(const [k,v] of Object.entries(extra))if(v)p.set(k,v);return `/app/mail?${p.toString()}`;};
 const mailboxLabel=mailbox==="ALL"?"All mailboxes":accounts.find(a=>a.id===mailbox)?.email??"Mail";

 return <div className="space-y-5">
  <PageHeader title="JUN Mail Center" subtitle={`${mailboxLabel} · ${unreadInbox} unread · ${accounts.length} connected mailbox${accounts.length===1?"":"es"}`} actions={<div className="flex flex-wrap gap-2">{accounts.length?(mailbox==="ALL"?<form action={syncAllMailboxes}><Button variant="secondary">Sync all mailboxes</Button></form>:<form action={syncMailbox.bind(null,mailbox)}><Button variant="secondary">Sync mailbox</Button></form>):null}{canDraft&&accounts.length?<Link href={qp({compose:"1"})}><Button variant="primary">Compose</Button></Link>:null}<Link href="/app/settings/email"><Button variant="outline"><Settings className="mr-1 h-4 w-4"/>Email settings</Button></Link></div>}/>

  {accounts.length>1?<Card><CardContent className="p-4"><div className="flex flex-wrap items-end gap-3"><form className="flex flex-wrap items-end gap-2"><input type="hidden" name="folder" value={folder}/><Field label="Mailbox"><Select name="mailbox" defaultValue={mailbox} className="min-w-72"><option value="ALL">All mailboxes</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.displayName?`${a.displayName} · `:""}{a.email}</option>)}</Select></Field><Button variant="outline">Open mailbox</Button></form><div className="flex flex-wrap gap-2">{accounts.map(a=>{const s=accountStats.get(a.id);return <Link key={a.id} href={`/app/mail?mailbox=${a.id}&folder=INBOX`} className={`rounded-lg border px-3 py-2 text-xs ${mailbox===a.id?"border-electric bg-electric/5":"border-line bg-surface"}`}><span className="font-medium">{a.displayName||a.email}</span><span className="ml-2 text-muted2">{s?.unread??0} unread</span></Link>})}</div></div></CardContent></Card>:null}

  <div className="grid gap-5 xl:grid-cols-[220px_minmax(340px,.9fr)_minmax(460px,1.35fr)]">
   <aside className="space-y-4">
    <nav className="space-y-1">{FOLDERS.map(f=><Link key={f.key} href={`/app/mail?mailbox=${encodeURIComponent(mailbox)}&folder=${f.key}`} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${folder===f.key?"bg-electric/10 text-electric":"text-muted2 hover:bg-surface hover:text-ink"}`}><span className="flex items-center gap-2"><f.icon className="h-4 w-4"/>{f.label}</span><span className="registry-id text-xs">{f.key==="INBOX"&&unreadInbox?`${unreadInbox}/${countMap[f.key]??0}`:countMap[f.key]??0}</span></Link>)}</nav>
    <Card><CardContent className="p-4 text-xs text-muted2"><p className="font-medium text-ink">Mailbox scope</p><p className="mt-2">{mailbox==="ALL"?"You are viewing conversations from every connected mailbox.":`Only ${mailboxLabel} is shown.`}</p></CardContent></Card>
   </aside>

   <section className="min-w-0 space-y-3">
    <form className="flex gap-2"><input type="hidden" name="mailbox" value={mailbox}/><input type="hidden" name="folder" value={folder}/><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted2"/><Input name="q" defaultValue={searchParams.q} placeholder="Search sender, subject, client, mailbox…" className="pl-9"/></div><Button variant="outline">Search</Button></form>
    <div className="flex items-center justify-between text-xs text-muted2"><span>{threads.length} conversation(s)</span>{q?<Link href={`/app/mail?mailbox=${encodeURIComponent(mailbox)}&folder=${folder}`} className="text-electric">Clear search</Link>:null}</div>
    {threads.length===0?<EmptyState icon={Mail} title={`No conversations in ${folder.toLowerCase().replaceAll("_"," ")}`} description={accounts.length?"Try another folder, mailbox, or sync Gmail.":"Connect Gmail to populate JUN Mail."}/>:<ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">{threads.map(t=>{const s=stateMap.get(t.id)!,intel=intelligence(t);const unread=isUnread(t);return <li key={t.id}><Link href={qp({thread:t.id,compose:undefined})} className={`block px-4 py-3 hover:bg-surface ${activeThread?.id===t.id?"bg-surface":""}`}><div className="flex items-start gap-3"><span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${unread?"bg-electric":"bg-transparent"}`}/><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className={`truncate ${unread?"font-semibold":"font-medium"}`}>{s.starred?"★ ":""}{t.subject??"(no subject)"}</p><span className="shrink-0 text-[11px] text-muted2">{formatDateTime(t.lastMessageAt??t.updatedAt)}</span></div><p className="mt-1 truncate text-sm text-muted2">{t.aiDraft??t.snippet??"—"}</p><div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium">{t.account.displayName||t.account.email}</span><Badge className={STATUS_BADGE[s.workflowStatus]??""}>{s.workflowStatus.replaceAll("_"," ")}</Badge><Badge>{intel.category}</Badge>{intel.priority==="HIGH"||intel.priority==="URGENT"?<Badge className={INTELLIGENCE_PRIORITY[intel.priority]??""}>{intel.priority}</Badge>:null}{intel.needsReply?<Badge className="bg-violet-100 text-violet-800">NEEDS REPLY</Badge>:null}{t.aiLevel!=="AUTO"?<Badge className={AI_BADGE[t.aiLevel]??""}>{t.aiLevel.replaceAll("_"," ")}</Badge>:null}{t.client?<span className="text-xs text-muted2">{t.client.firstName} {t.client.lastName}</span>:null}</div></div></div></Link></li>})}</ul>}
   </section>

   <section className="min-w-0">
    {composing&&canDraft&&accounts.length?<Card><CardHeader><CardTitle>New message</CardTitle></CardHeader><CardContent><form action={composeDraft} className="space-y-4"><Field label="From"><Select name="mailAccountId" defaultValue={defaultFrom} required>{accounts.map(a=><option key={a.id} value={a.id}>{a.displayName?`${a.displayName} · `:""}{a.email}</option>)}</Select></Field><Field label="To"><Input name="toAddr" type="email" required placeholder="client@example.com"/></Field><Field label="Subject"><Input name="subject" required maxLength={200}/></Field><Field label="Link to client (optional)"><Select name="clientId" defaultValue=""><option value="">— None —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.internalId}){c.email?` · ${c.email}`:""}</option>)}</Select></Field><Field label="Message"><Textarea name="body" rows={12} required/></Field><div className="flex gap-2"><Button type="submit" variant="primary">Save draft</Button><Link href={qp({compose:undefined})}><Button type="button" variant="ghost">Cancel</Button></Link></div></form></CardContent></Card>:activeThread&&activeState?<Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2 flex items-center gap-2"><span className="rounded-md bg-surface px-2 py-1 text-xs font-medium">{activeThread.account.displayName||activeThread.account.email}</span><span className="text-xs text-muted2">via Gmail</span></div><CardTitle>{activeState.starred?"★ ":""}{activeThread.subject??"(no subject)"}</CardTitle><p className="mt-1 text-sm text-muted2">{activeThread.client?<>Client: <Link className="text-electric" href={`/app/clients/${activeThread.clientId}/dashboard`}>{activeThread.client.firstName} {activeThread.client.lastName}</Link> · </>:null}{activeThread.aiSummary??""}</p></div><div className="flex gap-2"><Badge className={STATUS_BADGE[activeState.workflowStatus]??""}>{activeState.workflowStatus.replaceAll("_"," ")}</Badge><Badge className={AI_BADGE[activeThread.aiLevel]??""}>{activeThread.aiLevel.replaceAll("_"," ")}</Badge></div></div></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">{activeUnread?<form action={markMailThreadRead.bind(null,activeThread.id,folder)}><Button variant="outline">Mark read</Button></form>:null}<form action={toggleMailThreadStar.bind(null,activeThread.id,folder)}><Button variant="outline">{activeState.starred?"Unstar":"Star"}</Button></form>{!activeState.archived&&!activeState.trashed?<form action={archiveMailThread.bind(null,activeThread.id)}><Button variant="outline">Archive</Button></form>:null}{!activeState.trashed?<form action={trashMailThread.bind(null,activeThread.id)}><Button variant="outline">Trash</Button></form>:<form action={restoreMailThread.bind(null,activeThread.id,"INBOX")}><Button variant="outline">Restore</Button></form>}<form action={snoozeMailThread.bind(null,activeThread.id)} className="flex gap-1"><Select name="hours" defaultValue="24" className="w-28"><option value="4">4 hours</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">1 week</option></Select><Button variant="outline">Snooze</Button></form></div>
      <form action={setMailWorkflowStatus.bind(null,activeThread.id)} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/50 p-3"><span className="text-xs font-medium text-muted2">Conversation status</span><Select name="workflowStatus" defaultValue={activeState.workflowStatus} className="w-48"><option value="OPEN">OPEN</option><option value="WAITING_CLIENT">WAITING CLIENT</option><option value="WAITING_INTERNAL">WAITING INTERNAL</option><option value="RESOLVED">RESOLVED</option></Select><Button variant="secondary">Update</Button></form>
      {activeThread.aiDraft&&canDraft?<><div className="rounded-lg border border-line bg-surface/50 p-3 text-xs"><span className="font-medium">Sending mailbox:</span> {activeThread.account.email}</div><form action={updateMailDraft.bind(null,activeThread.id)} className="space-y-4 rounded-lg border border-line bg-surface/50 p-4"><Field label="To"><Input name="to" type="email" required defaultValue={activeThread.toEmails[0]??""}/></Field><Field label="Subject"><Input name="subject" required maxLength={200} defaultValue={activeThread.subject??""}/></Field><Field label="Message"><Textarea name="body" rows={12} required defaultValue={activeThread.aiDraft}/></Field><Button type="submit" variant="secondary">Save changes</Button></form>{canSend?<form action={sendDraftViaGmail.bind(null,activeThread.id)}><Button variant="gold">Send via {activeThread.account.email}</Button></form>:null}</>:conversation.length?<div className="space-y-3">{conversation.map(m=><div key={m.id} className={`rounded-xl border p-4 ${m.isUnread?"border-electric/40 bg-electric/5":"border-line bg-white"}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{m.from||"Unknown sender"}</p><p className="mt-1 text-xs text-muted2">To: {m.to.join(", ")||"—"}{m.cc.length?` · CC: ${m.cc.join(", ")}`:""}</p></div><span className="text-xs text-muted2">{formatDateTime(m.date)}</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6">{m.body||m.snippet||"No readable message body."}</p>{m.attachments.length?<div className="mt-4 flex flex-wrap gap-2">{m.attachments.map((a,j)=><span key={`${a.filename}-${j}`} className="rounded-md border border-line bg-surface px-2 py-1 text-xs">📎 {a.filename}{a.size?` · ${Math.ceil(a.size/1024)} KB`:""}</span>)}</div>:null}</div>)}</div>:<div className="rounded-lg border border-line bg-surface/50 p-4 text-sm text-muted2">No full Gmail conversation could be loaded. {activeThread.snippet??""}</div>}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">{!activeThread.aiDraft&&canDraft&&activeThread.fromEmail&&!activeThread.fromEmail.toLowerCase().includes(activeThread.account.email.toLowerCase())?<form action={draftReplyWithJunAI.bind(null,activeThread.id)}><Button variant="primary">Draft reply with JUN AI</Button></form>:null}<Link href={`/app/mail?mailbox=${activeThread.mailAccountId}&folder=${folder}`}><Button variant="ghost">Close thread</Button></Link></div>
     </CardContent></Card>:<EmptyState icon={Mail} title="Select a conversation" description={accounts.length>1?"Choose a conversation from any connected mailbox.":"Pick a conversation from the list to read it here."}/>} 
   </section>
  </div>
 </div>;
}
