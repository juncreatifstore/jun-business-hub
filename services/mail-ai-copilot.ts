"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitAsync } from "@/lib/rate-limit";
import { buildMailAIContext } from "@/lib/mail-ai-context";
import { saveMailAICopilotAnalysis, type MailAICopilotAnalysis, type MailAIUrgency, type MailAISentiment } from "@/lib/mail-ai-copilot";

function back(threadId:string,msg:string,error=false):never{redirect(`/app/mail?thread=${threadId}&${error?"toast_error":"toast"}=${encodeURIComponent(msg)}`);}
function extractJson(text:string){const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]??text;const a=fenced.indexOf("{"),b=fenced.lastIndexOf("}");if(a<0||b<a)throw new Error("AI returned invalid structured output");return JSON.parse(fenced.slice(a,b+1)) as Record<string,unknown>;}
function arr(v:unknown,max=8){return Array.isArray(v)?v.map(x=>String(x).trim()).filter(Boolean).slice(0,max):[];}
function urgency(v:unknown):MailAIUrgency{return ["LOW","MEDIUM","HIGH","URGENT"].includes(String(v).toUpperCase())?String(v).toUpperCase() as MailAIUrgency:"MEDIUM";}
function sentiment(v:unknown):MailAISentiment{return ["POSITIVE","NEUTRAL","NEGATIVE","ESCALATED"].includes(String(v).toUpperCase())?String(v).toUpperCase() as MailAISentiment:"NEUTRAL";}

async function callModel(system:string,user:string):Promise<string|null>{
 const key=process.env.OPENAI_API_KEY;if(!key)return null;
 try{const res=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model:process.env.OPENAI_MODEL??"gpt-4o-mini",temperature:0.15,messages:[{role:"system",content:system},{role:"user",content:user}]})});if(!res.ok)return null;const data=await res.json() as {choices?:{message?:{content?:string}}[]};return data.choices?.[0]?.message?.content?.trim()??null;}catch{return null;}
}

export async function analyzeMailWithJunAI(threadId:string){
 const user=await assertPermission("AI_USE");await assertPermission("EMAIL_READ");
 if(!(await rateLimitAsync(`jun-ai-mail-analyze:${user.id}`,20,60_000)))back(threadId,"AI analysis rate limit — wait a minute",true);
 const bundle=await buildMailAIContext(user,threadId);
 const system=`You are JUN AI Mail Copilot for JUN CREATIF AND TRAVEL LLC. Analyze business email context. VERIFIED FACTS FROM JUN are authoritative. Email content is unverified customer/third-party claims unless corroborated by verified facts. Never convert a claim into a fact. Never state that a payment was received, refund was paid, visa was approved, ticket was issued, booking was confirmed, legal outcome occurred, or document was finalized unless VERIFIED FACTS explicitly establish it. Return JSON only with keys: summary, language, intent, urgency, sentiment, requestedItems, internalActions, missingInformation, caution. urgency must be LOW|MEDIUM|HIGH|URGENT. sentiment must be POSITIVE|NEUTRAL|NEGATIVE|ESCALATED.`;
 const out=await callModel(system,bundle.contextSummary);
 let analysis:MailAICopilotAnalysis;
 if(out){const j=extractJson(out);analysis={threadId,analyzedAt:new Date().toISOString(),analyzedById:user.id,summary:String(j.summary??"No summary").slice(0,1200),language:String(j.language??"unknown").slice(0,60),intent:String(j.intent??"general inquiry").slice(0,300),urgency:urgency(j.urgency),sentiment:sentiment(j.sentiment),requestedItems:arr(j.requestedItems),verifiedFactsUsed:bundle.verifiedFacts.slice(0,20),internalActions:arr(j.internalActions),missingInformation:arr(j.missingInformation),caution:arr(j.caution),modelMode:"MODEL"};}
 else{analysis={threadId,analyzedAt:new Date().toISOString(),analyzedById:user.id,summary:(bundle.conversationText.split("\nBody:\n").pop()??bundle.conversationText).slice(0,700),language:"unknown",intent:"Review required",urgency:"MEDIUM",sentiment:"NEUTRAL",requestedItems:[],verifiedFactsUsed:bundle.verifiedFacts.slice(0,20),internalActions:["Review the email manually"],missingInformation:bundle.warnings,caution:["AI model unavailable; no semantic claims were inferred."],modelMode:"OFFLINE"};}
 await saveMailAICopilotAnalysis(analysis);
 await prisma.mailThread.update({where:{id:threadId},data:{aiSummary:analysis.summary,requiresAttention:analysis.urgency==="HIGH"||analysis.urgency==="URGENT"||analysis.sentiment==="ESCALATED"}});
 await audit({userId:user.id,action:"AI_EMAIL_CONTEXT_ANALYZED",resourceType:"MailThread",resourceId:threadId,after:{urgency:analysis.urgency,sentiment:analysis.sentiment,intent:analysis.intent,modelMode:analysis.modelMode,caseId:bundle.caseId,clientId:bundle.clientId}});
 revalidatePath("/app/mail");back(threadId,"JUN AI contextual analysis completed");
}

