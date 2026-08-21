import Link from "next/link";
import { ShieldCheck, FileLock2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DRIVE_PRIVACY_FILE_PREFIX, getDrivePrivacyPolicy } from "@/lib/drive-privacy";
import { saveFileDrivePrivacyPolicy, saveGlobalDrivePrivacyPolicy } from "@/services/drive-phase11-settings";

export const dynamic = "force-dynamic";

export default async function DrivePrivacyPage({ searchParams }: { searchParams: { toast?: string; toast_error?: string } }) {
  await requirePermission("SETTINGS_MANAGE");
  const [globalPolicy, files, overrides] = await Promise.all([
    getDrivePrivacyPolicy("__global_preview__"),
    prisma.file.findMany({ where: { isVault: false, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, name: true, category: true } }),
    prisma.appSetting.findMany({ where: { key: { startsWith: DRIVE_PRIVACY_FILE_PREFIX } }, select: { key: true, value: true } }),
  ]);
  const overrideMap = new Map<string, { title: string; body: string }>();
  for (const row of overrides) {
    try {
      const p = JSON.parse(row.value) as { title?: string; body?: string };
      if (p.title && p.body) overrideMap.set(row.key.slice(DRIVE_PRIVACY_FILE_PREFIX.length), { title: p.title, body: p.body });
    } catch {}
  }

  return <div className="space-y-6 text-ink">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-medium text-electric"><ShieldCheck className="h-4 w-4" /> Public confidentiality</div><h1 className="mt-1 text-2xl font-semibold">Privacy Policies</h1><p className="mt-2 max-w-3xl text-sm text-muted2">Every public shared file must pass this consent gate before preview or download. Updating the policy changes its version, so previous consent cookies no longer satisfy the new version.</p></div><Link href="/app/drive" className="rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-surface">Back to Drive</Link></div>

    {searchParams.toast ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{searchParams.toast}</div> : null}
    {searchParams.toast_error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{searchParams.toast_error}</div> : null}

    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><div className="mb-4"><h2 className="font-semibold">Global policy</h2><p className="mt-1 text-xs text-muted2">Used automatically for every public-shared document unless a file-specific policy is configured.</p></div><form action={saveGlobalDrivePrivacyPolicy} className="space-y-4"><label className="block text-xs font-medium text-muted2">Title<input name="title" defaultValue={globalPolicy.title} maxLength={200} required className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-electric" /></label><label className="block text-xs font-medium text-muted2">Confidentiality text<textarea name="body" defaultValue={globalPolicy.body} rows={9} maxLength={12000} required className="mt-1 w-full rounded-lg border border-line bg-white p-3 text-sm leading-6 text-ink outline-none focus:border-electric" /></label><input type="hidden" name="required" value="1" /><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted2">Current version: {globalPolicy.version}</p><button className="rounded-lg bg-electric px-4 py-2 text-sm font-medium text-white hover:opacity-90">Save global policy</button></div></form></section>

    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><div className="mb-4"><h2 className="flex items-center gap-2 font-semibold"><FileLock2 className="h-4 w-4" /> File-specific policies</h2><p className="mt-1 text-xs text-muted2">Use only when a particular document needs stronger or different confidentiality wording.</p></div><div className="space-y-3">{files.map((file) => { const custom = overrideMap.get(file.id); return <details key={file.id} className="rounded-xl border border-line bg-surface"><summary className="cursor-pointer px-4 py-3 text-sm font-medium"><span>{file.name}</span><span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${custom ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{custom ? "CUSTOM POLICY" : "GLOBAL POLICY"}</span></summary><div className="border-t border-line bg-white p-4"><form action={saveFileDrivePrivacyPolicy.bind(null, file.id)} className="space-y-3"><label className="block text-xs font-medium text-muted2">Title<input name="title" defaultValue={custom?.title || globalPolicy.title} maxLength={200} className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-electric" /></label><label className="block text-xs font-medium text-muted2">Policy text<textarea name="body" defaultValue={custom?.body || globalPolicy.body} rows={7} maxLength={12000} className="mt-1 w-full rounded-lg border border-line p-3 text-sm leading-6 outline-none focus:border-electric" /></label><div className="flex flex-wrap gap-2"><button className="rounded-lg bg-electric px-3 py-2 text-xs font-medium text-white">Save custom policy</button>{custom ? <button name="useGlobal" value="1" className="rounded-lg border border-line bg-white px-3 py-2 text-xs hover:bg-surface">Use global policy instead</button> : null}</div></form></div></details>; })}</div></section>
  </div>;
}
