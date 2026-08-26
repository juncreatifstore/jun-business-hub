import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GENERAL_DOCUMENT_TEMPLATE, getWhatsAppConfig } from "@/lib/whatsapp";
import { sendClientWhatsApp, sendDocumentByWhatsApp } from "@/services/whatsapp";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

export const dynamic="force-dynamic";

export default async function ClientWhatsAppPage({params,searchParams}:{params:{id:string};searchParams:{message?:string;mode?:string;template?:string;language?:string}}){
 await requirePermission("CLIENT_READ");
 const [client,cfg,documents]=await Promise.all([
  prisma.client.findUnique({where:{id:params.id},select:{id:true,internalId:true,firstName:true,lastName:true,whatsapp:true,phone:true}}),
  getWhatsAppConfig(),
  prisma.document.findMany({
   where:{clientId:params.id,finalPdfKey:{not:null},status:{in:["FINAL","SIGNED"]}},
   orderBy:{updatedAt:"desc"},
   take:20,
   select:{id:true,documentId:true,title:true,type:true,status:true,updatedAt:true},
  }),
 ]);
 if(!client)notFound();
 const action=sendClientWhatsApp.bind(null,client.id),number=client.whatsapp||client.phone||"";
 const prefilled=String(searchParams.message||"").slice(0,4096);
 const requestedMode=searchParams.mode==="TEXT"||searchParams.mode==="TEMPLATE"?searchParams.mode:null;
 const defaultMode=prefilled?"TEXT":(requestedMode??(!cfg.defaultTemplate?"TEXT":"TEMPLATE"));
 const usesGeneralDocumentTemplate=cfg.defaultTemplate===GENERAL_DOCUMENT_TEMPLATE;
 return <div className="max-w-4xl">
  <PageHeader title={`WhatsApp · ${client.firstName} ${client.lastName}`} subtitle={`${client.internalId} · Send official JUN notifications through Meta WhatsApp Cloud API.`}/>
  <div className="mb-5 flex gap-3"><Link href={`/app/clients/${client.id}`} className="text-sm text-electric hover:underline">← Client 360</Link><Link href="/app/settings/whatsapp" className="text-sm text-electric hover:underline">WhatsApp settings →</Link></div>

  {usesGeneralDocumentTemplate?<Card className="mb-5"><CardHeader><CardTitle>Send a generated document</CardTitle></CardHeader><CardContent className="space-y-3">
   <p className="text-sm text-muted2">Choose a finalized PDF for this client. JUN will attach it to <strong>{GENERAL_DOCUMENT_TEMPLATE}</strong> and fill the client name, document type and reference automatically.</p>
   {documents.length?documents.map(doc=><div key={doc.id} className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
     <div className="font-medium">{doc.title}</div>
     <div className="mt-1 text-xs text-muted2">{doc.documentId} · {doc.type} · {doc.status}</div>
    </div>
    <form action={sendDocumentByWhatsApp.bind(null,doc.id)} className="flex items-center gap-2">
     <input type="hidden" name="to" value={number}/>
     <Button type="submit" variant="primary" disabled={!number||!cfg.tokenConfigured||!cfg.phoneNumberId}>Send by WhatsApp</Button>
    </form>
   </div>):<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No finalized PDF document is available for this client yet. Finalize a Receipt, Invoice, Statement or Official Document first.</div>}
  </CardContent></Card>:null}

  <form action={action} className="space-y-5">
   <Card><CardHeader><CardTitle>Recipient</CardTitle></CardHeader><CardContent><Field label="WhatsApp number" hint="International format, including country code"><Input name="to" defaultValue={number} placeholder="+52..." required/></Field></CardContent></Card>
   <Card><CardHeader><CardTitle>Send mode</CardTitle></CardHeader><CardContent className="space-y-5">
    <Field label="Mode"><Select name="mode" defaultValue={defaultMode}><option value="TEXT">Free text — use inside an active 24-hour conversation</option><option value="TEMPLATE">Approved Meta template — required for most business-initiated messages outside 24 hours</option></Select></Field>
    <div className="grid gap-5 sm:grid-cols-2"><Field label="Approved template name"><Input name="template" defaultValue={searchParams.template||cfg.defaultTemplate} placeholder="Exact name from Meta WhatsApp Manager"/></Field><Field label="Template language"><Input name="language" defaultValue={searchParams.language||cfg.languageCode||"en_US"} placeholder="en_US, fr, es_MX..."/></Field></div>
    <Field label="Free-text message" hint="Used only when mode = Free text"><Textarea name="message" rows={7} defaultValue={prefilled} placeholder={`Bonjour ${client.firstName},\n\nVotre document JUN est maintenant disponible.`}/></Field>
    {prefilled?<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">A message is already prepared, so JUN automatically uses <strong>Free text</strong>. This works only while the client has an active 24-hour WhatsApp conversation window.</div>:null}
    {usesGeneralDocumentTemplate?<div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><strong>{GENERAL_DOCUMENT_TEMPLATE}</strong> requires a PDF header. Use the document picker above for Receipt, Invoice, Statement and Official Document delivery.</div>:null}
    {!cfg.defaultTemplate?<div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">No approved template is configured in JUN. To send notifications outside the 24-hour window, create or select an approved template in Meta WhatsApp Manager, then save its exact name and language in Settings → WhatsApp.</div>:null}
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Template names are specific to your WhatsApp Business Account. JUN never assumes a template exists.</div>
   </CardContent></Card>
   <Button type="submit" variant="primary" disabled={!cfg.tokenConfigured||!cfg.phoneNumberId}>Send on WhatsApp</Button>{!cfg.tokenConfigured||!cfg.phoneNumberId?<p className="mt-2 text-sm text-amber-600">Configure Meta WhatsApp first in Settings → WhatsApp.</p>:null}
  </form>
 </div>;
}
