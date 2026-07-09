import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:ring-ring",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring",
  outline:
    "border border-input bg-card text-foreground hover:bg-muted focus-visible:ring-ring",
  ghost: "text-foreground hover:bg-muted focus-visible:ring-ring",
  danger:
    "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive",
  success:
    "bg-success text-success-foreground shadow-sm hover:bg-success/90 focus-visible:ring-success",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-sm gap-2",
  icon: "h-9 w-9",
};

const base =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

/** Link などにボタン見た目を付与するためのクラスヘルパー */
export function buttonClasses(opts?: { variant?: Variant; size?: Size; className?: string }) {
  return cn(base, variants[opts?.variant ?? "primary"], sizes[opts?.size ?? "md"], opts?.className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button ref={ref} className={buttonClasses({ variant, size, className })} {...props} />
  ),
);
Button.displayName = "Button";
