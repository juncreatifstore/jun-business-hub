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
