import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
            "flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-1 text-ink-3 transition hover:bg-surface-2 hover:text-ink",
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
                "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-medium transition tabular-nums",
                p === page
                  ? "border-ink bg-ink text-canvas"
                  : "border-line bg-surface-1 text-ink-3 hover:bg-surface-2 hover:text-ink",
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
            "flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-1 text-ink-3 transition hover:bg-surface-2 hover:text-ink",
            page >= totalPages && "pointer-events-none opacity-35",
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </nav>
  );
}

/** Edge-to-edge container for mobile rows. Use instead of `grid gap-3`. */
export function RecordList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "-mx-4 divide-y divide-line border-y border-line bg-surface-1 sm:-mx-6 md:mx-0 md:rounded-xl md:border",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One list row (mobile). Reads top-to-bottom: title, subtitle, then a compact
 * meta line built from RecordField children. A chevron signals the row is a link.
 */
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
  const body = (
    <>
      {leading ? <div className="shrink-0 self-center">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-ink">{title}</div>
            {subtitle ? <div className="mt-0.5 truncate text-xs text-ink-3">{subtitle}</div> : null}
          </div>
          {badges ? <div className="flex shrink-0 flex-wrap justify-end gap-1">{badges}</div> : null}
        </div>
        {children ? (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">{children}</div>
        ) : null}
        {footer ? <div className="mt-1 text-xs text-ink-3">{footer}</div> : null}
      </div>
      {href ? <ChevronRight className="h-4 w-4 shrink-0 self-center text-ink-3" /> : null}
    </>
  );
  const cls = cn("flex items-start gap-3 bg-surface-1 px-4 py-3", href && "active:bg-surface-2", className);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <article className={cls}>{body}</article>
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
    <span className="inline-flex max-w-full items-baseline gap-1">
      <span className="text-ink-3">{label}</span>
      <span className={cn("truncate font-medium text-ink-2", valueClassName)}>{value}</span>
    </span>
  );
}
