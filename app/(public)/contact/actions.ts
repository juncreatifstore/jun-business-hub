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

/** Cloudflare Turnstile — enforced only when TURNSTILE_SECRET_KEY is configured. */
async function verifyTurnstile(token: string, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}

export type ContactState = { ok: boolean; errors?: Record<string, string[]>; message?: string };

export async function submitContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimitAsync(`contact:${ip}`, 5, 60_000))) {
    return { ok: false, message: "Too many requests. Try again in a minute." };
  }
  // Honeypot: silently accept so bots learn nothing.
  if (String(formData.get("website") ?? "").trim()) {
    return { ok: true, message: "Message received. Our team will reach out shortly." };
  }
  if (!(await verifyTurnstile(String(formData.get("cf-turnstile-response") ?? ""), ip))) {
    return { ok: false, message: "Verification failed. Please try again." };
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
    await gmailSend(account.id, {
      fromEmail: AUTOMATED_NO_REPLY_EMAIL,
      automated: true,
      to: `${d.firstName} ${d.lastName} <${d.email}>`,
      replyTo: route.alias,
      subject: `We received your message — ${d.subject}`,
      text: [
        `Hello ${d.firstName},`,
        "",
        `Thank you for contacting JUN CREATIF AND TRAVEL LLC. Your request has been routed to our ${route.label} team and a named team member will reply to you shortly.`,
        "",
        `Reference: ${id}`,
        `Subject: ${d.subject}`,
        "",
        `If you need to add anything, simply reply to this email — it reaches ${route.alias}.`,
        "",
        "JUN CREATIF AND TRAVEL LLC",
      ].join("\n"),
    }).catch((error) => logger.warn("contact.ack_delivery_failed", { id, error }));
  } catch (error) {
    logger.warn("contact.alias_delivery_failed", { id, department: d.department, alias: route.alias, error });
  }

  return { ok: true, message: "Message received. Our team will reach out shortly." };
}
