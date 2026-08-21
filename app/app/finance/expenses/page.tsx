import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listFinanceExpenses, expenseEffectiveStatus, expenseIsOverdue, expensePaidTotal, expenseRemaining } from "@/lib/finance-expenses";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Clock3, ReceiptText } from "lucide-react";

export const dynamic="force-dynamic";
export default async function ExpensesPage(){
  await requirePermission("EXPENSE_READ"); const rows=await listFinanceExpenses();
  const overdue=rows.filter(e=>expenseIsOverdue(e)).length; const open=rows.filter(e=>["SUBMITTED","APPROVED","PARTIALLY_PAID"].includes(expenseEffectiveStatus(e))).length; const paid=rows.filter(e=>expenseEffectiveStatus(e)==="PAID").length;
  return <div><PageHeader title="Expenses & Accounts Payable" subtitle="Vendor bills, approvals, due dates and outgoing payments." actionHref="/app/finance/expenses/new" actionLabel="New expense"/>
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><Metric icon={Clock3} label="Open bills" value={open}/><Metric icon={AlertTriangle} label="Overdue" value={overdue}/><Metric icon={CheckCircle2} label="Paid" value={paid}/></div>
    <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full text-sm"><thead className="border-b border-line bg-surface text-left text-xs text-muted2"><tr><th className="p-3">Expense</th><th className="p-3">Vendor</th><th className="p-3">Category</th><th className="p-3">Amount</th><th className="p-3">Paid / remaining</th><th className="p-3">Due</th><th className="p-3">Status</th></tr></thead><tbody>{rows.map(e=>{const status=expenseEffectiveStatus(e);return <tr key={e.id} className="border-b border-line last:border-0"><td className="p-3"><Link href={`/app/finance/expenses/${e.id}`} className="registry-id hover:text-electric">{e.expenseNumber}</Link><div className="text-xs text-muted2">{e.invoiceNumber||"No invoice #"}</div></td><td className="p-3">{e.vendorName}<div className="text-xs text-muted2">{e.vendorCountry}</div></td><td className="p-3">{e.category.replaceAll("_"," ")}</td><td className="p-3 font-medium">{formatMoney(e.amount,e.currency)}</td><td className="p-3"><div>{formatMoney(expensePaidTotal(e),e.currency)} paid</div><div className="text-xs text-muted2">{formatMoney(expenseRemaining(e),e.currency)} remaining</div></td><td className={`p-3 ${expenseIsOverdue(e)?"text-red-700 font-medium":"text-muted2"}`}>{e.dueDate?formatDate(new Date(e.dueDate)):"—"}</td><td className="p-3"><span className="rounded-full bg-surface px-2 py-1 text-xs font-medium">{status.replaceAll("_"," ")}</span></td></tr>})}{!rows.length?<tr><td colSpan={7} className="p-8 text-center text-muted2">No expenses recorded yet.</td></tr>:null}</tbody></table></div>
  </div>;
}
function Metric({icon:Icon,label,value}:{icon:typeof ReceiptText;label:string;value:number}){return <Card><CardContent className="p-4"><Icon className="mb-2 h-5 w-5 text-electric"/><div className="text-xs text-muted2">{label}</div><div className="text-2xl font-semibold">{value}</div></CardContent></Card>}
