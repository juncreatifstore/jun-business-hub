import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-night-soft/45 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-line bg-white/[0.025] text-left text-[10px] uppercase tracking-[0.14em] text-muted2">{children}</thead>;
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-4 py-3 font-medium", className)} {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-line transition last:border-0 hover:bg-white/[0.025]", className)} {...props} />;
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}
