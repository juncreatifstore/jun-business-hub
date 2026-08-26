import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

const PREFIX="whatsapp.";
export type WhatsAppConfig={
 phoneNumberId:string;
 businessAccountId:string;
 displayPhone:string;
 graphVersion:string;
 defaultTemplate:string;
 languageCode:string;
 tokenConfigured:boolean;
 webhookVerifyTokenConfigured:boolean;
};

async function rows(){const r=await prisma.appSetting.findMany({where:{key:{startsWith:PREFIX}},select:{key:true,value:true}});return Object.fromEntries(r.map(x=>[x.key,x.value]));}
async function set(key:string,value:string){await prisma.appSetting.upsert({where:{key},create:{key,value},update:{value}});}

export async function getWhatsAppConfig():Promise<WhatsAppConfig>{const s=await rows();return{
 phoneNumberId:s["whatsapp.phone_number_id"]??"",
 businessAccountId:s["whatsapp.business_account_id"]??"",
 displayPhone:s["whatsapp.display_phone"]??"",
 graphVersion:s["whatsapp.graph_version"]??"v23.0",
 defaultTemplate:s["whatsapp.default_template"]??"",
 languageCode:s["whatsapp.language_code"]??"fr",
 tokenConfigured:Boolean(s["whatsapp.access_token_enc"]),
 webhookVerifyTokenConfigured:Boolean(s["whatsapp.webhook_verify_token_enc"]),
};}

export async function saveWhatsAppConfig(input:{phoneNumberId:string;businessAccountId:string;displayPhone:string;graphVersion:string;defaultTemplate:string;languageCode:string;accessToken?:string;webhookVerifyToken?:string}){
 await Promise.all([
  set("whatsapp.phone_number_id",input.phoneNumberId.trim()),set("whatsapp.business_account_id",input.businessAccountId.trim()),set("whatsapp.display_phone",input.displayPhone.trim()),set("whatsapp.graph_version",input.graphVersion.trim()||"v23.0"),set("whatsapp.default_template",input.defaultTemplate.trim()),set("whatsapp.language_code",input.languageCode.trim()||"fr"),
  input.accessToken?.trim()?set("whatsapp.access_token_enc",encryptSecret(input.accessToken.trim())):Promise.resolve(),
  input.webhookVerifyToken?.trim()?set("whatsapp.webhook_verify_token_enc",encryptSecret(input.webhookVerifyToken.trim())):Promise.resolve(),
 ]);
}

export async function getWhatsAppWebhookVerifyToken(){const s=await rows();const enc=s["whatsapp.webhook_verify_token_enc"];return enc?decryptSecret(enc):"";}

async function credentials(){const s=await rows();const enc=s["whatsapp.access_token_enc"],phoneNumberId=s["whatsapp.phone_number_id"],graphVersion=s["whatsapp.graph_version"]||"v23.0";if(!enc||!phoneNumberId)throw new Error("WhatsApp is not configured. Open Settings → WhatsApp.");return{token:decryptSecret(enc),phoneNumberId,graphVersion};}
function normalizePhone(phone:string){const n=phone.replace(/[^0-9]/g,"");if(n.length<8)throw new Error("Invalid WhatsApp number. Use international format, for example +52…");return n;}
async function send(payload:unknown){const c=await credentials();const r=await fetch(`https://graph.facebook.com/${c.graphVersion}/${encodeURIComponent(c.phoneNumberId)}/messages`,{method:"POST",headers:{Authorization:`Bearer ${c.token}`,"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`Meta WhatsApp API ${r.status}: ${JSON.stringify(data)}`);return data as {messages?:{id:string}[]};}

export async function sendWhatsAppText(to:string,body:string){if(!body.trim())throw new Error("Message is empty");return send({messaging_product:"whatsapp",recipient_type:"individual",to:normalizePhone(to),type:"text",text:{preview_url:true,body:body.trim().slice(0,4096)}});}
export async function sendWhatsAppTemplate(to:string,templateName:string,languageCode:string,bodyParameters:string[]=[]){if(!templateName.trim())throw new Error("Template name is required");return send({messaging_product:"whatsapp",to:normalizePhone(to),type:"template",template:{name:templateName.trim(),language:{code:languageCode.trim()||"fr"},...(bodyParameters.length?{components:[{type:"body",parameters:bodyParameters.map(text=>({type:"text",text}))}]}:{})}});}
