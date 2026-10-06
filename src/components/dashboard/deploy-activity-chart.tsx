"use client";

import { useId } from "react";

import { ChartLoading, useRecharts } from "@/components/charts/use-recharts";

export interface DeployActivityPoint {
  label: string;
  succeeded: number;
  failed: number;
}

/**
 * Two-series stacked area chart (dashboard-01 "interactive area chart" style)
 * of deployments per day. Recharts is lazy-loaded through useRecharts().
 */
export function DeployActivityChart({ data, height = 260 }: { data: DeployActivityPoint[]; height?: number }) {
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
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={okId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={failId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={28}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={{
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            fontSize: 12,
          }}
        />
        <Legend verticalAlign="top" align="right" iconType="circle" height={28} wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="succeeded"
          name="Succeeded"
          stackId="deploys"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill={`url(#${okId})`}
        />
        <Area
          type="monotone"
          dataKey="failed"
          name="Failed / other"
          stackId="deploys"
          stroke="var(--chart-3)"
          strokeWidth={2}
          fill={`url(#${failId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
