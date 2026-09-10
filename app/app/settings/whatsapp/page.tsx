import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GENERAL_DOCUMENT_TEMPLATE, getWhatsAppConfig } from "@/lib/whatsapp";
import { getWhatsAppWabaSubscriptionStatus } from "@/lib/whatsapp-waba-subscription";
import { getWhatsAppPhoneWabaMatch } from "@/lib/whatsapp-phone-waba-match";
import { saveWhatsAppSettings } from "@/services/whatsapp";
import { subscribeWhatsAppAppToWaba } from "@/services/whatsapp-waba-subscription";
import { testWhatsAppWebhookLocally } from "@/services/whatsapp-webhook-test";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function WhatsAppSettingsPage() {
  const user = await requireUser();
  if (!can(user, "SETTINGS_MANAGE")) redirect("/app/forbidden");
  const [cfg, subscription, phoneWabaMatch, heartbeatRow, localTestRow] = await Promise.all([
    getWhatsAppConfig(),
    getWhatsAppWabaSubscriptionStatus(),
    getWhatsAppPhoneWabaMatch(),
    prisma.appSetting.findUnique({ where: { key: "whatsapp.webhook.last_event" }, select: { value: true } }),
    prisma.appSetting.findUnique({
      where: { key: "whatsapp.webhook.last_local_test" },
      select: { value: true },
    }),
  ]);
  let heartbeat: { receivedAt?: string; messages?: number; statuses?: number; entries?: number } | null =
    null;
  let localTest: {
    testedAt?: string;
    ok?: boolean;
    phone?: string;
    messageId?: string;
    httpStatus?: number;
  } | null = null;
  try {
    heartbeat = heartbeatRow?.value ? JSON.parse(heartbeatRow.value) : null;
  } catch {
    heartbeat = null;
  }
  try {
    localTest = localTestRow?.value ? JSON.parse(localTestRow.value) : null;
  } catch {
    localTest = null;
  }
  const subscribedIds = subscription.subscribedApps.map((a) => a.id).filter(Boolean) as string[];
  const diag = (ok: boolean, warn = true) =>
    ok
      ? "border-emerald-400/20 bg-emerald-500/[0.05]"
      : warn
        ? "border-amber-400/20 bg-amber-500/[0.05]"
        : "border-red-400/20 bg-red-500/[0.05]";
  return (
    <div className="min-w-0 max-w-6xl">
      <PageHeader
        title="WhatsApp Business"
        subtitle="Connexion JUN Business Hub à l’API officielle Meta WhatsApp Cloud."
      />
      <div className="mb-5">
        <Link href="/app/settings" className="text-sm text-electric hover:underline">
          ← Retour aux paramètres
        </Link>
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Diagnostic des messages entrants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div
              className={`min-w-0 rounded-xl border p-4 ${diag(Boolean(subscription.ok && subscription.subscribedApps.length))}`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-muted2">Abonnement WABA</div>
              <div className="mt-1 break-words text-sm font-medium">
                {!subscription.configured
                  ? "Configuration incomplète"
                  : subscription.ok && subscription.subscribedApps.length
                    ? `Abonné · ${subscription.subscribedApps.length} application${subscription.subscribedApps.length === 1 ? "" : "s"}`
                    : subscription.ok
                      ? "Aucune application abonnée"
                      : "Vérification impossible"}
              </div>
              {subscription.error ? (
                <div className="mt-2 break-words text-xs text-danger">{subscription.error}</div>
              ) : null}
              {subscription.subscribedApps.length ? (
                <div className="mt-2 break-words text-xs text-muted2">
                  {subscription.subscribedApps
                    .map((a) => [a.name || "Meta app", a.id ? `ID ${a.id}` : ""].filter(Boolean).join(" · "))
                    .join(" | ")}
                </div>
              ) : null}
            </div>
            <div
              className={`min-w-0 rounded-xl border p-4 ${subscription.appMatch === true ? diag(true) : subscription.appMatch === false ? diag(false, false) : diag(false)}`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-muted2">
                Meta App ID ↔ application abonnée
              </div>
              <div
                className={`mt-1 text-sm font-semibold ${subscription.appMatch === true ? "text-success" : subscription.appMatch === false ? "text-danger" : "text-warning"}`}
              >
                {subscription.appMatch === true
                  ? "MATCH"
                  : subscription.appMatch === false
                    ? "MISMATCH"
                    : "NON VÉRIFIÉ"}
              </div>
              {subscription.expectedAppId ? (
                <div className="mt-2 break-all text-xs text-muted2">
                  App ID configuré : {subscription.expectedAppId}
                </div>
              ) : (
                <div className="mt-2 text-xs text-amber-200">
                  Ajoutez le Meta App ID ci-dessous puis rechargez la page.
                </div>
              )}
              {subscribedIds.length ? (
                <div className="mt-1 break-all text-xs text-muted2">
                  App ID abonné : {subscribedIds.join(", ")}
                </div>
              ) : null}
            </div>
            <div
              className={`min-w-0 rounded-xl border p-4 ${phoneWabaMatch.ok && phoneWabaMatch.match ? diag(true) : phoneWabaMatch.configured ? diag(false, false) : diag(false)}`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-muted2">
                Phone Number ID ↔ WABA
              </div>
              <div
                className={`mt-1 text-sm font-semibold ${phoneWabaMatch.ok && phoneWabaMatch.match ? "text-success" : phoneWabaMatch.configured ? "text-danger" : "text-warning"}`}
              >
                {!phoneWabaMatch.configured
                  ? "Configuration incomplète"
                  : phoneWabaMatch.ok && phoneWabaMatch.match
                    ? "MATCH"
                    : "MISMATCH"}
              </div>
              {phoneWabaMatch.match && phoneWabaMatch.displayPhone ? (
                <div className="mt-2 break-words text-xs text-muted2">
                  {phoneWabaMatch.displayPhone}
                  {phoneWabaMatch.verifiedName ? ` · ${phoneWabaMatch.verifiedName}` : ""}
                </div>
              ) : null}
              {phoneWabaMatch.error ? (
                <div className="mt-2 break-words text-xs text-danger">{phoneWabaMatch.error}</div>
              ) : null}
            </div>
            <div className={`min-w-0 rounded-xl border p-4 ${diag(Boolean(heartbeat?.receivedAt))}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted2">
                Dernier webhook reçu
              </div>
              <div className="mt-1 break-words text-sm font-medium">
                {heartbeat?.receivedAt
                  ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "medium" }).format(
                      new Date(heartbeat.receivedAt),
                    )
                  : "Aucun webhook reçu"}
              </div>
              {heartbeat?.receivedAt ? (
                <div className="mt-2 text-xs text-muted2">
                  Messages : {heartbeat.messages || 0} · Statuts : {heartbeat.statuses || 0} · Entrées :{" "}
                  {heartbeat.entries || 0}
                </div>
              ) : (
                <div className="mt-2 text-xs text-amber-200">
                  Si un client répond et que cette zone reste vide, Meta n’envoie pas les événements à JUN.
                </div>
              )}
            </div>
          </div>
          <div
            className={`rounded-xl border p-4 ${localTest?.ok ? diag(true) : "border-blue-400/20 bg-blue-500/[0.05]"}`}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-muted2">
              Test webhook JUN de bout en bout
            </div>
            <div className="mt-1 text-sm font-medium">
              {localTest?.testedAt
                ? localTest.ok
                  ? "PASS — webhook → base → Inbox fonctionne"
                  : "ÉCHEC — le test n’a pas atteint l’Inbox"
                : "Pas encore testé"}
            </div>
            {localTest?.testedAt ? (
              <div className="mt-2 break-words text-xs text-muted2">
                {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "medium" }).format(
                  new Date(localTest.testedAt),
                )}{" "}
                · HTTP {localTest.httpStatus || "—"}
                {localTest.phone ? ` · +${localTest.phone}` : ""}
              </div>
            ) : (
              <div className="mt-2 text-xs text-blue-200">
                Ce test envoie un payload Meta simulé via l’URL publique du webhook JUN et vérifie son
                apparition dans WhatsApp Inbox.
              </div>
            )}
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <form action={subscribeWhatsAppAppToWaba}>
              <Button type="submit" variant="outline" className="w-full sm:w-auto">
                Abonner l’app Meta au WABA
              </Button>
            </form>
            <form action={testWhatsAppWebhookLocally}>
              <Button type="submit" variant="primary" className="w-full sm:w-auto">
                Tester le webhook
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <form action={saveWhatsAppSettings} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Connexion Meta</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field label="Meta App ID">
              <Input name="appId" defaultValue={cfg.appId} placeholder="Meta application ID" />
            </Field>
            <Field label="Phone Number ID">
              <Input
                name="phoneNumberId"
                defaultValue={cfg.phoneNumberId}
                placeholder="Meta Phone Number ID"
                required
              />
            </Field>
            <Field label="WhatsApp Business Account ID">
              <Input name="businessAccountId" defaultValue={cfg.businessAccountId} placeholder="WABA ID" />
            </Field>
            <Field label="Téléphone connecté">
              <Input
                name="displayPhone"
                inputMode="tel"
                defaultValue={cfg.displayPhone}
                placeholder="+52..."
              />
            </Field>
            <Field label="Version Graph API">
              <Input name="graphVersion" defaultValue={cfg.graphVersion || "v23.0"} />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label={
                  cfg.tokenConfigured
                    ? "Permanent Access Token — déjà configuré (laisser vide pour conserver)"
                    : "Permanent Access Token"
                }
              >
                <Input
                  name="accessToken"
                  type="password"
                  placeholder={cfg.tokenConfigured ? "••••••••••••" : "Collez le token permanent Meta"}
                />
              </Field>
              <p className="mt-2 text-xs text-muted2">
                Le token est chiffré avant stockage et n’est jamais réaffiché.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Webhook</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Callback URL">
              <Input
                value="https://juncreatif.org/api/webhooks/whatsapp"
                readOnly
                className="text-xs sm:text-sm"
              />
            </Field>
            <Field
              label={
                cfg.webhookVerifyTokenConfigured
                  ? "Webhook Verify Token — déjà configuré (laisser vide pour conserver)"
                  : "Webhook Verify Token"
              }
            >
              <Input
                name="webhookVerifyToken"
                type="password"
                placeholder={
                  cfg.webhookVerifyTokenConfigured ? "••••••••••••" : "Créez un token de vérification privé"
                }
              />
            </Field>
            <p className="text-xs text-muted2">
              Dans Meta Webhooks, utilisez exactement cette Callback URL et le même Verify Token. Gardez le
              champ <strong>messages</strong> abonné.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Template général de document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4 text-sm">
              <p className="font-semibold text-emerald-200">Template à créer dans Meta WhatsApp Manager</p>
              <div className="mt-3 grid gap-2 text-xs text-muted2">
                <p>
                  <strong className="text-ink">Nom :</strong> {GENERAL_DOCUMENT_TEMPLATE}
                </p>
                <p>
                  <strong className="text-ink">Catégorie :</strong> Utility
                </p>
                <p>
                  <strong className="text-ink">Langue :</strong> Français (fr)
                </p>
                <p>
                  <strong className="text-ink">Header :</strong> Document · dynamique
                </p>
                <div>
                  <strong className="text-ink">Body :</strong>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-emerald-400/15 bg-black/20 p-3 text-xs text-ink">
                    Bonjour {"{{customer_name}}"}, Votre document {"{{document_type}}"} est maintenant
                    disponible. Référence : {"{{document_reference}}"}
                    JUN CREATIF AND TRAVEL LLC
                  </pre>
                </div>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Template document approuvé">
                <Input
                  name="defaultTemplate"
                  defaultValue={cfg.defaultTemplate}
                  placeholder={GENERAL_DOCUMENT_TEMPLATE}
                />
              </Field>
              <Field label="Code langue">
                <Input name="languageCode" defaultValue={cfg.languageCode || "fr"} placeholder="fr" />
              </Field>
            </div>
            <div className="rounded-xl border border-blue-400/20 bg-blue-500/[0.05] p-3 text-xs text-blue-100">
              Après approbation Meta, saisissez le nom exact du template. JUN joindra automatiquement le PDF
              comme header Document.
            </div>
          </CardContent>
        </Card>
        <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 -mx-1 flex flex-col gap-2 rounded-2xl border border-line bg-night/95 p-3 shadow-2xl backdrop-blur sm:static sm:mx-0 sm:flex-row sm:items-center sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <Button type="submit" variant="primary" className="w-full sm:w-auto">
            Enregistrer WhatsApp
          </Button>
          <span
            className={`text-center text-sm sm:text-left ${cfg.tokenConfigured && cfg.phoneNumberId ? "text-success" : "text-warning"}`}
          >
            {cfg.tokenConfigured && cfg.phoneNumberId
              ? "Configuration enregistrée"
              : "Configuration incomplète"}
          </span>
        </div>
      </form>
    </div>
  );
}
