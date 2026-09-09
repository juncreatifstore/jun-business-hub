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

export default async function SecurityPage({ searchParams }: { searchParams: { setup?: string } }) {
  const user = await requireUser();
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { mfaEnabled: true, mfaSecret: true } });
  const sessions = await prisma.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  const currentHash = sha256(cookies().get(SESSION_COOKIE)?.value ?? "");

  let qrDataUrl: string | null = null;
  if (searchParams.setup === "1" && row?.mfaSecret && !row.mfaEnabled) {
    const secret = decryptSecret(row.mfaSecret);
    const uri = generateURI({ secret, label: user.email, issuer: "JUN Business Hub" });
    qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Sécurité" subtitle="Authentification à deux facteurs et sessions actives de votre compte." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Authentification à deux facteurs (TOTP)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {row?.mfaEnabled ? (
              <>
                <p className="flex items-center gap-2 text-sm text-emerald-400"><ShieldCheck className="h-4 w-4 shrink-0" /> MFA est activé sur votre compte.</p>
                <form action={disableMfa} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <Field label="Code actuel pour désactiver"><Input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} className="w-full sm:w-40" /></Field>
                  <Button variant="danger" className="w-full sm:w-auto">Désactiver MFA</Button>
                </form>
              </>
            ) : qrDataUrl ? (
              <>
                <p className="text-sm text-muted2">Scannez ce QR avec Google Authenticator, 1Password ou Authy, puis saisissez le code à 6 chiffres.</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="flex justify-center sm:justify-start"><img src={qrDataUrl} alt="QR code MFA" className="h-auto w-full max-w-[220px] rounded-xl border border-white/10 bg-white p-2" width={220} height={220} /></div>
                <form action={confirmMfaSetup} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <Field label="Code à 6 chiffres"><Input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} className="w-full sm:w-32" /></Field>
                  <Button variant="gold" className="w-full sm:w-auto">Vérifier et activer</Button>
                </form>
              </>
            ) : (
              <>
                <p className="text-sm text-muted2">Protégez votre compte avec un code temporaire généré par une application d’authentification.</p>
                <form action={startMfaSetup}><Button variant="primary" className="w-full sm:w-auto">Activer MFA</Button></form>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sessions actives</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-white/5">
              {sessions.map((s) => (
                <li key={s.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{s.userAgent ?? "Appareil inconnu"}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-muted2">{s.ip ?? "—"} · début {formatDateTime(s.createdAt)} · expire {formatDateTime(s.expiresAt)}{s.tokenHash === currentHash ? " · cet appareil" : ""}</p>
                  </div>
                  {s.tokenHash === currentHash ? (
                    <span className="w-fit rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">Session actuelle</span>
                  ) : (
                    <form action={revokeSession.bind(null, s.id)}><Button variant="danger" size="sm" className="w-full sm:w-auto">Révoquer</Button></form>
                  )}
                </li>
              ))}
            </ul>
            {sessions.length > 1 ? <form action={revokeOtherSessions} className="mt-4"><Button variant="danger" className="w-full sm:w-auto">Révoquer les autres sessions</Button></form> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
