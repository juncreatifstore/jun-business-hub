/**
 * Public contact form → service alias. Each department of the form maps to the
 * alias that receives it in the shared admin@ mailbox, so the request shows up
 * in /app/mail under the right service badge and in the Centre des alias.
 */
export const CONTACT_DEPARTMENTS = [
  { key: "CUSTOMER_SERVICE", label: "Customer service", alias: "support@juncreatifs.org" },
  { key: "TRAVEL", label: "Travel", alias: "travel@juncreatifs.org" },
  { key: "DOCUMENTS", label: "Documents", alias: "documents@juncreatifs.org" },
  { key: "FINANCE", label: "Finance", alias: "finance@juncreatifs.org" },
  { key: "LEGAL", label: "Legal", alias: "legal@juncreatifs.org" },
  { key: "ADMINISTRATION", label: "Administration", alias: "admin@juncreatifs.org" },
] as const;
export type ContactDepartment = (typeof CONTACT_DEPARTMENTS)[number]["key"];

export function contactAliasFor(department: string) {
  return CONTACT_DEPARTMENTS.find((d) => d.key === department) ?? CONTACT_DEPARTMENTS[0];
}
