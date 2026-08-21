import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import type { OnlinePaymentProvider } from "@/lib/finance-online-payments";

export type CheckoutRequest = {
  provider: OnlinePaymentProvider;
  sessionId: string;
  paymentId: string;
  publicToken: string;
  amount: number;
  currency: string;
  description: string;
  clientName: string;
  clientEmail?: string | null;
  expiresAt: string;
};

export type CheckoutResult = {
  providerSessionId: string;
  checkoutUrl: string;
};

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function money(value: number) {
  return value.toFixed(2);
}

function stripeMinorUnits(amount: number, currency: string) {
  const zeroDecimal = new Set(["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]);
  return Math.round(amount * (zeroDecimal.has(currency.toUpperCase()) ? 1 : 100));
}

async function stripeCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe is not configured");
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", `${appUrl()}/pay/${encodeURIComponent(req.publicToken)}?result=success`);
  body.set("cancel_url", `${appUrl()}/pay/${encodeURIComponent(req.publicToken)}?result=cancel`);
  body.set("client_reference_id", req.sessionId);
  body.set("line_items[0][price_data][currency]", req.currency.toLowerCase());
  body.set("line_items[0][price_data][product_data][name]", req.description.slice(0, 120));
  body.set("line_items[0][price_data][unit_amount]", String(stripeMinorUnits(req.amount, req.currency)));
  body.set("line_items[0][quantity]", "1");
  body.set("metadata[jun_session_id]", req.sessionId);
  body.set("metadata[payment_id]", req.paymentId);
  body.set("payment_intent_data[metadata][jun_session_id]", req.sessionId);
  body.set("payment_intent_data[metadata][payment_id]", req.paymentId);
  if (req.clientEmail) body.set("customer_email", req.clientEmail);
  body.set("expires_at", String(Math.floor(new Date(req.expiresAt).getTime() / 1000)));
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const data = await res.json();
  if (!res.ok || !data?.id || !data?.url) throw new Error(data?.error?.message || "Stripe checkout creation failed");
  return { providerSessionId: String(data.id), checkoutUrl: String(data.url) };
}

function paypalBase() {
  return String(process.env.PAYPAL_ENV || "sandbox").toLowerCase() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export async function paypalAccessToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal is not configured");
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", cache: "no-store" });
  const data = await res.json();
  if (!res.ok || !data?.access_token) throw new Error(data?.error_description || "PayPal authentication failed");
  return String(data.access_token);
}

async function paypalCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": req.sessionId.slice(0, 36) },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ reference_id: req.sessionId, custom_id: req.paymentId, description: req.description.slice(0, 127), amount: { currency_code: req.currency.toUpperCase(), value: money(req.amount) } }],
      application_context: { return_url: `${appUrl()}/api/payments/online/${encodeURIComponent(req.publicToken)}/paypal-return`, cancel_url: `${appUrl()}/pay/${encodeURIComponent(req.publicToken)}?result=cancel`, user_action: "PAY_NOW" },
    }),
    cache: "no-store",
  });
  const data = await res.json();
  const approval = Array.isArray(data?.links) ? data.links.find((l: any) => l?.rel === "approve")?.href : null;
  if (!res.ok || !data?.id || !approval) throw new Error(data?.message || "PayPal order creation failed");
  return { providerSessionId: String(data.id), checkoutUrl: String(approval) };
}

export async function capturePaypalOrder(orderId: string) {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": `capture-${orderId}`.slice(0, 36) }, body: "{}", cache: "no-store" });
  const data = await res.json();
  if (!res.ok && res.status !== 422) throw new Error(data?.message || "PayPal capture failed");
  const captureId = data?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
  return { completed: data?.status === "COMPLETED", captureId: captureId ? String(captureId) : null, raw: data };
}

async function mercadoPagoCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) throw new Error("Mercado Pago is not configured");
  const now = new Date();
  const expires = new Date(req.expiresAt);
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": req.sessionId },
    body: JSON.stringify({
      items: [{ id: req.paymentId, title: req.description.slice(0, 120), quantity: 1, currency_id: req.currency.toUpperCase(), unit_price: Number(money(req.amount)) }],
      payer: req.clientEmail ? { email: req.clientEmail, name: req.clientName } : undefined,
      external_reference: req.sessionId,
      notification_url: `${appUrl()}/api/webhooks/mercado-pago`,
      back_urls: {
        success: `${appUrl()}/pay/${encodeURIComponent(req.publicToken)}?result=success`,
        pending: `${appUrl()}/pay/${encodeURIComponent(req.publicToken)}?result=pending`,
        failure: `${appUrl()}/pay/${encodeURIComponent(req.publicToken)}?result=failure`,
      },
      auto_return: "approved",
      expires: true,
      expiration_date_from: now.toISOString(),
      expiration_date_to: expires.toISOString(),
    }),
    cache: "no-store",
  });
  const data = await res.json();
  const url = data?.init_point || data?.sandbox_init_point;
  if (!res.ok || !data?.id || !url) throw new Error(data?.message || data?.error || "Mercado Pago preference creation failed");
  return { providerSessionId: String(data.id), checkoutUrl: String(url) };
}

export async function createProviderCheckout(req: CheckoutRequest) {
  if (req.provider === "STRIPE") return stripeCheckout(req);
  if (req.provider === "PAYPAL") return paypalCheckout(req);
  return mercadoPagoCheckout(req);
}

export async function cancelProviderCheckout(provider: OnlinePaymentProvider, providerSessionId: string | null) {
  if (!providerSessionId) return;
  try {
    if (provider === "STRIPE") {
      const secret = process.env.STRIPE_SECRET_KEY;
      if (!secret) return;
      await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(providerSessionId)}/expire`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
    } else if (provider === "MERCADO_PAGO") {
      const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!token) return;
      await fetch(`https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(providerSessionId)}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ expires: true, expiration_date_to: new Date().toISOString() }), cache: "no-store" });
    }
  } catch {}
}

export function verifyStripeWebhook(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const fields = signatureHeader.split(",").map((p) => p.split("="));
  const timestamp = fields.find(([k]) => k === "t")?.[1];
  const signatures = fields.filter(([k]) => k === "v1").map(([, v]) => v).filter(Boolean);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return signatures.some((sig) => {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function verifyPaypalWebhook(headers: Headers, event: unknown) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const token = await paypalAccessToken();
  const body = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: event,
  };
  const res = await fetch(`${paypalBase()}/v1/notifications/verify-webhook-signature`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await res.json();
  return res.ok && data?.verification_status === "SUCCESS";
}

export function verifyMercadoPagoWebhook(xSignature: string | null, xRequestId: string | null, dataId: string | null) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret || !xSignature || !xRequestId || !dataId) return false;
  const parts = Object.fromEntries(xSignature.split(",").map((part) => part.trim().split("=")));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const normalizedId = dataId.toLowerCase();
  const manifest = `id:${normalizedId};request-id:${xRequestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function fetchMercadoPagoPayment(paymentId: string) {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) throw new Error("Mercado Pago is not configured");
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Unable to read Mercado Pago payment");
  return data;
}
