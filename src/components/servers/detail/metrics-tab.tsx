"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, RotateCw } from "lucide-react";
import { ChartLoading, useRecharts } from "@/components/charts/use-recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatRelativeTime } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const RANGES = ["1h", "24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number];

interface History {
    series: { timestamps: string[]; cpu: number[]; memoryPercent: number[]; netIn: number[]; netOut: number[]; loadAvg1m: number[] };
    peak?: { cpu?: number; memory?: number };
}

interface Current {
    cpu?: { percent?: number; cores?: number; perCore?: Array<{ core: string; idle: number }> };
    memory?: { used?: number; total?: number; percent?: number };
}

function bytesPerSec(value: number) {
    const units = ["B/s", "KB/s", "MB/s", "GB/s"];
    let v = value;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function tickLabel(iso: string, range: Range) {
    const d = new Date(iso);
    return range === "1h" || range === "24h" ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface Line { key: string; name: string; color: string }

function MetricChart({ title, value, hint, data, lines, range, format }: { title: string; value: string; hint: string; data: Array<Record<string, number | string>>; lines: Line[]; range: Range; format: (n: number) => string }) {
    const recharts = useRecharts();
    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="px-5 pt-4">
                <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
                <p className="mt-0.5 flex items-baseline gap-2">
                    <span className="text-2xl font-bold tracking-tight text-foreground">{value}</span>
                    <span className="text-sm text-muted-foreground">{hint}</span>
                </p>
            </div>
            <div className="h-48 px-2 pb-3 pt-2">
                {!recharts ? (
                    <ChartLoading className="h-full" />
                ) : (
                    <recharts.ResponsiveContainer width="100%" height="100%">
                        <recharts.AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                            <recharts.CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                            <recharts.XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={48} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                            <recharts.YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(n: number) => format(n)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                            <recharts.Tooltip formatter={(n) => format(Number(n))} />
                            {lines.map((line) => (
                                <recharts.Area key={line.key} isAnimationActive={false} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} fill={line.color} fillOpacity={0.08} />
                            ))}
                        </recharts.AreaChart>
                    </recharts.ResponsiveContainer>
                )}
            </div>
            {lines.length > 1 ? (
                <ul className="flex gap-4 px-5 pb-3 text-xs text-muted-foreground" aria-label={`${title} legend`}>
                    {lines.map((line) => (
                        <li key={line.key} className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full" style={{ backgroundColor: line.color }} aria-hidden="true" />
                            {line.name}
                        </li>
                    ))}
                </ul>
            ) : null}
            <span className="sr-only">{range}</span>
        </Card>
    );
}

