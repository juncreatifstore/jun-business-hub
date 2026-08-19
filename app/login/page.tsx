import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-night p-10 text-white lg:flex">
        <Link href="/" className="font-display text-3xl">JUN</Link>
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">JUN Business Hub</p>
          <h1 className="mt-3 max-w-md font-display text-4xl leading-tight">
            The operating system of JUN CREATIF AND TRAVEL LLC.
          </h1>
          <p className="mt-4 max-w-md text-white/60">
            Clients, cases, documents, payments — one accountable record.
          </p>
        </div>
        <p className="registry-id text-white/30">access is logged · juncreatif.org</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted2">Use your JUN work account.</p>
          <div className="mt-8">
            <LoginForm next={searchParams.next} />
          </div>
        </div>
      </div>
    </div>
  );
}
