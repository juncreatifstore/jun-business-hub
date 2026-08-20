"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  DRIVE_APPROVAL_PREFIX,
  resourceCommentPrefix,
  getDriveCollaborationResource,
  type DriveApproval,
  type DriveComment,
  type DriveCollaborationResource,
} from "@/lib/drive-collaboration";

function safeReturn(formData?: FormData, fallback = "/app/drive") {
  const value = String(formData?.get("returnTo") ?? "");
  return value.startsWith("/app/drive") ? value : fallback;
}

function toast(path: string, key: "toast" | "toast_error", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

function validResourceType(value: string): value is DriveCollaborationResource {
  return value === "File" || value === "Folder";
}

export async function addDriveComment(resourceType: DriveCollaborationResource, resourceId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_READ");
  const returnTo = safeReturn(formData);
  if (!validResourceType(resourceType)) redirect(toast(returnTo, "toast_error", "Invalid resource"));
  const resource = await getDriveCollaborationResource(resourceType, resourceId);
  if (!resource) redirect(toast(returnTo, "toast_error", `${resourceType} not found`));
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) redirect(toast(returnTo, "toast_error", "Comment cannot be empty"));
  const mentionUserIds = String(formData.get("mentionUserIds") ?? "").split(",").map((v) => v.trim()).filter(Boolean).slice(0, 20);
  const validMentions = mentionUserIds.length ? await prisma.user.findMany({ where: { id: { in: mentionUserIds }, status: "ACTIVE", role: { not: "CLIENT" } }, select: { id: true } }) : [];
  const id = crypto.randomUUID();
  const comment: DriveComment = { id, resourceType, resourceId, authorId: user.id, body, mentionUserIds: validMentions.map((u) => u.id), createdAt: new Date().toISOString() };
  await prisma.appSetting.create({ data: { key: `${resourceCommentPrefix(resourceType, resourceId)}${id}`, value: JSON.stringify(comment) } });
  for (const target of validMentions) {
    if (target.id === user.id) continue;
    await prisma.notification.create({ data: { userId: target.id, type: "DRIVE_MENTION", title: `Mentioned on ${resourceType.toLowerCase()}: ${resource.name}`, body: body.slice(0, 500) } });
  }
  await audit({ userId: user.id, action: "DRIVE_COMMENT_ADD", resourceType, resourceId, after: { commentId: id, mentions: comment.mentionUserIds } });
  revalidatePath("/app/drive");
  revalidatePath("/app/drive/collaboration");
  redirect(toast(returnTo, "toast", "Comment added"));
}

export async function requestDriveApproval(resourceType: DriveCollaborationResource, resourceId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_READ");
  const returnTo = safeReturn(formData);
  const resource = await getDriveCollaborationResource(resourceType, resourceId);
  if (!resource) redirect(toast(returnTo, "toast_error", `${resourceType} not found`));
  const reviewerId = String(formData.get("reviewerId") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim().slice(0, 2000);
  if (!reviewerId || reviewerId === user.id) redirect(toast(returnTo, "toast_error", "Choose another reviewer"));
  const reviewer = await prisma.user.findFirst({ where: { id: reviewerId, status: "ACTIVE", role: { not: "CLIENT" } }, select: { id: true } });
  if (!reviewer) redirect(toast(returnTo, "toast_error", "Reviewer unavailable"));
  const id = crypto.randomUUID();
  const approval: DriveApproval = { id, resourceType, resourceId, requesterId: user.id, reviewerId: reviewer.id, message, status: "PENDING", createdAt: new Date().toISOString() };
  await prisma.appSetting.create({ data: { key: `${DRIVE_APPROVAL_PREFIX}${id}`, value: JSON.stringify(approval) } });
  await prisma.notification.create({ data: { userId: reviewer.id, type: "DRIVE_APPROVAL_REQUEST", title: `Approval requested: ${resource.name}`, body: message || `Please review this ${resourceType.toLowerCase()}.` } });
  await audit({ userId: user.id, action: "DRIVE_APPROVAL_REQUEST", resourceType, resourceId, after: { approvalId: id, reviewerId: reviewer.id } });
  revalidatePath("/app/drive/collaboration");
  redirect(toast(returnTo, "toast", "Approval requested"));
}

export async function reviewDriveApproval(approvalId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_READ");
  const returnTo = safeReturn(formData, "/app/drive/collaboration");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "APPROVED" && decision !== "CHANGES_REQUESTED") redirect(toast(returnTo, "toast_error", "Invalid decision"));
  const key = `${DRIVE_APPROVAL_PREFIX}${approvalId}`;
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) redirect(toast(returnTo, "toast_error", "Approval request not found"));
  let approval: DriveApproval;
  try { approval = JSON.parse(row.value); } catch { redirect(toast(returnTo, "toast_error", "Approval request is invalid")); }
  if (approval.status !== "PENDING") redirect(toast(returnTo, "toast_error", "Approval already reviewed"));
  if (approval.reviewerId !== user.id) redirect(toast(returnTo, "toast_error", "Only the assigned reviewer can decide"));
  approval.status = decision;
  approval.reviewedAt = new Date().toISOString();
  approval.reviewNote = String(formData.get("reviewNote") ?? "").trim().slice(0, 2000);
  await prisma.appSetting.update({ where: { key }, data: { value: JSON.stringify(approval) } });
  const resource = await getDriveCollaborationResource(approval.resourceType, approval.resourceId);
  await prisma.notification.create({ data: { userId: approval.requesterId, type: decision === "APPROVED" ? "DRIVE_APPROVED" : "DRIVE_CHANGES_REQUESTED", title: `${decision === "APPROVED" ? "Approved" : "Changes requested"}: ${resource?.name ?? approval.resourceType}`, body: approval.reviewNote || undefined } });
  await audit({ userId: user.id, action: decision === "APPROVED" ? "DRIVE_APPROVAL_APPROVE" : "DRIVE_APPROVAL_CHANGES", resourceType: approval.resourceType, resourceId: approval.resourceId, after: { approvalId, reviewNote: approval.reviewNote } });
  revalidatePath("/app/drive/collaboration");
  redirect(toast(returnTo, "toast", decision === "APPROVED" ? "Approved" : "Changes requested"));
}

export async function cancelDriveApproval(approvalId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_READ");
  const returnTo = safeReturn(formData, "/app/drive/collaboration");
  const key = `${DRIVE_APPROVAL_PREFIX}${approvalId}`;
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) redirect(toast(returnTo, "toast_error", "Approval request not found"));
  let approval: DriveApproval;
  try { approval = JSON.parse(row.value); } catch { redirect(toast(returnTo, "toast_error", "Approval request is invalid")); }
  if (approval.requesterId !== user.id || approval.status !== "PENDING") redirect(toast(returnTo, "toast_error", "This request cannot be cancelled"));
  approval.status = "CANCELLED";
  approval.reviewedAt = new Date().toISOString();
  await prisma.appSetting.update({ where: { key }, data: { value: JSON.stringify(approval) } });
  await audit({ userId: user.id, action: "DRIVE_APPROVAL_CANCEL", resourceType: approval.resourceType, resourceId: approval.resourceId, after: { approvalId } });
  revalidatePath("/app/drive/collaboration");
  redirect(toast(returnTo, "toast", "Approval request cancelled"));
}
