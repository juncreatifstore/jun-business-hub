import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWhatsAppConfig } from "@/lib/whatsapp";
import { sendDocumentByWhatsApp } from "@/services/whatsapp";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic="force-dynamic";

export default async function WhatsAppPage(){
 const user=await requireUser();if(!can(user,"CLIENT_READ"))redirect("/app/forbidden");
 const [cfg,clients,documents]=await Promise.all([
  getWhatsAppConfig(),
  prisma.client.findMany({where:{status:{not:"ARCHIVED"},OR:[{whatsapp:{not:null}},{phone:{not:null}}]},orderBy:{updatedAt:"desc"},take:100,select:{id:true,internalId:true,firstName:true,lastName:true,whatsapp:true,phone:true,country:true,status:true}}),
  prisma.document.findMany({where:{status:"FINAL",finalPdfKey:{not:null},clientId:{not:null}},orderBy:{updatedAt:"desc"},take:30,include:{client:true}}),
 ]);
 return <div className="space-y-6">
  <div>
   <PageHeader title="WhatsApp Notifications" subtitle="Send official JUN notifications and PDF documents through Meta WhatsApp Cloud API."/>
   <div className="mb-5 flex flex-wrap items-center gap-3"><Link href="/app/settings/whatsapp"><Button variant="outline">WhatsApp settings</Button></Link><span className={`text-sm ${cfg.tokenConfigured&&cfg.phoneNumberId?"text-emerald-600":"text-amber-600"}`}>{cfg.tokenConfigured&&cfg.phoneNumberId?`Connected${cfg.displayPhone?` · ${cfg.displayPhone}`:""}`:"Meta connection incomplete"}</span></div>
  </div>

  <Card>
   <CardHeader><CardTitle>Send official PDF documents</CardTitle></CardHeader>
   <CardContent className="space-y-3">
    <p className="text-sm text-muted2">JUN uploads the sealed PDF directly to Meta and sends it as a WhatsApp document. No public file link is required.</p>
    {documents.length?<div className="space-y-3">{documents.map(d=>{
      const to=d.client?.whatsapp||d.client?.phone||"";
      return <div key={d.id} className="rounded-xl border border-line p-4">
       <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="font-semibold">{d.title}</p><p className="registry-id text-xs text-muted2">{d.documentId} · {d.client?.firstName} {d.client?.lastName}</p><p className="mt-1 text-sm text-muted2">{to||"No WhatsApp number"}</p></div>
        {to?<form action={sendDocumentByWhatsApp.bind(null,d.id)} className="flex flex-col gap-2 sm:flex-row sm:items-center"><Input name="caption" defaultValue={`JUN CREATIF AND TRAVEL LLC — ${d.title}`} className="min-w-[280px]"/><Button type="submit" variant="primary">Send PDF</Button></form>:<Link href={`/app/clients/${d.clientId}/edit`}><Button variant="outline">Add WhatsApp number</Button></Link>}
       </div>
      </div>
    })}</div>:<p className="text-sm text-muted2">No finalized PDF document is ready to send yet.</p>}
   </CardContent>
  </Card>

  <div>
   <h2 className="mb-3 text-lg font-semibold">Send a notification to a client</h2>
   <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{clients.map(c=><Card key={c.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{c.firstName} {c.lastName}</p><p className="registry-id text-xs text-muted2">{c.internalId}</p><p className="mt-2 text-sm">{c.whatsapp||c.phone}</p>{c.country?<p className="text-xs text-muted2">{c.country}</p>:null}</div><Link href={`/app/clients/${c.id}/whatsapp`}><Button size="sm" variant="primary">Send</Button></Link></div></CardContent></Card>)}</div>
   {!clients.length?<div className="rounded-xl border border-line bg-white p-8 text-center text-sm text-muted2">No active client with a WhatsApp or phone number.</div>:null}
  </div>
 </div>;
}
