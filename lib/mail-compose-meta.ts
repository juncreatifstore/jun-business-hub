import "server-only";
import { prisma } from "@/lib/prisma";

const META_PREFIX="mail.compose.meta.";
const SIGNATURE_PREFIX="mail.signature.";
const TEMPLATE_PREFIX="mail.template.";

export type MailComposeMode="NEW"|"REPLY"|"REPLY_ALL"|"FORWARD";
export type MailComposeMeta={
 threadId:string;
 mode:MailComposeMode;
 to:string[];
 cc:string[];
 bcc:string[];
 attachmentFileIds:string[];
 sourceThreadId:string|null;
 sourceGmailMessageId:string|null;
 signatureId:string|null;
 templateId:string|null;
 updatedAt:string;
};
export type MailSignature={id:string;mailAccountId:string;name:string;body:string;isDefault:boolean;updatedAt:string};
export type MailTemplate={id:string;name:string;subject:string;body:string;category:string;updatedAt:string};

function parseList(value:string){return [...new Set(value.split(/[;,\n]/).map(v=>v.trim().toLowerCase()).filter(Boolean))];}
export function parseEmailList(value:string){return parseList(value).filter(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));}
export function metaKey(threadId:string){return `${META_PREFIX}${threadId}`;}

export async function getMailComposeMeta(threadId:string):Promise<MailComposeMeta|null>{
 const row=await prisma.appSetting.findUnique({where:{key:metaKey(threadId)},select:{value:true}}).catch(()=>null);
 if(!row)return null;try{return JSON.parse(row.value) as MailComposeMeta}catch{return null}
}
export async function saveMailComposeMeta(meta:MailComposeMeta){
 const value=JSON.stringify(meta);await prisma.appSetting.upsert({where:{key:metaKey(meta.threadId)},create:{key:metaKey(meta.threadId),value},update:{value}});return meta;
}
export async function deleteMailComposeMeta(threadId:string){await prisma.appSetting.delete({where:{key:metaKey(threadId)}}).catch(()=>null);}

export async function listMailSignatures(mailAccountId?:string){
 const rows=await prisma.appSetting.findMany({where:{key:{startsWith:SIGNATURE_PREFIX}},select:{value:true}});
 return rows.map(r=>{try{return JSON.parse(r.value) as MailSignature}catch{return null}}).filter((v):v is MailSignature=>Boolean(v)&&(!mailAccountId||v.mailAccountId===mailAccountId)).sort((a,b)=>Number(b.isDefault)-Number(a.isDefault)||a.name.localeCompare(b.name));
}
export async function saveMailSignature(sig:MailSignature){const value=JSON.stringify(sig);await prisma.appSetting.upsert({where:{key:`${SIGNATURE_PREFIX}${sig.id}`},create:{key:`${SIGNATURE_PREFIX}${sig.id}`,value},update:{value}});}
export async function deleteMailSignature(id:string){await prisma.appSetting.delete({where:{key:`${SIGNATURE_PREFIX}${id}`}}).catch(()=>null);}

export async function listMailTemplates(){
 const rows=await prisma.appSetting.findMany({where:{key:{startsWith:TEMPLATE_PREFIX}},select:{value:true}});
 return rows.map(r=>{try{return JSON.parse(r.value) as MailTemplate}catch{return null}}).filter((v):v is MailTemplate=>Boolean(v)).sort((a,b)=>a.name.localeCompare(b.name));
}
export async function saveMailTemplate(t:MailTemplate){const value=JSON.stringify(t);await prisma.appSetting.upsert({where:{key:`${TEMPLATE_PREFIX}${t.id}`},create:{key:`${TEMPLATE_PREFIX}${t.id}`,value},update:{value}});}
export async function deleteMailTemplate(id:string){await prisma.appSetting.delete({where:{key:`${TEMPLATE_PREFIX}${id}`}}).catch(()=>null);}
