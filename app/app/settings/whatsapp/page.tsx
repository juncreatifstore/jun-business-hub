import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GENERAL_DOCUMENT_TEMPLATE, getWhatsAppConfig } from "@/lib/whatsapp";
import { getWhatsAppWabaSubscriptionStatus } from "@/lib/whatsapp-waba-subscription";
import { getWhatsAppPhoneWabaMatch } from "@/lib/whatsapp-phone-waba-match";
import { saveWhatsAppSettings } from "@/services/whatsapp";
import { subscribeWhatsAppAppToWaba } from "@/services/whatsapp-waba-subscription";
import { testWhatsAppWebhookLocally } from "@/services/whatsapp-webhook-test";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export const dynamic="force-dynamic";

export default async function WhatsAppSettingsPage(){
 const user=await requireUser();if(!can(user,"SETTINGS_MANAGE"))redirect("/app/forbidden");
 const [cfg,subscription,phoneWabaMatch,heartbeatRow,localTestRow]=await Promise.all([
  getWhatsAppConfig(),
  getWhatsAppWabaSubscriptionStatus(),
  getWhatsAppPhoneWabaMatch(),
  prisma.appSetting.findUnique({where:{key:"whatsapp.webhook.last_event"},select:{value:true}}),
  prisma.appSetting.findUnique({where:{key:"whatsapp.webhook.last_local_test"},select:{value:true}}),
 ]);
 let heartbeat:{receivedAt?:string;messages?:number;statuses?:number;entries?:number}|null=null;
 let localTest:{testedAt?:string;ok?:boolean;phone?:string;messageId?:string;httpStatus?:number}|null=null;
 try{heartbeat=heartbeatRow?.value?JSON.parse(heartbeatRow.value):null}catch{heartbeat=null}
 try{localTest=localTestRow?.value?JSON.parse(localTestRow.value):null}catch{localTest=null}
 return <div className="max-w-6xl">
  <PageHeader title="WhatsApp Business" subtitle="Connect JUN Business Hub to the official Meta WhatsApp Cloud API."/>
  <div className="mb-5"><Link href="/app/settings" className="text-sm text-electric hover:underline">← Back to Settings</Link></div>

  <Card className="mb-5"><CardHeader><CardTitle>Incoming messages diagnostic</CardTitle></CardHeader><CardContent className="space-y-4">
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <div className={`rounded-xl border p-4 ${subscription.ok&&subscription.subscribedApps.length?"border-emerald-200 bg-emerald-50":"border-amber-200 bg-amber-50"}`}>
     <div className="text-xs font-semibold uppercase tracking-wide">WABA app subscription</div>
     <div className="mt-1 text-sm font-medium">{!subscription.configured?"Configuration incomplete":subscription.ok&&subscription.subscribedApps.length?`Subscribed · ${subscription.subscribedApps.length} app${subscription.subscribedApps.length===1?"":"s"}`:subscription.ok?"No subscribed app detected":"Unable to verify"}</div>
     {subscription.error?<div className="mt-2 break-words text-xs text-red-700">{subscription.error}</div>:null}
     {subscription.subscribedApps.length?<div className="mt-2 text-xs text-muted2">{subscription.subscribedApps.map(a=>a.name||a.id||"Meta app").join(" · ")}</div>:null}
    </div>
    <div className={`rounded-xl border p-4 ${subscription.appMatch===true?"border-emerald-200 bg-emerald-50":subscription.appMatch===false?"border-red-200 bg-red-50":"border-amber-200 bg-amber-50"}`}>
     <div className="text-xs font-semibold uppercase tracking-wide">Meta App ID ↔ subscribed app</div>
     <div className={`mt-1 text-sm font-semibold ${subscription.appMatch===true?"text-emerald-800":subscription.appMatch===false?"text-red-800":"text-amber-800"}`}>{subscription.appMatch===true?"MATCH":subscription.appMatch===false?"MISMATCH":"APP ID REQUIRED"}</div>
     {subscription.expectedAppId?<div className="mt-2 text-xs text-muted2">Configured App ID: {subscription.expectedAppId}</div>:<div className="mt-2 text-xs text-amber-800">Enter the Meta App ID below, save, then reload this page.</div>}
     {subscription.matchedApp?<div className="mt-1 text-xs text-muted2">{subscription.matchedApp.name||"Meta app"}</div>:null}
    </div>
    <div className={`rounded-xl border p-4 ${phoneWabaMatch.ok&&phoneWabaMatch.match?"border-emerald-200 bg-emerald-50":phoneWabaMatch.configured?"border-red-200 bg-red-50":"border-amber-200 bg-amber-50"}`}>
     <div className="text-xs font-semibold uppercase tracking-wide">Phone Number ID ↔ WABA</div>
     <div className={`mt-1 text-sm font-semibold ${phoneWabaMatch.ok&&phoneWabaMatch.match?"text-emerald-800":phoneWabaMatch.configured?"text-red-800":"text-amber-800"}`}>{!phoneWabaMatch.configured?"Configuration incomplete":phoneWabaMatch.ok&&phoneWabaMatch.match?"MATCH":"MISMATCH"}</div>
     {phoneWabaMatch.match&&phoneWabaMatch.displayPhone?<div className="mt-2 text-xs text-muted2">{phoneWabaMatch.displayPhone}{phoneWabaMatch.verifiedName?` · ${phoneWabaMatch.verifiedName}`:""}</div>:null}
     {phoneWabaMatch.error?<div className="mt-2 break-words text-xs text-red-700">{phoneWabaMatch.error}</div>:null}
    </div>
    <div className={`rounded-xl border p-4 ${heartbeat?.receivedAt?"border-emerald-200 bg-emerald-50":"border-amber-200 bg-amber-50"}`}>
     <div className="text-xs font-semibold uppercase tracking-wide">Last webhook received by JUN</div>
     <div className="mt-1 text-sm font-medium">{heartbeat?.receivedAt?new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"medium"}).format(new Date(heartbeat.receivedAt)):"No webhook received yet"}</div>
     {heartbeat?.receivedAt?<div className="mt-2 text-xs text-muted2">Messages: {heartbeat.messages||0} · Statuses: {heartbeat.statuses||0} · Entries: {heartbeat.entries||0}</div>:<div className="mt-2 text-xs text-amber-800">If a client replies and this stays empty, Meta is not delivering events to JUN.</div>}
    </div>
   </div>
   <div className={`rounded-xl border p-4 ${localTest?.ok?"border-emerald-200 bg-emerald-50":"border-blue-200 bg-blue-50"}`}>
    <div className="text-xs font-semibold uppercase tracking-wide">End-to-end JUN webhook test</div>
    <div className="mt-1 text-sm font-medium">{localTest?.testedAt?(localTest.ok?"PASS — webhook → database → Inbox works":"FAIL — test did not reach the Inbox"):"Not tested yet"}</div>
    {localTest?.testedAt?<div className="mt-2 text-xs text-muted2">{new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"medium"}).format(new Date(localTest.testedAt))} · HTTP {localTest.httpStatus||"—"}{localTest.phone?` · +${localTest.phone}`:""}</div>:<div className="mt-2 text-xs text-blue-900">This test sends a simulated Meta payload through JUN&apos;s public webhook URL and verifies that it appears in the WhatsApp Inbox.</div>}
   </div>
   <div className="flex flex-wrap gap-2">
    <form action={subscribeWhatsAppAppToWaba}><Button type="submit" variant="outline">Subscribe Meta app to WABA</Button></form>
    <form action={testWhatsAppWebhookLocally}><Button type="submit" variant="primary">Test Webhook locally</Button></form>
   </div>
   <p className="text-xs text-muted2">For real incoming replies, the configured Meta App ID must match one of the apps returned by the WABA subscription, the Phone Number ID must belong to the same WABA, and a real client reply must update “Last webhook received by JUN”.</p>
  </CardContent></Card>

  <form action={saveWhatsAppSettings} className="space-y-5">
   <Card><CardHeader><CardTitle>Meta connection</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">
    <Field label="Meta App ID"><Input name="appId" defaultValue={cfg.appId} placeholder="Meta application ID"/></Field>
    <Field label="Phone Number ID"><Input name="phoneNumberId" defaultValue={cfg.phoneNumberId} placeholder="Meta Phone Number ID" required/></Field>
    <Field label="WhatsApp Business Account ID"><Input name="businessAccountId" defaultValue={cfg.businessAccountId} placeholder="WABA ID"/></Field>
    <Field label="Connected phone"><Input name="displayPhone" defaultValue={cfg.displayPhone} placeholder="+52..."/></Field>
    <Field label="Graph API version"><Input name="graphVersion" defaultValue={cfg.graphVersion||"v23.0"}/></Field>
    <div className="sm:col-span-2"><Field label={cfg.tokenConfigured?"Permanent Access Token — already configured (leave blank to keep it)":"Permanent Access Token"}><Input name="accessToken" type="password" placeholder={cfg.tokenConfigured?"••••••••••••":"Paste Meta permanent token"}/></Field><p className="mt-2 text-xs text-muted2">The token is encrypted before being stored. JUN never displays it again.</p></div>
   </CardContent></Card>
   <Card><CardHeader><CardTitle>Webhook</CardTitle></CardHeader><CardContent className="space-y-5">
    <Field label="Callback URL"><Input value="https://juncreatif.org/api/webhooks/whatsapp" readOnly/></Field>
    <Field label={cfg.webhookVerifyTokenConfigured?"Webhook Verify Token — already configured (leave blank to keep it)":"Webhook Verify Token"}><Input name="webhookVerifyToken" type="password" placeholder={cfg.webhookVerifyTokenConfigured?"••••••••••••":"Create a private verification token"}/></Field>
    <p className="text-xs text-muted2">In Meta Webhooks, use the Callback URL above and paste the exact same Verify Token that you enter here. Keep the <strong>messages</strong> field subscribed.</p>
   </CardContent></Card>
   <Card><CardHeader><CardTitle>General document template</CardTitle></CardHeader><CardContent className="space-y-5">
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
     <p className="font-semibold">Create this single template in Meta WhatsApp Manager</p>
     <div className="mt-3 grid gap-2 text-xs">
      <p><strong>Name:</strong> {GENERAL_DOCUMENT_TEMPLATE}</p>
      <p><strong>Category:</strong> Utility</p>
      <p><strong>Language:</strong> French (fr)</p>
      <p><strong>Header:</strong> Document · dynamic</p>
      <div><strong>Body:</strong><pre className="mt-1 whitespace-pre-wrap rounded-lg border border-emerald-200 bg-white p-3 text-xs">Bonjour {'{{customer_name}}'},

