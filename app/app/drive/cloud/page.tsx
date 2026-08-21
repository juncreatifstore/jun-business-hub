import Link from "next/link";
import { redirect } from "next/navigation";
import { Cloud, DownloadCloud, ExternalLink, HardDrive, Link2, Unplug } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { cloudOAuthConfig, getCloudConnection, isCloudAdmin, listCloudFiles, type CloudFile, type CloudProvider } from "@/lib/drive-cloud";
import { disconnectCloudProvider, importCloudFile } from "@/services/drive-cloud";

export const dynamic = "force-dynamic";

function size(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function providerState(userId: string, provider: CloudProvider) {
  const connection = await getCloudConnection(userId, provider);
  let files: CloudFile[] = [];
  let error: string | null = null;
  if (connection) {
    try { files = await listCloudFiles(connection); } catch (e) { error = e instanceof Error ? e.message : "Unable to load files"; }
  }
  return { provider, configured: Boolean(cloudOAuthConfig(provider)), connection, files, error };
}

export default async function CloudDrivePage({ searchParams }: { searchParams: { toast?: string; error?: string; connected?: string } }) {
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  const [google, microsoft] = await Promise.all([providerState(user.id, "google"), providerState(user.id, "microsoft")]);

  return <div className="space-y-6 text-ink">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-medium text-electric"><Cloud className="h-4 w-4" /> Connected Cloud</div><h1 className="mt-1 text-2xl font-semibold">Google Drive & OneDrive</h1><p className="mt-2 max-w-3xl text-sm text-muted2">Admin and Super Admin accounts can connect a personal/work cloud drive, review files, and selectively import authorized files into JUN Drive. Imported files then receive JUN audit, AI, privacy and sharing controls.</p></div><Link href="/app/drive" className="rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-surface">Back to Drive</Link></div>

    {searchParams.toast ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{searchParams.toast}</div> : null}
    {searchParams.error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{searchParams.error.replace(/_/g, " ")}</div> : null}

    <div className="grid gap-4 lg:grid-cols-2">{[google, microsoft].map((state) => {
      const label = state.provider === "google" ? "Google Drive" : "Microsoft OneDrive";
      return <section key={state.provider} className="rounded-2xl border border-line bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><HardDrive className="h-5 w-5 text-electric" /> {label}</div>{state.connection ? <p className="mt-1 text-xs text-muted2">Connected as {state.connection.accountEmail}</p> : <p className="mt-1 text-xs text-muted2">Not connected</p>}</div>{state.connection ? <form action={disconnectCloudProvider}><input type="hidden" name="provider" value={state.provider} /><button className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-xs text-red-700 hover:bg-red-50"><Unplug className="h-3.5 w-3.5" /> Disconnect</button></form> : state.configured ? <a href={`/api/drive/cloud/${state.provider}/start`} className="inline-flex items-center gap-1 rounded-lg bg-electric px-3 py-2 text-xs font-medium text-white"><Link2 className="h-3.5 w-3.5" /> Connect</a> : <span className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">OAuth credentials required</span>}</div>
        {state.connection ? <div className="mt-4"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted2">Recent files</div>{state.error ? <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{state.error}</div> : state.files.length ? <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">{state.files.map((f) => <div key={f.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{f.name}</div><div className="mt-1 text-[11px] text-muted2">{f.isFolder ? "Folder" : `${f.mimeType} · ${size(f.sizeBytes)}`}{f.modifiedAt ? ` · ${new Date(f.modifiedAt).toLocaleDateString()}` : ""}</div></div>{f.webUrl ? <a href={f.webUrl} target="_blank" rel="noreferrer" title={`Open in ${label}`} className="rounded-md p-2 text-muted2 hover:bg-white hover:text-ink"><ExternalLink className="h-4 w-4" /></a> : null}{!f.isFolder ? <form action={importCloudFile}><input type="hidden" name="provider" value={state.provider} /><input type="hidden" name="fileId" value={f.id} /><button className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-2 text-xs font-medium text-electric shadow-sm hover:bg-blue-50"><DownloadCloud className="h-3.5 w-3.5" /> Import</button></form> : null}</div>)}</div> : <p className="rounded-lg bg-surface p-3 text-xs text-muted2">No files returned from this account.</p>}</div> : <p className="mt-4 rounded-xl bg-surface p-3 text-xs leading-5 text-muted2">Connection uses OAuth. JUN stores the refresh/access credentials encrypted server-side. The browser never receives the saved tokens.</p>}
      </section>;
    })}</div>

    <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5"><h2 className="font-semibold">Central 2 TB architecture</h2><p className="mt-2 text-sm leading-6 text-muted2">For the central company storage, use a Google Workspace Shared Drive rather than a personal Google One drive. A dedicated Workspace storage identity / delegated service account can become the backend bridge, while Super Admins use Google Drive for desktop to work with the Shared Drive from macOS or Windows. JUN Business Hub will index the same files and apply its metadata, AI, audit and sharing policies.</p></section>
  </div>;
}
