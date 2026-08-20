import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { getDriveIntelligence, indexDriveFile } from "@/lib/drive-intelligence";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await assertPermission("FILE_READ");
  const file = await prisma.file.findFirst({ where: { id: params.id, isVault: false }, select: { id: true, name: true, category: true } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let data = await getDriveIntelligence(file.id);
  if (!data.intelligence) {
    await indexDriveFile(file.id);
    data = await getDriveIntelligence(file.id);
  }
  let duplicateFile: { id: string; name: string } | null = null;
  if (data.duplicateOf) {
    duplicateFile = await prisma.file.findFirst({ where: { id: data.duplicateOf, isVault: false }, select: { id: true, name: true } });
  }
  return NextResponse.json({ currentCategory: file.category, ...data, duplicateFile });
}
