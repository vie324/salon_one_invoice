import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80 focus-visible:ring-ring",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/60 focus-visible:ring-ring",
  outline:
    "border border-input bg-card text-foreground hover:bg-muted active:bg-muted/80 focus-visible:ring-ring",
  ghost: "text-foreground hover:bg-muted active:bg-muted/80 focus-visible:ring-ring",
  danger:
    "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/80 focus-visible:ring-destructive",
  success:
    "bg-success text-success-foreground shadow-sm hover:bg-success/90 active:bg-success/80 focus-visible:ring-success",
};

/**
 * 高さはスマホで大きめ(指で押しやすい 40〜48px)、md 以上で従来の密度に戻す。
 * Apple/Google のガイドラインでは 44px 前後が最小のタップ領域。
 */
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-xs gap-1.5 md:h-8",
  md: "h-11 px-4 text-sm gap-2 md:h-10",
  lg: "h-12 px-6 text-base gap-2 md:h-11 md:text-sm",
  icon: "h-10 w-10 md:h-9 md:w-9",
};

const base =
  "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-[background-color,color,transform,box-shadow] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

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
