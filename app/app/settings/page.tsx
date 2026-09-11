import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveSettings } from "@/services/settings";
import {
  Mail,
  MessageCircle,
  ShieldCheck,
  Building2,
  Palette,
  FileBadge2,
  Hash,
  Save,
  ScrollText,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function previewUrl(key?: string) {
  if (!key) return null;
  try {
    return await storage().getSignedUrl(key, 900);
  } catch {
    return null;
  }
}
function checked(value: string | undefined, fallback = true) {
  if (value == null) return fallback;
  return value === "on";
}

export default async function SettingsPage() {
  const user = await requireUser();
  if (!can(user, "SETTINGS_MANAGE")) redirect("/app/forbidden");
  const rows = await prisma.appSetting.findMany();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const [logoUrl, sealUrl, signatureUrl] = await Promise.all([
    previewUrl(s["document.logo_key"]),
    previewUrl(s["document.seal_key"]),
    previewUrl(s["document.signature_key"]),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Paramètres"
        subtitle="Identité de l’entreprise, documents officiels, sécurité, communication, branding et numérotation."
      />

      <div className="mb-5 grid gap-3 sm:mb-7 md:grid-cols-4">
        <a
          href="/app/settings/security"
          className="group rounded-2xl border border-line bg-ink/[0.025] p-4 transition hover:border-blue-400/30 hover:bg-ink/[0.04]"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-accent">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Sécurité</p>
              <p className="mt-0.5 text-xs text-muted2">MFA, sessions et accès</p>
            </div>
          </div>
        </a>
        <a
          href="/app/settings/email"
          className="group rounded-2xl border border-line bg-ink/[0.025] p-4 transition hover:border-cyan-400/30 hover:bg-ink/[0.04]"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
              <Mail className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Email</p>
              <p className="mt-0.5 text-xs text-muted2">Connexion Gmail et messagerie</p>
            </div>
          </div>
        </a>
        <a
          href="/app/settings/whatsapp"
          className="group rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 transition hover:border-emerald-400/40 hover:bg-emerald-500/[0.07]"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-success">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">WhatsApp</p>
              <p className="mt-0.5 text-xs text-muted2">Meta Cloud API et automatisation</p>
            </div>
          </div>
        </a>
        <a
          href="/app/settings/legal"
          className="group rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4 transition hover:border-violet-400/40 hover:bg-violet-500/[0.07]"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
              <ScrollText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Pages légales</p>
              <p className="mt-0.5 text-xs text-muted2">Google OAuth · 4 langues</p>
            </div>
          </div>
        </a>
      </div>

      <form
        action={saveSettings}
        encType="multipart/form-data"
        className="space-y-5 pb-24 sm:space-y-6 sm:pb-6"
      >
        <Card>
          <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-accent" />
              Identité officielle de l’entreprise
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-5">
            <Field label="Raison sociale">
              <Input
                name="company.name"
                defaultValue={s["company.name"] ?? "JUN CREATIF AND TRAVEL LLC"}
                autoComplete="organization"
              />
            </Field>
            <Field label="Nom commercial / DBA">
              <Input name="company.trade_name" defaultValue={s["company.trade_name"] ?? ""} />
            </Field>
            <Field label="Slogan">
              <Input
                name="company.tagline"
                defaultValue={s["company.tagline"] ?? "Travel · Documents · Business Services"}
              />
            </Field>
            <Field label="Représentant légal">
              <Input
                name="company.legal_representative"
                defaultValue={s["company.legal_representative"] ?? ""}
              />
            </Field>
            <Field label="Titre du représentant">
              <Input
                name="company.representative_title"
                defaultValue={s["company.representative_title"] ?? ""}
                placeholder="Owner / Manager / Director"
              />
            </Field>
            <Field label="Date de création">
              <Input
                name="company.formation_date"
                type="date"
                defaultValue={s["company.formation_date"] ?? ""}
              />
            </Field>
            <Field label="Pays d’enregistrement">
              <Input
                name="company.registration_country"
                defaultValue={s["company.registration_country"] ?? "United States"}
                autoComplete="country-name"
              />
            </Field>
            <Field label="État / province">
              <Input
                name="company.registration_state"
                defaultValue={s["company.registration_state"] ?? "Florida"}
              />
            </Field>
            <Field label="Numéro d’enregistrement">
              <Input name="company.registration" defaultValue={s["company.registration"] ?? ""} />
            </Field>
            <Field label="Tax ID / EIN">
              <Input name="company.tax_id" defaultValue={s["company.tax_id"] ?? ""} />
            </Field>
            <p className="text-xs text-muted2 sm:col-span-2">
              Ces informations servent de référence officielle pour les contrats, reçus, signatures et
              documents JUN.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
            <CardTitle>Adresses et contacts</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-5">
            <Field label="Adresse légale / physique">
              <Input
                name="company.address"
                defaultValue={s["company.address"] ?? ""}
                autoComplete="street-address"
              />
            </Field>
            <Field label="Adresse postale">
              <Input name="company.mailing_address" defaultValue={s["company.mailing_address"] ?? ""} />
            </Field>
            <Field label="Boîte postale">
              <Input
                name="company.po_box"
                defaultValue={s["company.po_box"] ?? "PO Box 770064, Orlando, FL 32877"}
              />
            </Field>
            <Field label="Site web">
              <Input
                name="company.website"
                type="url"
                inputMode="url"
                defaultValue={s["company.website"] ?? "https://www.juncreatif.org"}
              />
            </Field>
            <Field label="Téléphone principal">
              <Input
                name="company.phone"
                type="tel"
                inputMode="tel"
                defaultValue={s["company.phone"] ?? "+1 480-954-1260"}
              />
            </Field>
            <Field label="Téléphone secondaire">
              <Input
                name="company.phone_secondary"
                type="tel"
                inputMode="tel"
                defaultValue={s["company.phone_secondary"] ?? ""}
              />
            </Field>
            <Field label="WhatsApp">
              <Input
                name="company.whatsapp"
                type="tel"
                inputMode="tel"
                defaultValue={s["company.whatsapp"] ?? ""}
              />
            </Field>
            <Field label="Email général">
              <Input
                name="company.email"
                type="email"
                inputMode="email"
                defaultValue={s["company.email"] ?? ""}
              />
            </Field>
            <Field label="Email finance">
              <Input
                name="company.finance_email"
                type="email"
                inputMode="email"
                defaultValue={s["company.finance_email"] ?? ""}
              />
            </Field>
            <Field label="Email documents">
              <Input
                name="company.documents_email"
                type="email"
                inputMode="email"
                defaultValue={s["company.documents_email"] ?? ""}
              />
            </Field>
            <Field label="Email support">
              <Input
                name="company.support_email"
                type="email"
                inputMode="email"
                defaultValue={s["company.support_email"] ?? ""}
              />
            </Field>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium">Instructions bancaires / paiement</label>
              <textarea
                name="company.bank_details"
                defaultValue={s["company.bank_details"] ?? ""}
                rows={5}
                className="w-full resize-y rounded-xl border border-line bg-ink/[0.025] px-3 py-2 text-sm outline-none focus:border-electric"
                placeholder="Informations autorisées pouvant apparaître sur les documents financiers."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
            <CardTitle className="flex items-center gap-2">
              <FileBadge2 className="h-4 w-4 text-violet-400" />
              Éléments officiels des documents
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 sm:gap-6 sm:p-5 lg:grid-cols-3">
            {[
              ["document.logo", "Logo premium", logoUrl, "Current JUN premium logo"],
              ["document.seal", "Sceau de l’entreprise", sealUrl, "Current company seal"],
              ["document.signature", "Signature officielle", signatureUrl, "Current official signature"],
            ].map(([name, label, url, alt]) => (
              <div key={String(name)} className="min-w-0 rounded-2xl border border-line bg-ink/[0.02] p-4">
                <p className="text-sm font-semibold">{String(label)}</p>
                <p className="mt-1 text-xs text-muted2">PNG transparent recommandé · JPG/WEBP accepté.</p>
                <div className="mt-4 flex min-h-28 items-center justify-center rounded-xl border border-dashed border-line bg-black/10 p-4 sm:min-h-32">
                  {url ? (
                    <img src={String(url)} alt={String(alt)} className="max-h-28 max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted2">Aucun fichier chargé</span>
                  )}
                </div>
                <input
                  name={String(name)}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="mt-4 block w-full min-w-0 text-xs sm:text-sm"
                />
                <label className="mt-3 flex min-h-10 items-center gap-2 text-xs text-muted2">
                  <input type="checkbox" name={`${String(name)}_remove`} value="yes" className="h-4 w-4" />{" "}
                  Supprimer le fichier actuel
                </label>
              </div>
            ))}
            <div className="grid gap-4 sm:grid-cols-3 sm:gap-5 lg:col-span-3">
              <Field label="Opacité du filigrane" hint="0.02 à 0.12">
                <Input
                  name="document.watermark_opacity"
                  inputMode="decimal"
                  defaultValue={s["document.watermark_opacity"] ?? "0.055"}
                />
              </Field>
              <Field label="Taille du sceau (pt)" hint="40 à 120">
                <Input
                  name="document.seal_size"
                  inputMode="numeric"
                  defaultValue={s["document.seal_size"] ?? "72"}
                />
              </Field>
              <Field label="Libellé de pied de page">
                <Input
                  name="document.footer_label"
                  defaultValue={s["document.footer_label"] ?? ""}
                  placeholder="Optionnel"
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
            <CardTitle>Affichage automatique des documents</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            {[
              ["document.show_logo", "Afficher le logo", true],
              ["document.show_seal", "Afficher le sceau", true],
              ["document.show_signature", "Afficher la signature officielle", false],
              ["document.show_qr", "Afficher le QR de vérification", true],
              ["document.show_tax_id", "Afficher EIN / Tax ID", false],
            ].map(([name, label, fallback]) => (
              <label
                key={String(name)}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-ink/[0.02] p-3 text-sm"
              >
                <input
                  type="checkbox"
                  name={String(name)}
                  value="on"
                  defaultChecked={checked(s[String(name)], Boolean(fallback))}
                  className="h-4 w-4 shrink-0"
                />
                <span>{String(label)}</span>
              </label>
            ))}
            <p className="text-xs text-muted2 sm:col-span-2 lg:col-span-3">
              Ces options définissent le comportement par défaut des nouveaux documents officiels.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-warning" />
              Branding de l’interface
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-3 sm:gap-5 sm:p-5">
            <Field label="Primaire (night)" hint='HSL, ex. "222 47% 11%"'>
              <Input name="brand.primary" defaultValue={s["brand.primary"] ?? ""} placeholder="222 47% 11%" />
            </Field>
            <Field label="Secondaire (electric)" hint='HSL, ex. "217 91% 60%"'>
              <Input
                name="brand.secondary"
                defaultValue={s["brand.secondary"] ?? ""}
                placeholder="217 91% 60%"
              />
            </Field>
            <Field label="Accent (gold)" hint='HSL, ex. "43 74% 49%"'>
              <Input name="brand.accent" defaultValue={s["brand.accent"] ?? ""} placeholder="43 74% 49%" />
            </Field>
            <p className="text-xs text-muted2 sm:col-span-3">
              Laissez un champ vide pour rétablir la couleur JUN par défaut.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-accent" />
              Numérotation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <Field
              label="Réinitialisation annuelle"
              hint='"on" remet les compteurs document/dossier à zéro chaque janvier.'
            >
              <Input name="numbering.year_reset" defaultValue={s["numbering.year_reset"] ?? "on"} />
            </Field>
            <p className="text-xs text-muted2">
              Les formats de registre restent fixes afin de préserver la traçabilité.
            </p>
          </CardContent>
        </Card>

        <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 -mx-2 rounded-2xl border border-line bg-night/90 p-2 shadow-2xl backdrop-blur-xl sm:bottom-4 sm:mx-0 sm:flex sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
          <Button type="submit" variant="primary" className="w-full sm:w-auto">
            <Save className="mr-2 h-4 w-4" />
            Enregistrer les paramètres
          </Button>
        </div>
      </form>
    </div>
  );
}
