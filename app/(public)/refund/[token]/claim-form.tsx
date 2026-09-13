"use client";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";

type Payment = { id: string; reference: string; amount: number; currency: string; date: string };

export function ClaimForm({
  token,
  language,
  payments,
  lockedPayment,
  defaultEmail,
  defaultPhone,
  reasons,
  payouts,
}: {
  token: string;
  language: string;
  payments: Payment[];
  lockedPayment: boolean;
  defaultEmail: string;
  defaultPhone: string;
  reasons: { code: string; label: string }[];
  payouts: { code: string; label: string }[];
}) {
  const fr = language === "fr";
  const [paymentId, setPaymentId] = useState(payments[0]?.id ?? "");
  const [payout, setPayout] = useState("ORIGINAL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const selected = payments.find((p) => p.id === paymentId) ?? null;
  const input =
    "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric";
  const label = "mb-1 block text-sm font-medium";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData(e.currentTarget);
      const res = await fetch(`/api/refund/${token}`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) setError(data.error ?? (fr ? "Envoi impossible" : "Submission failed"));
      else setDone(true);
    } catch {
      setError(fr ? "Envoi impossible" : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {fr
          ? "Merci, votre demande est envoyée. Un accusé de réception vous a été adressé par e-mail."
          : "Thank you, your request was sent. An acknowledgement was e-mailed to you."}
      </div>
    );

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <fieldset className="space-y-3 rounded-xl border border-line bg-white p-4">
        <legend className="px-1 text-sm font-semibold">
          {fr ? "1. Paiement concerné" : "1. Payment concerned"}
        </legend>
        {payments.length ? (
          <div>
            <label className={label}>{fr ? "Paiement" : "Payment"}</label>
            <select
              name="paymentId"
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value)}
              disabled={lockedPayment}
              className={input}
            >
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.reference} · {p.currency} {p.amount.toFixed(2)} ·{" "}
                  {new Date(p.date).toLocaleDateString(fr ? "fr-FR" : "en-US")}
                </option>
              ))}
              {!lockedPayment ? (
                <option value="">{fr ? "Autre / je ne sais pas" : "Other / not sure"}</option>
              ) : null}
            </select>
          </div>
        ) : (
          <p className="text-xs text-muted2">
            {fr
              ? "Aucun paiement confirmé trouvé ; indiquez la référence ou la date dans le motif."
              : "No confirmed payment found; mention the reference or date in the reason."}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>{fr ? "Montant demandé" : "Amount requested"}</label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={selected?.amount ?? undefined}
              defaultValue={selected?.amount.toFixed(2) ?? ""}
              required
              className={input}
            />
            {selected ? (
              <p className="mt-1 text-[11px] text-muted2">
                {fr ? "Maximum" : "Maximum"}: {selected.currency} {selected.amount.toFixed(2)}
              </p>
            ) : null}
          </div>
          <div>
            <label className={label}>{fr ? "Devise" : "Currency"}</label>
            <input
              name="currency"
              defaultValue={selected?.currency ?? "USD"}
              readOnly={Boolean(selected)}
              maxLength={3}
              className={input}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-line bg-white p-4">
        <legend className="px-1 text-sm font-semibold">{fr ? "2. Motif" : "2. Reason"}</legend>
        <div>
          <label className={label}>{fr ? "Motif principal" : "Main reason"}</label>
          <select name="reasonCode" required className={input} defaultValue="">
            <option value="" disabled>
              {fr ? "Choisir…" : "Choose…"}
            </option>
            {reasons.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>{fr ? "Explications" : "Details"}</label>
          <textarea
            name="reason"
            rows={4}
            required
            maxLength={2000}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-electric"
            placeholder={
              fr
                ? "Décrivez la situation (dates, référence, ce qui s’est passé)…"
                : "Describe what happened (dates, reference)…"
            }
          />
        </div>
        <div>
          <label className={label}>
            {fr ? "Justificatifs (facultatif)" : "Supporting documents (optional)"}
          </label>
          <input
            name="files"
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="block w-full text-sm"
          />
          <p className="mt-1 text-[11px] text-muted2">
            {fr
              ? "Photos ou PDF, 15 Mo max chacun, 5 fichiers max."
              : "Photos or PDF, 15 MB each, up to 5 files."}
          </p>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-line bg-white p-4">
        <legend className="px-1 text-sm font-semibold">
          {fr ? "3. Mode de remboursement" : "3. Refund method"}
        </legend>
        <select
          name="payoutMethod"
          value={payout}
          onChange={(e) => setPayout(e.target.value)}
          className={input}
        >
          {payouts.map((m) => (
            <option key={m.code} value={m.code}>
              {m.label}
            </option>
          ))}
        </select>
        {payout === "BANK_TRANSFER" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>{fr ? "Titulaire du compte" : "Account holder"}</label>
              <input name="bankHolder" required className={input} />
            </div>
            <div>
              <label className={label}>{fr ? "Banque" : "Bank"}</label>
              <input name="bankName" required className={input} />
            </div>
            <div>
              <label className={label}>{fr ? "IBAN / numéro de compte" : "IBAN / account number"}</label>
              <input name="bankAccount" required className={input} />
            </div>
            <div>
              <label className={label}>
                {fr ? "SWIFT / BIC / routing (si hors zone)" : "SWIFT / BIC / routing"}
              </label>
              <input name="bankSwift" className={input} />
            </div>
            <div>
              <label className={label}>{fr ? "Pays de la banque" : "Bank country"}</label>
              <input name="bankCountry" className={input} />
            </div>
          </div>
        ) : payout === "OTHER" ? (
          <div>
            <label className={label}>{fr ? "Précisez" : "Please specify"}</label>
            <input name="payoutOther" required className={input} />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-line bg-white p-4">
        <legend className="px-1 text-sm font-semibold">{fr ? "4. Vous joindre" : "4. Reaching you"}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>E-mail</label>
            <input name="contactEmail" type="email" defaultValue={defaultEmail} required className={input} />
          </div>
          <div>
            <label className={label}>{fr ? "Téléphone / WhatsApp" : "Phone / WhatsApp"}</label>
            <input name="contactPhone" defaultValue={defaultPhone} className={input} />
          </div>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted2">
          <input type="checkbox" name="consent" required className="mt-0.5" />
          {fr
            ? "Je certifie l’exactitude de ces informations et j’accepte que JUN CREATIF AND TRAVEL LLC les traite pour instruire ma demande."
            : "I certify this information is accurate and agree that JUN CREATIF AND TRAVEL LLC processes it to handle my request."}
        </label>
        <div className="hidden" aria-hidden="true">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>
      </fieldset>

      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <button
        disabled={busy}
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-electric px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {fr ? "Envoyer ma demande" : "Submit my request"}
      </button>
    </form>
  );
}
