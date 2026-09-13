import { Mail, MessageCircle, Send } from "lucide-react";
import { sendRefundClaimForm } from "@/services/refund-claims";

type ClientOpt = { id: string; label: string; email: string | null; phone: string | null };
type PaymentOpt = { id: string; clientId: string; label: string };

/** "Send a refund request form to a client" — client picker (or fixed client), optional payment, channels. */
export function RefundClaimSendPanel({
  clients,
  payments,
  fixedClient,
  returnTo,
  compact = false,
}: {
  clients?: ClientOpt[];
  payments?: PaymentOpt[];
  fixedClient?: ClientOpt;
  returnTo: string;
  compact?: boolean;
}) {
  const hasEmail = fixedClient ? Boolean(fixedClient.email) : true;
  const hasPhone = fixedClient ? Boolean(fixedClient.phone) : true;
  return (
    <form
      action={sendRefundClaimForm}
      className={`space-y-3 rounded-2xl border border-line bg-white ${compact ? "p-4" : "p-5"}`}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Envoyer un formulaire de demande de remboursement</div>
          <p className="text-xs text-muted2">
            Le client reçoit un lien sécurisé : montant, motif, mode de remboursement, justificatifs. La
            demande arrive ici pour examen.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fixedClient ? (
          <input type="hidden" name="clientId" value={fixedClient.id} />
        ) : (
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted2">Client</span>
            <select
              name="clientId"
              required
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric"
              defaultValue=""
            >
              <option value="" disabled>
                Choisir un client…
              </option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted2">Paiement concerné (facultatif)</span>
          <select
            name="paymentId"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric"
            defaultValue=""
          >
            <option value="">Le client choisira parmi ses paiements</option>
            {(payments ?? [])
              .filter((p) => !fixedClient || p.clientId === fixedClient.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
          </select>
        </label>
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
          <Send className="h-3.5 w-3.5" /> Envoyer le formulaire
        </button>
      </div>
    </form>
  );
}
