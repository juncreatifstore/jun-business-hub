import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Cloud,
  DownloadCloud,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Link2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/app/page-header";
import { DriveSidebar } from "@/components/app/drive-sidebar";
import {
  cloudFolderPath,
  cloudOAuthConfig,
  cloudRedirectUri,
  getCloudConnection,
  isCloudAdmin,
  listCloudFiles,
  type CloudCrumb,
  type CloudFile,
  type CloudProvider,
} from "@/lib/drive-cloud";
import { googleWorkspaceConfigured } from "@/lib/google-workspace-drive";
import { disconnectCloudProvider, importCloudFile } from "@/services/drive-cloud";
import { syncGoogleWorkspaceDesktop } from "@/services/drive-workspace-sync";

export const dynamic = "force-dynamic";

function size(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function providerState(userId: string, provider: CloudProvider, folderId?: string) {
  const connection = await getCloudConnection(userId, provider);
  let files: CloudFile[] = [];
  let crumbs: CloudCrumb[] = [];
  let error: string | null = null;
  if (connection) {
    try {
      [files, crumbs] = await Promise.all([
        listCloudFiles(connection, folderId),
        folderId ? cloudFolderPath(connection, folderId) : Promise.resolve([]),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to load files";
    }
  }
  return {
    provider,
    configured: Boolean(cloudOAuthConfig(provider)),
    redirectUri: cloudRedirectUri(provider),
    connection,
    files,
    crumbs,
    folderId: folderId ?? null,
    error,
  };
}

function folderHref(provider: CloudProvider, folderId?: string | null) {
  const base = `/app/drive/cloud?provider=${provider}`;
  return folderId ? `${base}&${provider}Folder=${encodeURIComponent(folderId)}` : base;
}

export default async function CloudDrivePage(props: {
  searchParams: Promise<{
    toast?: string;
    error?: string;
    connected?: string;
    googleFolder?: string;
    microsoftFolder?: string;
    provider?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  // ?provider=google|microsoft → that drive alone, browsed like a JUN view.
  const focus: CloudProvider | null =
    searchParams.provider === "google" || searchParams.provider === "microsoft"
      ? searchParams.provider
      : null;
  const [google, microsoft] = await Promise.all([
    providerState(user.id, "google", searchParams.googleFolder),
    providerState(user.id, "microsoft", searchParams.microsoftFolder),
  ]);
  const workspaceReady = googleWorkspaceConfigured();
  const workspaceStorageActive = (process.env.STORAGE_DRIVER || "").toUpperCase() === "GOOGLE_WORKSPACE";
  const syncFolder =
    (process.env.GOOGLE_WORKSPACE_SYNC_FOLDER_NAME || "Desktop Sync").trim() || "Desktop Sync";

  return (
    <div>
      <PageHeader
        title="Drive"
        subtitle="Company storage with intelligent search, secure sharing, advanced folders, recovery, versions and audit history."
      />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <DriveSidebar active={focus ? `cloud:${focus}` : "cloud"} userId={user.id} role={user.role} />
        <main className="min-w-0 space-y-5">
          {!focus ? (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-electric">
                  <Cloud className="h-4 w-4" /> Connected Cloud
                </div>
                <h2 className="mt-1 text-xl font-semibold">Google Drive & OneDrive</h2>
                <p className="mt-2 max-w-3xl text-sm text-muted2">
                  Admin and Super Admin accounts can connect a personal/work cloud drive, browse it here like
                  any Drive view, open files in the hub, and copy them into JUN Drive when needed.
                </p>
              </div>
            </div>
          ) : null}

          {searchParams.toast ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {searchParams.toast}
            </div>
          ) : null}
          {searchParams.error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {searchParams.error.replace(/_/g, " ")}
            </div>
          ) : null}

          <div className={focus ? "grid gap-4" : "grid gap-4 lg:grid-cols-2"}>
            {[google, microsoft]
              .filter((state) => !focus || state.provider === focus)
              .map((state) => {
                const label = state.provider === "google" ? "Google Drive" : "Microsoft OneDrive";
                return (
                  <section
                    key={state.provider}
                    className="rounded-2xl border border-line bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 font-semibold">
                          <HardDrive className="h-5 w-5 text-electric" /> {label}
                        </div>
                        {state.connection ? (
                          <p className="mt-1 text-xs text-muted2">
                            Connected as {state.connection.accountEmail}
                          </p>
                        ) : (
                          <>
                            <p className="mt-1 text-xs text-muted2">Not connected</p>
                            {state.redirectUri ? (
                              <p className="mt-1 text-[11px] text-muted2">
                                Redirect URI to authorize on the OAuth client:{" "}
                                <code className="select-all rounded bg-surface-2 px-1 py-0.5">
                                  {state.redirectUri}
                                </code>
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                      {state.connection ? (
                        <form action={disconnectCloudProvider}>
                          <input type="hidden" name="provider" value={state.provider} />
                          <button className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-xs text-red-700 hover:bg-red-50">
                            <Unplug className="h-3.5 w-3.5" /> Disconnect
                          </button>
                        </form>
                      ) : state.configured ? (
                        <a
                          href={`/api/drive/cloud/${state.provider}/start`}
                          className="inline-flex items-center gap-1 rounded-lg bg-electric px-3 py-2 text-xs font-medium text-white"
                        >
                          <Link2 className="h-3.5 w-3.5" /> Connect
                        </a>
                      ) : (
                        <span className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                          OAuth credentials required
                        </span>
                      )}
                    </div>
                    {state.connection ? (
                      <div className="mt-4">
                        <nav
                          className="mb-2 flex flex-wrap items-center gap-1 text-xs"
                          aria-label="Folder path"
                        >
                          <Link
                            prefetch={false}
                            href={folderHref(state.provider)}
                            className={
                              state.folderId
                                ? "font-semibold uppercase tracking-wide text-electric hover:underline"
                                : "font-semibold uppercase tracking-wide text-muted2"
                            }
                          >
                            {state.folderId ? "Recent" : "Recent files"}
                          </Link>
                          {state.crumbs.map((crumb, i) => (
                            <span key={crumb.id} className="flex items-center gap-1">
                              <span className="text-muted2">/</span>
                              {i === state.crumbs.length - 1 ? (
                                <span className="font-semibold text-ink">{crumb.name}</span>
                              ) : (
                                <Link
                                  prefetch={false}
                                  href={folderHref(state.provider, crumb.id)}
                                  className="text-electric hover:underline"
                                >
                                  {crumb.name}
                                </Link>
                              )}
                            </span>
                          ))}
                        </nav>
                        {state.error ? (
                          <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{state.error}</div>
                        ) : state.files.length ? (
                          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                            {state.files.map((f) => (
                              <div
                                key={f.id}
                                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
                              >
                                <div className="min-w-0 flex-1">
                                  {f.isFolder ? (
                                    <Link
                                      prefetch={false}
                                      href={folderHref(state.provider, f.id)}
                                      className="flex items-center gap-2 truncate text-sm font-medium hover:text-electric hover:underline"
                                      title="Open folder"
                                    >
                                      <FolderOpen className="h-4 w-4 shrink-0 text-muted2" /> {f.name}
                                    </Link>
                                  ) : (
                                    <Link
                                      prefetch={false}
                                      href={`/app/drive/cloud/${state.provider}/${encodeURIComponent(f.id)}`}
                                      className="block truncate text-sm font-medium hover:text-electric hover:underline"
                                      title="Open in JUN"
                                    >
                                      {f.name}
                                    </Link>
                                  )}
                                  <div className="mt-1 text-[11px] text-muted2">
                                    {f.isFolder ? "Folder" : `${f.mimeType} · ${size(f.sizeBytes)}`}
                                    {f.modifiedAt ? ` · ${new Date(f.modifiedAt).toLocaleDateString()}` : ""}
                                  </div>
                                </div>
                                {f.webUrl ? (
                                  <a
                                    href={f.webUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={`Open in ${label}`}
                                    className="rounded-md p-2 text-muted2 hover:bg-white hover:text-ink"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                ) : null}
                                {!f.isFolder ? (
                                  <form action={importCloudFile}>
                                    <input type="hidden" name="provider" value={state.provider} />
                                    <input type="hidden" name="fileId" value={f.id} />
                                    <button className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-2 text-xs font-medium text-electric shadow-sm hover:bg-blue-50">
                                      <DownloadCloud className="h-3.5 w-3.5" /> Import
                                    </button>
                                  </form>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-lg bg-surface p-3 text-xs text-muted2">
                            {state.folderId
                              ? "This folder is empty."
                              : "No files returned from this account."}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-4 rounded-xl bg-surface p-3 text-xs leading-5 text-muted2">
                        Connection uses OAuth. JUN stores the refresh/access credentials encrypted
                        server-side. The browser never receives the saved tokens.
                      </p>
                    )}
                  </section>
                );
              })}
          </div>

          {!focus ? (
            <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Central Google Workspace Shared Drive</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted2">
                    Use Google Workspace Business Standard / Shared Drive as the company storage instead of
                    personal Google One. When configured, JUN writes its physical files into the Shared Drive
                    while the database keeps the business metadata, permissions, audit, AI and public-sharing
                    rules.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-1 ${workspaceReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                    >
                      {workspaceReady ? "Workspace credentials configured" : "Workspace credentials missing"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 ${workspaceStorageActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-ink-2"}`}
                    >
                      {workspaceStorageActive
                        ? "GOOGLE_WORKSPACE is active storage"
                        : "Current storage is not Google Workspace"}
                    </span>
                  </div>
                </div>
                {workspaceReady && workspaceStorageActive ? (
                  <form action={syncGoogleWorkspaceDesktop}>
                    <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700">
                      <RefreshCw className="h-4 w-4" /> Sync Workspace now
                    </button>
                  </form>
                ) : null}
              </div>
              <div className="mt-4 rounded-xl border border-blue-200 bg-ink/70 p-4 text-sm leading-6 text-muted2">
                <strong className="text-ink">Computer workflow:</strong> install Google Drive for desktop on
                the Super Admin computer, open the Shared Drive, and use the folder{" "}
                <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink">
                  {syncFolder}
                </span>
                . Files or folders placed there sync to Google automatically. “Sync Workspace now” then
                creates or updates the matching JUN Drive entries without duplicating items already mapped by
                their Google file ID.
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
