import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Trend = "up" | "down" | "neutral";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Small pill in the card's top-right corner, e.g. "+12.5%" or "2 / 3". */
  badge?: { label: string; trend?: Trend };
  /** Bold first line of the footer. */
  footerTitle?: string;
  /** Muted second line of the footer. */
  footerDescription?: string;
  className?: string;
}

const TREND_CLASS: Record<Trend, string> = {
  up: "text-success-text",
  down: "text-danger-text",
  neutral: "text-muted-foreground",
};

/**
 * Dashboard summary card (dashboard-01 "section cards"): label, large value,
 * trend badge, and a two-line footer. Composed entirely from shadcn Card parts.
 */
export function StatCard({ label, value, icon: Icon, badge, footerTitle, footerDescription, className }: StatCardProps) {
  const trend = badge?.trend ?? "neutral";
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null;

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
          {label}
        </CardDescription>
        <CardTitle className="font-mono text-3xl font-semibold tabular-nums">{value}</CardTitle>
        {badge ? (
          <CardAction>
            <Badge variant="outline" className={TREND_CLASS[trend]}>
              {TrendIcon ? <TrendIcon aria-hidden="true" /> : null}
              {badge.label}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      {footerTitle || footerDescription ? (
        <CardFooter className="flex-col items-start gap-1 text-sm">
          {footerTitle ? <div className="font-medium text-foreground">{footerTitle}</div> : null}
          {footerDescription ? <div className="text-muted-foreground">{footerDescription}</div> : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="gap-4" aria-hidden="true">
      <CardHeader>
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-8 w-20 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardFooter className="flex-col items-start gap-2">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
      </CardFooter>
    </Card>
  );
}
