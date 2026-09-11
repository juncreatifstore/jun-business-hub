import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function InvoicePrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requirePermission("INVOICE_READ");
  redirect(`/api/finance/invoices/${params.id}/pdf`);
}
