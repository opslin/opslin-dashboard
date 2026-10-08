"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, Check, Clock, Cpu, MemoryStick, RefreshCw, type LucideIcon } from "lucide-react";
import { AppPageSkeleton } from "@/components/apps/AppPageSkeleton";
import { ChartLoading, useRecharts } from "@/components/charts/use-recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiRequestError, type DeploymentRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

export const METRICS_REFETCH_INTERVAL_MS = 60_000;

const RANGES = ["1h", "24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number];

type MetricsSectionProps = {
    appId: string;
    serverId: string;
    deployments: DeploymentRecord[];
    active: boolean;
};

function tick(iso: string, range: Range) {
    const d = new Date(iso);
    return range === "1h" || range === "24h" ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ChartCard({
    icon: Icon,
    title,
    value,
    hint,
    data,
    format,
    live,
}: {
    icon: LucideIcon;
    title: string;
    value: string;
    hint: string;
    data?: Array<{ label: string; v: number }>;
    format: (n: number) => string;
    live: boolean;
}) {
    const recharts = useRecharts();
    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex items-center justify-between px-5 pt-4">
                <h3 className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden="true" /></span>
                    {title}
                </h3>
                {live ? <span className="text-xs text-muted-foreground">Live</span> : null}
            </div>
            <p className="mt-3 flex items-baseline gap-2 px-5">
                <span className="text-3xl font-bold tracking-tight text-foreground">{value}</span>
                <span className="text-sm text-muted-foreground">{hint}</span>
            </p>
            <div className="h-36 px-2 pb-3 pt-2">
                {!data || data.length < 2 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data for this range yet</div>
                ) : !recharts ? (
                    <ChartLoading className="h-full" />
                ) : (
                    <recharts.ResponsiveContainer width="100%" height="100%">
                        <recharts.AreaChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                            <recharts.CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                            <recharts.XAxis dataKey="label" hide />
                            <recharts.YAxis hide domain={[0, "auto"]} />
                            <recharts.Tooltip formatter={(n) => format(Number(n))} labelFormatter={(l) => String(l)} />
                            <recharts.Area isAnimationActive={false} type="monotone" dataKey="v" name={title} stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.1} />
                        </recharts.AreaChart>
                    </recharts.ResponsiveContainer>
                )}
            </div>
        </Card>
    );
}

