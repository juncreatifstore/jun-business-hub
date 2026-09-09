"use client";
import { useFormState, useFormStatus } from "react-dom";
import { createRefundWorkflow } from "@/services/refunds";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" disabled={pending} className="w-full sm:w-auto">{pending ? "Création…" : "Créer la demande"}</Button>;
}

export function RefundForm({ clients, cases, payments, defaultClientId, defaultCaseId }: {
  clients: { id: string; firstName: string; lastName: string; internalId: string }[];
  cases: { id: string; caseNumber: string; title: string; clientId: string }[];
  payments: { id: string; reference: string; amount: number; available: number; currency: string; clientId: string }[];
  defaultClientId?: string;
  defaultCaseId?: string;
}) {
  const [state, action] = useFormState(createRefundWorkflow, {});
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [paymentId, setPaymentId] = useState("");
  const err = (k: string) => state.errors?.[k]?.[0];
  const clientPayments = payments.filter((p) => p.clientId === clientId && p.available > 0);
  const clientCases = cases.filter((c) => c.clientId === clientId);
  const selectedPayment = useMemo(() => payments.find((p) => p.id === paymentId) ?? null, [paymentId, payments]);

  return <form action={action} className="grid w-full min-w-0 max-w-3xl gap-4 sm:grid-cols-2 sm:gap-5">
    <div className="min-w-0 sm:col-span-2">
      <Field label="Client"><Select name="clientId" value={clientId} onChange={(e) => { setClientId(e.target.value); setPaymentId(""); }} required><option value="" disabled>Sélectionner un client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>)}</Select></Field>
      {err("clientId") && <p className="mt-1 text-xs text-red-600">{err("clientId")}</p>}
    </div>
    <div className="min-w-0"><Field label="Source du remboursement" hint="Choisissez un paiement précis seulement si le remboursement doit être rapproché de ce paiement."><Select name="paymentId" value={paymentId} onChange={(e) => setPaymentId(e.target.value)}><option value="">Solde global du client — aucun paiement lié</option>{clientPayments.map((p) => <option key={p.id} value={p.id}>{p.reference} — {p.currency} {p.available.toFixed(2)} disponible</option>)}</Select></Field></div>
    <div className="min-w-0"><Field label="Dossier (optionnel)"><Select name="caseId" defaultValue={defaultCaseId ?? ""}><option value="">Aucun dossier</option>{clientCases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}</Select></Field></div>
    <div className="min-w-0"><Field label="Montant du remboursement" hint={selectedPayment ? `Maximum disponible sur ce paiement : ${selectedPayment.currency} ${selectedPayment.available.toFixed(2)}` : "Validé contre le solde global disponible du client"}><Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={selectedPayment?.available} required /></Field>{err("amount") && <p className="mt-1 text-xs text-red-600">{err("amount")}</p>}</div>
    <div className="min-w-0"><Field label="Devise" hint={selectedPayment ? "Verrouillée sur la devise du paiement original" : "Devise du solde global remboursé"}><Input name="currency" value={selectedPayment?.currency ?? undefined} defaultValue={selectedPayment ? undefined : "USD"} readOnly={Boolean(selectedPayment)} maxLength={3} required /></Field></div>
    <div className="min-w-0"><Field label="Versements" hint="Jusqu’à 24 décaissements programmés"><Input name="installments" type="number" inputMode="numeric" min={1} max={24} defaultValue={1} required /></Field></div>
    <div className="min-w-0"><Field label="Première échéance" hint="Les versements suivants sont programmés mensuellement"><Input name="firstDueDate" type="date" /></Field></div>
    <div className="min-w-0 sm:col-span-2"><Field label="Motif" hint="Expliquez ce qui est remboursé et pourquoi"><Textarea name="reason" rows={4} required /></Field>{err("reason") && <p className="mt-1 text-xs text-red-600">{err("reason")}</p>}</div>
    {state.message ? <p className="break-words text-sm text-red-600 sm:col-span-2">{state.message}</p> : null}
    <div className="sm:col-span-2"><Submit /></div>
  </form>;
}
