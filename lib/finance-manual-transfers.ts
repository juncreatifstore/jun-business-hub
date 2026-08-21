import "server-only";

import { prisma } from "@/lib/prisma";

export const MANUAL_RECEIVER_PREFIX = "finance.manual.receiver.";
export const MANUAL_ORDER_PREFIX = "finance.manual.order.";

export type ManualTransferRail = "WESTERN_UNION" | "BANK_TRANSFER";
export type ManualTransferStatus = "DRAFT" | "ISSUED" | "COMPLETED" | "CANCELLED";

export type ManualTransferReceiver = {
  id: string;
  label: string;
  rail: ManualTransferRail;
  enabled: boolean;
  receiverType: "BUSINESS" | "INDIVIDUAL_BUSINESS_REPRESENTATIVE";
  firstName?: string;
  lastName?: string;
  legalName: string;
  phone: string;
  email: string;
  country: string;
  city: string;
  address: string;
  receiverStreet?: string;
  receiverState?: string;
  receiverPostalCode?: string;
  bankName: string;
  bankCountry?: string;
  bankAddress: string;
  bankStreet?: string;
  bankCity?: string;
  bankState?: string;
  bankPostalCode?: string;
  accountHolderName?: string;
  accountNumber: string;
  iban: string;
  swiftBic: string;
  routingNumber: string;
  clabe: string;
  branchCode: string;
  currency: string;
  feePercent: number;
  feeFixed: number;
  complianceNote: string;
  createdAt: string;
  updatedAt: string;
};

export type ManualTransferOrder = {
  id: string;
  orderNumber: string;
  status: ManualTransferStatus;
  receiverId: string;
  receiverSnapshot: ManualTransferReceiver;
  clientId: string | null;
  caseId: string | null;
  payerName: string;
  purpose: string;
  originCountry: string;
  destinationCountry: string;
  sendAmount: number;
  sendCurrency: string;
  feeAmount: number;
  netAfterFees: number;
  exchangeRate: number;
  receiveAmount: number;
  receiveCurrency: string;
  language: string;
  instructions: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

function parseReceiver(value: string): ManualTransferReceiver | null {
  try {
    const raw = JSON.parse(value) as Partial<ManualTransferReceiver> & { id?: string; label?: string; rail?: ManualTransferRail; legalName?: string };
    if (!raw?.id || !raw.label || !raw.rail || !raw.legalName) return null;
    const firstName = String(raw.firstName || "").trim();
    const lastName = String(raw.lastName || "").trim();
    const legalName = String(raw.legalName || [firstName, lastName].filter(Boolean).join(" ")).trim();
    return {
      id: raw.id,
      label: String(raw.label),
      rail: raw.rail,
      enabled: raw.enabled !== false,
      receiverType: raw.receiverType === "INDIVIDUAL_BUSINESS_REPRESENTATIVE" ? "INDIVIDUAL_BUSINESS_REPRESENTATIVE" : "BUSINESS",
      firstName,
      lastName,
      legalName,
      phone: String(raw.phone || ""),
      email: String(raw.email || ""),
      country: String(raw.country || ""),
      city: String(raw.city || ""),
      address: String(raw.address || ""),
      receiverStreet: String(raw.receiverStreet || raw.address || ""),
      receiverState: String(raw.receiverState || ""),
      receiverPostalCode: String(raw.receiverPostalCode || ""),
      bankName: String(raw.bankName || ""),
      bankCountry: String(raw.bankCountry || ""),
      bankAddress: String(raw.bankAddress || ""),
      bankStreet: String(raw.bankStreet || raw.bankAddress || ""),
      bankCity: String(raw.bankCity || ""),
      bankState: String(raw.bankState || ""),
      bankPostalCode: String(raw.bankPostalCode || ""),
      accountHolderName: String(raw.accountHolderName || legalName),
      accountNumber: String(raw.accountNumber || ""),
      iban: String(raw.iban || ""),
      swiftBic: String(raw.swiftBic || ""),
      routingNumber: String(raw.routingNumber || ""),
      clabe: String(raw.clabe || ""),
      branchCode: String(raw.branchCode || ""),
      currency: String(raw.currency || "USD").toUpperCase(),
      feePercent: Math.max(0, Number(raw.feePercent || 0)),
      feeFixed: Math.max(0, Number(raw.feeFixed || 0)),
      complianceNote: String(raw.complianceNote || ""),
      createdAt: String(raw.createdAt || new Date().toISOString()),
      updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString()),
    };
  } catch { return null; }
}

