"use client";
import Link from "next/link";
import { useState } from "react";
import { Check, Download, ExternalLink, Eye, Info, Link2, Sparkles } from "lucide-react";

const btn = "rounded-md p-1.5 text-muted2 transition hover:bg-surface hover:text-ink";

/** Per-file action row for connected-cloud files (mirrors the JUN Drive row). */
export function CloudFileActions({
  provider,
  fileId,
  webUrl,
  providerLabel,
  aiAllowed,
}: {
  provider: string;
  fileId: string;
  webUrl: string | null;
  providerLabel: string;
  aiAllowed: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const here = `/app/drive/cloud/${provider}/${encodeURIComponent(fileId)}`;
  const stream = `/api/drive/cloud/${provider}/file/${encodeURIComponent(fileId)}`;
  return (
    <div className="flex items-center gap-0.5">
      <Link prefetch={false} href={here} className={btn} title="Preview in JUN">
        <Eye className="h-4 w-4" />
      </Link>
      <Link prefetch={false} href={`${here}?tab=details`} className={btn} title="Details">
        <Info className="h-4 w-4" />
      </Link>
      {aiAllowed ? (
        <Link prefetch={false} href={`${here}?tab=ai`} className={btn} title="Ask JUN AI about this file">
          <Sparkles className="h-4 w-4" />
        </Link>
      ) : null}
      <button
        type="button"
        className={btn}
        title="Copy JUN link"
        onClick={async () => {
          await navigator.clipboard.writeText(`${window.location.origin}${here}`).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
      </button>
      <a href={`${stream}?download=1`} className={btn} title="Download">
        <Download className="h-4 w-4" />
      </a>
      {webUrl ? (
        <a href={webUrl} target="_blank" rel="noreferrer" className={btn} title={`Open in ${providerLabel}`}>
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}
