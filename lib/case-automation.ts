import "server-only";

import { prisma } from "@/lib/prisma";
import { getCaseIntelligence, type CaseInsight } from "@/lib/case-intelligence";

const CONFIG_PREFIX="case.automation.config.";
const RUN_PREFIX="case.automation.run.";

export type CaseAutomationConfig={
 caseId:string;
 enabled:boolean;
 createFollowUpTasks:boolean;
 escalatePriority:boolean;
 notifyOwner:boolean;
 updatedAt:string;
 updatedById:string;
};

export type CaseAutomationRun={
 id:string;
 caseId:string;
 ranAt:string;
 ranById:string;
 riskScore:number;
 riskLevel:string;
 tasksCreated:number;
 tasksSkipped:number;
 priorityBefore:string;
 priorityAfter:string;
 actions:string[];
};

function configKey(caseId:string){return `${CONFIG_PREFIX}${caseId}`;}
function runKey(caseId:string,runId:string){return `${RUN_PREFIX}${caseId}.${runId}`;}

export async function getCaseAutomationConfig(caseId:string):Promise<CaseAutomationConfig>{
 const row=await prisma.appSetting.findUnique({where:{key:configKey(caseId)},select:{value:true}}).catch(()=>null);
 if(row?.value){try{return JSON.parse(row.value) as CaseAutomationConfig;}catch{}}
 return {caseId,enabled:true,createFollowUpTasks:true,escalatePriority:true,notifyOwner:true,updatedAt:new Date(0).toISOString(),updatedById:"SYSTEM"};
}

export async function saveCaseAutomationConfig(config:CaseAutomationConfig){
 const value=JSON.stringify(config);
 await prisma.appSetting.upsert({where:{key:configKey(config.caseId)},create:{key:configKey(config.caseId),value},update:{value}});
 return config;
}

export async function saveCaseAutomationRun(run:CaseAutomationRun){
 await prisma.appSetting.create({data:{key:runKey(run.caseId,run.id),value:JSON.stringify(run)}});
}

export async function listCaseAutomationRuns(caseId:string){
 const rows=await prisma.appSetting.findMany({where:{key:{startsWith:`${RUN_PREFIX}${caseId}.`}},take:100,select:{value:true}});
 return rows
  .map(r=>{try{return JSON.parse(r.value) as CaseAutomationRun;}catch{return null;}})
  .filter((v):v is CaseAutomationRun=>v!==null)
  .sort((a,b)=>new Date(b.ranAt).getTime()-new Date(a.ranAt).getTime())
  .slice(0,30);
}

export function automationTaskTitle(insight:CaseInsight){return `[AUTO:${insight.id}] ${insight.action}`.slice(0,240);}

export function suggestedTaskPriority(insight:CaseInsight){
 if(insight.severity==="CRITICAL")return "URGENT" as const;
 if(insight.severity==="HIGH")return "HIGH" as const;
 return "MEDIUM" as const;
}

export function suggestedDueDate(insight:CaseInsight){
 const d=new Date();
 d.setDate(d.getDate()+(insight.severity==="CRITICAL"?1:insight.severity==="HIGH"?2:4));
 d.setHours(17,0,0,0);
 return d;
}

export function targetCasePriority(current:string,riskLevel:string){
 const rank:Record<string,number>={LOW:0,MEDIUM:1,HIGH:2,URGENT:3};
 const target=riskLevel==="CRITICAL"?"URGENT":riskLevel==="HIGH"?"HIGH":riskLevel==="MEDIUM"?"MEDIUM":current;
 return (rank[target]??0)>(rank[current]??0)?target:current;
}

export async function getCaseAutomationPlan(caseId:string){
 const intelligence=await getCaseIntelligence(caseId);
 if(!intelligence)return null;
 const config=await getCaseAutomationConfig(caseId);
 const activeTitles=await prisma.task.findMany({where:{caseId,status:{notIn:["DONE","CANCELLED"]}},select:{title:true}});
 const existing=new Set(activeTitles.map(t=>t.title));
 const candidates=intelligence.nextActions.map(insight=>({insight,title:automationTaskTitle(insight),priority:suggestedTaskPriority(insight),dueDate:suggestedDueDate(insight)}));
 return {intelligence,config,candidates:candidates.map(c=>({...c,alreadyExists:existing.has(c.title)})),targetPriority:targetCasePriority(intelligence.case.priority,intelligence.riskLevel)};
}
