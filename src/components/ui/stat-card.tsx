import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import * as React from "react";
import { Card } from "./card";
import { cn } from "@/lib/utils";

/** KPIタイル。大きな数値 + ラベル + 任意で前月比。テキストはインク色のみ。 */
export function StatCard({
  label,
  value,
  sub,
  delta,
  icon,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: number | null;
  icon?: React.ReactNode;
  accent?: "primary" | "success" | "warning" | "danger";
}) {
  const accentBar =
    accent === "success"
      ? "before:bg-success"
      : accent === "warning"
        ? "before:bg-warning"
        : accent === "danger"
          ? "before:bg-destructive"
          : "before:bg-primary";
  return (
    <Card
      className={cn(
        "relative overflow-hidden p-5",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        accentBar,
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
      </div>
      <div className="mt-2 tabular text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {typeof delta === "number" && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              delta >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(delta * 100).toFixed(1)}%
          </span>
        )}
        {sub && <span className="text-muted-foreground">{sub}</span>}
      </div>
    </Card>
  );
}
