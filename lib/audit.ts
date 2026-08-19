import "server-only";
import { prisma } from "@/lib/prisma";
import { requestMeta } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export async function audit(params: {
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}) {
  const meta = requestMeta();
  await prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      before: params.before,
      after: params.after,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}

export async function logActivity(params: {
  type: string;
  message: string;
  userId?: string | null;
  clientId?: string | null;
  caseId?: string | null;
  resourceType?: string;
  resourceId?: string;
}) {
  await prisma.activity.create({ data: params });
}
