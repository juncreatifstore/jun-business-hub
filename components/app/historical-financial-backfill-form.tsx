"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { importHistoricalFinancialBatch } from "@/services/historical-financial-backfill";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

const PAYMENT_METHODS = ["ZELLE", "BANK_TRANSFER", "CASH", "MONCASH", "PAYPAL", "STRIPE", "MERCADO_PAGO", "OTHER"];
const REFUND_METHODS = ["ZELLE", "BANK_TRANSFER", "CASH", "MONCASH", "PAYPAL", "WESTERN_UNION", "MONEYGRAM", "OTHER"];

type PaymentRow = { date: string; amount: string; currency: string; method: string; transactionRef: string; purpose: string; notes: string };
type RefundRow = { date: string; amount: string; currency: string; method: string; transactionRef: string; reason: string; notes: string };

type ClientOption = { id: string; firstName: string; lastName: string; internalId: string };
type CaseOption = { id: string; clientId: string; caseNumber: string; title: string };

const newPayment = (): PaymentRow => ({ date: "", amount: "", currency: "USD", method: "ZELLE", transactionRef: "", purpose: "", notes: "" });
const newRefund = (): RefundRow => ({ date: "", amount: "", currency: "USD", method: "ZELLE", transactionRef: "", reason: "", notes: "" });

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button variant="primary" size="lg" disabled={pending}>{pending ? "Recording entire batch…" : "Record entire historical batch"}</Button>;
}

