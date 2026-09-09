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
    <section className="mb-5 overflow-hidden rounded-[22px] border border-white/[0.075] bg-[radial-gradient(circle_at_88%_5%,rgba(16,185,129,.13),transparent_30%),linear-gradient(145deg,#0f1929,#0b1422_62%,#09111e)] shadow-[0_22px_55px_rgba(0,0,0,.22)]">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300 shadow-lg shadow-emerald-950/25">
              <FileSignature className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
                <StatusBadge status={status} />
                <Badge className="border border-white/[0.07] bg-white/[0.03] text-slate-400">{provider}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                <Link href={`/app/documents/${documentDbId}`} className="registry-id text-slate-300 hover:text-blue-300">{registryId}</Link>
                {client ? <Link href={`/app/clients/${client.id}/dashboard`} className="inline-flex items-center gap-1.5 hover:text-blue-300"><UserRound className="h-3.5 w-3.5" />{client.name}</Link> : null}
                {expiresAt ? <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />Expire {expiresAt}</span> : null}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(180px,260px)_auto] sm:items-center">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-slate-600"><span>Progression</span><span>{signedCount}/{signerCount} · {progress}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>
                </div>
                {currentSigner ? <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs"><span className="text-slate-600">Signataire actuel</span><div className="mt-1 flex flex-wrap items-center gap-2 text-slate-200"><Mail className="h-3.5 w-3.5 text-emerald-400" /><strong>{currentSigner.name}</strong><span className="text-slate-500">{currentSigner.email}</span></div></div> : null}
              </div>
            </div>
          </div>

          {actions ? <div className="flex max-w-2xl flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-white/[0.06] bg-black/[0.07] px-5 py-2.5 text-[10px] text-slate-600 sm:px-6">
        {complete ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />}
        <span>{complete ? "Signature terminée · PDF signé et certificat disponibles dans JUN" : "JUN Secure Sign · liens révocables, routage contrôlé et audit complet"}</span>
      </div>
    </section>
  );
}
