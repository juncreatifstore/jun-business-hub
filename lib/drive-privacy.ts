import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

export const DRIVE_PRIVACY_GLOBAL_KEY = "drive.privacy.global";
export const DRIVE_PRIVACY_FILE_PREFIX = "drive.privacy.file.";

export type DrivePrivacyPolicy = {
  version: string;
  title: string;
  body: string;
  updatedAt: string;
  required: boolean;
};

const DEFAULT_POLICY: DrivePrivacyPolicy = {
  version: "2026-08-20",
  title: "Confidentiality and authorized access notice",
  body: "This document is shared by JUN CREATIF AND TRAVEL LLC for an authorized purpose only. By continuing, you confirm that you are the intended recipient or otherwise authorized to access this material. You agree not to reproduce, redistribute, publish, forward, alter, or use the document outside the purpose for which it was shared without prior authorization. Access may be logged for security, fraud prevention, compliance, and document-protection purposes.",
  updatedAt: "2026-08-20T00:00:00.000Z",
  required: true,
};

function parsePolicy(value?: string | null): DrivePrivacyPolicy | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as Partial<DrivePrivacyPolicy>;
    if (!p.version || !p.title || !p.body) return null;
    return {
      version: String(p.version).slice(0, 80),
      title: String(p.title).slice(0, 200),
      body: String(p.body).slice(0, 12000),
      updatedAt: String(p.updatedAt || new Date().toISOString()),
      required: p.required !== false,
    };
  } catch {
    return null;
  }
}

export async function getDrivePrivacyPolicy(fileId: string): Promise<DrivePrivacyPolicy> {
  const [filePolicy, globalPolicy] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: `${DRIVE_PRIVACY_FILE_PREFIX}${fileId}` }, select: { value: true } }),
    prisma.appSetting.findUnique({ where: { key: DRIVE_PRIVACY_GLOBAL_KEY }, select: { value: true } }),
  ]);
  return parsePolicy(filePolicy?.value) ?? parsePolicy(globalPolicy?.value) ?? DEFAULT_POLICY;
}

function privacySecret() {
  const raw = process.env.DRIVE_PRIVACY_SECRET || process.env.AUTH_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("DRIVE_PRIVACY_SECRET or AUTH_SECRET is required in production");
    return new TextEncoder().encode("jun-drive-privacy-dev-secret");
  }
  return new TextEncoder().encode(raw);
}

export function drivePrivacyCookieName(fileId: string) {
  return `jun_drive_privacy_${fileId}`;
}

export async function signDrivePrivacyConsent(fileId: string, version: string) {
  return new SignJWT({ scope: "drive-privacy", version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(fileId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(privacySecret());
}

export async function verifyDrivePrivacyConsent(token: string | undefined, fileId: string, version: string) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, privacySecret());
    return payload.sub === fileId && payload.scope === "drive-privacy" && payload.version === version;
  } catch {
    return false;
  }
}
