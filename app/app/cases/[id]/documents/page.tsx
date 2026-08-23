import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { FileText, FolderOpen, ShieldCheck, ExternalLink, Search, LockKeyhole } from "lucide-react";

export const dynamic = "force-dynamic";

const CATEGORIES = ["IDENTITY","PASSPORT","CONTRACT","PAYMENT_PROOF","RECEIPT","REFUND","VISA","FLIGHT","INVOICE","COMPANY","LEGAL","TAX","EMPLOYEE","VENDOR","OTHER"];
const CONFIDENTIAL = new Set(["IDENTITY","PASSPORT","VISA"]);
const PUBLIC_DISABLED_PREFIX = "drive.public.disabled.";
const PUBLIC_TOKEN_PREFIX = "drive.public.token.";
const PUBLIC_EXPIRES_PREFIX = "drive.public.expires.";

export default async function CaseDocumentsPage({params,searchParams}:{params:Promise<{id:string}>|{id:string};searchParams:{q?:string;category?:string}}){
 const user=await requireUser();if(!can(user,"CASE_READ"))redirect("/app/forbidden");
 const {id}=await Promise.resolve(params);const q=(searchParams.q||"").trim();const category=CATEGORIES.includes(String(searchParams.category||""))?String(searchParams.category):"";
 const c=await prisma.case.findUnique({where:{id},include:{client:true,_count:{select:{documents:true,files:true}}}});if(!c)notFound();
 const [documents,files]=await Promise.all([
  prisma.document.findMany({where:{caseId:id,...(q?{OR:[{title:{contains:q,mode:"insensitive"}},{documentId:{contains:q,mode:"insensitive"}}]}:{})},orderBy:{updatedAt:"desc"},take:200}),
  prisma.file.findMany({where:{caseId:id,archivedAt:null,isVault:false,...(category?{category:category as never}:{}),...(q?{name:{contains:q,mode:"insensitive"}}:{})},orderBy:{createdAt:"desc"},take:250,include:{uploadedBy:{select:{firstName:true,lastName:true}}}})
 ]);
 const fileIds=files.map(f=>f.id);
 const settings=fileIds.length?await prisma.appSetting.findMany({where:{OR:[{key:{startsWith:PUBLIC_DISABLED_PREFIX}},{key:{startsWith:PUBLIC_TOKEN_PREFIX}},{key:{startsWith:PUBLIC_EXPIRES_PREFIX}}]},select:{key:true,value:true}}):[];
 const disabled=new Set<string>(),tokens=new Map<string,string>(),expires=new Map<string,string>();
 for(const s of settings){if(s.key.startsWith(PUBLIC_DISABLED_PREFIX))disabled.add(s.key.slice(PUBLIC_DISABLED_PREFIX.length));else if(s.key.startsWith(PUBLIC_TOKEN_PREFIX))tokens.set(s.key.slice(PUBLIC_TOKEN_PREFIX.length),s.value);else if(s.key.startsWith(PUBLIC_EXPIRES_PREFIX))expires.set(s.key.slice(PUBLIC_EXPIRES_PREFIX.length),s.value);}
 const categoryCounts=new Map<string,number>();for(const f of files)categoryCounts.set(f.category,(categoryCounts.get(f.category)||0)+1);
 const publicCount=files.filter(f=>!disabled.has(f.id)).length;const confidentialCount=files.filter(f=>CONFIDENTIAL.has(f.category)).length;
 const base=(process.env.NEXT_PUBLIC_APP_URL||"https://www.juncreatif.org").replace(/\/$/,"");
 const publicUrl=(fileId:string)=>{const key=tokens.get(fileId);return `${base}/view/file/${fileId}${key?`?key=${encodeURIComponent(key)}`:""}`;};
 return <div className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/app/cases/${id}/dashboard`} className="text-sm text-muted2 hover:text-electric">← Case 360</Link><div className="mt-2 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">Documents & Drive</h1><StatusBadge status={c.status}/></div><p className="mt-1 text-sm text-muted2">{c.caseNumber} · {c.title} · {c.client.firstName} {c.client.lastName}</p></div><div className="flex flex-wrap gap-2">{can(user,"DOCUMENT_CREATE")?<Link href={`/app/documents/new?caseId=${id}&clientId=${c.clientId}`}><Button variant="primary">New document</Button></Link>:null}{can(user,"FILE_UPLOAD")?<Link href={`/app/drive?q=${encodeURIComponent(c.caseNumber)}`}><Button variant="outline">Open Drive</Button></Link>:null}</div></div>

  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={FileText} label="Official documents" value={String(c._count.documents)} sub={`${documents.filter(d=>d.status==="FINAL"||d.status==="SIGNED").length} final/signed`}/><Metric icon={FolderOpen} label="Drive files" value={String(c._count.files)} sub={`${files.length} active in this view`}/><Metric icon={ShieldCheck} label="Publicly accessible" value={String(publicCount)} sub="Secure JUN public viewer"/><Metric icon={LockKeyhole} label="Confidential" value={String(confidentialCount)} sub="Identity / passport / visa"/></div>

  <Card><CardHeader><div><CardTitle>Find case records</CardTitle><p className="mt-1 text-xs text-muted2">Search only inside this Case. Client files from other services are excluded.</p></div></CardHeader><CardContent><form className="flex flex-wrap gap-2"><div className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted2"/><Input name="q" defaultValue={q} placeholder="Search document ID or filename…" className="pl-9"/></div><Select name="category" defaultValue={category} className="w-52"><option value="">All file categories</option>{CATEGORIES.map(cat=><option key={cat} value={cat}>{cat.replaceAll("_"," ")}</option>)}</Select><Button variant="outline">Filter</Button></form></CardContent></Card>

  {categoryCounts.size?<Card><CardHeader><CardTitle>File categories</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{[...categoryCounts.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([cat,count])=><Link key={cat} href={`/app/cases/${id}/documents?category=${cat}`}><Badge className="bg-surface text-ink">{cat.replaceAll("_"," ")} · {count}</Badge></Link>)}</CardContent></Card>:null}

  <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
   <Card><CardHeader><div><CardTitle>Official documents</CardTitle><p className="mt-1 text-xs text-muted2">Documents generated and versioned by JUN Business Hub.</p></div></CardHeader><CardContent className="p-0">{documents.length?<ul className="divide-y divide-line">{documents.map(d=><li key={d.id} className="flex items-center justify-between gap-3 px-5 py-4"><div><Link href={`/app/documents/${d.id}`} className="font-medium hover:text-electric">{d.title}</Link><p className="registry-id mt-1 text-xs text-muted2">{d.documentId} · {d.type.replaceAll("_"," ")} · updated {formatDate(d.updatedAt)}</p></div><div className="flex items-center gap-2"><StatusBadge status={d.status}/><Link href={`/app/documents/${d.id}`} className="text-xs text-electric">Open</Link></div></li>)}</ul>:<p className="p-5 text-sm text-muted2">No official document on this Case.</p>}</CardContent></Card>

   <Card><CardHeader><div><CardTitle>Drive files</CardTitle><p className="mt-1 text-xs text-muted2">Uploaded evidence and supporting records linked to this Case.</p></div></CardHeader><CardContent className="p-0">{files.length?<ul className="divide-y divide-line">{files.map(f=>{const isConf=CONFIDENTIAL.has(f.category);const isDisabled=disabled.has(f.id);const exp=expires.get(f.id);const expired=Boolean(exp&&!Number.isNaN(new Date(exp).getTime())&&new Date(exp).getTime()<=Date.now());const available=!isDisabled&&!expired;return <li key={f.id} className="px-5 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{f.name}</p>{isConf?<Badge className="bg-amber-100 text-amber-800">CONFIDENTIAL</Badge>:null}{available?<Badge className="bg-emerald-100 text-emerald-800">PUBLIC LINK READY</Badge>:<Badge className="bg-surface text-muted2">PRIVATE</Badge>}</div><p className="mt-1 text-xs text-muted2">{f.category.replaceAll("_"," ")} · uploaded {formatDate(f.createdAt)} by {f.uploadedBy.firstName} {f.uploadedBy.lastName}</p>{exp?<p className="mt-1 text-xs text-muted2">Public access expiry: {formatDate(new Date(exp))}</p>:null}</div><div className="flex gap-2"><a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer"><Button variant="outline">Open</Button></a>{available?<a href={publicUrl(f.id)} target="_blank" rel="noreferrer"><Button variant="outline"><ExternalLink className="h-4 w-4"/>Public view</Button></a>:null}</div></div></li>})}</ul>:<p className="p-5 text-sm text-muted2">No Drive file matches this filter.</p>}</CardContent></Card>
  </div>

  <Card><CardHeader><CardTitle>Document security rules</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2"><Rule title="Case isolation" text="This page only displays records linked to this Case, even when the client has several services."/><Rule title="Confidential records" text="Identity, passport and visa files are visibly classified as confidential and should not be shared casually."/><Rule title="Secure external access" text="When public access is enabled, the document opens through JUN's controlled public viewer and uses its configured access key/expiry."/><Rule title="Single source of truth" text="Files remain stored once in JUN Drive; Case Documents is a filtered operational view, not a duplicate copy."/></CardContent></Card>
 </div>;
}

function Metric({icon:Icon,label,value,sub}:{icon:any;label:string;value:string;sub:string}){return <Card><CardContent className="p-4"><Icon className="h-4 w-4 text-electric"/><p className="mt-3 text-xs text-muted2">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted2">{sub}</p></CardContent></Card>}
function Rule({title,text}:{title:string;text:string}){return <div className="rounded-lg border border-line p-3"><p className="font-medium">{title}</p><p className="mt-1 text-xs text-muted2">{text}</p></div>}
