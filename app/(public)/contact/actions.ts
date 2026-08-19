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
  await prisma.contactRequest.create({
    data: {
      firstName: d.firstName,
      lastName: d.lastName,
      phone: d.phone || null,
      email: d.email,
      subject: d.subject,
      department: d.department,
      message: d.message,
      // aiCategory is filled later by the AI classification pipeline (see services/ai)
    },
  });
  return { ok: true, message: "Message received. Our team will reach out shortly." };
}
