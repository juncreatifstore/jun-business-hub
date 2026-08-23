import "server-only";
import { prisma } from "@/lib/prisma";

const PREFIX="mail.ai.copilot.";
export type MailAIUrgency="LOW"|"MEDIUM"|"HIGH"|"URGENT";
export type MailAISentiment="POSITIVE"|"NEUTRAL"|"NEGATIVE"|"ESCALATED";
export type MailAICopilotAnalysis={
  threadId:string;
  analyzedAt:string;
  analyzedById:string;
  summary:string;
  language:string;
  intent:string;
  urgency:MailAIUrgency;
  sentiment:MailAISentiment;
  requestedItems:string[];
  verifiedFactsUsed:string[];
  internalActions:string[];
  missingInformation:string[];
  caution:string[];
  modelMode:"MODEL"|"OFFLINE";
};
function key(threadId:string){return `${PREFIX}${threadId}`;}
export async function getMailAICopilotAnalysis(threadId:string):Promise<MailAICopilotAnalysis|null>{
 const row=await prisma.appSetting.findUnique({where:{key:key(threadId)},select:{value:true}});if(!row)return null;
 try{const v=JSON.parse(row.value) as MailAICopilotAnalysis;return v?.threadId===threadId?v:null;}catch{return null;}
}
export async function saveMailAICopilotAnalysis(value:MailAICopilotAnalysis){
 await prisma.appSetting.upsert({where:{key:key(value.threadId)},update:{value:JSON.stringify(value)},create:{key:key(value.threadId),value:JSON.stringify(value)}});return value;
}
