import "server-only";
import { accessTokenFor } from "@/lib/google/gmail";

export type AdvancedGmailAttachment={filename:string;mimeType:string;data:Buffer|Uint8Array};
export type AdvancedGmailInput={to:string[];cc?:string[];bcc?:string[];subject:string;text:string;threadId?:string;inReplyToGmailId?:string;attachments?:AdvancedGmailAttachment[]};

function safeHeader(value:string){return value.replace(/[\r\n]/g," ");}
function safeFilename(value:string){return value.replace(/[\r\n"\\]/g,"_").slice(0,180)||"attachment";}
function b64Lines(data:Buffer|Uint8Array){return Buffer.from(data).toString("base64").replace(/(.{76})/g,"$1\r\n");}
function base64Url(value:string){return Buffer.from(value).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}

export async function gmailSendAdvanced(accountId:string,input:AdvancedGmailInput):Promise<string>{
 const {token,email}=await accessTokenFor(accountId);
 if(!input.to.length)throw new Error("At least one recipient is required");
 const attachments=input.attachments??[];
 const headers=[
  `From: ${safeHeader(email)}`,
  `To: ${safeHeader(input.to.join(", "))}`,
  ...(input.cc?.length?[`Cc: ${safeHeader(input.cc.join(", "))}`]:[]),
  ...(input.bcc?.length?[`Bcc: ${safeHeader(input.bcc.join(", "))}`]:[]),
  `Subject: ${safeHeader(input.subject)}`,
  ...(input.inReplyToGmailId?[`In-Reply-To: <${safeHeader(input.inReplyToGmailId)}@mail.gmail.com>`,`References: <${safeHeader(input.inReplyToGmailId)}@mail.gmail.com>`]:[]),
  "MIME-Version: 1.0",
 ];
 let message:string;
 if(!attachments.length){
  message=`${[...headers,'Content-Type: text/plain; charset="UTF-8"'].join("\r\n")}\r\n\r\n${input.text}`;
 }else{
  const boundary=`jun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const parts=[`--${boundary}`,'Content-Type: text/plain; charset="UTF-8"',"Content-Transfer-Encoding: 8bit","",input.text];
  for(const attachment of attachments){const filename=safeFilename(attachment.filename);parts.push(`--${boundary}`,`Content-Type: ${safeHeader(attachment.mimeType||"application/octet-stream")}; name="${filename}"`,`Content-Disposition: attachment; filename="${filename}"`,"Content-Transfer-Encoding: base64","",b64Lines(attachment.data));}
  parts.push(`--${boundary}--`,"");
  message=`${[...headers,`Content-Type: multipart/mixed; boundary="${boundary}"`].join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
 }
 const payload:Record<string,string>={raw:base64Url(message)};
 if(input.threadId)payload.threadId=input.threadId;
 const res=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
 if(!res.ok)throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
 const data=await res.json() as {id?:string};
 if(!data.id)throw new Error("Gmail send returned no message id");
 return data.id;
}
