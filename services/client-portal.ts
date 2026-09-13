"use server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRefundClaimLink, claimUrl } from "@/lib/refund-claims";

/** Connected client opens a refund claim form for themselves (no e-mail round trip needed). */
export async function startClientRefund(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") redirect("/login");
  const account = await prisma.clientAccount.findUnique({
    where: { userId: user.id },
    select: { clientId: true },
  });
  if (!account) redirect("/login");
  const existing = await prisma.refundClaim.findFirst({
    where: { clientId: account.clientId, status: "SENT", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) redirect(claimUrl(existing.token));
  const requester = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "FINANCE", "DIRECTOR"] }, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!requester) redirect("/client?toast_error=Service%20indisponible");
  const claim = await createRefundClaimLink({
    clientId: account.clientId,
    requestedById: requester.id,
    language: "fr",
    message: "Demande initiée depuis le portail client.",
  });
  redirect(claimUrl(claim.token));
}
