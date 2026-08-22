"use client";

import { useState } from "react";
import { Bot, CheckCircle2, FileSearch2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findRefundProofCandidates, attachExistingDriveFileToRefund, type RefundProofCandidate } from "@/services/refund-proof-ai";

function confidence(score: number) {
  if (score >= 80) return "High confidence";
  if (score >= 55) return "Medium confidence";
  return "Possible match";
}

export function RefundProofAISearch({ refundId }: { refundId: string }) {
  const [busy, setBusy] = useState(false);
  const [attachBusy, setAttachBusy] = useState<string | null>(null);
  const [rows, setRows] = useState<RefundProofCandidate[] | null>(null);
  const [message, setMessage] = useState("");

  async function search() {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await findRefundProofCandidates(refundId);
      if (result.error) { setMessage(result.error); setRows([]); return; }
      setRows(result.candidates || []);
      if (!(result.candidates || []).length) setMessage("No likely proof found in this client&apos;s Drive.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI proof search failed.");
    } finally { setBusy(false); }
  }

  async function attach(fileId: string) {
    setAttachBusy(fileId); setMessage("");
    try {
      const result = await attachExistingDriveFileToRefund(refundId, fileId);
      if (result.error) { setMessage(result.error); return; }
      setRows((current) => current?.filter((x) => x.id !== fileId) || []);
      setMessage("Proof attached from Client Drive.");
      window.setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to attach proof.");
    } finally { setAttachBusy(null); }
  }

  return <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 font-medium"><Bot className="h-4 w-4 text-electric"/>AI — Find proof in Client Drive</div>
        <p className="mt-1 max-w-2xl text-xs text-muted2">Searches this client&apos;s Drive using payment reference, case, amount, date, file category and filename. AI suggests candidates only; a human must choose the file to attach.</p>
      </div>
      <Button type="button" variant="outline" onClick={search} disabled={busy}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileSearch2 className="mr-2 h-4 w-4"/>}{busy?"Searching…":"Search Client Drive"}</Button>
    </div>

    {message?<div className="mt-3 rounded-lg border border-line bg-white px-3 py-2 text-xs">{message}</div>:null}

    {rows && rows.length>0?<div className="mt-4 space-y-2">{rows.map((file)=><div key={file.id} className="rounded-lg border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium">{file.name}</span><span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-medium">{file.score}% · {confidence(file.score)}</span></div>
          <div className="mt-1 text-[11px] text-muted2">{file.category}{file.paymentReference?` · ${file.paymentReference}`:""}{file.caseLabel?` · ${file.caseLabel}`:""}</div>
          <div className="mt-1 text-xs text-muted2">Why: {file.reason}</div>
        </div>
        <div className="flex shrink-0 gap-2"><a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer"><Button type="button" variant="outline">Open</Button></a><Button type="button" variant="primary" onClick={()=>attach(file.id)} disabled={attachBusy===file.id}>{attachBusy===file.id?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<CheckCircle2 className="mr-2 h-4 w-4"/>}Attach as proof</Button></div>
      </div>
    </div>)}</div>:null}
  </div>;
}
