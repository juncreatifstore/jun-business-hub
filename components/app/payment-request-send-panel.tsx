import { Mail, MessageCircle, Send } from "lucide-react";
import { sendPaymentRequest } from "@/services/payment-requests";
import { PAY_METHODS } from "@/lib/payment-requests";

type ClientOpt = { id: string; label: string; email: string | null; phone: string | null };

export function PaymentRequestSendPanel({
  clients,
  fixedClient,
  returnTo,
  defaultCaseId,
}: {
  clients?: ClientOpt[];
  fixedClient?: ClientOpt;
  returnTo: string;
  defaultCaseId?: string | null;
}) {
  const hasEmail = fixedClient ? Boolean(fixedClient.email) : true;
  const hasPhone = fixedClient ? Boolean(fixedClient.phone) : true;
  const input =
    "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric";
  return (
    <form action={sendPaymentRequest} className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      {defaultCaseId ? <input type="hidden" name="caseId" value={defaultCaseId} /> : null}
      <div>
        <div className="font-semibold">Demander un paiement au client</div>
        <p className="text-xs text-muted2">
          Le client reçoit un lien : montant, instructions par moyen de paiement, dépôt de la preuve (photo du
          reçu). La preuve crée un paiement « en attente » à confirmer ici.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fixedClient ? (
          <input type="hidden" name="clientId" value={fixedClient.id} />
        ) : (
          <select name="clientId" required className={input} defaultValue="">
            <option value="" disabled>
              Choisir un client…
            </option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <input
          name="description"
          required
          placeholder="Libellé (ex. Acompte visa Canada — dossier CAS-0042)"
          className={input}
        />
        <div className="flex gap-2">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="Montant"
            className={input}
          />
          <input
            name="currency"
            defaultValue="USD"
            maxLength={3}
            className="h-10 w-20 rounded-lg border border-line bg-white px-2 text-sm uppercase outline-none focus:border-electric"
          />
        </div>
        <input name="dueAt" type="date" className={input} title="Échéance" />
        <input
          name="onlineUrl"
          placeholder="Lien de paiement en ligne existant (facultatif, /pay/…)"
          className={`${input} sm:col-span-2`}
        />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-muted2">Moyens acceptés :</span>
        {PAY_METHODS.filter((m) => m.code !== "ONLINE").map((m) => (
          <label key={m.code} className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              name="methods"
              value={m.code}
              defaultChecked={["BANK_TRANSFER", "ZELLE", "MONCASH", "CASH"].includes(m.code)}
            />{" "}
            {m.fr}
          </label>
        ))}
      </div>
      <textarea
        name="message"
        rows={2}
        placeholder="Message personnel (facultatif)…"
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-electric"
      />
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className={`inline-flex items-center gap-1.5 ${hasEmail ? "" : "opacity-50"}`}>
          <input type="checkbox" name="via_email" defaultChecked={hasEmail} disabled={!hasEmail} />{" "}
          <Mail className="h-3.5 w-3.5" /> E-mail
        </label>
        <label className={`inline-flex items-center gap-1.5 ${hasPhone ? "" : "opacity-50"}`}>
          <input type="checkbox" name="via_whatsapp" disabled={!hasPhone} />{" "}
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </label>
        <select
          name="language"
          defaultValue="fr"
          className="h-7 rounded-md border border-line bg-white px-1.5"
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
        <button className="ml-auto inline-flex items-center gap-1 rounded-lg bg-electric px-3 py-2 text-xs font-medium text-white">
          <Send className="h-3.5 w-3.5" /> Envoyer la demande
        </button>
      </div>
    </form>
  );
}
