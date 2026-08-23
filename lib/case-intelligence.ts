import "server-only";

import { getCaseClosureReadiness } from "@/lib/case-closure";

export type CaseRiskLevel="LOW"|"MEDIUM"|"HIGH"|"CRITICAL";
export type CaseInsight={
 id:string;
 severity:CaseRiskLevel;
 area:"OPERATIONS"|"FINANCE"|"DOCUMENTS"|"COMMUNICATIONS"|"CLOSURE";
 title:string;
 detail:string;
 action:string;
 href:string;
 weight:number;
};

function level(score:number):CaseRiskLevel{
 if(score>=75)return "CRITICAL";
 if(score>=45)return "HIGH";
 if(score>=20)return "MEDIUM";
 return "LOW";
}

export async function getCaseIntelligence(caseId:string){
 const readiness=await getCaseClosureReadiness(caseId);
 if(!readiness)return null;
 const {case:c,finance,opFacts,criticalCommunications,finalDocuments,hardBlockers}=readiness;
 const insights:CaseInsight[]=[];
 const add=(x:CaseInsight)=>insights.push(x);
 const now=Date.now();
 const caseOverdue=Boolean(c.dueDate&&c.dueDate.getTime()<now&&!["COMPLETED","CANCELLED","ARCHIVED"].includes(c.status));

 if(caseOverdue)add({id:"case-overdue",severity:"HIGH",area:"OPERATIONS",title:"Case deadline has passed",detail:`The Case due date was ${c.dueDate?.toISOString().slice(0,10)} and the service is still ${c.status.replaceAll("_"," ")}.`,action:"Review deadlines and update the operational plan.",href:`/app/cases/${caseId}/operations`,weight:22});
 if(opFacts.blockedMilestones.length)add({id:"blocked-milestones",severity:"HIGH",area:"OPERATIONS",title:`${opFacts.blockedMilestones.length} blocked milestone(s)`,detail:"One or more operational stages contain an active blocker and cannot advance normally.",action:"Resolve or document each blocker before the Case progresses.",href:`/app/cases/${caseId}/operations`,weight:Math.min(24,12+opFacts.blockedMilestones.length*4)});
 if(opFacts.overdueTasks.length||opFacts.overdueMilestones.length)add({id:"overdue-work",severity:"HIGH",area:"OPERATIONS",title:"Operational work is overdue",detail:`${opFacts.overdueTasks.length} task(s) and ${opFacts.overdueMilestones.length} milestone(s) are past due.`,action:"Reassign, complete or reschedule overdue work.",href:`/app/cases/${caseId}/operations`,weight:18});
 if(hardBlockers.openTasks.length)add({id:"open-tasks",severity:"MEDIUM",area:"OPERATIONS",title:`${hardBlockers.openTasks.length} open task(s)`,detail:"The Case still has unfinished day-to-day work.",action:"Complete or formally cancel tasks that are no longer required.",href:`/app/cases/${caseId}/operations`,weight:Math.min(12,4+hardBlockers.openTasks.length)});
 if(hardBlockers.openMilestones.length)add({id:"open-milestones",severity:"MEDIUM",area:"OPERATIONS",title:`${hardBlockers.openMilestones.length} active milestone(s)`,detail:"Major operational stages remain incomplete.",action:"Complete the outstanding service stages.",href:`/app/cases/${caseId}/operations`,weight:10});

 if(hardBlockers.openInvoices.length)add({id:"open-invoices",severity:"HIGH",area:"FINANCE",title:`${hardBlockers.openInvoices.length} invoice(s) with balance`,detail:"The Case has invoiced amounts that have not been fully settled.",action:"Review receivables and payment allocation before closure.",href:`/app/cases/${caseId}/finance`,weight:22});
 if(hardBlockers.pendingPayments.length)add({id:"pending-payments",severity:"HIGH",area:"FINANCE",title:`${hardBlockers.pendingPayments.length} pending payment(s)`,detail:"Payment confirmation is still unresolved.",action:"Confirm, reject or correct pending payment records.",href:`/app/cases/${caseId}/finance`,weight:18});
 if(hardBlockers.openRefunds.length)add({id:"open-refunds",severity:"CRITICAL",area:"FINANCE",title:`${hardBlockers.openRefunds.length} refund obligation(s) remain`,detail:"At least one refund linked to this Case still has an unpaid balance.",action:"Complete the approved refund workflow before closing the Case.",href:`/app/cases/${caseId}/finance`,weight:28});
 if(hardBlockers.openExpenses.length)add({id:"open-expenses",severity:"HIGH",area:"FINANCE",title:`${hardBlockers.openExpenses.length} expense(s) unfinished`,detail:"One or more Case expenses are not in a terminal financial status.",action:"Approve, pay, reject or cancel the outstanding expense records.",href:`/app/cases/${caseId}/finance`,weight:18});
 if(hardBlockers.allocationAnomalies.length)add({id:"allocation-anomaly",severity:"CRITICAL",area:"FINANCE",title:"Payment allocation anomaly detected",detail:`${hardBlockers.allocationAnomalies.length} payment(s) are allocated above their available net amount.`,action:"Correct payment allocations immediately to prevent double counting.",href:`/app/cases/${caseId}/finance`,weight:32});
 for(const s of finance.summaries){if(s.realizedProfit<0)add({id:`loss-${s.currency}`,severity:"HIGH",area:"FINANCE",title:`Realized loss in ${s.currency}`,detail:`The Case currently shows a realized profit/loss of ${s.realizedProfit.toFixed(2)} ${s.currency}.`,action:"Review revenue, refunds and paid costs before finalizing the service.",href:`/app/cases/${caseId}/finance`,weight:18});}

 if(criticalCommunications.length)add({id:"critical-comms",severity:"HIGH",area:"COMMUNICATIONS",title:`${criticalCommunications.length} critical communication(s)`,detail:"The communication register contains exchanges marked CRITICAL that require review.",action:"Review the critical exchanges and confirm any unresolved commitment or dispute.",href:`/app/cases/${caseId}/history`,weight:20});
 if(c.documents.length===0&&c.files.length===0)add({id:"no-documents",severity:"MEDIUM",area:"DOCUMENTS",title:"No supporting records attached",detail:"This Case currently has no official document or Drive file linked to it.",action:"Attach the records needed to support the service history.",href:`/app/cases/${caseId}/documents`,weight:10});
 if(readiness.ready&&finalDocuments.length===0)add({id:"final-document",severity:"MEDIUM",area:"DOCUMENTS",title:"Case is operationally ready but has no FINAL document",detail:"All hard closure blockers are cleared, but there is no FINAL or SIGNED official document linked to the Case.",action:"Prepare the appropriate final service record before closure when required.",href:`/app/cases/${caseId}/documents`,weight:8});

 const score=Math.min(100,insights.reduce((s,i)=>s+i.weight,0));
 const riskLevel=level(score);
 const ordered=insights.sort((a,b)=>b.weight-a.weight||a.title.localeCompare(b.title));
 const nextActions=ordered.slice(0,5);
 const health={operations:opFacts.progress,closureReady:readiness.ready,financialCurrencies:finance.summaries.length,criticalCommunications:criticalCommunications.length,finalDocuments:finalDocuments.length};
 return {case:c,score,riskLevel,insights:ordered,nextActions,health,readiness};
}
