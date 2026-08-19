import "server-only";
import { createSign } from "crypto";

/**
 * Real DocuSign provider (eSignature REST v2.1, JWT grant — no interactive login).
 * STATUS: READY — CREDENTIALS REQUIRED:
 *   DOCUSIGN_CLIENT_ID       (Integration Key)
 *   DOCUSIGN_USER_ID         (API user GUID to impersonate)
 *   DOCUSIGN_ACCOUNT_ID
 *   DOCUSIGN_BASE_PATH       (e.g. https://demo.docusign.net or https://na3.docusign.net)
 *   DOCUSIGN_OAUTH_BASE      (account-d.docusign.com for demo, account.docusign.com for prod)
 *   DOCUSIGN_PRIVATE_KEY     (RSA private key, \n-escaped, for the JWT grant)
 *   DOCUSIGN_WEBHOOK_SECRET  (HMAC key configured in DocuSign Connect)
 * One-time consent URL: https://<oauth-base>/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=<id>&redirect_uri=<redirect>
 */

export function docusignConfigured(): boolean {
  return Boolean(
    process.env.DOCUSIGN_CLIENT_ID &&
      process.env.DOCUSIGN_USER_ID &&
      process.env.DOCUSIGN_ACCOUNT_ID &&
      process.env.DOCUSIGN_BASE_PATH &&
      process.env.DOCUSIGN_PRIVATE_KEY
  );
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** OAuth JWT grant → access token (cached ~50 min). */
let cached: { token: string; exp: number } | null = null;
export async function docusignAccessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const oauthBase = process.env.DOCUSIGN_OAUTH_BASE ?? "account-d.docusign.com";
  const now = Math.floor(Date.now() / 1000);
  const headerB = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimB = b64url(
    JSON.stringify({
      iss: process.env.DOCUSIGN_CLIENT_ID,
      sub: process.env.DOCUSIGN_USER_ID,
      aud: oauthBase,
      iat: now,
      exp: now + 3600,
      scope: "signature impersonation",
    })
  );
  const key = (process.env.DOCUSIGN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const signer = createSign("RSA-SHA256");
  signer.update(`${headerB}.${claimB}`);
  const jwt = `${headerB}.${claimB}.${b64url(signer.sign(key))}`;

  const res = await fetch(`https://${oauthBase}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`DocuSign auth failed: ${await res.text()}`);
  const t = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}

function api(path: string) {
  return `${process.env.DOCUSIGN_BASE_PATH}/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}${path}`;
}

/** Create and send an envelope with the final PDF; signers get anchor-less signing on last page. */
export async function docusignCreateEnvelope(input: {
  documentId: string; // JUN-CTR-…
  title: string;
  pdfBytes: Uint8Array;
  signers: { name: string; email: string; order: number }[];
}): Promise<{ envelopeId: string }> {
  const token = await docusignAccessToken();
  const res = await fetch(api("/envelopes"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      emailSubject: `Signature request — ${input.title} (${input.documentId})`,
      status: "sent",
      documents: [{ documentBase64: Buffer.from(input.pdfBytes).toString("base64"), name: `${input.documentId}.pdf`, fileExtension: "pdf", documentId: "1" }],
      recipients: {
        signers: input.signers.map((s, i) => ({
          email: s.email,
          name: s.name,
          recipientId: String(i + 1),
          routingOrder: String(s.order),
          tabs: { signHereTabs: [{ documentId: "1", pageNumber: "1", xPosition: "72", yPosition: "700" }] },
        })),
      },
    }),
  });
  if (!res.ok) throw new Error(`DocuSign envelope failed: ${await res.text()}`);
  const data = (await res.json()) as { envelopeId: string };
  return { envelopeId: data.envelopeId };
}

/** Download the combined signed PDF for a completed envelope. */
export async function docusignSignedPdf(envelopeId: string): Promise<Uint8Array> {
  const token = await docusignAccessToken();
  const res = await fetch(api(`/envelopes/${envelopeId}/documents/combined`), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`DocuSign signed PDF fetch failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function docusignVoid(envelopeId: string, reason: string): Promise<void> {
  const token = await docusignAccessToken();
  const res = await fetch(api(`/envelopes/${envelopeId}`), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "voided", voidedReason: reason.slice(0, 200) }),
  });
  if (!res.ok) throw new Error(`DocuSign void failed: ${await res.text()}`);
}
