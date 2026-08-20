import "server-only";

import { prisma } from "@/lib/prisma";
import { indexDriveFile, getDriveIntelligence } from "@/lib/drive-intelligence";
import type { FileCategory } from "@prisma/client";

export const DRIVE_AUTOMATION_RULE_PREFIX = "drive.automation.rule.";
export const DRIVE_AUTOMATION_PROPOSAL_PREFIX = "drive.automation.proposal.";
export const DRIVE_EXPIRY_PREFIX = "drive.expiry.";
export const DRIVE_AUTOMATION_LAST_SCAN = "drive.automation.last-scan";

export const DRIVE_CATEGORIES = ["IDENTITY", "PASSPORT", "CONTRACT", "PAYMENT_PROOF", "RECEIPT", "REFUND", "VISA", "FLIGHT", "INVOICE", "COMPANY", "LEGAL", "TAX", "EMPLOYEE", "VENDOR", "OTHER"] as const;

export type DriveAutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  match: {
    categories?: string[];
    filenameContains?: string;
    mimePrefix?: string;
    folderId?: string | null;
  };
  actions: {
    addTags?: string[];
    moveToFolderId?: string | null;
    notifyUserIds?: string[];
    createTask?: boolean;
    taskAssigneeId?: string | null;
    taskDueDays?: number;
    suggestCategory?: string | null;
    requireApproval?: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type DriveAutomationProposal = {
  id: string;
  fileId: string;
  ruleId: string | null;
  type: "CATEGORY" | "LINK_CLIENT" | "LINK_CASE" | "EXPIRY";
  value: string;
  label: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewedAt?: string;
  reviewedById?: string;
};

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

export async function listDriveAutomationRules() {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: DRIVE_AUTOMATION_RULE_PREFIX } }, orderBy: { updatedAt: "desc" } });
  return rows.map((r) => parseJson<DriveAutomationRule>(r.value)).filter((r): r is DriveAutomationRule => Boolean(r));
}

export async function getDriveAutomationProposals(fileId?: string) {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: DRIVE_AUTOMATION_PROPOSAL_PREFIX } }, orderBy: { updatedAt: "desc" } });
  const proposals = rows.map((r) => parseJson<DriveAutomationProposal>(r.value)).filter((r): r is DriveAutomationProposal => Boolean(r));
  return fileId ? proposals.filter((p) => p.fileId === fileId) : proposals;
}

export async function upsertAutomationProposal(input: Omit<DriveAutomationProposal, "id" | "createdAt" | "status">) {
  const existing = (await getDriveAutomationProposals(input.fileId)).find((p) => p.type === input.type && p.value === input.value && p.status === "PENDING");
  if (existing) return existing;
  const id = crypto.randomUUID();
  const proposal: DriveAutomationProposal = { ...input, id, status: "PENDING", createdAt: new Date().toISOString() };
  await prisma.appSetting.create({ data: { key: `${DRIVE_AUTOMATION_PROPOSAL_PREFIX}${id}`, value: JSON.stringify(proposal) } });
  return proposal;
}

function ruleMatches(rule: DriveAutomationRule, file: { name: string; category: string; mimeType: string; folderId: string | null }) {
  if (!rule.enabled) return false;
  if (rule.match.categories?.length && !rule.match.categories.includes(file.category)) return false;
  if (rule.match.filenameContains && !file.name.toLowerCase().includes(rule.match.filenameContains.toLowerCase())) return false;
  if (rule.match.mimePrefix && !file.mimeType.toLowerCase().startsWith(rule.match.mimePrefix.toLowerCase())) return false;
  if (rule.match.folderId !== undefined && rule.match.folderId !== file.folderId) return false;
  return true;
}

function futureDateFromIntelligence(values?: string[]) {
  if (!values?.length) return null;
  const now = Date.now();
  const candidates = values.map((v) => ({ raw: v, time: Date.parse(v) })).filter((v) => Number.isFinite(v.time) && v.time > now).sort((a, b) => a.time - b.time);
  return candidates[0] ?? null;
}

