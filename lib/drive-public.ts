import "server-only";
import { prisma } from "@/lib/prisma";

const DISABLED_PREFIX = "drive.public.disabled.";
const TOKEN_PREFIX = "drive.public.token.";

export async function canAccessPublicDriveFile(fileId: string, suppliedToken?: string | null) {
  const [disabled, tokenSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: `${DISABLED_PREFIX}${fileId}` }, select: { value: true } }),
    prisma.appSetting.findUnique({ where: { key: `${TOKEN_PREFIX}${fileId}` }, select: { value: true } }),
  ]);
  if (disabled) return false;
  if (!tokenSetting) return true;
  return Boolean(suppliedToken) && suppliedToken === tokenSetting.value;
}
