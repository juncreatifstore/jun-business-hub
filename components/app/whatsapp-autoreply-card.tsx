import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAutoReplySettings, isWithinHours } from "@/lib/whatsapp-autoreply";
import { saveWhatsAppAutoReply } from "@/services/whatsapp-autoreply";

const DAYS = [
  ["1", "Lundi"],
  ["2", "Mardi"],
  ["3", "Mercredi"],
  ["4", "Jeudi"],
  ["5", "Vendredi"],
  ["6", "Samedi"],
  ["0", "Dimanche"],
] as const;
const TZ = [
  "America/Santo_Domingo",
  "America/Port-au-Prince",
  "America/Mexico_City",
  "America/New_York",
  "America/Toronto",
  "Europe/Paris",
  "America/Santiago",
  "America/Bogota",
];

export async function WhatsAppAutoReplyCard() {
  const s = await getAutoReplySettings();
  const openNow = isWithinHours(s);
  const input =
    "h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-electric";
  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle>Réponses automatiques WhatsApp</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={saveWhatsAppAutoReply} className="space-y-5 text-sm">
          <p className="text-muted2">
            Quand un client écrit, le hub répond automatiquement dans trois situations :{" "}
            <strong>hors horaires</strong> (message de fermeture), <strong>dossier en cours</strong> (statut
            et pièces attendues) et <strong>remboursement, réclamation ou paiement en cours</strong> (état et
            liens utiles). Une seule réponse automatique par numéro par période, jamais aux messages audio ;
            en horaires d’ouverture, un contact inconnu ne reçoit rien (un conseiller répond).
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="enabled" value="1" defaultChecked={s.enabled} /> Activer
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="includeStatus" value="1" defaultChecked={s.includeStatus} />{" "}
              Inclure l’état des démarches en cours
            </label>
            <label className="inline-flex items-center gap-2">
              Fuseau
              <select name="timezone" defaultValue={s.timezone} className={input}>
                {TZ.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2">
              Une réponse par numéro toutes les
              <input
                name="cooldownHours"
                type="number"
                min={1}
                max={168}
                defaultValue={s.cooldownHours}
                className={`${input} w-20`}
              />{" "}
              h
            </label>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${openNow ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}
            >
              {openNow ? "Ouvert en ce moment" : "Fermé en ce moment"}
            </span>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-muted2">
              Horaires d’ouverture (laisser vide = fermé)
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {DAYS.map(([d, label]) => (
                <div key={d} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="w-20 text-xs">{label}</span>
                  <input
                    name={`open_${d}`}
                    type="time"
                    defaultValue={s.hours[d]?.open ?? ""}
                    className={`${input} w-28`}
                  />
                  <span className="text-muted2">–</span>
                  <input
                    name={`close_${d}`}
                    type="time"
                    defaultValue={s.hours[d]?.close ?? ""}
                    className={`${input} w-28`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block font-medium text-muted2">Message hors horaires (français)</span>
              <textarea
                name="outOfHours_fr"
                rows={3}
                defaultValue={s.outOfHours.fr}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-electric"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-muted2">Out-of-hours message (English)</span>
              <textarea
                name="outOfHours_en"
                rows={3}
                defaultValue={s.outOfHours.en}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-electric"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-muted2">
                Accusé en horaires, client avec démarche en cours (français)
              </span>
              <textarea
                name="inHours_fr"
                rows={2}
                defaultValue={s.inHoursGreeting.fr}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-electric"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-muted2">
                In-hours acknowledgement, client with something in progress (English)
              </span>
              <textarea
                name="inHours_en"
                rows={2}
                defaultValue={s.inHoursGreeting.en}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-electric"
              />
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-muted2">Signature</span>
            <input name="signature" defaultValue={s.signature} className={`${input} w-full max-w-md`} />
          </label>
          <div className="rounded-lg border border-line bg-surface p-3 text-xs text-muted2">
            <div className="mb-1 font-medium text-ink">
              Aperçu (client avec dossier en attente de pièces, hors horaires)
            </div>
            <pre className="whitespace-pre-wrap font-sans">{`Bonjour Marie,\n\n${s.outOfHours.fr}\n\nPour information, voici où en sont vos démarches :\n• Dossier CAS-0042 (Visa Canada) : en attente d’éléments de votre part — pièces attendues : Passport, Bank statement\n• Paiement demandé : USD 500.00 (Acompte visa) — https://www.juncreatif.org/p/…\n\n${s.signature}`}</pre>
          </div>
          <Button type="submit" variant="secondary">
            Enregistrer les réponses automatiques
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
