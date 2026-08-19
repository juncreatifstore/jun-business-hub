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
import { uploadFile, deleteFile } from "@/services/files";
import { formatDate } from "@/lib/utils";
import { FolderOpen, Download, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

const CATEGORIES = ["IDENTITY", "PASSPORT", "CONTRACT", "PAYMENT_PROOF", "RECEIPT", "REFUND", "VISA", "FLIGHT", "INVOICE", "COMPANY", "LEGAL", "TAX", "EMPLOYEE", "VENDOR", "OTHER"];

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DrivePage({ searchParams }: { searchParams: { category?: string; q?: string } }) {
  const user = await requireUser();
  if (!can(user, "FILE_READ")) redirect("/app/forbidden");
  const canUpload = can(user, "FILE_UPLOAD");
  const canDelete = can(user, "FILE_DELETE");

  const category = searchParams.category && CATEGORIES.includes(searchParams.category) ? searchParams.category : undefined;
  const q = (searchParams.q ?? "").trim();

  const [files, clients, cases] = await Promise.all([
    prisma.file.findMany({
      where: {
        isVault: false,
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

  return (
    <div>
      <PageHeader title="Drive" subtitle="Company file library. Files are private and served through authenticated, short-lived links." />

      {canUpload ? (
        <Card className="mb-6">
          <CardHeader><CardTitle>Upload a file</CardTitle></CardHeader>
          <CardContent>
            <FileUploadForm
              action={uploadFile}
              categories={CATEGORIES}
              clients={clients.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName} (${c.internalId})` }))}
              cases={cases.map((c) => ({ id: c.id, label: `${c.caseNumber} — ${c.title}` }))}
            />
            <p className="mt-2 text-xs text-muted2">Max 15 MB. Allowed: PDF, images, Word, Excel, text/CSV.</p>
          </CardContent>
        </Card>
      ) : null}

      <form method="get" className="mb-4 flex flex-wrap gap-3">
        <input name="q" defaultValue={q} placeholder="Search by name…" className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-electric" />
        <select name="category" defaultValue={category ?? ""} className="h-10 rounded-lg border border-white/10 bg-night px-3 text-sm outline-none focus:border-electric">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {files.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No files" description={q || category ? "No files match these filters." : "Upload the first file to start the company library."} />
      ) : (
        <Table>
          <THead><tr><TH>Name</TH><TH>Category</TH><TH>Linked to</TH><TH>Size</TH><TH>Uploaded</TH><TH>By</TH><TH></TH></tr></THead>
          <tbody>
            {files.map((f) => (
              <TR key={f.id}>
                <TD>
                  <a href={`/api/files/${f.id}`} className="font-medium hover:text-electric" target="_blank" rel="noreferrer">{f.name}</a>
                  <div className="text-xs text-muted2">{f.mimeType}</div>
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
    </div>
  );
}
