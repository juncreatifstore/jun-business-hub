"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";

const SECTION_CATEGORY: Record<number,string> = {
  1: "HR_RECRUITMENT",
  2: "HR_EMPLOYMENT",
  3: "HR_PAYROLL_TRAINING_EXIT",
  4: "SALES",
  5: "PURCHASING_SUPPLIERS",
  6: "FINANCE_ACCOUNTING",
  7: "LEGAL_GOVERNANCE",
  8: "GENERAL_ADMIN",
  9: "MARKETING_COMMUNICATIONS",
  10: "PROJECTS_OPERATIONS",
  11: "QHSE",
  12: "IT_DATA_PROTECTION",
  13: "EXECUTIVE_STRATEGY",
  14: "EXTERNAL_RELATIONS",
};

type CatalogEntry = { number: number; name: string; category: string };

export function parseAdministrativeTemplateCatalog(markdown: string): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  let category = "GENERAL";
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = line.match(/^##\s+(\d+)\./);
    if (heading) {
      category = SECTION_CATEGORY[Number(heading[1])] ?? "GENERAL";
      continue;
    }
    const item = line.match(/^(\d+)\.\s+(.+)$/);
    if (!item) continue;
    const number = Number(item[1]);
    const name = item[2].trim().slice(0, 300);
    if (!Number.isInteger(number) || number < 1 || number > 5000 || !name) continue;
    entries.push({ number, name, category });
  }
  const unique = new Map<number,CatalogEntry>();
  for (const entry of entries) unique.set(entry.number, entry);
  return [...unique.values()].sort((a,b) => a.number - b.number);
}

export async function importAdministrativeTemplateCatalog(formData: FormData) {
  const user = await assertPermission("DOCUMENT_CREATE");
  const upload = formData.get("catalog");
  if (!(upload instanceof File) || upload.size === 0) {
    redirect(`/app/documents/templates/import?toast_error=${encodeURIComponent("Choose a Markdown or text catalog file")}`);
  }
  if (upload.size > 2_000_000) {
    redirect(`/app/documents/templates/import?toast_error=${encodeURIComponent("Catalog file is too large")}`);
  }
  const markdown = await upload.text();
  const entries = parseAdministrativeTemplateCatalog(markdown);
  if (entries.length === 0) {
    redirect(`/app/documents/templates/import?toast_error=${encodeURIComponent("No numbered template entries were found")}`);
  }

  let inserted = 0;
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    const results = await prisma.$transaction(batch.map((entry) => {
      const sourceRef = `ADMIN-CATALOG-${String(entry.number).padStart(3,"0")}`;
      return prisma.$executeRaw`
        INSERT INTO "DocumentTemplate" (id,name,type,content,"createdAt","updatedAt",category,language,description,variables,"isActive","isReference","sourceRef","createdById")
        VALUES (gen_random_uuid()::text,${entry.name},'CUSTOM'::"DocumentType",'',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,${entry.category},'FR','Référence issue du catalogue administratif importé. Contenu à rédiger et valider avant activation.','[]'::jsonb,false,true,${sourceRef},${user.id})
        ON CONFLICT ("sourceRef") DO NOTHING
      `;
    }));
    inserted += results.reduce((sum, n) => sum + Number(n), 0);
  }

  await audit({ userId: user.id, action: "DOCUMENT_TEMPLATE_CATALOG_IMPORT", resourceType: "DocumentTemplate", after: { parsed: entries.length, inserted } });
  await logActivity({ type: "DOCUMENT_TEMPLATE_CATALOG_IMPORTED", message: `Administrative template catalog imported: ${inserted} new reference entries (${entries.length} parsed)`, userId: user.id, resourceType: "DocumentTemplate" });
  revalidatePath("/app/documents/templates");
  redirect(`/app/documents/templates?state=reference&toast=${encodeURIComponent(`${inserted} reference templates imported (${entries.length} parsed)`)}`);
}
