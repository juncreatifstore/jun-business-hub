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
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <Link href="/app/editor" className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /></Link>
          <div><h1 className="text-base font-semibold text-slate-900">Combine documents</h1><p className="text-xs text-slate-500">Create a new DRAFT from multiple JUN documents. Sources stay unchanged.</p></div>
        </div>
      </div>

      <form action={combineDocuments} className="mx-auto max-w-6xl p-5">
        {searchParams?.error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div> : null}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-sm font-semibold text-slate-800">Combined document title</label>
          <Input name="title" required maxLength={180} placeholder="Combined document" className="mt-2" />
          <p className="mt-2 text-xs text-slate-500">Documents are combined in the order shown below. After creation, use Page Manager to reorder individual pages.</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_120px_120px_110px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500"><span /><span>Document</span><span>Pages</span><span>Status</span><span>Version</span></div>
          {docs.map((doc) => {
            const version = doc.versions[0];
            const pageCount = version ? parseDocumentPages(version.content).length : 0;
            return <label key={doc.id} className="grid cursor-pointer grid-cols-[44px_minmax(0,1fr)_120px_120px_110px] items-center border-b border-slate-100 px-3 py-3 last:border-0 hover:bg-slate-50">
              <span className="flex items-center gap-2"><input type="checkbox" name="sourceIds" value={doc.id} className="h-4 w-4" /><GripVertical className="h-4 w-4 text-slate-300" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{doc.title}</span><span className="registry-id text-[10px] text-slate-400">{doc.documentId}</span></span>
              <span className="text-sm text-slate-600">{pageCount}</span>
              <span><StatusBadge status={doc.status} /></span>
              <span className="text-sm text-slate-500">v{version?.version ?? 0}</span>
            </label>;
          })}
        </div>

        <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t border-slate-200 bg-slate-100/95 py-4 backdrop-blur">
          <Link href="/app/editor"><Button type="button" variant="outline">Cancel</Button></Link>
          <Button type="submit" variant="primary"><Files className="mr-1.5 h-4 w-4" />Combine selected</Button>
        </div>
      </form>
    </div>
  );
}
