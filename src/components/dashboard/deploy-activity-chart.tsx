"use client";

import { useId } from "react";

import { ChartLoading, useRecharts } from "@/components/charts/use-recharts";

export interface DeployActivityPoint {
  label: string;
  succeeded: number;
  failed: number;
}

interface TooltipEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
}

function ActivityTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1.5 text-muted-foreground">{label}</p>
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
            <span className="flex-1">{entry.name}</span>
            <span className="font-semibold tabular-nums">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityLegend() {
  return (
    <ul className="flex items-center gap-6 text-[13px] text-foreground">
      <li className="flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-[var(--chart-1)]" aria-hidden="true" />
        Succeeded
      </li>
      <li className="flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-[var(--chart-3)]" aria-hidden="true" />
        Failed / Other
      </li>
    </ul>
  );
}

/**
 * Two-series stacked area chart of deployments per day (succeeded in blue, failed / other in red).
 * Recharts is lazy-loaded through useRecharts().
 */
export function DeployActivityChart({ data, height = 215 }: { data: DeployActivityPoint[]; height?: number }) {
  const recharts = useRecharts();
  const uid = useId().replace(/:/g, "");

  if (!recharts) {
    return <ChartLoading className="h-64" />;
  }

  const { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } = recharts;
  const okId = `deploy-ok-${uid}`;
  const failId = `deploy-fail-${uid}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={okId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.85} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.55} />
          </linearGradient>
          <linearGradient id={failId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.6} />
            <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={24}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
        <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={<ActivityTooltip />} />
        <Legend verticalAlign="bottom" align="left" content={<ActivityLegend />} wrapperStyle={{ paddingTop: 8, paddingLeft: 32 }} />
        <Area isAnimationActive={false} type="monotone" dataKey="succeeded" name="Succeeded" stackId="deploys" stroke="var(--chart-1)" strokeWidth={1.5} fill={`url(#${okId})`} />
        <Area isAnimationActive={false} type="monotone" dataKey="failed" name="Failed / Other" stackId="deploys" stroke="var(--chart-3)" strokeWidth={1.5} fill={`url(#${failId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
