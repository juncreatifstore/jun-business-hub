import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export function ListCount({ shown, total, label }: { shown: number; total: number; label: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted2">
      <span>
        <strong className="font-semibold text-ink-2">{total}</strong> {label}
        {total === 1 ? "" : "s"}
      </span>
      {shown !== total ? (
        <span>
          {shown} affiché{shown === 1 ? "" : "s"} sur cette page
        </span>
      ) : null}
    </div>
  );
}

function hrefWith(basePath: string, params: Record<string, string | undefined>, page: number) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && key !== "page") sp.set(key, value);
  });
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return `${basePath}${qs ? `?${qs}` : ""}`;
}

export function Pagination({
  basePath,
  page,
  totalPages,
  params = {},
}: {
  basePath: string;
  page: number;
  totalPages: number;
  params?: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from(
    new Set([1, page - 1, page, page + 1, totalPages].filter((p) => p >= 1 && p <= totalPages)),
  ).sort((a, b) => a - b);

  return (
    <nav
      className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
      aria-label="Pagination"
    >
      <p className="text-xs text-muted2">
        Page <strong className="text-ink-2">{page}</strong> sur{" "}
        <strong className="text-ink-2">{totalPages}</strong>
      </p>
      <div className="flex items-center gap-1.5">
        <Link
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          href={page <= 1 ? "#" : hrefWith(basePath, params, page - 1)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-ink/[0.025] text-ink-3 transition hover:bg-ink/[0.055] hover:text-ink",
            page <= 1 && "pointer-events-none opacity-35",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        {pages.map((p, index) => (
          <span key={p} className="contents">
            {index > 0 && p - pages[index - 1] > 1 ? (
              <span className="px-1 text-xs text-ink-2">…</span>
            ) : null}
            <Link
              href={hrefWith(basePath, params, p)}
              className={cn(
                "flex h-9 min-w-9 items-center justify-center rounded-xl border px-2 text-xs font-medium transition",
                p === page
                  ? "border-blue-400/30 bg-blue-500/12 text-accent"
                  : "border-line bg-ink/[0.025] text-ink-3 hover:bg-ink/[0.055] hover:text-ink",
              )}
            >
              {p}
            </Link>
          </span>
        ))}
        <Link
          aria-disabled={page >= totalPages}
          tabIndex={page >= totalPages ? -1 : undefined}
          href={page >= totalPages ? "#" : hrefWith(basePath, params, page + 1)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-ink/[0.025] text-ink-3 transition hover:bg-ink/[0.055] hover:text-ink",
            page >= totalPages && "pointer-events-none opacity-35",
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </nav>
  );
}

export function RecordCard({
  href,
  title,
  subtitle,
  leading,
  badges,
  children,
  footer,
  className,
}: {
  href?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  badges?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const card = (
    <article
      className={cn(
        "rounded-2xl border border-line bg-surface-1 p-4 shadow-card transition",
        href && "hover:border-blue-400/20 hover:bg-surface-1",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{title}</div>
              {subtitle ? <div className="mt-1 text-xs text-ink-3">{subtitle}</div> : null}
            </div>
            {href ? <MoreHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" /> : null}
          </div>
          {badges ? <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div> : null}
        </div>
      </div>
      {children ? <div className="mt-4 grid gap-2 border-t border-line pt-3 text-xs">{children}</div> : null}
      {footer ? <div className="mt-3 border-t border-line pt-3 text-xs text-ink-3">{footer}</div> : null}
    </article>
  );
  return href ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

export function RecordField({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-ink-2">{label}</span>
      <span className={cn("max-w-[68%] text-right font-medium text-ink-2", valueClassName)}>{value}</span>
    </div>
  );
}