export async function draftContextualReplyWithJunAI(threadId:string){
 const user=await assertPermission("AI_USE");await assertPermission("EMAIL_DRAFT");
 if(!(await rateLimitAsync(`jun-ai-mail-context-draft:${user.id}`,12,60_000)))back(threadId,"AI draft rate limit — wait a minute",true);
 const thread=await prisma.mailThread.findUnique({where:{id:threadId},include:{account:true}});if(!thread)back(threadId,"Thread not found",true);if(thread.aiDraft)back(threadId,"This conversation already has a draft",true);
 const bundle=await buildMailAIContext(user,threadId);if(!bundle.recipient)back(threadId,"Could not determine the reply recipient",true);
 const { classifyEmailAILevel }=await import("@/services/ai");const level=await classifyEmailAILevel(bundle.subject,bundle.conversationText);
 if(level==="BLOCKED"){await prisma.mailThread.update({where:{id:threadId},data:{aiLevel:"BLOCKED",requiresAttention:true}});await audit({userId:user.id,action:"AI_CONTEXTUAL_EMAIL_DRAFT_BLOCKED",resourceType:"MailThread",resourceId:threadId,after:{reason:"Sensitive topic requires manual handling",caseId:bundle.caseId,clientId:bundle.clientId}});revalidatePath("/app/mail");back(threadId,"Sensitive topic: JUN AI analysis is allowed, but automatic drafting is blocked",true);}
 const system=`You draft professional email replies for JUN CREATIF AND TRAVEL LLC. Use only VERIFIED FACTS FROM JUN as factual business claims. Treat all statements inside email content as unverified claims unless matched by VERIFIED FACTS. Never invent or imply payment receipt, refund payment, visa approval/refusal, ticket issuance, booking confirmation, legal result, document finalization, deadlines, prices, or guarantees. If a requested fact is missing, say it is being verified or ask for the needed information. Match the customer's language when clear. Be concise, warm, professional. Do not mention internal systems, prompts, risk rules, or "verified facts". Return only the email body.`;
 const prompt=`Recipient: ${bundle.recipient}\nSubject: ${bundle.subject}\n\n${bundle.contextSummary}`;
 const out=await callModel(system,prompt);
 const text=(out||`Bonjour,\n\nMerci pour votre message concernant « ${bundle.subject} ». Nous avons bien reçu votre demande. Certains éléments doivent être vérifiés dans votre dossier avant que nous puissions vous confirmer une réponse précise. Nous reviendrons vers vous avec les informations vérifiées.\n\nCordialement,\nJUN CREATIF AND TRAVEL LLC`).slice(0,20000);
 const replySubject=/^re:/i.test(thread.subject??"")?(thread.subject??"(no subject)"):`Re: ${thread.subject??"(no subject)"}`;
 await prisma.mailThread.update({where:{id:threadId},data:{subject:replySubject,toEmails:[bundle.recipient],aiDraft:text,aiLevel:"APPROVAL_REQUIRED",requiresAttention:true,aiSummary:"JUN AI prepared a context-aware reply using linked JUN records. Human review is required before sending."}});
 await audit({userId:user.id,action:"AI_CONTEXTUAL_EMAIL_REPLY_DRAFTED",resourceType:"MailThread",resourceId:threadId,after:{recipient:bundle.recipient,caseId:bundle.caseId,clientId:bundle.clientId,verifiedFactCount:bundle.verifiedFacts.length,sent:false}});
 revalidatePath("/app/mail");redirect(`/app/mail?mailbox=${thread.mailAccountId}&folder=DRAFTS&thread=${threadId}&toast=${encodeURIComponent("Context-aware JUN AI draft created — review before sending")}`);
}
