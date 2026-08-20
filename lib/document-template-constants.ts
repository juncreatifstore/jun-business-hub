export const TEMPLATE_CATEGORIES = [
  ["HR_RECRUITMENT", "Ressources humaines — Recrutement"],
  ["HR_EMPLOYMENT", "Ressources humaines — Contrats et vie du salarié"],
  ["HR_PAYROLL_TRAINING_EXIT", "Ressources humaines — Paie, évaluation, formation, départ"],
  ["SALES", "Commercial et ventes"],
  ["PURCHASING_SUPPLIERS", "Achats et fournisseurs"],
  ["FINANCE_ACCOUNTING", "Finances et comptabilité"],
  ["LEGAL_GOVERNANCE", "Juridique et gouvernance"],
  ["GENERAL_ADMIN", "Administration générale et secrétariat"],
  ["MARKETING_COMMUNICATIONS", "Marketing et communication"],
  ["PROJECTS_OPERATIONS", "Projets et opérations"],
  ["QHSE", "Qualité, hygiène, sécurité, environnement"],
  ["IT_DATA_PROTECTION", "Informatique et protection des données"],
  ["EXECUTIVE_STRATEGY", "Direction et stratégie"],
  ["EXTERNAL_RELATIONS", "Relations externes et divers"],
  ["GENERAL", "Général / personnalisé"],
] as const;

export const TEMPLATE_LANGUAGES = ["FR", "EN", "ES", "HT"] as const;

export const BUILTIN_TEMPLATE_VARIABLES = [
  { key: "company.name", label: "Company name", automatic: true },
  { key: "client.first_name", label: "Client first name", automatic: true },
  { key: "client.last_name", label: "Client last name", automatic: true },
  { key: "client.full_name", label: "Client full name", automatic: true },
  { key: "client.email", label: "Client email", automatic: true },
  { key: "client.phone", label: "Client phone", automatic: true },
  { key: "client.address", label: "Client address", automatic: true },
  { key: "client.country", label: "Client country", automatic: true },
  { key: "client.nationality", label: "Client nationality", automatic: true },
  { key: "case.number", label: "Case number", automatic: true },
  { key: "case.title", label: "Case title", automatic: true },
  { key: "date.today", label: "Today's date", automatic: true },
  { key: "document.title", label: "Document title", automatic: true },
  { key: "amount", label: "Amount", automatic: false },
  { key: "currency", label: "Currency", automatic: false },
  { key: "address", label: "Address", automatic: false },
  { key: "reference", label: "Reference", automatic: false },
] as const;
