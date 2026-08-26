import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWhatsAppConfig } from "@/lib/whatsapp";
import { sendClientWhatsApp } from "@/services/whatsapp";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

export const dynamic="force-dynamic";

export default async function ClientWhatsAppPage({params,searchParams}:{params:{id:string};searchParams:{message?:string;mode?:string;template?:string;language?:string}}){
 await requirePermission("CLIENT_READ");
 const [client,cfg]=await Promise.all([prisma.client.findUnique({where:{id:params.id},select:{id:true,internalId:true,firstName:true,lastName:true,whatsapp:true,phone:true}}),getWhatsAppConfig()]);
 if(!client)notFound();
 const action=sendClientWhatsApp.bind(null,client.id),number=client.whatsapp||client.phone||"";
 const prefilled=String(searchParams.message||"").slice(0,4096);
 const requestedMode=searchParams.mode==="TEXT"||searchParams.mode==="TEMPLATE"?searchParams.mode:null;
 const defaultMode=prefilled?"TEXT":(requestedMode??(!cfg.defaultTemplate?"TEXT":"TEMPLATE"));
 return <div className="max-w-4xl">
  <PageHeader title={`WhatsApp · ${client.firstName} ${client.lastName}`} subtitle={`${client.internalId} · Send official JUN notifications through Meta WhatsApp Cloud API.`}/>
  <div className="mb-5 flex gap-3"><Link href={`/app/clients/${client.id}`} className="text-sm text-electric hover:underline">← Client 360</Link><Link href="/app/settings/whatsapp" className="text-sm text-electric hover:underline">WhatsApp settings →</Link></div>
  <form action={action} className="space-y-5">
   <Card><CardHeader><CardTitle>Recipient</CardTitle></CardHeader><CardContent><Field label="WhatsApp number" hint="International format, including country code"><Input name="to" defaultValue={number} placeholder="+52..." required/></Field></CardContent></Card>
   <Card><CardHeader><CardTitle>Send mode</CardTitle></CardHeader><CardContent className="space-y-5">
    <Field label="Mode"><Select name="mode" defaultValue={defaultMode}><option value="TEXT">Free text — use inside an active 24-hour conversation</option><option value="TEMPLATE">Approved Meta template — required for most business-initiated messages outside 24 hours</option></Select></Field>
    <div className="grid gap-5 sm:grid-cols-2"><Field label="Approved template name"><Input name="template" defaultValue={searchParams.template||cfg.defaultTemplate} placeholder="Exact name from Meta WhatsApp Manager"/></Field><Field label="Template language"><Input name="language" defaultValue={searchParams.language||cfg.languageCode||"en_US"} placeholder="en_US, fr, es_MX..."/></Field></div>
    <Field label="Free-text message" hint="Used only when mode = Free text"><Textarea name="message" rows={7} defaultValue={prefilled} placeholder={`Bonjour ${client.firstName},\n\nVotre document JUN est maintenant disponible.`}/></Field>
    {prefilled?<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">A message is already prepared, so JUN automatically uses <strong>Free text</strong>. This works only while the client has an active 24-hour WhatsApp conversation window.</div>:null}
    {!cfg.defaultTemplate?<div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">No approved template is configured in JUN. To send notifications outside the 24-hour window, create or select an approved template in Meta WhatsApp Manager, then save its exact name and language in Settings → WhatsApp.</div>:null}
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Template names are specific to your WhatsApp Business Account. JUN never assumes a template exists.</div>
   </CardContent></Card>
   <Button type="submit" variant="primary" disabled={!cfg.tokenConfigured||!cfg.phoneNumberId}>Send on WhatsApp</Button>{!cfg.tokenConfigured||!cfg.phoneNumberId?<p className="mt-2 text-sm text-amber-600">Configure Meta WhatsApp first in Settings → WhatsApp.</p>:null}
  </form>
 </div>;
}
