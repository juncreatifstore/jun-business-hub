import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * AES-256-GCM encryption for secrets at rest (Gmail refresh tokens, MFA secrets).
 * Key derived from AUTH_SECRET — rotate AUTH_SECRET ⇒ re-connect integrations.
 */
function key(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required for secret encryption");
  return createHash("sha256").update(`jun-enc:${s}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [v, ivB, tagB, dataB] = payload.split(".");
  if (v !== "v1" || !ivB || !tagB || !dataB) throw new Error("Invalid encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64url")), decipher.final()]).toString("utf8");
}
