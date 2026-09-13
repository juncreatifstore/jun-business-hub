import Link from "next/link";
import { FilePlus2, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TemplateRow = {
  id: string;
  name: string;
  type: string;
  category: string | null;
  language: string | null;
};

/** Quick launcher: generate a document from a template, pre-filled with the client's extracted data. */
export async function GenerateDocumentCard({
  clientId,
  caseId,
  caseType,
}: {
  clientId: string;
  caseId?: string | null;
  caseType?: string | null;
}) {
  const templates = await prisma.$queryRaw<TemplateRow[]>`
      SELECT id, name, type::text AS type, category, language
      FROM "DocumentTemplate"
      WHERE "isActive" = true AND COALESCE("isReference", false) = false
      ORDER BY name ASC
    `.catch(() => [] as TemplateRow[]);
  if (!templates.length) return null;
  const kw = (caseType ?? "").toLowerCase();
  const score = (t: TemplateRow) => {
    const n = `${t.name} ${t.category ?? ""}`.toLowerCase();
    let s = 0;
    if (kw && n.split(/\W+/).some((w) => w.length > 3 && kw.includes(w))) s += 2;
    if (/invitation|attestation|lettre|letter|contrat|contract|facture|invoice|procuration/.test(n)) s += 1;
    return s;
  };
  const top = [...templates].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, 6);
  const params = (t?: TemplateRow) =>
    `/app/documents/new?clientId=${clientId}${caseId ? `&caseId=${caseId}` : ""}${t ? `&templateId=${t.id}&type=${encodeURIComponent(t.type)}` : ""}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <FilePlus2 className="h-4 w-4" /> Generate a document
        </CardTitle>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted2">
          <Sparkles className="h-3 w-3" /> pre-filled from the client’s documents
        </span>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {top.map((t) => (
            <Link
              key={t.id}
              prefetch={false}
              href={params(t)}
              className="rounded-lg border border-line px-3 py-2 text-sm hover:border-electric/40 hover:bg-surface"
            >
              <div className="truncate font-medium">{t.name}</div>
              <div className="text-[11px] text-muted2">
                {[t.category, t.language, t.type].filter(Boolean).join(" · ")}
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted2">
          <span>
            Passport number, dates, employer, trip… are filled automatically when the pieces are on file.
          </span>
          <Link prefetch={false} href={params()} className="text-electric hover:underline">
            All templates →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
