import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InvoiceForm } from "@/components/app/invoice-form";
import { PageHeader } from "@/components/app/page-header";

export const dynamic="force-dynamic";
export default async function NewInvoicePage({searchParams}:{searchParams:{toast_error?:string}}){
  await requirePermission("INVOICE_CREATE");
  const [clients,cases]=await Promise.all([
    prisma.client.findMany({where:{archivedAt:null},orderBy:[{lastName:"asc"},{firstName:"asc"}],take:500,select:{id:true,firstName:true,lastName:true,internalId:true}}),
    prisma.case.findMany({where:{status:{not:"ARCHIVED"}},orderBy:{createdAt:"desc"},take:500,select:{id:true,caseNumber:true,title:true,clientId:true}}),
  ]);
  return <div><PageHeader title="New invoice" subtitle="Create a professional client invoice and track it through Accounts Receivable."/>
    {searchParams.toast_error?<div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{searchParams.toast_error}</div>:null}
    <div className="mb-4"><Link href="/app/finance/invoices" className="text-sm text-electric hover:underline">← Back to invoices</Link></div>
    <InvoiceForm clients={clients} cases={cases}/>
  </div>;
}
