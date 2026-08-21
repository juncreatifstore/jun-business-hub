"use client";
import { useFormState, useFormStatus } from "react-dom";
import { createRefundWorkflow } from "@/services/refunds";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" disabled={pending}>{pending ? "Submitting…" : "Create refund request"}</Button>;
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

  return <form action={action} className="grid max-w-3xl gap-5 sm:grid-cols-2">
    <div className="sm:col-span-2">
      <Field label="Client"><Select name="clientId" value={clientId} onChange={(e) => { setClientId(e.target.value); setPaymentId(""); }} required><option value="" disabled>Select a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>)}</Select></Field>
      {err("clientId") && <p className="mt-1 text-xs text-red-600">{err("clientId")}</p>}
    </div>
    <Field label="Original payment" hint="Recommended for financial reconciliation">
      <Select name="paymentId" value={paymentId} onChange={(e) => setPaymentId(e.target.value)}>
        <option value="">Unlinked refund</option>
        {clientPayments.map((p) => <option key={p.id} value={p.id}>{p.reference} — {p.currency} {p.available.toFixed(2)} refundable</option>)}
      </Select>
    </Field>
    <Field label="Case (optional)"><Select name="caseId" defaultValue={defaultCaseId ?? ""}><option value="">No case</option>{clientCases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}</Select></Field>
    <div>
      <Field label="Refund amount" hint={selectedPayment ? `Maximum currently available: ${selectedPayment.currency} ${selectedPayment.available.toFixed(2)}` : undefined}><Input name="amount" type="number" step="0.01" min="0.01" max={selectedPayment?.available} required /></Field>
      {err("amount") && <p className="mt-1 text-xs text-red-600">{err("amount")}</p>}
    </div>
    <Field label="Currency" hint={selectedPayment ? "Locked to original payment" : undefined}><Input name="currency" value={selectedPayment?.currency ?? undefined} defaultValue={selectedPayment ? undefined : "USD"} readOnly={Boolean(selectedPayment)} maxLength={3} required /></Field>
    <Field label="Installments" hint="Up to 24 scheduled payouts"><Input name="installments" type="number" min={1} max={24} defaultValue={1} required /></Field>
    <Field label="First due date" hint="Following installments are scheduled monthly"><Input name="firstDueDate" type="date" /></Field>
    <div className="sm:col-span-2"><Field label="Reason" hint="Explain what is being refunded and why"><Textarea name="reason" rows={4} required /></Field>{err("reason") && <p className="mt-1 text-xs text-red-600">{err("reason")}</p>}</div>
    {state.message ? <p className="text-sm text-red-600 sm:col-span-2">{state.message}</p> : null}
    <div className="sm:col-span-2"><Submit /></div>
  </form>;
}
