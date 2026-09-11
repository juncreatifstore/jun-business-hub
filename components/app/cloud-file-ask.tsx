"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";

export function CloudFileAsk({ provider, fileId }: { provider: string; fileId: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch(`/api/drive/cloud/${provider}/file/${encodeURIComponent(fileId)}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok) setError(data.error ?? "AI request failed");
      else setAnswer(data.answer ?? "");
    } catch {
      setError("AI request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? ask() : undefined)}
          placeholder="Ask JUN AI about this file…"
          className="h-9 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-electric"
        />
        <button
          type="button"
          onClick={ask}
          disabled={busy || !question.trim()}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-electric px-3 text-xs font-medium text-white disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" /> {busy ? "Thinking…" : "Ask"}
        </button>
      </div>
      {error ? <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
      {answer ? (
        <div className="whitespace-pre-wrap rounded-lg bg-surface p-3 text-sm leading-6">{answer}</div>
      ) : null}
      <p className="text-[11px] text-muted2">
        The file is read on the fly from your cloud drive; nothing is copied into JUN Drive.
      </p>
    </div>
  );
}
