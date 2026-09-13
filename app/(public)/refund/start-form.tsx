"use client";
import { useFormState } from "react-dom";
import { startRefundRequest, type RefundStartState } from "./actions";

export function RefundStartForm() {
  const [state, action] = useFormState<RefundStartState, FormData>(startRefundRequest, { ok: false });
  const input =
    "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric";
  if (state.ok)
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        Si cette adresse correspond à un client, un lien personnel vient de vous être envoyé par e-mail. Il
        est valable 30 jours.
      </div>
    );
  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Adresse e-mail</label>
        <input name="email" type="email" required className={input} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Référence du paiement (facultatif)</label>
        <input name="reference" placeholder="PAY-2026-…" className={input} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Langue</label>
        <select name="language" defaultValue="fr" className={input}>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="hidden" aria-hidden="true">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state.message ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.message}</p>
      ) : null}
      <button className="h-11 rounded-lg bg-electric px-5 text-sm font-semibold text-white">
        Recevoir mon lien
      </button>
    </form>
  );
}
