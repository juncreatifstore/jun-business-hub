"use client";

import { useState } from "react";
import { Copy, Printer, Check } from "lucide-react";

export function ManualTransferActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  }
  return <div className="flex gap-2">
    <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium">
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}
    </button>
    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium">
      <Printer className="h-4 w-4" />Print
    </button>
  </div>;
}
