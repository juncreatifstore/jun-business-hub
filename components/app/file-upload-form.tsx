"use client";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Select, Field, Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";

function VaultSubmitBtn() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="primary" disabled={pending}><UploadCloud className="mr-2 h-4 w-4" />{pending ? "Uploading…" : "Upload"}</Button>;
}

function humanBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function xhrUpload(url: string, file: File, mode: "supabase-signed" | "google-resumable", mimeType: string, onProgress: (loaded: number, total: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded, event.total); };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage upload failed (${xhr.status})`));
    };
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

export function FileUploadForm({
  action,
  isVault = false,
  folderId,
  categories,
  vaultCategories,
  clients,
  cases,
}: {
  action: (formData: FormData) => Promise<void>;
  isVault?: boolean;
  folderId?: string | null;
  categories: string[];
  vaultCategories?: readonly string[];
  clients?: { id: string; label: string }[];
  cases?: { id: string; label: string }[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "finalizing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function directSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (isVault) return;
    event.preventDefault();
    if (uploading) return;
    const form = event.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) { setStatus("error"); setMessage("Choose a file first."); return; }

    setUploading(true); setProgress(0); setLoaded(0); setTotal(file.size); setSpeed(0); setStatus("uploading"); setMessage("Preparing secure direct upload…");
    const started = performance.now();
    try {
      const init = await fetch("/api/drive/uploads/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type,
          category: String(fd.get("category") || "OTHER"),
          folderId: String(fd.get("folderId") || "") || null,
          clientId: String(fd.get("clientId") || "") || null,
          caseId: String(fd.get("caseId") || "") || null,
        }),
      });
      const initBody = await init.json();
      if (!init.ok) throw new Error(String(initBody.error || "Unable to initialize upload"));

      const mode = initBody.mode as "supabase-signed" | "google-resumable";
      setMessage(mode === "google-resumable" ? "Uploading directly to Google Workspace…" : "Uploading directly to secure storage…");
      await xhrUpload(String(initBody.uploadUrl), file, mode, String(initBody.mimeType || file.type || "application/octet-stream"), (bytes, eventTotal) => {
        const elapsed = Math.max(0.25, (performance.now() - started) / 1000);
        setLoaded(bytes); setTotal(file.size || eventTotal); setProgress(Math.min(99, Math.round((bytes / Math.max(1, eventTotal)) * 100))); setSpeed(bytes / elapsed);
      });

      setProgress(100); setLoaded(file.size); setStatus("finalizing"); setMessage("Upload complete. Registering file in JUN Drive…");
      const finalize = await fetch("/api/drive/uploads/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: initBody.uploadId }) });
      const finalBody = await finalize.json();
      if (!finalize.ok) throw new Error(String(finalBody.error || "Unable to finalize upload"));

      setStatus("done"); setMessage(`${file.name} uploaded successfully.`);
      void fetch("/api/drive/uploads/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: finalBody.fileId }), keepalive: true }).catch(() => undefined);
      const destination = folderId ? `/app/drive?folder=${encodeURIComponent(folderId)}&toast=${encodeURIComponent("File uploaded")}` : `/app/drive?toast=${encodeURIComponent("File uploaded")}`;
      window.setTimeout(() => window.location.assign(destination), 350);
    } catch (error) {
      setStatus("error"); setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={isVault ? action : undefined} onSubmit={isVault ? undefined : directSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="isVault" value={isVault ? "1" : "0"} />
      {!isVault ? <input type="hidden" name="folderId" value={folderId ?? ""} /> : null}
      <div className="lg:col-span-2">
        <Field label="File">
          <Input ref={fileRef} type="file" name="file" required accept={isVault ? undefined : "audio/*,video/*,image/*,.pdf,.txt,.csv,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx"} className="file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-sm file:text-white" />
        </Field>
        {!isVault ? <p className="mt-1 text-[11px] text-muted2">Audio, video, PDF, images and Office files · direct upload up to 2 GB.</p> : null}
      </div>
      {isVault && vaultCategories ? (
        <Field label="Vault category"><Select name="vaultCategory" required>{vaultCategories.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
      ) : (
        <Field label="Category"><Select name="category" defaultValue="OTHER">{categories.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</Select></Field>
      )}
      {!isVault && clients ? <Field label="Link to client (optional)"><Select name="clientId" defaultValue=""><option value="">— None —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field> : null}
      {!isVault && cases ? <Field label="Link to case (optional)"><Select name="caseId" defaultValue=""><option value="">— None —</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field> : null}
      <div className="flex items-end">{isVault ? <VaultSubmitBtn /> : <Button type="submit" variant="primary" disabled={uploading}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}{uploading ? "Uploading…" : "Upload"}</Button>}</div>

      {!isVault && status !== "idle" ? <div className="md:col-span-2 lg:col-span-4 rounded-xl border border-line bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs"><div className="flex min-w-0 items-center gap-2">{status === "done" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : status === "error" ? <XCircle className="h-4 w-4 shrink-0 text-red-600" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-electric" />}<span className={status === "error" ? "truncate text-red-700" : "truncate text-ink"}>{message}</span></div><strong>{progress}%</strong></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-surface"><div className={`h-full rounded-full transition-[width] duration-200 ${status === "error" ? "bg-red-500" : "bg-electric"}`} style={{ width: `${progress}%` }} /></div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-muted2"><span>{humanBytes(loaded)} / {humanBytes(total)}</span><span>{speed > 0 ? `${humanBytes(speed)}/s` : "Preparing…"}</span></div>
      </div> : null}
    </form>
  );
}
