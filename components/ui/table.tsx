import { cn } from "@/lib/utils";

/** Data table for lists: quiet header, hairline rows, hover highlight.
 *  Numbers should be right-aligned by the caller (`className="text-right tabular-nums"`). */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface-1 shadow-card">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-line bg-surface-2 text-left text-xs font-medium text-ink-2">
      {children}
    </thead>
  );
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-4 py-2.5 font-medium", className)} {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-b border-line last:border-0 hover:bg-surface-2/70", className)} {...props} />
  );
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}
