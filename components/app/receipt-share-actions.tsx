"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ReceiptShareActions({ receiptReference, verifyUrl, pdfUrl, clientName, active }: { receiptReference: string; verifyUrl: string; pdfUrl: string; clientName: string; active: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  }

  const message = active
    ? `Hello ${clientName},\n\nYour official JUN payment receipt ${receiptReference} is available.\nReceipt PDF: ${pdfUrl}\nVerification: ${verifyUrl}\n\nFor security, verify the receipt using the JUN verification link or QR code.\n\nJUN CREATIF AND TRAVEL LLC`
    : `Receipt ${receiptReference} has been voided. Do not rely on any previously downloaded copy as an active receipt. Verification: ${verifyUrl}`;

  return <div className="flex flex-wrap gap-2">
    {active ? <Button type="button" variant="outline" onClick={() => copy("pdf", pdfUrl)}>{copied === "pdf" ? "PDF link copied" : "Copy PDF link"}</Button> : null}
    <Button type="button" variant="outline" onClick={() => copy("verify", verifyUrl)}>{copied === "verify" ? "Verify link copied" : "Copy verification link"}</Button>
    <Button type="button" variant="outline" onClick={() => copy("message", message)}>{copied === "message" ? "Message copied" : "Copy client message"}</Button>
  </div>;
}
