import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { getWhatsAppConfig } from "@/lib/whatsapp";
import { saveWhatsAppSettings } from "@/services/whatsapp";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export const dynamic="force-dynamic";

export default async function WhatsAppSettingsPage(){
 const user=await requireUser();if(!can(user,"SETTINGS_MANAGE"))redirect("/app/forbidden");
 const cfg=await getWhatsAppConfig();
 return <div className="max-w-4xl">
  <PageHeader title="WhatsApp Business" subtitle="Connect JUN Business Hub to the official Meta WhatsApp Cloud API."/>
  <div className="mb-5"><Link href="/app/settings" className="text-sm text-electric hover:underline">← Back to Settings</Link></div>
  <form action={saveWhatsAppSettings} className="space-y-5">
   <Card><CardHeader><CardTitle>Meta connection</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">
    <Field label="Phone Number ID"><Input name="phoneNumberId" defaultValue={cfg.phoneNumberId} placeholder="Meta Phone Number ID" required/></Field>
    <Field label="WhatsApp Business Account ID"><Input name="businessAccountId" defaultValue={cfg.businessAccountId} placeholder="WABA ID"/></Field>
    <Field label="Connected phone"><Input name="displayPhone" defaultValue={cfg.displayPhone} placeholder="+52..."/></Field>
    <Field label="Graph API version"><Input name="graphVersion" defaultValue={cfg.graphVersion||"v23.0"}/></Field>
    <div className="sm:col-span-2"><Field label={cfg.tokenConfigured?"Access token — already configured (leave blank to keep it)":"Permanent access token"}><Input name="accessToken" type="password" placeholder={cfg.tokenConfigured?"••••••••••••":"Paste Meta permanent token"}/></Field><p className="mt-2 text-xs text-muted2">The token is encrypted before being stored. JUN never displays it again.</p></div>
   </CardContent></Card>
   <Card><CardHeader><CardTitle>Notification defaults</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">
    <Field label="Default approved template"><Input name="defaultTemplate" defaultValue={cfg.defaultTemplate} placeholder="document_ready"/></Field>
    <Field label="Template language code"><Input name="languageCode" defaultValue={cfg.languageCode||"fr"} placeholder="fr, en_US, es_MX..."/></Field>
    <p className="text-xs text-muted2 sm:col-span-2">For messages initiated by JUN outside the 24-hour customer service window, use an approved Meta template. Free-text messages are intended for an active 24-hour conversation window.</p>
   </CardContent></Card>
   <div className="flex items-center gap-3"><Button type="submit" variant="primary">Save WhatsApp connection</Button><span className={`text-sm ${cfg.tokenConfigured&&cfg.phoneNumberId?"text-emerald-600":"text-amber-600"}`}>{cfg.tokenConfigured&&cfg.phoneNumberId?"Configuration saved":"Configuration incomplete"}</span></div>
  </form>
 </div>;
}
