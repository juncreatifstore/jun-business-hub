"use client";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";

export function ComplementForm({
  token,
  language,
  message,
}: {
  token: string;
  language: string;
  message: string;
}) {
  const fr = language === "fr";
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/refund/${token}/complement`, {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) setError(data.error ?? (fr ? "Envoi impossible" : "Failed"));
      else setDone(true);
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {fr ? "Merci, votre complément a été transmis." : "Thank you, your reply was sent."}
      </div>
    );
  return (
    <form onSubmit={submit} className="mt-6 space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="text-sm font-semibold">
        {fr ? "Notre équipe a besoin d’un complément" : "Our team needs more information"}
      </div>
      <p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-sm">{message}</p>
      <textarea
        name="text"
        rows={4}
        required
        minLength={5}
        placeholder={fr ? "Votre réponse…" : "Your reply…"}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-electric"
      />
      <div>
        <label className="mb-1 block text-xs font-medium">
          {fr ? "Pièces jointes (photos ou PDF)" : "Attachments (photos or PDF)"}
        </label>
        <input
          name="files"
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="block w-full text-sm"
        />
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        disabled={busy}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-electric px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{" "}
        {fr ? "Envoyer le complément" : "Send reply"}
      </button>
    </form>
  );
}
