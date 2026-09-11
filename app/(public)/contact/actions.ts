"use server";
import { prisma } from "@/lib/prisma";
import { contactSchema } from "@/lib/validation";
import { rateLimitAsync } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { contactAliasFor } from "@/lib/contact-routing";
import { AUTOMATED_NO_REPLY_EMAIL } from "@/lib/email-aliases";
import { resolveOtpSenderMailbox } from "@/lib/mail-otp-sender";
import { gmailSend } from "@/lib/google/gmail";
import { logger } from "@/lib/logger";

export type ContactState = { ok: boolean; errors?: Record<string, string[]>; message?: string };

export async function submitContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimitAsync(`contact:${ip}`, 5, 60_000))) {
    return { ok: false, message: "Too many requests. Try again in a minute." };
  }
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const d = parsed.data;
  const id = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "ContactRequest"
      ("id", "firstName", "lastName", "phone", "email", "subject", "department", "message", "createdAt")
    VALUES
      (${id}, ${d.firstName}, ${d.lastName}, ${d.phone || null}, ${d.email}, ${d.subject}, ${d.department}, ${d.message}, NOW())
  `;

  // Deliver the request to the department's alias so it lands in the shared
  // mailbox with the right service badge; the visitor is the Reply-To.
  // Delivery failure never blocks the visitor: the request is already stored.
  const route = contactAliasFor(d.department);
  try {
    const account = await resolveOtpSenderMailbox();
    await gmailSend(account.id, {
      fromEmail: AUTOMATED_NO_REPLY_EMAIL,
      automated: true,
      to: route.alias,
      replyTo: `${d.firstName} ${d.lastName} <${d.email}>`,
      subject: `[Contact · ${route.label}] ${d.subject}`,
      text: [
        `New contact request from the website — ${route.label}`,
        "",
        `Name: ${d.firstName} ${d.lastName}`,
        `Email: ${d.email}`,
        `Phone: ${d.phone || "—"}`,
        `Department: ${route.label} (${route.alias})`,
        `Request ID: ${id}`,
        "",
        "Message:",
        d.message,
        "",
        "Reply to this email to answer the visitor directly.",
      ].join("\n"),
    });
  } catch (error) {
    logger.warn("contact.alias_delivery_failed", { id, department: d.department, alias: route.alias, error });
  }

  return { ok: true, message: "Message received. Our team will reach out shortly." };
}
