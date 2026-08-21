"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import {
  MANUAL_ORDER_PREFIX,
  MANUAL_RECEIVER_PREFIX,
  calculateManualTransfer,
  getManualTransferOrder,
  getManualTransferReceiver,
  receiverPaymentDetails,
  type ManualTransferOrder,
  type ManualTransferRail,
  type ManualTransferReceiver,
} from "@/lib/finance-manual-transfers";

function receiverDest(message: string, error = false) {
  return `/app/finance/manual-transfers/receivers?${error ? "toast_error" : "toast"}=${encodeURIComponent(message)}`;
}
function orderDest(message: string, error = false) {
  return `/app/finance/manual-transfers?${error ? "toast_error" : "toast"}=${encodeURIComponent(message)}`;
}

export async function createManualTransferReceiver(formData: FormData) {
  const user = await assertPermission("SETTINGS_MANAGE");
  const railRaw = String(formData.get("rail") || "BANK_TRANSFER");
  const rail: ManualTransferRail = railRaw === "WESTERN_UNION" ? "WESTERN_UNION" : "BANK_TRANSFER";
  const label = String(formData.get("label") || "").trim().slice(0, 120);
  const legalName = String(formData.get("legalName") || "").trim().slice(0, 180);
  const currency = String(formData.get("currency") || "USD").trim().toUpperCase().slice(0, 3);
  if (!label || !legalName) redirect(receiverDest("Label and receiver legal name are required", true));
  if (currency.length !== 3) redirect(receiverDest("Receiver currency must have 3 letters", true));
  const id = randomUUID();
  const now = new Date().toISOString();
  const receiver: ManualTransferReceiver = {
    id, label, rail, enabled: true, legalName,
    receiverType: String(formData.get("receiverType") || "BUSINESS") === "INDIVIDUAL_BUSINESS_REPRESENTATIVE" ? "INDIVIDUAL_BUSINESS_REPRESENTATIVE" : "BUSINESS",
    country: String(formData.get("country") || "").trim().slice(0, 100),
    city: String(formData.get("city") || "").trim().slice(0, 100),
    address: String(formData.get("address") || "").trim().slice(0, 300),
    phone: String(formData.get("phone") || "").trim().slice(0, 80),
    email: String(formData.get("email") || "").trim().slice(0, 160),
    bankName: String(formData.get("bankName") || "").trim().slice(0, 160),
    bankAddress: String(formData.get("bankAddress") || "").trim().slice(0, 300),
    accountNumber: String(formData.get("accountNumber") || "").trim().slice(0, 120),
    iban: String(formData.get("iban") || "").trim().slice(0, 120),
    swiftBic: String(formData.get("swiftBic") || "").trim().slice(0, 80),
    routingNumber: String(formData.get("routingNumber") || "").trim().slice(0, 80),
    clabe: String(formData.get("clabe") || "").trim().slice(0, 80),
    branchCode: String(formData.get("branchCode") || "").trim().slice(0, 80),
    currency,
    feePercent: Math.max(0, Math.min(100, Number(formData.get("feePercent") || 0))),
    feeFixed: Math.max(0, Number(formData.get("feeFixed") || 0)),
    complianceNote: String(formData.get("complianceNote") || "").trim().slice(0, 2000),
    createdAt: now, updatedAt: now,
  };
  await prisma.appSetting.create({ data: { key: `${MANUAL_RECEIVER_PREFIX}${id}`, value: JSON.stringify(receiver) } });
  await audit({ userId: user.id, action: "MANUAL_TRANSFER_RECEIVER_CREATE", resourceType: "ManualTransferReceiver", resourceId: id, after: { label, rail, legalName, country: receiver.country, currency } });
  revalidatePath("/app/finance/manual-transfers/receivers");
  revalidatePath("/app/finance/manual-transfers");
  redirect(receiverDest("Manual transfer receiver created"));
}

