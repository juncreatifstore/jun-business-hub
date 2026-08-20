"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FileCategory } from "@prisma/client";
import {
  DRIVE_AUTOMATION_RULE_PREFIX,
  DRIVE_AUTOMATION_PROPOSAL_PREFIX,
  DRIVE_EXPIRY_PREFIX,
  DRIVE_AUTOMATION_LAST_SCAN,
  DRIVE_CATEGORIES,
  getExpiringDriveFiles,
  processDriveAutomation,
  type DriveAutomationProposal,
  type DriveAutomationRule,
} from "@/lib/drive-automation";

function safeReturn(formData?: FormData, fallback = "/app/drive/automation") {
  const value = String(formData?.get("returnTo") ?? "");
  return value.startsWith("/app/drive") ? value : fallback;
}

function toast(path: string, key: "toast" | "toast_error", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

function text(value: FormDataEntryValue | null, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function csv(value: FormDataEntryValue | null, max = 20) {
  return String(value ?? "").split(",").map((v) => v.trim()).filter(Boolean).slice(0, max);
}

export async function createDriveAutomationRule(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const name = text(formData.get("name"), 120);
  if (!name) redirect(toast(returnTo, "toast_error", "Rule name is required"));

  const category = text(formData.get("matchCategory"), 40);
  const suggestCategory = text(formData.get("suggestCategory"), 40);
  const filenameContains = text(formData.get("filenameContains"), 100);
  const mimePrefix = text(formData.get("mimePrefix"), 100);
  const tags = csv(formData.get("tags"), 20);
  const notifyUserIds = csv(formData.get("notifyUserIds"), 20);
  const moveToFolderIdRaw = text(formData.get("moveToFolderId"), 100);
  const moveToFolderId = moveToFolderIdRaw === "__ROOT__" ? null : (moveToFolderIdRaw || undefined);
  const taskAssigneeId = text(formData.get("taskAssigneeId"), 100) || null;
  const taskDueDays = Math.max(0, Math.min(365, Number(formData.get("taskDueDays") ?? 2) || 2));
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const rule: DriveAutomationRule = {
    id,
    name,
    enabled: true,
    match: {
      ...(category && DRIVE_CATEGORIES.includes(category as typeof DRIVE_CATEGORIES[number]) ? { categories: [category] } : {}),
      ...(filenameContains ? { filenameContains } : {}),
      ...(mimePrefix ? { mimePrefix } : {}),
    },
    actions: {
      ...(tags.length ? { addTags: tags } : {}),
      ...(moveToFolderId !== undefined ? { moveToFolderId } : {}),
      ...(notifyUserIds.length ? { notifyUserIds } : {}),
      ...(String(formData.get("createTask") ?? "") === "1" ? { createTask: true, taskAssigneeId, taskDueDays } : {}),
      ...(suggestCategory && DRIVE_CATEGORIES.includes(suggestCategory as typeof DRIVE_CATEGORIES[number]) ? { suggestCategory } : {}),
      requireApproval: String(formData.get("requireApproval") ?? "") === "1",
    },
    createdAt: now,
    updatedAt: now,
  };

  await prisma.appSetting.create({ data: { key: `${DRIVE_AUTOMATION_RULE_PREFIX}${id}`, value: JSON.stringify(rule) } });
  await audit({ userId: user.id, action: "DRIVE_AUTOMATION_RULE_CREATE", resourceType: "DriveAutomationRule", resourceId: id, after: { name: rule.name } });
  revalidatePath("/app/drive/automation");
  redirect(toast(returnTo, "toast", "Automation rule created"));
}

export async function toggleDriveAutomationRule(ruleId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const key = `${DRIVE_AUTOMATION_RULE_PREFIX}${ruleId}`;
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) redirect(toast(returnTo, "toast_error", "Automation rule not found"));
  let rule: DriveAutomationRule;
  try { rule = JSON.parse(row.value); } catch { redirect(toast(returnTo, "toast_error", "Automation rule is invalid")); }
  rule.enabled = !rule.enabled;
  rule.updatedAt = new Date().toISOString();
  await prisma.appSetting.update({ where: { key }, data: { value: JSON.stringify(rule) } });
  await audit({ userId: user.id, action: rule.enabled ? "DRIVE_AUTOMATION_RULE_ENABLE" : "DRIVE_AUTOMATION_RULE_DISABLE", resourceType: "DriveAutomationRule", resourceId: ruleId });
  revalidatePath("/app/drive/automation");
  redirect(toast(returnTo, "toast", rule.enabled ? "Rule enabled" : "Rule disabled"));
}

export async function deleteDriveAutomationRule(ruleId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  await prisma.appSetting.deleteMany({ where: { key: `${DRIVE_AUTOMATION_RULE_PREFIX}${ruleId}` } });
  await audit({ userId: user.id, action: "DRIVE_AUTOMATION_RULE_DELETE", resourceType: "DriveAutomationRule", resourceId: ruleId });
  revalidatePath("/app/drive/automation");
  redirect(toast(returnTo, "toast", "Automation rule deleted"));
}

export async function reviewDriveAutomationProposal(proposalId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "APPROVED" && decision !== "REJECTED") redirect(toast(returnTo, "toast_error", "Invalid decision"));
  const key = `${DRIVE_AUTOMATION_PROPOSAL_PREFIX}${proposalId}`;
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) redirect(toast(returnTo, "toast_error", "Proposal not found"));
  let proposal: DriveAutomationProposal;
  try { proposal = JSON.parse(row.value); } catch { redirect(toast(returnTo, "toast_error", "Proposal is invalid")); }
  if (proposal.status !== "PENDING") redirect(toast(returnTo, "toast_error", "Proposal already reviewed"));

  const file = await prisma.file.findFirst({ where: { id: proposal.fileId, isVault: false, archivedAt: null } });
  if (!file) redirect(toast(returnTo, "toast_error", "File not found"));

  if (decision === "APPROVED") {
    if (proposal.type === "CATEGORY" && DRIVE_CATEGORIES.includes(proposal.value as typeof DRIVE_CATEGORIES[number])) {
      await prisma.file.update({ where: { id: file.id }, data: { category: proposal.value as FileCategory } });
    } else if (proposal.type === "LINK_CLIENT") {
      const client = await prisma.client.findUnique({ where: { id: proposal.value }, select: { id: true } });
      if (!client) redirect(toast(returnTo, "toast_error", "Suggested client no longer exists"));
      await prisma.file.update({ where: { id: file.id }, data: { clientId: client.id } });
    } else if (proposal.type === "LINK_CASE") {
      const c = await prisma.case.findUnique({ where: { id: proposal.value }, select: { id: true, clientId: true } });
      if (!c) redirect(toast(returnTo, "toast_error", "Suggested case no longer exists"));
      await prisma.file.update({ where: { id: file.id }, data: { caseId: c.id, ...(file.clientId ? {} : { clientId: c.clientId }) } });
    } else if (proposal.type === "EXPIRY") {
      const time = Date.parse(proposal.value);
      if (!Number.isFinite(time)) redirect(toast(returnTo, "toast_error", "Suggested expiration date is invalid"));
      const expiryKey = `${DRIVE_EXPIRY_PREFIX}${file.id}`;
      await prisma.appSetting.upsert({ where: { key: expiryKey }, update: { value: new Date(time).toISOString() }, create: { key: expiryKey, value: new Date(time).toISOString() } });
    } else if (proposal.type === "MOVE") {
      const targetId = proposal.value === "__ROOT__" ? null : proposal.value;
      if (targetId && !(await prisma.folder.findFirst({ where: { id: targetId, isVault: false }, select: { id: true } }))) redirect(toast(returnTo, "toast_error", "Destination folder no longer exists"));
      await prisma.file.update({ where: { id: file.id }, data: { folderId: targetId } });
    }
  }

  proposal.status = decision;
  proposal.reviewedAt = new Date().toISOString();
  proposal.reviewedById = user.id;
  await prisma.appSetting.update({ where: { key }, data: { value: JSON.stringify(proposal) } });
  await audit({ userId: user.id, action: decision === "APPROVED" ? "DRIVE_AUTOMATION_APPROVE" : "DRIVE_AUTOMATION_REJECT", resourceType: "File", resourceId: file.id, after: { proposalId, type: proposal.type, value: proposal.value } });
  revalidatePath("/app/drive");
  revalidatePath("/app/drive/automation");
  redirect(toast(returnTo, "toast", decision === "APPROVED" ? "Automation proposal applied" : "Automation proposal rejected"));
}

