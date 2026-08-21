"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function RefundInstallmentProofUpload({ refundId, installmentId, clientId, caseId }: { refundId: string; installmentId: string; clientId: string; caseId?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fd = new FormData(event.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true); setState("uploading"); setProgress(0); setMessage("Preparing installment proof…");
    try {
      const init = await fetch("/api/drive/uploads/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, sizeBytes: file.size, mimeType: file.type, category: "REFUND", clientId, caseId: caseId || null, refundId, refundInstallmentId: installmentId }),
      });
      const initBody = await init.json();
      if (!init.ok) throw new Error(String(initBody.error || "Unable to initialize proof upload"));
      setMessage("Uploading proof to JUN Drive…");
      await uploadToStorage(String(initBody.uploadUrl), file, initBody.mode, String(initBody.mimeType || file.type || "application/octet-stream"), (loaded, total) => setProgress(Math.min(99, Math.round((loaded / Math.max(1, total)) * 100))));
      const finalize = await fetch("/api/drive/uploads/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: initBody.uploadId }) });
      const finalBody = await finalize.json();
      if (!finalize.ok) throw new Error(String(finalBody.error || "Unable to register proof"));
      setProgress(100); setState("done"); setMessage("Installment proof attached.");
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setState("error"); setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="space-y-2">
    <Input type="file" name="file" required accept="image/*,.pdf" />
    <div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" variant="outline" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}Upload payout proof</Button>{state !== "idle" ? <span className={`flex items-center gap-1 text-xs ${state === "error" ? "text-red-700" : "text-muted2"}`}>{state === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : state === "error" ? <XCircle className="h-4 w-4" /> : null}{message} {state === "uploading" ? `${progress}%` : ""}</span> : null}</div>
  </form>;
}
