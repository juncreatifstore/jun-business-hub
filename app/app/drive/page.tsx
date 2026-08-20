import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { DriveBrowser } from "@/components/app/drive-browser";
import { uploadFile, createFolder } from "@/services/files";
import {
  FolderOpen, FolderPlus, Home, ChevronRight, Clock3, Star, Users, Trash2, HardDrive,
} from "lucide-react";

export const dynamic = "force-dynamic";

const CATEGORIES = ["IDENTITY", "PASSPORT", "CONTRACT", "PAYMENT_PROOF", "RECEIPT", "REFUND", "VISA", "FLIGHT", "INVOICE", "COMPANY", "LEGAL", "TAX", "EMPLOYEE", "VENDOR", "OTHER"];
const VIEWS = ["my", "recent", "starred", "shared", "trash"] as const;
type DriveView = typeof VIEWS[number];
type DriveFolderCrumb = { id: string; name: string; parentId: string | null };

const FAVORITE_PREFIX = "drive.favorite.";
const SHARE_PREFIX = "drive.share.";
const NOTE_PREFIX = "drive.note.";
const PUBLIC_DISABLED_PREFIX = "drive.public.disabled.";
const PUBLIC_TOKEN_PREFIX = "drive.public.token.";
const VERSION_PREFIX = "drive.version.";

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

  const [folders, files, clients, cases, teamUsers, moveFolders] = await Promise.all([
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
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.folder.findMany({
      where: { isVault: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, parent: { select: { name: true } } },
      take: 500,
    }),
  ]);

  const fileIds = files.map((f) => f.id);
  const [manageSettings, auditRows] = fileIds.length ? await Promise.all([
    prisma.appSetting.findMany({ where: { OR: [
      { key: { startsWith: NOTE_PREFIX } },
      { key: { startsWith: PUBLIC_DISABLED_PREFIX } },
      { key: { startsWith: PUBLIC_TOKEN_PREFIX } },
      { key: { startsWith: VERSION_PREFIX } },
    ] }, select: { key: true, value: true } }),
    prisma.auditLog.findMany({
      where: { resourceType: "File", resourceId: { in: fileIds } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
  ]) : [[], []];

  const currentIdSet = new Set(fileIds);
  const noteMap = new Map<string, string>();
  const publicDisabledSet = new Set<string>();
  const publicTokenMap = new Map<string, string>();
  const versionsMap = new Map<string, Array<{ versionId: string; name: string; mimeType: string; sizeBytes: number; createdAt: string; createdBy: string }>>();

  for (const setting of manageSettings) {
    if (setting.key.startsWith(NOTE_PREFIX)) {
      const id = setting.key.slice(NOTE_PREFIX.length); if (currentIdSet.has(id)) noteMap.set(id, setting.value);
    } else if (setting.key.startsWith(PUBLIC_DISABLED_PREFIX)) {
      const id = setting.key.slice(PUBLIC_DISABLED_PREFIX.length); if (currentIdSet.has(id)) publicDisabledSet.add(id);
    } else if (setting.key.startsWith(PUBLIC_TOKEN_PREFIX)) {
      const id = setting.key.slice(PUBLIC_TOKEN_PREFIX.length); if (currentIdSet.has(id)) publicTokenMap.set(id, setting.value);
    } else if (setting.key.startsWith(VERSION_PREFIX)) {
      const id = fileIds.find((fileId) => setting.key.startsWith(`${VERSION_PREFIX}${fileId}.`));
      if (!id) continue;
      try {
        const parsed = JSON.parse(setting.value) as { versionId: string; name: string; mimeType: string; sizeBytes: number; createdAt: string; createdBy: string };
        const list = versionsMap.get(id) ?? [];
        list.push(parsed);
        versionsMap.set(id, list);
      } catch {}
    }
  }
  for (const list of versionsMap.values()) list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const activityMap = new Map<string, Array<{ id: string; action: string; createdAt: string; user: string }>>();
  for (const row of auditRows) {
    if (!row.resourceId) continue;
    const list = activityMap.get(row.resourceId) ?? [];
    if (list.length >= 12) continue;
    list.push({ id: row.id, action: row.action, createdAt: row.createdAt.toISOString(), user: row.user ? `${row.user.firstName} ${row.user.lastName}` : "System" });
    activityMap.set(row.resourceId, list);
  }

  const currentFolder = breadcrumbs?.[breadcrumbs.length - 1];
  const returnTo = driveUrl(view, folderId, q, category);
  const viewLabel = NAV.find((item) => item.view === view)?.label ?? "My Drive";
  const browserFiles = files.map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    category: f.category,
    createdAt: f.createdAt.toISOString(),
    uploadedBy: `${f.uploadedBy.firstName} ${f.uploadedBy.lastName}`,
    clientLabel: f.client ? `${f.client.firstName} ${f.client.lastName}` : null,
    caseNumber: f.case?.caseNumber ?? null,
    starred: favoriteSet.has(f.id),
    note: noteMap.get(f.id) ?? "",
    publicDisabled: publicDisabledSet.has(f.id),
    publicToken: publicTokenMap.get(f.id) ?? null,
    versions: versionsMap.get(f.id) ?? [],
    activity: activityMap.get(f.id) ?? [],
  }));

  return (
    <div>
      <PageHeader title="Drive" subtitle="Company storage with folders, public links, sharing, recovery, preview, versions and audit history." />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside>
          <nav className="sticky top-5 space-y-1 rounded-xl border border-line bg-white p-2 shadow-sm">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = item.view === view;
              return <Link key={item.view} href={driveUrl(item.view)} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${active ? "bg-blue-50 text-electric" : "text-muted2 hover:bg-surface hover:text-ink"}`}><Icon className="h-4 w-4" />{item.label}</Link>;
            })}
          </nav>
        </aside>

        <main className="min-w-0">
          {view === "my" ? (
            <div className="mb-5 flex flex-wrap items-center gap-1 text-sm text-muted2">
              <Link href="/app/drive" className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface hover:text-ink"><Home className="h-4 w-4" /> My Drive</Link>
              {breadcrumbs?.map((folder) => <span key={folder.id} className="inline-flex items-center gap-1"><ChevronRight className="h-4 w-4 text-muted2" /><Link href={`/app/drive?folder=${folder.id}`} className="rounded-md px-2 py-1 hover:bg-surface hover:text-ink">{folder.name}</Link></span>)}
            </div>
          ) : <div className="mb-5 flex items-center gap-2"><h2 className="text-lg font-semibold">{viewLabel}</h2><Badge className="bg-surface text-muted2">{files.length}</Badge></div>}

          {canUpload && view === "my" ? (
            <div className="mb-6 grid gap-4 xl:grid-cols-[300px_1fr]">
              <Card><CardHeader><CardTitle>New folder</CardTitle></CardHeader><CardContent><form action={createFolder} className="space-y-3"><input type="hidden" name="parentId" value={folderId ?? ""} /><input name="name" required maxLength={120} placeholder="Folder name" className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-electric" /><Button type="submit" variant="secondary"><FolderPlus className="mr-2 h-4 w-4" />Create folder</Button></form></CardContent></Card>
              <Card><CardHeader><CardTitle>Upload to {currentFolder?.name ?? "My Drive"}</CardTitle></CardHeader><CardContent><FileUploadForm action={uploadFile} folderId={folderId} categories={CATEGORIES} clients={clients.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName} (${c.internalId})` }))} cases={cases.map((c) => ({ id: c.id, label: `${c.caseNumber} — ${c.title}` }))} /><p className="mt-2 text-xs text-muted2">Public JUN links remain stable when files move. Phase 4 adds version history and revocable public links.</p></CardContent></Card>
            </div>
          ) : null}

          <form method="get" className="mb-5 flex flex-wrap gap-3">
            {view !== "my" ? <input type="hidden" name="view" value={view} /> : null}{folderId ? <input type="hidden" name="folder" value={folderId} /> : null}
            <input name="q" defaultValue={q} placeholder={view === "my" ? "Search this folder…" : `Search ${viewLabel.toLowerCase()}…`} className="h-10 min-w-64 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-electric" />
            <select name="category" defaultValue={category ?? ""} className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-electric"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select>
            <Button type="submit" variant="secondary">Filter</Button>{(q || category) ? <Link href={driveUrl(view, folderId)} className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-muted2 hover:bg-surface hover:text-ink">Clear</Link> : null}
          </form>

          {files.length === 0 && folders.length === 0 ? (
            <EmptyState icon={view === "trash" ? Trash2 : view === "starred" ? Star : view === "shared" ? Users : FolderOpen} title={view === "trash" ? "Trash is empty" : view === "starred" ? "No starred files" : view === "shared" ? "Nothing shared with you" : "No files"} description={q || category ? "No files match these filters." : view === "recent" ? "Recently uploaded files will appear here." : view === "my" ? "Upload a file or create a subfolder." : "This view has no files yet."} />
          ) : (
            <DriveBrowser
              files={browserFiles}
              folders={folders.map((f) => ({ id: f.id, name: f.name, files: f._count.files, children: f._count.children }))}
              moveFolders={moveFolders.map((f) => ({ id: f.id, label: f.parent ? `${f.parent.name} / ${f.name}` : f.name }))}
              teamUsers={teamUsers.map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }))}
              view={view}
              returnTo={returnTo}
              canDelete={canDelete}
              canManage={canUpload}
            />
          )}
        </main>
      </div>
    </div>
  );
}
