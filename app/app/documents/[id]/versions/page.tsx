import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, GitCompareArrows } from "lucide-react";

export const dynamic = "force-dynamic";

function textOnly(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/h[1-6]>|<\/li>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function wordSet(value: string) {
  return value.toLowerCase().split(/\s+/).filter(Boolean);
}

export default async function DocumentVersionsPage({ params, searchParams }: { params: { id: string }; searchParams?: { left?: string; right?: string } }) {
  await requirePermission("DOCUMENT_READ");
  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: { versions: { orderBy: { version: "desc" }, include: { author: true } } },
  });
  if (!doc) notFound();
  const versions = doc.versions;
  if (!versions.length) notFound();

  const left = versions.find((v) => v.id === searchParams?.left) ?? versions[Math.min(1, versions.length - 1)] ?? versions[0];
  const right = versions.find((v) => v.id === searchParams?.right) ?? versions[0];
  const leftText = textOnly(left.content);
  const rightText = textOnly(right.content);
  const leftWords = wordSet(leftText);
  const rightWords = wordSet(rightText);
  const leftFreq = new Map<string, number>();
  const rightFreq = new Map<string, number>();
  for (const w of leftWords) leftFreq.set(w, (leftFreq.get(w) ?? 0) + 1);
  for (const w of rightWords) rightFreq.set(w, (rightFreq.get(w) ?? 0) + 1);
  let added = 0;
  let removed = 0;
  for (const [w, n] of rightFreq) added += Math.max(0, n - (leftFreq.get(w) ?? 0));
  for (const [w, n] of leftFreq) removed += Math.max(0, n - (rightFreq.get(w) ?? 0));

  return (
    <div className="space-y-5">
      <Link href={`/app/documents/${doc.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted2 hover:text-electric"><ArrowLeft className="h-4 w-4" />Back to document</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="registry-id text-muted2">{doc.documentId}</p><h1 className="mt-1 flex items-center gap-2 text-xl font-semibold"><GitCompareArrows className="h-5 w-5" />Compare versions</h1><p className="mt-1 text-sm text-muted2">Compare immutable snapshots without changing document history.</p></div>
      </div>

      <form className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-[1fr_1fr_auto]" method="get">
        <label className="text-sm font-medium">Older / left version<select name="left" defaultValue={left.id} className="mt-1 block h-10 w-full rounded-lg border border-line bg-white px-3 text-sm">{versions.map((v) => <option key={v.id} value={v.id}>Version {v.version} · {v.status}</option>)}</select></label>
        <label className="text-sm font-medium">Newer / right version<select name="right" defaultValue={right.id} className="mt-1 block h-10 w-full rounded-lg border border-line bg-white px-3 text-sm">{versions.map((v) => <option key={v.id} value={v.id}>Version {v.version} · {v.status}</option>)}</select></label>
        <Button type="submit" variant="primary">Compare</Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs uppercase tracking-wider text-muted2">Left words</p><p className="mt-1 text-2xl font-semibold">{leftWords.length}</p></div>
        <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs uppercase tracking-wider text-muted2">Right words</p><p className="mt-1 text-2xl font-semibold">{rightWords.length}</p></div>
        <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs uppercase tracking-wider text-muted2">Approx. added</p><p className="mt-1 text-2xl font-semibold text-emerald-600">+{added}</p></div>
        <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs uppercase tracking-wider text-muted2">Approx. removed</p><p className="mt-1 text-2xl font-semibold text-red-600">-{removed}</p></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {[left, right].map((version, index) => (
          <section key={version.id} className="rounded-xl border border-line bg-white">
            <header className="border-b border-line px-4 py-3"><p className="font-semibold">{index === 0 ? "Left" : "Right"}: Version {version.version}</p><p className="text-xs text-muted2">{version.author.firstName} {version.author.lastName} · {version.createdAt.toLocaleString()} · {version.changeNote ?? "No change note"}</p></header>
            <div className="doc-prose max-h-[700px] overflow-auto p-5" dangerouslySetInnerHTML={{ __html: version.content }} />
          </section>
        ))}
      </div>
    </div>
  );
}
