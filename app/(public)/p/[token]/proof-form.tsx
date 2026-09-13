"use client";
import { useState } from "react";
import { Camera, CreditCard, FileUp, Loader2, Send } from "lucide-react";

type Method = { code: string; label: string; instructions: string | null };

export function ProofForm({
  token,
  language,
  amount,
  currency,
  methods,
  onlineUrl,
  defaultName,
}: {
  token: string;
  language: string;
  amount: number;
  currency: string;
  methods: Method[];
  onlineUrl: string | null;
  defaultName: string;
}) {
  const fr = language === "fr";
  const [method, setMethod] = useState(
    methods.find((m) => m.code !== "ONLINE")?.code ?? methods[0]?.code ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const current = methods.find((m) => m.code === method);
  const input =
    "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric";
  const label = "mb-1 block text-sm font-medium";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!files.length)
      return setError(
        fr
          ? "Joignez la preuve de paiement (photo du reçu ou capture)."
          : "Attach the payment proof (receipt photo or screenshot).",
      );
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/p/${token}`, { method: "POST", body: new FormData(e.currentTarget) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) setError(data.error ?? (fr ? "Envoi impossible" : "Failed"));
      else setDone(true);
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {fr
          ? "Merci ! Votre preuve est transmise ; vous recevrez votre reçu dès confirmation."
          : "Thank you! Your proof was sent; you will receive your receipt once confirmed."}
      </div>
    );

  return (
    <div className="mt-6 space-y-4">
      {onlineUrl ? (
        <a
          href={onlineUrl}
          className="flex items-center justify-between rounded-xl border-2 border-electric bg-blue-50 p-4 text-sm hover:bg-blue-100"
        >
          <span className="flex items-center gap-2 font-semibold text-electric">
            <CreditCard className="h-5 w-5" /> {fr ? "Payer en ligne par carte" : "Pay online by card"}
          </span>
          <span className="text-xs text-muted2">
            {fr ? "immédiat, sans preuve à envoyer" : "instant, no proof needed"}
          </span>
        </a>
      ) : null}
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-white p-4">
        <div className="text-sm font-semibold">
          {fr ? "Ou payez par un autre moyen et envoyez la preuve" : "Or pay another way and send the proof"}
        </div>
        <div>
          <label className={label}>{fr ? "Moyen de paiement" : "Payment method"}</label>
          <select name="method" value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
            {methods
              .filter((m) => m.code !== "ONLINE")
              .map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
          </select>
        </div>
        {current?.instructions ? (
          <div className="rounded-lg border border-line bg-surface p-3 text-sm">
            <div className="mb-1 text-xs font-medium text-muted2">{fr ? "Instructions" : "Instructions"}</div>
            <pre className="whitespace-pre-wrap font-sans">{current.instructions}</pre>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>{fr ? "Montant payé" : "Amount paid"}</label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={amount.toFixed(2)}
              required
              className={input}
            />
            <p className="mt-1 text-[11px] text-muted2">{currency}</p>
          </div>
          <div>
            <label className={label}>{fr ? "Date du paiement" : "Payment date"}</label>
            <input
              name="paidOn"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={input}
            />
          </div>
          <div>
            <label className={label}>{fr ? "Nom du payeur" : "Payer name"}</label>
            <input name="payerName" defaultValue={defaultName} required className={input} />
          </div>
          <div>
            <label className={label}>
              {fr ? "Référence / n° de transaction" : "Reference / transaction number"}
            </label>
            <input name="reference" className={input} />
          </div>
        </div>
        <div>
          <label className={label}>{fr ? "Preuve de paiement" : "Payment proof"} *</label>
          <div className="flex flex-wrap gap-2">
            <label
              htmlFor="pf-cam"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-electric px-3 py-2 text-sm font-medium text-white"
            >
              <Camera className="h-4 w-4" /> {fr ? "Prendre une photo" : "Take a photo"}
            </label>
            <input
              id="pf-cam"
              name="files"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((f) => f.name))}
            />
            <label
              htmlFor="pf-file"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface"
            >
              <FileUp className="h-4 w-4" /> {fr ? "Choisir un fichier" : "Choose a file"}
            </label>
            <input
              id="pf-file"
              name="files"
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((f) => f.name))}
            />
          </div>
          {files.length ? (
            <p className="mt-1 text-xs text-emerald-700">{files.join(", ")}</p>
          ) : (
            <p className="mt-1 text-xs text-muted2">
              {fr ? "Reçu, capture d’écran du virement, ticket…" : "Receipt, transfer screenshot, ticket…"}
            </p>
          )}
        </div>
        <div>
          <label className={label}>{fr ? "Note (facultatif)" : "Note (optional)"}</label>
          <input name="note" className={input} />
        </div>
        <div className="hidden" aria-hidden="true">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>
        {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <button
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-electric px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{" "}
          {fr ? "Envoyer la preuve" : "Send the proof"}
        </button>
      </form>
    </div>
  );
}
