import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { PublicFileLink } from "@/components/app/public-file-link";
import {
  uploadFile, deleteFile, createFolder, restoreFile, permanentlyDeleteFile,
  toggleFavorite, shareFile,
} from "@/services/files";
import { formatDate } from "@/lib/utils";
import {
  FolderOpen, FolderPlus, Download, Trash2, Home, ChevronRight, FileText, Link2,
  Clock3, Star, Users, RotateCcw, Share2, HardDrive,
} from "lucide-react";

export const dynamic = "force-dynamic";

const CATEGORIES = ["IDENTITY", "PASSPORT", "CONTRACT", "PAYMENT_PROOF", "RECEIPT", "REFUND", "VISA", "FLIGHT", "INVOICE", "COMPANY", "LEGAL", "TAX", "EMPLOYEE", "VENDOR", "OTHER"];
const VIEWS = ["my", "recent", "starred", "shared", "trash"] as const;
type DriveView = typeof VIEWS[number];
type DriveFolderCrumb = { id: string; name: string; parentId: string | null };

const FAVORITE_PREFIX = "drive.favorite.";
const SHARE_PREFIX = "drive.share.";

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function getBreadcrumbs(folderId?: string): Promise<Array<{ id: string; name: string }> | null> {
  if (!folderId) return [];
  const out: { id: string; name: string }[] = [];
  let current: string | null = folderId;
  for (let i = 0; current && i < 20; i++) {
    const folder: DriveFolderCrumb | null = await prisma.folder.findFirst({
      where: { id: current, isVault: false },
      select: { id: true, name: true, parentId: true },
    });
    if (!folder) return null;
    out.unshift({ id: folder.id, name: folder.name });
    current = folder.parentId;
  }
  return out;
}

function driveUrl(view: DriveView, folderId?: string, q?: string, category?: string) {
  const params = new URLSearchParams();
  if (view !== "my") params.set("view", view);
  if (view === "my" && folderId) params.set("folder", folderId);
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  const query = params.toString();
  return `/app/drive${query ? `?${query}` : ""}`;
}

const NAV: Array<{ view: DriveView; label: string; icon: typeof HardDrive }> = [
  { view: "my", label: "My Drive", icon: HardDrive },
  { view: "recent", label: "Recent", icon: Clock3 },
  { view: "starred", label: "Starred", icon: Star },
  { view: "shared", label: "Shared with me", icon: Users },
  { view: "trash", label: "Trash", icon: Trash2 },
];

