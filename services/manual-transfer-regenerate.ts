"use server";

import { assertPermission } from "@/lib/auth";
import { getManualTransferOrder, getManualTransferReceiver } from "@/lib/finance-manual-transfers";
import { createManualTransferOrder } from "@/services/finance-manual-transfers";

export async function regenerateManualTransferOrderAsNew(id: string) {
  await assertPermission("PAYMENT_CREATE");
  const order = await getManualTransferOrder(id);
  if (!order) return;
  const receiver = await getManualTransferReceiver(order.receiverId);
  if (!receiver || !receiver.enabled) return;

  const form = new FormData();
  form.set("receiverId", receiver.id);
  form.set("clientId", order.clientId || "");
  form.set("caseId", order.caseId || "");
  form.set("payerName", order.payerName || "");
  form.set("purpose", order.purpose || "Commercial payment");
  form.set("originCountry", order.originCountry || "");
  form.set("destinationCountry", order.destinationCountry || receiver.country || "");
  form.set("sendAmount", String(order.sendAmount));
  form.set("sendCurrency", order.sendCurrency);
  form.set("receiveCurrency", order.receiveCurrency);
  form.set("exchangeRate", String(order.exchangeRate));
  form.set("language", order.language || "French");
  await createManualTransferOrder(form);
}
