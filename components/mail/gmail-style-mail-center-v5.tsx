import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getAccessibleMailboxIds } from "@/lib/mail-security";
import { getMailThreadStateMap, isSnoozed } from "@/lib/mail-thread-state";
import { getMailConversation } from "@/lib/mail-thread-reader";
import { getGmailMailboxCacheMap } from "@/lib/mail-gmail-cache";
import { classifyMailText, getMailIntelligenceMap } from "@/lib/mail-intelligence";
import { syncMailboxV2, syncAllMailboxesV2 } from "@/services/mail-sync-v2";
import { archiveMailThread, markMailThreadRead, markMailThreadUnread, restoreMailThread, snoozeMailThread, toggleMailThreadStar, trashMailThread } from "@/services/mail-workspace";
import { EmailHtmlFrame } from "@/components/mail/email-html-frame";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Archive, ArrowLeft, Bell, Clock3, FileEdit, Inbox, Mail, MessageSquareReply, RefreshCw, Search, Send, Star, Tag, Trash2, Users } from "lucide-react";

const FOLDERS=[
 {key:"INBOX",label:"Inbox",icon:Inbox},{key:"NEEDS_REPLY",label:"Needs reply",icon:MessageSquareReply},{key:"STARRED",label:"Starred",icon:Star},{key:"SNOOZED",label:"Snoozed",icon:Clock3},{key:"DRAFTS",label:"Drafts",icon:FileEdit},{key:"SENT",label:"Sent",icon:Send},{key:"ARCHIVE",label:"Archive",icon:Archive},{key:"TRASH",label:"Trash",icon:Trash2},
] as const;
const CATEGORIES=[
 {key:"PRIMARY",label:"Principale",icon:Inbox},
 {key:"PROMOTIONS",label:"Promotions",icon:Tag},
 {key:"SOCIAL",label:"Réseaux sociaux",icon:Users},
 {key:"UPDATES",label:"Notifications",icon:Bell},
] as const;
type FolderKey=(typeof FOLDERS)[number]["key"];
type CategoryKey=(typeof CATEGORIES)[number]["key"];
type Params={folder?:string;thread?:string;q?:string;mailbox?:string;category?:string};

function senderLabel(raw:string|null){const v=(raw||"").trim();const name=v.match(/^\s*"?([^"<]+)"?\s*</)?.[1]?.trim();if(name)return name;const email=v.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]||v;return email.split("@")[0]||"Unknown";}
function senderEmail(raw:string){return raw.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]||raw;}
function shortDate(d:Date){const now=new Date();if(d.toDateString()===now.toDateString())return d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});if(d.getFullYear()===now.getFullYear())return d.toLocaleDateString([], {month:"short",day:"numeric"});return d.toLocaleDateString([], {month:"short",day:"numeric",year:"numeric"});}

