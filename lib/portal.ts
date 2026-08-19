export const FROZEN_DOCUMENT_STATUSES = ["SIGNED", "VOIDED"] as const;

export function isDocumentFrozen(status: string): boolean {
  return (FROZEN_DOCUMENT_STATUSES as readonly string[]).includes(status);
}

export function clientCanAccessFile(file: { clientId: string | null; isVault: boolean }, ownClientId: string): boolean {
  return !file.isVault && file.clientId === ownClientId;
}

export function clientCanAccessDocument(doc: { clientId: string | null; status: string }, ownClientId: string): boolean {
  return doc.clientId === ownClientId && (doc.status === "FINAL" || doc.status === "SIGNED");
}

export function clientCanAccessReceipt(receipt: { clientId: string }, ownClientId: string): boolean {
  return receipt.clientId === ownClientId;
}
