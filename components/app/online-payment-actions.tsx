"use client";

import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";

export function OnlinePaymentActions({ publicUrl, checkoutUrl }: { publicUrl?: string | null; checkoutUrl?: string | null }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return <div className="flex flex-wrap gap-2">
    {publicUrl ? <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium"><Copy className="h-4 w-4" />{copied ? "Copied" : "Copy JUN link"}</button> : null}
    {publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium"><ExternalLink className="h-4 w-4" />Open public page</a> : null}
    {checkoutUrl ? <a href={checkoutUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium"><ExternalLink className="h-4 w-4" />Open provider checkout</a> : null}
  </div>;
}
