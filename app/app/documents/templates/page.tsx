import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TEMPLATE_CATEGORIES, type DocumentTemplateRow } from "@/lib/document-templates";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BookOpen, FileStack, Library, Search, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

const categoryLabels = new Map<string, string>(TEMPLATE_CATEGORIES as unknown as [string,string][]);

export default async function TemplateLibraryPage({ searchParams }: { searchParams?: { q?: string; category?: string; language?: string; state?: string } }) {
  await requirePermission("DOCUMENT_READ");
  const q = String(searchParams?.q ?? "").trim().toLowerCase();
  const category = String(searchParams?.category ?? "");
  const language = String(searchParams?.language ?? "");
  const state = String(searchParams?.state ?? "all");

  const rows = await prisma.$queryRaw<DocumentTemplateRow[]>`
    SELECT id,name,type::text AS type,content,category,language,description,variables,"isActive","isReference","sourceRef","createdById","createdAt","updatedAt"
    FROM "DocumentTemplate"
    ORDER BY "isReference" ASC,"isActive" DESC,name ASC
  `;

  const filtered = rows.filter((t) => {
    if (q && !`${t.name} ${t.description ?? ""} ${t.type} ${categoryLabels.get(t.category) ?? t.category}`.toLowerCase().includes(q)) return false;
    if (category && t.category !== category) return false;
    if (language && t.language !== language) return false;
    if (state === "active" && !t.isActive) return false;
    if (state === "inactive" && (t.isActive || t.isReference)) return false;
    if (state === "reference" && !t.isReference) return false;
    return true;
  });

  const active = rows.filter((t) => t.isActive).length;
  const reference = rows.filter((t) => t.isReference).length;
  const editable = rows.filter((t) => !t.isReference).length;
  const variableTemplates = rows.filter((t) => Array.isArray(t.variables) && t.variables.length > 0).length;

  const hrefFor = (changes: Record<string,string>) => {
    const p = new URLSearchParams();
    const next = { q, category, language, state, ...changes };
    for (const [k,v] of Object.entries(next)) if (v && !(k === "state" && v === "all")) p.set(k,v);
    return `/app/documents/templates${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div>
      <PageHeader title="Template Library" subtitle="Reusable JUN document templates, dynamic variables, and the administrative reference catalog." />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/app/documents"><Button variant="outline">Back to Documents</Button></Link>
        <Link href="/app/documents/templates/new"><Button variant="primary">New template</Button></Link>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4"><Library className="h-5 w-5 text-electric" /><div><p className="text-2xl font-semibold">{active}</p><p className="text-xs text-muted2">Active templates</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><FileStack className="h-5 w-5 text-electric" /><div><p className="text-2xl font-semibold">{editable}</p><p className="text-xs text-muted2">Editable templates</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><BookOpen className="h-5 w-5 text-electric" /><div><p className="text-2xl font-semibold">{reference}</p><p className="text-xs text-muted2">Reference catalog</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Sparkles className="h-5 w-5 text-electric" /><div><p className="text-2xl font-semibold">{variableTemplates}</p><p className="text-xs text-muted2">With variables</p></div></CardContent></Card>
      </div>

      <form className="mb-5 grid gap-3 rounded-xl border border-line bg-white p-4 lg:grid-cols-[minmax(260px,1fr)_260px_140px_160px_auto]">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted2" /><input name="q" defaultValue={q} placeholder="Search template, type, category…" className="h-10 w-full rounded-lg border border-line pl-9 pr-3 text-sm outline-none focus:border-electric" /></div>
        <select name="category" defaultValue={category} className="h-10 rounded-lg border border-line px-3 text-sm"><option value="">All categories</option>{TEMPLATE_CATEGORIES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select name="language" defaultValue={language} className="h-10 rounded-lg border border-line px-3 text-sm"><option value="">All languages</option><option>FR</option><option>EN</option><option>ES</option><option>HT</option></select>
        <select name="state" defaultValue={state} className="h-10 rounded-lg border border-line px-3 text-sm"><option value="all">All states</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="reference">Reference</option></select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {[["all","All"],["active","Active"],["inactive","Inactive"],["reference","Reference"]].map(([key,label]) => <Link key={key} href={hrefFor({state:key})} className={`rounded-full border px-3 py-1.5 ${state === key ? "border-electric bg-electric/10 text-electric" : "border-line text-muted2 hover:bg-surface"}`}>{label}</Link>)}
      </div>

      <Table>
        <THead><tr><TH>Template</TH><TH>Category</TH><TH>Type</TH><TH>Lang</TH><TH>Variables</TH><TH>Status</TH><TH>Updated</TH></tr></THead>
        <tbody>
          {filtered.map((t) => (
            <TR key={t.id}>
              <TD><Link href={`/app/documents/templates/${t.id}`} className="font-medium hover:text-electric">{t.name}</Link>{t.description ? <p className="mt-0.5 max-w-md truncate text-xs text-muted2">{t.description}</p> : null}</TD>
              <TD className="text-muted2">{categoryLabels.get(t.category) ?? t.category}</TD>
              <TD className="text-muted2">{t.type.replaceAll("_"," ")}</TD>
              <TD>{t.language}</TD>
              <TD>{Array.isArray(t.variables) ? t.variables.length : 0}</TD>
              <TD>{t.isReference ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">REFERENCE</span> : t.isActive ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">ACTIVE</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">INACTIVE</span>}</TD>
              <TD className="text-muted2">{new Date(t.updatedAt).toLocaleDateString()}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
      {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted2">No templates match these filters.</div> : null}
    </div>
  );
}
