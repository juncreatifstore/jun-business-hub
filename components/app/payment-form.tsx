"use client";
import { useFormState, useFormStatus } from "react-dom";
import { createPayment } from "@/services/finance";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return <Button variant="primary" disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button>;
}

export function PaymentForm({
  clients, cases, defaultClientId, defaultCaseId,
}: {
  clients: { id: string; firstName: string; lastName: string; internalId: string }[];
  cases: { id: string; caseNumber: string; title: string }[];
  defaultClientId?: string;
  defaultCaseId?: string;
}) {
  const [state, action] = useFormState(createPayment, {});
  const err = (k: string) => state.errors?.[k]?.[0];
  return (
    <form action={action} className="grid max-w-3xl gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Client">
          <Select name="clientId" defaultValue={defaultClientId ?? ""} required>
            <option value="" disabled>Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>)}
          </Select>
        </Field>
        {err("clientId") && <p className="mt-1 text-xs text-red-600">{err("clientId")}</p>}
      </div>
      <Field label="Case (optional)">
        <Select name="caseId" defaultValue={defaultCaseId ?? ""}>
          <option value="">No case</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}
        </Select>
      </Field>
      <Field label="Method">
        <Select name="method" defaultValue="ZELLE">
          {["ZELLE","STRIPE","PAYPAL","MERCADO_PAGO","BANK_TRANSFER","CASH","MONCASH","OTHER"].map((m) => (
            <option key={m} value={m}>{m.replaceAll("_"," ")}</option>
          ))}
        </Select>
      </Field>
      <div>
        <Field label="Amount"><Input name="amount" type="number" step="0.01" min="0.01" required /></Field>
        {err("amount") && <p className="mt-1 text-xs text-red-600">{err("amount")}</p>}
      </div>
      <Field label="Currency"><Input name="currency" defaultValue="USD" maxLength={3} required /></Field>
      <Field label="Payment date"><Input name="paidAt" type="date" /></Field>
      <div className="sm:col-span-2">
        <Field label="Notes / reason"><Textarea name="notes" rows={3} /></Field>
      </div>
      {state.message ? <p className="text-sm text-red-600 sm:col-span-2">{state.message}</p> : null}
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
