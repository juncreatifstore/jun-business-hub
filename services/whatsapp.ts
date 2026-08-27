"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getClientFinancialAccount, type ClientStatementLanguage } from "@/lib/client-financial-account";
import { renderClientStatementV2 } from "@/services/pdf/client-statement-v2";
import { GENERAL_DOCUMENT_TEMPLATE, getWhatsAppConfig, saveWhatsAppConfig, sendWhatsAppDocument, sendWhatsAppDocumentTemplate, sendWhatsAppTemplate, sendWhatsAppText, uploadWhatsAppMedia } from "@/lib/whatsapp";
import { recordOutgoingWhatsAppMessage } from "@/lib/whatsapp-inbox";
import { isClientCommunicationBanned } from "@/lib/client-communication-policy";

export async function saveWhatsAppSettings(formData:FormData){
 const user=await assertPermission("SETTINGS_MANAGE");
 const accessToken=String(formData.get("accessToken")||"");
 const webhookVerifyToken=String(formData.get("webhookVerifyToken")||"");
 await saveWhatsAppConfig({
  appId:String(formData.get("appId")||""),phoneNumberId:String(formData.get("phoneNumberId")||""),businessAccountId:String(formData.get("businessAccountId")||""),displayPhone:String(formData.get("displayPhone")||""),graphVersion:String(formData.get("graphVersion")||"v23.0"),defaultTemplate:String(formData.get("defaultTemplate")||""),languageCode:String(formData.get("languageCode")||"fr"),accessToken:accessToken||undefined,webhookVerifyToken:webhookVerifyToken||undefined,
 });
 await audit({userId:user.id,action:"WHATSAPP_SETTINGS_UPDATE",resourceType:"AppSetting",resourceId:"whatsapp",after:{appId:String(formData.get("appId")||"").trim()||null,tokenUpdated:Boolean(accessToken.trim()),webhookVerifyTokenUpdated:Boolean(webhookVerifyToken.trim())}});
 revalidatePath("/app/settings/whatsapp");
 redirect("/app/settings/whatsapp?toast=WhatsApp settings saved");
}

export async function sendClientWhatsApp(clientId:string,formData:FormData){
 const user=await assertPermission("CLIENT_READ");
 const client=await prisma.client.findUnique({where:{id:clientId},select:{id:true,internalId:true,firstName:true,lastName:true,whatsapp:true,phone:true}});
 if(!client)redirect("/app/clients?toast_error=Client not found");
 if(await isClientCommunicationBanned(client.id))redirect(`/app/clients/${clientId}/whatsapp?toast_error=${encodeURIComponent("Client banni — communication WhatsApp bloquée partout dans JUN")}`);
 const to=String(formData.get("to")||client.whatsapp||client.phone||"").trim();
 const rawMode=String(formData.get("mode")||"").trim().toUpperCase();
 const mode=rawMode==="TEMPLATE"?"TEMPLATE":"TEXT";
 const message=String(formData.get("message")||"").trim();
 const template=String(formData.get("template")||"").trim();
 const language=String(formData.get("language")||"fr").trim();
 if(!to)redirect(`/app/clients/${clientId}/whatsapp?toast_error=${encodeURIComponent("Client has no WhatsApp number")}`);
 let errorMessage="";
 try{
  const cfg=await getWhatsAppConfig();
  const selectedTemplate=template||cfg.defaultTemplate;
  if(mode==="TEMPLATE"&&selectedTemplate===GENERAL_DOCUMENT_TEMPLATE){throw new Error("jun_document_notification requires a PDF document. Open the Receipt, Invoice, Statement or Official Document you want to send and click Send by WhatsApp there.");}
  const result=mode==="TEMPLATE"?await sendWhatsAppTemplate(to,selectedTemplate,language||cfg.languageCode,[]):await sendWhatsAppText(to,message);
  const messageId=result.messages?.[0]?.id??null;
  await audit({userId:user.id,action:"WHATSAPP_CLIENT_SEND",resourceType:"Client",resourceId:client.id,after:{clientInternalId:client.internalId,mode,to,messageId,template:mode==="TEMPLATE"?selectedTemplate:null}});
  await prisma.activity.create({data:{userId:user.id,clientId:client.id,type:"WHATSAPP_ACCEPTED",message:`WhatsApp ${mode==="TEMPLATE"?"template":"message"} accepted by Meta for ${to}${messageId?` · ${messageId}`:""}`}}).catch(()=>null);
  await recordOutgoingWhatsAppMessage({phone:to,messageId,type:mode==="TEMPLATE"?"template":"text",text:mode==="TEMPLATE"?`Modèle WhatsApp envoyé · ${selectedTemplate}`:message,clientId:client.id,userId:user.id}).catch(()=>null);
  revalidatePath(`/app/clients/${clientId}`);revalidatePath("/app/whatsapp/inbox");
 }catch(e){errorMessage=e instanceof Error?e.message:"WhatsApp send failed";}
 if(errorMessage)redirect(`/app/clients/${clientId}/whatsapp?toast_error=${encodeURIComponent(errorMessage)}`);
 redirect(`/app/clients/${clientId}/whatsapp?toast=${encodeURIComponent("Accepted by Meta — awaiting delivery confirmation")}`);
}