function parseOrder(value: string): ManualTransferOrder | null {
  try {
    const o = JSON.parse(value) as ManualTransferOrder;
    return o?.id && o.orderNumber && o.receiverSnapshot ? o : null;
  } catch { return null; }
}

export async function getManualTransferReceivers(enabledOnly = false) {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: MANUAL_RECEIVER_PREFIX } }, orderBy: { updatedAt: "desc" }, select: { value: true } });
  const values = rows.map((r) => parseReceiver(r.value)).filter((r): r is ManualTransferReceiver => Boolean(r));
  return enabledOnly ? values.filter((r) => r.enabled) : values;
}

export async function getManualTransferReceiver(id: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: `${MANUAL_RECEIVER_PREFIX}${id}` }, select: { value: true } });
  return row ? parseReceiver(row.value) : null;
}

export async function getManualTransferOrders() {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: MANUAL_ORDER_PREFIX } }, orderBy: { updatedAt: "desc" }, take: 250, select: { value: true } });
  return rows.map((r) => parseOrder(r.value)).filter((o): o is ManualTransferOrder => Boolean(o));
}

export async function getManualTransferOrder(id: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: `${MANUAL_ORDER_PREFIX}${id}` }, select: { value: true } });
  return row ? parseOrder(row.value) : null;
}

export function calculateManualTransfer(sendAmount: number, feePercent: number, feeFixed: number, exchangeRate: number) {
  const feeAmount = Math.round((feeFixed + sendAmount * feePercent / 100) * 100) / 100;
  const netAfterFees = Math.max(0, Math.round((sendAmount - feeAmount) * 100) / 100);
  const receiveAmount = Math.round(netAfterFees * exchangeRate * 100) / 100;
  return { feeAmount, netAfterFees, receiveAmount };
}

type DetailLanguage = "FR" | "ES" | "HT" | "EN";
function detailLanguage(language = "English"): DetailLanguage {
  const lang = language.trim().toLowerCase();
  if (["fr", "français", "french"].includes(lang)) return "FR";
  if (["es", "español", "spanish"].includes(lang)) return "ES";
  if (["ht", "kreyòl", "creole", "haitian creole"].includes(lang)) return "HT";
  return "EN";
}

const DETAIL_LABELS = {
  FR: { beneficiary: "INFORMATIONS DU BÉNÉFICIAIRE", first: "Prénom", last: "Nom", legal: "Nom légal / commercial", phone: "Téléphone", email: "E-mail", street: "Rue / adresse", city: "Ville", state: "État / province", postal: "Code postal", country: "Pays", bank: "INFORMATIONS BANCAIRES", bankName: "Nom de la banque", bankStreet: "Rue / adresse de la banque", bankCity: "Ville de la banque", bankState: "État / province de la banque", bankPostal: "Code postal de la banque", bankCountry: "Pays de la banque", holder: "Titulaire du compte", account: "Numéro de compte", iban: "IBAN", swift: "SWIFT / BIC", routing: "Routing / ABA", clabe: "CLABE", branch: "Code agence" },
  ES: { beneficiary: "INFORMACIÓN DEL BENEFICIARIO", first: "Nombre", last: "Apellido", legal: "Nombre legal / comercial", phone: "Teléfono", email: "Correo electrónico", street: "Calle / dirección", city: "Ciudad", state: "Estado / provincia", postal: "Código postal", country: "País", bank: "INFORMACIÓN BANCARIA", bankName: "Nombre del banco", bankStreet: "Calle / dirección del banco", bankCity: "Ciudad del banco", bankState: "Estado / provincia del banco", bankPostal: "Código postal del banco", bankCountry: "País del banco", holder: "Titular de la cuenta", account: "Número de cuenta", iban: "IBAN", swift: "SWIFT / BIC", routing: "Routing / ABA", clabe: "CLABE", branch: "Código de sucursal" },
  HT: { beneficiary: "ENFÒMASYON BENEFISYÈ A", first: "Prenon", last: "Siyati", legal: "Non legal / non biznis", phone: "Telefòn", email: "Imèl", street: "Ri / adrès", city: "Vil", state: "Eta / pwovens", postal: "Kòd postal", country: "Peyi", bank: "ENFÒMASYON BANK LA", bankName: "Non bank la", bankStreet: "Ri / adrès bank la", bankCity: "Vil bank la", bankState: "Eta / pwovens bank la", bankPostal: "Kòd postal bank la", bankCountry: "Peyi bank la", holder: "Non moun ki sou kont lan", account: "Nimewo kont", iban: "IBAN", swift: "SWIFT / BIC", routing: "Routing / ABA", clabe: "CLABE", branch: "Kòd branch" },
  EN: { beneficiary: "BENEFICIARY INFORMATION", first: "First name", last: "Last name", legal: "Legal / business name", phone: "Phone", email: "Email", street: "Street / address", city: "City", state: "State / province", postal: "Postal code", country: "Country", bank: "BANK INFORMATION", bankName: "Bank name", bankStreet: "Bank street / address", bankCity: "Bank city", bankState: "Bank state / province", bankPostal: "Bank postal code", bankCountry: "Bank country", holder: "Account holder", account: "Account number", iban: "IBAN", swift: "SWIFT / BIC", routing: "Routing / ABA", clabe: "CLABE", branch: "Branch code" },
} as const;

