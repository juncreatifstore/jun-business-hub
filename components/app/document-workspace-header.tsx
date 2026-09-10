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
    <section className="relative mb-4 overflow-hidden rounded-[20px] border border-white/[0.075] bg-[radial-gradient(circle_at_88%_5%,rgba(59,130,246,.13),transparent_30%),linear-gradient(145deg,#0f1929,#0b1422_62%,#09111e)] shadow-[0_22px_55px_rgba(0,0,0,.22)] sm:mb-5 sm:rounded-[22px]">
      <div className="relative p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300 shadow-lg shadow-blue-950/30 sm:h-14 sm:w-14 sm:rounded-2xl">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="min-w-0 max-w-full break-words text-xl font-semibold leading-tight tracking-tight text-white sm:text-[28px]">
                  {title}
                </h1>
                <StatusBadge status={status} />
                <Badge className="max-w-full truncate border border-white/[0.07] bg-white/[0.03] text-slate-400">
                  {type.replaceAll("_", " ")}
                </Badge>
                <Badge className="border border-white/[0.07] bg-white/[0.03] text-slate-400">
                  v{version}
                </Badge>
              </div>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-500 sm:gap-x-4 sm:gap-y-2 sm:text-xs">
                <span className="registry-id max-w-full break-all text-slate-300">{documentId}</span>
                {client ? (
                  <Link
                    href={`/app/clients/${client.id}/dashboard`}
                    className="inline-flex min-w-0 items-center gap-1.5 transition hover:text-blue-300"
                  >
                    <UserRound className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{client.name}</span>
                  </Link>
                ) : null}
                {caseInfo ? (
                  <Link
                    href={`/app/cases/${caseInfo.id}/dashboard`}
                    className="inline-flex min-w-0 items-center gap-1.5 transition hover:text-blue-300"
                  >
                    <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{caseInfo.number}</span>
                  </Link>
                ) : null}
                {finalizedAt ? (
                  <span className="max-w-full break-words">
                    {sealed ? "Scellé" : "Mis à jour"} · {finalizedAt}
                  </span>
                ) : null}
              </div>

              {contentHash || pdfHash ? (
                <div className="mt-3 flex min-w-0 flex-wrap gap-1.5 sm:gap-2">
                  {contentHash ? (
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-emerald-400/10 bg-emerald-500/[0.05] px-2 py-1.5 text-[9px] text-emerald-300 sm:px-2.5 sm:text-[10px]">
                      <Hash className="h-3 w-3 shrink-0" />
                      <span className="truncate">Contenu {contentHash}</span>
                    </span>
                  ) : null}
                  {pdfHash ? (
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-emerald-400/10 bg-emerald-500/[0.05] px-2 py-1.5 text-[9px] text-emerald-300 sm:px-2.5 sm:text-[10px]">
                      <ShieldCheck className="h-3 w-3 shrink-0" />
                      <span className="truncate">PDF {pdfHash}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {actions ? (
            <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:mx-0 xl:max-w-2xl xl:overflow-visible xl:px-0 xl:pb-0">
              <div className="flex w-max items-center gap-2 xl:w-auto xl:flex-wrap xl:justify-end">
                {actions}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-start gap-2 border-t border-white/[0.06] bg-black/[0.07] px-4 py-2.5 text-[9px] leading-4 text-slate-600 sm:items-center sm:px-6 sm:text-[10px]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500 sm:mt-0" />
        <span>
          {sealed
            ? "Document officiel scellé · authentifiable par QR, identifiant et empreinte d’intégrité"
            : "Document de travail · les versions précédentes restent conservées pour audit"}
        </span>
      </div>
    </section>
  );
}
