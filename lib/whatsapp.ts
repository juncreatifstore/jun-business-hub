import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

const PREFIX="whatsapp.";
const LEGACY_TEST_TEMPLATE="hello_world";
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

export async function getWhatsAppConfig():Promise<WhatsAppConfig>{const s=await rows();const storedTemplate=s["whatsapp.default_template"]?.trim()||"";return{
 phoneNumberId:s["whatsapp.phone_number_id"]??"",
 businessAccountId:s["whatsapp.business_account_id"]??"",
 displayPhone:s["whatsapp.display_phone"]??"",
 graphVersion:s["whatsapp.graph_version"]??"v23.0",
 defaultTemplate:storedTemplate===LEGACY_TEST_TEMPLATE?"":storedTemplate,
 languageCode:s["whatsapp.language_code"]?.trim()||"en_US",
 tokenConfigured:Boolean(s["whatsapp.access_token_enc"]),
 webhookVerifyTokenConfigured:Boolean(s["whatsapp.webhook_verify_token_enc"]),
};}

export async function saveWhatsAppConfig(input:{phoneNumberId:string;businessAccountId:string;displayPhone:string;graphVersion:string;defaultTemplate:string;languageCode:string;accessToken?:string;webhookVerifyToken?:string}){
 const defaultTemplate=input.defaultTemplate.trim();
 const languageCode=input.languageCode.trim()||"en_US";
 await Promise.all([
  set("whatsapp.phone_number_id",input.phoneNumberId.trim()),set("whatsapp.business_account_id",input.businessAccountId.trim()),set("whatsapp.display_phone",input.displayPhone.trim()),set("whatsapp.graph_version",input.graphVersion.trim()||"v23.0"),set("whatsapp.default_template",defaultTemplate),set("whatsapp.language_code",languageCode),
  input.accessToken?.trim()?set("whatsapp.access_token_enc",encryptSecret(input.accessToken.trim())):Promise.resolve(),
  input.webhookVerifyToken?.trim()?set("whatsapp.webhook_verify_token_enc",encryptSecret(input.webhookVerifyToken.trim())):Promise.resolve(),
 ]);
}

export async function getWhatsAppWebhookVerifyToken(){const s=await rows();const enc=s["whatsapp.webhook_verify_token_enc"];return enc?decryptSecret(enc):"";}

async function credentials(){const s=await rows();const enc=s["whatsapp.access_token_enc"],phoneNumberId=s["whatsapp.phone_number_id"],graphVersion=s["whatsapp.graph_version"]||"v23.0";if(!enc||!phoneNumberId)throw new Error("WhatsApp is not configured. Open Settings → WhatsApp.");return{token:decryptSecret(enc),phoneNumberId,graphVersion};}
function normalizePhone(phone:string){const n=phone.replace(/[^0-9]/g,"");if(n.length<8)throw new Error("Invalid WhatsApp number. Use international format, for example +52…");return n;}
async function send(payload:unknown){const c=await credentials();const r=await fetch(`https://graph.facebook.com/${c.graphVersion}/${encodeURIComponent(c.phoneNumberId)}/messages`,{method:"POST",headers:{Authorization:`Bearer ${c.token}`,"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`Meta WhatsApp API ${r.status}: ${JSON.stringify(data)}`);return data as {messages?:{id:string}[]};}

export async function sendWhatsAppText(to:string,body:string){if(!body.trim())throw new Error("Message is empty");return send({messaging_product:"whatsapp",recipient_type:"individual",to:normalizePhone(to),type:"text",text:{preview_url:true,body:body.trim().slice(0,4096)}});}
export async function sendWhatsAppTemplate(to:string,templateName:string,languageCode:string,bodyParameters:string[]=[]){
 const name=templateName.trim();
 if(!name)throw new Error("No approved WhatsApp template is configured. Choose Free text for an active 24-hour conversation, or enter the exact approved template name from Meta WhatsApp Manager in Settings → WhatsApp.");
 const language=languageCode.trim()||"en_US";
 return send({messaging_product:"whatsapp",to:normalizePhone(to),type:"template",template:{name,language:{code:language},...(bodyParameters.length?{components:[{type:"body",parameters:bodyParameters.map(text=>({type:"text",text}))}]}:{})}});
}

export async function uploadWhatsAppMedia(data:Buffer,mimeType:string,filename:string){
 const c=await credentials();
 const form=new FormData();
 form.set("messaging_product","whatsapp");
 form.set("type",mimeType||"application/octet-stream");
 const bytes=new Uint8Array(data.byteLength);
 bytes.set(data);
 form.set("file",new Blob([bytes.buffer],{type:mimeType||"application/octet-stream"}),filename||"document.pdf");
 const r=await fetch(`https://graph.facebook.com/${c.graphVersion}/${encodeURIComponent(c.phoneNumberId)}/media`,{method:"POST",headers:{Authorization:`Bearer ${c.token}`},body:form,cache:"no-store"});
 const payload=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(`Meta WhatsApp media upload ${r.status}: ${JSON.stringify(payload)}`);
 const id=String((payload as {id?:string}).id||"");if(!id)throw new Error("Meta did not return a media ID");return id;
}

export async function sendWhatsAppDocument(to:string,mediaId:string,filename:string,caption?:string){
 if(!mediaId)throw new Error("WhatsApp media ID is required");
 return send({messaging_product:"whatsapp",recipient_type:"individual",to:normalizePhone(to),type:"document",document:{id:mediaId,filename:filename.slice(0,240),...(caption?.trim()?{caption:caption.trim().slice(0,1024)}:{})}});
}