export function receiverPaymentDetails(r: ManualTransferReceiver, language = "English") {
  const labels = DETAIL_LABELS[detailLanguage(language)];
  const receiverName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.legalName;
  const beneficiary = [
    labels.beneficiary,
    r.firstName ? `${labels.first}: ${r.firstName}` : "",
    r.lastName ? `${labels.last}: ${r.lastName}` : "",
    r.legalName ? `${labels.legal}: ${r.legalName}` : `Name: ${receiverName}`,
    r.phone ? `${labels.phone}: ${r.phone}` : "",
    r.email ? `${labels.email}: ${r.email}` : "",
    (r.receiverStreet || r.address) ? `${labels.street}: ${r.receiverStreet || r.address}` : "",
    r.city ? `${labels.city}: ${r.city}` : "",
    r.receiverState ? `${labels.state}: ${r.receiverState}` : "",
    r.receiverPostalCode ? `${labels.postal}: ${r.receiverPostalCode}` : "",
    r.country ? `${labels.country}: ${r.country}` : "",
  ].filter(Boolean).join("\n");

  const hasBankDetails = Boolean(r.bankName || r.accountNumber || r.iban || r.swiftBic || r.routingNumber || r.clabe || r.branchCode || r.bankAddress || r.bankStreet || r.bankCity || r.bankState || r.bankPostalCode || r.bankCountry);
  if (!hasBankDetails) return beneficiary;

  const bank = [
    labels.bank,
    r.bankName ? `${labels.bankName}: ${r.bankName}` : "",
    r.accountHolderName ? `${labels.holder}: ${r.accountHolderName}` : "",
    r.accountNumber ? `${labels.account}: ${r.accountNumber}` : "",
    r.iban ? `${labels.iban}: ${r.iban}` : "",
    r.swiftBic ? `${labels.swift}: ${r.swiftBic}` : "",
    r.routingNumber ? `${labels.routing}: ${r.routingNumber}` : "",
    r.clabe ? `${labels.clabe}: ${r.clabe}` : "",
    r.branchCode ? `${labels.branch}: ${r.branchCode}` : "",
    (r.bankStreet || r.bankAddress) ? `${labels.bankStreet}: ${r.bankStreet || r.bankAddress}` : "",
    r.bankCity ? `${labels.bankCity}: ${r.bankCity}` : "",
    r.bankState ? `${labels.bankState}: ${r.bankState}` : "",
    r.bankPostalCode ? `${labels.bankPostal}: ${r.bankPostalCode}` : "",
    r.bankCountry ? `${labels.bankCountry}: ${r.bankCountry}` : "",
  ].filter(Boolean).join("\n");

  return `${beneficiary}\n\n${bank}`;
}
