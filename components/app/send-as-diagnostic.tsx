import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listGoogleSendAsAliases } from "@/lib/google/gmail-aliases";
import { AUTOMATED_NO_REPLY_EMAIL, EMAIL_ALIAS_DESTINATION } from "@/lib/email-aliases";
import { getOtpSenderAccountId } from "@/lib/mail-otp-sender";

/**
 * Shows which addresses Gmail lets the automation mailbox send from ("Send
 * mail as"), and whether noreply@ is among them. Gmail silently rewrites the
 * From header to the primary address otherwise.
 */
export async function SendAsDiagnostic() {
  const accountId = await getOtpSenderAccountId().catch(() => null);
  if (!accountId) return null;
  let aliases: Awaited<ReturnType<typeof listGoogleSendAsAliases>> = [];
  let error: string | null = null;
  try {
    aliases = await listGoogleSendAsAliases(accountId);
  } catch (e) {
    error = e instanceof Error ? e.message : "Lecture impossible";
  }
  const noreply = aliases.find((a) => a.sendAsEmail.toLowerCase() === AUTOMATED_NO_REPLY_EMAIL);
  const ok = Boolean(noreply && (noreply.verificationStatus === "accepted" || noreply.isPrimary));
  return (
    <Card className={`mb-6 ${ok ? "" : "border-amber-200"}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-4 w-4" /> Expéditeur des e-mails automatiques
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted2">
          Le hub envoie les e-mails automatiques depuis <strong>{AUTOMATED_NO_REPLY_EMAIL}</strong> via la
          boîte {EMAIL_ALIAS_DESTINATION}. Gmail n’accepte cet expéditeur que si l’adresse figure dans «
          Envoyer des e-mails en tant que » de cette boîte ; sinon il remplace l’expéditeur par l’adresse
          principale.
        </p>
        {error ? (
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900">{error}</p>
        ) : (
          <>
            <div
              className={`flex items-center gap-2 rounded-lg p-3 ${ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
            >
              {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {ok
                ? `${AUTOMATED_NO_REPLY_EMAIL} est autorisé en émission${noreply?.displayName ? ` (nom affiché : « ${noreply.displayName} »)` : " — sans nom d’affichage"}.`
                : noreply
                  ? `${AUTOMATED_NO_REPLY_EMAIL} est déclaré mais son statut est « ${noreply.verificationStatus ?? "inconnu"} » : Gmail réécrit l’expéditeur.`
                  : `${AUTOMATED_NO_REPLY_EMAIL} n’est pas dans la liste « Envoyer des e-mails en tant que » de ${EMAIL_ALIAS_DESTINATION} : Gmail réécrit l’expéditeur en ${EMAIL_ALIAS_DESTINATION}.`}
            </div>
            <table className="w-full text-xs">
              <thead className="text-left text-muted2">
                <tr>
                  <th className="py-1">Adresse d’émission autorisée</th>
                  <th className="py-1">Nom affiché</th>
                  <th className="py-1">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {aliases.map((a) => (
                  <tr key={a.sendAsEmail}>
                    <td className="py-1 font-mono">
                      {a.sendAsEmail}
                      {a.isPrimary ? (
                        <span className="ml-1 rounded bg-surface px-1 text-[10px]">principale</span>
                      ) : null}
                      {a.isDefault ? (
                        <span className="ml-1 rounded bg-surface px-1 text-[10px]">par défaut</span>
                      ) : null}
                    </td>
                    <td className="py-1">{a.displayName || "—"}</td>
                    <td className="py-1">{a.isPrimary ? "—" : (a.verificationStatus ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!ok ? (
              <p className="text-xs text-muted2">
                Dans Gmail ({EMAIL_ALIAS_DESTINATION}) → Paramètres → <em>Comptes et importation</em> →{" "}
                <em>Envoyer des e-mails en tant que</em> → Ajouter une autre adresse →{" "}
                <strong>{AUTOMATED_NO_REPLY_EMAIL}</strong>, nom « JUN Creatif &amp; Travel », « Traiter comme
                un alias » coché. Pour un alias du même domaine, aucune vérification n’est demandée ; si un
                code est demandé, il arrive dans cette même boîte (l’alias est reçu par{" "}
                {EMAIL_ALIAS_DESTINATION}).
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
