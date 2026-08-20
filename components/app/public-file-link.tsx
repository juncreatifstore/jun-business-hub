"use client";
import { useState } from "react";
import { Copy, ExternalLink, Check } from "lucide-react";

export function PublicFileLink({ fileId }: { fileId: string }) {
  const [copied, setCopied] = useState(false);
  const path = `/view/file/${fileId}`;

  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy public link", url);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <a
        href={path}
        target="_blank"
        rel="noreferrer"
        className="rounded-md p-2 text-muted2 hover:bg-white/5 hover:text-white"
        title="Open public viewer"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <button
        type="button"
        onClick={copy}
        className="rounded-md p-2 text-muted2 hover:bg-electric/10 hover:text-electric"
        title="Copy public link"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
