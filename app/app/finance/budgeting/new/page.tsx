import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createBudgetPlanAction } from "@/services/finance-budgeting";
import { currentFiscalYear } from "@/lib/finance-budgeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { CalendarRange, Info } from "lucide-react";

export default async function NewBudgetPage({ searchParams }: { searchParams: { error?: string } }) {
  await requirePermission("BUDGET_CREATE");
  const year = currentFiscalYear(new Date());
  return <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-5">
    <div>
      <Link href="/app/finance/budgeting" className="text-xs font-medium text-electric">← Budget & Performance</Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Créer un budget</h1>
      <p className="mt-1 text-sm text-muted2">Planifiez les objectifs de revenus, dépenses et profits pour l’année budgétaire JUN.</p>
    </div>
    {searchParams.error && <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{searchParams.error}</div>}
    <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
      <div className="flex items-start gap-3"><CalendarRange className="mt-0.5 h-5 w-5 shrink-0 text-blue-300"/><div><div className="font-semibold text-blue-100">Année budgétaire JUN</div><div className="mt-1 text-sm text-blue-200">FY{year} : <strong>01 septembre {year-1}</strong> au <strong>30 août {year}</strong>.</div><div className="mt-1 text-xs text-blue-300">Les 12 colonnes du budget suivent l’ordre : Sep → Oct → Nov → Déc → Jan → … → Août.</div></div></div>
    </div>
    <Card>
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0"><CardTitle>Identité du budget</CardTitle></CardHeader>
      <CardContent className="p-4 sm:p-5">
        <form action={createBudgetPlanAction} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Field label="Nom du budget"><Input name="name" required minLength={3} placeholder={`Budget opérationnel FY${year}`} /></Field></div>
          <Field label="Année budgétaire (année de fin)" hint="Ex. FY2027 = 01/09/2026 → 30/08/2027"><Input name="year" type="number" inputMode="numeric" min="2020" max="2100" defaultValue={year} required /></Field>
          <Field label="Devise" hint="Les devises ne sont pas mélangées."><Input name="currency" maxLength={3} defaultValue="USD" required className="uppercase" /></Field>
          <div className="md:col-span-2 rounded-2xl border border-line bg-white/[0.025] p-4 text-xs text-muted2"><Info className="mr-1 inline h-4 w-4"/>Après création, vous pourrez planifier les montants mois par mois et ajouter les dossiers JUN comme <strong>projets</strong> avec revenus, dépenses et profits propres.</div>
          <div className="md:col-span-2"><Button variant="primary" className="w-full sm:w-auto">Créer le budget brouillon</Button></div>
        </form>
      </CardContent>
    </Card>
  </div>;
}
