import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { sha256 } from "@/lib/hash";
import { roleHasPermission, type PermissionCode, type StaffRole } from "@/lib/permissions";

export type CurrentUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  departmentId: string | null;
  extraPermissions: string[];
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.expiresAt < new Date() || session.userId !== payload.sub) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { extraPermissions: { include: { permission: true } } },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as StaffRole,
    departmentId: user.departmentId,
    extraPermissions: user.extraPermissions.map((p) => p.permission.code),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "CLIENT") redirect("/client");
  return user;
}

export function can(user: CurrentUser, permission: PermissionCode): boolean {
  if (user.role === "CLIENT") return false;
  return roleHasPermission(user.role, permission) || user.extraPermissions.includes(permission);
}

export async function requirePermission(permission: PermissionCode): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/app/forbidden");
  return user;
}

export async function assertPermission(permission: PermissionCode): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role === "CLIENT" || !can(user, permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
  return user;
}

export function requestMeta() {
  const h = headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent") ?? null,
  };
}
