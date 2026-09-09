import Link from "next/link";
import { FileText, FolderKanban, Hash, ShieldCheck, UserRound } from "lucide-react";
import { StatusBadge, Badge } from "@/components/ui/badge";

export function DocumentWorkspaceHeader({
  documentId,
  title,
  type,
  status,
  version,
  client,
  caseInfo,
  contentHash,
  pdfHash,
  finalizedAt,
  actions,
}: {
  documentId: string;
  title: string;
  type: string;
  status: string;
  version: number;
  client?: { id: string; name: string } | null;
  caseInfo?: { id: string; number: string } | null;
  contentHash?: string | null;
  pdfHash?: string | null;
  finalizedAt?: string | null;
  actions?: React.ReactNode;
}) {
  const sealed = status === "FINAL" || status === "SIGNED";
  return (
    <section className="relative mb-5 overflow-hidden rounded-[22px] border border-white/[0.075] bg-[radial-gradient(circle_at_88%_5%,rgba(59,130,246,.13),transparent_30%),linear-gradient(145deg,#0f1929,#0b1422_62%,#09111e)] shadow-[0_22px_55px_rgba(0,0,0,.22)]">
      <div className="relative p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-300 shadow-lg shadow-blue-950/30">
              <FileText className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
                <StatusBadge status={status} />
                <Badge className="border border-white/[0.07] bg-white/[0.03] text-slate-400">{type.replaceAll("_", " ")}</Badge>
                <Badge className="border border-white/[0.07] bg-white/[0.03] text-slate-400">v{version}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                <span className="registry-id text-slate-300">{documentId}</span>
                {client ? <Link href={`/app/clients/${client.id}/dashboard`} className="inline-flex items-center gap-1.5 transition hover:text-blue-300"><UserRound className="h-3.5 w-3.5" />{client.name}</Link> : null}
                {caseInfo ? <Link href={`/app/cases/${caseInfo.id}/dashboard`} className="inline-flex items-center gap-1.5 transition hover:text-blue-300"><FolderKanban className="h-3.5 w-3.5" />{caseInfo.number}</Link> : null}
                {finalizedAt ? <span>{sealed ? "Scellé" : "Mis à jour"} · {finalizedAt}</span> : null}
              </div>

              {(contentHash || pdfHash) ? <div className="mt-3 flex flex-wrap gap-2">
                {contentHash ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/10 bg-emerald-500/[0.05] px-2.5 py-1.5 text-[10px] text-emerald-300"><Hash className="h-3 w-3" />Contenu {contentHash}</span> : null}
                {pdfHash ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/10 bg-emerald-500/[0.05] px-2.5 py-1.5 text-[10px] text-emerald-300"><ShieldCheck className="h-3 w-3" />PDF {pdfHash}</span> : null}
              </div> : null}
            </div>
          </div>

          {actions ? <div className="flex max-w-2xl flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-white/[0.06] bg-black/[0.07] px-5 py-2.5 text-[10px] text-slate-600 sm:px-6">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
        <span>{sealed ? "Document officiel scellé · authentifiable par QR, identifiant et empreinte d’intégrité" : "Document de travail · les versions précédentes restent conservées pour audit"}</span>
      </div>
    </section>
  );
}
