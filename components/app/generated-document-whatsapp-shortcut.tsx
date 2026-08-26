"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function target(pathname:string){
 const patterns:[RegExp,string][]=[
  [/^\/app\/documents\/([^/]+)$/,"document"],
  [/^\/app\/finance\/receipts\/([^/]+)$/,"receipt"],
  [/^\/app\/finance\/invoices\/([^/]+)$/,"invoice"],
  [/^\/app\/clients\/([^/]+)\/statement$/,"statement"],
 ];
 for(const [rx,type] of patterns){const m=pathname.match(rx);if(m)return{type,id:m[1]};}
 return null;
}

export function GeneratedDocumentWhatsAppShortcut(){
 const pathname=usePathname();
 const item=target(pathname);
 if(!item)return null;
 return <Link href={`/app/whatsapp/share?type=${encodeURIComponent(item.type)}&id=${encodeURIComponent(item.id)}`} className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-700" aria-label="Send this document by WhatsApp">
  <span aria-hidden>◉</span> Send by WhatsApp
 </Link>;
}
