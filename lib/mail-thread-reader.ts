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
function decode(data?:string){return data?Buffer.from(data.replace(/-/g,"+").replace(/_/g,"/"),"base64").toString("utf8"):"";}
function htmlToText(value:string){return value.replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\n{3,}/g,"\n\n").replace(/[ \t]{2,}/g," ").trim();}
function bodyFrom(part?:GmailPart):string{if(!part)return "";if(part.mimeType==="text/plain"&&part.body?.data)return decode(part.body.data);for(const p of part.parts??[]){const value=bodyFrom(p);if(value)return value;}if(part.mimeType==="text/html"&&part.body?.data)return htmlToText(decode(part.body.data));if(part.body?.data)return decode(part.body.data);return "";}
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