export function MetricsSection({ appId, active }: MetricsSectionProps) {
    const [range, setRange] = useState<Range>("24h");
    const requestWindow = range === "30d" ? "7d" : range;

    const history = useQuery({
        queryKey: ["app-metrics-history", appId, range],
        queryFn: () => api.getAppMetricsHistory(appId, range),
        enabled: active,
        refetchInterval: METRICS_REFETCH_INTERVAL_MS,
    });
    const current = useQuery({
        queryKey: ["app-metrics-current", appId],
        queryFn: () => api.getAppMetricsCurrent(appId),
        enabled: active,
        refetchInterval: METRICS_REFETCH_INTERVAL_MS,
        retry: false,
    });
    const summary = useQuery({
        queryKey: ["app-request-summary", appId, requestWindow],
        queryFn: () => api.getRequestSummary(appId, requestWindow),
        enabled: active,
        refetchInterval: METRICS_REFETCH_INTERVAL_MS,
        retry: (count, error) => !(error instanceof ApiRequestError && error.status === 403) && count < 2,
    });
    const locked = summary.error instanceof ApiRequestError && summary.error.status === 403;
    const latency = useQuery({
        queryKey: ["app-request-latency", appId, requestWindow],
        queryFn: () => api.getRequestLatency(appId, requestWindow),
        enabled: active && !locked,
        refetchInterval: METRICS_REFETCH_INTERVAL_MS,
        retry: false,
    });

    if (!active) return <AppPageSkeleton section="metrics" />;

    const series = history.data?.series;
    const cpuData = series?.timestamps.map((t, i) => ({ label: tick(t, range), v: series.cpu[i] }));
    const memData = series?.timestamps.map((t, i) => ({ label: tick(t, range), v: series.memoryPercent[i] }));
    const latData = latency.data?.series.map((p) => ({ label: tick(p.bucket, range), v: Math.round(p.p50) }));
    const cur = current.data;
    const live = cur?.effectiveStatus === "running" || cur?.status === "running";
    const pct = (n: number) => `${Math.round(n)}%`;
    const mb = (bytes?: number) => (bytes == null ? "—" : bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);
    const restarts = series ? Math.max(0, (series.restartCount.at(-1) ?? 0) - (series.restartCount[0] ?? 0)) : (cur?.restartCount ?? 0);
    const rangeText = range === "1h" ? "hour" : range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days";
    const empty = !history.isLoading && (!series || series.timestamps.length === 0) && !cur?.cpuPercent;

    return (
        <section className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Metrics</h2>
                    <p className="text-sm text-muted-foreground">How your app is doing.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Time range">
                        {RANGES.map((r) => (
                            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", range === r ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>{r}</button>
                        ))}
                    </div>
                    <Button variant="outline" size="icon" aria-label="Refresh metrics" onClick={() => { void history.refetch(); void current.refetch(); void summary.refetch(); }}>
                        <RefreshCw className={history.isFetching ? "animate-spin" : ""} aria-hidden="true" />
                    </Button>
                </div>
            </div>

            {empty ? (
                <Card className="rounded-2xl shadow-xs">
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><BarChart3 className="size-6" aria-hidden="true" /></span>
                        <h3 className="font-semibold text-foreground">No data yet</h3>
                        <p className="text-sm text-muted-foreground">First numbers appear about a minute after your app starts.</p>
                    </div>
                </Card>
            ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                    <ChartCard icon={Cpu} title="CPU" value={cur?.cpuPercent != null ? pct(cur.cpuPercent) : "—"} hint="of available CPU" data={cpuData} format={pct} live={live} />
                    <ChartCard icon={MemoryStick} title="Memory" value={mb(cur?.memoryUsed)} hint={cur?.memoryLimit ? `of ${mb(cur.memoryLimit)}` : "in use"} data={memData} format={pct} live={live} />
                    <Card className="gap-0 rounded-2xl py-0 shadow-xs">
                        <div className="flex items-center px-5 pt-4">
                            <h3 className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
                                <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Activity className="size-4" aria-hidden="true" /></span>
                                Requests
                            </h3>
                        </div>
                        {locked ? (
                            <p className="px-5 pb-6 pt-4 text-sm text-muted-foreground">Traffic numbers are part of a paid plan. <Link href="/pricing" className="font-medium text-primary hover:underline">See plans</Link></p>
                        ) : (
                            <div className="px-5 pb-6">
                                <p className="mt-3 flex items-baseline gap-2">
                                    <span className="text-3xl font-bold tracking-tight text-foreground">{summary.data ? summary.data.totalRequests.toLocaleString() : "—"}</span>
                                    <span className="text-sm text-muted-foreground">in the last {rangeText}</span>
                                </p>
                                <p className="mt-6 text-sm text-muted-foreground">{summary.data ? `${summary.data.errorRequests.toLocaleString()} failed (${summary.data.errorRate.toFixed(1)}%)` : "No traffic recorded yet"}</p>
                            </div>
                        )}
                    </Card>
                    <ChartCard icon={Clock} title="Response time" value={summary.data && summary.data.totalRequests > 0 ? `${Math.round(summary.data.avgResponseMs)} ms` : "—"} hint="average" data={locked ? undefined : latData} format={(n) => `${n} ms`} live={live} />
                </div>
            )}

            <Card className="rounded-2xl shadow-xs">
                <div className="flex flex-wrap items-center gap-3 px-5">
                    <span className={cn("flex size-8 items-center justify-center rounded-full", restarts === 0 ? "bg-success-muted text-success-text" : "bg-warning-muted text-warning-text")}><Check className="size-4" aria-hidden="true" /></span>
                    <p className="font-semibold text-foreground">Restarts: {restarts} in the last {rangeText}</p>
                    <p className="ml-auto text-sm text-muted-foreground">{restarts === 0 ? "Your app has been running smoothly." : "Your app restarted. Check the Logs tab to see why."}</p>
                </div>
            </Card>
        </section>
    );
}
