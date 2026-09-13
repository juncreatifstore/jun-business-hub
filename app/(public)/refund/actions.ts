"use server";
import { headers } from "next/headers";
import { rateLimitAsync } from "@/lib/rate-limit";
import { requestRefundFormByEmail } from "@/lib/refund-claims";

export type RefundStartState = { ok: boolean; message?: string };

export async function startRefundRequest(
  _prev: RefundStartState,
  formData: FormData,
): Promise<RefundStartState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimitAsync(`refundstart:${ip}`, 5, 15 * 60_000)))
    return { ok: false, message: "Trop de tentatives. Réessayez dans quelques minutes." };
  if (String(formData.get("website") ?? "").trim()) return { ok: true };
  const email = String(formData.get("email") ?? "")
    .trim()
    .slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Adresse e-mail invalide." };
  const reference =
    String(formData.get("reference") ?? "")
      .trim()
      .slice(0, 60) || null;
  const language = String(formData.get("language") ?? "fr") === "en" ? "en" : "fr";
  await requestRefundFormByEmail(email, reference, language).catch(() => null);
  return { ok: true };
}
