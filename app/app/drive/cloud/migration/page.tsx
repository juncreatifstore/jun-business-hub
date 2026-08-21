import Link from "next/link";
import { DatabaseBackup, ShieldCheck, TriangleAlert } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { googleWorkspaceConfigured } from "@/lib/google-workspace-drive";
import { migrateLegacyStorageBatch } from "@/services/drive-workspace-migration";

export const dynamic = "force-dynamic";

const FILE_MARKER = "drive.workspace.migrated.file.";
const VERSION_MARKER = "drive.workspace.migrated.version.";
const VERSION_PREFIX = "drive.version.";

export default async function WorkspaceMigrationPage({ searchParams }: { searchParams: { toast?: string; toast_error?: string } }) {
  await requirePermission("SETTINGS_MANAGE");
  const [totalFiles, migratedFiles, totalVersions, migratedVersions] = await Promise.all([
    prisma.file.count(),
    prisma.appSetting.count({ where: { key: { startsWith: FILE_MARKER } } }),
    prisma.appSetting.count({ where: { key: { startsWith: VERSION_PREFIX } } }),
    prisma.appSetting.count({ where: { key: { startsWith: VERSION_MARKER } } }),
  ]);
  const ready = googleWorkspaceConfigured();
  const activeDriver = (process.env.STORAGE_DRIVER || "SUPABASE").toUpperCase();
  const done = migratedFiles >= totalFiles && migratedVersions >= totalVersions;

  return <div className="mx-auto max-w-4xl space-y-6 text-ink">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-medium text-electric"><DatabaseBackup className="h-4 w-4" /> Storage migration</div><h1 className="mt-1 text-2xl font-semibold">Supabase → Google Workspace</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted2">Copy existing files and previous versions into the Workspace Shared Drive before changing the production storage driver. This migration is copy-only: it does not delete the Supabase originals.</p></div><Link href="/app/drive/cloud" className="rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-surface">Back to Connected Cloud</Link></div>

    {searchParams.toast ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{searchParams.toast}</div> : null}
    {searchParams.toast_error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{searchParams.toast_error}</div> : null}

    <div className="grid gap-4 sm:grid-cols-2"><Status label="Workspace credentials" value={ready ? "Configured" : "Missing"} ok={ready} /><Status label="Current storage driver" value={activeDriver} ok={activeDriver !== "GOOGLE_WORKSPACE" || done} /><Status label="Current files copied" value={`${migratedFiles} / ${totalFiles}`} ok={migratedFiles >= totalFiles} /><Status label="Previous versions copied" value={`${migratedVersions} / ${totalVersions}`} ok={migratedVersions >= totalVersions} /></div>

    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-semibold">Migration procedure</h2><ol className="mt-3 space-y-3 text-sm leading-6 text-muted2"><li><strong className="text-ink">1.</strong> Keep production on Supabase while copying.</li><li><strong className="text-ink">2.</strong> Run migration batches until all counters are complete. Each object is verified in Google Workspace before being marked migrated.</li><li><strong className="text-ink">3.</strong> Verify several documents, images and previous versions in the Shared Drive.</li><li><strong className="text-ink">4.</strong> Only then change Vercel <code className="rounded bg-surface px-1.5 py-0.5">STORAGE_DRIVER</code> to <code className="rounded bg-surface px-1.5 py-0.5">GOOGLE_WORKSPACE</code>.</li><li><strong className="text-ink">5.</strong> Keep the Supabase originals during a rollback period; do not delete them immediately.</li></ol>
      <div className="mt-5">{activeDriver === "GOOGLE_WORKSPACE" && !done ? <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> The storage driver was switched before migration counters were complete. Switch back to Supabase for the copy phase.</div> : done ? <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Copy counters are complete. Verify files before switching or finalizing the Workspace driver.</div> : <form action={migrateLegacyStorageBatch}><button disabled={!ready} className="rounded-lg bg-electric px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Run next migration batch</button></form>}</div>
    </section>
  </div>;
}

function Status({ label, value, ok }: { label: string; value: string; ok: boolean }) { return <div className="rounded-xl border border-line bg-white p-4"><div className="text-xs text-muted2">{label}</div><div className={`mt-1 font-semibold ${ok ? "text-emerald-700" : "text-amber-700"}`}>{value}</div></div>; }
