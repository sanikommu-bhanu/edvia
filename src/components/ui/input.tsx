import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        // text-base (16px) is NOT a style choice — below 16px, iOS Safari
        // zooms the whole viewport when the field takes focus, which throws
        // the user out of the layout on every single form. The base rule in
        // globals.css sets the same floor, but a Tailwind utility beats a
        // @layer base rule, so it has to be correct HERE too.
        // Verified in-browser: computed font-size must be >= 16px.
        "h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-slate-900",
        "placeholder:text-muted-foreground",
        "focus:border-edvia-400 focus:outline-none focus:ring-2 focus:ring-edvia-100",
        // Desktop has no zoom behaviour to defend against, so the field can
        // settle back to the denser scale there.
        "lg:text-[15px]",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
