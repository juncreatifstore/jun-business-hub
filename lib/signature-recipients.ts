export type SignatureFieldType = "SIGNATURE" | "INITIALS" | "DATE_SIGNED" | "NAME";

export type SignatureField = {
  type: SignatureFieldType;
  page: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type SignatureRecipient = {
  name: string;
  email: string;
  order: number;
  role?: string | null;
  viewedAt?: string | null;
  verifiedAt?: string | null;
  otpHash?: string | null;
  otpExpiresAt?: string | null;
  otpSentAt?: string | null;
  otpAttempts?: number;
  signedAt?: string | null;
  signatureMethod?: "TYPE" | "DRAW" | null;
  signatureImageHash?: string | null;
  invitationSentAt?: string | null;
  completionEmailSentAt?: string | null;
  declinedAt?: string | null;
  declineReason?: string | null;
  reminderSentAt?: string | null;
  linkVersion?: number;
  replacedAt?: string | null;
  replacedByEmail?: string | null;
  fields?: SignatureField[];
};

export type SignatureRequestMeta = {
  message?: string;
  expiresAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
};

const FIELD_TYPES = new Set<SignatureFieldType>(["SIGNATURE", "INITIALS", "DATE_SIGNED", "NAME"]);

export function defaultSignatureFieldSize(type: SignatureFieldType): { width: number; height: number } {
  switch (type) {
    case "SIGNATURE": return { width: 150, height: 48 };
    case "INITIALS": return { width: 72, height: 36 };
    case "DATE_SIGNED": return { width: 110, height: 28 };
    case "NAME": return { width: 140, height: 28 };
  }
}

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
    const defaults = defaultSignatureFieldSize(type);
    const width = Number(f.width);
    const height = Number(f.height);
    out.push({
      type,
      page: Math.max(1, Math.floor(page)),
      x: Math.max(0, Math.floor(x)),
      y: Math.max(0, Math.floor(y)),
      width: Number.isFinite(width) ? Math.max(24, Math.floor(width)) : defaults.width,
      height: Number.isFinite(height) ? Math.max(18, Math.floor(height)) : defaults.height,
    });
  }
  return out;
}

export function signatureRequestMeta(value: unknown): SignatureRequestMeta {
  if (!Array.isArray(value)) return {};
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (!("_meta" in r) || !r._meta || typeof r._meta !== "object") continue;
    const meta = r._meta as Record<string, unknown>;
    return {
      message: typeof meta.message === "string" ? meta.message : undefined,
      expiresAt: typeof meta.expiresAt === "string" ? meta.expiresAt : undefined,
      cancelledAt: typeof meta.cancelledAt === "string" ? meta.cancelledAt : undefined,
      cancelReason: typeof meta.cancelReason === "string" ? meta.cancelReason : undefined,
    };
  }
  return {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function signatureRecipients(value: unknown): SignatureRecipient[] {
  if (!Array.isArray(value)) return [];

  const recipients: SignatureRecipient[] = [];

  value.forEach((v, index) => {
    if (!v || typeof v !== "object") return;
    const r = v as Record<string, unknown>;
    if ("_meta" in r) return;
    const method = typeof r.signatureMethod === "string" ? r.signatureMethod.toUpperCase() : null;
    const rawLinkVersion = Number(r.linkVersion ?? 1);
    recipients.push({
      name: typeof r.name === "string" ? r.name : "Signer",
      email: typeof r.email === "string" ? r.email : "",
      order: typeof r.order === "number" ? r.order : index + 1,
      role: optionalString(r.role),
      viewedAt: optionalString(r.viewedAt),
      verifiedAt: optionalString(r.verifiedAt),
      otpHash: optionalString(r.otpHash),
      otpExpiresAt: optionalString(r.otpExpiresAt),
      otpSentAt: optionalString(r.otpSentAt),
      otpAttempts: Number.isInteger(Number(r.otpAttempts)) ? Math.max(0, Number(r.otpAttempts)) : 0,
      signedAt: optionalString(r.signedAt),
      signatureMethod: method === "DRAW" ? "DRAW" : method === "TYPE" ? "TYPE" : null,
      signatureImageHash: optionalString(r.signatureImageHash),
      invitationSentAt: optionalString(r.invitationSentAt),
      completionEmailSentAt: optionalString(r.completionEmailSentAt),
      declinedAt: optionalString(r.declinedAt),
      declineReason: optionalString(r.declineReason),
      reminderSentAt: optionalString(r.reminderSentAt),
      linkVersion: Number.isInteger(rawLinkVersion) && rawLinkVersion > 0 ? rawLinkVersion : 1,
      replacedAt: optionalString(r.replacedAt),
      replacedByEmail: optionalString(r.replacedByEmail),
      fields: signatureFields(r.fields),
    });
  });

  return recipients;
}

export function signatureRecipientsPayload(recipients: SignatureRecipient[], meta: SignatureRequestMeta = {}) {
  return [{ _meta: {
    message: meta.message ?? "",
    ...(meta.expiresAt ? { expiresAt: meta.expiresAt } : {}),
    ...(meta.cancelledAt ? { cancelledAt: meta.cancelledAt } : {}),
    ...(meta.cancelReason ? { cancelReason: meta.cancelReason } : {}),
  } }, ...recipients];
}
