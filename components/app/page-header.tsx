import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Page title row. Plain by design: the title is the largest text on the
 * screen and nothing competes with it. Actions sit on the right and wrap
 * under the title on small screens.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actionHref,
  actionLabel,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Optional context line above the title (e.g. a client name). Not a label. */
  eyebrow?: string;
  actionHref?: string;
  actionLabel?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const hasActions = Boolean(children || actions || (actionHref && actionLabel));
  return (
    <section className="mb-5 flex min-w-0 flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow && eyebrow !== "JUN Business Hub" ? (
          <p className="mb-1 truncate text-sm text-ink-3">{eyebrow}</p>
        ) : null}
        <h1 className="max-w-full break-words font-display text-2xl font-medium leading-tight tracking-tight text-ink sm:text-[30px]">
          {title}
        </h1>
        {subtitle ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-ink-2">{subtitle}</p> : null}
      </div>
      {hasActions ? (
        <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
          <div className="flex w-max items-center gap-2 sm:w-auto sm:flex-wrap">
            {children}
            {actions}
            {actionHref && actionLabel ? (
              <Link href={actionHref}>
                <Button variant="primary">{actionLabel}</Button>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
