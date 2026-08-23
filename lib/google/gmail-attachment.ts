import "server-only";
import { accessTokenFor } from "@/lib/google/gmail";

type GmailPart={mimeType?:string;filename?:string;body?:{attachmentId?:string;size?:number;data?:string};parts?:GmailPart[]};
type GmailMessage={id:string;threadId:string;payload?:GmailPart};
function findPart(part:GmailPart|undefined,attachmentId:string):GmailPart|null{if(!part)return null;if(part.body?.attachmentId===attachmentId)return part;for(const child of part.parts??[]){const found=findPart(child,attachmentId);if(found)return found;}return null;}
function decodeBase64Url(data:string){return Buffer.from(data.replace(/-/g,"+").replace(/_/g,"/"),"base64");}

export async function downloadGmailAttachment(accountId:string,messageId:string,attachmentId:string){
 const {token}=await accessTokenFor(accountId);
 const messageRes=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
 if(!messageRes.ok)throw new Error(`Gmail message read failed: ${messageRes.status}`);
 const message=await messageRes.json() as GmailMessage;
 const part=findPart(message.payload,attachmentId);
 if(!part||!part.filename)throw new Error("Attachment metadata not found in Gmail message");
 const attachmentRes=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
 if(!attachmentRes.ok)throw new Error(`Gmail attachment download failed: ${attachmentRes.status}`);
 const payload=await attachmentRes.json() as {data?:string;size?:number};
 if(!payload.data)throw new Error("Gmail attachment has no data");
 const data=decodeBase64Url(payload.data);
 return{data,filename:part.filename.slice(0,180),mimeType:part.mimeType||"application/octet-stream",size:data.length,threadId:message.threadId};
}
