import { verifyMfaLogin } from "@/services/security";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default function MfaLoginPage({ searchParams }: { searchParams: { toast_error?: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-night px-6 text-white">
      <div className="w-full max-w-sm">
        <p className="registry-id text-gold">JUN BUSINESS HUB</p>
        <h1 className="mt-2 font-display text-2xl">Two-factor verification</h1>
        <p className="mt-2 text-sm text-white/60">Enter the 6-digit code from your authenticator app, or a 10-character recovery code.</p>
        {searchParams.toast_error ? <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{searchParams.toast_error}</p> : null}
        <form action={verifyMfaLogin} className="mt-6 space-y-4">
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            maxLength={10}
            placeholder="123456"
            className="h-12 w-full rounded-lg border border-white/15 bg-white/5 px-4 text-center text-lg tracking-widest outline-none focus:border-gold"
          />
          <Button type="submit" variant="gold" className="w-full">Verify</Button>
        </form>
        <p className="mt-4 text-center text-xs text-white/40"><a href="/login" className="hover:text-gold">Back to sign in</a></p>
      </div>
    </main>
  );
}
