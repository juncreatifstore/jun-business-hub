"use server";
import { prisma } from "@/lib/prisma";
import { contactSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export type ContactState = { ok: boolean; errors?: Record<string, string[]>; message?: string };

export async function submitContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`contact:${ip}`, 5, 60_000)) {
    return { ok: false, message: "Too many requests. Try again in a minute." };
  }
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const d = parsed.data;
  await prisma.$executeRaw`
    INSERT INTO "ContactRequest"
      ("id", "firstName", "lastName", "phone", "email", "subject", "department", "message", "createdAt")
    VALUES
      (${crypto.randomUUID()}, ${d.firstName}, ${d.lastName}, ${d.phone || null}, ${d.email}, ${d.subject}, ${d.department}, ${d.message}, NOW())
  `;

  return { ok: true, message: "Message received. Our team will reach out shortly." };
}
