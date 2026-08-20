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
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <Link href={`/app/editor/${doc.id}`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /></Link>
          <div><h1 className="text-base font-semibold text-slate-900">Split document</h1><p className="text-xs text-slate-500">{doc.title} · {pages.length} page(s). Selected pages become independent DRAFT documents.</p></div>
        </div>
      </div>

      <form action={splitDocument.bind(null, doc.id)} className="mx-auto max-w-6xl p-5">
        {searchParams?.error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div> : null}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-sm font-semibold text-slate-800">Title prefix</label>
          <Input name="titlePrefix" maxLength={120} defaultValue={doc.title} className="mt-2" />
          <p className="mt-2 text-xs text-slate-500">Each selected page will be created as “Title — Page N”. The source document remains unchanged.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pages.map((page, index) => <label key={page.id} className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-400">
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">Page {index + 1}</span><input type="checkbox" name="pageIndexes" value={index} className="h-4 w-4" /></div>
            <div className="aspect-[0.72] overflow-hidden rounded border border-slate-200 bg-white p-3 text-[8px] leading-3 text-slate-500"><div className="origin-top-left scale-[0.42] w-[238%]" dangerouslySetInnerHTML={{ __html: page.html }} /></div>
            <p className="mt-2 text-xs text-slate-400">Rotation {page.rotation}°</p>
          </label>)}
        </div>

        <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t border-slate-200 bg-slate-100/95 py-4 backdrop-blur">
          <Link href={`/app/editor/${doc.id}`}><Button type="button" variant="outline">Cancel</Button></Link>
          <Button type="submit" variant="primary"><Scissors className="mr-1.5 h-4 w-4" />Split selected pages</Button>
        </div>
      </form>
    </div>
  );
}
