"use client";

import { usePathname } from "next/navigation";
import {
  sendFinanceInvoiceByWhatsApp,
  sendFinanceRefundByWhatsApp,
  sendPaymentReceiptByWhatsApp,
  sendManualTransferOrderByWhatsApp,
} from "@/services/whatsapp-finance";

function match(pathname: string) {
  const patterns = [
    { regex: /^\/app\/finance\/invoices\/([^/]+)$/, label: "Send Invoice by WhatsApp", action: sendFinanceInvoiceByWhatsApp },
    { regex: /^\/app\/finance\/refunds\/([^/]+)$/, label: "Send Refund PDF by WhatsApp", action: sendFinanceRefundByWhatsApp },
    { regex: /^\/app\/finance\/receipts\/([^/]+)$/, label: "Send Receipt by WhatsApp", action: sendPaymentReceiptByWhatsApp },
    { regex: /^\/app\/finance\/manual-transfers\/([^/]+)$/, label: "Send Payment Order by WhatsApp", action: sendManualTransferOrderByWhatsApp },
  ] as const;
  for (const item of patterns) {
    const found = pathname.match(item.regex);
    if (found?.[1]) return { id: decodeURIComponent(found[1]), label: item.label, action: item.action };
  }
  return null;
}

export function FinanceWhatsAppAction() {
  const pathname = usePathname();
  const current = match(pathname || "");
  if (!current) return null;
  const action = current.action.bind(null, current.id);
  return <form action={action}>
    <button type="submit" className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
      {current.label}
    </button>
  </form>;
}
