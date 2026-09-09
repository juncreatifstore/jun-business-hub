import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  subtitle,
  actionHref,
  actionLabel,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-[linear-gradient(135deg,rgba(59,130,246,.07),transparent_35%),rgba(255,255,255,.018)] p-5 shadow-[0_18px_45px_rgba(0,0,0,.12)] sm:p-6">
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-blue-500/[0.045] blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-electric">JUN Business Hub</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
          {subtitle ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted2">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          {actions}
          {actionHref && actionLabel ? (
            <Link href={actionHref}>
              <Button variant="primary" className="rounded-xl shadow-lg shadow-blue-950/20">
                {actionLabel}<ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
