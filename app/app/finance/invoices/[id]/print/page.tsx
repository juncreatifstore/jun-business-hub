import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";

export const dynamic="force-dynamic";
export default async function InvoicePrintPage({params}:{params:{id:string}}){
  await requirePermission("INVOICE_READ");
  redirect(`/api/finance/invoices/${params.id}/pdf`);
}
