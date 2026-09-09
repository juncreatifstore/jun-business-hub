import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric/60 focus-visible:ring-offset-2 focus-visible:ring-offset-night disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        default: "bg-night text-white shadow-sm hover:bg-night-soft",
        primary: "bg-electric text-white shadow-md shadow-blue-950/20 hover:brightness-110",
        outline: "border border-line bg-white hover:border-white/15 hover:bg-surface",
        ghost: "hover:bg-white/[0.05]",
        danger: "bg-red-600 text-white shadow-sm shadow-red-950/20 hover:bg-red-500",
        gold: "border border-gold/40 bg-gold/15 text-gold hover:bg-gold/25",
        secondary: "border border-line bg-surface hover:bg-white/[0.05]",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
export { buttonVariants };
