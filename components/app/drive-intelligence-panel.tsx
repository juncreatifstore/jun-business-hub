"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Search, Tags, Users, Building2, CalendarDays, Lightbulb, CopyCheck, Sparkles, FileText, Target, Eye, ListChecks, TriangleAlert, CircleHelp } from "lucide-react";
import { analyzeDriveFile, saveDriveTags, acceptDriveSuggestedCategory } from "@/services/drive-intelligence";

type Intel = {
  summary?: string;
  detailedDescription?: string;
  documentPurpose?: string;
  visualDescription?: string;
  language?: string;
  suggestedCategory?: string;
  tags?: string[];
  people?: string[];
  organizations?: string[];
  importantDates?: string[];
  keyFacts?: string[];
  actionItems?: string[];
  risks?: string[];
  missingInformation?: string[];
  indexedAt?: string;
  aiAnalyzedAt?: string;
};
type IntelligenceResponse = {
  currentCategory: string;
  intelligence: Intel | null;
  manualTags: string[];
  duplicateOf: string | null;
  duplicateFile: { id: string; name: string } | null;
};

const box = "rounded-lg border border-line bg-surface p-3";

export function DriveIntelligencePanel({ fileId, returnTo }: { fileId: string; returnTo: string }) {
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [error, setError] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/files/${fileId}/intelligence`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((v) => { if (active) setData(v); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [fileId]);

  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true); setAnswer("");
    try {
      const res = await fetch(`/api/files/${fileId}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const body = await res.json();
      setAnswer(res.ok ? String(body.answer ?? "No answer") : String(body.error ?? "Request failed"));
    } catch { setAnswer("The AI request could not be completed."); }
    finally { setAsking(false); }
  }

  const intel = data?.intelligence;
  const suggestionDifferent = Boolean(intel?.suggestedCategory && data?.currentCategory && intel.suggestedCategory !== data.currentCategory);

  return (
    <section className="mb-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><BrainCircuit className="h-4 w-4 text-electric" /> File Intelligence</h3><p className="mt-1 text-xs text-muted2">Detailed internal AI analysis for documents, PDFs and images. Suggestions never modify official data automatically.</p></div>
        <form action={analyzeDriveFile.bind(null, fileId)}><input type="hidden" name="returnTo" value={returnTo} /><button className="inline-flex items-center gap-2 rounded-lg bg-electric px-3 py-2 text-xs font-medium text-white"><Sparkles className="h-3.5 w-3.5" /> Analyze deeply with AI</button></form>
      </div>

      {error ? <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">File intelligence could not be loaded.</p> : !data ? <p className="text-xs text-muted2">Loading intelligence…</p> : (
        <div className="space-y-3">
          {data.duplicateFile ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><div className="flex items-center gap-2 font-semibold"><CopyCheck className="h-4 w-4" /> Possible exact duplicate detected</div><p className="mt-1">Same file content as “{data.duplicateFile.name}”.</p></div> : null}

          <RichText icon={FileText} title="Executive summary" value={intel?.summary} fallback="No AI report yet. Click Analyze deeply with AI." />
          {intel?.detailedDescription ? <RichText icon={BrainCircuit} title="Detailed explanation" value={intel.detailedDescription} /> : null}
          {intel?.documentPurpose ? <RichText icon={Target} title="Purpose / operational use" value={intel.documentPurpose} /> : null}
          {intel?.visualDescription ? <RichText icon={Eye} title="Visual description" value={intel.visualDescription} /> : null}

          {intel?.suggestedCategory ? <div className={box}><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Category suggestion</div><div className="mt-1 text-sm font-medium text-ink">{intel.suggestedCategory.replace(/_/g, " ")} <span className="text-xs font-normal text-muted2">· current: {data.currentCategory.replace(/_/g, " ")}</span></div></div>{suggestionDifferent ? <form action={acceptDriveSuggestedCategory.bind(null, fileId)}><input type="hidden" name="returnTo" value={returnTo} /><button className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium text-ink hover:bg-surface">Accept suggestion</button></form> : <span className="text-xs text-emerald-700">Matches current category</span>}</div>{intel.language ? <p className="mt-2 text-xs text-muted2">Detected language: {intel.language}</p> : null}</div> : null}

          <div className={box}><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted2"><Tags className="h-3.5 w-3.5" /> Tags</div>{intel?.tags?.length ? <div className="mb-3 flex flex-wrap gap-1.5">{intel.tags.map((t) => <span key={t} className="rounded-full bg-blue-100 px-2 py-1 text-[11px] text-blue-800">{t}</span>)}</div> : null}<form action={saveDriveTags.bind(null, fileId)} className="flex gap-2"><input type="hidden" name="returnTo" value={returnTo} /><input name="tags" defaultValue={data.manualTags.join(", ")} placeholder="Manual tags, comma separated" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-xs text-ink outline-none focus:border-electric" /><button className="rounded-lg border border-line bg-white px-3 text-xs text-ink">Save</button></form></div>

          <div className="grid gap-3 md:grid-cols-2">
            <IntelList icon={Users} title="People named in file" values={intel?.people} />
            <IntelList icon={Building2} title="Organizations" values={intel?.organizations} />
            <IntelList icon={CalendarDays} title="Important dates" values={intel?.importantDates} />
            <IntelList icon={Lightbulb} title="Key facts" values={intel?.keyFacts} />
            <IntelList icon={ListChecks} title="Recommended actions" values={intel?.actionItems} />
            <IntelList icon={TriangleAlert} title="Risks / points to verify" values={intel?.risks} />
            <IntelList icon={CircleHelp} title="Missing / unclear information" values={intel?.missingInformation} wide />
          </div>

          <div className={box}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><Search className="h-4 w-4" /> Ask this file</div>
            <div className="flex gap-2"><input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void ask(); } }} placeholder="Example: Which dates require attention?" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-electric" /><button type="button" onClick={() => void ask()} disabled={!question.trim() || asking} className="rounded-lg bg-electric px-3 text-sm font-medium text-white disabled:opacity-50">{asking ? "Asking…" : "Ask"}</button></div>
            {answer ? <div className="mt-3 whitespace-pre-wrap rounded-lg border border-line bg-white p-3 text-sm text-ink">{answer}</div> : null}
          </div>

          <p className="text-[11px] text-muted2">Indexed: {intel?.indexedAt ? new Date(intel.indexedAt).toLocaleString() : "not yet"}{intel?.aiAnalyzedAt ? ` · AI analyzed: ${new Date(intel.aiAnalyzedAt).toLocaleString()}` : ""}</p>
        </div>
      )}
    </section>
  );
}

function RichText({ icon: Icon, title, value, fallback = "" }: { icon: typeof FileText; title: string; value?: string; fallback?: string }) {
  return <div className={box}><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted2"><Icon className="h-3.5 w-3.5" /> {title}</div><p className="whitespace-pre-wrap text-sm leading-6 text-ink">{value || fallback}</p></div>;
}

function IntelList({ icon: Icon, title, values, wide = false }: { icon: typeof Users; title: string; values?: string[]; wide?: boolean }) {
  return <div className={`${box} ${wide ? "md:col-span-2" : ""}`}><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted2"><Icon className="h-3.5 w-3.5" /> {title}</div>{values?.length ? <ul className="space-y-1.5 text-xs leading-5 text-ink">{values.map((v, i) => <li key={`${v}-${i}`}>• {v}</li>)}</ul> : <p className="text-xs text-muted2">No extracted data.</p>}</div>;
}
