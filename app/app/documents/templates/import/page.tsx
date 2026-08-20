import Link from "next/link";
import { ArrowLeft, FileUp, ShieldAlert } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { importAdministrativeTemplateCatalog } from "@/services/document-template-import";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ImportTemplateCatalogPage() {
  await requirePermission("DOCUMENT_CREATE");
  return (
    <div className="max-w-3xl">
      <Link href="/app/documents/templates" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted2 hover:text-electric"><ArrowLeft className="h-4 w-4" /> Back to Template Library</Link>
      <h1 className="text-2xl font-semibold">Import reference catalog</h1>
      <p className="mt-1 text-sm text-muted2">Import a numbered Markdown/text catalog into JUN as inactive reference entries.</p>

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Reference entries are not ready-to-use legal documents.</p><p className="mt-1">JUN imports the title, category and reference number only. Each entry stays inactive until someone converts it to an editable template, writes/reviews the content and explicitly activates it.</p></div></div>
      </div>

      <form action={importAdministrativeTemplateCatalog} className="mt-5 rounded-xl border border-line bg-white p-6">
        <label htmlFor="catalog" className="block text-sm font-medium">Markdown or text file</label>
        <input id="catalog" name="catalog" type="file" accept=".md,.txt,text/markdown,text/plain" required className="mt-2 block w-full rounded-lg border border-line bg-white p-3 text-sm" />
        <p className="mt-2 text-xs text-muted2">Expected format: section headings beginning with “## 1.” through “## 14.” and numbered entries like “1. Fiche de poste”. Duplicate source references are skipped automatically.</p>
        <Button type="submit" variant="primary" className="mt-5"><FileUp className="mr-1.5 h-4 w-4" />Import catalog</Button>
      </form>
    </div>
  );
}