export async function toggleManualTransferReceiver(id: string) {
  const user = await assertPermission("SETTINGS_MANAGE");
  const receiver = await getManualTransferReceiver(id);
  if (!receiver) return;
  const next = { ...receiver, enabled: !receiver.enabled, updatedAt: new Date().toISOString() };
  await prisma.appSetting.update({ where: { key: `${MANUAL_RECEIVER_PREFIX}${id}` }, data: { value: JSON.stringify(next) } });
  await audit({ userId: user.id, action: next.enabled ? "MANUAL_TRANSFER_RECEIVER_ENABLE" : "MANUAL_TRANSFER_RECEIVER_DISABLE", resourceType: "ManualTransferReceiver", resourceId: id, before: { enabled: receiver.enabled }, after: { enabled: next.enabled } });
  revalidatePath("/app/finance/manual-transfers/receivers");
  revalidatePath("/app/finance/manual-transfers");
}

function baseInstructions(order: Omit<ManualTransferOrder, "instructions">, receiver: ManualTransferReceiver, language: string) {
  const details = receiverPaymentDetails(receiver, language);
  const amount = `${order.sendCurrency} ${order.sendAmount.toFixed(2)}`;
  const fees = `${order.sendCurrency} ${order.feeAmount.toFixed(2)}`;
  const net = `${order.receiveCurrency} ${order.receiveAmount.toFixed(2)}`;
  const route = `${order.originCountry} → ${order.destinationCountry}`;
  const lang = language.toLowerCase();

  if (["fr", "français", "french"].includes(lang)) return `ORDRE DE PAIEMENT ${order.orderNumber}\n\nType: ${receiver.rail === "WESTERN_UNION" ? "Western Union" : "Virement bancaire"}\nTrajet: ${route}\nMontant à envoyer: ${amount}\nFrais estimés/déduits: ${fees}\nMontant net estimé à recevoir: ${net}\nObjet: ${order.purpose || "Paiement commercial"}\n\n${details}\n\nINSTRUCTIONS IMPORTANTES POUR L'EXPÉDITEUR\n1. Saisissez exactement le prénom, le nom, le téléphone et l'adresse du bénéficiaire tels qu'indiqués ci-dessus.\n2. Si les informations bancaires sont affichées, utilisez exactement le nom de la banque, le titulaire, le numéro de compte/IBAN, SWIFT/BIC, Routing/ABA/CLABE et l'adresse bancaire indiqués.\n3. Vérifiez séparément la rue, la ville, l'État/province, le code postal et le pays avant de confirmer le transfert.\n4. Ce paiement est commercial/professionnel et lié à une transaction avec JUN CREATIF AND TRAVEL LLC ou son partenaire. Si le prestataire demande la nature du transfert, sélectionnez une option véridique Business/Commercial lorsqu'elle existe.\n5. Vérifiez le montant, la devise, le pays de destination, le nom légal du bénéficiaire et les coordonnées bancaires avant de payer.\n6. Conservez le reçu, MTCN ou la référence bancaire et transmettez-le à JUN pour rapprochement.\n7. Respectez les règles du prestataire, KYC/AML et les lois locales.\n${receiver.complianceNote ? `\nNote additionnelle: ${receiver.complianceNote}` : ""}`;

  if (["es", "español", "spanish"].includes(lang)) return `ORDEN DE PAGO ${order.orderNumber}\n\nTipo: ${receiver.rail === "WESTERN_UNION" ? "Western Union" : "Transferencia bancaria"}\nRuta: ${route}\nMonto a enviar: ${amount}\nComisiones estimadas/deducidas: ${fees}\nMonto neto estimado a recibir: ${net}\nConcepto: ${order.purpose || "Pago comercial"}\n\n${details}\n\nINSTRUCCIONES IMPORTANTES PARA EL REMITENTE\n1. Introduzca exactamente el nombre, apellido, teléfono y dirección del beneficiario indicados arriba.\n2. Si se muestran datos bancarios, use exactamente el banco, titular, número de cuenta/IBAN, SWIFT/BIC, Routing/ABA/CLABE y dirección bancaria indicados.\n3. Verifique por separado calle, ciudad, estado/provincia, código postal y país antes de confirmar la transferencia.\n4. Este es un pago comercial/profesional relacionado con una transacción con JUN CREATIF AND TRAVEL LLC o su socio. Si el proveedor solicita la naturaleza del pago, seleccione una opción veraz Business/Commercial cuando exista.\n5. Verifique monto, moneda, país de destino, nombre legal del beneficiario y todos los datos bancarios antes de pagar.\n6. Conserve el recibo, MTCN o referencia bancaria y envíelo a JUN para conciliación.\n7. Respete las reglas del proveedor, KYC/AML y las leyes locales.\n${receiver.complianceNote ? `\nNota adicional: ${receiver.complianceNote}` : ""}`;

  if (["ht", "kreyòl", "creole", "haitian creole"].includes(lang)) return `LÒD PEMAN ${order.orderNumber}\n\nKalite: ${receiver.rail === "WESTERN_UNION" ? "Western Union" : "Transfè bankè"}\nWout: ${route}\nKantite pou voye: ${amount}\nFrè estime/y ap retire: ${fees}\nKantite nèt estime k ap resevwa: ${net}\nRezon: ${order.purpose || "Peman komèsyal"}\n\n${details}\n\nENSTRIKSYON ENPÒTAN POU MOUN K AP VOYE A\n1. Mete prenon, siyati, telefòn ak adrès benefisyè a egzakteman jan yo ekri anlè a.\n2. Si enfòmasyon bank la parèt, itilize egzakteman non bank la, non moun ki sou kont lan, nimewo kont/IBAN, SWIFT/BIC, Routing/ABA/CLABE ak adrès bank la.\n3. Verifye ri, vil, eta/pwovens, kòd postal ak peyi separeman anvan ou konfime transfè a.\n4. Sa se yon peman komèsyal/pwofesyonèl ki gen rapò ak yon tranzaksyon avèk JUN CREATIF AND TRAVEL LLC oswa patnè li. Si sèvis la mande nati peman an, chwazi yon opsyon Business/Commercial ki vre lè li disponib.\n5. Verifye kantite a, lajan an, peyi destinasyon an, non legal benefisyè a ak tout detay bankè yo anvan ou peye.\n6. Kenbe resi, MTCN oswa referans bankè a epi voye li bay JUN pou rekonsilyasyon.\n7. Respekte règ sèvis la, KYC/AML ak lwa lokal yo.\n${receiver.complianceNote ? `\nNòt anplis: ${receiver.complianceNote}` : ""}`;

  return `PAYMENT ORDER ${order.orderNumber}\n\nType: ${receiver.rail === "WESTERN_UNION" ? "Western Union" : "Bank transfer"}\nRoute: ${route}\nAmount to send: ${amount}\nEstimated/deducted fees: ${fees}\nEstimated net amount to receive: ${net}\nPurpose: ${order.purpose || "Commercial payment"}\n\n${details}\n\nIMPORTANT INSTRUCTIONS FOR THE SENDER\n1. Enter the beneficiary first name, last name, phone and address exactly as shown above.\n2. If bank information is shown, use the exact bank name, account holder, account number/IBAN, SWIFT/BIC, Routing/ABA/CLABE and bank address shown above.\n3. Verify street, city, state/province, postal code and country separately before confirming the transfer.\n4. This is a commercial/professional payment related to a transaction with JUN CREATIF AND TRAVEL LLC or its partner. If the provider asks for payment type, select a truthful Business/Commercial option when available.\n5. Verify amount, currency, destination country, beneficiary legal name and all bank details before paying.\n6. Keep the receipt, MTCN or bank reference and send it to JUN for reconciliation.\n7. Follow provider rules, KYC/AML requirements and local laws.\n${receiver.complianceNote ? `\nAdditional note: ${receiver.complianceNote}` : ""}`;
}

