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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted2">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {actions}
        {actionHref && actionLabel ? (
          <Link href={actionHref}><Button variant="primary">{actionLabel}</Button></Link>
        ) : null}
      </div>
    </div>
  );
}
