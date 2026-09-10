import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EXPENSE_CATEGORIES } from "@/lib/finance-expenses";
import { createExpense } from "@/services/finance-expenses";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: { clientId?: string; caseId?: string };
}) {
  await requirePermission("EXPENSE_CREATE");
  const requestedClientId = String(searchParams.clientId || "");
  const requestedCaseId = String(searchParams.caseId || "");
  const [clients, cases] = await Promise.all([
    prisma.client.findMany({
      where: { archivedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 300,
      select: { id: true, firstName: true, lastName: true, internalId: true },
    }),
    prisma.case.findMany({
      where: { status: { notIn: ["ARCHIVED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, caseNumber: true, title: true, clientId: true },
    }),
  ]);
  const selectedCase = cases.find((c) => c.id === requestedCaseId);
  const defaultClientId = clients.some((c) => c.id === requestedClientId)
    ? requestedClientId
    : selectedCase?.clientId || "";
  const defaultCaseId =
    selectedCase && (!defaultClientId || selectedCase.clientId === defaultClientId) ? selectedCase.id : "";
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 sm:space-y-5">
      <PageHeader
        title="Nouvelle dépense"
        subtitle="Enregistrer une facture fournisseur ou une dépense d’entreprise avant approbation et paiement."
      />
      <Card>
        <CardContent className="p-4 sm:p-5">
          <form action={createExpense} className="grid gap-4 sm:grid-cols-2">
            <Field label="Fournisseur / bénéficiaire">
              <Input name="vendorName" required maxLength={200} autoComplete="organization" />
            </Field>
            <Field label="Pays du fournisseur">
              <Input name="vendorCountry" maxLength={120} autoComplete="country-name" />
            </Field>
            <Field label="Catégorie">
              <Select name="category" defaultValue="OTHER">
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Numéro de facture">
              <Input name="invoiceNumber" maxLength={120} />
            </Field>
            <Field label="Montant">
              <Input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required />
            </Field>
            <Field label="Devise">
              <Input name="currency" defaultValue="USD" maxLength={3} required className="uppercase" />
            </Field>
            <Field label="Date d’échéance">
              <Input name="dueDate" type="date" />
            </Field>
            <Field label="ID du justificatif" hint="ID de fichier JUN Drive facultatif">
              <Input name="invoiceFileId" />
            </Field>
            <Field label="Client (facultatif)">
              <Select name="clientId" defaultValue={defaultClientId}>
                <option value="">Aucun client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.lastName}, {c.firstName} — {c.internalId}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dossier (facultatif)">
              <Select name="caseId" defaultValue={defaultCaseId}>
                <option value="">Aucun dossier</option>
                {cases
                  .filter((c) => !defaultClientId || c.clientId === defaultClientId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.caseNumber} — {c.title}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description / objectif de la dépense">
                <Textarea name="description" rows={5} required />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button variant="primary" type="submit" className="w-full sm:w-auto">
                Créer la dépense brouillon
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
