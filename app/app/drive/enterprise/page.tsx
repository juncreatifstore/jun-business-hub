import { redirect } from "next/navigation";
import { Archive, BarChart3, Database, Download, HardDrive, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDriveEnterpriseReport } from "@/lib/drive-enterprise";
import { PageHeader } from "@/components/app/page-header";
import { saveDriveEnterpriseSettings, runDriveRetentionMaintenance, resetDriveEnterpriseSettings } from "@/services/drive-enterprise";

export const dynamic = "force-dynamic";

function human(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export default async function DriveEnterprisePage() {
  const user = await requireUser();
  if (!can(user, "FILE_READ")) redirect("/app/forbidden");
  const canManage = can(user, "SETTINGS_MANAGE");
  const report = await getDriveEnterpriseReport();
  const usagePct = Math.min(100, report.settings.quotaBytes ? (report.usage.totalBytes / report.settings.quotaBytes) * 100 : 0);
  const cutoff = new Date(Date.now() - report.settings.retentionTrashDays * 86400000);

  const [categories, largestFiles, retentionEligible, recentSecurity] = await Promise.all([
    prisma.file.groupBy({
      by: ["category"],
      where: { isVault: false },
      _count: { id: true },
      _sum: { sizeBytes: true },
      orderBy: { _sum: { sizeBytes: "desc" } },
    }),
    prisma.file.findMany({
      where: { isVault: false, archivedAt: null },
      orderBy: { sizeBytes: "desc" },
      take: 50,
      select: { id: true, name: true, sizeBytes: true, category: true, createdAt: true },
    }),
    prisma.file.count({ where: { isVault: false, archivedAt: { not: null, lte: cutoff } } }),
    prisma.auditLog.findMany({
      where: { resourceType: "File", action: { in: ["FILE_PUBLIC_VIEW", "FILE_PUBLIC_OPEN", "FILE_PUBLIC_DOWNLOAD", "DRIVE_BULK_DOWNLOAD_ZIP"] } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, action: true, resourceId: true, createdAt: true, ip: true },
    }),
  ]);

  return <div className="space-y-6">
    <PageHeader title="Drive Enterprise" subtitle="Capacity, governance, retention, secure public access and controlled archive downloads." />

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Database} label="Storage used" value={human(report.usage.totalBytes)} hint={`${human(report.settings.quotaBytes)} quota`} />
      <Metric icon={HardDrive} label="Drive objects" value={String(report.usage.files + report.usage.versions)} hint={`${report.usage.files} files · ${report.usage.versions} versions`} />
      <Metric icon={Trash2} label="Trash" value={String(report.trashFiles)} hint={`${retentionEligible} eligible for retention`} />
      <Metric icon={ShieldCheck} label="Public compliance" value={report.nonCompliantPublicLinks ? `${report.nonCompliantPublicLinks} issue${report.nonCompliantPublicLinks === 1 ? "" : "s"}` : "Compliant"} hint={`${report.publicCandidates} configured public links`} />
    </div>

    <section className="rounded-xl border border-line bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Storage capacity</h2><p className="text-xs text-muted2">Current files and stored previous versions are included in quota.</p></div><span className="text-sm font-semibold">{usagePct.toFixed(1)}%</span></div>
      <div className="h-3 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-electric" style={{ width: `${usagePct}%` }} /></div>
      <div className="mt-3 grid gap-2 text-xs text-muted2 sm:grid-cols-3"><div>Current files: <strong className="text-ink">{human(report.usage.currentBytes)}</strong></div><div>Previous versions: <strong className="text-ink">{human(report.usage.versionBytes)}</strong></div><div>Audit events: <strong className="text-ink">{report.auditEvents}</strong></div></div>
    </section>

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4" /> Usage by category</h2>
        <div className="space-y-2">{categories.map((c) => <div key={c.category} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm"><span>{c.category.replace(/_/g, " ")}</span><span className="text-muted2">{c._count.id} · {human(Number(c._sum.sizeBytes ?? 0))}</span></div>)}</div>
      </section>

      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><LockKeyhole className="h-4 w-4" /> Governance snapshot</h2>
        <dl className="grid grid-cols-[180px_1fr] gap-y-3 text-sm"><dt className="text-muted2">Public-link policy</dt><dd>{report.settings.publicLinkPolicy.replace(/_/g, " ")}</dd><dt className="text-muted2">Maximum public lifetime</dt><dd>{report.settings.maxPublicLinkDays ? `${report.settings.maxPublicLinkDays} days` : "Unlimited"}</dd><dt className="text-muted2">Retention</dt><dd>{report.settings.retentionEnabled ? `Enabled · ${report.settings.retentionTrashDays} days in Trash` : "Disabled"}</dd><dt className="text-muted2">ZIP limit</dt><dd>{report.settings.zipMaxFiles} files · {human(report.settings.zipMaxBytes)}</dd><dt className="text-muted2">Folders</dt><dd>{report.folders}</dd><dt className="text-muted2">Active files</dt><dd>{report.activeFiles}</dd></dl>
      </section>
    </div>

    <section className="rounded-xl border border-line bg-white p-5">
      <div className="mb-4"><h2 className="flex items-center gap-2 font-semibold"><Archive className="h-4 w-4" /> Controlled ZIP download</h2><p className="mt-1 text-xs text-muted2">Select up to {report.settings.zipMaxFiles} active files. Total source size cannot exceed {human(report.settings.zipMaxBytes)}.</p></div>
      <form action="/api/drive/enterprise/archive" method="post">
        <div className="max-h-[380px] overflow-y-auto rounded-lg border border-line">
          {largestFiles.map((f) => <label key={f.id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 last:border-0 hover:bg-surface"><input type="checkbox" name="fileId" value={f.id} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{f.name}</div><div className="text-xs text-muted2">{f.category.replace(/_/g, " ")} · {human(f.sizeBytes)}</div></div></label>)}
        </div>
        <button className="mt-3 inline-flex items-center gap-2 rounded-lg bg-electric px-4 py-2 text-sm font-medium text-white hover:opacity-90"><Download className="h-4 w-4" /> Download selected as ZIP</button>
      </form>
    </section>

    {canManage ? <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="mb-1 font-semibold">Enterprise policies</h2><p className="mb-5 text-xs text-muted2">Changes are audited. Retention deletes only files already in Trash and must be run explicitly.</p>
      <form action={saveDriveEnterpriseSettings} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <input type="hidden" name="returnTo" value="/app/drive/enterprise" />
        <Field label="Storage quota (GB)"><input name="quotaGb" type="number" min={1} max={2048} defaultValue={Math.round(report.settings.quotaBytes / 1073741824)} className="h-10 w-full rounded-lg border border-line px-3" /></Field>
        <Field label="ZIP max files"><input name="zipMaxFiles" type="number" min={1} max={200} defaultValue={report.settings.zipMaxFiles} className="h-10 w-full rounded-lg border border-line px-3" /></Field>
        <Field label="ZIP max MB"><input name="zipMaxMb" type="number" min={5} max={500} defaultValue={Math.round(report.settings.zipMaxBytes / 1048576)} className="h-10 w-full rounded-lg border border-line px-3" /></Field>
        <Field label="Public-link policy"><select name="publicLinkPolicy" defaultValue={report.settings.publicLinkPolicy} className="h-10 w-full rounded-lg border border-line px-3"><option value="ALLOW">Allow</option><option value="PASSWORD_REQUIRED">Password required</option><option value="DISABLED">Disabled company-wide</option></select></Field>
        <Field label="Max public-link days (0 = unlimited)"><input name="maxPublicLinkDays" type="number" min={0} max={3650} defaultValue={report.settings.maxPublicLinkDays} className="h-10 w-full rounded-lg border border-line px-3" /></Field>
        <Field label="Trash retention days"><input name="retentionTrashDays" type="number" min={1} max={3650} defaultValue={report.settings.retentionTrashDays} className="h-10 w-full rounded-lg border border-line px-3" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="retentionEnabled" value="1" defaultChecked={report.settings.retentionEnabled} /> Enable Trash retention policy</label>
        <div className="md:col-span-2 xl:col-span-3 flex flex-wrap gap-2"><button className="rounded-lg bg-electric px-4 py-2 text-sm font-medium text-white">Save policies</button></div>
      </form>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4"><form action={runDriveRetentionMaintenance}><input type="hidden" name="returnTo" value="/app/drive/enterprise" /><button disabled={!report.settings.retentionEnabled} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 disabled:opacity-40">Run retention now ({retentionEligible} eligible)</button></form><form action={resetDriveEnterpriseSettings}><input type="hidden" name="returnTo" value="/app/drive/enterprise" /><button className="rounded-lg border border-line px-3 py-2 text-sm">Reset safe defaults</button></form></div>
    </section> : null}

    <section className="rounded-xl border border-line bg-white p-5"><h2 className="mb-3 font-semibold">Recent secure access events</h2><div className="space-y-2">{recentSecurity.length ? recentSecurity.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs"><span className="font-medium">{a.action.replace(/_/g, " ")}</span><span className="text-muted2">{new Date(a.createdAt).toLocaleString()} · {a.ip || "IP unavailable"}</span></div>) : <p className="text-xs text-muted2">No recent secure access events.</p>}</div></section>
  </div>;
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof Database; label: string; value: string; hint: string }) {
  return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-3 h-5 w-5 text-electric" /><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted2">{hint}</div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-medium text-muted2"><span className="mb-1 block">{label}</span>{children}</label>; }