Votre document {'{{document_type}}'} est maintenant disponible.

Référence : {'{{document_reference}}'}

JUN CREATIF AND TRAVEL LLC</pre></div>
      <p><strong>Sample values:</strong> customer_name = Ruth Joseph · document_type = Official Payment Receipt · document_reference = REC-2026-001</p>
     </div>
    </div>
    <div className="grid gap-5 sm:grid-cols-2">
     <Field label="Approved document template"><Input name="defaultTemplate" defaultValue={cfg.defaultTemplate} placeholder={GENERAL_DOCUMENT_TEMPLATE}/></Field>
     <Field label="Template language code"><Input name="languageCode" defaultValue={cfg.languageCode||"fr"} placeholder="fr"/></Field>
    </div>
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">After Meta marks the template as <strong>Approved</strong>, enter its exact name above. JUN will automatically send the named variables <strong>customer_name</strong>, <strong>document_type</strong> and <strong>document_reference</strong>, and attach the generated PDF as the template&apos;s Document header.</div>
    <p className="text-xs text-muted2">The same template can therefore be reused for receipts, invoices, statements, contracts and official PDF documents generated by JUN.</p>
   </CardContent></Card>
   <div className="flex items-center gap-3"><Button type="submit" variant="primary">Save WhatsApp connection</Button><span className={`text-sm ${cfg.tokenConfigured&&cfg.phoneNumberId?"text-emerald-600":"text-amber-600"}`}>{cfg.tokenConfigured&&cfg.phoneNumberId?"Configuration saved":"Configuration incomplete"}</span></div>
  </form>
 </div>;
}
