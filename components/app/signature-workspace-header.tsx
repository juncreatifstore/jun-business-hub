import Link from "next/link";
import { CheckCircle2, Clock3, FileSignature, Mail, ShieldCheck, UserRound } from "lucide-react";
import { StatusBadge, Badge } from "@/components/ui/badge";

export function SignatureWorkspaceHeader({
  documentDbId,
  registryId,
  title,
  status,
  provider,
  client,
  signedCount,
  signerCount,
  currentSigner,
  expiresAt,
  actions,
}: {
  documentDbId: string;
  registryId: string;
  title: string;
  status: string;
  provider: string;
  client?: { id: string; name: string } | null;
  signedCount: number;
  signerCount: number;
  currentSigner?: { name: string; email: string } | null;
  expiresAt?: string | null;
  actions?: React.ReactNode;
}) {
  const complete = status === "SIGNED";
  const progress = signerCount > 0 ? Math.round((signedCount / signerCount) * 100) : 0;

  return (
    <section className="mb-4 overflow-hidden rounded-[20px] border border-white/[0.075] bg-[radial-gradient(circle_at_88%_5%,rgba(16,185,129,.13),transparent_30%),linear-gradient(145deg,#0f1929,#0b1422_62%,#09111e)] shadow-[0_22px_55px_rgba(0,0,0,.22)] sm:mb-5 sm:rounded-[22px]">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300 shadow-lg shadow-emerald-950/25 sm:h-14 sm:w-14 sm:rounded-2xl">
              <FileSignature className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="min-w-0 max-w-full break-words text-xl font-semibold leading-tight tracking-tight text-white sm:text-[28px]">{title}</h1>
                <StatusBadge status={status} />
                <Badge className="max-w-full truncate border border-white/[0.07] bg-white/[0.03] text-slate-400">{provider}</Badge>
              </div>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-500 sm:gap-x-4 sm:gap-y-2 sm:text-xs">
                <Link href={`/app/documents/${documentDbId}`} className="registry-id max-w-full break-all text-slate-300 hover:text-blue-300">{registryId}</Link>
                {client ? <Link href={`/app/clients/${client.id}/dashboard`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-blue-300"><UserRound className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{client.name}</span></Link> : null}
                {expiresAt ? <span className="inline-flex max-w-full items-start gap-1.5"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="break-words">Expire {expiresAt}</span></span> : null}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(180px,260px)_auto] sm:items-center">
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.12em] text-slate-600 sm:text-[10px] sm:tracking-[0.14em]"><span>Progression</span><span className="shrink-0">{signedCount}/{signerCount} · {progress}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>
                </div>
                {currentSigner ? <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] sm:text-xs"><span className="text-slate-600">Signataire actuel</span><div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-slate-200 sm:gap-2"><Mail className="h-3.5 w-3.5 shrink-0 text-emerald-400" /><strong className="truncate">{currentSigner.name}</strong><span className="max-w-full break-all text-slate-500">{currentSigner.email}</span></div></div> : null}
              </div>
            </div>
          </div>

          {actions ? <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:mx-0 xl:max-w-2xl xl:overflow-visible xl:px-0 xl:pb-0"><div className="flex w-max items-center gap-2 xl:w-auto xl:flex-wrap xl:justify-end">{actions}</div></div> : null}
        </div>
      </div>
      <div className="flex items-start gap-2 border-t border-white/[0.06] bg-black/[0.07] px-4 py-2.5 text-[9px] leading-4 text-slate-600 sm:items-center sm:px-6 sm:text-[10px]">
        {complete ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500 sm:mt-0" /> : <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500 sm:mt-0" />}
        <span>{complete ? "Signature terminée · PDF signé et certificat disponibles dans JUN" : "JUN Secure Sign · liens révocables, routage contrôlé et audit complet"}</span>
      </div>
    </section>
  );
}
