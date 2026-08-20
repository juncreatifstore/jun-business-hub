import "server-only";

import { prisma } from "@/lib/prisma";

export const DRIVE_COMMENT_PREFIX = "drive.collab.comment.";
export const DRIVE_APPROVAL_PREFIX = "drive.collab.approval.";

export type DriveCollaborationResource = "File" | "Folder";

export type DriveComment = {
  id: string;
  resourceType: DriveCollaborationResource;
  resourceId: string;
  authorId: string;
  body: string;
  mentionUserIds: string[];
  createdAt: string;
  editedAt?: string;
};

export type DriveApproval = {
  id: string;
  resourceType: DriveCollaborationResource;
  resourceId: string;
  requesterId: string;
  reviewerId: string;
  message: string;
  status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "CANCELLED";
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;
};

function parse<T>(value: string): T | null {
  try { return JSON.parse(value) as T; } catch { return null; }
}

export function resourceCommentPrefix(resourceType: DriveCollaborationResource, resourceId: string) {
  return `${DRIVE_COMMENT_PREFIX}${resourceType}.${resourceId}.`;
}

export async function getDriveComments(resourceType: DriveCollaborationResource, resourceId: string) {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: resourceCommentPrefix(resourceType, resourceId) } },
    orderBy: { updatedAt: "asc" },
  });
  const comments = rows.map((r) => parse<DriveComment>(r.value)).filter((v): v is DriveComment => Boolean(v));
  const userIds = [...new Set(comments.flatMap((c) => [c.authorId, ...c.mentionUserIds]))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } }) : [];
  const map = new Map(users.map((u) => [u.id, u]));
  return comments.map((comment) => ({
    ...comment,
    author: map.get(comment.authorId) ?? null,
    mentionedUsers: comment.mentionUserIds.map((id) => map.get(id)).filter(Boolean),
  }));
}

export async function getDriveApprovals(resourceType?: DriveCollaborationResource, resourceId?: string) {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: DRIVE_APPROVAL_PREFIX } }, orderBy: { updatedAt: "desc" } });
  let approvals = rows.map((r) => parse<DriveApproval>(r.value)).filter((v): v is DriveApproval => Boolean(v));
  if (resourceType) approvals = approvals.filter((a) => a.resourceType === resourceType);
  if (resourceId) approvals = approvals.filter((a) => a.resourceId === resourceId);
  return approvals;
}

export async function getDriveCollaborationResource(resourceType: DriveCollaborationResource, resourceId: string) {
  if (resourceType === "File") return prisma.file.findFirst({ where: { id: resourceId, isVault: false, archivedAt: null }, select: { id: true, name: true } });
  return prisma.folder.findFirst({ where: { id: resourceId, isVault: false }, select: { id: true, name: true } });
}

export async function getDriveCollaborationSnapshot(resourceType: DriveCollaborationResource, resourceId: string) {
  const [resource, comments, approvals, teamUsers] = await Promise.all([
    getDriveCollaborationResource(resourceType, resourceId),
    getDriveComments(resourceType, resourceId),
    getDriveApprovals(resourceType, resourceId),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { not: "CLIENT" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);
  return { resource, comments, approvals, teamUsers };
}
