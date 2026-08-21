"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { MANUAL_RECEIVER_PREFIX, type ManualTransferRail, type ManualTransferReceiver } from "@/lib/finance-manual-transfers";

function dest(message: string, error = false) {
  return `/app/finance/manual-transfers/receivers?${error ? "toast_error" : "toast"}=${encodeURIComponent(message)}`;
}
function text(formData: FormData, name: string, max = 200) { return String(formData.get(name) || "").trim().slice(0, max); }

export async function createManualTransferReceiverV2(formData: FormData) {
  const user = await assertPermission("SETTINGS_MANAGE");
  const rail: ManualTransferRail = text(formData, "rail", 30) === "WESTERN_UNION" ? "WESTERN_UNION" : "BANK_TRANSFER";
  const label = text(formData, "label", 120);
  const firstName = text(formData, "firstName", 100);
  const lastName = text(formData, "lastName", 100);
  const legalNameInput = text(formData, "legalName", 180);
  const legalName = legalNameInput || [firstName, lastName].filter(Boolean).join(" ");
  const currency = text(formData, "currency", 3).toUpperCase() || "USD";
  if (!label || !legalName) redirect(dest("Label and receiver name are required", true));
  if (currency.length !== 3) redirect(dest("Receiver currency must have 3 letters", true));

  const id = randomUUID();
  const now = new Date().toISOString();
  const receiver: ManualTransferReceiver = {
    id, label, rail, enabled: true,
    receiverType: text(formData, "receiverType", 50) === "INDIVIDUAL_BUSINESS_REPRESENTATIVE" ? "INDIVIDUAL_BUSINESS_REPRESENTATIVE" : "BUSINESS",
    firstName, lastName, legalName,
    phone: text(formData, "phone", 80),
    email: text(formData, "email", 160),
    country: text(formData, "country", 100),
    city: text(formData, "city", 100),
    address: text(formData, "address", 300),
    bankName: text(formData, "bankName", 160),
    bankCountry: text(formData, "bankCountry", 100),
    bankAddress: text(formData, "bankAddress", 300),
    accountHolderName: text(formData, "accountHolderName", 180) || legalName,
    accountNumber: text(formData, "accountNumber", 120),
    iban: text(formData, "iban", 120),
    swiftBic: text(formData, "swiftBic", 80),
    routingNumber: text(formData, "routingNumber", 80),
    clabe: text(formData, "clabe", 80),
    branchCode: text(formData, "branchCode", 80),
    currency,
    feePercent: Math.max(0, Math.min(100, Number(formData.get("feePercent") || 0))),
    feeFixed: Math.max(0, Number(formData.get("feeFixed") || 0)),
    complianceNote: text(formData, "complianceNote", 2000),
    createdAt: now,
    updatedAt: now,
  };

  if (rail === "BANK_TRANSFER" && !receiver.bankName) redirect(dest("Bank name is required for a bank transfer receiver", true));
  if (rail === "BANK_TRANSFER" && !receiver.accountNumber && !receiver.iban && !receiver.clabe) redirect(dest("Add an account number, IBAN or CLABE for a bank transfer receiver", true));

  await prisma.appSetting.create({ data: { key: `${MANUAL_RECEIVER_PREFIX}${id}`, value: JSON.stringify(receiver) } });
  await audit({ userId: user.id, action: "MANUAL_TRANSFER_RECEIVER_CREATE_V2", resourceType: "ManualTransferReceiver", resourceId: id, after: { label, rail, receiverName: [firstName, lastName].filter(Boolean).join(" "), legalName, bankName: receiver.bankName, currency } });
  revalidatePath("/app/finance/manual-transfers/receivers");
  revalidatePath("/app/finance/manual-transfers");
  redirect(dest("Manual transfer receiver created"));
}
