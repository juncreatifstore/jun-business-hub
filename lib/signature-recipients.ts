export type SignatureFieldType = "SIGNATURE" | "INITIALS" | "DATE_SIGNED" | "NAME";

export type SignatureField = {
  type: SignatureFieldType;
  page: number;
  x: number;
  y: number;
};

export type SignatureRecipient = {
  name: string;
  email: string;
  order: number;
  role?: string | null;
  signedAt?: string | null;
  fields?: SignatureField[];
};

const FIELD_TYPES = new Set<SignatureFieldType>(["SIGNATURE", "INITIALS", "DATE_SIGNED", "NAME"]);

function signatureFields(value: unknown): SignatureField[] {
  if (!Array.isArray(value)) return [];
  const out: SignatureField[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const type = typeof f.type === "string" ? f.type.toUpperCase() as SignatureFieldType : null;
    const page = Number(f.page);
    const x = Number(f.x);
    const y = Number(f.y);
    if (!type || !FIELD_TYPES.has(type) || !Number.isFinite(page) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({
      type,
      page: Math.max(1, Math.floor(page)),
      x: Math.max(0, Math.floor(x)),
      y: Math.max(0, Math.floor(y)),
    });
  }
  return out;
}

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
      fields: signatureFields(r.fields),
    });
  });

  return recipients;
}
