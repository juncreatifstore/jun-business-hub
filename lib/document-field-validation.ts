export type DocumentFieldValue = string | boolean | undefined | null;

export type DocumentFieldDefinition = {
  name: string;
  type: string;
  required?: boolean;
  validation?: string;
  options?: string[];
};

export function documentFieldHasValue(value: DocumentFieldValue, type: string): boolean {
  if (type.toUpperCase() === "CHECKBOX") return value === true || value === "true";
  return String(value ?? "").trim().length > 0;
}

function digits(value: DocumentFieldValue) {
  return String(value ?? "").replace(/\D/g, "");
}

function numeric(value: DocumentFieldValue): number | null {
  const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(/[$€£]/g, "").replace(/,/g, ".");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function validateDocumentField(def: DocumentFieldDefinition, value: DocumentFieldValue): string | null {
  const type = def.type.toUpperCase();
  const rule = (def.validation || "").toLowerCase();
  const raw = String(value ?? "").trim();

  if (def.required && !documentFieldHasValue(value, type)) return `${def.name} is required`;
  if (!documentFieldHasValue(value, type)) return null;

  const effective = rule || type.toLowerCase();
  if (effective === "name" || type === "NAME") {
    if (raw.length < 2 || !/^[A-Za-zÀ-ÖØ-öø-ÿĀ-ž' .-]+$/.test(raw)) return `${def.name} must be a valid name`;
  } else if (effective === "email" || type === "EMAIL") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return `${def.name} must be a valid email address`;
  } else if (effective === "us_phone" || type === "US_PHONE") {
    if (digits(value).length !== 10) return `${def.name} must contain a 10-digit US phone number`;
  } else if (effective === "us_zip" || type === "ZIP") {
    if (!/^\d{5}(?:-\d{4})?$/.test(raw)) return `${def.name} must be a valid ZIP or ZIP+4`;
  } else if (effective === "age" || type === "AGE") {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 130) return `${def.name} must be a whole age between 0 and 130`;
  } else if (effective === "ssn" || type === "SSN") {
    if (digits(value).length !== 9) return `${def.name} must be a 9-digit SSN`;
  } else if (effective === "ein" || type === "EIN") {
    if (digits(value).length !== 9) return `${def.name} must be a 9-digit EIN`;
  } else if (effective === "credit_card" || type === "CREDIT_CARD") {
    const count = digits(value).length;
    if (count < 15 || count > 16) return `${def.name} must contain 15–16 digits`;
  } else if (effective === "us_currency" || effective === "eu_currency" || type === "US_CURRENCY" || type === "EU_CURRENCY") {
    if (numeric(value) === null) return `${def.name} must be a valid currency amount`;
  } else if (effective === "us_state" || type === "US_STATE" || effective === "gender" || type === "GENDER") {
    if (def.options?.length && !def.options.includes(raw)) return `${def.name} must use one of the allowed options`;
  } else if (type === "NUMBER") {
    if (numeric(value) === null) return `${def.name} must be a number`;
  } else if (type === "DATE") {
    if (Number.isNaN(Date.parse(raw))) return `${def.name} must be a valid date`;
  }

  return null;
}
