import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ExternalLink, MailPlus, Route, Trash2 } from "lucide-react";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  addEmailAlias,
  EMAIL_ALIASES_SETTING_KEY,
  EMAIL_ALIAS_DESTINATION,
  EMAIL_ALIAS_DOMAIN,
  removeEmailAlias,
  setEmailAliasConfirmed,
  type EmailAlias,
} from "@/lib/email-aliases";

export const dynamic = "force-dynamic";

export default async function EmailAliasesPage({
  searchParams,
}: {
  searchParams: Promise<{ toast?: string; toast_error?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "SETTINGS_MANAGE")) redirect("/app/forbidden");
  const query = await searchParams;
  const setting = await prisma.appSetting.findUnique({
    where: { key: EMAIL_ALIASES_SETTING_KEY },
    select: { value: true },
  });
  let aliases: EmailAlias[] = [];
  try {
    const parsed = setting ? JSON.parse(setting.value) : [];
    aliases = Array.isArray(parsed) ? parsed : [];
  } catch {
    aliases = [];
  }

  return (
    <div className="mx-auto w-full max-w-5xl pb-16">
      <PageHeader
        title="Alias e-mail"
        subtitle={`Centralisez plusieurs adresses @${EMAIL_ALIAS_DOMAIN} vers ${EMAIL_ALIAS_DESTINATION}.`}
      />

      {query.toast ? (
        <div className="mb-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-success">
          {query.toast}
        </div>
      ) : null}
      {query.toast_error ? (
        <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {query.toast_error}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/app/mail/aliases" className="rounded-lg border border-electric bg-electric px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Ouvrir le Centre des alias
        </Link>
        <Link href="/app/settings/email" className="rounded-lg border border-line px-4 py-2 text-sm text-muted2 hover:text-ink">
          ← Intégration Email
        </Link>
        <a
          href="https://admin.google.com/ac/users"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-muted2 hover:border-electric hover:text-electric"
        >
          Ouvrir Google Admin <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <Card className="mb-6 border-amber-400/25 bg-amber-500/[0.05]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="h-4 w-4 text-warning" />
            Deux étapes sont nécessaires
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted2">
          <p>1. Ajoutez l’adresse ci-dessous pour la suivre dans JUN Business Hub.</p>
          <p>
            2. Dans Google Admin, ouvrez l’utilisateur <strong className="text-ink">{EMAIL_ALIAS_DESTINATION}</strong>,
            puis « Informations utilisateur → Adresses e-mail secondaires (alias) » et ajoutez la même adresse.
          </p>
          <p className="font-medium text-warning">
            L’enregistrement dans l’application ne crée pas à lui seul l’alias chez Google.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailPlus className="h-4 w-4" />
            Ajouter un alias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={addEmailAlias} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="text-sm font-medium">
              Nouvelle adresse
              <div className="mt-2 flex min-w-0 items-center rounded-xl border border-line bg-white focus-within:border-electric">
                <Input
                  name="localPart"
                  required
                  maxLength={64}
                  pattern="[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]|[A-Za-z0-9]"
                  placeholder="contact"
                  className="min-w-0 border-0"
                />
                <span className="shrink-0 pr-3 text-sm text-muted2">@{EMAIL_ALIAS_DOMAIN}</span>
              </div>
            </label>
            <Button type="submit" className="w-full sm:w-auto">
              <MailPlus className="h-4 w-4" /> Ajouter
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted2">
            Suggestions : contact, info, support, finance, travel, documents, legal.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alias enregistrés ({aliases.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {aliases.length === 0 ? (
            <p className="text-sm text-muted2">Aucun alias enregistré.</p>
          ) : (
            <div className="space-y-3">
              {aliases.map((alias) => (
                <div key={alias.address} className="grid gap-3 rounded-xl border border-line p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="break-all font-medium text-ink">{alias.address}</p>
                    <p className="mt-1 break-all text-sm text-muted2">→ {EMAIL_ALIAS_DESTINATION}</p>
                    <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      alias.confirmed ? "bg-emerald-500/15 text-success" : "bg-amber-500/15 text-warning"
                    }`}>
                      {alias.confirmed ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                      {alias.confirmed ? "ACTIF DANS GOOGLE" : "À CONFIGURER DANS GOOGLE"}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:flex">
                    <form action={setEmailAliasConfirmed.bind(null, alias.address)}>
                      <input type="hidden" name="confirmed" value={alias.confirmed ? "false" : "true"} />
                      <Button type="submit" variant="outline" size="sm" className="w-full">
                        {alias.confirmed ? "Marquer à configurer" : "Confirmer actif"}
                      </Button>
                    </form>
                    <form action={removeEmailAlias.bind(null, alias.address)}>
                      <Button type="submit" variant="danger" size="sm" className="w-full">
                        <Trash2 className="h-4 w-4" /> Retirer
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
