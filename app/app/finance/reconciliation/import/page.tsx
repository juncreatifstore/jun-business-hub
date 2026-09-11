import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { importBankStatementAction } from "@/services/finance-bank-reconciliation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export default async function BankStatementImportPage(props: { searchParams: Promise<{ error?: string }> }) {
  const searchParams = await props.searchParams;
  await requirePermission("BANK_RECON_IMPORT");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-5">
      <div>
        <Link href="/app/finance/reconciliation" className="text-xs font-medium text-electric">
          ← Rapprochement bancaire
        </Link>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Importer un relevé bancaire</h1>
        <p className="mt-1 text-sm text-muted2">
          CSV et OFX/QFX sont pris en charge. JUN conserve les métadonnées normalisées des transactions et
          l’empreinte SHA-256 du fichier, pas le contenu brut du relevé.
        </p>
      </div>
      {searchParams.error && (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}
      <Card>
        <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
          <CardTitle>Informations du relevé</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <form action={importBankStatementAction} className="grid gap-4 md:grid-cols-2">
            <Field label="Banque">
              <Input
                name="bankName"
                required
                placeholder="Ex. Chase, BBVA, Unibank"
                autoComplete="organization"
              />
            </Field>
            <Field label="Libellé du compte">
              <Input name="accountLabel" required placeholder="Compte opérationnel USD" />
            </Field>
            <Field label="4 derniers chiffres du compte">
              <Input
                name="accountLast4"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="1234"
              />
            </Field>
            <Field label="Devise">
              <Input name="currency" required defaultValue="USD" maxLength={3} className="uppercase" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Relevé CSV / OFX">
                <Input
                  type="file"
                  name="statement"
                  required
                  accept=".csv,.ofx,.qfx,text/csv,application/x-ofx"
                  className="h-auto py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-ink/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-ink"
                />
              </Field>
            </div>
            <div className="md:col-span-2 rounded-2xl border border-line bg-ink/[0.025] p-4 text-xs leading-5 text-muted2">
              Le CSV doit contenir Date + Description + Montant, ou Date + Description + Débit/Crédit. Les
              noms de colonnes bancaires courants sont détectés automatiquement. Taille maximale : 8 Mo.
            </div>
            <div className="md:col-span-2">
              <Button variant="primary" className="w-full sm:w-auto">
                Importer et analyser
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
