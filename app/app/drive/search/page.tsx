import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { DRIVE_INTEL_PREFIX, DRIVE_TAGS_PREFIX } from "@/lib/drive-intelligence";
import { reindexDriveLibrary } from "@/services/drive-search";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrainCircuit, Search, FileText, ArrowLeft, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

const STOP = new Set(["the", "a", "an", "de", "des", "du", "la", "le", "les", "un", "une", "et", "pour", "dans", "of", "for", "with", "avec", "find", "trouve", "chercher", "recherche"]);

function tokens(q: string) {
  return q.toLowerCase().split(/[^\p{L}\p{N}]+/u).map((v) => v.trim()).filter((v) => v.length >= 2 && !STOP.has(v)).slice(0, 8);
}

export default async function DriveSmartSearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await requireUser();
  if (!can(user, "FILE_READ")) redirect("/app/forbidden");
  const q = String(searchParams.q ?? "").trim().slice(0, 200);
  const queryTokens = tokens(q);

  let results: Array<{ id: string; name: string; category: string; mimeType: string; createdAt: Date; client: { firstName: string; lastName: string } | null; case: { caseNumber: string } | null; score: number; excerpt: string }> = [];

  if (q) {
    const settingMatches = await prisma.appSetting.findMany({
      where: {
        OR: [
          { key: { startsWith: DRIVE_INTEL_PREFIX }, value: { contains: q, mode: "insensitive" } },
          { key: { startsWith: DRIVE_TAGS_PREFIX }, value: { contains: q, mode: "insensitive" } },
          ...queryTokens.flatMap((t) => [
            { key: { startsWith: DRIVE_INTEL_PREFIX }, value: { contains: t, mode: "insensitive" as const } },
            { key: { startsWith: DRIVE_TAGS_PREFIX }, value: { contains: t, mode: "insensitive" as const } },
          ]),
        ],
      },
      take: 1000,
      select: { key: true, value: true },
    });

    const scoreMap = new Map<string, { score: number; excerpt: string }>();
    for (const s of settingMatches) {
      const prefix = s.key.startsWith(DRIVE_INTEL_PREFIX) ? DRIVE_INTEL_PREFIX : DRIVE_TAGS_PREFIX;
      const id = s.key.slice(prefix.length);
      const hay = s.value.toLowerCase();
      let score = hay.includes(q.toLowerCase()) ? 8 : 0;
      for (const t of queryTokens) if (hay.includes(t)) score += 2;
      let excerpt = "";
      if (prefix === DRIVE_INTEL_PREFIX) {
        try {
          const parsed = JSON.parse(s.value) as { summary?: string; contentExcerpt?: string };
          excerpt = parsed.summary || parsed.contentExcerpt?.slice(0, 220) || "";
        } catch {}
      }
      const old = scoreMap.get(id);
      if (!old || score > old.score) scoreMap.set(id, { score, excerpt });
    }

    const metadataFiles = await prisma.file.findMany({
      where: { isVault: false, archivedAt: null, OR: [
        { name: { contains: q, mode: "insensitive" } },
        ...queryTokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })),
      ] },
      take: 100,
      select: { id: true },
    });
    for (const f of metadataFiles) {
      const old = scoreMap.get(f.id);
      scoreMap.set(f.id, { score: Math.max(old?.score ?? 0, 6), excerpt: old?.excerpt ?? "" });
    }

    const ids = [...scoreMap.keys()].slice(0, 200);
    if (ids.length) {
      const files = await prisma.file.findMany({
        where: { id: { in: ids }, isVault: false, archivedAt: null },
        include: { client: { select: { firstName: true, lastName: true } }, case: { select: { caseNumber: true } } },
      });
      results = files.map((f) => ({ ...f, score: scoreMap.get(f.id)?.score ?? 0, excerpt: scoreMap.get(f.id)?.excerpt ?? "" })).sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 100);
    }
  }

  return (
    <div>
      <div className="mb-5"><Link href="/app/drive" className="inline-flex items-center gap-2 text-sm text-muted2 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Back to Drive</Link></div>
      <PageHeader title="Drive Smart Search" subtitle="Search file names, indexed text, AI summaries and tags. Vault content is never included." />

      <Card className="mb-6"><CardContent className="pt-6"><form method="get" className="flex flex-wrap gap-3"><div className="relative min-w-[280px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted2" /><input name="q" defaultValue={q} placeholder="Try: contracts Carlos, visa Colombia, receipts July…" className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink outline-none focus:border-electric" /></div><Button type="submit">Search</Button></form><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted2">Natural-language search uses indexed keywords and AI-generated document metadata. Open a file in Manage to analyze it with AI.</p>{can(user, "FILE_UPLOAD") ? <form action={reindexDriveLibrary}><Button type="submit" variant="secondary" size="sm"><RefreshCw className="mr-2 h-4 w-4" /> Index library</Button></form> : null}</div></CardContent></Card>

      {!q ? <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center"><BrainCircuit className="mx-auto mb-3 h-8 w-8 text-electric" /><h2 className="font-semibold">Search your Drive intelligently</h2><p className="mt-2 text-sm text-muted2">Search by people, company, date, subject, category, tag or words contained in indexable documents.</p></div> : results.length === 0 ? <div className="rounded-xl border border-line bg-white p-8 text-center"><p className="font-medium">No matching files</p><p className="mt-2 text-sm text-muted2">Run “Index library” if these files were uploaded before Phase 6, or analyze the document from Manage file.</p></div> : <div className="space-y-3">{results.map((f) => <Link key={f.id} href={`/app/drive?q=${encodeURIComponent(f.name)}`} className="block rounded-xl border border-line bg-white p-4 transition hover:border-electric/40 hover:shadow-sm"><div className="flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-electric"><FileText className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-ink">{f.name}</h3><span className="rounded-full bg-surface px-2 py-1 text-[10px] text-muted2">{f.category.replace(/_/g, " ")}</span><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] text-blue-700">score {f.score}</span></div><p className="mt-1 text-xs text-muted2">{f.client ? `${f.client.firstName} ${f.client.lastName} · ` : ""}{f.case ? `${f.case.caseNumber} · ` : ""}{new Date(f.createdAt).toLocaleDateString()}</p>{f.excerpt ? <p className="mt-2 line-clamp-2 text-sm text-muted2">{f.excerpt}</p> : null}</div></div></Link>)}</div>}
    </div>
  );
}
