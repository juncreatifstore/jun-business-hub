import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EXPENSE_CATEGORIES, getFinanceExpense } from "@/lib/finance-expenses";
import { expenseEditMode, editPolicyMessage } from "@/lib/edit-policy";
import { correctExpense } from "@/services/finance-corrections";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
export const dynamic = "force-dynamic";
export default async function EditExpensePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requirePermission("EXPENSE_READ");
  const [e, clients, cases] = await Promise.all([
    getFinanceExpense(params.id),
    prisma.client.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, internalId: true },
    }),
    prisma.case.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, caseNumber: true, title: true },
    }),
  ]);
  if (!e) notFound();
  const mode = expenseEditMode(e.status, e.payments.length);
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 sm:space-y-5">
      <PageHeader title={`Corriger ${e.expenseNumber}`} subtitle={editPolicyMessage(mode)}>
        <Link href={`/app/finance/expenses/${e.id}`} className="w-full sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto">
            Annuler
          </Button>
        </Link>
      </PageHeader>
      <Card>
        <CardContent className="p-4 sm:p-5">
          {mode === "LOCKED" ? (
            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
              Cette dépense est verrouillée financièrement parce qu’un paiement a déjà commencé ou que
              l’enregistrement est final. Utilisez une écriture d’ajustement/correction.
            </div>
          ) : (
            <form action={correctExpense.bind(null, e.id)} className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              <Field label="Fournisseur">
                <Input name="vendorName" defaultValue={e.vendorName} required autoComplete="organization" />
              </Field>
              <Field label="Pays du fournisseur">
                <Input name="vendorCountry" defaultValue={e.vendorCountry} autoComplete="country-name" />
              </Field>
              <Field label="Catégorie">
                <Select name="category" defaultValue={e.category}>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Facture fournisseur #">
                <Input name="invoiceNumber" defaultValue={e.invoiceNumber} />
              </Field>
              <Field label="Montant">
                <Input
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  defaultValue={e.amount}
                  required
                />
              </Field>
              <Field label="Devise">
                <Input
                  name="currency"
                  defaultValue={e.currency}
                  maxLength={3}
                  required
                  className="uppercase"
                />
              </Field>
              <Field label="Date d’échéance">
                <Input name="dueDate" type="date" defaultValue={e.dueDate ? e.dueDate.slice(0, 10) : ""} />
              </Field>
              <Field label="Client">
                <Select name="clientId" defaultValue={e.clientId || ""}>
                  <option value="">Aucun client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.lastName}, {c.firstName} — {c.internalId}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Dossier">
                  <Select name="caseId" defaultValue={e.caseId || ""}>
                    <option value="">Aucun dossier</option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.caseNumber} — {c.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Description">
                  <Textarea name="description" rows={4} defaultValue={e.description} required />
                </Field>
              </div>
              {e.status === "APPROVED" ? (
                <div className="sm:col-span-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                  La correction d’une dépense approuvée mais non payée la remet en statut{" "}
                  <strong>SUBMITTED</strong> et nécessite une nouvelle approbation.
                </div>
              ) : null}
              <div className="sm:col-span-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                <Field
                  label="Motif de correction"
                  hint="Obligatoire et conservé de façon permanente dans l’audit."
                >
                  <Textarea name="correctionReason" rows={3} required />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Button variant="primary" type="submit" className="w-full sm:w-auto">
                  Enregistrer la correction
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
