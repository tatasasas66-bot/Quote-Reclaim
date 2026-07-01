import * as React from "react";
import { cn } from "@/lib/utils/cn";

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "brand" | "money";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-line-subtle bg-surface-2 text-ink",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  danger: "border-danger/25 bg-danger/10 text-danger",
  brand: "border-brand/25 bg-brand/10 text-brand",
  money: "border-brand/25 bg-brand/10 text-brand",
};

type BadgeProps = {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
};

export function Badge({ variant = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
