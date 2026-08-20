import Link from "next/link";
import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = String(searchParams.token ?? "");
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-night p-10 text-white lg:flex">
        <Link href="/" className="font-display text-3xl">JUN</Link>
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Account recovery</p>
          <h1 className="mt-3 max-w-md font-display text-4xl leading-tight">Choose a new password.</h1>
          <p className="mt-4 max-w-md text-white/60">For security, reset links expire after 30 minutes and work once.</p>
        </div>
        <p className="registry-id text-white/30">JUN Business Hub · secure access</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Reset password</h2>
          <p className="mt-1 text-sm text-muted2">Use at least 10 characters.</p>
          <div className="mt-8">
            {token ? <ResetPasswordForm token={token} /> : <div className="space-y-4"><p className="text-sm text-red-600">The reset link is missing or invalid.</p><Link className="text-sm underline" href="/forgot-password">Request another link</Link></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
