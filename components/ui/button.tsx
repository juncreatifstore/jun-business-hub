import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

/**
 * One button, six intents. Hierarchy on a page: at most one `primary`,
 * `default` for the main secondary action, `outline`/`ghost` for the rest.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        default: "bg-ink text-canvas shadow-card hover:bg-ink/90",
        primary: "bg-accent text-accent-fg shadow-card hover:bg-accent/90",
        outline: "border border-line-strong bg-surface-1 text-ink hover:bg-surface-2",
        secondary: "border border-line bg-surface-2 text-ink hover:bg-line",
        ghost: "text-ink-2 hover:bg-ink/[0.06] hover:text-ink",
        danger: "bg-danger text-white shadow-card hover:bg-danger/90",
        gold: "border border-gold/40 bg-gold/15 text-ink hover:bg-gold/25",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
export { buttonVariants };
