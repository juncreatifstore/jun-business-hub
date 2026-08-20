import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

export const PUBLIC_DISABLED_PREFIX = "drive.public.disabled.";
export const PUBLIC_TOKEN_PREFIX = "drive.public.token.";
export const PUBLIC_EXPIRES_PREFIX = "drive.public.expires.";
export const PUBLIC_PASSWORD_PREFIX = "drive.public.password.";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production");
    return new TextEncoder().encode("jun-dev-secret-do-not-use-in-production");
  }
  return new TextEncoder().encode(value);
}

export function publicAccessCookieName(fileId: string) {
  return `jun_drive_access_${fileId}`;
}

export type DrivePublicSecurity = {
  disabled: boolean;
  token: string | null;
  expiresAt: Date | null;
  passwordHash: string | null;
};

export async function getDrivePublicSecurity(fileId: string): Promise<DrivePublicSecurity> {
  const keys = [
    `${PUBLIC_DISABLED_PREFIX}${fileId}`,
    `${PUBLIC_TOKEN_PREFIX}${fileId}`,
    `${PUBLIC_EXPIRES_PREFIX}${fileId}`,
    `${PUBLIC_PASSWORD_PREFIX}${fileId}`,
  ];
  const settings = await prisma.appSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
  const map = new Map(settings.map((s) => [s.key, s.value]));
  const expiresRaw = map.get(`${PUBLIC_EXPIRES_PREFIX}${fileId}`) ?? null;
  const expiresAt = expiresRaw && !Number.isNaN(new Date(expiresRaw).getTime()) ? new Date(expiresRaw) : null;
  return {
    disabled: map.has(`${PUBLIC_DISABLED_PREFIX}${fileId}`),
    token: map.get(`${PUBLIC_TOKEN_PREFIX}${fileId}`) ?? null,
    expiresAt,
    passwordHash: map.get(`${PUBLIC_PASSWORD_PREFIX}${fileId}`) ?? null,
  };
}

export function publicTokenMatches(security: DrivePublicSecurity, supplied?: string | null) {
  return security.token ? supplied === security.token : true;
}

export function publicLinkExpired(security: DrivePublicSecurity) {
  return Boolean(security.expiresAt && security.expiresAt.getTime() <= Date.now());
}

export async function signDrivePublicAccess(fileId: string) {
  return new SignJWT({ scope: "drive-public" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(fileId)
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secret());
}

export async function verifyDrivePublicAccess(token: string | undefined, fileId: string) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub === fileId && payload.scope === "drive-public";
  } catch {
    return false;
  }
}

export async function recordDrivePublicAccess(fileId: string, action: "FILE_PUBLIC_VIEW" | "FILE_PUBLIC_OPEN" | "FILE_PUBLIC_DOWNLOAD", meta: { ip?: string | null; userAgent?: string | null; after?: Record<string, unknown> } = {}) {
  await prisma.auditLog.create({
    data: {
      userId: null,
      action,
      resourceType: "File",
      resourceId: fileId,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      after: meta.after as any,
    },
  }).catch(() => undefined);
}

export function requestPublicMeta(headers: Headers) {
  return {
    ip: headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headers.get("user-agent") ?? null,
  };
}
