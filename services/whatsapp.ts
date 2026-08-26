"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getWhatsAppConfig, saveWhatsAppConfig, sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/whatsapp";

export async function saveWhatsAppSettings(formData:FormData){
 const user=await assertPermission("SETTINGS_MANAGE");
 const accessToken=String(formData.get("accessToken")||"");
 const webhookVerifyToken=String(formData.get("webhookVerifyToken")||"");
 await saveWhatsAppConfig({
  phoneNumberId:String(formData.get("phoneNumberId")||""),businessAccountId:String(formData.get("businessAccountId")||""),displayPhone:String(formData.get("displayPhone")||""),graphVersion:String(formData.get("graphVersion")||"v23.0"),defaultTemplate:String(formData.get("defaultTemplate")||""),languageCode:String(formData.get("languageCode")||"fr"),accessToken:accessToken||undefined,webhookVerifyToken:webhookVerifyToken||undefined,
 });
 await audit({userId:user.id,action:"WHATSAPP_SETTINGS_UPDATE",resourceType:"AppSetting",resourceId:"whatsapp",after:{tokenUpdated:Boolean(accessToken.trim()),webhookVerifyTokenUpdated:Boolean(webhookVerifyToken.trim())}});
 revalidatePath("/app/settings/whatsapp");redirect("/app/settings/whatsapp?toast=WhatsApp settings saved");
}

export async function sendClientWhatsApp(clientId:string,formData:FormData){
 const user=await assertPermission("CLIENT_READ");
 const client=await prisma.client.findUnique({where:{id:clientId},select:{id:true,internalId:true,firstName:true,lastName:true,whatsapp:true,phone:true}});if(!client)redirect("/app/clients?toast_error=Client not found");
 const to=String(formData.get("to")||client.whatsapp||client.phone||"").trim(),mode=String(formData.get("mode")||"TEMPLATE"),message=String(formData.get("message")||"").trim(),template=String(formData.get("template")||"").trim(),language=String(formData.get("language")||"fr").trim();
 if(!to)redirect(`/app/clients/${clientId}/whatsapp?toast_error=${encodeURIComponent("Client has no WhatsApp number")}`);
 try{
  const cfg=await getWhatsAppConfig();
  const result=mode==="TEXT"?await sendWhatsAppText(to,message):await sendWhatsAppTemplate(to,template||cfg.defaultTemplate,language||cfg.languageCode,[]);
  const messageId=result.messages?.[0]?.id??null;
  await audit({userId:user.id,action:"WHATSAPP_CLIENT_SEND",resourceType:"Client",resourceId:client.id,after:{clientInternalId:client.internalId,mode,to,messageId,template:mode==="TEMPLATE"?(template||cfg.defaultTemplate):null}});
  await prisma.activity.create({data:{userId:user.id,clientId:client.id,type:"WHATSAPP_SENT",message:`WhatsApp ${mode==="TEMPLATE"?"template":"message"} sent to ${to}${messageId?` · ${messageId}`:""}`}}).catch(()=>null);
  revalidatePath(`/app/clients/${clientId}`);redirect(`/app/clients/${clientId}/whatsapp?toast=${encodeURIComponent("WhatsApp sent successfully")}`);
 }catch(e){redirect(`/app/clients/${clientId}/whatsapp?toast_error=${encodeURIComponent(e instanceof Error?e.message:"WhatsApp send failed")}`);}
}
