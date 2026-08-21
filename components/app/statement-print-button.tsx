"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function StatementPrintButton() {
  const pathname=usePathname();const search=useSearchParams();const match=pathname.match(/\/app\/clients\/([^/]+)\/statement/);const clientId=match?.[1];const lang=search.get("lang");
  const href=clientId?`/api/clients/${clientId}/statement.pdf${lang?`?lang=${encodeURIComponent(lang)}`:""}`:"#";
  return <Button variant="primary" type="button" disabled={!clientId} onClick={()=>{if(clientId)window.open(href,"_blank","noopener,noreferrer")}}>PDF officiel</Button>;
}
