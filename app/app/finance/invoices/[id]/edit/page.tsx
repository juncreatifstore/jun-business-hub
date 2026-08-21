import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInvoice, invoiceFinancialState } from "@/lib/finance-invoices";
import { invoiceEditMode, editPolicyMessage } from "@/lib/edit-policy";
import { InvoiceEditForm } from "@/components/app/invoice-edit-form";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export const dynamic="force-dynamic";
export default async function EditInvoicePage({params}:{params:{id:string}}){
 await requirePermission("INVOICE_READ");const [inv,clients,cases]=await Promise.all([getInvoice(params.id),prisma.client.findMany({where:{status:{not:"ARCHIVED"}},orderBy:{lastName:"asc"},select:{id:true,firstName:true,lastName:true,internalId:true}}),prisma.case.findMany({where:{status:{not:"ARCHIVED"}},orderBy:{createdAt:"desc"},take:500,select:{id:true,caseNumber:true,title:true,clientId:true}})]);if(!inv)notFound();const state=await invoiceFinancialState(inv);const mode=invoiceEditMode(state.effectiveStatus,state.confirmed);
 return <div><PageHeader title={`Correct ${inv.invoiceNumber}`} subtitle={editPolicyMessage(mode)}><Link href={`/app/finance/invoices/${inv.id}`}><Button variant="outline">Cancel</Button></Link></PageHeader>{mode==="LOCKED"?<Card><CardContent className="p-5"><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">This invoice has confirmed payments or is final. Do not overwrite it. Create a credit/corrective invoice instead.</div></CardContent></Card>:<InvoiceEditForm invoiceId={inv.id} clients={clients} cases={cases} value={{clientId:inv.clientId,caseId:inv.caseId||"",currency:inv.currency,dueDate:inv.dueDate.slice(0,10),title:inv.title,notes:inv.notes,terms:inv.terms,lines:inv.lines,wasSent:inv.status!=="DRAFT"}}/>}</div>
}
