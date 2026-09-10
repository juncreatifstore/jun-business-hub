"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function target(pathname: string) {
  const patterns: [RegExp, string][] = [
    [/^\/app\/documents\/([^/]+)$/, "document"],
    [/^\/app\/finance\/receipts\/([^/]+)$/, "receipt"],
    [/^\/app\/finance\/invoices\/([^/]+)$/, "invoice"],
    [/^\/app\/clients\/([^/]+)\/statement$/, "statement"],
  ];
  for (const [rx, type] of patterns) {
    const match = pathname.match(rx);
    if (match) return { type, id: match[1] };
  }
  return null;
}

export function GeneratedDocumentWhatsAppShortcut() {
  const pathname = usePathname();
  const item = target(pathname);
  if (!item) return null;

  return (
    <Link
      href={`/app/whatsapp/share?type=${encodeURIComponent(item.type)}&id=${encodeURIComponent(item.id)}`}
      className="fixed bottom-24 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-ink shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500 lg:bottom-6 lg:right-6 lg:px-5"
      aria-label="Envoyer ce document par WhatsApp"
    >
      <span aria-hidden>◉</span>
      <span className="hidden sm:inline">Envoyer par WhatsApp</span>
      <span className="sm:hidden">WhatsApp</span>
    </Link>
  );
}
