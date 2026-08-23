import "server-only";

import { prisma } from "@/lib/prisma";
import { getCaseFinanceOverview } from "@/lib/case-finance-overview";
import { getCaseOperations, caseOperationFacts } from "@/lib/case-operations";
import { listCaseCommunications } from "@/lib/case-communications";

const PREFIX="case.closure.";
function key(caseId:string){return `${PREFIX}${caseId}`;}

export type CaseClosureSnapshot={
 caseId:string;caseNumber:string;clientId:string;closedAt:string;closedById:string;summary:string;criticalReviewed:boolean;
 operations:{tasksTotal:number;tasksDone:number;milestonesTotal:number;milestonesDone:number};
 documents:{official:number;drive:number;final:number};
 finance:Array<{currency:string;billed:number;invoicePaid:number;receivable:number;refundsPaid:number;expensePaid:number;realizedProfit:number;forecastProfit:number}>;
};

export async function getCaseClosureSnapshot(caseId:string):Promise<CaseClosureSnapshot|null>{
 const row=await prisma.appSetting.findUnique({where:{key:key(caseId)},select:{value:true}}).catch(()=>null);
 if(!row)return null;try{return JSON.parse(row.value) as CaseClosureSnapshot;}catch{return null;}
}

export async function saveCaseClosureSnapshot(snapshot:CaseClosureSnapshot){
 await prisma.appSetting.upsert({where:{key:key(snapshot.caseId)},create:{key:key(snapshot.caseId),value:JSON.stringify(snapshot)},update:{value:JSON.stringify(snapshot)}});
}

export async function getCaseClosureReadiness(caseId:string){
 const [c,finance,ops,communications]=await Promise.all([
  prisma.case.findUnique({where:{id:caseId},include:{client:true,tasks:true,documents:true,files:{where:{isVault:false,archivedAt:null}}}}),
  getCaseFinanceOverview(caseId),getCaseOperations(caseId),listCaseCommunications(caseId),
 ]);
 if(!c||!finance)return null;
 const opFacts=caseOperationFacts(ops.milestones,c.tasks);
 const openTasks=c.tasks.filter(t=>!["DONE","CANCELLED"].includes(t.status));
 const openMilestones=ops.milestones.filter(m=>!["DONE","CANCELLED"].includes(m.status));
 const openInvoices=finance.invoices.filter(x=>x.invoice.status!=="CANCELLED"&&x.state.balance>0.009);
 const pendingPayments=finance.payments.filter(p=>p.status==="PENDING");
 const openRefunds=finance.refunds.filter(r=>!["REJECTED","CANCELLED"].includes(r.status)&&r.remainingNumber>0.009);
 const openExpenses=finance.expenses.filter(e=>!["PAID","REJECTED","CANCELLED"].includes(e.effectiveStatus));
 const allocationAnomalies=finance.payments.filter(p=>p.overallocated>0.009);
 const criticalCommunications=communications.filter(c=>c.importance==="CRITICAL");
 const finalDocuments=c.documents.filter(d=>d.status==="FINAL"||d.status==="SIGNED");
 const hardBlockers={openTasks,openMilestones,openInvoices,pendingPayments,openRefunds,openExpenses,allocationAnomalies};
 const ready=Object.values(hardBlockers).every(v=>v.length===0);
 return {case:c,finance,operations:ops,opFacts,communications,criticalCommunications,finalDocuments,hardBlockers,ready};
}
