"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveRefundPaymentPlan } from "@/services/refund-payment-plan";
import { moneyCents, type PlanRow } from "@/lib/refund-payment-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Submit({ disabled, partial }: { disabled: boolean; partial: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="primary" disabled={disabled || pending} className="min-h-11 w-full sm:w-auto">{pending ? "Enregistrement…" : partial ? "Préparer ce versement partiel" : "Enregistrer les tranches"}</Button>;
}

export function RefundPaymentPlan({ refundId, remaining, currency, snapshot, requestId, defaultDate }: { refundId: string; remaining: number; currency: string; snapshot: string; requestId: string; defaultDate: string }) {
  const [mode, setMode] = useState<"partial" | "schedule">("partial");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [balanceDate, setBalanceDate] = useState(defaultDate);
  const [rows, setRows] = useState<PlanRow[]>([{ amount: (remaining / 100).toFixed(2), dueDate: defaultDate }]);
  const [state, action] = useFormState(saveRefundPaymentPlan.bind(null, refundId), { message: "", success: false });
  let partial = 0;
  try { partial = moneyCents(amount); } catch { /* Incomplete input stays invalid. */ }
  const planned: PlanRow[] = mode === "partial" ? [{ amount, dueDate: date }, { amount: ((remaining - partial) / 100).toFixed(2), dueDate: balanceDate }] : rows;
  let total = 0, valid = true;
  try { total = planned.reduce((sum, row) => sum + moneyCents(row.amount), 0); } catch { valid = false; }
  valid = valid && total === remaining && (mode !== "partial" || (partial > 0 && partial < remaining));
  const change = (index: number, key: keyof PlanRow, value: string) => setRows(current => current.map((row, i) => i === index ? { ...row, [key]: value } : row));
  return <section className="min-w-0 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 sm:p-5">
    <h3 className="text-base font-semibold">Paiement partiel ou en plusieurs tranches</h3>
    <p className="mt-2 text-sm text-muted2">Répartissez le solde de {(remaining / 100).toFixed(2)} {currency}. Les versements déjà payés restent conservés. Préparer un versement ne le marque pas comme payé.</p>
    <div className="my-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Button type="button" aria-pressed={mode === "partial"} variant={mode === "partial" ? "primary" : "outline"} className="min-h-11" onClick={() => setMode("partial")}>Paiement partiel</Button>
      <Button type="button" aria-pressed={mode === "schedule"} variant={mode === "schedule" ? "primary" : "outline"} className="min-h-11" onClick={() => setMode("schedule")}>Répartir le solde en tranches</Button>
    </div>
    <form action={action} className="min-w-0 space-y-4">
      <input type="hidden" name="snapshot" value={snapshot} /><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="rows" value={JSON.stringify(planned)} />
      {mode === "partial" ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm">Montant du versement ({currency})<Input className="mt-1 text-base" type="number" inputMode="decimal" min="0.01" max={((remaining - 1) / 100).toFixed(2)} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required /></label>
        <label className="min-w-0 text-sm">Échéance du versement<Input className="mt-1 text-base" type="date" value={date} onChange={e => setDate(e.target.value)} required /></label>
        <p className="self-center text-sm">Solde après ce versement : {((remaining - partial) / 100).toFixed(2)} {currency}</p>
        <label className="min-w-0 text-sm">Échéance du solde<Input className="mt-1 text-base" type="date" value={balanceDate} onChange={e => setBalanceDate(e.target.value)} required /></label>
      </div> : <div className="space-y-3">{rows.map((row, index) => <fieldset key={index} className="min-w-0 rounded-xl border border-line p-3"><legend className="px-1 text-sm">Tranche {index + 1}</legend><div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="min-w-0 text-sm">Montant ({currency})<Input className="mt-1 text-base" type="number" inputMode="decimal" min="0.01" step="0.01" value={row.amount} onChange={e => change(index, "amount", e.target.value)} required /></label>
        <label className="min-w-0 text-sm">Échéance<Input className="mt-1 text-base" type="date" value={row.dueDate} onChange={e => change(index, "dueDate", e.target.value)} required /></label>
        <Button type="button" variant="outline" className="min-h-11 self-end" disabled={rows.length === 1} aria-label={`Supprimer la tranche ${index + 1}`} onClick={() => setRows(current => current.filter((_, i) => i !== index))}>Supprimer</Button>
      </div></fieldset>)}<Button type="button" variant="outline" className="min-h-11" disabled={rows.length >= 24} onClick={() => setRows(current => [...current, { amount: "", dueDate: defaultDate }])}>Ajouter une tranche</Button><p aria-live="polite" className="text-sm">Total : {(total / 100).toFixed(2)} / {(remaining / 100).toFixed(2)} {currency}</p></div>}
      <p className="text-xs leading-relaxed text-muted2">Les tranches non payées seront remplacées par cet échéancier. Ensuite, dans chaque tranche : renseignez la méthode et la référence, ajoutez le justificatif, puis confirmez le paiement après autorisation financière.</p>
      {!valid && <p className="text-sm text-amber-300">Saisissez des montants positifs dont le total correspond au solde restant.</p>}
      {state.message && <p role={state.success ? "status" : "alert"} className={`text-sm ${state.success ? "text-emerald-300" : "text-red-300"}`}>{state.message}</p>}
      <Submit disabled={!valid || state.success} partial={mode === "partial"} />
    </form>
  </section>;
}
