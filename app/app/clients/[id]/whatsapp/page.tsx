import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientBlock } from "@/lib/client-transaction-block";
import { GENERAL_DOCUMENT_TEMPLATE, getWhatsAppConfig } from "@/lib/whatsapp";
import { sendClientWhatsApp, sendDocumentByWhatsApp } from "@/services/whatsapp";
import { ClientWorkspaceHeader } from "@/components/app/client-workspace-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FileText, MessageCircle, Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ClientWhatsAppPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; mode?: string; template?: string; language?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await requirePermission("CLIENT_READ");
  const [client, cfg, documents, block] = await Promise.all([
    prisma.client.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        internalId: true,
        firstName: true,
        lastName: true,
        status: true,
        email: true,
        whatsapp: true,
        phone: true,
        country: true,
        createdAt: true,
        tags: { select: { id: true, tag: true } },
      },
    }),
    getWhatsAppConfig(),
    prisma.document.findMany({
      where: { clientId: params.id, finalPdfKey: { not: null }, status: { in: ["FINAL", "SIGNED"] } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, documentId: true, title: true, type: true, status: true, updatedAt: true },
    }),
    getClientBlock(params.id),
  ]);
  if (!client) notFound();
  const blocked = Boolean(block?.blocked),
    archived = client.status === "ARCHIVED";
  const action = sendClientWhatsApp.bind(null, client.id),
    number = client.whatsapp || client.phone || "";
  const prefilled = String(searchParams.message || "").slice(0, 4096);
  const requestedMode =
    searchParams.mode === "TEXT" || searchParams.mode === "TEMPLATE" ? searchParams.mode : null;
  const defaultMode = prefilled ? "TEXT" : (requestedMode ?? (!cfg.defaultTemplate ? "TEXT" : "TEMPLATE"));
  const usesGeneralDocumentTemplate = cfg.defaultTemplate === GENERAL_DOCUMENT_TEMPLATE;
  return (
    <div className="space-y-5">
      <ClientWorkspaceHeader
        client={client}
        tags={client.tags}
        blocked={blocked}
        canUpdate={can(user, "CLIENT_UPDATE")}
        newServicesAllowed={!blocked && !archived}
        paymentsAllowed={!archived}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-2">Communications</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">WhatsApp client</h2>
          <p className="mt-1 text-sm text-ink-3">
            Messages, notifications officielles et envoi sécurisé de documents via Meta WhatsApp Cloud API.
          </p>
        </div>
        <Link href="/app/settings/whatsapp">
          <Button variant="outline">
            <Settings className="h-4 w-4" />
            Paramètres WhatsApp
          </Button>
        </Link>
      </div>

      {usesGeneralDocumentTemplate ? (
        <Card className="bg-surface-1">
          <CardHeader>
            <div>
              <CardTitle>Envoyer un document généré</CardTitle>
              <p className="mt-1 text-xs text-ink-3">
                Le PDF final est joint au message avec les informations du document.
              </p>
            </div>
            <FileText className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-ink-3">
              Choisissez un PDF finalisé pour ce client. JUN utilisera{" "}
              <strong className="text-ink-2">{GENERAL_DOCUMENT_TEMPLATE}</strong> et remplira automatiquement
              le nom, le type et la référence.
            </p>
            {documents.length ? (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col gap-3 rounded-xl border border-line bg-ink/[0.018] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium text-ink">{doc.title}</div>
                    <div className="mt-1 text-xs text-ink-2">
                      {doc.documentId} · {doc.type} · {doc.status}
                    </div>
                  </div>
                  <form
                    action={sendDocumentByWhatsApp.bind(null, doc.id)}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="to" value={number} />
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!number || !cfg.tokenConfigured || !cfg.phoneNumberId}
                    >
                      Envoyer par WhatsApp
                    </Button>
                  </form>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.06] p-3 text-sm text-amber-200">
                Aucun PDF finalisé n’est disponible pour ce client. Finalisez d’abord un reçu, une facture, un
                relevé ou un document officiel.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <form action={action} className="space-y-5">
        <Card className="bg-surface-1">
          <CardHeader>
            <div>
              <CardTitle>Destinataire</CardTitle>
              <p className="mt-1 text-xs text-ink-3">Numéro utilisé pour cette communication.</p>
            </div>
            <MessageCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <Field label="Numéro WhatsApp" hint="Format international avec indicatif pays">
              <Input name="to" defaultValue={number} placeholder="+52..." required />
            </Field>
          </CardContent>
        </Card>
        <Card className="bg-surface-1">
          <CardHeader>
            <CardTitle>Préparer le message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Mode">
              <Select name="mode" defaultValue={defaultMode}>
                <option value="TEXT">Texte libre — conversation active de 24 h</option>
                <option value="TEMPLATE">Template Meta approuvé — recommandé hors fenêtre de 24 h</option>
              </Select>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nom du template approuvé">
                <Input
                  name="template"
                  defaultValue={searchParams.template || cfg.defaultTemplate}
                  placeholder="Nom exact dans Meta WhatsApp Manager"
                />
              </Field>
              <Field label="Langue du template">
                <Input
                  name="language"
                  defaultValue={searchParams.language || cfg.languageCode || "en_US"}
                  placeholder="en_US, fr, es_MX..."
                />
              </Field>
            </div>
            <Field label="Message texte libre" hint="Utilisé uniquement lorsque le mode = Texte libre">
              <Textarea
                name="message"
                rows={7}
                defaultValue={prefilled}
                placeholder={`Bonjour ${client.firstName},\n\nVotre document JUN est maintenant disponible.`}
              />
            </Field>
            {prefilled ? (
              <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.06] p-3 text-xs text-emerald-200">
                Un message est déjà préparé : JUN utilise automatiquement le mode <strong>Texte libre</strong>
                . Ce mode fonctionne uniquement pendant la fenêtre active de 24 heures.
              </div>
            ) : null}
            {usesGeneralDocumentTemplate ? (
              <div className="rounded-xl border border-blue-400/15 bg-blue-500/[0.06] p-3 text-xs text-blue-200">
                <strong>{GENERAL_DOCUMENT_TEMPLATE}</strong> nécessite un PDF. Utilisez le sélecteur de
                documents ci-dessus pour l’envoi.
              </div>
            ) : null}
            {!cfg.defaultTemplate ? (
              <div className="rounded-xl border border-blue-400/15 bg-blue-500/[0.06] p-3 text-xs text-blue-200">
                Aucun template approuvé n’est configuré dans JUN. Pour envoyer hors fenêtre de 24 heures,
                enregistrez le nom exact et la langue du template dans Paramètres → WhatsApp.
              </div>
            ) : null}
            <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.06] p-3 text-xs text-amber-200">
              Les noms de templates sont propres à votre compte WhatsApp Business. JUN ne suppose jamais qu’un
              template existe.
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={!cfg.tokenConfigured || !cfg.phoneNumberId}>
            <MessageCircle className="h-4 w-4" />
            Envoyer sur WhatsApp
          </Button>
          {!cfg.tokenConfigured || !cfg.phoneNumberId ? (
            <p className="text-sm text-warning">
              Configurez d’abord Meta WhatsApp dans Paramètres → WhatsApp.
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
