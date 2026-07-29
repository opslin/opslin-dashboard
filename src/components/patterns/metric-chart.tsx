"use client";

import { useId } from "react";
import { ChartLoading, useRecharts } from "@/components/charts/use-recharts";

/**
 * recharts wrappers matching design-system.md §5: no gridline clutter
 * (horizontal hairlines only), accent-bright fills at 85% opacity, rounded
 * bar tops (4px), area charts with a 12%→0 gradient fill, animated draw-in
 * 400ms once per mount. Always behind the existing useRecharts() lazy-load
 * hook — never a static recharts import (perf law).
 */

const CHART_COLOR = "var(--chart-1)";

interface SeriesPoint {
  label: string;
  value: number;
}

interface MetricChartProps {
  data: SeriesPoint[];
  height?: number;
  color?: string;
  className?: string;
}

export function AreaMetricChart({ data, height = 200, color = CHART_COLOR, className }: MetricChartProps) {
  const recharts = useRecharts();
  const gradientId = `area-gradient-${useId().replace(/:/g, "")}`;

  if (!recharts) {
    return <ChartLoading className={className} />;
  }

  const { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } = recharts;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.12} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={32} />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--opslin-radius-md)",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive
            animationDuration={400}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarMetricChart({ data, height = 200, color = CHART_COLOR, className }: MetricChartProps) {
  const recharts = useRecharts();

  if (!recharts) {
    return <ChartLoading className={className} />;
  }

  const { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } = recharts;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={32} />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--opslin-radius-md)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" fill={color} fillOpacity={0.85} radius={[4, 4, 0, 0]} isAnimationActive animationDuration={400} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
