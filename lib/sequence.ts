import "server-only";
import { prisma } from "@/lib/prisma";

export async function nextNumber(prefix: string, width = 6): Promise<string> {
  const year = new Date().getFullYear();
  const id = `${prefix}-${year}`;
  const row = await prisma.sequenceCounter.upsert({
    where: { id },
    create: { id, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${id}-${String(row.value).padStart(width, "0")}`;
}

export { DOC_PREFIX } from "@/lib/registry";