export async function GmailStyleMailCenterV5({searchParams}:{searchParams:Params}){
 const user=await requireUser();if(!can(user,"EMAIL_READ"))redirect("/app/forbidden");
 const canDraft=can(user,"EMAIL_DRAFT");
 const accessibleIds=await getAccessibleMailboxIds(user,true);
 const accounts=accessibleIds.length?await prisma.mailAccount.findMany({where:{id:{in:accessibleIds},OR:[{accessTokenEnc:{not:null}},{refreshTokenEnc:{not:null}}]},orderBy:{createdAt:"asc"},select:{id:true,email:true,displayName:true}}):[];
 const accountIds=accounts.map(a=>a.id),requested=searchParams.mailbox||"";
 const mailbox=requested==="ALL"?"ALL":accountIds.includes(requested)?requested:accounts.length===1?accounts[0].id:"ALL";
 const folder:FolderKey=FOLDERS.some(f=>f.key===searchParams.folder)?searchParams.folder as FolderKey:"INBOX";
 const category:CategoryKey=CATEGORIES.some(c=>c.key===searchParams.category)?searchParams.category as CategoryKey:"PRIMARY";
 const q=(searchParams.q||"").trim().toLowerCase(),scopedIds=mailbox==="ALL"?accountIds:[mailbox];
 const [allThreads,cacheMap]=await Promise.all([
  scopedIds.length?prisma.mailThread.findMany({where:{mailAccountId:{in:scopedIds}},orderBy:[{lastMessageAt:"desc"},{updatedAt:"desc"}],take:500,include:{client:true,account:{select:{id:true,email:true,displayName:true}}}}):Promise.resolve([]),
  getGmailMailboxCacheMap(scopedIds),
 ]);
 const [stateMap,intelligenceMap]=await Promise.all([getMailThreadStateMap(allThreads.map(t=>t.id)),getMailIntelligenceMap(allThreads.map(t=>t.id))]);
 const intelligence=(t:(typeof allThreads)[number])=>intelligenceMap.get(t.id)??classifyMailText({threadId:t.id,subject:t.subject,snippet:t.aiDraft??t.snippet,fromEmail:t.fromEmail,ownEmail:t.account.email,hasDraft:Boolean(t.aiDraft),requiresAttention:t.requiresAttention});
 const sent=(t:(typeof allThreads)[number])=>Boolean(t.fromEmail?.toLowerCase().includes(t.account.email.toLowerCase())&&!t.aiDraft);
 const visibleBase=(t:(typeof allThreads)[number])=>{const s=stateMap.get(t.id)!;return !s.trashed&&!s.archived&&!isSnoozed(s)};
 const inCategory=(t:(typeof allThreads)[number])=>cacheMap.get(t.mailAccountId)?.categoryByThreadId?.[t.gmailThreadId]===category;
 const inFolder=(t:(typeof allThreads)[number],key:FolderKey)=>{const s=stateMap.get(t.id)!,isSent=sent(t),incoming=!t.aiDraft&&!isSent;if(key==="TRASH")return s.trashed;if(key==="ARCHIVE")return s.archived&&!s.trashed;if(key==="SNOOZED")return isSnoozed(s)&&!s.trashed;if(key==="DRAFTS")return Boolean(t.aiDraft)&&!s.trashed;if(key==="SENT")return isSent&&!s.trashed;if(key==="STARRED")return s.starred&&!s.trashed;if(key==="NEEDS_REPLY")return visibleBase(t)&&intelligence(t).needsReply&&s.workflowStatus==="OPEN";if(key==="INBOX")return visibleBase(t)&&incoming&&inCategory(t);return visibleBase(t)&&incoming};
 const matches=(t:(typeof allThreads)[number])=>!q||`${t.subject??""} ${t.fromEmail??""} ${t.snippet??""} ${t.account.email} ${t.client?.firstName??""} ${t.client?.lastName??""}`.toLowerCase().includes(q);
 const threads=allThreads.filter(t=>inFolder(t,folder)&&matches(t)).slice(0,150);
 const localCount=(key:FolderKey)=>allThreads.filter(t=>inFolder(t,key)).length;
 const inboxUnread=scopedIds.reduce((sum,id)=>sum+(cacheMap.get(id)?.labelStats?.INBOX?.threadsUnread??cacheMap.get(id)?.labelStats?.INBOX?.messagesUnread??0),0);
 const countFor=(key:FolderKey)=>key==="INBOX"?inboxUnread:localCount(key);
 const activeThread=searchParams.thread&&accountIds.length?await prisma.mailThread.findFirst({where:{id:searchParams.thread,mailAccountId:{in:accountIds}},include:{client:true,account:true}}):null;
 const activeState=activeThread?stateMap.get(activeThread.id)??(await getMailThreadStateMap([activeThread.id])).get(activeThread.id)??null:null;
 const conversation=activeThread&&!activeThread.aiDraft?await getMailConversation(activeThread.mailAccountId,activeThread.gmailThreadId).catch(()=>[]):[];
 const mailboxLabel=mailbox==="ALL"?"All mailboxes":accounts.find(a=>a.id===mailbox)?.email??"Mail";
 const lastSync=scopedIds.map(id=>cacheMap.get(id)?.updatedAt).filter(Boolean).sort().at(0);
 const qp=(extra:Record<string,string|undefined>)=>{const p=new URLSearchParams();p.set("mailbox",mailbox);p.set("folder",folder);if(folder==="INBOX")p.set("category",category);if(q)p.set("q",q);for(const[k,v]of Object.entries(extra)){if(v)p.set(k,v);else p.delete(k)}return `/app/mail?${p.toString()}`};

 if(activeThread&&activeState){return <div className="overflow-hidden rounded-2xl border border-line bg-white">
  <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-line px-3"><Link href={qp({thread:undefined})}><Button size="sm" variant="ghost"><ArrowLeft className="h-4 w-4"/> Back</Button></Link>{activeState.isRead?<form action={markMailThreadUnread.bind(null,activeThread.id,folder)}><Button size="sm" variant="outline">Mark unread</Button></form>:<form action={markMailThreadRead.bind(null,activeThread.id,folder)}><Button size="sm" variant="outline">Mark read</Button></form>}<form action={toggleMailThreadStar.bind(null,activeThread.id,folder)}><Button size="sm" variant="outline">{activeState.starred?"Unstar":"Star"}</Button></form>{!activeState.archived&&!activeState.trashed?<form action={archiveMailThread.bind(null,activeThread.id)}><Button size="sm" variant="outline"><Archive className="h-4 w-4"/> Archive</Button></form>:null}{!activeState.trashed?<form action={trashMailThread.bind(null,activeThread.id)}><Button size="sm" variant="outline"><Trash2 className="h-4 w-4"/> Trash</Button></form>:<form action={restoreMailThread.bind(null,activeThread.id,"INBOX")}><Button size="sm" variant="outline">Restore</Button></form>}{!activeState.trashed?<form action={snoozeMailThread.bind(null,activeThread.id)} className="flex gap-1"><Select name="hours" defaultValue="24" className="h-8 w-28"><option value="4">4 hours</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">1 week</option></Select><Button size="sm" variant="outline">JUN Snooze</Button></form>:null}<div className="ml-auto text-xs text-muted2">{mailboxLabel}</div></div>
  <div className="px-5 py-5 md:px-8"><h1 className="mb-6 text-xl font-medium text-ink md:text-2xl">{activeThread.subject||"(no subject)"}</h1>{conversation.length?<div className="space-y-6">{conversation.map((m,i)=><article key={m.id} className="overflow-hidden rounded-xl border border-line bg-white"><div className="flex items-start justify-between gap-4 border-b border-line px-4 py-4"><div><p className="font-semibold text-ink">{senderLabel(m.from)} <span className="font-normal text-muted2">&lt;{senderEmail(m.from)}&gt;</span></p><p className="mt-1 text-xs text-muted2">to {m.to.join(", ")||"me"}{m.cc.length?` · cc ${m.cc.join(", ")}`:""}</p></div><span className="shrink-0 text-xs text-muted2">{m.date.toLocaleString()}</span></div><div className="bg-white p-3 md:p-5">{m.htmlBody?<EmailHtmlFrame html={m.htmlBody} title={m.subject}/>:<div className="mx-auto max-w-5xl whitespace-pre-wrap break-words text-[15px] leading-7 text-ink">{m.body||m.snippet||"No readable body."}</div>}</div>{m.attachments.length?<div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">{m.attachments.map((a,n)=><span key={`${a.filename}-${n}`} className="rounded-lg border border-line px-3 py-2 text-sm">📎 {a.filename}</span>)}</div>:null}{i===conversation.length-1?<div className="flex flex-wrap gap-2 border-t border-line px-4 py-4"><Link href={`/app/mail/compose?mailbox=${activeThread.mailAccountId}&source=${activeThread.id}&mode=REPLY`}><Button variant="outline">Reply</Button></Link><Link href={`/app/mail/compose?mailbox=${activeThread.mailAccountId}&source=${activeThread.id}&mode=REPLY_ALL`}><Button variant="outline">Reply all</Button></Link><Link href={`/app/mail/compose?mailbox=${activeThread.mailAccountId}&source=${activeThread.id}&mode=FORWARD`}><Button variant="outline">Forward</Button></Link></div>:null}</article>)}</div>:<div className="py-12 text-sm text-muted2">Gmail conversation could not be loaded. Run Sync and try again.</div>}</div>
 </div>}

 return <div className="grid min-h-[72vh] gap-0 overflow-hidden rounded-2xl border border-line bg-white lg:grid-cols-[210px_minmax(0,1fr)]">
  <aside className="border-r border-line bg-[#f8fafd] p-3">{canDraft&&accounts.length?<Link href={`/app/mail/compose?mailbox=${mailbox==="ALL"?(accounts[0]?.id||""):mailbox}`}><Button className="mb-4 w-full justify-start rounded-2xl py-5" variant="primary">Compose</Button></Link>:null}<nav className="space-y-1">{FOLDERS.map(f=><Link key={f.key} href={`/app/mail?mailbox=${encodeURIComponent(mailbox)}&folder=${f.key}${f.key==="INBOX"?"&category=PRIMARY":""}`} className={`flex items-center justify-between rounded-r-full px-3 py-2 text-sm ${folder===f.key?"bg-blue-100 font-semibold text-blue-900":"text-ink hover:bg-slate-100"}`}><span className="flex items-center gap-3"><f.icon className="h-4 w-4"/>{f.label}</span><span className="text-xs">{countFor(f.key)}</span></Link>)}</nav></aside>
  <section className="min-w-0"><div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-line px-3">{accounts.length?(mailbox==="ALL"?<form action={syncAllMailboxesV2}><Button size="sm" variant="outline"><RefreshCw className="h-4 w-4"/> Sync all</Button></form>:<form action={syncMailboxV2.bind(null,mailbox)}><Button size="sm" variant="outline"><RefreshCw className="h-4 w-4"/> Sync</Button></form>):null}<form className="flex min-w-[240px] flex-1 items-center gap-2"><input type="hidden" name="mailbox" value={mailbox}/><input type="hidden" name="folder" value={folder}/>{folder==="INBOX"?<input type="hidden" name="category" value={category}/>:null}<div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted2"/><Input name="q" defaultValue={searchParams.q} placeholder="Search mail" className="h-9 rounded-full bg-[#f1f5f9] pl-9"/></div><Button size="sm" variant="outline">Search</Button></form>{accounts.length>1?<form className="flex items-center gap-2"><input type="hidden" name="folder" value={folder}/>{folder==="INBOX"?<input type="hidden" name="category" value={category}/>:null}<Select name="mailbox" defaultValue={mailbox} className="h-9 w-48"><option value="ALL">All mailboxes</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.displayName||a.email}</option>)}</Select><Button size="sm" variant="outline">Open</Button></form>:null}</div>
  {folder==="INBOX"?<div className="grid grid-cols-2 border-b border-line md:grid-cols-4">{CATEGORIES.map(c=><Link key={c.key} href={`/app/mail?mailbox=${encodeURIComponent(mailbox)}&folder=INBOX&category=${c.key}`} className={`flex items-center gap-2 border-b-2 px-4 py-4 text-sm ${category===c.key?"border-blue-600 font-semibold text-blue-700":"border-transparent text-muted2 hover:bg-slate-50"}`}><c.icon className="h-4 w-4"/>{c.label}</Link>)}</div>:null}
  <div className="border-b border-line px-4 py-2 text-xs text-muted2">{threads.length} recent conversation(s) · {mailboxLabel}{lastSync?` · synced ${new Date(lastSync).toLocaleString()}`:" · run Sync once to build fast cache"}</div>
  {threads.length?<div>{threads.map(t=>{const s=stateMap.get(t.id)!;return <Link key={t.id} href={qp({thread:t.id})} className={`grid min-h-[44px] grid-cols-[28px_28px_minmax(120px,220px)_minmax(0,1fr)_90px] items-center gap-2 border-b border-line px-3 text-sm hover:z-10 hover:bg-slate-50 hover:shadow-sm ${s.isRead?"bg-[#f6f8fc] text-slate-700":"bg-white font-semibold text-ink"}`}><span onClick={e=>e.preventDefault()} className="text-center text-muted2">•</span><span className={s.starred?"text-amber-500":"text-slate-300"}>★</span><span className="truncate">{senderLabel(t.fromEmail)}</span><span className="min-w-0 truncate"><span>{t.subject||"(no subject)"}</span>{t.snippet?<span className="font-normal text-muted2"> — {t.snippet}</span>:null}</span><span className="text-right text-xs text-muted2">{shortDate(t.lastMessageAt)}</span></Link>})}</div>:<EmptyState title="No messages" description={folder==="INBOX"?"Run Sync once, then JUN Mail will load from its local cache without calling Gmail on every page view.":"No conversations in this folder."} icon={<Mail className="h-6 w-6"/>}/>}</section>
 </div>;
}
