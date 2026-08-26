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

export default async function ClientWhatsAppPage({params}:{params:{id:string}}){
 await requirePermission("CLIENT_READ");
 const [client,cfg]=await Promise.all([prisma.client.findUnique({where:{id:params.id},select:{id:true,internalId:true,firstName:true,lastName:true,whatsapp:true,phone:true}}),getWhatsAppConfig()]);
 if(!client)notFound();
 const action=sendClientWhatsApp.bind(null,client.id),number=client.whatsapp||client.phone||"";
 return <div className="max-w-4xl">
  <PageHeader title={`WhatsApp · ${client.firstName} ${client.lastName}`} subtitle={`${client.internalId} · Send official JUN notifications through Meta WhatsApp Cloud API.`}/>
  <div className="mb-5 flex gap-3"><Link href={`/app/clients/${client.id}`} className="text-sm text-electric hover:underline">← Client 360</Link><Link href="/app/settings/whatsapp" className="text-sm text-electric hover:underline">WhatsApp settings →</Link></div>
  <form action={action} className="space-y-5">
   <Card><CardHeader><CardTitle>Recipient</CardTitle></CardHeader><CardContent><Field label="WhatsApp number" hint="International format, including country code"><Input name="to" defaultValue={number} placeholder="+52..." required/></Field></CardContent></Card>
   <Card><CardHeader><CardTitle>Send mode</CardTitle></CardHeader><CardContent className="space-y-5">
    <Field label="Mode"><Select name="mode" defaultValue="TEMPLATE"><option value="TEMPLATE">Approved Meta template — recommended for notifications</option><option value="TEXT">Free text — only inside active 24-hour window</option></Select></Field>
    <div className="grid gap-5 sm:grid-cols-2"><Field label="Template name"><Input name="template" defaultValue={cfg.defaultTemplate} placeholder="document_ready"/></Field><Field label="Language"><Input name="language" defaultValue={cfg.languageCode||"fr"}/></Field></div>
    <Field label="Free-text message" hint="Used only when mode = Free text"><Textarea name="message" rows={7} placeholder={`Bonjour ${client.firstName},\n\nVotre document JUN est maintenant disponible.`}/></Field>
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Meta requires approved templates for most business-initiated notifications outside the 24-hour customer service window. If a free-text send is rejected, use an approved template.</div>
   </CardContent></Card>
   <Button type="submit" variant="primary" disabled={!cfg.tokenConfigured||!cfg.phoneNumberId}>Send on WhatsApp</Button>{!cfg.tokenConfigured||!cfg.phoneNumberId?<p className="mt-2 text-sm text-amber-600">Configure Meta WhatsApp first in Settings → WhatsApp.</p>:null}
  </form>
 </div>;
}
