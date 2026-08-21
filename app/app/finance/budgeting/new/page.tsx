import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createBudgetPlanAction } from "@/services/finance-budgeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewBudgetPage({ searchParams }: { searchParams: { error?: string } }) {
  await requirePermission("BUDGET_CREATE");
  const year = new Date().getFullYear();
  return <div className="mx-auto max-w-3xl space-y-5">
    <div><Link href="/app/finance/budgeting" className="text-xs font-medium text-electric">← Budgeting</Link><h1 className="mt-2 text-3xl font-semibold">Create Budget Plan</h1><p className="mt-1 text-sm text-muted2">Create the budget shell first, then enter monthly allocations by accounting category.</p></div>
    {searchParams.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{searchParams.error}</div>}
    <Card><CardHeader><CardTitle>Budget identity</CardTitle></CardHeader><CardContent><form action={createBudgetPlanAction} className="grid gap-4 md:grid-cols-2">
      <label className="text-sm md:col-span-2">Budget name<input name="name" required minLength={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder={`Operating Budget ${year}`} /></label>
      <label className="text-sm">Fiscal year<input name="year" type="number" min="2020" max="2100" defaultValue={year} required className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
      <label className="text-sm">Currency<input name="currency" maxLength={3} defaultValue="USD" required className="mt-1 w-full rounded-lg border border-line px-3 py-2 uppercase" /></label>
      <div className="md:col-span-2"><button className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">Create budget draft</button></div>
    </form></CardContent></Card>
    <p className="text-xs text-muted2">Budgets are never converted across currencies. Create a separate budget for each reporting currency.</p>
  </div>;
}
