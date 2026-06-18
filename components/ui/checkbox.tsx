import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, ...props }, ref) => (
    <span className="relative inline-flex h-5 w-5 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        className={cn("peer sr-only", className)}
        {...props}
      />
      <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-white shadow-soft transition-all duration-200 peer-checked:scale-105 peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
        <Check
          className={cn(
            "h-3.5 w-3.5 transition-all duration-200",
            checked ? "scale-100 opacity-100" : "scale-50 opacity-0"
          )}
        />
      </span>
    </span>
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
