"use client";
import { useFormState, useFormStatus } from "react-dom";
import { createRefund } from "@/services/finance";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" disabled={pending}>{pending ? "Submitting…" : "Create refund request"}</Button>;
}

export function RefundForm({
  clients, cases, payments, defaultClientId, defaultCaseId,
}: {
  clients: { id: string; firstName: string; lastName: string; internalId: string }[];
  cases: { id: string; caseNumber: string; title: string }[];
  payments: { id: string; reference: string; amount: number; currency: string; clientId: string }[];
  defaultClientId?: string;
  defaultCaseId?: string;
}) {
  const [state, action] = useFormState(createRefund, {});
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const err = (k: string) => state.errors?.[k]?.[0];
  const clientPayments = payments.filter((p) => p.clientId === clientId);
  return (
    <form action={action} className="grid max-w-3xl gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Client">
          <Select name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="" disabled>Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>)}
          </Select>
        </Field>
        {err("clientId") && <p className="mt-1 text-xs text-red-600">{err("clientId")}</p>}
      </div>
      <Field label="Original payment (optional)">
        <Select name="paymentId" defaultValue="">
          <option value="">Not linked to one payment</option>
          {clientPayments.map((p) => <option key={p.id} value={p.id}>{p.reference} — {p.currency} {p.amount}</option>)}
        </Select>
      </Field>
      <Field label="Case (optional)">
        <Select name="caseId" defaultValue={defaultCaseId ?? ""}>
          <option value="">No case</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}
        </Select>
      </Field>
      <div>
        <Field label="Amount"><Input name="amount" type="number" step="0.01" min="0.01" required /></Field>
        {err("amount") && <p className="mt-1 text-xs text-red-600">{err("amount")}</p>}
      </div>
      <Field label="Currency"><Input name="currency" defaultValue="USD" maxLength={3} required /></Field>
      <Field label="Installments" hint="Monthly schedule starts next month">
        <Input name="installments" type="number" min={1} max={24} defaultValue={1} required />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Reason"><Textarea name="reason" rows={3} required /></Field>
        {err("reason") && <p className="mt-1 text-xs text-red-600">{err("reason")}</p>}
      </div>
      {state.message ? <p className="text-sm text-red-600 sm:col-span-2">{state.message}</p> : null}
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
