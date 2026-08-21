"use server";

import { createHash, randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { getDriveActionContext } from "@/lib/drive-intelligence-actions";
import { saveFinanceExpense, type FinanceExpense, type ExpenseCategory } from "@/lib/finance-expenses";
import { syncAccountingLedger } from "@/lib/finance-accounting";

function back(fileId: string, message: string, error = false) {
  return `/app/drive/intelligence-actions/${encodeURIComponent(fileId)}?${error ? "error" : "success"}=${encodeURIComponent(message)}`;
}
function value(fd: FormData, key: string, max = 300) { return String(fd.get(key) || "").trim().slice(0, max); }
function amount(fd: FormData) { const n = Number(fd.get("amount") || 0); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
async function validateClientCase(clientId: string, caseId: string | null) {
  const client = await prisma.client.findFirst({ where: { id: clientId, archivedAt: null }, select: { id: true } });
  if (!client) throw new Error("Choose a valid client");
  if (caseId) {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } });
    if (!c || c.clientId !== clientId) throw new Error("Selected case does not belong to the client");
  }
}

export async function createPaymentDraftFromFile(fileId: string, formData: FormData) {
  const user = await assertPermission("PAYMENT_CREATE");
  const ctx = await getDriveActionContext(fileId); if (!ctx) redirect(back(fileId, "File not found", true));
  const clientId = value(formData, "clientId", 100); const caseId = value(formData, "caseId", 100) || null;
  const n = amount(formData); const currency = value(formData, "currency", 3).toUpperCase();
  try { await validateClientCase(clientId, caseId); } catch (e) { redirect(back(fileId, e instanceof Error ? e.message : "Invalid client/case", true)); }
  if (n <= 0 || currency.length !== 3) redirect(back(fileId, "A positive amount and 3-letter currency are required", true));
  const reference = await nextNumber("PAY");
  const payment = await prisma.payment.create({ data: { reference, clientId, caseId, amount: n, currency, method: "BANK_TRANSFER", status: "PENDING", provider: ctx.structured.senderBank || null, providerRef: ctx.structured.transactionReference || null, notes: `AI-assisted draft from Drive file ${ctx.file.name}. Human confirmation required.`, recordedById: user.id } });
  await prisma.file.update({ where: { id: fileId }, data: { clientId, caseId, paymentId: payment.id, category: "PAYMENT_PROOF" } });
  await audit({ userId: user.id, action: "FILE_AI_CREATE_PAYMENT_DRAFT", resourceType: "Payment", resourceId: payment.id, after: { fileId, reference, amount: n, currency } });
  revalidatePath("/app/drive"); revalidatePath("/app/finance/payments");
  redirect(`/app/finance/payments/${payment.id}`);
}

export async function createRefundRequestFromFile(fileId: string, formData: FormData) {
  const user = await assertPermission("REFUND_CREATE");
  const ctx = await getDriveActionContext(fileId); if (!ctx) redirect(back(fileId, "File not found", true));
  const clientId = value(formData, "clientId", 100); const caseId = value(formData, "caseId", 100) || null;
  const paymentId = value(formData, "paymentId", 100) || ctx.file.payment?.id || null;
  let n = amount(formData); let currency = value(formData, "currency", 3).toUpperCase();
  try { await validateClientCase(clientId, caseId); } catch (e) { redirect(back(fileId, e instanceof Error ? e.message : "Invalid client/case", true)); }
  if (paymentId) {
    const p = await prisma.payment.findUnique({ where: { id: paymentId }, select: { clientId: true, caseId: true, currency: true, amount: true, status: true } });
    if (!p || p.clientId !== clientId || (caseId && p.caseId && p.caseId !== caseId)) redirect(back(fileId, "Linked payment is inconsistent with client/case", true));
    currency = p.currency; if (n <= 0) n = Number(p.amount);
  }
  if (n <= 0 || currency.length !== 3) redirect(back(fileId, "A positive refund amount and currency are required", true));
  const refundNumber = await nextNumber("REF");
  const refund = await prisma.refund.create({ data: { refundNumber, clientId, caseId, paymentId, amount: n, currency, reason: value(formData, "reason", 1000) || `AI-assisted refund request from ${ctx.file.name}`, status: "REQUESTED", createdById: user.id } });
  await prisma.file.update({ where: { id: fileId }, data: { clientId, caseId, refundId: refund.id, category: "REFUND" } });
  await audit({ userId: user.id, action: "FILE_AI_CREATE_REFUND_REQUEST", resourceType: "Refund", resourceId: refund.id, after: { fileId, refundNumber, amount: n, currency, paymentId } });
  revalidatePath("/app/drive"); revalidatePath("/app/finance/refunds");
  redirect(`/app/finance/refunds/${refund.id}`);
}

