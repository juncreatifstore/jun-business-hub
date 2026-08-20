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
import { uploadFile, deleteFile, createFolder } from "@/services/files";
import { formatDate } from "@/lib/utils";
import { FolderOpen, FolderPlus, Download, Trash2, Home, ChevronRight, FileText, Link2 } from "lucide-react";

export const dynamic = "force-dynamic";

const CATEGORIES = ["IDENTITY", "PASSPORT", "CONTRACT", "PAYMENT_PROOF", "RECEIPT", "REFUND", "VISA", "FLIGHT", "INVOICE", "COMPANY", "LEGAL", "TAX", "EMPLOYEE", "VENDOR", "OTHER"];

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function getBreadcrumbs(folderId?: string) {
  if (!folderId) return [] as { id: string; name: string }[];
  const out: { id: string; name: string }[] = [];
  let current: string | null = folderId;
  for (let i = 0; current && i < 20; i++) {
    const folder = await prisma.folder.findFirst({ where: { id: current, isVault: false }, select: { id: true, name: true, parentId: true } });
    if (!folder) return null;
    out.unshift({ id: folder.id, name: folder.name });
    current = folder.parentId;
  }
  return out;
}

export default async function DrivePage({ searchParams }: { searchParams: { category?: string; q?: string; folder?: string } }) {
  const user = await requireUser();
  if (!can(user, "FILE_READ")) redirect("/app/forbidden");
  const canUpload = can(user, "FILE_UPLOAD");
  const canDelete = can(user, "FILE_DELETE");

  const folderId = (searchParams.folder ?? "").trim() || undefined;
  const breadcrumbs = await getBreadcrumbs(folderId);
  if (breadcrumbs === null) redirect("/app/drive?toast_error=Folder not found");

  const category = searchParams.category && CATEGORIES.includes(searchParams.category) ? searchParams.category : undefined;
  const q = (searchParams.q ?? "").trim();

  const [folders, files, clients, cases] = await Promise.all([
    prisma.folder.findMany({
      where: { isVault: false, parentId: folderId ?? null, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
      orderBy: { name: "asc" },
      include: { _count: { select: { files: true, children: true } } },
    }),
    prisma.file.findMany({
      where: {
        isVault: false,
        archivedAt: null,
        folderId: folderId ?? null,
        ...(category ? { category: category as never } : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { client: true, case: true, uploadedBy: true },
    }),
    canUpload ? prisma.client.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, firstName: true, lastName: true, internalId: true } }) : Promise.resolve([]),
    canUpload ? prisma.case.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, caseNumber: true, title: true } }) : Promise.resolve([]),
  ]);

  const currentFolder = breadcrumbs?.[breadcrumbs.length - 1];

  return (
    <div>
      <PageHeader title="Drive" subtitle="Private company storage with folders and stable public viewing links for every Drive file." />

      <div className="mb-5 flex flex-wrap items-center gap-1 text-sm text-muted2">
        <Link href="/app/drive" className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/5 hover:text-white"><Home className="h-4 w-4" /> My Drive</Link>
        {breadcrumbs?.map((folder) => (
          <span key={folder.id} className="inline-flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-white/25" />
            <Link href={`/app/drive?folder=${folder.id}`} className="rounded-md px-2 py-1 hover:bg-white/5 hover:text-white">{folder.name}</Link>
          </span>
        ))}
      </div>

      {canUpload ? (
        <div className="mb-6 grid gap-4 xl:grid-cols-[320px_1fr]">
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
              <p className="mt-2 text-xs text-muted2">Max 15 MB. PDF, images, Word, Excel, text/CSV. Every non-Vault file receives a public JUN viewing link automatically.</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <form method="get" className="mb-5 flex flex-wrap gap-3">
        {folderId ? <input type="hidden" name="folder" value={folderId} /> : null}
        <input name="q" defaultValue={q} placeholder="Search this folder…" className="h-10 min-w-64 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-electric" />
        <select name="category" defaultValue={category ?? ""} className="h-10 rounded-lg border border-white/10 bg-night px-3 text-sm outline-none focus:border-electric">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <Button type="submit" variant="secondary">Filter</Button>
        {(q || category) ? <Link href={folderId ? `/app/drive?folder=${folderId}` : "/app/drive"} className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-muted2 hover:bg-white/5 hover:text-white">Clear</Link> : null}
      </form>

      {folders.length > 0 ? (
        <section className="mb-7">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">Folders</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {folders.map((folder) => (
              <Link key={folder.id} href={`/app/drive?folder=${folder.id}`} className="group rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-electric/40 hover:bg-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-electric/10 p-2 text-electric"><FolderOpen className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <div className="truncate font-medium group-hover:text-electric">{folder.name}</div>
                    <div className="mt-0.5 text-xs text-muted2">{folder._count.children} folders · {folder._count.files} files</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Files</h2>
          <div className="inline-flex items-center gap-1 text-xs text-muted2"><Link2 className="h-3.5 w-3.5" /> Public links are stable and shareable</div>
        </div>
        {files.length === 0 ? (
          <EmptyState icon={FolderOpen} title={folders.length ? "No files in this folder" : "Folder is empty"} description={q || category ? "No files match these filters." : "Upload a file or create a subfolder."} />
        ) : (
          <Table>
            <THead><tr><TH>Name</TH><TH>Category</TH><TH>Linked to</TH><TH>Size</TH><TH>Uploaded</TH><TH>By</TH><TH>Public link</TH><TH></TH></tr></THead>
            <tbody>
              {files.map((f) => (
                <TR key={f.id}>
                  <TD>
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted2" />
                      <div>
                        <a href={`/api/files/${f.id}`} className="font-medium hover:text-electric" target="_blank" rel="noreferrer">{f.name}</a>
                        <div className="text-xs text-muted2">{f.mimeType}</div>
                      </div>
                    </div>
                  </TD>
                  <TD><Badge className="bg-white/10 text-white/80">{f.category.replace(/_/g, " ")}</Badge></TD>
                  <TD className="text-muted2">
                    {f.client ? <Link href={`/app/clients/${f.clientId}`} className="hover:text-electric">{f.client.firstName} {f.client.lastName}</Link> : null}
                    {f.client && f.case ? " · " : null}
                    {f.case ? <Link href={`/app/cases/${f.caseId}`} className="registry-id hover:text-electric">{f.case.caseNumber}</Link> : null}
                    {!f.client && !f.case ? "—" : null}
                  </TD>
                  <TD className="text-muted2">{humanSize(f.sizeBytes)}</TD>
                  <TD className="text-muted2">{formatDate(f.createdAt)}</TD>
                  <TD className="text-muted2">{f.uploadedBy.firstName} {f.uploadedBy.lastName}</TD>
                  <TD><PublicFileLink fileId={f.id} /></TD>
                  <TD>
                    <div className="flex items-center justify-end gap-2">
                      <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="rounded-md p-2 text-muted2 hover:bg-white/5 hover:text-white" title="Download"><Download className="h-4 w-4" /></a>
                      {canDelete ? (
                        <form action={deleteFile.bind(null, f.id)}>
                          <button type="submit" className="rounded-md p-2 text-muted2 hover:bg-red-500/10 hover:text-red-400" title="Delete"><Trash2 className="h-4 w-4" /></button>
                        </form>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
