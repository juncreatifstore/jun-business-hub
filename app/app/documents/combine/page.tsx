import Link from "next/link";
import { ArrowLeft, Files, GripVertical } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { combineDocuments } from "@/services/document-combine-split";
import { parseDocumentPages } from "@/lib/document-pages";

export const dynamic = "force-dynamic";

export default async function CombinePage({ searchParams }: { searchParams?: { error?: string } }) {
  await requirePermission("DOCUMENT_CREATE");
  const docs = await prisma.document.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    take: 150,
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  return (
    <div>
      <div className="mb-4">
        <Link href="/app/documents" className="inline-flex items-center gap-2 text-sm font-medium text-muted2 hover:text-electric"><ArrowLeft className="h-4 w-4" />Back to Documents</Link>
      </div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Combine documents</h1>
        <p className="mt-1 text-sm text-muted2">Create a new DRAFT from multiple JUN documents. Source documents stay unchanged.</p>
      </div>

      <form action={combineDocuments} className="max-w-6xl">
        {searchParams?.error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div> : null}
        <div className="mb-4 rounded-xl border border-line bg-white p-4">
          <label className="text-sm font-semibold">Combined document title</label>
          <Input name="title" required maxLength={180} placeholder="Combined document" className="mt-2" />
          <p className="mt-2 text-xs text-muted2">Documents are combined in the order shown below. You can reorganize individual pages afterward.</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_120px_120px_110px] border-b border-line bg-surface px-3 py-3 text-xs font-semibold text-muted2"><span /><span>Document</span><span>Pages</span><span>Status</span><span>Version</span></div>
          {docs.map((doc) => {
            const version = doc.versions[0];
            const pageCount = version ? parseDocumentPages(version.content).length : 0;
            return <label key={doc.id} className="grid cursor-pointer grid-cols-[44px_minmax(0,1fr)_120px_120px_110px] items-center border-b border-line px-3 py-3 last:border-0 hover:bg-surface/70">
              <span className="flex items-center gap-2"><input type="checkbox" name="sourceIds" value={doc.id} className="h-4 w-4" /><GripVertical className="h-4 w-4 text-muted2" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{doc.title}</span><span className="registry-id text-[10px] text-muted2">{doc.documentId}</span></span>
              <span className="text-sm text-muted2">{pageCount}</span>
              <span><StatusBadge status={doc.status} /></span>
              <span className="text-sm text-muted2">v{version?.version ?? 0}</span>
            </label>;
          })}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Link href="/app/documents"><Button type="button" variant="outline">Cancel</Button></Link>
          <Button type="submit" variant="primary"><Files className="mr-1.5 h-4 w-4" />Combine selected</Button>
        </div>
      </form>
    </div>
  );
}
