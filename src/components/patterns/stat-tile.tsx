"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "./motion";
import { LivePulse } from "./live-pulse";

interface StatTileDelta {
  label: string;
  direction: "up" | "down" | "neutral";
}

interface StatTileProps {
  label: string;
  value: number | string;
  /** Formats the animated numeric value for display (e.g. `(n) => n.toFixed(0)`). Ignored when value is a string. */
  formatValue?: (value: number) => string;
  delta?: StatTileDelta;
  /** Compact trend data for the 40px sparkline, oldest first. */
  sparkline?: number[];
  icon?: LucideIcon;
  /** inverse = the one dark hero tile per screen (design-system.md §1) — never use two side by side. */
  variant?: "default" | "inverse";
  /**
   * Tints the icon circle with the violet secondary accent (doc 02 §3.2)
   * instead of brand green — reserve for insight/analytics tiles (trend
   * callouts, data-highlight metrics), never for primary/status metrics.
   * No effect on the `inverse` variant (that icon tint is fixed).
   */
  accent?: "brand" | "blue" | "violet" | "warning";
  /** Shows a LivePulse dot next to the label for continuously-updating tiles. */
  live?: boolean;
  className?: string;
}

const deltaColor: Record<StatTileDelta["direction"], string> = {
  up: "text-success-text",
  down: "text-danger-text",
  neutral: "text-muted-foreground",
};

function Sparkline({
  data,
  variant,
  accent = "brand",
}: {
  data: number[];
  variant: "default" | "inverse";
  accent?: "brand" | "blue" | "violet" | "warning";
}) {
  if (data.length < 2) {
    return null;
  }
  const width = 64;
  const height = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          variant === "inverse" ? "stroke-brand-bright" : "stroke-brand",
          accent === "blue" && variant !== "inverse" && "stroke-info",
          accent === "violet" && variant !== "inverse" && "stroke-accent-2",
          accent === "warning" && variant !== "inverse" && "stroke-warning"
        )}
      />
    </svg>
  );
}

/**
 * micro-label, display-metric, delta chip, optional 40px sparkline
 * (design-system.md §5). `inverse` is the one dark hero tile per screen —
 * never pair two inverse tiles on the same view.
 */
export function StatTile({
  label,
  value,
  formatValue,
  delta,
  sparkline,
  icon: Icon,
  variant = "default",
  accent = "brand",
  live,
  className,
}: StatTileProps) {
  const numericValue = typeof value === "number" ? value : null;
  const animated = useCountUp(numericValue ?? 0);
  const displayValue =
    numericValue === null ? value : (formatValue ?? ((n: number) => Math.round(n).toLocaleString()))(animated);

  const inverse = variant === "inverse";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border p-5",
        inverse
          ? "border-transparent bg-inverse text-text-inverse"
          : "border-border/80 bg-card text-card-foreground",
        className
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "text-[11px] font-medium uppercase tracking-[0.08em]",
              inverse ? "text-text-on-inverse-muted" : "text-muted-foreground"
            )}
          >
            {label}
          </p>
          {live ? <LivePulse /> : null}
        </div>
        <p
          className={cn(
            "mt-1.5 font-mono text-[34px] leading-none font-semibold tracking-tight tabular-nums",
            inverse ? "text-text-inverse" : "text-foreground"
          )}
        >
          {displayValue}
        </p>
        {delta ? (
          <p
            className={cn(
              "mt-2 flex items-center gap-1 text-xs font-medium",
              // R6 a11y fix: axe found neutral-direction delta text failing AA
              // on the inverse tile — deltaColor's tokens were never checked
              // against bg-inverse (only against card/canvas/muted/accent in
              // check-contrast.mjs). up/down aren't currently used on an
              // inverse tile anywhere in the app; if that changes, verify
              // success-text/danger-text against bg-inverse before reusing them.
              inverse && delta.direction === "neutral" ? "text-text-on-inverse-muted" : deltaColor[delta.direction]
            )}
          >
            {delta.direction === "up" ? (
              <ArrowUp className="size-3" />
            ) : delta.direction === "down" ? (
              <ArrowDown className="size-3" />
            ) : null}
            {delta.label}
          </p>
        ) : null}
      </div>
      {sparkline ? (
        <Sparkline data={sparkline} variant={variant} accent={accent} />
      ) : Icon ? (
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            inverse
              ? "bg-white/10 text-brand-bright"
              : accent === "blue"
                ? "bg-info-muted text-info"
                : accent === "violet"
                  ? "bg-accent-2-muted text-accent-2"
                  : accent === "warning"
                    ? "bg-warning-muted text-warning"
                    : "bg-brand-muted text-brand"
          )}
        >
          <Icon className="size-4" />
        </div>
      ) : null}
    </div>
  );
}
