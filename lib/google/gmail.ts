import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { getMailThreadState, saveMailThreadState } from "@/lib/mail-thread-state";
import { isClientCommunicationBanned } from "@/lib/client-communication-policy";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function googleConfigured(): boolean { return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI); }
export function googleAuthUrl(state: string): string { const p = new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID??"",redirect_uri:process.env.GOOGLE_REDIRECT_URI??"",response_type:"code",scope:SCOPES,access_type:"offline",prompt:"consent",state}); return `https://accounts.google.com/o/oauth2/v2/auth?${p}`; }

export async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number; email: string; scope: string }> {
  const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID??"",client_secret:process.env.GOOGLE_CLIENT_SECRET??"",redirect_uri:process.env.GOOGLE_REDIRECT_URI??"",grant_type:"authorization_code"})});
  if(!res.ok)throw new Error(`Google token exchange failed: ${await res.text()}`);
  const t=await res.json() as {access_token:string;refresh_token?:string;expires_in:number;scope:string};
  const who=await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:`Bearer ${t.access_token}`}});const info=await who.json() as {email?:string};if(!info.email)throw new Error("Could not read the Google account email");
  return {accessToken:t.access_token,refreshToken:t.refresh_token,expiresIn:t.expires_in,email:info.email,scope:t.scope};
}

export async function accessTokenFor(accountId:string):Promise<{token:string;email:string}>{
  const acc=await prisma.mailAccount.findUnique({where:{id:accountId}});if(!acc)throw new Error("Mailbox not found");
  if(acc.accessTokenEnc&&acc.tokenExpiry&&acc.tokenExpiry.getTime()>Date.now()+60_000)return{token:decryptSecret(acc.accessTokenEnc),email:acc.email};
  if(!acc.refreshTokenEnc)throw new Error("Mailbox not connected — reconnect it in Settings → Email");
  const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({refresh_token:decryptSecret(acc.refreshTokenEnc),client_id:process.env.GOOGLE_CLIENT_ID??"",client_secret:process.env.GOOGLE_CLIENT_SECRET??"",grant_type:"refresh_token"})});
  if(!res.ok)throw new Error(`Google token refresh failed: ${await res.text()}`);const t=await res.json() as {access_token:string;expires_in:number};
  await prisma.mailAccount.update({where:{id:acc.id},data:{accessTokenEnc:encryptSecret(t.access_token),tokenExpiry:new Date(Date.now()+t.expires_in*1000)}});return{token:t.access_token,email:acc.email};
}

export async function saveConnectedAccount(input:{email:string;accessToken:string;refreshToken?:string;expiresIn:number;scope:string;connectedById:string}){
  return prisma.mailAccount.upsert({where:{email:input.email},update:{accessTokenEnc:encryptSecret(input.accessToken),tokenExpiry:new Date(Date.now()+input.expiresIn*1000),...(input.refreshToken?{refreshTokenEnc:encryptSecret(input.refreshToken)}:{})},create:{email:input.email,accessTokenEnc:encryptSecret(input.accessToken),refreshTokenEnc:input.refreshToken?encryptSecret(input.refreshToken):null,tokenExpiry:new Date(Date.now()+input.expiresIn*1000)}});
}

