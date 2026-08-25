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
 const named:Record<string,string>={nbsp:" ",amp:"&",lt:"<",gt:">",quot:'"',apos:"'",hellip:"…",middot:"·",copy:"©",reg:"®",zwnj:"",zwj:"",thinsp:" ",ensp:" ",emsp:" ",ndash:"–",mdash:"—",laquo:"«",raquo:"»"};
 return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi,(all,entity:string)=>{
  if(entity[0]==="#"){const hex=entity[1]?.toLowerCase()==="x";const n=parseInt(entity.slice(hex?2:1),hex?16:10);return Number.isFinite(n)?String.fromCodePoint(n):all;}
  return named[entity.toLowerCase()]??all;
 });
}
function normalizeWhitespace(value:string){
 return value
  .replace(/[\u200B-\u200D\uFEFF]/g,"")
  .replace(/\r/g,"")
  .replace(/[ \t]+\n/g,"\n")
  .replace(/\n[ \t]+/g,"\n")
  .replace(/[ \t]{2,}/g," ")
  .replace(/\n{3,}/g,"\n\n")
  .trim();
}
function shouldCollapseUrl(raw:string){
 const value=raw.replace(/[),.;]+$/g,"");
 if(value.length>140)return true;
 try{
  const u=new URL(value);
  const host=u.hostname.toLowerCase();
  const path=`${u.pathname}${u.search}`.toLowerCase();
  return /(^|\.)(clicks?|track|tracking|links?|redirect|email|mail)\./.test(host)
   || /(?:utm_|campaign|redirect|tracking|trk=|clickid|gclid|fbclid|mc_cid|mc_eid|unsubscribe|encoded|%3a%2f%2f)/i.test(path)
   || u.search.length>90;
 }catch{return value.length>100;}
}
function compactUrls(value:string){
 const urlRe=/https?:\/\/[^\s<>"']+/gi;
 let text=value.replace(urlRe,(raw)=>shouldCollapseUrl(raw)?"[link]":raw.replace(/[),.;]+$/g,""));
 text=text
  .replace(/(?:\[link\][ \t]*){2,}/g,"[link]")
  .replace(/^\s*\[link\]\s*$/gm,"[link]")
  .replace(/\n(?:[ \t]*\[link\][ \t]*\n){2,}/g,"\n[link]\n");
 return text;
}
function cleanReadableText(value:string){return normalizeWhitespace(compactUrls(value));}
function htmlToText(value:string){
 return cleanReadableText(
  decodeEntities(value)
   .replace(/<!--[\s\S]*?-->/g," ")
   .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
   .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
   .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi," ")
   .replace(/<(br|hr)\b[^>]*>/gi,"\n")
   .replace(/<\/(p|div|tr|li|table|section|article|h[1-6])>/gi,"\n")
   .replace(/<li\b[^>]*>/gi,"• ")
   .replace(/<[^>]+>/g," ")
 );
}
function looksLikeTechnicalMarkup(value:string){
 const sample=value.slice(0,20000);
 let score=0;
 const signals:[RegExp,number][]=[
  [/\bfont-family\s*:/gi,3],[/!important\b/gi,3],[/\b(?:padding|margin|display|background|border|line-height|font-size|text-decoration)\s*:/gi,2],
  [/(?:^|\n)\s*[^\n{}]{0,100}\{[^{}]{0,500}\}/gm,3],[/<(?:style|table|td|div|span|body|html)\b/gi,2],[/&(?:nbsp|zwnj|zwj|#8204|#x200c);/gi,1],
  [/\bmso-[a-z-]+\s*:/gi,3],[/\b@media\b/gi,3],[/\bwidth\s*:\s*\d+(?:px|%)/gi,2],
 ];
 for(const [re,weight] of signals){const matches=sample.match(re)?.length??0;score+=Math.min(matches,5)*weight;}
 return score>=5;
}
function cleanPollutedPlainText(value:string){
 let text=decodeEntities(decodeQuotedPrintable(value));
 text=text
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/(?:^|\n)\s*[^\n{}]{0,120}\{[^{}]{0,1200}\}\s*(?=\n|$)/gm,"\n")
  .replace(/\*\s*(?:td|table|body|div|span|a|p|h[1-6])\s*\{[^}]*\}/gi," ")
  .replace(/\b(?:font-family|font-size|line-height|text-decoration|background(?:-color)?|padding|margin|display|border(?:-[a-z]+)?|color|width|height)\s*:[^;\n}]+;?/gi," ")
  .replace(/!important\b/gi," ");
 return cleanReadableText(text);
}
function textParts(part:GmailPart|undefined,mimeType:"text/plain"|"text/html",out:string[]=[]){
 if(!part)return out;
 if(part.mimeType===mimeType&&part.body?.data&&!part.filename){const decoded=decodeQuotedPrintable(decode(part.body.data));if(decoded.trim())out.push(decoded);}
 for(const child of part.parts??[])textParts(child,mimeType,out);
 return out;
}
function bodyFrom(part?:GmailPart):string{
 const plainRaw=textParts(part,"text/plain").map(v=>v.trim()).filter(Boolean);
 const htmlRaw=textParts(part,"text/html").filter(Boolean);
 const plainJoined=plainRaw.join("\n\n");
 const htmlClean=htmlRaw.map(htmlToText).filter(Boolean).join("\n\n");
 if(plainJoined&&!looksLikeTechnicalMarkup(plainJoined))return cleanReadableText(decodeEntities(plainJoined));
 if(htmlClean)return cleanReadableText(htmlClean);
 if(plainJoined)return cleanPollutedPlainText(plainJoined);
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
