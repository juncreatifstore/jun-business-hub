import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expenseEffectiveStatus, expenseIsOverdue, expensePaidTotal, expenseRemaining, getFinanceExpense } from "@/lib/finance-expenses";
import { transitionExpense, recordExpensePayment } from "@/services/finance-expenses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { AlertTriangle, FileText, WalletCards } from "lucide-react";

export const dynamic="force-dynamic";
export default async function ExpenseDetailPage({params}:{params:{id:string}}){
  const user=await requirePermission("EXPENSE_READ"); const e=await getFinanceExpense(params.id); if(!e) notFound();
  const canApprove=can(user,"EXPENSE_APPROVE"); const canCreate=can(user,"EXPENSE_CREATE"); const status=expenseEffectiveStatus(e); const paid=expensePaidTotal(e); const remaining=expenseRemaining(e);
  const [creator,approver,client,caseRow,invoiceFile]=await Promise.all([
    prisma.user.findUnique({where:{id:e.createdById},select:{firstName:true,lastName:true}}),
    e.approvedById?prisma.user.findUnique({where:{id:e.approvedById},select:{firstName:true,lastName:true}}):Promise.resolve(null),
    e.clientId?prisma.client.findUnique({where:{id:e.clientId},select:{firstName:true,lastName:true,internalId:true}}):Promise.resolve(null),
    e.caseId?prisma.case.findUnique({where:{id:e.caseId},select:{caseNumber:true,title:true}}):Promise.resolve(null),
    e.invoiceFileId?prisma.file.findUnique({where:{id:e.invoiceFileId},select:{id:true,name:true}}):Promise.resolve(null),
  ]);
  return <div className="max-w-5xl space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="registry-id text-muted2">{e.expenseNumber}</p><h1 className="mt-1 text-2xl font-semibold">{e.vendorName}</h1><p className="text-sm text-muted2">{e.category.replaceAll("_"," ")} · {formatMoney(e.amount,e.currency)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${expenseIsOverdue(e)?"bg-red-50 text-red-700":"bg-surface"}`}>{expenseIsOverdue(e)?"OVERDUE · ":""}{status.replaceAll("_"," ")}</span></div>
    <div className="grid gap-3 md:grid-cols-3"><Metric icon={WalletCards} label="Paid" value={formatMoney(paid,e.currency)}/><Metric icon={WalletCards} label="Remaining" value={formatMoney(remaining,e.currency)}/><Metric icon={AlertTriangle} label="Due" value={e.dueDate?formatDate(new Date(e.dueDate)):"No due date"}/></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Bill details</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><Info label="Vendor" value={e.vendorName}/><Info label="Country" value={e.vendorCountry||"—"}/><Info label="Invoice" value={e.invoiceNumber||"—"}/><Info label="Category" value={e.category.replaceAll("_"," ")}/><Info label="Created by" value={creator?`${creator.firstName} ${creator.lastName}`:"Unknown"}/><Info label="Approved by" value={approver?`${approver.firstName} ${approver.lastName}`:"—"}/>{client?<Info label="Client" value={`${client.firstName} ${client.lastName} · ${client.internalId}`}/>:null}{caseRow?<Info label="Case" value={`${caseRow.caseNumber} · ${caseRow.title}`}/>:null}<div className="rounded-lg border border-line bg-surface p-3 whitespace-pre-wrap">{e.description}</div>{invoiceFile?<Link href={`/api/files/${invoiceFile.id}`} className="inline-flex items-center gap-2 text-electric"><FileText className="h-4 w-4"/>{invoiceFile.name}</Link>:null}</CardContent></Card>
      <Card><CardHeader><CardTitle>Approval workflow</CardTitle></CardHeader><CardContent className="space-y-3">
        {status==="DRAFT"&&canCreate?<form action={transitionExpense.bind(null,e.id,"SUBMITTED")}><Button variant="primary" type="submit">Submit for approval</Button></form>:null}
        {status==="SUBMITTED"&&canApprove?<div className="grid gap-3"><form action={transitionExpense.bind(null,e.id,"APPROVED")} className="space-y-2"><Field label="Approval note"><Textarea name="decisionNote" rows={3}/></Field><Button variant="primary" type="submit">Approve expense</Button></form><form action={transitionExpense.bind(null,e.id,"REJECTED")} className="space-y-2"><Field label="Rejection reason"><Textarea name="decisionNote" rows={3} required/></Field><Button variant="danger" type="submit">Reject expense</Button></form></div>:null}
        {["DRAFT","SUBMITTED","APPROVED"].includes(status)&&paid===0&&canApprove?<form action={transitionExpense.bind(null,e.id,"CANCELLED")}><Button variant="danger" type="submit">Cancel expense</Button></form>:null}
        {e.decisionNote?<div className="rounded-lg border border-line p-3 text-sm"><div className="text-xs text-muted2">Decision note</div><div className="mt-1 whitespace-pre-wrap">{e.decisionNote}</div></div>:null}
      </CardContent></Card>
    </div>
    {canApprove&&["APPROVED","PARTIALLY_PAID"].includes(status)?<Card><CardHeader><CardTitle>Record outgoing payment</CardTitle></CardHeader><CardContent><form action={recordExpensePayment.bind(null,e.id)} className="grid gap-4 sm:grid-cols-2"><Field label="Amount"><Input name="amount" type="number" step="0.01" min="0.01" max={remaining} defaultValue={remaining} required/></Field><Field label="Method"><Input name="method" placeholder="BANK_TRANSFER, CARD, CASH..." required/></Field><Field label="Transaction reference"><Input name="transactionRef" required/></Field><Field label="Proof file ID"><Input name="proofFileId" placeholder="Optional JUN Drive file ID"/></Field><div className="sm:col-span-2"><Field label="Payment note"><Textarea name="note" rows={3}/></Field></div><div className="sm:col-span-2"><Button variant="primary" type="submit">Record payment</Button></div></form></CardContent></Card>:null}
    <Card><CardHeader><CardTitle>Payment history</CardTitle></CardHeader><CardContent>{e.payments.length?<div className="divide-y divide-line rounded-lg border border-line">{e.payments.map((p,i)=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><div className="font-medium">Payment {i+1} · {p.method}</div><div className="text-xs text-muted2">{formatDateTime(new Date(p.paidAt))} · {p.transactionRef}</div></div><div className="font-semibold">{formatMoney(p.amount,e.currency)}</div></div>)}</div>:<p className="text-sm text-muted2">No outgoing payment recorded yet.</p>}</CardContent></Card>
  </div>;
}
function Metric({icon:Icon,label,value}:{icon:typeof WalletCards;label:string;value:string}){return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-2 h-5 w-5 text-electric"/><div className="text-xs text-muted2">{label}</div><div className="mt-1 font-semibold">{value}</div></div>}
function Info({label,value}:{label:string;value:string}){return <div><div className="text-xs text-muted2">{label}</div><div className="mt-0.5">{value}</div></div>}