const GMAIL="https://gmail.googleapis.com/gmail/v1/users/me";
async function gmail<T>(token:string,path:string,init?:RequestInit):Promise<T>{const res=await fetch(`${GMAIL}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(init?.headers??{})}});if(!res.ok)throw new Error(`Gmail API ${path}: ${res.status} ${await res.text()}`);return res.json() as Promise<T>;}

type GmailHeader={name:string;value:string};
type GmailMessage={id:string;threadId:string;labelIds?:string[];snippet?:string;payload?:{headers?:GmailHeader[];body?:{data?:string};parts?:{mimeType?:string;body?:{data?:string};parts?:unknown[]}[]};internalDate?:string};
type GmailLabel={id:string;name:string;messagesTotal?:number;messagesUnread?:number;threadsTotal?:number;threadsUnread?:number};
function header(m:GmailMessage,name:string){return m.payload?.headers?.find(h=>h.name.toLowerCase()===name.toLowerCase())?.value??"";}
function decodeBody(m:GmailMessage){const b64=(d?:string)=>d?Buffer.from(d.replace(/-/g,"+").replace(/_/g,"/"),"base64").toString("utf8"):"";const walk=(parts:NonNullable<GmailMessage["payload"]>["parts"]):string=>{for(const p of parts??[]){if(p.mimeType==="text/plain"&&p.body?.data)return b64(p.body.data);const nested=walk(p.parts as never);if(nested)return nested;}return""};return b64(m.payload?.body?.data)||walk(m.payload?.parts);}

export async function getGmailSystemLabelStats(accountId:string){
  const {token}=await accessTokenFor(accountId);const ids=["INBOX","SENT","DRAFT","TRASH","SPAM","STARRED","IMPORTANT"] as const;
  const rows=await Promise.all(ids.map(async id=>{try{return await gmail<GmailLabel>(token,`/labels/${id}`)}catch{return{id,name:id} as GmailLabel}}));
  return Object.fromEntries(rows.map(r=>[r.id,{messagesTotal:r.messagesTotal??0,messagesUnread:r.messagesUnread??0,threadsTotal:r.threadsTotal??0,threadsUnread:r.threadsUnread??0}])) as Record<string,{messagesTotal:number;messagesUnread:number;threadsTotal:number;threadsUnread:number}>;
}

const FOLDER_QUERY:Record<string,string>={INBOX:"in:inbox",SENT:"in:sent",DRAFTS:"in:drafts",IMPORTANT:"is:important"};
async function syncStateFromLabels(threadId:string,labelIds:string[]|undefined){const labels=new Set(labelIds??[]),current=await getMailThreadState(threadId);const next={...current,isRead:!labels.has("UNREAD"),starred:labels.has("STARRED"),trashed:labels.has("TRASH"),archived:!labels.has("INBOX")&&!labels.has("TRASH")&&!labels.has("SPAM")&&!labels.has("SENT")&&!labels.has("DRAFT"),updatedAt:new Date().toISOString(),updatedById:null};if(current.starred!==next.starred||current.trashed!==next.trashed||current.archived!==next.archived||current.isRead!==next.isRead)await saveMailThreadState(next);}

export async function syncFolder(accountId:string,folder:"INBOX"|"SENT"|"DRAFTS"|"IMPORTANT",max=250):Promise<number>{
  const {token}=await accessTokenFor(accountId);let created=0,seen=0,pageToken:string|undefined;const processedThreads=new Set<string>();
  while(seen<max){
    const pageSize=Math.min(100,max-seen);const path=`/messages?maxResults=${pageSize}&q=${encodeURIComponent(FOLDER_QUERY[folder])}${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:""}`;
    const list=await gmail<{messages?:{id:string;threadId:string}[];nextPageToken?:string}>(token,path);const refs=list.messages??[];if(!refs.length)break;
    for(const ref of refs){
      seen++;if(processedThreads.has(ref.threadId))continue;processedThreads.add(ref.threadId);
      const m=await gmail<GmailMessage>(token,`/messages/${ref.id}?format=full`);
      const subject=header(m,"Subject")||"(no subject)",from=header(m,"From"),to=header(m,"To"),body=decodeBody(m).slice(0,20_000),snippet=m.snippet?.slice(0,500)||body.slice(0,500)||null;
      const emails=`${from} ${to}`.match(/[\w.+-]+@[\w.-]+\.\w+/g)??[];
      const client=emails.length?await prisma.client.findFirst({where:{email:{in:emails.map(e=>e.toLowerCase())}},select:{id:true}}):null;
      if(folder==="INBOX"&&client&&await isClientCommunicationBanned(client.id)){
        await gmail(token,`/threads/${m.threadId}/modify`,{method:"POST",body:JSON.stringify({addLabelIds:["TRASH"],removeLabelIds:["INBOX","UNREAD"]})}).catch(()=>null);
        await prisma.activity.create({data:{clientId:client.id,type:"CLIENT_COMMUNICATION_BLOCKED_INBOUND",message:`Inbound email auto-trashed · ${subject}`,resourceType:"Client",resourceId:client.id}}).catch(()=>null);
        continue;
      }
      const existing=await prisma.mailThread.findFirst({where:{gmailThreadId:m.threadId,mailAccountId:accountId},select:{id:true}});const when=m.internalDate?new Date(Number(m.internalDate)):new Date();
      const thread=existing?await prisma.mailThread.update({where:{id:existing.id},data:{subject,snippet,fromEmail:from.slice(0,300)||null,toEmails:emails,lastMessageAt:when,...(client?{clientId:client.id}:{}),...(folder==="IMPORTANT"?{requiresAttention:true}:{}),...(folder==="DRAFTS"?{aiDraft:body||m.snippet||""}:{})}}):await prisma.mailThread.create({data:{gmailThreadId:m.threadId,mailAccountId:accountId,clientId:client?.id??null,subject,snippet,fromEmail:from.slice(0,300)||null,toEmails:emails,lastMessageAt:when,requiresAttention:folder==="IMPORTANT",aiDraft:folder==="DRAFTS"?body||m.snippet||"":null}});
      await syncStateFromLabels(thread.id,m.labelIds);if(!existing)created++;
    }
    if(!list.nextPageToken)break;pageToken=list.nextPageToken;
  }
  return created;
}

export async function syncMailboxRecent(accountId:string,maxPerFolder=250){let total=0;for(const folder of ["INBOX","SENT","DRAFTS","IMPORTANT"] as const)total+=await syncFolder(accountId,folder,maxPerFolder);return total;}

type GmailAttachment={filename:string;mimeType:string;data:Buffer|Uint8Array};
function safeHeaderValue(value:string){return value.replace(/[\r\n]/g," ");}function safeFilename(value:string){return value.replace(/[\r\n"\\]/g,"_").slice(0,180)||"attachment";}function base64Lines(data:Buffer|Uint8Array){return Buffer.from(data).toString("base64").replace(/(.{76})/g,"$1\r\n");}function base64Url(value:string){return Buffer.from(value).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
export async function gmailSend(accountId:string,input:{to:string;subject:string;text:string;inReplyToGmailId?:string;attachments?:GmailAttachment[]}):Promise<string>{const{token,email}=await accessTokenFor(accountId),attachments=input.attachments??[],common=[`From: ${safeHeaderValue(email)}`,`To: ${safeHeaderValue(input.to)}`,`Subject: ${safeHeaderValue(input.subject)}`,"MIME-Version: 1.0"];let message:string;if(!attachments.length)message=`${[...common,'Content-Type: text/plain; charset="UTF-8"'].join("\r\n")}\r\n\r\n${input.text}`;else{const boundary=`jun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,parts=[`--${boundary}`,'Content-Type: text/plain; charset="UTF-8"',"Content-Transfer-Encoding: 8bit","",input.text];for(const attachment of attachments){const filename=safeFilename(attachment.filename);parts.push(`--${boundary}`,`Content-Type: ${safeHeaderValue(attachment.mimeType||"application/octet-stream")}; name="${filename}"`,"Content-Transfer-Encoding: base64",`Content-Disposition: attachment; filename="${filename}"`,"",base64Lines(attachment.data));}parts.push(`--${boundary}--`,"");message=`${[...common,`Content-Type: multipart/mixed; boundary="${boundary}"`].join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;}const raw=base64Url(message);const res=await gmail<{id:string}>(token,"/messages/send",{method:"POST",body:JSON.stringify({raw})});return res.id;}
export async function markGmailRead(accountId:string,gmailThreadId:string):Promise<void>{const{token}=await accessTokenFor(accountId);await gmail(token,`/threads/${gmailThreadId}/modify`,{method:"POST",body:JSON.stringify({removeLabelIds:["UNREAD"]})});}
