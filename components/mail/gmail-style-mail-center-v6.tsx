import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getAccessibleMailboxIds } from "@/lib/mail-security";
import { getMailThreadStateMap, isSnoozed } from "@/lib/mail-thread-state";
import { getMailConversation } from "@/lib/mail-thread-reader";
import { getGmailMailboxCacheMap } from "@/lib/mail-gmail-cache";
import { syncMailboxV2, syncAllMailboxesV2 } from "@/services/mail-sync-v2";
import { archiveMailThread, markMailThreadRead, markMailThreadUnread, restoreMailThread, snoozeMailThread, toggleMailThreadStar, trashMailThread } from "@/services/mail-workspace";
import { EmailHtmlFrame } from "@/components/mail/email-html-frame";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Archive, ArrowLeft, Bell, Clock3, FileEdit, Inbox, RefreshCw, Search, Send, Star, Tag, Trash2, Users } from "lucide-react";

const LIMIT=20;
const FOLDERS=[
 {key:"INBOX",label:"Inbox",icon:Inbox},{key:"STARRED",label:"Starred",icon:Star},{key:"SNOOZED",label:"Snoozed",icon:Clock3},{key:"DRAFTS",label:"Drafts",icon:FileEdit},{key:"SENT",label:"Sent",icon:Send},{key:"ARCHIVE",label:"Archive",icon:Archive},{key:"TRASH",label:"Trash",icon:Trash2},
] as const;
const CATEGORIES=[
 {key:"PRIMARY",label:"Principale",icon:Inbox},{key:"PROMOTIONS",label:"Promotions",icon:Tag},{key:"SOCIAL",label:"Réseaux sociaux",icon:Users},{key:"UPDATES",label:"Notifications",icon:Bell},
] as const;
type FolderKey=(typeof FOLDERS)[number]["key"];
type CategoryKey=(typeof CATEGORIES)[number]["key"];
type Params={folder?:string;thread?:string;q?:string;mailbox?:string;category?:string};

function senderLabel(raw:string|null){const v=(raw||"").trim();const name=v.match(/^\s*"?([^"<]+)"?\s*</)?.[1]?.trim();if(name)return name;const email=v.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]||v;return email.split("@")[0]||"Unknown";}
function senderEmail(raw:string){return raw.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]||raw;}
function shortDate(d:Date|null){if(!d)return "";const now=new Date();if(d.toDateString()===now.toDateString())return d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});if(d.getFullYear()===now.getFullYear())return d.toLocaleDateString([], {month:"short",day:"numeric"});return d.toLocaleDateString([], {month:"short",day:"numeric",year:"numeric"});}

