import "server-only";
import { accessTokenFor } from "@/lib/google/gmail";

type GmailHeader={name:string;value:string};
type GmailPart={mimeType?:string;filename?:string;body?:{data?:string;attachmentId?:string;size?:number};parts?:GmailPart[];headers?:GmailHeader[]};
type GmailMessage={id:string;threadId:string;labelIds?:string[];snippet?:string;internalDate?:string;payload?:GmailPart};
type GmailThread={id:string;messages?:GmailMessage[]};
export type MailConversationAttachment={attachmentId:string|null;filename:string;mimeType:string;size:number};
export type MailConversationMessage={id:string;from:string;to:string[];cc:string[];subject:string;date:Date;body:string;snippet:string;isUnread:boolean;labels:string[];attachments:MailConversationAttachment[]};

function header(m:GmailMessage,name:string){return m.payload?.headers?.find(h=>h.name.toLowerCase()===name.toLowerCase())?.value??"";}
function emails(value:string){return value.match(/[\w.+-]+@[\w.-]+\.\w+/g)??[];}
function decode(data?:string){if(!data)return "";try{return Buffer.from(data.replace(/-/g,"+").replace(/_/g,"/"),"base64").toString("utf8")}catch{return ""}}
function decodeQuotedPrintable(value:string){
 if(!/(?:=[0-9A-F]{2}|=\r?\n)/i.test(value))return value;
 return value.replace(/=\r?\n/g,"").replace(/=([0-9A-F]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
}
function decodeEntities(value:string){
 const named:Record<string,string>={nbsp:" ",amp:"&",lt:"<",gt:">",quot:'"',apos:"'",hellip:"…",middot:"·",copy:"©",reg:"®"};
 return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi,(all,entity:string)=>{
  if(entity[0]==="#"){const hex=entity[1]?.toLowerCase()==="x";const n=parseInt(entity.slice(hex?2:1),hex?16:10);return Number.isFinite(n)?String.fromCodePoint(n):all;}
  return named[entity.toLowerCase()]??all;
 });
}
function htmlToText(value:string){
 return decodeEntities(value)
  .replace(/<!--[\s\S]*?-->/g," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
  .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi," ")
  .replace(/<(br|hr)\b[^>]*>/gi,"\n")
  .replace(/<\/(p|div|tr|li|table|section|article|h[1-6])>/gi,"\n")
  .replace(/<li\b[^>]*>/gi,"• ")
  .replace(/<[^>]+>/g," ")
  .replace(/\r/g,"")
  .replace(/[ \t]+\n/g,"\n")
  .replace(/\n[ \t]+/g,"\n")
  .replace(/[ \t]{2,}/g," ")
  .replace(/\n{3,}/g,"\n\n")
  .trim();
}
function textParts(part:GmailPart|undefined,mimeType:"text/plain"|"text/html",out:string[]=[]){
 if(!part)return out;
 if(part.mimeType===mimeType&&part.body?.data&&!part.filename){const decoded=decodeQuotedPrintable(decode(part.body.data));if(decoded.trim())out.push(decoded);}
 for(const child of part.parts??[])textParts(child,mimeType,out);
 return out;
}
function bodyFrom(part?:GmailPart):string{
 const plain=textParts(part,"text/plain").map(v=>v.trim()).filter(Boolean);
 if(plain.length)return plain.join("\n\n");
 const html=textParts(part,"text/html").map(htmlToText).filter(Boolean);
 if(html.length)return html.join("\n\n");
 return "";
}
function attachments(part?:GmailPart,out:MailConversationAttachment[]=[]){if(!part)return out;if(part.filename)out.push({attachmentId:part.body?.attachmentId??null,filename:part.filename,mimeType:part.mimeType||"application/octet-stream",size:part.body?.size??0});for(const p of part.parts??[])attachments(p,out);return out;}

export async function getUnreadGmailThreadIds(accountId:string,max=500):Promise<Set<string>>{
 const {token}=await accessTokenFor(accountId);
 const res=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(500,Math.max(1,max))}&q=${encodeURIComponent("is:unread")}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
 if(!res.ok)return new Set<string>();
 const data=await res.json() as {messages?:{threadId:string}[]};
 return new Set((data.messages??[]).map(m=>m.threadId));
}

export async function getMailConversation(accountId:string,gmailThreadId:string):Promise<MailConversationMessage[]>{
 const {token}=await accessTokenFor(accountId);
 const res=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(gmailThreadId)}?format=full`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
 if(!res.ok)throw new Error(`Gmail thread read failed: ${res.status}`);
 const thread=await res.json() as GmailThread;
 return (thread.messages??[]).map(m=>({id:m.id,from:header(m,"From"),to:emails(header(m,"To")),cc:emails(header(m,"Cc")),subject:header(m,"Subject")||"(no subject)",date:m.internalDate?new Date(Number(m.internalDate)):new Date(),body:bodyFrom(m.payload).slice(0,50000),snippet:m.snippet??"",isUnread:(m.labelIds??[]).includes("UNREAD"),labels:m.labelIds??[],attachments:attachments(m.payload)})).sort((a,b)=>a.date.getTime()-b.date.getTime());
}
