import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, Triangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "blue" | "violet" | "green" | "red";
type PillTone = "success" | "warning" | "danger" | "info" | "neutral";

const TILE: Record<Tone, string> = {
  blue: "bg-primary/10 text-primary",
  violet: "bg-chart-violet/15 text-chart-violet-text",
  green: "bg-success-muted text-success-text",
  red: "bg-danger-muted text-danger-text",
};

const BAR: Record<Tone, string> = {
  blue: "bg-primary",
  violet: "bg-chart-violet",
  green: "bg-success",
  red: "bg-danger",
};

const PILL: Record<PillTone, { box: string; dot: string }> = {
  success: { box: "bg-success-muted text-success-text", dot: "bg-success" },
  warning: { box: "bg-warning-muted text-warning-text", dot: "bg-warning" },
  danger: { box: "bg-danger-muted text-danger-text", dot: "bg-danger" },
  info: { box: "bg-info-muted text-info-text", dot: "bg-info" },
  neutral: { box: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground" },
};

export interface Bar {
  /** 0..1 relative height. */
  value: number;
  /** Drawn faded, e.g. an offline server. */
  muted?: boolean;
}

/** Row of small rounded bars (decorative; the footer text carries the meaning). */
export function MiniBars({ bars, tone }: { bars: Bar[]; tone: Tone }) {
  return (
    <div className="flex h-7 items-end justify-between" aria-hidden="true">
      {bars.map((bar, index) => (
        <span
          key={index}
          className={cn("w-[5px] shrink-0 rounded-[2px]", BAR[tone], bar.muted ? "opacity-25" : "opacity-85")}
          style={{ height: `${Math.max(14, Math.round(bar.value * 100))}%` }}
        />
      ))}
    </div>
  );
}

interface OverviewStatCardProps {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  value: number | string;
  /** Rendered as "value / total" with the total in a lighter weight. */
  total?: number | string;
  pill: { label: string; tone: PillTone; marker: "dot" | "up" | "down" };
  bars: Bar[];
  footerTitle: string;
  footerDescription: string;
}

/** Overview summary card: tinted round icon, label, big value, status pill, mini bars, two-line footer. */
export function OverviewStatCard({ href, label, icon: Icon, tone, value, total, pill, bars, footerTitle, footerDescription }: OverviewStatCardProps) {
  const palette = PILL[pill.tone];
  return (
    <Link href={href} aria-label={`${label}: ${value}${total !== undefined ? ` of ${total}` : ""}`} className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full gap-0 p-4 transition-shadow group-hover:shadow-md">
        <div className="flex items-start gap-4">
          <span className={cn("flex size-[52px] shrink-0 items-center justify-center rounded-full", TILE[tone])}>
            <Icon className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-[13px] text-muted-foreground">{label}</p>
            <p className="mt-1 text-[26px] font-bold leading-none tabular-nums text-foreground">
              {value}
              {total !== undefined ? <span className="font-normal text-muted-foreground"> / {total}</span> : null}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>

        <span className={cn("mt-3 inline-flex h-6 w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-medium", palette.box)}>
          {pill.marker === "dot" ? (
            <span className={cn("size-1.5 rounded-full", palette.dot)} aria-hidden="true" />
          ) : (
            <Triangle className={cn("size-3 fill-current stroke-0", pill.marker === "down" && "rotate-180")} aria-hidden="true" />
          )}
          {pill.label}
        </span>

        <div className="mt-2">
          <MiniBars bars={bars} tone={tone} />
        </div>

        <div className="mt-2.5 text-[13px]">
          <p className="text-foreground">{footerTitle}</p>
          <p className="text-muted-foreground">{footerDescription}</p>
        </div>
      </Card>
    </Link>
  );
}

export function OverviewStatCardSkeleton() {
  return (
    <Card className="gap-0 p-5" aria-hidden="true">
      <div className="flex items-start gap-4">
        <div className="size-[52px] animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-7 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="mt-4 h-6 w-24 animate-pulse rounded-full bg-muted" />
      <div className="mt-3 h-7 w-full animate-pulse rounded bg-muted" />
      <div className="mt-3 space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      </div>
    </Card>
  );
}
