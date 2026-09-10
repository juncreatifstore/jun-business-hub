import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * List filters. One GET form for both layouts:
 *  - desktop: search + controls + Apply in a single row
 *  - mobile: search pill + "Filtres" button; the controls live in a bottom sheet
 *    (kept mounted so their values submit together with the search).
 */
export function FilterBar({
  searchName = "q",
  searchValue = "",
  placeholder = "Rechercher",
  children,
  activeCount = 0,
  resetHref,
  hidden,
  className,
}: {
  searchName?: string;
  searchValue?: string;
  placeholder?: string;
  /** The selects / extra controls. Each should have a `name`. */
  children?: React.ReactNode;
  /** Number of non-default filters currently applied (shown on the mobile button). */
  activeCount?: number;
  resetHref?: string;
  /** Hidden inputs to preserve (e.g. current tab). */
  hidden?: Record<string, string | undefined>;
  className?: string;
}) {
  const hiddenInputs = Object.entries(hidden ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  const search = (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <input
        name={searchName}
        type="search"
        defaultValue={searchValue}
        placeholder={placeholder}
        className="h-10 w-full rounded-full border border-line bg-surface-1 pl-9 pr-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none md:h-9 md:rounded-lg md:text-sm"
      />
    </div>
  );

  return (
    <form className={cn("mb-4", className)}>
      {hiddenInputs}
      {/* Mobile */}
      <div className="flex items-center gap-2 md:hidden">
        {search}
        {children ? (
          <Sheet
            title="Filtres"
            keepMounted
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface-1 text-ink-2 active:bg-surface-2"
            trigger={
              <>
                <SlidersHorizontal className="h-4 w-4" />
                {activeCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-2xs font-bold text-accent-fg">
                    {activeCount}
                  </span>
                ) : null}
              </>
            }
          >
            <div className="space-y-3 [&_select]:h-11 [&_select]:text-[15px]">
              {children}
              <div className="flex gap-2 pt-1">
                <Button variant="primary" size="lg" className="flex-1">
                  Appliquer
                </Button>
                {resetHref && activeCount > 0 ? (
                  <Link href={resetHref} className="flex-1">
                    <Button type="button" variant="outline" size="lg" className="w-full">
                      Réinitialiser
                    </Button>
                  </Link>
                ) : null}
              </div>
            </div>
          </Sheet>
        ) : null}
      </div>
      {/* Desktop */}
      <div className="hidden items-center gap-2 md:flex [&_select]:w-auto [&_select]:min-w-[160px]">
        {search}
        {children}
        <Button variant="outline">Appliquer</Button>
        {resetHref && activeCount > 0 ? (
          <Link href={resetHref}>
            <Button type="button" variant="ghost">
              Réinitialiser
            </Button>
          </Link>
        ) : null}
      </div>
    </form>
  );
}
