import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-night p-10 text-white lg:flex">
        <Link href="/" className="font-display text-3xl">JUN</Link>
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Account recovery</p>
          <h1 className="mt-3 max-w-md font-display text-4xl leading-tight">Reset access securely.</h1>
          <p className="mt-4 max-w-md text-white/60">Reset links expire after 30 minutes and can only be used once.</p>
        </div>
        <p className="registry-id text-white/30">JUN Business Hub · secure access</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Forgot password?</h2>
          <p className="mt-1 text-sm text-muted2">Enter your JUN work email.</p>
          <div className="mt-8"><ForgotPasswordForm /></div>
        </div>
      </div>
    </div>
  );
}