export async function GmailStyleMailCenterV6({searchParams}:{searchParams:Params}){
 const user=await requireUser();if(!can(user,"EMAIL_READ"))redirect("/app/forbidden");
 const canDraft=can(user,"EMAIL_DRAFT");
 const accessibleIds=await getAccessibleMailboxIds(user,true);
 const accounts=accessibleIds.length?await prisma.mailAccount.findMany({where:{id:{in:accessibleIds},OR:[{accessTokenEnc:{not:null}},{refreshTokenEnc:{not:null}}]},orderBy:{createdAt:"asc"},select:{id:true,email:true,displayName:true}}):[];
 const accountIds=accounts.map(a=>a.id),requested=searchParams.mailbox||"";
 const mailbox=requested==="ALL"?"ALL":accountIds.includes(requested)?requested:accounts.length===1?accounts[0].id:"ALL";
 const folder:FolderKey=FOLDERS.some(f=>f.key===searchParams.folder)?searchParams.folder as FolderKey:"INBOX";
 const category:CategoryKey=CATEGORIES.some(c=>c.key===searchParams.category)?searchParams.category as CategoryKey:"PRIMARY";
 const scopedIds=mailbox==="ALL"?accountIds:[mailbox];
 const q=(searchParams.q||"").trim().toLowerCase();
 const [recent,cacheMap]=await Promise.all([
  scopedIds.length?prisma.mailThread.findMany({where:{mailAccountId:{in:scopedIds}},orderBy:[{lastMessageAt:"desc"},{updatedAt:"desc"}],take:LIMIT,include:{account:{select:{id:true,email:true,displayName:true}}}}):Promise.resolve([]),
  getGmailMailboxCacheMap(scopedIds),
 ]);
 const stateMap=await getMailThreadStateMap(recent.map(t=>t.id));
 const sent=(t:(typeof recent)[number])=>Boolean(t.fromEmail?.toLowerCase().includes(t.account.email.toLowerCase())&&!t.aiDraft);
 const visible=(t:(typeof recent)[number])=>{const s=stateMap.get(t.id)!;return !s.trashed&&!s.archived&&!isSnoozed(s)};
 const inFolder=(t:(typeof recent)[number])=>{const s=stateMap.get(t.id)!;if(folder==="TRASH")return s.trashed;if(folder==="ARCHIVE")return s.archived&&!s.trashed;if(folder==="SNOOZED")return isSnoozed(s)&&!s.trashed;if(folder==="DRAFTS")return Boolean(t.aiDraft)&&!s.trashed;if(folder==="SENT")return sent(t)&&!s.trashed;if(folder==="STARRED")return s.starred&&!s.trashed;if(folder==="INBOX"){const cached=cacheMap.get(t.mailAccountId)?.categoryByThreadId?.[t.gmailThreadId];return visible(t)&&!sent(t)&&!t.aiDraft&&(cached===category||(category==="PRIMARY"&&!cached));}return visible(t);};
 const matches=(t:(typeof recent)[number])=>!q||`${t.subject??""} ${t.fromEmail??""} ${t.snippet??""}`.toLowerCase().includes(q);
 const threads=recent.filter(t=>inFolder(t)&&matches(t)).slice(0,LIMIT);
 const inboxUnread=scopedIds.reduce((sum,id)=>sum+(cacheMap.get(id)?.labelStats?.INBOX?.threadsUnread??cacheMap.get(id)?.labelStats?.INBOX?.messagesUnread??0),0);
 const activeThread=searchParams.thread&&accountIds.length?await prisma.mailThread.findFirst({where:{id:searchParams.thread,mailAccountId:{in:accountIds}},include:{account:true}}):null;
 const activeState=activeThread?(stateMap.get(activeThread.id)??(await getMailThreadStateMap([activeThread.id])).get(activeThread.id)??null):null;
 const conversation=activeThread&&!activeThread.aiDraft?await getMailConversation(activeThread.mailAccountId,activeThread.gmailThreadId).catch(()=>[]):[];
 const mailboxLabel=mailbox==="ALL"?"All mailboxes":accounts.find(a=>a.id===mailbox)?.email??"Mail";
 const qp=(extra:Record<string,string|undefined>)=>{const p=new URLSearchParams();p.set("mailbox",mailbox);p.set("folder",folder);if(folder==="INBOX")p.set("category",category);if(q)p.set("q",q);for(const[k,v]of Object.entries(extra)){if(v)p.set(k,v);else p.delete(k)}return `/app/mail?${p.toString()}`};

 if(activeThread&&activeState){return <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1726] text-slate-100">
  <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-white/[0.07] px-3"><Link href={qp({thread:undefined})}><Button size="sm" variant="ghost"><ArrowLeft className="h-4 w-4"/> Back</Button></Link>{activeState.isRead?<form action={markMailThreadUnread.bind(null,activeThread.id,folder)}><Button size="sm" variant="outline">Mark unread</Button></form>:<form action={markMailThreadRead.bind(null,activeThread.id,folder)}><Button size="sm" variant="outline">Mark read</Button></form>}<form action={toggleMailThreadStar.bind(null,activeThread.id,folder)}><Button size="sm" variant="outline">{activeState.starred?"Unstar":"Star"}</Button></form>{!activeState.archived&&!activeState.trashed?<form action={archiveMailThread.bind(null,activeThread.id)}><Button size="sm" variant="outline">Archive</Button></form>:null}{!activeState.trashed?<form action={trashMailThread.bind(null,activeThread.id)}><Button size="sm" variant="outline">Trash</Button></form>:<form action={restoreMailThread.bind(null,activeThread.id,"INBOX")}><Button size="sm" variant="outline">Restore</Button></form>}{!activeState.trashed?<form action={snoozeMailThread.bind(null,activeThread.id)} className="flex gap-1"><input type="hidden" name="hours" value="24"/><Button size="sm" variant="outline">JUN Snooze</Button></form>:null}<div className="ml-auto text-xs text-slate-500">{mailboxLabel}</div></div>
  <div className="px-4 py-5 md:px-7"><h1 className="mb-5 text-xl font-medium text-white md:text-2xl">{activeThread.subject||"(no subject)"}</h1>{conversation.length?<div className="space-y-5">{conversation.map((m,i)=><article key={m.id} className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#101c2d]"><div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-4 py-3"><div><p className="font-semibold text-slate-100">{senderLabel(m.from)} <span className="font-normal text-slate-500">&lt;{senderEmail(m.from)}&gt;</span></p><p className="mt-1 text-xs text-slate-500">to {m.to.join(", ")||"me"}</p></div><span className="text-xs text-slate-500">{m.date.toLocaleString()}</span></div><div className="bg-white p-2 text-slate-900 md:p-4">{m.htmlBody?<EmailHtmlFrame html={m.htmlBody} title={m.subject}/>:<div className="mx-auto max-w-5xl whitespace-pre-wrap break-words text-[15px] leading-7">{m.body||m.snippet||"No readable body."}</div>}</div>{i===conversation.length-1?<div className="flex flex-wrap gap-2 border-t border-white/[0.07] px-4 py-3"><Link href={`/app/mail/compose?mailbox=${activeThread.mailAccountId}&source=${activeThread.id}&mode=REPLY`}><Button variant="outline">Reply</Button></Link><Link href={`/app/mail/compose?mailbox=${activeThread.mailAccountId}&source=${activeThread.id}&mode=REPLY_ALL`}><Button variant="outline">Reply all</Button></Link><Link href={`/app/mail/compose?mailbox=${activeThread.mailAccountId}&source=${activeThread.id}&mode=FORWARD`}><Button variant="outline">Forward</Button></Link></div>:null}</article>)}</div>:<div className="py-10 text-sm text-slate-500">Conversation could not be loaded.</div>}</div>
 </div>}

 return <div className="grid min-h-[68vh] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1726] text-slate-200 lg:grid-cols-[190px_minmax(0,1fr)]">
  <aside className="border-r border-white/[0.07] bg-[#0b1422] p-3">{canDraft&&accounts.length?<Link href={`/app/mail/compose?mailbox=${mailbox==="ALL"?(accounts[0]?.id||""):mailbox}`}><Button className="mb-4 w-full justify-start rounded-2xl py-5">Compose</Button></Link>:null}<nav className="space-y-1">{FOLDERS.map(f=><Link key={f.key} href={`/app/mail?mailbox=${encodeURIComponent(mailbox)}&folder=${f.key}${f.key==="INBOX"?"&category=PRIMARY":""}`} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${folder===f.key?"bg-blue-500/15 font-semibold text-blue-300 ring-1 ring-blue-400/15":"text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"}`}><span className="flex items-center gap-2"><f.icon className="h-4 w-4"/>{f.label}</span>{f.key==="INBOX"?<span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">{inboxUnread}</span>:null}</Link>)}</nav></aside>
  <section className="min-w-0 bg-[#0f1929]"><div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-white/[0.07] px-3">{accounts.length?(mailbox==="ALL"?<form action={syncAllMailboxesV2}><Button size="sm" variant="outline"><RefreshCw className="h-4 w-4"/> Sync 20</Button></form>:<form action={syncMailboxV2.bind(null,mailbox)}><Button size="sm" variant="outline"><RefreshCw className="h-4 w-4"/> Sync 20</Button></form>):null}<form className="flex min-w-[220px] flex-1 items-center gap-2"><input type="hidden" name="mailbox" value={mailbox}/><input type="hidden" name="folder" value={folder}/>{folder==="INBOX"?<input type="hidden" name="category" value={category}/>:null}<div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><Input name="q" defaultValue={searchParams.q} placeholder="Search these 20 emails" className="h-9 rounded-full border-white/[0.08] bg-white/[0.05] pl-9 text-slate-100 placeholder:text-slate-600"/></div></form>{accounts.length>1?<form className="flex gap-2"><Select name="mailbox" defaultValue={mailbox} className="h-9 w-44"><option value="ALL">All mailboxes</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.displayName||a.email}</option>)}</Select><Button size="sm" variant="outline">Open</Button></form>:null}</div>
  {folder==="INBOX"?<div className="grid grid-cols-2 border-b border-white/[0.07] md:grid-cols-4">{CATEGORIES.map(c=><Link key={c.key} href={`/app/mail?mailbox=${encodeURIComponent(mailbox)}&folder=INBOX&category=${c.key}`} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition ${category===c.key?"border-blue-500 bg-blue-500/[0.05] font-semibold text-blue-300":"border-transparent text-slate-500 hover:bg-white/[0.035] hover:text-slate-200"}`}><c.icon className="h-4 w-4"/>{c.label}</Link>)}</div>:null}
  <div className="border-b border-white/[0.07] px-4 py-2 text-xs text-slate-500">Showing maximum {LIMIT} most recent conversations · {mailboxLabel}</div>
  <div>{threads.length?threads.map(t=>{const s=stateMap.get(t.id)!;return <div key={t.id} className={`grid grid-cols-[32px_150px_minmax(0,1fr)_90px] items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-sm transition hover:bg-white/[0.055] ${s.isRead?"bg-[#0f1929] text-slate-300":"bg-blue-500/[0.07] font-semibold text-slate-100"}`}><form action={toggleMailThreadStar.bind(null,t.id,folder)}><button type="submit" className="rounded-md p-1 hover:bg-white/[0.06]" title={s.starred?"Unstar":"Star"}><Star className={`h-4 w-4 ${s.starred?"fill-amber-400 text-amber-500":"text-slate-600"}`}/></button></form><Link href={qp({thread:t.id})} className="truncate">{senderLabel(t.fromEmail)}</Link><Link href={qp({thread:t.id})} className="min-w-0 truncate"><span>{t.subject||"(no subject)"}</span><span className="font-normal text-slate-500"> — {t.snippet||""}</span></Link><Link href={qp({thread:t.id})} className="text-right text-xs text-slate-500">{shortDate(t.lastMessageAt)}</Link></div>}):<div className="py-16 text-center text-sm text-slate-500">No message in the current 20-email window. Click Sync 20.</div>}</div>
  </section>
 </div>;
}