export async function createExpenseDraftFromFile(fileId: string, formData: FormData) {
  const user = await assertPermission("EXPENSE_CREATE");
  const ctx = await getDriveActionContext(fileId); if (!ctx) redirect(back(fileId, "File not found", true));
  const n = amount(formData); const currency = value(formData, "currency", 3).toUpperCase();
  if (n <= 0 || currency.length !== 3) redirect(back(fileId, "A positive expense amount and currency are required", true));
  const categoryRaw = value(formData, "expenseCategory", 80) || "OTHER";
  const allowed: ExpenseCategory[] = ["AIRFARE","HOTEL","VISA_FEES","MARKETING","SOFTWARE","OFFICE","PAYROLL","PROFESSIONAL_SERVICES","BANK_FEES","TAXES","TRANSPORT","UTILITIES","REFUNDS_COST","OTHER"];
  const category: ExpenseCategory = allowed.includes(categoryRaw as ExpenseCategory) ? categoryRaw as ExpenseCategory : "OTHER";
  const now = new Date().toISOString();
  const expense: FinanceExpense = { id: randomUUID(), expenseNumber: `EXP-${new Date().getFullYear()}-${randomUUID().slice(0,8).toUpperCase()}`, vendorName: value(formData, "vendorName", 180) || ctx.structured.beneficiaryName || ctx.structured.beneficiaryBank || "To verify", vendorCountry: ctx.structured.country || "", category, description: value(formData, "description", 1000) || ctx.intelligence?.summary || `AI-assisted expense draft from ${ctx.file.name}`, invoiceNumber: ctx.structured.invoiceNumber || "", amount: n, currency, dueDate: null, status: "DRAFT", caseId: value(formData, "caseId", 100) || ctx.file.caseId || null, clientId: value(formData, "clientId", 100) || ctx.file.clientId || null, invoiceFileId: fileId, createdById: user.id, approvedById: null, decisionNote: "AI-assisted draft. Review before submission.", payments: [], createdAt: now, updatedAt: now };
  await saveFinanceExpense(expense);
  await audit({ userId: user.id, action: "FILE_AI_CREATE_EXPENSE_DRAFT", resourceType: "FinanceExpense", resourceId: expense.id, after: { fileId, expenseNumber: expense.expenseNumber, amount: n, currency, category } });
  revalidatePath("/app/finance/expenses");
  redirect(`/app/finance/expenses/${expense.id}`);
}

export async function createDocumentDraftFromFile(fileId: string, formData: FormData) {
  const user = await assertPermission("DOCUMENT_CREATE");
  const ctx = await getDriveActionContext(fileId); if (!ctx) redirect(back(fileId, "File not found", true));
  const documentId = await nextNumber("DOC");
  const title = value(formData, "title", 200) || `Document from ${ctx.file.name}`;
  const content = [ctx.intelligence?.summary, ctx.intelligence?.detailedDescription, ctx.intelligence?.documentPurpose, ctx.intelligence?.keyFacts?.length ? `Key facts:\n${ctx.intelligence.keyFacts.map(v=>`- ${v}`).join("\n")}` : ""].filter(Boolean).join("\n\n") || `Source file: ${ctx.file.name}`;
  const hash = createHash("sha256").update(content).digest("hex");
  const doc = await prisma.document.create({ data: { documentId, type: "CUSTOM", title, status: "DRAFT", clientId: ctx.file.clientId, caseId: ctx.file.caseId, authorId: user.id, versions: { create: { version: 1, content, authorId: user.id, changeNote: `Created from Drive AI analysis (${ctx.file.name})`, hash, status: "DRAFT" } } } });
  await audit({ userId: user.id, action: "FILE_AI_CREATE_DOCUMENT_DRAFT", resourceType: "Document", resourceId: doc.id, after: { fileId, documentId, title } });
  revalidatePath("/app/documents");
  redirect(`/app/documents/${doc.id}`);
}

export async function syncAccountingFromAnalyzedFile(fileId: string) {
  const user = await assertPermission("ACCOUNTING_POST");
  const result = await syncAccountingLedger(user.id);
  await audit({ userId: user.id, action: "FILE_AI_ACCOUNTING_SYNC", resourceType: "File", resourceId: fileId, after: result });
  revalidatePath("/app/finance/accounting");
  redirect(back(fileId, `Accounting synchronized: ${result.created} created, ${result.skipped} already posted, ${result.closed} blocked by closed periods.`));
}
