import "server-only";

import { prisma } from "@/lib/prisma";
import { getCaseIntelligence } from "@/lib/case-intelligence";
import { getCaseAutomationPlan, listCaseAutomationRuns } from "@/lib/case-automation";
import { getCaseClosureSnapshot } from "@/lib/case-closure";

export async function getCaseReport(caseId:string){
 const [intel,automation,closure]=await Promise.all([
  getCaseIntelligence(caseId),
  getCaseAutomationPlan(caseId),
  getCaseClosureSnapshot(caseId),
 ]);
 if(!intel)return null;
 const c=await prisma.case.findUnique({where:{id:caseId},include:{
  client:{select:{id:true,internalId:true,firstName:true,lastName:true,email:true,phone:true,country:true}},
  owner:{select:{id:true,firstName:true,lastName:true,email:true}},
  tasks:{orderBy:{createdAt:"asc"},include:{assignee:{select:{firstName:true,lastName:true}}}},
  notes:{orderBy:{createdAt:"asc"},include:{author:{select:{firstName:true,lastName:true}}}},
  documents:{orderBy:{updatedAt:"desc"},select:{id:true,documentId:true,title:true,type:true,status:true,updatedAt:true}},
  files:{where:{isVault:false,archivedAt:null},orderBy:{createdAt:"desc"},select:{id:true,name:true,category:true,mimeType:true,createdAt:true}},
  activities:{orderBy:{createdAt:"desc"},take:100,include:{user:{select:{firstName:true,lastName:true}}}},
 }});
 if(!c)return null;
 const runs=await listCaseAutomationRuns(caseId);
 const readiness=intel.readiness;
 const reportReference=`CASE-REPORT-${c.caseNumber}`;
 const executiveSummary=[
  `${c.caseNumber} is currently ${c.status.replaceAll("_"," ")} with ${intel.health.operations}% operational progress.`,
  `Deterministic risk is ${intel.riskLevel} (${intel.score}/100) with ${intel.insights.length} active insight(s).`,
  readiness.ready?"No hard closure blocker is currently detected.":`${Object.values(readiness.hardBlockers).reduce((n,v)=>n+v.length,0)} hard closure blocker item(s) remain.`,
 ].join(" ");
 return {
  generatedAt:new Date(),reportReference,executiveSummary,case:c,
  intelligence:intel,
  automation:{plan:automation,runs},
  closure,
  operations:{milestones:readiness.operations.milestones,facts:readiness.opFacts},
  communications:readiness.communications,
  finance:readiness.finance,
 };
}
