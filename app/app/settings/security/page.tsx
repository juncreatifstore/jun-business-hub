import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { sha256 } from "@/lib/hash";
import { SESSION_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { startMfaSetup, confirmMfaSetup, disableMfa, revokeSession, revokeOtherSessions } from "@/services/security";
import { formatDateTime } from "@/lib/utils";
import { generateURI } from "otplib";
import QRCode from "qrcode";
import { ShieldCheck, Smartphone } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SecurityPage({ searchParams }: { searchParams: { setup?: string; recovery?: string } }) {
  const user = await requireUser();
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { mfaEnabled: true, mfaSecret: true } });
  const sessions = await prisma.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  const currentHash = sha256(cookies().get(SESSION_COOKIE)?.value ?? "");

  // Setup in progress: render QR from the (decrypted) pending secret.
  let qrDataUrl: string | null = null;
  if (searchParams.setup === "1" && row?.mfaSecret && !row.mfaEnabled) {
    const secret = decryptSecret(row.mfaSecret);
    const uri = generateURI({ secret, label: user.email, issuer: "JUN Business Hub" });
    qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  }

  // Recovery codes: shown exactly once from a short-lived cookie, then cleared client-side by expiry.
  let recoveryCodes: string[] = [];
  if (searchParams.recovery === "1") {
    try { recoveryCodes = JSON.parse(cookies().get("jun_mfa_recovery")?.value ?? "[]"); } catch { recoveryCodes = []; }
  }

  return (
    <div>
      <PageHeader title="Security" subtitle="Two-factor authentication and active sessions for your account." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Two-factor authentication (TOTP)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {row?.mfaEnabled ? (
              <>
                <p className="flex items-center gap-2 text-sm text-emerald-400"><ShieldCheck className="h-4 w-4" /> MFA is enabled on your account.</p>
                <form action={disableMfa} className="flex items-end gap-3">
                  <Field label="Enter a current code to disable"><Input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={10} className="w-40" /></Field>
                  <Button variant="danger">Disable MFA</Button>
                </form>
              </>
            ) : qrDataUrl ? (
              <>
                <p className="text-sm text-muted2">Scan this QR with Google Authenticator, 1Password, Authy… then enter the 6-digit code.</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="MFA QR code" className="rounded-lg border border-white/10 bg-white p-2" width={220} height={220} />
                <form action={confirmMfaSetup} className="flex items-end gap-3">
                  <Field label="6-digit code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} className="w-32" /></Field>
                  <Button variant="gold">Verify & enable</Button>
                </form>
              </>
            ) : (
              <>
                <p className="text-sm text-muted2">Protect your account with a one-time code from an authenticator app. Recommended (and intended to become mandatory) for SUPER_ADMIN, DIRECTOR, ADMIN, FINANCE, LEGAL and ACCOUNTANT roles.</p>
                <form action={startMfaSetup}><Button variant="primary">Enable MFA</Button></form>
              </>
            )}

            {recoveryCodes.length > 0 ? (
              <div className="rounded-lg border border-gold/40 bg-gold/10 p-4">
                <p className="text-sm font-medium text-gold">Recovery codes — shown only once. Store them safely.</p>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {recoveryCodes.map((c) => <span key={c} className="registry-id text-sm">{c}</span>)}
                </div>
                <p className="mt-2 text-xs text-muted2">Each code works once if you lose your authenticator. They are stored hashed — we cannot show them again.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Active sessions</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-white/5">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{s.userAgent ?? "Unknown device"}</p>
                    <p className="text-xs text-muted2">{s.ip ?? "—"} · started {formatDateTime(s.createdAt)} · expires {formatDateTime(s.expiresAt)}{s.tokenHash === currentHash ? " · this device" : ""}</p>
                  </div>
                  {s.tokenHash === currentHash ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">current</span>
                  ) : (
                    <form action={revokeSession.bind(null, s.id)}><Button variant="danger" size="sm">Revoke</Button></form>
                  )}
                </li>
              ))}
            </ul>
            {sessions.length > 1 ? (
              <form action={revokeOtherSessions} className="mt-4"><Button variant="danger">Revoke all other sessions</Button></form>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