export async function processDriveAutomation(fileId: string, actorUserId: string, suppliedBuffer?: Buffer) {
  const file = await prisma.file.findFirst({
    where: { id: fileId, isVault: false, archivedAt: null },
    include: { client: true, case: true },
  });
  if (!file) return { matched: 0, proposals: 0 };

  await indexDriveFile(file.id, suppliedBuffer).catch(() => null);
  const { intelligence } = await getDriveIntelligence(file.id);
  const rules = await listDriveAutomationRules();
  const matched = rules.filter((r) => ruleMatches(r, file));
  let proposalCount = 0;

  for (const rule of matched) {
    const a = rule.actions;
    if (a.addTags?.length) {
      const key = `drive.tags.${file.id}`;
      const existing = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
      const current = parseJson<string[]>(existing?.value) ?? [];
      const tags = [...new Set([...current, ...a.addTags.map((t) => t.trim()).filter(Boolean)])].slice(0, 20);
      await prisma.appSetting.upsert({ where: { key }, update: { value: JSON.stringify(tags) }, create: { key, value: JSON.stringify(tags) } });
    }

    if (a.moveToFolderId !== undefined && !a.requireApproval && a.moveToFolderId !== file.folderId) {
      const targetOk = a.moveToFolderId === null || Boolean(await prisma.folder.findFirst({ where: { id: a.moveToFolderId, isVault: false }, select: { id: true } }));
      if (targetOk) await prisma.file.update({ where: { id: file.id }, data: { folderId: a.moveToFolderId } });
    }

    if (a.suggestCategory && DRIVE_CATEGORIES.includes(a.suggestCategory as typeof DRIVE_CATEGORIES[number]) && a.suggestCategory !== file.category) {
      await upsertAutomationProposal({ fileId: file.id, ruleId: rule.id, type: "CATEGORY", value: a.suggestCategory, label: `Set category to ${a.suggestCategory}` });
      proposalCount++;
    }

    if (a.createTask) {
      const dueDate = new Date(Date.now() + Math.max(0, Math.min(365, a.taskDueDays ?? 2)) * 86400000);
      const marker = `[Drive automation:${rule.id}:${file.id}]`;
      const duplicate = await prisma.task.findFirst({ where: { description: { contains: marker }, status: { in: ["TODO", "IN_PROGRESS"] } }, select: { id: true } });
      if (!duplicate) {
        await prisma.task.create({ data: { title: `Review ${file.name}`.slice(0, 200), description: `${marker}\nAutomation rule: ${rule.name}`, caseId: file.caseId, clientId: file.clientId, assigneeId: a.taskAssigneeId || null, creatorId: actorUserId, dueDate } });
      }
    }

    if (a.notifyUserIds?.length) {
      for (const userId of [...new Set(a.notifyUserIds)]) {
        const user = await prisma.user.findFirst({ where: { id: userId, status: "ACTIVE", role: { not: "CLIENT" } }, select: { id: true } });
        if (user) await prisma.notification.create({ data: { userId, type: "DRIVE_AUTOMATION", title: `Drive rule: ${rule.name}`, body: `${file.name} matched this automation rule.` } });
      }
    }
  }

  const text = `${file.name} ${intelligence?.searchableText ?? ""}`.toLowerCase();
  if (!file.clientId) {
    const clients = await prisma.client.findMany({ where: { status: "ACTIVE" }, take: 500, select: { id: true, internalId: true, firstName: true, lastName: true } });
    const hit = clients.find((c) => text.includes(c.internalId.toLowerCase()) || (`${c.firstName} ${c.lastName}`.trim().length >= 5 && text.includes(`${c.firstName} ${c.lastName}`.toLowerCase())));
    if (hit) { await upsertAutomationProposal({ fileId: file.id, ruleId: null, type: "LINK_CLIENT", value: hit.id, label: `Link to ${hit.firstName} ${hit.lastName} (${hit.internalId})` }); proposalCount++; }
  }
  if (!file.caseId) {
    const cases = await prisma.case.findMany({ take: 500, select: { id: true, caseNumber: true, title: true } });
    const hit = cases.find((c) => text.includes(c.caseNumber.toLowerCase()));
    if (hit) { await upsertAutomationProposal({ fileId: file.id, ruleId: null, type: "LINK_CASE", value: hit.id, label: `Link to ${hit.caseNumber} — ${hit.title}` }); proposalCount++; }
  }

  if (intelligence?.suggestedCategory && DRIVE_CATEGORIES.includes(intelligence.suggestedCategory as typeof DRIVE_CATEGORIES[number]) && intelligence.suggestedCategory !== file.category) {
    await upsertAutomationProposal({ fileId: file.id, ruleId: null, type: "CATEGORY", value: intelligence.suggestedCategory, label: `AI suggests category ${intelligence.suggestedCategory}` });
    proposalCount++;
  }
  const future = futureDateFromIntelligence(intelligence?.importantDates);
  if (future) {
    await upsertAutomationProposal({ fileId: file.id, ruleId: null, type: "EXPIRY", value: new Date(future.time).toISOString(), label: `Possible expiration / important date: ${future.raw}` });
    proposalCount++;
  }

  return { matched: matched.length, proposals: proposalCount };
}

export async function getExpiringDriveFiles(days = 30) {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: DRIVE_EXPIRY_PREFIX } } });
  const now = Date.now();
  const max = now + Math.max(1, days) * 86400000;
  const items = rows.map((r) => ({ fileId: r.key.slice(DRIVE_EXPIRY_PREFIX.length), expiresAt: r.value, time: Date.parse(r.value) })).filter((r) => Number.isFinite(r.time) && r.time <= max).sort((a, b) => a.time - b.time);
  const files = items.length ? await prisma.file.findMany({ where: { id: { in: items.map((i) => i.fileId) }, isVault: false, archivedAt: null }, select: { id: true, name: true, category: true, clientId: true, caseId: true } }) : [];
  const map = new Map(files.map((f) => [f.id, f]));
  return items.map((i) => ({ ...i, file: map.get(i.fileId) ?? null })).filter((i) => i.file);
}
