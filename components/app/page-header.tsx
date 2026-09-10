import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  subtitle,
  eyebrow = "JUN Business Hub",
  actionHref,
  actionLabel,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actionHref?: string;
  actionLabel?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative mb-4 min-w-0 overflow-hidden rounded-2xl border border-white/[0.07] bg-[linear-gradient(135deg,rgba(59,130,246,.07),transparent_35%),rgba(255,255,255,.018)] p-4 shadow-[0_18px_45px_rgba(0,0,0,.12)] sm:mb-6 sm:p-6">
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-blue-500/[0.045] blur-3xl" />
      <div className="relative flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-electric sm:text-[10px] sm:tracking-[0.2em]">
            {eyebrow}
          </p>
          <h1 className="max-w-full break-words text-xl font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1.5 max-w-3xl break-words text-xs leading-5 text-muted2 sm:text-sm sm:leading-6">
              {subtitle}
            </p>
          ) : null}
        </div>
        {children || actions || (actionHref && actionLabel) ? (
          <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
            <div className="flex w-max items-center gap-2 sm:w-auto sm:flex-wrap">
              {children}
              {actions}
              {actionHref && actionLabel ? (
                <Link href={actionHref}>
                  <Button variant="primary" className="rounded-xl shadow-lg shadow-blue-950/20">
                    {actionLabel}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
