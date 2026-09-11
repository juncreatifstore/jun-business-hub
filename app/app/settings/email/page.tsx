import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { googleConfigured } from "@/lib/google/gmail";
import { getOtpSenderAccountId } from "@/lib/mail-otp-sender";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { disconnectMailbox } from "@/services/mailbox";
import { setOtpSenderMailbox, updateMailboxProfile } from "@/services/mailbox-profile";
import { formatDateTime } from "@/lib/utils";
import { AlertTriangle, Mail, Plug, RefreshCw, ShieldCheck, Star } from "lucide-react";

export const dynamic = "force-dynamic";
export default async function EmailSettingsPage(props: {
  searchParams: Promise<{ gmail_reconnect?: string; accountId?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  if (!can(user, "SETTINGS_MANAGE")) redirect("/app/forbidden");
  const [accounts, otpSenderId] = await Promise.all([
    prisma.mailAccount.findMany({ orderBy: { createdAt: "asc" } }),
    getOtpSenderAccountId(),
  ]);
  const configured = googleConfigured();
  const reconnectRequired = searchParams.gmail_reconnect === "1";
  const reconnectAccount = searchParams.accountId
    ? accounts.find((a) => a.id === searchParams.accountId)
    : null;
  const otpSender = otpSenderId ? accounts.find((a) => a.id === otpSenderId) : null;
  return (
    <div className="min-w-0">
      <PageHeader
        title="Intégration Email"
        subtitle="Connectez et gérez les boîtes Gmail / Google Workspace utilisées par JUN Mail Center."
        actions={
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Link href="/app/settings/email/aliases" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-auto">
                Alias e-mail
              </Button>
            </Link>
            <Link href="/app/settings/email/composer" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-auto">
                Signatures & modèles
              </Button>
            </Link>
            <Link href="/app/mail?mailbox=ALL" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-auto">
                Ouvrir Mail Center
              </Button>
            </Link>
          </div>
        }
      />
      {reconnectRequired ? (
        <div className="mb-6 rounded-2xl border border-amber-400/25 bg-warning/10 p-4 text-sm text-warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Reconnexion Gmail requise</p>
              <p className="mt-1 break-words text-warning/75">
                Google a expiré ou révoqué le jeton d’autorisation
                {reconnectAccount ? ` de ${reconnectAccount.email}` : " d’une boîte connectée"}. La
                synchronisation ne peut pas reprendre tant qu’un nouveau jeton OAuth n’a pas été accordé.
              </p>
              {configured ? (
                <a href="/api/google/oauth/start" className="mt-3 block sm:inline-block">
                  <Button variant="primary" className="w-full sm:w-auto">
                    <RefreshCw className="h-4 w-4" />
                    Reconnecter Gmail
                  </Button>
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Connecter une boîte Gmail / Google Workspace
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {configured ? (
            <>
              <p className="text-sm text-muted2">
                Vous pouvez connecter plusieurs boîtes opérationnelles. Pour renouveler une autorisation
                expirée, utilisez également ce bouton puis choisissez le même compte Google.
              </p>
              <a href="/api/google/oauth/start" className="block sm:inline-block">
                <Button variant="primary" className="w-full sm:w-auto">
                  Connecter ou reconnecter Gmail
                </Button>
              </a>
            </>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-warning/10 p-4 text-sm">
              <p className="font-medium text-warning">IDENTIFIANTS GOOGLE REQUIS</p>
              <p className="mt-1 text-muted2">Configurez les variables d’environnement suivantes :</p>
              <pre className="registry-id mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs text-ink/70">
                GOOGLE_CLIENT_ID{"\n"}GOOGLE_CLIENT_SECRET{"\n"}GOOGLE_REDIRECT_URI =
                https://www.juncreatif.org/api/google/oauth/callback
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="mb-6 border-blue-400/20 bg-accent/[0.04]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Expéditeur OTP client
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted2">
            La boîte favorite envoie automatiquement les codes de vérification JUN Secure Sign aux clients.
            Une seule boîte peut être favorite à la fois.
          </p>
          {otpSender ? (
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-blue-400/20 bg-accent/[0.06] p-3">
              <Star className="h-4 w-4 shrink-0 fill-amber-400 text-warning" />
              <span className="min-w-0 break-all font-medium text-ink">
                {otpSender.displayName || otpSender.email}
              </span>
              <Badge className="bg-accent/15 text-accent">OTP / FAVORITE</Badge>
              <span className="break-all text-xs text-muted2">{otpSender.email}</span>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-amber-400/20 bg-warning/[0.05] p-3 text-sm text-warning/80">
              Aucune boîte OTP favorite n’est définie. Tant que vous n’en choisissez pas une, JUN utilise
              temporairement la première boîte Gmail connectée.
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Boîtes connectées
          </CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted2">Aucune boîte connectée.</p>
          ) : (
            <div className="space-y-4">
              {accounts.map((a) => {
                const hasTokens = Boolean(a.refreshTokenEnc || a.accessTokenEnc);
                const needsReconnect = reconnectRequired && a.id === searchParams.accountId;
                const isOtpSender = a.id === otpSenderId;
                return (
                  <div
                    key={a.id}
                    className={`min-w-0 rounded-xl border p-4 ${isOtpSender ? "border-blue-400/25 bg-accent/[0.04]" : needsReconnect ? "border-amber-400/30 bg-warning/[0.06]" : "border-line"}`}
                  >
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="min-w-0 break-all font-medium">{a.displayName || a.email}</p>
                          <Badge
                            className={
                              needsReconnect
                                ? "bg-warning/15 text-warning"
                                : hasTokens
                                  ? "bg-success/15 text-success"
                                  : "bg-danger/15 text-danger"
                            }
                          >
                            {needsReconnect ? "RECONNEXION REQUISE" : hasTokens ? "CONNECTÉE" : "DÉCONNECTÉE"}
                          </Badge>
                          {isOtpSender ? (
                            <Badge className="bg-accent/15 text-accent">
                              <Star className="mr-1 h-3 w-3 fill-amber-400 text-warning" />
                              OTP FAVORITE
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 break-all text-sm text-muted2">{a.email}</p>
                        <p className="mt-1 text-xs text-muted2">Ajoutée {formatDateTime(a.createdAt)}</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
                        {hasTokens && !isOtpSender ? (
                          <form action={setOtpSenderMailbox.bind(null, a.id)}>
                            <Button variant="outline" size="sm" className="w-full lg:w-auto">
                              <Star className="h-4 w-4" />
                              Définir comme OTP
                            </Button>
                          </form>
                        ) : null}
                        {isOtpSender ? (
                          <Button variant="secondary" size="sm" disabled className="w-full lg:w-auto">
                            <Star className="h-4 w-4 fill-amber-400 text-warning" />
                            OTP favorite
                          </Button>
                        ) : null}
                        {needsReconnect && configured ? (
                          <a href="/api/google/oauth/start">
                            <Button variant="primary" size="sm" className="w-full lg:w-auto">
                              <RefreshCw className="h-4 w-4" />
                              Reconnecter
                            </Button>
                          </a>
                        ) : null}
                        {hasTokens && !needsReconnect ? (
                          <Link href={`/app/mail?mailbox=${a.id}&folder=INBOX`}>
                            <Button variant="outline" size="sm" className="w-full lg:w-auto">
                              Ouvrir
                            </Button>
                          </Link>
                        ) : null}
                        {hasTokens ? (
                          <form action={disconnectMailbox.bind(null, a.id)}>
                            <Button variant="danger" size="sm" className="w-full lg:w-auto">
                              Déconnecter
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                    <form
                      action={updateMailboxProfile.bind(null, a.id)}
                      className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end"
                    >
                      <label className="min-w-0 text-sm">
                        <span className="mb-1 block text-xs font-medium text-muted2">Nom d’affichage</span>
                        <Input
                          name="displayName"
                          defaultValue={a.displayName ?? ""}
                          placeholder="Finance, Travel, Support…"
                          maxLength={80}
                        />
                      </label>
                      <label className="flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                        <input type="checkbox" name="aiEnabled" defaultChecked={a.aiEnabled} />
                        <span>JUN AI activé</span>
                      </label>
                      <Button variant="secondary" className="w-full md:w-auto">
                        Enregistrer
                      </Button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
