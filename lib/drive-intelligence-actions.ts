import "server-only";

import { prisma } from "@/lib/prisma";
import { getDriveIntelligence, type DriveStructuredData } from "@/lib/drive-intelligence";

function moneyFromText(text: string) {
  const patterns = [
    /(?:transaction amount|amount|montant|monto)\s*(?:including fees)?\s*[:=-]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(USD|MXN|HTG|EUR|CAD|DOP)?/i,
    /(USD|MXN|HTG|EUR|CAD|DOP)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    /([0-9][0-9,]*(?:\.\d{1,2})?)\s*(USD|MXN|HTG|EUR|CAD|DOP)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p); if (!m) continue;
    const firstIsCurrency = /^[A-Z]{3}$/i.test(m[1] || "");
    const rawAmount = firstIsCurrency ? m[2] : m[1];
    const currency = (firstIsCurrency ? m[1] : m[2])?.toUpperCase();
    const amount = Number(String(rawAmount).replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) return { amount, currency: currency || "USD" };
  }
  return null;
}

function inferStructured(intel: Awaited<ReturnType<typeof getDriveIntelligence>>["intelligence"]): DriveStructuredData {
  if (!intel) return {};
  const current = intel.structuredData || {};
  const source = [intel.summary, intel.detailedDescription, ...(intel.keyFacts || []), ...(intel.actionItems || [])].filter(Boolean).join("\n");
  const money = moneyFromText(source);
  const reference = source.match(/(?:reference|ref(?:erence)?|transaction id|mtcn)\s*[:#-]?\s*([A-Z0-9-]{5,40})/i)?.[1] || "";
  return {
    ...current,
    transactionAmount: current.transactionAmount ?? current.totalAmount ?? money?.amount ?? null,
    currency: current.currency || money?.currency || "USD",
    transactionReference: current.transactionReference || reference,
    senderName: current.senderName || intel.people?.[0] || "",
    beneficiaryName: current.beneficiaryName || intel.people?.[1] || "",
    senderBank: current.senderBank || intel.organizations?.find((v) => /bank|banco|banque/i.test(v)) || "",
  };
}

export async function getDriveActionContext(fileId: string) {
  const file = await prisma.file.findFirst({
    where: { id: fileId, isVault: false, archivedAt: null },
    include: { client: { select: { id: true, firstName: true, lastName: true } }, case: { select: { id: true, caseNumber: true, title: true, clientId: true } }, payment: { select: { id: true, reference: true, status: true, amount: true, currency: true } } },
  });
  if (!file) return null;
  const { intelligence } = await getDriveIntelligence(file.id);
  return { file, intelligence, structured: inferStructured(intelligence) };
}