async function translateInstructions(text: string, language: string) {
  const normalized = language.trim().toLowerCase();
  if (["fr","français","french","en","english","es","español","spanish","ht","kreyòl","creole","haitian creole"].includes(normalized)) return text;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return text;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", temperature: 0.1, messages: [{ role: "system", content: "Translate the following professional payment instructions faithfully into the requested language. Preserve all amounts, banking identifiers, legal names, reference numbers, numbered steps, and the distinction between commercial/business payment and personal/friends/family transfers. Do not add facts." }, { role: "user", content: `Target language: ${language}\n\n${text}` }] }) });
    if (!res.ok) return text;
    const data = await res.json();
    return String(data.choices?.[0]?.message?.content || text);
  } catch { return text; }
}

export async function createManualTransferOrder(formData: FormData) {
  const user = await assertPermission("PAYMENT_CREATE");
  const receiverId = String(formData.get("receiverId") || "");
  const receiver = await getManualTransferReceiver(receiverId);
  if (!receiver || !receiver.enabled) redirect(orderDest("Choose an active receiver", true));
  const sendAmount = Number(formData.get("sendAmount") || 0);
  const sendCurrency = String(formData.get("sendCurrency") || "USD").trim().toUpperCase().slice(0, 3);
  const receiveCurrency = String(formData.get("receiveCurrency") || receiver.currency).trim().toUpperCase().slice(0, 3);
  const exchangeRate = Math.max(0.0000001, Number(formData.get("exchangeRate") || (sendCurrency === receiveCurrency ? 1 : 0)));
  if (!Number.isFinite(sendAmount) || sendAmount <= 0) redirect(orderDest("Amount to send must be positive", true));
  if (!exchangeRate || !Number.isFinite(exchangeRate)) redirect(orderDest("A valid exchange rate is required when currencies differ", true));
  const { feeAmount, netAfterFees, receiveAmount } = calculateManualTransfer(sendAmount, receiver.feePercent, receiver.feeFixed, exchangeRate);
  const id = randomUUID();
  const now = new Date().toISOString();
  const orderNumber = await nextNumber("MTO");
  const language = String(formData.get("language") || "French").trim().slice(0, 80);
  const orderBase: Omit<ManualTransferOrder, "instructions"> = {
    id, orderNumber, status: "ISSUED", receiverId, receiverSnapshot: receiver,
    clientId: String(formData.get("clientId") || "") || null,
    caseId: String(formData.get("caseId") || "") || null,
    payerName: String(formData.get("payerName") || "").trim().slice(0, 180),
    purpose: String(formData.get("purpose") || "Commercial payment").trim().slice(0, 240),
    originCountry: String(formData.get("originCountry") || "").trim().slice(0, 100),
    destinationCountry: String(formData.get("destinationCountry") || receiver.country).trim().slice(0, 100),
    sendAmount, sendCurrency, feeAmount, netAfterFees, exchangeRate, receiveAmount, receiveCurrency, language,
    createdById: user.id, createdAt: now, updatedAt: now,
  };
  const sourceInstructions = baseInstructions(orderBase, receiver, language);
  const instructions = await translateInstructions(sourceInstructions, language);
  const order: ManualTransferOrder = { ...orderBase, instructions };
  await prisma.appSetting.create({ data: { key: `${MANUAL_ORDER_PREFIX}${id}`, value: JSON.stringify(order) } });
  await audit({ userId: user.id, action: "MANUAL_TRANSFER_ORDER_CREATE", resourceType: "ManualTransferOrder", resourceId: id, after: { orderNumber, rail: receiver.rail, receiverId, originCountry: order.originCountry, destinationCountry: order.destinationCountry, sendAmount, sendCurrency, feeAmount, receiveAmount, receiveCurrency, language } });
  redirect(`/app/finance/manual-transfers/${id}?toast=${encodeURIComponent("Payment order generated")}`);
}

export async function setManualTransferOrderStatus(id: string, formData: FormData) {
  const user = await assertPermission("PAYMENT_APPROVE");
  const order = await getManualTransferOrder(id);
  if (!order) return;
  const status = String(formData.get("status") || "");
  if (!["ISSUED","COMPLETED","CANCELLED"].includes(status)) return;
  const next = { ...order, status: status as ManualTransferOrder["status"], updatedAt: new Date().toISOString() };
  await prisma.appSetting.update({ where: { key: `${MANUAL_ORDER_PREFIX}${id}` }, data: { value: JSON.stringify(next) } });
  await audit({ userId: user.id, action: `MANUAL_TRANSFER_ORDER_${status}`, resourceType: "ManualTransferOrder", resourceId: id, before: { status: order.status }, after: { status } });
  revalidatePath(`/app/finance/manual-transfers/${id}`);
  revalidatePath("/app/finance/manual-transfers");
}
