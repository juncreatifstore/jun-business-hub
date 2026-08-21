"use client";

import { useState } from "react";
import { Bot, Loader2, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

const suggestions = [
  "What are the top finance risks right now?",
  "Which reconciliation issues should be handled first?",
  "Explain the 30-day cash forecast by currency.",
  "Which payment methods or accounts have the highest fees?",
];

export function FinanceAIAssistant() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<"ai" | "rules" | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(text?: string) {
    const prompt = (text ?? question).trim();
    if (!prompt || busy) return;
    setQuestion(prompt); setBusy(true); setError("");
    try {
      const response = await fetch("/api/finance/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(String(body.error || "Finance assistant unavailable"));
      setAnswer(String(body.answer || "No answer returned."));
      setMode(body.mode === "ai" ? "ai" : "rules");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finance assistant unavailable");
    } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <div className="flex items-center gap-2 text-sm font-medium"><Bot className="h-4 w-4 text-electric" />Finance Assistant</div>
    <div className="flex flex-wrap gap-2">{suggestions.map((item) => <button key={item} type="button" onClick={() => ask(item)} disabled={busy} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink hover:bg-white disabled:opacity-50">{item}</button>)}</div>
    <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={1200} placeholder="Ask about risk, reconciliation, fees, refunds or cash forecast…" />
    <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-1 text-[11px] text-muted2"><ShieldCheck className="h-3.5 w-3.5" />Read-only analysis. No money movement or approvals.</p><Button type="button" variant="primary" onClick={() => ask()} disabled={busy || !question.trim()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Ask Finance AI</Button></div>
    {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    {answer ? <div className="rounded-xl border border-line bg-surface p-4"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-medium uppercase tracking-wide text-muted2">Analysis</span><span className="rounded-full border border-line bg-white px-2 py-1 text-[10px] font-medium uppercase">{mode === "ai" ? "AI" : "Rules fallback"}</span></div><p className="whitespace-pre-wrap text-sm leading-6 text-ink">{answer}</p></div> : null}
  </div>;
}
