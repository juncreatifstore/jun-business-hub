"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { GENERAL_DOCUMENT_TEMPLATE, getWhatsAppConfig, saveWhatsAppConfig, sendWhatsAppDocument, sendWhatsAppDocumentTemplate, sendWhatsAppTemplate, sendWhatsAppText, uploadWhatsAppMedia } from "@/lib/whatsapp";

export async function saveWhatsAppSettings(formData:FormData){
 const user=await assertPermission("SETTINGS_MANAGE");
 const accessToken=String(formData.get("accessToken")||"");
 const webhookVerifyToken=String(formData.get("webhookVerifyToken")||"");
 await saveWhatsAppConfig({
  phoneNumberId:String(formData.get("phoneNumberId")||""),businessAccountId:String(formData.get("businessAccountId")||""),displayPhone:String(formData.get("displayPhone")||""),graphVersion:String(formData.get("graphVersion")||"v23.0"),defaultTemplate:String(formData.get("defaultTemplate")||""),languageCode:String(formData.get("languageCode")||"fr"),accessToken:accessToken||undefined,webhookVerifyToken:webhookVerifyToken||undefined,
 });
 await audit({userId:user.id,action:"WHATSAPP_SETTINGS_UPDATE",resourceType:"AppSetting",resourceId:"whatsapp",after:{tokenUpdated:Boolean(accessToken.trim()),webhookVerifyTokenUpdated:Boolean(webhookVerifyToken.trim())}});
 revalidatePath("/app/settings/whatsapp");
 redirect("/app/settings/whatsapp?toast=WhatsApp settings saved");
}

export async function sendClientWhatsApp(clientId:string,formData:FormData){
 const user=await assertPermission("CLIENT_READ");
 const client=await prisma.client.findUnique({where:{id:clientId},select:{id:true,internalId:true,firstName:true,lastName:true,whatsapp:true,phone:true}});
 if(!client)redirect("/app/clients?toast_error=Client not found");
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
  if(mode==="TEMPLATE"&&selectedTemplate===GENERAL_DOCUMENT_TEMPLATE){
   throw new Error("jun_document_notification requires a PDF document. Open the Receipt, Invoice, Statement or Official Document you want to send and click Send by WhatsApp there.");
  }
  const result=mode==="TEMPLATE"
   ?await sendWhatsAppTemplate(to,selectedTemplate,language||cfg.languageCode,[])
   :await sendWhatsAppText(to,message);
  const messageId=result.messages?.[0]?.id??null;
  await audit({userId:user.id,action:"WHATSAPP_CLIENT_SEND",resourceType:"Client",resourceId:client.id,after:{clientInternalId:client.internalId,mode,to,messageId,template:mode==="TEMPLATE"?selectedTemplate:null}});
  await prisma.activity.create({data:{userId:user.id,clientId:client.id,type:"WHATSAPP_SENT",message:`WhatsApp ${mode==="TEMPLATE"?"template":"message"} sent to ${to}${messageId?` · ${messageId}`:""}`}}).catch(()=>null);
  revalidatePath(`/app/clients/${clientId}`);
 }catch(e){
  errorMessage=e instanceof Error?e.message:"WhatsApp send failed";
 }
 if(errorMessage)redirect(`/app/clients/${clientId}/whatsapp?toast_error=${encodeURIComponent(errorMessage)}`);
 redirect(`/app/clients/${clientId}/whatsapp?toast=${encodeURIComponent("WhatsApp sent successfully")}`);
}

export async function sendDocumentByWhatsApp(documentId:string,formData:FormData){
 const user=await assertPermission("DOCUMENT_READ");
 const doc=await prisma.document.findUnique({where:{id:documentId},include:{client:true,case:true}});
 if(!doc)redirect("/app/documents?toast_error=Document not found");
 if(!doc.client)redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent("This document is not linked to a client")}`);
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
  const result=cfg.defaultTemplate
   ?await sendWhatsAppDocumentTemplate({to,templateName:cfg.defaultTemplate,languageCode:cfg.languageCode,mediaId,filename,clientName,documentLabel:doc.title,reference:doc.documentId})
   :await sendWhatsAppDocument(to,mediaId,filename,String(formData.get("caption")||`JUN CREATIF AND TRAVEL LLC — ${doc.title}`).trim());
  const messageId=result.messages?.[0]?.id??null;
  await audit({userId:user.id,action:"WHATSAPP_DOCUMENT_SEND",resourceType:"Document",resourceId:doc.id,after:{documentId:doc.documentId,clientId:doc.client.id,to,messageId,mediaId,template:cfg.defaultTemplate||null}});
  await prisma.activity.create({data:{userId:user.id,clientId:doc.client.id,caseId:doc.caseId??undefined,type:"WHATSAPP_DOCUMENT_SENT",message:`Document ${doc.documentId} sent by WhatsApp to ${to}${messageId?` · ${messageId}`:""}`,resourceType:"Document",resourceId:doc.id}}).catch(()=>null);
  revalidatePath(`/app/documents/${documentId}`);
  revalidatePath(`/app/clients/${doc.client.id}`);
 }catch(e){
  errorMessage=e instanceof Error?e.message:"WhatsApp document send failed";
 }
 if(errorMessage)redirect(`/app/documents/${documentId}?toast_error=${encodeURIComponent(errorMessage)}`);
 redirect(`/app/documents/${documentId}?toast=${encodeURIComponent("Document sent by WhatsApp")}`);
}
