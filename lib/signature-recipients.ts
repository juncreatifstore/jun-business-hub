export type SignatureRecipient = {
  name: string;
  email: string;
  order: number;
  signedAt?: string | null;
};

export function signatureRecipients(value: unknown): SignatureRecipient[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v, index) => {
      if (!v || typeof v !== "object") return null;
      const r = v as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name : "Signer";
      const email = typeof r.email === "string" ? r.email : "";
      const order = typeof r.order === "number" ? r.order : index + 1;
      const signedAt = typeof r.signedAt === "string" ? r.signedAt : null;
      return { name, email, order, signedAt };
    })
    .filter((r): r is SignatureRecipient => r !== null);
}