function totals(rows: Array<{ amount: string; currency: string }>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.amount);
    const currency = row.currency.trim().toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || !currency) continue;
    map.set(currency, Math.round(((map.get(currency) ?? 0) + amount) * 100) / 100);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function HistoricalFinancialBackfillForm({ clients, cases, batchId, defaultClientId }: {
  clients: ClientOption[];
  cases: CaseOption[];
  batchId: string;
  defaultClientId?: string;
}) {
  const [state, action] = useFormState(importHistoricalFinancialBatch, {});
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [caseId, setCaseId] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([newPayment()]);
  const [refunds, setRefunds] = useState<RefundRow[]>([newRefund()]);
  const clientCases = cases.filter((row) => row.clientId === clientId);
  const paymentTotals = useMemo(() => totals(payments), [payments]);
  const refundTotals = useMemo(() => totals(refunds), [refunds]);

  const updatePayment = (index: number, patch: Partial<PaymentRow>) => setPayments((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  const updateRefund = (index: number, patch: Partial<RefundRow>) => setRefunds((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));

  return <form action={action} className="space-y-6">
    <input type="hidden" name="batchId" value={batchId} />
    <input type="hidden" name="paymentsJson" value={JSON.stringify(payments)} />
    <input type="hidden" name="refundsJson" value={JSON.stringify(refunds)} />

    <div className="grid gap-4 rounded-xl border border-line bg-white p-5 md:grid-cols-2">
      <Field label="Client" hint="All rows in this batch will be attached to this client.">
        <Select name="clientId" value={clientId} onChange={(e) => { setClientId(e.target.value); setCaseId(""); }} required>
          <option value="" disabled>Select a client…</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.lastName}, {client.firstName} — {client.internalId}</option>)}
        </Select>
      </Field>
      <Field label="Case / dossier (optional)" hint="Leave empty if the old transactions were not tied to one dossier.">
        <Select name="caseId" value={caseId} onChange={(e) => setCaseId(e.target.value)} disabled={!clientId}>
          <option value="">No case</option>
          {clientCases.map((row) => <option key={row.id} value={row.id}>{row.caseNumber} — {row.title}</option>)}
        </Select>
      </Field>
    </div>

    <section className="space-y-3 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Historical payments received</h2><p className="text-sm text-muted2">Each row is saved directly as CONFIRMED because the payment already happened before it was entered in JUN.</p></div>
        <Button type="button" variant="outline" onClick={() => setPayments((rows) => [...rows, newPayment()])}>+ Add payment</Button>
      </div>

      {payments.map((row, index) => <div key={index} className="rounded-xl border border-line bg-surface/40 p-4">
        <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">Payment #{index + 1}</div>{payments.length > 1 ? <Button type="button" size="sm" variant="ghost" onClick={() => setPayments((rows) => rows.filter((_, i) => i !== index))}>Remove</Button> : null}</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Original payment date"><Input type="date" value={row.date} onChange={(e) => updatePayment(index, { date: e.target.value })} /></Field>
          <Field label="Amount"><Input type="number" min="0.01" step="0.01" value={row.amount} onChange={(e) => updatePayment(index, { amount: e.target.value })} placeholder="0.00" /></Field>
          <Field label="Currency"><Input value={row.currency} maxLength={3} onChange={(e) => updatePayment(index, { currency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Method"><Select value={row.method} onChange={(e) => updatePayment(index, { method: e.target.value })}>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</Select></Field>
          <div className="xl:col-span-2"><Field label="Transaction / bank reference"><Input value={row.transactionRef} onChange={(e) => updatePayment(index, { transactionRef: e.target.value })} placeholder="Zelle ref, bank reference, transfer ID…" /></Field></div>
          <div className="xl:col-span-2"><Field label="Service / purpose"><Input value={row.purpose} onChange={(e) => updatePayment(index, { purpose: e.target.value })} placeholder="Visa, flight, travel package, document service…" /></Field></div>
          <div className="md:col-span-2 xl:col-span-4"><Field label="Notes"><Textarea rows={2} value={row.notes} onChange={(e) => updatePayment(index, { notes: e.target.value })} placeholder="Optional context, conversion details, original receipt information…" /></Field></div>
        </div>
      </div>)}

      {paymentTotals.length ? <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm"><span className="font-medium">Payments in this batch:</span> {paymentTotals.map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join(" · ")}</div> : null}
    </section>

    <section className="space-y-3 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Historical refunds already paid</h2><p className="text-sm text-muted2">Each row is saved directly as PAID with its real historical payout date.</p></div>
        <Button type="button" variant="outline" onClick={() => setRefunds((rows) => [...rows, newRefund()])}>+ Add refund</Button>
      </div>

      {refunds.map((row, index) => <div key={index} className="rounded-xl border border-line bg-surface/40 p-4">
        <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">Refund #{index + 1}</div>{refunds.length > 1 ? <Button type="button" size="sm" variant="ghost" onClick={() => setRefunds((rows) => rows.filter((_, i) => i !== index))}>Remove</Button> : null}</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Actual refund date"><Input type="date" value={row.date} onChange={(e) => updateRefund(index, { date: e.target.value })} /></Field>
          <Field label="Amount"><Input type="number" min="0.01" step="0.01" value={row.amount} onChange={(e) => updateRefund(index, { amount: e.target.value })} placeholder="0.00" /></Field>
          <Field label="Currency"><Input value={row.currency} maxLength={3} onChange={(e) => updateRefund(index, { currency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Payout method"><Select value={row.method} onChange={(e) => updateRefund(index, { method: e.target.value })}>{REFUND_METHODS.map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</Select></Field>
          <div className="xl:col-span-2"><Field label="Transaction / payout reference"><Input value={row.transactionRef} onChange={(e) => updateRefund(index, { transactionRef: e.target.value })} placeholder="Zelle ref, bank ref, MTCN, transfer ID…" /></Field></div>
          <div className="xl:col-span-2"><Field label="Reason"><Input value={row.reason} onChange={(e) => updateRefund(index, { reason: e.target.value })} placeholder="Refund of travel service, cancelled process…" /></Field></div>
          <div className="md:col-span-2 xl:col-span-4"><Field label="Notes"><Textarea rows={2} value={row.notes} onChange={(e) => updateRefund(index, { notes: e.target.value })} placeholder="Optional historical context or proof information…" /></Field></div>
        </div>
      </div>)}

      {refundTotals.length ? <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm"><span className="font-medium">Refunds in this batch:</span> {refundTotals.map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join(" · ")}</div> : null}
    </section>

    <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
      <label className="flex items-start gap-3 text-sm text-amber-950">
        <input type="checkbox" name="confirmHistorical" value="yes" className="mt-1" required />
        <span><strong>I confirm these are historical transactions that already occurred.</strong> This special backfill bypasses the normal Pending/Approval timeline and records the payments as confirmed and the completed refunds as paid. The batch is audit-logged and protected against accidental resubmission.</span>
      </label>
    </div>

    {state.message ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.message}</div> : null}
    <div className="flex justify-end"><SubmitButton /></div>
  </form>;
}
