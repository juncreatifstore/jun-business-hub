import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, ExternalLink, Save, RotateCcw } from "lucide-react";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  getDefaultLegalCopy,
  legalCopyToBody,
  normalizeLegalLocale,
  type LegalKind,
} from "@/components/public/legal-page";
import { saveLegalContent } from "@/services/legal-settings";

export const dynamic = "force-dynamic";

const documents: { kind: LegalKind; label: string; href: string }[] = [
  { kind: "privacy", label: "Politique de confidentialité", href: "/privacy" },
  { kind: "terms", label: "Conditions d’utilisation", href: "/terms" },
  { kind: "deletion", label: "Suppression des données", href: "/data-deletion" },
];
const languages = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "ht", label: "Kreyòl ayisyen" },
] as const;

export default async function LegalSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; lang?: string; toast?: string; toast_error?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "SETTINGS_MANAGE")) redirect("/app/forbidden");
  const query = await searchParams;
  const kind: LegalKind = query.kind === "terms" || query.kind === "deletion" ? query.kind : "privacy";
  const locale = normalizeLegalLocale(query.lang);
  const selected = documents.find((document) => document.kind === kind)!;
  const fallback = getDefaultLegalCopy(kind, locale);
  const row = await prisma.appSetting.findUnique({ where: { key: `legal.${kind}.${locale}` } });
  let saved: { title?: string; intro?: string; updated?: string; body?: string } = {};
  try {
    saved = row ? JSON.parse(row.value) : {};
  } catch {
    saved = {};
  }
  const custom = Boolean(row && saved.body);

  return (
    <div className="mx-auto w-full max-w-6xl pb-16">
      <PageHeader
        title="Pages légales"
        subtitle="Modifiez les contenus publics requis par Google OAuth dans les quatre langues."
      />

      {query.toast && (
        <div className="mb-5 rounded-xl border border-emerald-500/25 bg-success/10 px-4 py-3 text-sm text-success">
          {query.toast}
        </div>
      )}
      {query.toast_error && (
        <div className="mb-5 rounded-xl border border-red-500/25 bg-danger/10 px-4 py-3 text-sm text-danger">
          {query.toast_error}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <Link
          href="/app/settings"
          className="rounded-lg border border-line px-4 py-2 text-sm text-muted2 hover:text-ink"
        >
          ← Paramètres
        </Link>
        {documents.map((document) => (
          <Link
            key={document.kind}
            href={`?kind=${document.kind}&lang=${locale}`}
            className={`rounded-lg border px-4 py-2 text-sm ${kind === document.kind ? "border-electric bg-electric text-white" : "border-line bg-surface-1 text-muted2 hover:border-electric"}`}
          >
            {document.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {languages.map((language) => (
          <Link
            key={language.code}
            href={`?kind=${kind}&lang=${language.code}`}
            className={`rounded-full border px-4 py-2 text-sm ${locale === language.code ? "border-accent bg-accent text-white" : "border-line bg-surface-1 text-muted2 hover:border-accent"}`}
          >
            {language.label}
          </Link>
        ))}
      </div>

      <form
        action={saveLegalContent}
        className="rounded-2xl border border-line bg-surface-1 p-5 shadow-sm sm:p-7"
      >
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="locale" value={locale} />
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-electric" />
              <h2 className="font-display text-2xl">{selected.label}</h2>
            </div>
            <p className="mt-1 text-sm text-muted2">
              {custom ? "Version personnalisée publiée" : "Texte par défaut actuellement publié"}
            </p>
          </div>
          <Link
            href={`${selected.href}?lang=${locale}`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm hover:border-electric hover:text-electric"
          >
            Voir la page <ExternalLink className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-5">
          <label className="grid gap-2 text-sm font-medium">
            Titre
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={saved.title ?? fallback.title}
              className="rounded-xl border border-line bg-ink/[0.025] px-3 py-2 outline-none focus:border-electric"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Date de mise à jour
            <input
              name="updated"
              required
              maxLength={120}
              defaultValue={saved.updated ?? fallback.updated}
              className="rounded-xl border border-line bg-ink/[0.025] px-3 py-2 outline-none focus:border-electric"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Introduction
            <textarea
              name="intro"
              required
              maxLength={3000}
              rows={4}
              defaultValue={saved.intro ?? fallback.intro}
              className="resize-y rounded-xl border border-line bg-ink/[0.025] px-3 py-2 leading-6 outline-none focus:border-electric"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Contenu
            <span className="text-xs font-normal text-muted2">
              Utilisez ## pour un titre de section et - pour une liste.
            </span>
            <textarea
              name="body"
              required
              maxLength={50000}
              rows={22}
              defaultValue={saved.body ?? legalCopyToBody(fallback)}
              className="resize-y rounded-xl border border-line bg-ink/[0.025] px-3 py-3 font-mono text-sm leading-6 outline-none focus:border-electric"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5">
          <Button type="submit" name="intent" value="save">
            <Save className="h-4 w-4" /> Enregistrer et publier
          </Button>
          <Button type="submit" name="intent" value="reset" variant="secondary">
            <RotateCcw className="h-4 w-4" /> Restaurer le texte par défaut
          </Button>
        </div>
      </form>
    </div>
  );
}
