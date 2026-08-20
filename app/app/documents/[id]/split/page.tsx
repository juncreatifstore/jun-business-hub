import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Scissors } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDocumentPages } from "@/lib/document-pages";
import { splitDocument } from "@/services/document-combine-split";

export const dynamic = "force-dynamic";

export default async function SplitPage({ params, searchParams }: { params: { id: string }; searchParams?: { error?: string } }) {
  await requirePermission("DOCUMENT_CREATE");
  const doc = await prisma.document.findUnique({ where: { id: params.id }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!doc || !doc.versions[0]) notFound();
  const pages = parseDocumentPages(doc.versions[0].content);

  return (
    <div>
      <div className="mb-4"><Link href={`/app/documents/${doc.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted2 hover:text-electric"><ArrowLeft className="h-4 w-4" />Back to document</Link></div>
      <div className="mb-6"><h1 className="text-xl font-semibold">Split document</h1><p className="mt-1 text-sm text-muted2">{doc.title} · {pages.length} page(s). Selected pages become independent DRAFT documents.</p></div>

      <form action={splitDocument.bind(null, doc.id)} className="max-w-6xl">
        {searchParams?.error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div> : null}
        <div className="mb-4 rounded-xl border border-line bg-white p-4">
          <label className="text-sm font-semibold">Title prefix</label>
          <Input name="titlePrefix" maxLength={120} defaultValue={doc.title} className="mt-2" />
          <p className="mt-2 text-xs text-muted2">Each selected page is created as “Title — Page N”. The source document remains unchanged.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pages.map((page, index) => <label key={page.id} className="cursor-pointer rounded-xl border border-line bg-white p-3 transition hover:border-electric/50">
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Page {index + 1}</span><input type="checkbox" name="pageIndexes" value={index} className="h-4 w-4" /></div>
            <div className="aspect-[0.72] overflow-hidden rounded border border-line bg-white p-3 text-[8px] leading-3 text-muted2"><div className="origin-top-left scale-[0.42] w-[238%]" dangerouslySetInnerHTML={{ __html: page.html }} /></div>
            <p className="mt-2 text-xs text-muted2">Rotation {page.rotation}°</p>
          </label>)}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Link href={`/app/documents/${doc.id}`}><Button type="button" variant="outline">Cancel</Button></Link>
          <Button type="submit" variant="primary"><Scissors className="mr-1.5 h-4 w-4" />Split selected pages</Button>
        </div>
      </form>
    </div>
  );
}
