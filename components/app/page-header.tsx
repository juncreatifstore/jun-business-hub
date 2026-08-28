import Link from "next/link";
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-electric">JUN Business Hub</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted2">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {actions}
        {actionHref && actionLabel ? (
          <Link href={actionHref}><Button variant="primary">{actionLabel}</Button></Link>
        ) : null}
      </div>
    </div>
  );
}
