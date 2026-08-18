import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-edvia-500 text-white shadow-soft hover:bg-edvia-600",
        secondary: "bg-edvia-50 text-edvia-700 hover:bg-edvia-100",
        outline: "border border-border bg-transparent text-slate-700 hover:bg-muted",
        ghost: "bg-transparent text-slate-600 hover:bg-muted",
        destructive: "bg-danger text-white hover:bg-danger/90",
        link: "bg-transparent text-edvia-600 underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-12 px-5",
        sm: "h-9 px-3.5 text-[13px]",
        lg: "h-14 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
