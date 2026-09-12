"use client";
import { useState } from "react";
import { CheckCircle2, Loader2, UploadCloud } from "lucide-react";

type Item = { index: number; label: string; required: boolean; received: boolean; fileName: string | null };

export function RequestUploader({
  token,
  items,
  language,
}: {
  token: string;
  items: Item[];
  language: string;
}) {
  const fr = language === "fr";
  const [state, setState] = useState<
    Record<number, { status: "idle" | "busy" | "done" | "error"; name?: string; error?: string }>
  >(
    Object.fromEntries(
      items.map((i) => [
        i.index,
        i.received ? { status: "done", name: i.fileName ?? undefined } : { status: "idle" },
      ]),
    ),
  );
  const done = items.filter((i) => state[i.index]?.status === "done").length;

  async function upload(index: number, file: File) {
    setState((s) => ({ ...s, [index]: { status: "busy" } }));
    const fd = new FormData();
    fd.set("index", String(index));
    fd.set("file", file);
    try {
      const res = await fetch(`/api/r/${token}/upload`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        fileName?: string;
      };
      if (!res.ok || !data.ok)
        setState((s) => ({
          ...s,
          [index]: { status: "error", error: data.error ?? (fr ? "Échec de l’envoi" : "Upload failed") },
        }));
      else setState((s) => ({ ...s, [index]: { status: "done", name: data.fileName ?? file.name } }));
    } catch {
      setState((s) => ({
        ...s,
        [index]: { status: "error", error: fr ? "Échec de l’envoi" : "Upload failed" },
      }));
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="text-sm text-muted2">
        {done}/{items.length} {fr ? "reçu(s)" : "received"}
      </div>
      {items.map((i) => {
        const st = state[i.index] ?? { status: "idle" };
        return (
          <div
            key={i.index}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {i.label}
                {!i.required ? (
                  <span className="ml-2 text-xs font-normal text-muted2">
                    {fr ? "facultatif" : "optional"}
                  </span>
                ) : null}
              </div>
              {st.status === "done" ? (
                <div className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {st.name ?? (fr ? "Reçu" : "Received")}
                </div>
              ) : st.status === "error" ? (
                <div className="mt-0.5 text-xs text-red-700">{st.error}</div>
              ) : (
                <div className="mt-0.5 text-xs text-muted2">{fr ? "Photo ou PDF" : "Photo or PDF"}</div>
              )}
            </div>
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                st.status === "done"
                  ? "border border-line text-muted2 hover:bg-surface"
                  : "bg-electric text-white hover:opacity-90"
              }`}
            >
              {st.status === "busy" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              {st.status === "done"
                ? fr
                  ? "Remplacer"
                  : "Replace"
                : st.status === "busy"
                  ? fr
                    ? "Envoi…"
                    : "Uploading…"
                  : fr
                    ? "Déposer"
                    : "Upload"}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                disabled={st.status === "busy"}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(i.index, f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        );
      })}
      {done === items.length ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {fr
            ? "Merci ! Tous les documents ont été reçus. Notre équipe prend le relais."
            : "Thank you! All documents were received. Our team takes it from here."}
        </div>
      ) : null}
    </div>
  );
}
