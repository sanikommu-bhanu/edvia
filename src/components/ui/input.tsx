import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-xl border border-border bg-surface px-4 text-sm text-slate-900 placeholder:text-muted-foreground",
        "focus:border-edvia-400 focus:outline-none focus:ring-2 focus:ring-edvia-100",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
