export type SignatureRecipient = {
  name: string;
  email: string;
  order: number;
  role?: string | null;
  signedAt?: string | null;
};

export function signatureRecipients(value: unknown): SignatureRecipient[] {
  if (!Array.isArray(value)) return [];

  const recipients: SignatureRecipient[] = [];

  value.forEach((v, index) => {
    if (!v || typeof v !== "object") return;

    const r = v as Record<string, unknown>;
    recipients.push({
      name: typeof r.name === "string" ? r.name : "Signer",
      email: typeof r.email === "string" ? r.email : "",
      order: typeof r.order === "number" ? r.order : index + 1,
      role: typeof r.role === "string" ? r.role : null,
      signedAt: typeof r.signedAt === "string" ? r.signedAt : null,
    });
  });

  return recipients;
}