export default async function DrivePage({ searchParams }: { searchParams: { category?: string; q?: string; folder?: string; view?: string } }) {
  const user = await requireUser();
  if (!can(user, "FILE_READ")) redirect("/app/forbidden");
  const canUpload = can(user, "FILE_UPLOAD");
  const canDelete = can(user, "FILE_DELETE");

  const requestedView = String(searchParams.view ?? "my") as DriveView;
  const view: DriveView = VIEWS.includes(requestedView) ? requestedView : "my";
  const folderId = view === "my" ? ((searchParams.folder ?? "").trim() || undefined) : undefined;
  const breadcrumbs = view === "my" ? await getBreadcrumbs(folderId) : [];
  if (breadcrumbs === null) redirect("/app/drive?toast_error=Folder%20not%20found");

  const category = searchParams.category && CATEGORIES.includes(searchParams.category) ? searchParams.category : undefined;
  const q = (searchParams.q ?? "").trim();
  const favoritePrefix = `${FAVORITE_PREFIX}${user.id}.`;
  const sharedPrefix = `${SHARE_PREFIX}${user.id}.`;

  const [favoriteSettings, incomingShares] = await Promise.all([
    prisma.appSetting.findMany({ where: { key: { startsWith: favoritePrefix } }, select: { key: true } }),
    prisma.appSetting.findMany({ where: { key: { startsWith: sharedPrefix } }, select: { key: true } }),
  ]);
  const favoriteIds = favoriteSettings.map((s) => s.key.slice(favoritePrefix.length)).filter(Boolean);
  const sharedIds = incomingShares.map((s) => s.key.slice(sharedPrefix.length)).filter(Boolean);
  const favoriteSet = new Set(favoriteIds);

  const fileWhere = {
    isVault: false,
    ...(view === "trash" ? { archivedAt: { not: null } } : { archivedAt: null }),
    ...(view === "my" ? { folderId: folderId ?? null } : {}),
    ...(view === "starred" ? { id: { in: favoriteIds } } : {}),
    ...(view === "shared" ? { id: { in: sharedIds } } : {}),
    ...(category ? { category: category as never } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [folders, files, clients, cases, teamUsers] = await Promise.all([
    view === "my" ? prisma.folder.findMany({
      where: { isVault: false, parentId: folderId ?? null, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
      orderBy: { name: "asc" },
      include: { _count: { select: { files: true, children: true } } },
    }) : Promise.resolve([]),
    prisma.file.findMany({
      where: fileWhere,
      orderBy: { createdAt: "desc" },
      take: view === "recent" ? 75 : 200,
      include: { client: true, case: true, uploadedBy: true },
    }),
    canUpload && view === "my" ? prisma.client.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, firstName: true, lastName: true, internalId: true } }) : Promise.resolve([]),
    canUpload && view === "my" ? prisma.case.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, caseNumber: true, title: true } }) : Promise.resolve([]),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { not: "CLIENT" }, id: { not: user.id } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, role: true },
    }),
  ]);

  const currentFolder = breadcrumbs?.[breadcrumbs.length - 1];
  const returnTo = driveUrl(view, folderId, q, category);
  const viewLabel = NAV.find((item) => item.view === view)?.label ?? "My Drive";

  return (
    <div>
      <PageHeader title="Drive" subtitle="Company storage, internal sharing, favorites, recovery, and stable public document links." />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside>
          <nav className="sticky top-5 space-y-1 rounded-xl border border-white/10 bg-white/[0.025] p-2">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = item.view === view;
              return (
                <Link key={item.view} href={driveUrl(item.view)} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${active ? "bg-electric/15 text-electric" : "text-muted2 hover:bg-white/5 hover:text-white"}`}>
                  <Icon className="h-4 w-4" />{item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">
          {view === "my" ? (
            <div className="mb-5 flex flex-wrap items-center gap-1 text-sm text-muted2">
              <Link href="/app/drive" className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/5 hover:text-white"><Home className="h-4 w-4" /> My Drive</Link>
              {breadcrumbs?.map((folder) => (
                <span key={folder.id} className="inline-flex items-center gap-1">
                  <ChevronRight className="h-4 w-4 text-white/25" />
                  <Link href={`/app/drive?folder=${folder.id}`} className="rounded-md px-2 py-1 hover:bg-white/5 hover:text-white">{folder.name}</Link>
                </span>
              ))}
            </div>
          ) : (
            <div className="mb-5 flex items-center gap-2"><h2 className="text-lg font-semibold">{viewLabel}</h2><Badge className="bg-white/10 text-white/70">{files.length}</Badge></div>
          )}

          {canUpload && view === "my" ? (
            <div className="mb-6 grid gap-4 xl:grid-cols-[300px_1fr]">
              <Card>
                <CardHeader><CardTitle>New folder</CardTitle></CardHeader>
                <CardContent>
                  <form action={createFolder} className="space-y-3">
                    <input type="hidden" name="parentId" value={folderId ?? ""} />
                    <input name="name" required maxLength={120} placeholder="Folder name" className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-electric" />
                    <Button type="submit" variant="secondary"><FolderPlus className="mr-2 h-4 w-4" />Create folder</Button>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Upload to {currentFolder?.name ?? "My Drive"}</CardTitle></CardHeader>
                <CardContent>
                  <FileUploadForm
                    action={uploadFile}
                    folderId={folderId}
                    categories={CATEGORIES}
                    clients={clients.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName} (${c.internalId})` }))}
                    cases={cases.map((c) => ({ id: c.id, label: `${c.caseNumber} — ${c.title}` }))}
                  />
                  <p className="mt-2 text-xs text-muted2">Every Drive file keeps its stable public JUN viewing link. Files moved to Trash are immediately unavailable publicly until restored.</p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <form method="get" className="mb-5 flex flex-wrap gap-3">
            {view !== "my" ? <input type="hidden" name="view" value={view} /> : null}
            {folderId ? <input type="hidden" name="folder" value={folderId} /> : null}
            <input name="q" defaultValue={q} placeholder={view === "my" ? "Search this folder…" : `Search ${viewLabel.toLowerCase()}…`} className="h-10 min-w-64 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-electric" />
            <select name="category" defaultValue={category ?? ""} className="h-10 rounded-lg border border-white/10 bg-night px-3 text-sm outline-none focus:border-electric">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </select>
            <Button type="submit" variant="secondary">Filter</Button>
            {(q || category) ? <Link href={driveUrl(view, folderId)} className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-muted2 hover:bg-white/5 hover:text-white">Clear</Link> : null}
          </form>

          {view === "my" && folders.length > 0 ? (
            <section className="mb-7">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">Folders</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {folders.map((folder) => (
                  <Link key={folder.id} href={`/app/drive?folder=${folder.id}`} className="group rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-electric/40 hover:bg-white/[0.06]">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-electric/10 p-2 text-electric"><FolderOpen className="h-5 w-5" /></div>
                      <div className="min-w-0"><div className="truncate font-medium group-hover:text-electric">{folder.name}</div><div className="mt-0.5 text-xs text-muted2">{folder._count.children} folders · {folder._count.files} files</div></div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{view === "trash" ? "Deleted files" : "Files"}</h2>
              {view !== "trash" ? <div className="inline-flex items-center gap-1 text-xs text-muted2"><Link2 className="h-3.5 w-3.5" /> Public links remain stable</div> : null}
            </div>

            {files.length === 0 ? (
              <EmptyState
                icon={view === "trash" ? Trash2 : view === "starred" ? Star : view === "shared" ? Users : FolderOpen}
                title={view === "trash" ? "Trash is empty" : view === "starred" ? "No starred files" : view === "shared" ? "Nothing shared with you" : "No files"}
                description={q || category ? "No files match these filters." : view === "recent" ? "Recently uploaded files will appear here." : view === "my" ? "Upload a file or create a subfolder." : "This view has no files yet."}
              />
            ) : (
              <Table>
                <THead><tr><TH>Name</TH><TH>Category</TH><TH>Linked to</TH><TH>Uploaded</TH>{view !== "trash" ? <TH>Public link</TH> : null}<TH>Actions</TH></tr></THead>
                <tbody>
                  {files.map((f) => {
                    const starred = favoriteSet.has(f.id);
                    return (
                      <TR key={f.id}>
                        <TD>
                          <div className="flex items-start gap-2">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted2" />
                            <div><a href={`/api/files/${f.id}`} className="font-medium hover:text-electric" target="_blank" rel="noreferrer">{f.name}</a><div className="text-xs text-muted2">{humanSize(f.sizeBytes)} · {f.mimeType}</div></div>
                          </div>
                        </TD>
                        <TD><Badge className="bg-white/10 text-white/80">{f.category.replace(/_/g, " ")}</Badge></TD>
                        <TD className="text-muted2">
                          {f.client ? <Link href={`/app/clients/${f.clientId}`} className="hover:text-electric">{f.client.firstName} {f.client.lastName}</Link> : null}
                          {f.client && f.case ? " · " : null}
                          {f.case ? <Link href={`/app/cases/${f.caseId}`} className="registry-id hover:text-electric">{f.case.caseNumber}</Link> : null}
                          {!f.client && !f.case ? "—" : null}
                        </TD>
                        <TD className="text-muted2"><div>{formatDate(f.createdAt)}</div><div className="text-xs">{f.uploadedBy.firstName} {f.uploadedBy.lastName}</div></TD>
                        {view !== "trash" ? <TD><PublicFileLink fileId={f.id} /></TD> : null}
                        <TD>
                          {view === "trash" ? (
                            <div className="flex items-center gap-1">
                              {canDelete ? <form action={restoreFile.bind(null, f.id)}><input type="hidden" name="returnTo" value={returnTo} /><button type="submit" title="Restore" className="rounded-md p-2 text-muted2 hover:bg-white/5 hover:text-white"><RotateCcw className="h-4 w-4" /></button></form> : null}
                              {canDelete ? <form action={permanentlyDeleteFile.bind(null, f.id)}><input type="hidden" name="returnTo" value={returnTo} /><button type="submit" title="Delete permanently" className="rounded-md p-2 text-muted2 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></form> : null}
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              <form action={toggleFavorite.bind(null, f.id)}><input type="hidden" name="returnTo" value={returnTo} /><button type="submit" title={starred ? "Remove from Starred" : "Add to Starred"} className={`rounded-md p-2 hover:bg-white/5 ${starred ? "text-amber-300" : "text-muted2 hover:text-white"}`}><Star className={`h-4 w-4 ${starred ? "fill-current" : ""}`} /></button></form>
                              <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="rounded-md p-2 text-muted2 hover:bg-white/5 hover:text-white" title="Open file"><Download className="h-4 w-4" /></a>
                              {teamUsers.length ? (
                                <form action={shareFile.bind(null, f.id)} className="flex items-center gap-1">
                                  <input type="hidden" name="returnTo" value={returnTo} />
                                  <select name="userId" required defaultValue="" title="Share with team member" className="h-8 max-w-36 rounded-md border border-white/10 bg-night px-2 text-xs text-white">
                                    <option value="" disabled>Share with…</option>
                                    {teamUsers.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
                                  </select>
                                  <button type="submit" title="Share internally" className="rounded-md p-2 text-muted2 hover:bg-white/5 hover:text-white"><Share2 className="h-4 w-4" /></button>
                                </form>
                              ) : null}
                              {canDelete ? <form action={deleteFile.bind(null, f.id)}><input type="hidden" name="returnTo" value={returnTo} /><button type="submit" className="rounded-md p-2 text-muted2 hover:bg-red-500/10 hover:text-red-400" title="Move to Trash"><Trash2 className="h-4 w-4" /></button></form> : null}
                            </div>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
