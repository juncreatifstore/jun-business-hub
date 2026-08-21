"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

function human(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function uploadToStorage(url: string, file: File, mode: "supabase-signed" | "google-resumable", mimeType: string, onProgress: (loaded: number, total: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded, event.total); };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage upload failed (${xhr.status})`));
    if (mode === "google-resumable") {
      xhr.setRequestHeader("Content-Type", mimeType);
      xhr.send(file);
    } else {
      const data = new FormData();
      data.append("cacheControl", "3600");
      data.append("", file);
      xhr.send(data);
    }
  });
}

export function RefundProofUpload({ refundId, clientId, caseId }: { refundId: string; clientId: string; caseId?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fd = new FormData(event.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true); setState("uploading"); setProgress(0); setLoaded(0); setTotal(file.size); setMessage("Preparing refund document…");
    try {
      const init = await fetch("/api/drive/uploads/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, sizeBytes: file.size, mimeType: file.type, category: "REFUND", clientId, caseId: caseId || null, refundId }),
      });
      const initBody = await init.json();
      if (!init.ok) throw new Error(String(initBody.error || "Unable to initialize document upload"));
      setMessage("Uploading directly to secure storage…");
      await uploadToStorage(String(initBody.uploadUrl), file, initBody.mode, String(initBody.mimeType || file.type || "application/octet-stream"), (bytes, eventTotal) => {
        setLoaded(bytes); setTotal(eventTotal); setProgress(Math.min(99, Math.round((bytes / Math.max(1, eventTotal)) * 100)));
      });
      const finalize = await fetch("/api/drive/uploads/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: initBody.uploadId }) });
      const finalBody = await finalize.json();
      if (!finalize.ok) throw new Error(String(finalBody.error || "Unable to register document"));
      setProgress(100); setLoaded(file.size); setState("done"); setMessage("Refund document attached.");
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setState("error"); setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="space-y-3">
    <Field label="Attach refund document"><Input type="file" name="file" required accept="image/*,.pdf,.doc,.docx" /></Field>
    <div className="flex items-center gap-3"><Button type="submit" variant="outline" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}Upload document</Button><span className="text-xs text-muted2">Proof, agreement or correspondence · JUN Drive</span></div>
    {state !== "idle" ? <div className="rounded-lg border border-line bg-surface p-3"><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className={`flex items-center gap-2 ${state === "error" ? "text-red-700" : "text-ink"}`}>{state === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : state === "error" ? <XCircle className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin text-electric" />}{message}</span><strong>{progress}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${state === "error" ? "bg-red-500" : "bg-electric"}`} style={{ width: `${progress}%` }} /></div><div className="mt-2 text-[11px] text-muted2">{human(loaded)} / {human(total)}</div></div> : null}
  </form>;
}
