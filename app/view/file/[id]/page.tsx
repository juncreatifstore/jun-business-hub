import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getDrivePublicSecurity,
  publicAccessCookieName,
  publicLinkExpired,
  publicTokenMatches,
  recordDrivePublicAccess,
  requestPublicMeta,
  verifyDrivePublicAccess,
} from "@/lib/drive-public-security";
import { drivePublicPolicyAllows, getDriveEnterpriseSettings } from "@/lib/drive-enterprise";
import { drivePrivacyCookieName, getDrivePrivacyPolicy, verifyDrivePrivacyConsent } from "@/lib/drive-privacy";
import { FileText, ShieldCheck, Download, LockKeyhole, Clock3, ShieldX, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function Unavailable({ expired = false }: { expired?: boolean }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#07101f] p-6 text-white"><div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-300">{expired ? <Clock3 className="h-7 w-7" /> : <ShieldX className="h-7 w-7" />}</div><h1 className="text-xl font-semibold">{expired ? "This shared link has expired" : "This shared link is unavailable"}</h1><p className="mt-2 text-sm text-white/55">Contact JUN CREATIF AND TRAVEL LLC if you need a new authorized link.</p></div></main>;
}

export default async function PublicFileViewer({ params, searchParams }: { params: { id: string }; searchParams: { key?: string; error?: string; privacy_error?: string } }) {
  const suppliedToken = typeof searchParams.key === "string" ? searchParams.key : undefined;
  const file = await prisma.file.findFirst({
    where: { id: params.id, isVault: false, archivedAt: null },
    select: { id: true, name: true, mimeType: true, sizeBytes: true, category: true, createdAt: true },
  });
  if (!file) notFound();

  const [security, enterprise, privacy] = await Promise.all([
    getDrivePublicSecurity(file.id),
    getDriveEnterpriseSettings(),
    getDrivePrivacyPolicy(file.id),
  ]);
  if (!publicTokenMatches(security, suppliedToken)) notFound();
  if (security.disabled || !drivePublicPolicyAllows(enterprise, security)) return <Unavailable />;
  if (publicLinkExpired(security)) return <Unavailable expired />;

  if (privacy.required) {
    const privacyCookie = cookies().get(drivePrivacyCookieName(file.id))?.value;
    const accepted = await verifyDrivePrivacyConsent(privacyCookie, file.id, privacy.version);
    if (!accepted) {
      return <main className="flex min-h-screen items-center justify-center bg-[#07101f] p-6 text-white"><div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-200"><ShieldAlert className="h-6 w-6" /></div><div className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">JUN confidential shared document</div><h1 className="mt-2 text-xl font-semibold">{privacy.title}</h1><div className="mt-4 max-h-[42vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/10 p-4 text-sm leading-6 text-white/70">{privacy.body}</div>{searchParams.privacy_error === "required" ? <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">You must accept the confidentiality policy before continuing.</p> : null}<form action={`/view/file/${file.id}/privacy`} method="post" className="mt-5"><input type="hidden" name="key" value={suppliedToken ?? ""} /><label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70"><input type="checkbox" name="accepted" value="1" required className="mt-1" /><span>I have read and accept this confidentiality and authorized-access policy. I understand that my access may be recorded for security and compliance.</span></label><button className="mt-4 h-11 w-full rounded-lg bg-blue-500 text-sm font-semibold text-white hover:bg-blue-400">Accept and continue</button></form><p className="mt-4 text-xs text-white/35">Policy version {privacy.version}. Acceptance is required before preview or download.</p></div></main>;
    }
  }

  if (security.passwordHash) {
    const accessCookie = cookies().get(publicAccessCookieName(file.id))?.value;
    const unlocked = await verifyDrivePublicAccess(accessCookie, file.id);
    if (!unlocked) {
      return <main className="flex min-h-screen items-center justify-center bg-[#07101f] p-6 text-white"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300"><LockKeyhole className="h-6 w-6" /></div><div className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">JUN protected document</div><h1 className="mt-2 text-xl font-semibold">Password required</h1><p className="mt-2 text-sm text-white/55">This official shared document is protected. Enter the password provided by JUN.</p>{searchParams.error === "password" ? <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">Incorrect password. Please try again.</p> : null}<form action={`/view/file/${file.id}/unlock`} method="post" className="mt-5 space-y-3"><input type="hidden" name="key" value={suppliedToken ?? ""} /><input type="password" name="password" required autoFocus placeholder="Document password" className="h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-blue-400" /><button className="h-11 w-full rounded-lg bg-blue-500 text-sm font-semibold text-white hover:bg-blue-400">Unlock document</button></form><p className="mt-5 text-xs text-white/35">Access is granted for 30 minutes on this device after successful verification.</p></div></main>;
    }
  }

  await recordDrivePublicAccess(file.id, "FILE_PUBLIC_VIEW", requestPublicMeta(headers()));
  const query = suppliedToken ? `?key=${encodeURIComponent(suppliedToken)}` : "";
  const rawUrl = `/public/files/${file.id}${query}`;
  const downloadUrl = `/public/files/${file.id}?${new URLSearchParams({ ...(suppliedToken ? { key: suppliedToken } : {}), download: "1" }).toString()}`;
  const previewable = file.mimeType === "application/pdf" || file.mimeType.startsWith("image/") || file.mimeType.startsWith("text/");
  const isVideo = file.mimeType.startsWith("video/");
  const isAudio = file.mimeType.startsWith("audio/");

  return (
    <main className="min-h-screen bg-[#07101f] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex min-w-0 items-center gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300"><FileText className="h-6 w-6" /></div><div className="min-w-0"><div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-emerald-300"><ShieldCheck className="h-4 w-4" /> JUN verified shared document</div><h1 className="truncate text-xl font-semibold">{file.name}</h1><p className="mt-1 text-sm text-white/55">{file.category.replace(/_/g, " ")} · {humanSize(file.sizeBytes)} · Shared from JUN Business Hub</p>{security.expiresAt ? <p className="mt-1 text-xs text-amber-200/80">Access expires {security.expiresAt.toLocaleString()}</p> : null}</div></div>
          <a href={downloadUrl} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-400"><Download className="h-4 w-4" /> Download</a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">{previewable ? <iframe src={rawUrl} title={file.name} className="h-[78vh] min-h-[620px] w-full bg-white" /> : isVideo ? <div className="flex min-h-[420px] items-center justify-center bg-black p-4"><video src={rawUrl} controls preload="metadata" className="max-h-[76vh] w-full rounded-xl" /></div> : isAudio ? <div className="flex min-h-[260px] items-center justify-center bg-slate-950 p-8"><audio src={rawUrl} controls preload="metadata" className="w-full max-w-2xl" /></div> : <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center text-slate-900"><FileText className="mb-4 h-12 w-12 text-slate-400" /><h2 className="text-lg font-semibold">Preview not available for this file type</h2><p className="mt-2 max-w-md text-sm text-slate-500">Use Download to open the original document. JUN can still index metadata and keep this file in the Drive.</p></div>}</div>
        <p className="mt-5 text-center text-xs text-white/35">Secure public access · Confidentiality accepted · Private underlying storage · Access events are recorded for document security.</p>
      </div>
    </main>
  );
}
