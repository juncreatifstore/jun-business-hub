import { tr } from "@/lib/i18n-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireUser, can } from "@/lib/auth";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { clientDocumentOverview } from "@/lib/client-documents";
import { DOC_TYPE_LABELS } from "@/lib/file-extraction";

export const dynamic = "force-dynamic";

export default async function DriveClientsPage(props: {
  searchParams: Promise<{ q?: string; only?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const t = await tr();
  if (!can(user, "FILE_READ") || !can(user, "CLIENT_READ")) redirect("/app/forbidden");
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const only = searchParams.only === "issues" ? "issues" : "all";
  const rows = (await clientDocumentOverview())
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.internalId.toLowerCase().includes(q))
    .filter((c) => only === "all" || c.missing.length || (c.worstExpiry && c.worstExpiry !== "ok"));

  const issues = rows.filter((c) => c.missing.length || (c.worstExpiry && c.worstExpiry !== "ok")).length;

  return (
    <div className="space-y-5 text-ink">
      <PageHeader
        eyebrow="Drive"
        title={t(t("Documents par client", "Documents by client"), "Documents by client")}
        subtitle={t(
          t(
            "Le dossier documentaire de chaque client : pièces par type, manquantes et expirations.",
            "Each client’s file: pieces by type, missing and expiring.",
          ),
          "Each client’s file: pieces by type, missing and expiring.",
        )}
      />
      <form method="get" className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder={t(t("Rechercher un client…", "Search a client…"), "Search a client…")}
          className="h-10 min-w-64 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric"
        />
        <select
          name="only"
          defaultValue={only}
          className="h-10 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric"
        >
          <option value="all">{t(t("Tous les clients", "All clients"), "All clients")}</option>
          <option value="issues">
            {t(
              t("Seulement avec pièces manquantes ou expirations", "Only with missing or expiring documents"),
              "Only with missing or expiring documents",
            )}
          </option>
        </select>
        <button className="h-10 rounded-lg border border-line bg-white px-3 text-sm hover:bg-surface">
          Filter
        </button>
        <span className="ml-auto text-xs text-muted2">
          {rows.length} client{rows.length === 1 ? "" : "s"} · {issues} à traiter
        </span>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t(t("Aucun client", "No clients"), "No clients")}
          description={t(
            t("Aucun client ne correspond à ce filtre.", "No client matches this filter."),
            "No client matches this filter.",
          )}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted2">
              <tr>
                <th className="p-3">{t(t("Client", "Client"), t("Client", "Client"))}</th>
                <th className="p-3">{t(t("Documents", "Documents"), t("Documents", "Documents"))}</th>
                <th className="p-3">{t(t("Manquants", "Missing"), "Missing")}</th>
                <th className="p-3">{t(t("Expiration", "Expiry"), "Expiry")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-surface/60">
                  <td className="p-3">
                    <Link
                      prefetch={false}
                      href={`/app/drive/clients/${c.id}`}
                      className="font-medium hover:text-electric"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted2">
                      {c.internalId}
                      {c.nationality ? ` · ${c.nationality}` : ""}
                    </div>
                  </td>
                  <td className="p-3 text-muted2">
                    {c.total}
                    {c.total ? <span className="text-xs"> · {c.typed} typés</span> : null}
                  </td>
                  <td className="p-3">
                    {c.missing.length ? (
                      <div className="flex flex-wrap gap-1">
                        {c.missing.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800"
                          >
                            {DOC_TYPE_LABELS[t]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />{" "}
                        {t(t("Pièces de base complètes", "Baseline complete"), "Baseline complete")}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {c.worstExpiry === "expired" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" />{" "}
                        {t(t("Document expiré", "Expired document"), "Expired document")}
                      </span>
                    ) : c.worstExpiry === "critical" ? (
                      <span className="text-xs font-medium text-amber-800">
                        {t(t("Expire sous 30 jours", "Expires within 30 days"), "Expires within 30 days")}
                      </span>
                    ) : c.worstExpiry === "soon" ? (
                      <span className="text-xs text-amber-700">
                        {t(t("Expire sous 90 jours", "Expires within 90 days"), "Expires within 90 days")}
                      </span>
                    ) : (
                      <span className="text-xs text-muted2">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
