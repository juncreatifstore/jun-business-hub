import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInvoice } from "@/lib/finance-invoices";
import { sendDocumentByWhatsApp } from "@/services/whatsapp";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic="force-dynamic";

type ShareInfo={clientId:string;clientName:string;number:string;title:string;reference:string;message:string;documentId?:string;canDirectPdf?:boolean};

export default async function WhatsAppSharePage({searchParams}:{searchParams:{type?:string;id?:string}}){
 const user=await requireUser();
 const type=String(searchParams.type||"");const id=String(searchParams.id||"");
 if(!type||!id)redirect("/app/whatsapp");
 let info:ShareInfo|null=null;
 if(type==="document"){
  if(!can(user,"DOCUMENT_READ"))redirect("/app/forbidden");
  const d=await prisma.document.findUnique({where:{id},include:{client:true}});
  if(d?.client){const n=d.client.whatsapp||d.client.phone||"";info={clientId:d.client.id,clientName:`${d.client.firstName} ${d.client.lastName}`,number:n,title:d.title,reference:d.documentId,message:`Bonjour ${d.client.firstName},\n\nVotre document officiel JUN « ${d.title} » (${d.documentId}) est prêt.\n\nJUN CREATIF AND TRAVEL LLC`,documentId:d.id,canDirectPdf:Boolean(d.finalPdfKey&&n)};}
 }
 if(type==="receipt"){
  if(!can(user,"PAYMENT_READ"))redirect("/app/forbidden");
  const p=await prisma.payment.findFirst({where:{OR:[{id},{reference:id}]},include:{client:true}});
  if(p){const n=p.client.whatsapp||p.client.phone||"";info={clientId:p.client.id,clientName:`${p.client.firstName} ${p.client.lastName}`,number:n,title:"Official payment receipt",reference:p.reference,message:`Bonjour ${p.client.firstName},\n\nVotre reçu de paiement JUN (${p.reference}) est disponible.\n\nJUN CREATIF AND TRAVEL LLC`};}
 }
 if(type==="invoice"){
  if(!can(user,"INVOICE_READ"))redirect("/app/forbidden");
  const inv=await getInvoice(id);
  if(inv){const c=await prisma.client.findUnique({where:{id:inv.clientId},select:{id:true,firstName:true,lastName:true,whatsapp:true,phone:true}});if(c){const n=c.whatsapp||c.phone||"";info={clientId:c.id,clientName:`${c.firstName} ${c.lastName}`,number:n,title:inv.title||"Invoice",reference:inv.invoiceNumber,message:`Bonjour ${c.firstName},\n\nVotre facture JUN ${inv.invoiceNumber} est prête.\n\nJUN CREATIF AND TRAVEL LLC`};}}
 }
 if(type==="statement"){
  if(!can(user,"CLIENT_READ"))redirect("/app/forbidden");
  const c=await prisma.client.findUnique({where:{id},select:{id:true,internalId:true,firstName:true,lastName:true,whatsapp:true,phone:true}});
  if(c){const n=c.whatsapp||c.phone||"";info={clientId:c.id,clientName:`${c.firstName} ${c.lastName}`,number:n,title:"Client account statement",reference:`STATEMENT-${c.internalId}`,message:`Bonjour ${c.firstName},\n\nVotre relevé de compte JUN (${c.internalId}) est prêt.\n\nJUN CREATIF AND TRAVEL LLC`};}
 }
 if(!info)return <div><PageHeader title="WhatsApp" subtitle="Document not found or not linked to a client."/><Link href="/app/whatsapp"><Button variant="outline">Back to WhatsApp</Button></Link></div>;
 const composer=`/app/clients/${info.clientId}/whatsapp?mode=TEXT&message=${encodeURIComponent(info.message)}`;
 return <div className="max-w-3xl">
  <PageHeader title="Send by WhatsApp" subtitle="Send this JUN-generated document to the linked client."/>
  <Card><CardHeader><CardTitle>{info.title}</CardTitle></CardHeader><CardContent className="space-y-4">
   <div className="grid gap-3 sm:grid-cols-2 text-sm"><div><p className="text-xs text-muted2">Reference</p><p className="font-medium">{info.reference}</p></div><div><p className="text-xs text-muted2">Client</p><p className="font-medium">{info.clientName}</p></div><div><p className="text-xs text-muted2">WhatsApp</p><p className="font-medium">{info.number||"No WhatsApp number"}</p></div></div>
   {!info.number?<p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Add a WhatsApp number to the client record before sending.</p>:null}
   <div className="flex flex-wrap gap-2">
    {info.canDirectPdf&&info.documentId?<form action={sendDocumentByWhatsApp.bind(null,info.documentId)}><input type="hidden" name="to" value={info.number}/><input type="hidden" name="caption" value={`JUN CREATIF AND TRAVEL LLC — ${info.title}`}/><Button type="submit" variant="primary">Send PDF now</Button></form>:null}
    <Link href={composer}><Button variant={info.canDirectPdf?"outline":"primary"} disabled={!info.number}>Open WhatsApp composer</Button></Link>
   </div>
   <p className="text-xs text-muted2">Official finalized documents can be sent as PDF directly. Other generated documents open the JUN WhatsApp composer with the client and document message already prepared.</p>
  </CardContent></Card>
 </div>;
}
