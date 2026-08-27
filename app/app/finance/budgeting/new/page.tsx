import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createBudgetPlanAction } from "@/services/finance-budgeting";
import { currentFiscalYear } from "@/lib/finance-budgeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarRange, Info } from "lucide-react";

export default async function NewBudgetPage({ searchParams }: { searchParams: { error?: string } }) {
  await requirePermission("BUDGET_CREATE");
  const year = currentFiscalYear(new Date());
  return <div className="mx-auto max-w-3xl space-y-5">
    <div><Link href="/app/finance/budgeting" className="text-xs font-medium text-electric">← Budget & Performance</Link><h1 className="mt-2 text-3xl font-semibold">Créer un budget</h1><p className="mt-1 text-sm text-muted2">Planifiez les objectifs de revenus, dépenses et profits pour l’année budgétaire JUN.</p></div>
    {searchParams.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{searchParams.error}</div>}
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><div className="flex gap-3"><CalendarRange className="h-5 w-5 text-blue-700"/><div><div className="font-semibold text-blue-900">Année budgétaire JUN</div><div className="mt-1 text-sm text-blue-800">FY{year} : <strong>01 septembre {year-1}</strong> au <strong>30 août {year}</strong>.</div><div className="mt-1 text-xs text-blue-700">Les 12 colonnes du budget suivent l’ordre : Sep → Oct → Nov → Déc → Jan → … → Août.</div></div></div></div>
    <Card><CardHeader><CardTitle>Identité du budget</CardTitle></CardHeader><CardContent><form action={createBudgetPlanAction} className="grid gap-4 md:grid-cols-2">
      <label className="text-sm md:col-span-2">Nom du budget<input name="name" required minLength={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder={`Budget opérationnel FY${year}`} /></label>
      <label className="text-sm">Année budgétaire (année de fin)<input name="year" type="number" min="2020" max="2100" defaultValue={year} required className="mt-1 w-full rounded-lg border border-line px-3 py-2" /><span className="mt-1 block text-[11px] text-muted2">Ex. FY2027 = 01/09/2026 → 30/08/2027</span></label>
      <label className="text-sm">Devise<input name="currency" maxLength={3} defaultValue="USD" required className="mt-1 w-full rounded-lg border border-line px-3 py-2 uppercase" /><span className="mt-1 block text-[11px] text-muted2">Les devises ne sont pas mélangées.</span></label>
      <div className="md:col-span-2 rounded-xl bg-surface p-3 text-xs text-muted2"><Info className="mr-1 inline h-4 w-4"/>Après création, vous pourrez planifier les montants mois par mois et ajouter les dossiers JUN comme <strong>projets</strong> avec revenus, dépenses et profits propres.</div>
      <div className="md:col-span-2"><button className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">Créer le budget brouillon</button></div>
    </form></CardContent></Card>
  </div>;
}
