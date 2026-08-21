"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { createProviderCheckout } from "@/lib/finance-online-providers";
import { getOnlinePaymentSession, makeOnlinePublicToken, markOnlineSessionStatus, saveOnlinePaymentSession, type OnlinePaymentProvider, type OnlinePaymentSession } from "@/lib/finance-online-payments";

function listDest(message: string, error = false) {
  return `/app/finance/online-payments?${error ? "toast_error" : "toast"}=${encodeURIComponent(message)}`;
}

export async function createOnlinePaymentRequest(formData: FormData) {
  const user = await assertPermission("PAYMENT_CREATE");
  const clientId = String(formData.get("clientId") || "");
  const caseId = String(formData.get("caseId") || "") || null;
  const providerRaw = String(formData.get("provider") || "STRIPE").toUpperCase();
  const provider: OnlinePaymentProvider = providerRaw === "PAYPAL" ? "PAYPAL" : providerRaw === "MERCADO_PAGO" ? "MERCADO_PAGO" : "STRIPE";
  const amount = Number(formData.get("amount") || 0);
  const currency = String(formData.get("currency") || "USD").trim().toUpperCase().slice(0, 3);
  const description = String(formData.get("description") || "JUN service payment").trim().slice(0, 180);
  const expiryMinutes = Math.max(30, Math.min(1440, Number(formData.get("expiryMinutes") || 30)));
  if (!clientId || !Number.isFinite(amount) || amount <= 0) redirect(listDest("Client and a positive amount are required", true));
  if (currency.length !== 3) redirect(listDest("Currency must have 3 letters", true));

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, firstName: true, lastName: true, email: true } });
  if (!client) redirect(listDest("Client not found", true));
  if (caseId) {
    const linkedCase = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
    if (!linkedCase) redirect(listDest("Case not found", true));
    if (linkedCase.clientId !== clientId) redirect(listDest("Selected case belongs to a different client", true));
  }

  const reference = await nextNumber("PAY");
  const payment = await prisma.payment.create({ data: { reference, clientId, caseId, amount, currency, method: provider, provider, notes: description, recordedById: user.id } });
  const id = randomUUID();
  const { publicToken, tokenHash } = makeOnlinePublicToken(id);
  const now = new Date();
  let session: OnlinePaymentSession = {
    id, paymentId: payment.id, tokenHash, provider, status: "CREATED", amount, currency, description,
    clientName: `${client.firstName} ${client.lastName}`.trim(), clientEmail: client.email,
    checkoutUrl: null, providerSessionId: null, providerPaymentId: null,
    expiresAt: new Date(now.getTime() + expiryMinutes * 60_000).toISOString(),
    createdById: user.id, createdAt: now.toISOString(), updatedAt: now.toISOString(), lastError: null,
  };
  await saveOnlinePaymentSession(session);

  try {
    const checkout = await createProviderCheckout({ provider, sessionId: id, paymentId: payment.id, publicToken, amount, currency, description, clientName: session.clientName, clientEmail: client.email });
    session = { ...session, status: "PENDING", checkoutUrl: checkout.checkoutUrl, providerSessionId: checkout.providerSessionId, updatedAt: new Date().toISOString() };
    await saveOnlinePaymentSession(session);
    await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: checkout.providerSessionId } });
    await audit({ userId: user.id, action: "ONLINE_PAYMENT_CREATE", resourceType: "Payment", resourceId: payment.id, after: { reference, provider, amount, currency, sessionId: id, expiresAt: session.expiresAt } });
    await logActivity({ type: "PAYMENT_CREATED", message: `Online payment ${reference} created via ${provider.replaceAll("_", " ")}`, userId: user.id, clientId, caseId });
    revalidatePath("/app/finance/online-payments");
    redirect(`/app/finance/online-payments/${id}?token=${encodeURIComponent(publicToken)}&toast=${encodeURIComponent("Online payment link created")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider checkout creation failed";
    await saveOnlinePaymentSession({ ...session, status: "FAILED", lastError: message.slice(0, 500), updatedAt: new Date().toISOString() });
    await audit({ userId: user.id, action: "ONLINE_PAYMENT_PROVIDER_ERROR", resourceType: "Payment", resourceId: payment.id, after: { provider, sessionId: id, error: message.slice(0, 500) } });
    redirect(`/app/finance/online-payments/${id}?token=${encodeURIComponent(publicToken)}&toast_error=${encodeURIComponent(message)}`);
  }
}

export async function cancelOnlinePaymentSession(id: string) {
  const user = await assertPermission("PAYMENT_APPROVE");
  const session = await getOnlinePaymentSession(id);
  if (!session || session.status === "PAID") return;
  await markOnlineSessionStatus(id, "CANCELLED");
  await prisma.payment.updateMany({ where: { id: session.paymentId, status: "PENDING" }, data: { status: "REJECTED" } });
  await audit({ userId: user.id, action: "ONLINE_PAYMENT_CANCEL", resourceType: "Payment", resourceId: session.paymentId, before: { status: session.status }, after: { status: "CANCELLED", sessionId: id } });
  revalidatePath(`/app/finance/online-payments/${id}`);
  revalidatePath("/app/finance/online-payments");
  revalidatePath("/app/finance/payments");
}
