"use client";

import { Button } from "@/components/ui/button";

export function StatementPrintButton() {
  return <Button variant="primary" type="button" onClick={() => window.print()}>Print / PDF</Button>;
}