export async function runDriveAutomationScan(formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const files = await prisma.file.findMany({ where: { isVault: false, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true } });
  let matched = 0;
  let proposals = 0;
  for (const file of files) {
    const result = await processDriveAutomation(file.id, user.id).catch(() => ({ matched: 0, proposals: 0 }));
    matched += result.matched;
    proposals += result.proposals;
  }

  const expiring = await getExpiringDriveFiles(30);
  for (const item of expiring) {
    if (!item.file) continue;
    const marker = `drive.expiry.alert.${user.id}.${item.fileId}.${item.expiresAt.slice(0, 10)}`;
    const existing = await prisma.appSetting.findUnique({ where: { key: marker }, select: { id: true } });
    if (!existing) {
      await prisma.notification.create({ data: { userId: user.id, type: "DRIVE_EXPIRY", title: `Document expiration: ${item.file.name}`, body: `Expiration / important date: ${new Date(item.expiresAt).toLocaleDateString("en-US")}` } });
      await prisma.appSetting.create({ data: { key: marker, value: new Date().toISOString() } });
    }
  }

  await prisma.appSetting.upsert({ where: { key: DRIVE_AUTOMATION_LAST_SCAN }, update: { value: new Date().toISOString() }, create: { key: DRIVE_AUTOMATION_LAST_SCAN, value: new Date().toISOString() } });
  await audit({ userId: user.id, action: "DRIVE_AUTOMATION_SCAN", resourceType: "Drive", after: { files: files.length, matched, proposals, expiring: expiring.length } });
  revalidatePath("/app/drive/automation");
  redirect(toast(returnTo, "toast", `Scan complete: ${files.length} files, ${proposals} proposals, ${expiring.length} expiring`));
}

export async function clearDriveExpiry(fileId: string, formData?: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  await prisma.appSetting.deleteMany({ where: { key: `${DRIVE_EXPIRY_PREFIX}${fileId}` } });
  await audit({ userId: user.id, action: "DRIVE_EXPIRY_CLEAR", resourceType: "File", resourceId: fileId });
  revalidatePath("/app/drive/automation");
  redirect(toast(returnTo, "toast", "Expiration removed"));
}
