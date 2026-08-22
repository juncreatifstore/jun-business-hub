import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/services/files";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { formatDate, formatDateTime } from "@/lib/utils";
import { FileText, FolderOpen, UploadCloud, ShieldCheck, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const FILE_CATEGORIES = ["IDENTITY","PASSPORT","CONTRACT","PAYMENT_PROOF","RECEIPT","REFUND","VISA","FLIGHT","INVOICE","LEGAL","OTHER"];
const CORE_CATEGORIES = ["IDENTITY","PASSPORT"];

function bytes(value:number){if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/1024/1024).toFixed(1)} MB`;}

export default async function ClientDocumentsPage({params}:{params:Promise<{id:string}>|{id:string}}){
  const user=await requirePermission("CLIENT_READ");
  const {id}=await Promise.resolve(params);
  const client=await prisma.client.findUnique({
    where:{id},
    include:{
      cases:{orderBy:{createdAt:"desc"},select:{id:true,caseNumber:true,title:true,status:true}},
      documents:{orderBy:{updatedAt:"desc"},include:{case:{select:{id:true,caseNumber:true,title:true}}}},
      files:{where:{isVault:false,archivedAt:null},orderBy:{createdAt:"desc"},include:{case:{select:{id:true,caseNumber:true,title:true}},uploadedBy:{select:{firstName:true,lastName:true}}}},
    }
  });
  if(!client)notFound();

  const filesByCategory=new Map<string,number>();
  for(const f of client.files)filesByCategory.set(f.category,(filesByCategory.get(f.category)||0)+1);
  const missingCore=CORE_CATEGORIES.filter((c)=>!filesByCategory.get(c));
  const signedDocs=client.documents.filter((d)=>d.status==="SIGNED").length;
  const finalDocs=client.documents.filter((d)=>["FINAL","SIGNED"].includes(d.status)).length;
  const linkedFiles=client.files.filter((f)=>Boolean(f.caseId)).length;
  const unlinkedFiles=client.files.filter((f)=>!f.caseId).length;
  const activeCases=client.cases.filter((c)=>!["ARCHIVED","CANCELLED"].includes(c.status));

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><Link href={`/app/clients/${client.id}/dashboard`} className="text-sm text-muted2 hover:text-electric">← Client 360</Link><h1 className="mt-2 text-2xl font-semibold">{client.firstName} {client.lastName} · Documents & Drive</h1><p className="registry-id mt-1 text-muted2">{client.internalId} · official documents, identity files, proofs, travel documents and case attachments</p></div>
      <div className="flex flex-wrap gap-2"><Link href={`/app/clients/${client.id}/dashboard`}><Button variant="outline">Client 360</Button></Link><Link href={`/app/clients/${client.id}/services`}><Button variant="outline">Services & Cases</Button></Link><Link href={`/app/drive?q=${encodeURIComponent(client.lastName)}`}><Button variant="outline">Open Drive</Button></Link>{can(user,"DOCUMENT_CREATE")?<Link href={`/app/documents/new?clientId=${client.id}`}><Button variant="primary">New document</Button></Link>:null}</div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={FileText} label="Official documents" value={String(client.documents.length)} hint={`${finalDocs} final/signed`}/>
      <Metric icon={ShieldCheck} label="Signed" value={String(signedDocs)} hint="Documents with signed status"/>
      <Metric icon={FolderOpen} label="Drive files" value={String(client.files.length)} hint={`${linkedFiles} linked to a case`}/>
      <Metric icon={FolderOpen} label="Unlinked files" value={String(unlinkedFiles)} hint="Review and attach to the correct service"/>
      <Metric icon={AlertTriangle} label="Core file gaps" value={String(missingCore.length)} hint={missingCore.length?missingCore.join(" · "):"Identity basics present"}/>
    </div>

    {missingCore.length?<Card className="border-amber-200 bg-amber-50/60"><CardHeader><CardTitle>Client file attention</CardTitle></CardHeader><CardContent className="text-sm">Missing important category: <strong>{missingCore.join(", ")}</strong>. Upload the available identity document so the client file remains complete and searchable.</CardContent></Card>:null}

    {can(user,"FILE_UPLOAD")?<Card><CardHeader><CardTitle>Upload to this client</CardTitle></CardHeader><CardContent><form action={uploadFile} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><input type="hidden" name="isVault" value="0"/><input type="hidden" name="clientId" value={client.id}/><Field label="File"><Input type="file" name="file" required/></Field><Field label="Category"><Select name="category" defaultValue="OTHER">{FILE_CATEGORIES.map((c)=><option key={c} value={c}>{c.replaceAll("_"," ")}</option>)}</Select></Field><Field label="Service / Case"><Select name="caseId" defaultValue=""><option value="">— Client general file —</option>{activeCases.map((c)=><option key={c.id} value={c.id}>{c.caseNumber} · {c.title}</option>)}</Select></Field><div className="md:col-span-2 xl:col-span-2 flex items-end"><Button type="submit" variant="primary"><UploadCloud className="h-4 w-4"/>Upload & link to client</Button></div></form><p className="mt-3 text-xs text-muted2">Use a Case whenever the file belongs to a specific ticket, visa, hotel, refund or other service. General identity documents can remain at client level.</p></CardContent></Card>:null}

    <Card><CardHeader><div><CardTitle>File categories</CardTitle><p className="mt-1 text-xs text-muted2">Quick inventory of the client Drive file.</p></div></CardHeader><CardContent><div className="flex flex-wrap gap-2">{FILE_CATEGORIES.map((cat)=>{const count=filesByCategory.get(cat)||0;return <Link key={cat} href={`/app/drive?category=${cat}&q=${encodeURIComponent(client.lastName)}`}><Badge className={count?"border border-emerald-200 bg-emerald-50 text-emerald-800":"border border-line bg-surface text-muted2"}>{cat.replaceAll("_"," ")} · {count}</Badge></Link>})}</div></CardContent></Card>

    <Card><CardHeader><div><CardTitle>Official JUN documents</CardTitle><p className="mt-1 text-xs text-muted2">Contracts, agreements, invoices, letters and other registry documents.</p></div>{can(user,"DOCUMENT_CREATE")?<Link href={`/app/documents/new?clientId=${client.id}`} className="text-sm font-medium text-electric hover:underline">Create document</Link>:null}</CardHeader><CardContent className="p-0">{client.documents.length?<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted2"><tr><th className="p-3">Document</th><th className="p-3">Type</th><th className="p-3">Case</th><th className="p-3">Status</th><th className="p-3">Updated</th></tr></thead><tbody>{client.documents.map((d)=><tr key={d.id} className="border-t border-line"><td className="p-3"><Link href={`/app/documents/${d.id}`} className="font-medium hover:text-electric">{d.title}</Link><div className="registry-id mt-1 text-xs text-muted2">{d.documentId}</div></td><td className="p-3">{d.type.replaceAll("_"," ")}</td><td className="p-3">{d.case?<Link href={`/app/cases/${d.case.id}`} className="text-electric hover:underline">{d.case.caseNumber}</Link>:<span className="text-muted2">Client level</span>}</td><td className="p-3"><StatusBadge status={d.status}/></td><td className="p-3 text-muted2">{formatDateTime(d.updatedAt)}</td></tr>)}</tbody></table></div>:<p className="p-5 text-sm text-muted2">No official document linked to this client yet.</p>}</CardContent></Card>

    <Card><CardHeader><div><CardTitle>Drive files</CardTitle><p className="mt-1 text-xs text-muted2">Uploaded evidence and operational files stored in JUN Drive.</p></div><Link href="/app/drive" className="text-sm font-medium text-electric hover:underline">Open full Drive</Link></CardHeader><CardContent className="p-0">{client.files.length?<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted2"><tr><th className="p-3">File</th><th className="p-3">Category</th><th className="p-3">Service / Case</th><th className="p-3">Size</th><th className="p-3">Uploaded</th><th className="p-3">Action</th></tr></thead><tbody>{client.files.map((f)=><tr key={f.id} className="border-t border-line"><td className="p-3"><div className="font-medium">{f.name}</div><div className="mt-1 text-xs text-muted2">{f.mimeType}</div></td><td className="p-3"><Badge className="border border-line bg-surface text-muted2">{f.category.replaceAll("_"," ")}</Badge></td><td className="p-3">{f.case?<Link href={`/app/cases/${f.case.id}`} className="text-electric hover:underline">{f.case.caseNumber} · {f.case.title}</Link>:<span className="text-amber-700">Client general file</span>}</td><td className="p-3 text-muted2">{bytes(f.sizeBytes)}</td><td className="p-3"><div>{formatDate(f.createdAt)}</div><div className="text-xs text-muted2">{f.uploadedBy.firstName} {f.uploadedBy.lastName}</div></td><td className="p-3"><Link href={`/app/drive?q=${encodeURIComponent(f.name)}`} className="text-electric hover:underline">Find in Drive</Link></td></tr>)}</tbody></table></div>:<p className="p-5 text-sm text-muted2">No Drive file linked to this client yet.</p>}</CardContent></Card>
  </div>;
}

function Metric({icon:Icon,label,value,hint}:{icon:typeof FileText;label:string;value:string;hint:string}){return <Card><CardContent className="p-4"><Icon className="mb-2 h-5 w-5 text-electric"/><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted2">{hint}</div></CardContent></Card>}
