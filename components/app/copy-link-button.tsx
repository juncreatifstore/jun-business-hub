"use client";
import { useState } from "react";
import { Check, Link2 } from "lucide-react";

export function CopyLinkButton({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const abs = url.startsWith("http") ? url : `${window.location.origin}${url}`;
        await navigator.clipboard.writeText(abs).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface"
      title="Copy the JUN link to this file"
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}{" "}
      {done ? "Copied" : "Copy link"}
    </button>
  );
}
