import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWhatsAppConfig } from "@/lib/whatsapp";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic="force-dynamic";

export default async function WhatsAppPage(){
 const user=await requireUser();if(!can(user,"CLIENT_READ"))redirect("/app/forbidden");
 const [cfg,clients]=await Promise.all([
  getWhatsAppConfig(),
  prisma.client.findMany({where:{status:{not:"ARCHIVED"},OR:[{whatsapp:{not:null}},{phone:{not:null}}]},orderBy:{updatedAt:"desc"},take:100,select:{id:true,internalId:true,firstName:true,lastName:true,whatsapp:true,phone:true,country:true,status:true}}),
 ]);
 return <div>
  <PageHeader title="WhatsApp Notifications" subtitle="Send official JUN notifications and document alerts through Meta WhatsApp Cloud API."/>
  <div className="mb-5 flex flex-wrap items-center gap-3"><Link href="/app/settings/whatsapp"><Button variant="outline">WhatsApp settings</Button></Link><span className={`text-sm ${cfg.tokenConfigured&&cfg.phoneNumberId?"text-emerald-600":"text-amber-600"}`}>{cfg.tokenConfigured&&cfg.phoneNumberId?`Connected${cfg.displayPhone?` · ${cfg.displayPhone}`:""}`:"Meta connection incomplete"}</span></div>
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{clients.map(c=><Card key={c.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{c.firstName} {c.lastName}</p><p className="registry-id text-xs text-muted2">{c.internalId}</p><p className="mt-2 text-sm">{c.whatsapp||c.phone}</p>{c.country?<p className="text-xs text-muted2">{c.country}</p>:null}</div><Link href={`/app/clients/${c.id}/whatsapp`}><Button size="sm" variant="primary">Send</Button></Link></div></CardContent></Card>)}</div>
  {!clients.length?<div className="rounded-xl border border-line bg-white p-8 text-center text-sm text-muted2">No active client with a WhatsApp or phone number.</div>:null}
 </div>;
}
