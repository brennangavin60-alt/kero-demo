import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-[linear-gradient(135deg,hsl(var(--primary))_0%,hsl(var(--accent))_100%)] text-primary-foreground shadow-soft ring-1 ring-white/20 hover:-translate-y-0.5 hover:shadow-elevated",
        secondary: "bg-secondary/90 text-secondary-foreground ring-1 ring-slate-200/70 backdrop-blur hover:bg-secondary",
        outline: "border border-slate-200/80 bg-white/75 text-slate-800 shadow-soft backdrop-blur-xl hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white/95 hover:text-primary hover:shadow-elevated",
        ghost: "text-slate-700 hover:bg-white/75 hover:text-primary hover:shadow-soft",
        destructive: "border border-red-200 bg-white/90 text-red-700 shadow-soft hover:-translate-y-0.5 hover:bg-red-50 hover:shadow-elevated",
        success: "bg-[linear-gradient(135deg,hsl(var(--primary))_0%,hsl(var(--accent))_100%)] text-primary-foreground shadow-soft ring-1 ring-white/20 hover:-translate-y-0.5 hover:shadow-elevated"
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "h-10 w-10 p-0 sm:h-9 sm:w-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
