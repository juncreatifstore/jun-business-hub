"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createPaymentWithAccount } from "@/services/finance-payment-entry";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Enregistrement…" : "Enregistrer le paiement"}
    </Button>
  );
}

type PaymentAccountOption = {
  id: string;
  label: string;
  method: string;
  currency: string;
  receiverName: string;
  accountDescriptor: string;
  feePercent: number;
  feeFixed: number;
};

export function PaymentForm({
  clients,
  cases,
  paymentAccounts,
  defaultClientId,
  defaultCaseId,
}: {
  clients: { id: string; firstName: string; lastName: string; internalId: string }[];
  cases: { id: string; caseNumber: string; title: string }[];
  paymentAccounts: PaymentAccountOption[];
  defaultClientId?: string;
  defaultCaseId?: string;
}) {
  const [state, action] = useFormState(createPaymentWithAccount, {});
  const [accountId, setAccountId] = useState("");
  const selectedAccount = paymentAccounts.find((a) => a.id === accountId) || null;
  const err = (k: string) => state.errors?.[k]?.[0];

  return (
    <form action={action} className="grid w-full min-w-0 max-w-4xl gap-4 sm:grid-cols-2 sm:gap-5">
      <div className="min-w-0 sm:col-span-2">
        <Field label="Client">
          <Select name="clientId" defaultValue={defaultClientId ?? ""} required>
            <option value="" disabled>
              Sélectionner un client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.lastName}, {c.firstName} — {c.internalId}
              </option>
            ))}
          </Select>
        </Field>
        {err("clientId") && <p className="mt-1 text-xs text-red-600">{err("clientId")}</p>}
      </div>
      <div className="min-w-0">
        <Field label="Dossier (optionnel)">
          <Select name="caseId" defaultValue={defaultCaseId ?? ""}>
            <option value="">Aucun dossier</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber} — {c.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Service / motif">
          <Input
            name="serviceLabel"
            placeholder="Ex. visa Mexique, billet, service document"
            maxLength={160}
          />
        </Field>
      </div>

      <div className="min-w-0 sm:col-span-2">
        <Field label="Compte de réception">
          <Select name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Compte manuel / non assigné</option>
            {paymentAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} — {a.method.replaceAll("_", " ")} · {a.currency}
              </option>
            ))}
          </Select>
        </Field>
        {selectedAccount ? (
          <div className="mt-2 min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs leading-5 text-muted2">
            <strong className="break-words text-ink">
              {selectedAccount.receiverName || selectedAccount.label}
            </strong>
            {selectedAccount.accountDescriptor ? (
              <span className="break-all"> · {selectedAccount.accountDescriptor}</span>
            ) : null}
            <span>
              {" "}
              · Frais {selectedAccount.feePercent.toFixed(2)}% + {selectedAccount.currency}{" "}
              {selectedAccount.feeFixed.toFixed(2)}
            </span>
          </div>
        ) : paymentAccounts.length === 0 ? (
          <p className="mt-1 text-xs text-amber-700">
            Aucun compte de réception actif n’est configuré. Un paiement manuel peut quand même être
            enregistré.
          </p>
        ) : null}
      </div>

      <div className="min-w-0">
        {selectedAccount ? (
          <Field label="Méthode">
            <>
              <input type="hidden" name="method" value={selectedAccount.method} />
              <Select value={selectedAccount.method} disabled>
                <option value={selectedAccount.method}>{selectedAccount.method.replaceAll("_", " ")}</option>
              </Select>
            </>
          </Field>
        ) : (
          <Field label="Méthode">
            <Select name="method" defaultValue="ZELLE">
              {["ZELLE", "STRIPE", "PAYPAL", "MERCADO_PAGO", "BANK_TRANSFER", "CASH", "MONCASH", "OTHER"].map(
                (m) => (
                  <option key={m} value={m}>
                    {m.replaceAll("_", " ")}
                  </option>
                ),
              )}
            </Select>
          </Field>
        )}
      </div>
      <div className="min-w-0">
        <Field label="Référence fournisseur / banque">
          <Input name="providerRef" placeholder="ID transaction, référence Zelle, banque…" maxLength={160} />
        </Field>
      </div>
      <div className="min-w-0">
        <Field label="Montant reçu">
          <Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" required />
        </Field>
        {err("amount") && <p className="mt-1 text-xs text-red-600">{err("amount")}</p>}
      </div>
      <div className="min-w-0">
        <Field label="Montant attendu (optionnel)">
          <Input
            name="expectedAmount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            placeholder="Total à payer"
          />
        </Field>
        {err("expectedAmount") && <p className="mt-1 text-xs text-red-600">{err("expectedAmount")}</p>}
      </div>

      <div className="min-w-0">
        {selectedAccount ? (
          <Field label="Devise">
            <>
              <input type="hidden" name="currency" value={selectedAccount.currency} />
              <Input value={selectedAccount.currency} readOnly />
            </>
          </Field>
        ) : (
          <Field label="Devise">
            <Input name="currency" defaultValue="USD" maxLength={3} required />
          </Field>
        )}
      </div>
      <div className="min-w-0">
        <Field label="Date du paiement">
          <Input name="paidAt" type="date" />
        </Field>
      </div>

      <div className="sm:col-span-2 rounded-xl border border-line bg-surface p-3 text-xs leading-5 text-muted2 sm:p-4">
        Le paiement est créé avec le statut <strong className="text-ink">En attente</strong>. Un responsable
        Finance doit le confirmer avant que le reçu soit considéré comme valide. Les frais du compte de
        réception sont conservés pour le reporting et ne modifient pas le montant payé par le client.
      </div>
      <div className="min-w-0 sm:col-span-2">
        <Field label="Notes / explication">
          <Textarea name="notes" rows={4} placeholder="Ajouter le contexte utile du paiement." />
        </Field>
      </div>
      {state.message ? (
        <p className="break-words text-sm text-red-600 sm:col-span-2">{state.message}</p>
      ) : null}
      <div className="sm:col-span-2">
        <Submit />
      </div>
    </form>
  );
}