export async function sendDocumentByWhatsApp(documentId:string,formData:FormData){
 const user=await assertPermission("DOCUMENT_READ");
 const doc=await prisma.document.findUnique({where:{id:documentId},include:{client:true,case:true}});
 if(!doc)redirect("/app/documents?toast_error=Document not found");
 if(!doc.client)redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent("This document is not linked to a client")}`);
 if(await isClientCommunicationBanned(doc.client.id))redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent("Client banni — aucun document ne peut être envoyé par WhatsApp")}`);
 const to=String(formData.get("to")||doc.client.whatsapp||doc.client.phone||"").trim();
 if(!to)redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent("Client has no WhatsApp number")}`);
 if(!doc.finalPdfKey)redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent("Finalize the document first so JUN has an official PDF to send")}`);
 let errorMessage="";
 try{
  const cfg=await getWhatsAppConfig();
  const pdf=await storage().download(doc.finalPdfKey);
  const filename=`${doc.documentId}-${doc.title}`.replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,180)+".pdf";
  const mediaId=await uploadWhatsAppMedia(pdf,"application/pdf",filename);
  const clientName=`${doc.client.firstName} ${doc.client.lastName}`.trim();
  const caption=String(formData.get("caption")||`JUN CREATIF AND TRAVEL LLC — ${doc.title}`).trim();
  const result=cfg.defaultTemplate?await sendWhatsAppDocumentTemplate({to,templateName:cfg.defaultTemplate,languageCode:cfg.languageCode,mediaId,filename,clientName,documentLabel:doc.title,reference:doc.documentId}):await sendWhatsAppDocument(to,mediaId,filename,caption);
  const messageId=result.messages?.[0]?.id??null;
  await audit({userId:user.id,action:"WHATSAPP_DOCUMENT_SEND",resourceType:"Document",resourceId:doc.id,after:{documentId:doc.documentId,clientId:doc.client.id,to,messageId,mediaId,template:cfg.defaultTemplate||null}});
  await prisma.activity.create({data:{userId:user.id,clientId:doc.client.id,caseId:doc.caseId??undefined,type:"WHATSAPP_ACCEPTED",message:`Document ${doc.documentId} accepted by Meta for WhatsApp delivery to ${to}${messageId?` · ${messageId}`:""}`,resourceType:"Document",resourceId:doc.id}}).catch(()=>null);
  await recordOutgoingWhatsAppMessage({phone:to,messageId,type:"document",text:`Document envoyé · ${doc.title}`,filename,mediaId,caption,clientId:doc.client.id,caseId:doc.caseId,userId:user.id}).catch(()=>null);
  revalidatePath(`/app/documents/${documentId}`);revalidatePath(`/app/clients/${doc.client.id}`);revalidatePath("/app/whatsapp/inbox");
 }catch(e){errorMessage=e instanceof Error?e.message:"WhatsApp document send failed";}
 if(errorMessage)redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent(errorMessage)}`);
 redirect(`/app/documents/${documentId}?toast=${encodeURIComponent("Accepted by Meta — awaiting delivery confirmation")}`);
}

export async function sendClientStatementByWhatsApp(clientId:string,formData:FormData){
 const user=await assertPermission("CLIENT_READ");
 const [client,account,cfg]=await Promise.all([
  prisma.client.findUnique({where:{id:clientId},select:{id:true,internalId:true,firstName:true,lastName:true,email:true,phone:true,whatsapp:true,address:true,country:true}}),
  getClientFinancialAccount(clientId),getWhatsAppConfig(),
 ]);
 if(!client)redirect("/app/clients?toast_error=Client not found");
 if(await isClientCommunicationBanned(client.id))redirect(`/app/clients/${clientId}/statement?toast_error=${encodeURIComponent("Client banni — relevé WhatsApp bloqué")}`);
 const to=String(client.whatsapp||client.phone||"").trim();
 const rawLang=String(formData.get("language")||"").toUpperCase();
 const language:ClientStatementLanguage=["FR","EN","ES","HT"].includes(rawLang)?rawLang as ClientStatementLanguage:account.profile.preferredLanguage;
 if(!to)redirect(`/app/clients/${clientId}/statement?lang=${language}&toast_error=${encodeURIComponent("Client has no WhatsApp number")}`);
 if(!cfg.defaultTemplate)redirect(`/app/clients/${clientId}/statement?lang=${language}&toast_error=${encodeURIComponent("Configure the approved jun_document_notification template in Settings → WhatsApp first")}`);
 let errorMessage="";
 try{
  const reference=`STATEMENT-${client.internalId}`;
  const bytes=await renderClientStatementV2({reference,language,client:{name:`${client.firstName} ${client.lastName}`,internalId:client.internalId,email:client.email,phone:client.phone,address:client.address,country:client.country},balances:account.balances.map(b=>({currency:b.currency,confirmedFunds:b.confirmedFunds,commissions:b.commissions,committedExpenses:b.committedExpenses,activeRefunds:b.activeRefunds,partnerWithdrawals:b.partnerWithdrawals,available:b.available})),entries:account.entries.map(e=>({date:e.date,type:e.type,reference:e.reference,description:e.description,status:e.status,currency:e.currency,credit:e.credit,debit:e.debit,runningBalance:e.runningBalance}))});
  const filename=`${client.internalId}-statement.pdf`;const mediaId=await uploadWhatsAppMedia(Buffer.from(bytes),"application/pdf",filename);
  const label=language==="FR"?"Relevé de compte client":language==="ES"?"Estado de cuenta del cliente":language==="HT"?"Relve kont kliyan":"Client account statement";
  const result=await sendWhatsAppDocumentTemplate({to,templateName:cfg.defaultTemplate,languageCode:cfg.languageCode,mediaId,filename,clientName:`${client.firstName} ${client.lastName}`.trim(),documentLabel:label,reference});
  const messageId=result.messages?.[0]?.id??null;
  await audit({userId:user.id,action:"WHATSAPP_STATEMENT_SEND",resourceType:"Client",resourceId:client.id,after:{clientInternalId:client.internalId,to,messageId,mediaId,template:cfg.defaultTemplate,reference,language}});
  await prisma.activity.create({data:{userId:user.id,clientId:client.id,type:"WHATSAPP_ACCEPTED",message:`Statement ${reference} accepted by Meta for WhatsApp delivery to ${to}${messageId?` · ${messageId}`:""}`,resourceType:"ClientStatement",resourceId:reference}}).catch(()=>null);
  await recordOutgoingWhatsAppMessage({phone:to,messageId,type:"document",text:`${label} envoyé`,filename,mediaId,clientId:client.id,userId:user.id}).catch(()=>null);
  revalidatePath(`/app/clients/${clientId}`);revalidatePath("/app/whatsapp/inbox");
 }catch(e){errorMessage=e instanceof Error?e.message:"WhatsApp statement send failed";}
 if(errorMessage)redirect(`/app/clients/${clientId}/statement?lang=${language}&toast_error=${encodeURIComponent(errorMessage)}`);
 redirect(`/app/clients/${clientId}/statement?lang=${language}&toast=${encodeURIComponent("Statement accepted by Meta — awaiting delivery confirmation")}`);
}
