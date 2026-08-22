import "server-only";
import { prisma } from "@/lib/prisma";
import { getClientFinancialAccount } from "@/lib/client-financial-account";
import { getClientFinanceOverview } from "@/lib/client-finance-overview";

const PREFIX="client.termination.";
export type TerminationStatus="REVIEW"|"SETTLING"|"READY_TO_SIGN"|"READY_TO_TERMINATE"|"TERMINATED"|"CANCELLED";
export type ClientTerminationRecord={
  clientId:string;status:TerminationStatus;reason:string;startedAt:string;startedById:string;
  signedDocumentId:string|null;packageDeliveredAt:string|null;deliveryNote:string;
  completedAt:string|null;completedById:string|null;cancelledAt:string|null;cancelledById:string|null;
};
function key(clientId:string){return `${PREFIX}${clientId}`;}
export async function getClientTermination(clientId:string):Promise<ClientTerminationRecord|null>{
 const row=await prisma.appSetting.findUnique({where:{key:key(clientId)},select:{value:true}});if(!row)return null;
 try{const r=JSON.parse(row.value) as ClientTerminationRecord;return r?.clientId?r:null;}catch{return null;}
}
export async function saveClientTermination(record:ClientTerminationRecord){await prisma.appSetting.upsert({where:{key:key(record.clientId)},create:{key:key(record.clientId),value:JSON.stringify(record)},update:{value:JSON.stringify(record)}});return record;}
export async function getClientTerminationReadiness(clientId:string){
 const [client,account,finance]=await Promise.all([
  prisma.client.findUnique({where:{id:clientId},include:{cases:true,documents:{where:{status:"SIGNED"},orderBy:{updatedAt:"desc"}},payments:true,refunds:{include:{installments:true}}}}),
  getClientFinancialAccount(clientId),getClientFinanceOverview(clientId)
 ]);
 if(!client)return null;
 const activeCases=client.cases.filter(c=>!["COMPLETED","CANCELLED","ARCHIVED"].includes(c.status));
 const openInvoices=finance.invoices.filter(r=>!["PAID","CANCELLED"].includes(String(r.state.effectiveStatus)));
 const pendingPayments=client.payments.filter(p=>p.status==="PENDING");
 const openExpenses=finance.expenses.filter(e=>!["PAID","REJECTED","CANCELLED"].includes(e.effectiveStatus));
 const openRefunds=client.refunds.filter(r=>!["PAID","REJECTED","CANCELLED"].includes(r.status));
 const refundableBalances=account.balances.map(b=>({currency:b.currency,amount:Math.max(0,Math.round((b.available-b.pendingRefunds)*100)/100)})).filter(b=>b.amount>0.009);
 const clientDebt=account.balances.filter(b=>b.available< -0.009).map(b=>({currency:b.currency,amount:Math.abs(b.available)}));
 return{client,account,finance,activeCases,openInvoices,pendingPayments,openExpenses,openRefunds,refundableBalances,clientDebt,signedDocuments:client.documents,transactionsSettled:activeCases.length===0&&openInvoices.length===0&&pendingPayments.length===0&&openExpenses.length===0&&openRefunds.length===0&&refundableBalances.length===0&&clientDebt.length===0};
}