export function MetricsTab({ serverId }: { serverId: string }) {
    const [range, setRange] = useState<Range>("24h");
    const history = useQuery<History | null>({
        queryKey: ["server-history", serverId, range],
        queryFn: async () => {
            const res = await fetch(`${API_URL}/metrics/${serverId}/history?range=${range}`, { credentials: "include" });
            return res.ok ? res.json() : null;
        },
        refetchInterval: 60_000,
    });
    const current = useQuery<Current | null>({
        queryKey: ["server-current-metrics", serverId],
        queryFn: async () => {
            const res = await fetch(`${API_URL}/metrics/${serverId}/current`, { credentials: "include" });
            return res.ok ? res.json() : null;
        },
        refetchInterval: 30_000,
    });

    const series = history.data?.series;
    const points = series?.timestamps?.length ?? 0;
    const data = series
        ? series.timestamps.map((t, i) => ({
              label: tickLabel(t, range),
              cpu: series.cpu[i],
              memory: series.memoryPercent[i],
              netIn: series.netIn[i],
              netOut: series.netOut[i],
              load: series.loadAvg1m[i],
          }))
        : [];
    const last = <T,>(arr?: T[]) => (arr && arr.length ? arr[arr.length - 1] : undefined);
    const perCore = current.data?.cpu?.perCore ?? [];
    const pct = (n: number) => `${Math.round(n)}%`;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Performance metrics</h2>
                    <p className="text-sm text-muted-foreground">Resource usage over the last {range === "1h" ? "hour" : range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days"}</p>
                </div>
                <div className="flex items-center gap-2">
                    <ToggleGroup value={range} onValueChange={(v) => setRange(v as Range)}>
                        {RANGES.map((r) => (
                            <ToggleGroupItem key={r} value={r} aria-label={r}>{r}</ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                    <Button variant="outline" size="icon" aria-label="Refresh metrics" onClick={() => void history.refetch()}>
                        <RotateCw className={history.isFetching ? "animate-spin" : ""} aria-hidden="true" />
                    </Button>
                </div>
            </div>

            {points === 0 ? (
                <Card className="rounded-2xl shadow-xs">
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><BarChart3 className="size-6" aria-hidden="true" /></span>
                        <h3 className="font-semibold text-foreground">{history.isLoading ? "Loading metrics…" : "Collecting data"}</h3>
                        <p className="text-sm text-muted-foreground">First points appear in about a minute after the agent connects.</p>
                    </div>
                </Card>
            ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                    <MetricChart title="CPU usage" value={pct(last(series?.cpu) ?? 0)} hint={history.data?.peak?.cpu != null ? `Current · Peak ${pct(history.data.peak.cpu)}` : "Current"} data={data} range={range} format={pct} lines={[{ key: "cpu", name: "CPU", color: "var(--chart-1)" }]} />
                    <MetricChart title="Memory" value={pct(last(series?.memoryPercent) ?? 0)} hint={current.data?.memory?.total ? `of ${Math.round(current.data.memory.total / 1024 ** 3)} GB total` : "Current"} data={data} range={range} format={pct} lines={[{ key: "memory", name: "Memory", color: "var(--chart-1)" }]} />
                    <MetricChart title="Network" value={bytesPerSec((last(series?.netIn) ?? 0) + (last(series?.netOut) ?? 0))} hint="Traffic in & out" data={data} range={range} format={bytesPerSec} lines={[{ key: "netIn", name: "Inbound", color: "var(--chart-1)" }, { key: "netOut", name: "Outbound", color: "var(--chart-2)" }]} />
                    <MetricChart title="Load average (1m)" value={(last(series?.loadAvg1m) ?? 0).toFixed(2)} hint="Current" data={data} range={range} format={(n) => n.toFixed(1)} lines={[{ key: "load", name: "Load", color: "var(--chart-1)" }]} />
                </div>
            )}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <Card className="gap-0 rounded-2xl py-0 shadow-xs">
                    <div className="flex items-center justify-between border-b px-5 py-3.5">
                        <h3 className="font-semibold text-foreground">Per-core CPU</h3>
                        {current.data?.cpu?.cores ? <span className="text-sm text-muted-foreground">{current.data.cpu.cores} vCPU</span> : null}
                    </div>
                    {perCore.length === 0 ? (
                        <p className="px-5 py-6 text-sm text-muted-foreground">No per-core samples yet.</p>
                    ) : (
                        <ul className="space-y-3 px-5 py-4">
                            {perCore.map((core, i) => {
                                const used = Math.max(0, Math.min(100, 100 - core.idle));
                                return (
                                    <li key={core.core} className="flex items-center gap-4 text-sm">
                                        <span className="w-14 text-muted-foreground">Core {i}</span>
                                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="presentation">
                                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, used)}%` }} />
                                        </div>
                                        <span className="w-10 text-right font-semibold text-foreground">{Math.round(used)}%</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Card>
                <Card className="rounded-2xl shadow-xs">
                    <div className="flex items-start gap-3 px-5 py-1">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><BarChart3 className="size-4" aria-hidden="true" /></span>
                        <div>
                            <h3 className="font-semibold text-foreground">Updated {history.dataUpdatedAt ? formatRelativeTime(new Date(history.dataUpdatedAt).toISOString()) : "—"}</h3>
                            <p className="text-sm text-muted-foreground">Charts refresh every minute. Older ranges are averaged.</p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
