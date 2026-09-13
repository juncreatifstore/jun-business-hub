"use client";
import { useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";

/** Full or partial approval: approved amount, reason for the deduction, services already delivered, proofs. */
export function PartialDecisionForm({
  claimId,
  currency,
  requested,
  action,
}: {
  claimId: string;
  currency: string;
  requested: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const [mode, setMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [services, setServices] = useState<Array<{ description: string; amount: string }>>([
    { description: "", amount: "" },
  ]);
  const retained = services.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const approved = mode === "FULL" ? requested : Math.max(0, Math.round((requested - retained) * 100) / 100);
  const input =
    "h-9 w-full rounded-lg border border-line bg-white px-2 text-sm outline-none focus:border-electric";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={claimId} />
      <div className="flex gap-2 text-xs">
        <label
          className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 ${mode === "FULL" ? "border-electric bg-blue-50 text-electric" : "border-line"}`}
        >
          <input
            type="radio"
            name="mode"
            value="FULL"
            checked={mode === "FULL"}
            onChange={() => setMode("FULL")}
            className="mr-1"
          />
          Intégral · {currency} {requested.toFixed(2)}
        </label>
        <label
          className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 ${mode === "PARTIAL" ? "border-amber-400 bg-amber-50 text-amber-900" : "border-line"}`}
        >
          <input
            type="radio"
            name="mode"
            value="PARTIAL"
            checked={mode === "PARTIAL"}
            onChange={() => setMode("PARTIAL")}
            className="mr-1"
          />
          Partiel
        </label>
      </div>
      {mode === "PARTIAL" ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
          <div className="text-xs font-medium">Services déjà rendus (retenus sur le remboursement)</div>
          {services.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px] gap-2">
              <input
                name={`svc${i}_desc`}
                value={s.description}
                onChange={(e) =>
                  setServices((arr) =>
                    arr.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                  )
                }
                placeholder="ex. Frais de dossier consulaire déjà payés"
                className={input}
              />
              <input
                name={`svc${i}_amount`}
                value={s.amount}
                onChange={(e) =>
                  setServices((arr) => arr.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                }
                type="number"
                step="0.01"
                min="0"
                placeholder={currency}
                className={input}
              />
            </div>
          ))}
          {services.length < 8 ? (
            <button
              type="button"
              onClick={() => setServices((a) => [...a, { description: "", amount: "" }])}
              className="inline-flex items-center gap-1 text-xs text-electric"
            >
              <Plus className="h-3.5 w-3.5" /> Ajouter un service
            </button>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-medium">
              Raison de la retenue (envoyée au client) *
            </label>
            <textarea
              name="partialReason"
              rows={2}
              required={mode === "PARTIAL"}
              placeholder="ex. Le visa a été déposé au consulat le 12/08 ; les frais consulaires ne sont pas récupérables."
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-electric"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              Preuves des services rendus (reçus, confirmations, captures)
            </label>
            <input
              name="proofs"
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="block w-full text-xs"
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted2">
              Retenu {currency} {retained.toFixed(2)}
            </span>
            <span>
              Montant accepté :{" "}
              <input
                name="approvedAmount"
                type="number"
                step="0.01"
                min="0.01"
                max={requested}
                value={approved.toFixed(2)}
                onChange={() => undefined}
                readOnly
                className="ml-1 w-28 rounded-md border border-line bg-white px-2 py-1 text-right font-semibold"
              />
            </span>
          </div>
        </div>
      ) : (
        <input type="hidden" name="approvedAmount" value={requested.toFixed(2)} />
      )}
      <textarea
        name="note"
        rows={2}
        placeholder="Note interne (facultatif)…"
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-electric"
      />
      <button
        disabled={mode === "PARTIAL" && approved <= 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-electric px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        <CheckCircle2 className="h-4 w-4" /> Accepter {currency} {approved.toFixed(2)} → créer le
        remboursement
      </button>
      <p className="text-[11px] text-muted2">
        Ouvre le formulaire de remboursement pré-rempli ; les contrôles de solde s’appliquent. Le client
        reçoit le détail (montant, motif de retenue, services rendus).
      </p>
    </form>
  );
}
